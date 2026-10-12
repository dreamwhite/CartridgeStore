import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { decryptSecret, encryptSecret, isEncryptedSecret, parseEnvelope } from "./envelope.js";
import { KeyRegistry, SecretKeyError } from "./registry.js";

export const SECRET_SETTING_DEFINITIONS = {
  smtp_password: { purpose: "store-setting:smtp-password", classification: "secret" },
  oidc_client_secret: { purpose: "store-setting:oidc-client-secret", classification: "secret" },
  saml_idp_x509cert: { purpose: "store-setting:saml-idp-x509cert", classification: "ambiguous" }
} as const;

export type SecretSettingKey = keyof typeof SECRET_SETTING_DEFINITIONS;
export type SecretMigrationFault = (point: "after-snapshot" | "after-write") => void;
export type SecretRotationFault = (point: "after-write") => void;

export class SecretStorageError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecretStorageError";
  }
}

export interface SecretStoreOptions {
  readonly keyRegistryPath?: string;
  readonly applicationDataRoot?: string;
  readonly maxRows?: number;
}

export interface SecretInventory {
  readonly encrypted: readonly { readonly key: SecretSettingKey; readonly keyId: string }[];
  readonly legacyPlaintext: readonly SecretSettingKey[];
  readonly empty: readonly SecretSettingKey[];
  readonly ambiguous: readonly SecretSettingKey[];
}

export interface SecretMigrationResult {
  readonly converted: readonly SecretSettingKey[];
  readonly alreadyEncrypted: readonly SecretSettingKey[];
  readonly skippedEmpty: readonly SecretSettingKey[];
  readonly skippedAmbiguous: readonly SecretSettingKey[];
  readonly snapshotPath?: string;
  readonly activeKeyId: string;
}

interface SnapshotRow {
  readonly key: SecretSettingKey;
  readonly original: string;
  expected: string;
}

interface MigrationSnapshot {
  readonly version: 1;
  readonly database: string;
  readonly rows: readonly SnapshotRow[];
}

function raw(database: Database.Database, key: string): string | undefined {
  const row = database.prepare("SELECT value FROM store_settings WHERE key = ?").get(key) as { value?: unknown } | undefined;
  return typeof row?.value === "string" ? row.value : undefined;
}

function isSecretKey(key: string): key is SecretSettingKey {
  return Object.hasOwn(SECRET_SETTING_DEFINITIONS, key);
}

function purpose(key: SecretSettingKey): string { return SECRET_SETTING_DEFINITIONS[key].purpose; }

function stableDatabaseIdentity(databasePath: string): string {
  try {
    const stats = fs.statSync(databasePath);
    return `${path.resolve(databasePath)}:${stats.dev}:${stats.ino}`;
  } catch (error) {
    throw new SecretStorageError("secret_database_unavailable", "secret database is unavailable", { cause: error });
  }
}

function writeProtectedSnapshot(filePath: string, snapshot: MigrationSnapshot): void {
  const directory = path.dirname(path.resolve(filePath));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, filePath);
}

function assertSnapshotOutside(root: string | undefined, snapshotPath: string): void {
  if (!root) return;
  const applicationRoot = path.resolve(root);
  const candidate = path.resolve(snapshotPath);
  if (candidate === applicationRoot || candidate.startsWith(`${applicationRoot}${path.sep}`)) {
    throw new SecretStorageError("secret_snapshot_path_unsafe", "secret migration snapshot must be outside application data");
  }
}

function readSnapshot(filePath: string): MigrationSnapshot {
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown; } catch (error) {
    throw new SecretStorageError("secret_snapshot_invalid", "secret migration snapshot is invalid", { cause: error });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SecretStorageError("secret_snapshot_invalid", "secret migration snapshot is invalid");
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.database !== "string" || !Array.isArray(record.rows) || record.rows.length > 16) throw new SecretStorageError("secret_snapshot_invalid", "secret migration snapshot is invalid");
  const rows: SnapshotRow[] = [];
  for (const item of record.rows) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) throw new SecretStorageError("secret_snapshot_invalid", "secret migration snapshot is invalid");
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || !isSecretKey(row.key) || typeof row.original !== "string" || typeof row.expected !== "string" || !isEncryptedSecret(row.original) || !isEncryptedSecret(row.expected)) {
      throw new SecretStorageError("secret_snapshot_invalid", "secret migration snapshot is invalid");
    }
    rows.push({ key: row.key, original: row.original, expected: row.expected });
  }
  return { version: 1, database: record.database, rows };
}

export class SecretStore {
  private readonly keyRegistryPath: string | undefined;
  private readonly applicationDataRoot: string | undefined;
  private readonly maxRows: number;
  private registry: KeyRegistry | undefined;

  constructor(options: SecretStoreOptions = {}) {
    this.keyRegistryPath = options.keyRegistryPath;
    this.applicationDataRoot = options.applicationDataRoot;
    this.maxRows = options.maxRows ?? 16;
  }

  private keys(): KeyRegistry {
    if (!this.keyRegistryPath) throw new SecretStorageError("secret_key_configuration_missing", "secret key registry is not configured");
    if (!this.registry) {
      try { this.registry = KeyRegistry.fromFile(this.keyRegistryPath, this.applicationDataRoot); } catch (error) {
        if (error instanceof SecretKeyError) throw new SecretStorageError(error.code, error.message, { cause: error });
        throw error;
      }
    }
    return this.registry;
  }

  inventory(database: Database.Database): SecretInventory {
    const encrypted: Array<{ readonly key: SecretSettingKey; readonly keyId: string }> = [];
    const legacyPlaintext: SecretSettingKey[] = [];
    const empty: SecretSettingKey[] = [];
    const ambiguous: SecretSettingKey[] = [];
    for (const key of Object.keys(SECRET_SETTING_DEFINITIONS) as SecretSettingKey[]) {
      const value = raw(database, key);
      if (!value) { empty.push(key); continue; }
      if (SECRET_SETTING_DEFINITIONS[key].classification === "ambiguous" && !isEncryptedSecret(value)) { ambiguous.push(key); continue; }
      if (!isEncryptedSecret(value)) { legacyPlaintext.push(key); continue; }
      const envelope = parseEnvelope(value);
      if (envelope.purpose !== purpose(key)) throw new SecretStorageError("secret_wrong_purpose", "secret envelope purpose does not match setting");
      encrypted.push({ key, keyId: envelope.key_id });
    }
    return { encrypted, legacyPlaintext, empty, ambiguous };
  }

  validateDatabase(database: Database.Database): SecretInventory {
    const inventory = this.inventory(database);
    if (inventory.encrypted.length > 0) {
      for (const item of inventory.encrypted) this.decrypt(database, item.key);
    }
    return inventory;
  }

  encrypt(key: SecretSettingKey, plaintext: string): string {
    if (SECRET_SETTING_DEFINITIONS[key].classification !== "secret") throw new SecretStorageError("secret_setting_ambiguous", "setting requires explicit classification");
    try { return encryptSecret(this.keys(), key, purpose(key), plaintext); } catch (error) {
      if (error instanceof SecretKeyError || error instanceof SecretStorageError) throw error;
      throw error;
    }
  }

  decrypt(database: Database.Database, key: SecretSettingKey): string {
    const value = raw(database, key);
    if (!value) return "";
    if (!isEncryptedSecret(value)) throw new SecretStorageError("secret_plaintext_legacy", "secret setting is legacy plaintext");
    try {
      return decryptSecret(this.keys(), key, purpose(key), value);
    } catch (error) {
      if (error instanceof SecretKeyError) throw new SecretStorageError(error.code, error.message, { cause: error });
      throw error;
    }
  }

  preflight(database: Database.Database): { readonly keyIds: readonly string[]; readonly encryptedSettings: number } {
    const inventory = this.inventory(database);
    const ids = [...new Set(inventory.encrypted.map((item) => item.keyId))].sort();
    for (const item of inventory.encrypted) this.decrypt(database, item.key);
    return { keyIds: ids, encryptedSettings: inventory.encrypted.length };
  }

  migrate(database: Database.Database, databasePath: string, options: { readonly confirm: boolean; readonly snapshotPath?: string; readonly fault?: SecretMigrationFault }): SecretMigrationResult {
    const inventory = this.inventory(database);
    if (inventory.legacyPlaintext.length > this.maxRows) throw new SecretStorageError("secret_migration_too_many_rows", "secret migration is too large");
    const activeKeyId = this.keys().activeKeyId;
    const candidates = inventory.legacyPlaintext;
    const result = { converted: [] as SecretSettingKey[], alreadyEncrypted: inventory.encrypted.map((item) => item.key), skippedEmpty: inventory.empty, skippedAmbiguous: inventory.ambiguous, activeKeyId };
    if (!options.confirm || candidates.length === 0) return { ...result, ...(options.snapshotPath ? { snapshotPath: options.snapshotPath } : {}) };
    if (!options.snapshotPath) throw new SecretStorageError("secret_snapshot_required", "migration snapshot path is required");
    assertSnapshotOutside(this.applicationDataRoot, options.snapshotPath);
    const rows: SnapshotRow[] = [];
    for (const key of candidates) {
      const plaintext = raw(database, key);
      if (plaintext === undefined || isEncryptedSecret(plaintext)) throw new SecretStorageError("secret_migration_conflict", "secret setting changed during migration");
      rows.push({ key, original: this.encrypt(key, plaintext), expected: this.encrypt(key, plaintext) });
    }
    try {
      writeProtectedSnapshot(options.snapshotPath, { version: 1, database: stableDatabaseIdentity(databasePath), rows });
      options.fault?.("after-snapshot");
      database.exec("BEGIN IMMEDIATE");
      const write = database.prepare("UPDATE store_settings SET value = ? WHERE key = ? AND value = ?");
      for (const row of rows) {
        const original = raw(database, row.key);
        if (original === undefined || original !== decryptSnapshotOriginal(this, row.key, row.original)) throw new SecretStorageError("secret_migration_conflict", "secret setting changed during migration");
        const encrypted = row.expected;
        if (write.run(encrypted, row.key, original).changes !== 1 || this.decrypt(database, row.key) !== original) throw new SecretStorageError("secret_migration_failed", "secret migration verification failed");
        row.expected = encrypted;
        result.converted.push(row.key);
        options.fault?.("after-write");
      }
      database.exec("COMMIT");
      writeProtectedSnapshot(options.snapshotPath, { version: 1, database: stableDatabaseIdentity(databasePath), rows });
      return { ...result, snapshotPath: options.snapshotPath };
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      try { fs.rmSync(options.snapshotPath, { force: true }); } catch { /* preserve original error */ }
      throw error;
    }
  }

  rollback(database: Database.Database, databasePath: string, snapshotPath: string, confirm: boolean): void {
    if (!confirm) throw new SecretStorageError("secret_rollback_confirmation_required", "plaintext rollback requires explicit confirmation");
    const snapshot = readSnapshot(snapshotPath);
    if (snapshot.database !== stableDatabaseIdentity(databasePath)) throw new SecretStorageError("secret_rollback_conflict", "secret rollback database identity changed");
    try {
      database.exec("BEGIN IMMEDIATE");
      const write = database.prepare("UPDATE store_settings SET value = ? WHERE key = ? AND value = ?");
      for (const row of snapshot.rows) {
        const current = raw(database, row.key);
        if (current !== row.expected) throw new SecretStorageError("secret_rollback_conflict", "secret rollback detected a conflicting change");
        const plaintext = decryptSnapshotOriginal(this, row.key, row.original);
        if (write.run(plaintext, row.key, row.expected).changes !== 1) throw new SecretStorageError("secret_rollback_failed", "secret rollback failed");
      }
      database.exec("COMMIT");
      fs.rmSync(snapshotPath, { force: true });
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }

  rotate(database: Database.Database, options: { readonly fault?: SecretRotationFault }): { readonly from: Record<string, number>; readonly to: string; readonly rotated: number } {
    const inventory = this.inventory(database);
    const registry = this.keys();
    const target = registry.activeKeyId;
    const from: Record<string, number> = {};
    let rotated = 0;
    try {
      database.exec("BEGIN IMMEDIATE");
      const write = database.prepare("UPDATE store_settings SET value = ? WHERE key = ? AND value = ?");
      for (const item of inventory.encrypted) {
        from[item.keyId] = (from[item.keyId] ?? 0) + 1;
        if (item.keyId === target) continue;
        const plaintext = this.decrypt(database, item.key);
        const current = raw(database, item.key);
        if (!current) throw new SecretStorageError("secret_rotation_conflict", "secret setting changed during rotation");
        const encrypted = this.encrypt(item.key, plaintext);
        if (write.run(encrypted, item.key, current).changes !== 1 || this.decrypt(database, item.key) !== plaintext) throw new SecretStorageError("secret_rotation_failed", "secret rotation verification failed");
        rotated += 1;
        options.fault?.("after-write");
      }
      database.exec("COMMIT");
      return { from, to: target, rotated };
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }
}

function decryptSnapshotOriginal(store: SecretStore, key: SecretSettingKey, value: string): string {
  const fake = new Database(":memory:");
  try {
    fake.exec("CREATE TABLE store_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    fake.prepare("INSERT INTO store_settings(key, value) VALUES (?, ?)").run(key, value);
    return store.decrypt(fake, key);
  } finally { fake.close(); }
}
