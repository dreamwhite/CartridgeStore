import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { ReadonlyCatalog } from "../catalog/catalog.js";
import { compareSchemaSnapshots } from "../compatibility/schema.js";
import { inspectSchema, REQUIRED_TABLES, type SchemaSnapshot } from "../db/schema-inspection.js";
import {
  assertInside,
  BACKUP_ENCRYPTION_MAGIC,
  BACKUP_DERIVED_DIRECTORIES,
  BACKUP_DERIVED_FILES,
  BACKUP_V2_ABI,
  BackupError,
  isDerivedRelativePath,
  type BackupInventoryEntry,
  type BackupManifest,
  validateArchiveEntryPath,
  validateManifest
} from "./format.js";
import {
  createZip,
  decryptBackup,
  encryptBackup,
  extractZipArchive,
  scanZipArchive
} from "./archive.js";
import type { SecretStore } from "../secrets/service.js";

const LOCK_FILE = "publication.lock";
const STAGING_DIRECTORY = ".prg32-backup-staging";
const RECOVERY_DIRECTORY = ".prg32-backup-recovery";
const OPERATIONS_DIRECTORY = "backup-operations";
const TERMINAL_STATES = new Set(["COMPLETED", "ROLLED_BACK", "FAILED"]);
const ROLLBACK_STATES = new Set(["RECOVERY_CREATED", "DB_REPLACE_STARTED", "DB_REPLACED", "FILESYSTEM_REPLACE_STARTED", "FILESYSTEM_REPLACED", "VERIFYING", "ROLLBACK_REQUIRED"]);

type RestoreState =
  | "RECEIVED"
  | "STAGED"
  | "VALIDATED"
  | "RECOVERY_CREATED"
  | "DB_REPLACE_STARTED"
  | "DB_REPLACED"
  | "FILESYSTEM_REPLACE_STARTED"
  | "FILESYSTEM_REPLACED"
  | "VERIFYING"
  | "COMPLETED"
  | "ROLLBACK_REQUIRED"
  | "ROLLED_BACK"
  | "ROLLBACK_FAILED"
  | "FAILED";

interface RestoreJournal {
  readonly journalVersion: 1;
  readonly operationId: string;
  readonly state: RestoreState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recoveryRelative?: string;
  readonly format?: string;
  readonly errorCode?: string;
}

interface LiveFile {
  readonly relative: string;
  readonly archivePath: string;
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

interface RecoveryPoint {
  readonly directory: string;
  readonly databasePath: string;
  readonly dataPath: string;
}

export interface BackupArtifact {
  readonly path: string;
  readonly encrypted: boolean;
  readonly filename: string;
}

export interface RestoreResult {
  readonly operationId: string;
  readonly format: string;
  readonly state: "COMPLETED";
  readonly entries: number;
  readonly expandedBytes: number;
}

export type BackupFaultPoint = "after-db-replacement" | "after-filesystem-replacement" | "before-verification";

export interface BackupServiceOptions {
  readonly fault?: (point: BackupFaultPoint) => void;
  readonly secrets?: SecretStore;
}

function now(): string {
  return new Date().toISOString();
}

function sha256(value: Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeAtomic(filePath: string, value: Uint8Array): void {
  const temporary = filePath + ".tmp-" + process.pid + "-" + crypto.randomUUID();
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeSync(fd, value);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, filePath);
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new BackupError("backup recovery journal is invalid", "backup_recovery_journal_invalid", 500, { cause: error });
  }
}

function safeDirectory(root: string, relative: string): string {
  return assertInside(root, path.join(root, relative));
}

function ensureDirectory(root: string, relative: string): string {
  const candidate = safeDirectory(root, relative);
  if (fs.existsSync(candidate)) {
    const stats = fs.lstatSync(candidate);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new BackupError("backup directory is unsafe", "backup_unsafe_path", 500);
  } else {
    fs.mkdirSync(candidate, { recursive: true, mode: 0o700 });
  }
  return candidate;
}

function isDatabaseArtifact(candidate: string, databasePath: string): boolean {
  const normalizedCandidate = path.resolve(candidate);
  const normalizedDatabase = path.resolve(databasePath);
  return normalizedCandidate === normalizedDatabase ||
    normalizedCandidate === normalizedDatabase + "-wal" ||
    normalizedCandidate === normalizedDatabase + "-shm" ||
    normalizedCandidate === normalizedDatabase + "-journal";
}

function schemaFingerprint(snapshot: SchemaSnapshot): string {
  return sha256(Buffer.from(JSON.stringify(snapshot), "utf8"));
}

function assertExpectedSchema(sqlite: Database.Database, expected: SchemaSnapshot, manifest: BackupManifest): SchemaSnapshot {
  const integrity = sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check?: unknown };
  if (integrity.integrity_check !== "ok") throw new BackupError("backup database integrity check failed", "backup_database_integrity");
  const foreignKeys = sqlite.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length > 0) throw new BackupError("backup database foreign-key check failed", "backup_database_foreign_keys");
  const actual = inspectSchema(sqlite);
  const required = new Set<string>(REQUIRED_TABLES);
  if (actual.tables.some((table) => !required.has(table.name)) || REQUIRED_TABLES.some((name) => !actual.tables.some((table) => table.name === name))) {
    throw new BackupError("backup database schema is incompatible", "backup_database_schema_incompatible");
  }
  if (manifest.abi === BACKUP_V2_ABI && manifest.schema.fingerprint !== schemaFingerprint(actual)) {
    throw new BackupError("backup database schema fingerprint is invalid", "backup_database_schema_incompatible");
  }
  if (compareSchemaSnapshots(expected, actual).length > 0) {
    throw new BackupError("backup database schema is incompatible with this installation", "backup_database_schema_incompatible");
  }
  return actual;
}

function assertRegularFile(filePath: string, code = "backup_file_invalid"): fs.Stats {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new BackupError("backup contains an invalid file", code);
  return stats;
}

function collectFiles(root: string, databasePath: string, config: BackendConfig): LiveFile[] {
  const files: LiveFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      const relative = path.relative(root, candidate).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        if (isDerivedRelativePath(relative)) continue;
        if (entry.isSymbolicLink()) throw new BackupError("backup data contains a symlink", "backup_symlink_rejected");
        walk(candidate);
        continue;
      }
      if (entry.isSymbolicLink()) throw new BackupError("backup data contains a symlink", "backup_symlink_rejected");
      if (!entry.isFile()) throw new BackupError("backup data contains an unsupported file", "backup_unsupported_file_type");
      if (isDerivedRelativePath(relative) || isDatabaseArtifact(candidate, databasePath)) continue;
      validateArchiveEntryPath("data/" + relative, config);
      const stats = assertRegularFile(candidate);
      if (stats.size > config.backupMaxEntryBytes) throw new BackupError("backup data entry is too large", "backup_entry_too_large");
      const bytes = fs.readFileSync(candidate);
      files.push({
        relative,
        archivePath: "data/" + relative,
        path: candidate,
        size: bytes.byteLength,
        sha256: sha256(bytes)
      });
    }
  };
  walk(root);
  return files.sort((left, right) => left.archivePath.localeCompare(right.archivePath));
}

function copyDataTree(sourceRoot: string, targetRoot: string, databasePath: string): void {
  if (!fs.existsSync(sourceRoot)) return;
  const sourceStats = fs.lstatSync(sourceRoot);
  if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) throw new BackupError("backup data root is invalid", "backup_data_root_invalid");
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      const relative = path.relative(sourceRoot, source).replaceAll(path.sep, "/");
      if (isDerivedRelativePath(relative)) continue;
      const target = assertInside(targetRoot, path.join(targetRoot, relative));
      if (entry.isDirectory()) {
        if (entry.isSymbolicLink()) throw new BackupError("backup data contains a symlink", "backup_symlink_rejected");
        fs.mkdirSync(target, { recursive: true, mode: 0o700 });
        walk(source);
        continue;
      }
      if (entry.isSymbolicLink() || !entry.isFile()) throw new BackupError("backup data contains an unsupported file", "backup_unsupported_file_type");
      if (isDatabaseArtifact(target, databasePath)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o600);
    }
  };
  walk(sourceRoot);
}

function clearManagedData(root: string, databasePath: string): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (BACKUP_DERIVED_DIRECTORIES.has(entry.name) || BACKUP_DERIVED_FILES.has(entry.name) || isDatabaseArtifact(candidate, databasePath)) continue;
    fs.rmSync(candidate, { recursive: true, force: true });
  }
}

function databaseTableNames(snapshot: SchemaSnapshot): string[] {
  return snapshot.tables.map((table) => table.name).sort();
}

function restoreDatabase(live: Database.Database, sourcePath: string, expectedSchema: SchemaSnapshot): void {
  let source: Database.Database | undefined;
  let attached = false;
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    const sourceSnapshot = inspectSchema(source);
    if (compareSchemaSnapshots(expectedSchema, sourceSnapshot).length > 0) {
      throw new BackupError("backup database schema is incompatible", "backup_database_schema_incompatible");
    }
    live.prepare("ATTACH DATABASE ? AS restored_backup").run(sourcePath);
    attached = true;
    live.pragma("foreign_keys = OFF");
    live.exec("BEGIN IMMEDIATE");
    for (const table of databaseTableNames(expectedSchema)) {
      const quoted = '"' + table.replaceAll('"', '""') + '"';
      live.exec("DELETE FROM main." + quoted);
    }
    for (const table of databaseTableNames(expectedSchema)) {
      const quoted = '"' + table.replaceAll('"', '""') + '"';
      live.exec("INSERT INTO main." + quoted + " SELECT * FROM restored_backup." + quoted);
    }
    const hasSequence = Boolean(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'").get());
    if (hasSequence) {
      live.exec("DELETE FROM main.sqlite_sequence");
      live.exec("INSERT INTO main.sqlite_sequence SELECT * FROM restored_backup.sqlite_sequence");
    }
    live.exec("COMMIT");
    live.pragma("foreign_keys = ON");
    live.exec("DETACH DATABASE restored_backup");
    attached = false;
  } catch (error) {
    try { if (live.inTransaction) live.exec("ROLLBACK"); } catch { /* preserve original failure */ }
    try { live.pragma("foreign_keys = ON"); } catch { /* preserve original failure */ }
    if (attached) {
      try { live.exec("DETACH DATABASE restored_backup"); } catch { /* preserve original failure */ }
    }
    if (error instanceof BackupError) throw error;
    throw new BackupError("backup database restore failed", "backup_database_restore_failed", 500, { cause: error });
  } finally {
    source?.close();
  }
}

function validateFilesystemReferences(root: string, database: Database.Database): void {
  try {
    const catalog = new ReadonlyCatalog(root);
    const games = catalog.listGames();
    for (const game of games) {
      const id = typeof game.id === "string" ? game.id : "";
      const versions = Array.isArray(game.versions) ? game.versions : [];
      for (const version of versions) {
        const selected = catalog.publicGame(id, String(version));
        const variants = selected.variants;
        if (variants === null || typeof variants !== "object" || Array.isArray(variants)) {
          throw new BackupError("backup catalog variants are invalid", "backup_catalog_invalid");
        }
        for (const architecture of Object.keys(variants)) {
          catalog.resolveVariant(id, String(version), architecture);
        }
      }
    }
    const rows = database.prepare("SELECT id, status, pending_dir, architectures_json FROM cartridge_submissions WHERE status = 'pending'").all() as Array<{ id: number; status: string; pending_dir: string; architectures_json: string }>;
    for (const row of rows) {
      if (!/^pending\/[1-9][0-9]*$/.test(row.pending_dir)) throw new BackupError("backup pending path is invalid", "backup_pending_reference_invalid");
      let architectures: unknown;
      try { architectures = JSON.parse(row.architectures_json) as unknown; } catch (error) {
        throw new BackupError("backup pending metadata is invalid", "backup_pending_reference_invalid", 400, { cause: error });
      }
      if (!Array.isArray(architectures)) throw new BackupError("backup pending metadata is invalid", "backup_pending_reference_invalid");
      for (const item of architectures) {
        if (item === null || typeof item !== "object" || Array.isArray(item) || typeof (item as Record<string, unknown>).stored !== "string") {
          throw new BackupError("backup pending metadata is invalid", "backup_pending_reference_invalid");
        }
        const stored = (item as Record<string, unknown>).stored as string;
        const target = assertInside(root, path.join(root, stored));
        const stats = assertRegularFile(target, "backup_pending_file_missing");
        if (stats.size <= 0) throw new BackupError("backup pending file is empty", "backup_pending_file_missing");
      }
    }
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("backup filesystem references are invalid", "backup_filesystem_invalid", 400, { cause: error });
  }
}

function availableBytes(root: string): number {
  try {
    const stats = fs.statfsSync(root);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function directoryBytes(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.isSymbolicLink() && !isDerivedRelativePath(path.relative(root, candidate).replaceAll(path.sep, "/"))) walk(candidate);
      } else if (entry.isFile() && !entry.isSymbolicLink()) total += fs.statSync(candidate).size;
    }
  };
  walk(root);
  return total;
}

function acquireLock(root: string): { readonly token: string; readonly path: string } {
  const lockPath = path.join(root, LOCK_FILE);
  const token = crypto.randomUUID();
  const record = { pid: process.pid, token, createdAt: now() };
  try {
    const fd = fs.openSync(lockPath, "wx", 0o600);
    try { fs.writeSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return { token, path: lockPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new BackupError("backup maintenance lock failed", "backup_lock_failed", 500, { cause: error });
    throw new BackupError("backup operation is busy", "backup_busy", 409);
  }
}

function releaseLock(lock: { readonly token: string; readonly path: string }): void {
  try {
    const current = JSON.parse(fs.readFileSync(lock.path, "utf8")) as { token?: string };
    if (current.token === lock.token) fs.unlinkSync(lock.path);
  } catch { /* recovery remains visible through the journal */ }
}

export class BackupService {
  readonly root: string;
  private readonly stagingRoot: string;
  private readonly recoveryRoot: string;
  private readonly operationsRoot: string;
  private readonly fault: BackupServiceOptions["fault"];
  private readonly secrets: SecretStore | undefined;

  constructor(
    private readonly config: BackendConfig,
    private readonly database: Database.Database,
    options: BackupServiceOptions = {}
  ) {
    this.root = path.resolve(config.storeDataDirectory);
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const rootStats = fs.lstatSync(this.root);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new BackupError("backup store root is invalid", "backup_root_invalid", 500);
    this.stagingRoot = ensureDirectory(this.root, STAGING_DIRECTORY);
    this.recoveryRoot = ensureDirectory(this.root, RECOVERY_DIRECTORY);
    this.operationsRoot = ensureDirectory(this.root, OPERATIONS_DIRECTORY);
    this.fault = options.fault;
    this.secrets = options.secrets;
  }

  private hit(point: BackupFaultPoint): void {
    this.fault?.(point);
  }

  recoverIncomplete(): void {
    for (const entry of fs.readdirSync(this.operationsRoot, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const journalPath = path.join(this.operationsRoot, entry.name, "operation.json");
      if (!fs.existsSync(journalPath)) continue;
      const value = readJson(journalPath);
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BackupError("backup recovery journal is invalid", "backup_recovery_journal_invalid", 500);
      const journal = value as RestoreJournal;
      if (TERMINAL_STATES.has(journal.state)) continue;
      if (journal.state === "ROLLBACK_FAILED") throw new BackupError("backup requires manual recovery", "backup_manual_recovery_required", 503);
      if (!journal.recoveryRelative) {
        writeAtomic(journalPath, jsonBytes({ ...journal, state: "FAILED", updatedAt: now(), errorCode: "backup_interrupted_before_recovery" }));
        continue;
      }
      const recovery = safeDirectory(this.root, journal.recoveryRelative);
      const recoveryDatabase = path.join(recovery, "database.sqlite");
      const recoveryData = path.join(recovery, "data");
      try {
        const expected = inspectSchema(this.database);
        restoreDatabase(this.database, recoveryDatabase, expected);
        clearManagedData(this.root, this.config.databasePath);
        copyDataTree(recoveryData, this.root, this.config.databasePath);
        validateFilesystemReferences(this.root, this.database);
        writeAtomic(journalPath, jsonBytes({ ...journal, state: "ROLLED_BACK", updatedAt: now(), errorCode: "backup_interrupted_recovered" }));
      } catch (error) {
        writeAtomic(journalPath, jsonBytes({ ...journal, state: "ROLLBACK_FAILED", updatedAt: now(), errorCode: error instanceof BackupError ? error.code : "backup_rollback_failed" }));
        throw new BackupError("backup recovery after interruption failed", "backup_rollback_failed", 503, { cause: error });
      }
    }
  }

  private operationPath(operationId: string): string {
    const directory = path.join(this.operationsRoot, operationId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return path.join(directory, "operation.json");
  }

  private writeJournal(operation: RestoreJournal): RestoreJournal {
    writeAtomic(this.operationPath(operation.operationId), jsonBytes(operation));
    return operation;
  }

  private transition(operation: RestoreJournal, state: RestoreState, details: Partial<RestoreJournal> = {}): RestoreJournal {
    return this.writeJournal({ ...operation, ...details, state, updatedAt: now() });
  }

  private async withMaintenanceLock<T>(callback: () => Promise<T>): Promise<T> {
    const lock = acquireLock(this.root);
    try { return await callback(); } finally { releaseLock(lock); }
  }

  private recoveryPointPath(operationId: string): string {
    return path.join(this.recoveryRoot, operationId);
  }

  private async createRecoveryPoint(operationId: string): Promise<RecoveryPoint> {
    const directory = this.recoveryPointPath(operationId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const databasePath = path.join(directory, "database.sqlite");
    await this.database.backup(databasePath);
    const dataPath = path.join(directory, "data");
    fs.mkdirSync(dataPath, { recursive: true, mode: 0o700 });
    for (const file of collectFiles(this.root, this.config.databasePath, this.config)) {
      const target = assertInside(dataPath, path.join(dataPath, file.relative));
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.copyFileSync(file.path, target);
      fs.chmodSync(target, 0o600);
    }
    writeAtomic(path.join(directory, "manifest.json"), jsonBytes({ version: 1, created_at: now(), database: "database.sqlite", data_dir: "data/" }));
    return { directory, databasePath, dataPath };
  }

  private async buildArtifact(password: string): Promise<BackupArtifact> {
    const job = fs.mkdtempSync(path.join(this.stagingRoot, "export-"));
    const databasePath = path.join(job, "database.sqlite");
    const archivePath = path.join(this.stagingRoot, "backup-" + crypto.randomUUID() + ".zip");
    try {
      const secretMetadata = this.secrets?.preflight(this.database) ?? { keyIds: [], encryptedSettings: 0 };
      if (this.config.secretEncryptionEnabled && !password) {
        throw new BackupError("encrypted backup password is required", "backup_encryption_required", 400);
      }
      await this.database.backup(databasePath);
      const databaseBytes = fs.readFileSync(databasePath);
      const dataFiles = collectFiles(this.root, this.config.databasePath, this.config);
      const inventory: BackupInventoryEntry[] = [
        { path: "database.sqlite", size: databaseBytes.byteLength, sha256: sha256(databaseBytes) },
        ...dataFiles.map((file) => ({ path: file.archivePath, size: file.size, sha256: file.sha256 }))
      ];
      if (inventory.length + 1 > this.config.backupMaxEntries) throw new BackupError("backup contains too many entries", "backup_too_many_entries", 413);
      const expandedBytes = inventory.reduce((sum, item) => sum + item.size, 0);
      if (expandedBytes > this.config.backupMaxExpandedBytes) throw new BackupError("backup expanded data is too large", "backup_expanded_too_large", 413);
      const schema = inspectSchema(this.database);
      const manifest = {
        abi: BACKUP_V2_ABI,
        format_version: 2,
        created_at: now(),
        database: "database.sqlite",
        data_dir: "data/",
        application: "prg32-cartridge-store",
        inventory,
        schema: { fingerprint: schemaFingerprint(schema), tables: schema.tables.map((table) => table.name).sort() },
        ...(secretMetadata.encryptedSettings > 0 || this.config.secretEncryptionEnabled
          ? { secret_encryption: { envelope_version: 1, required_key_ids: secretMetadata.keyIds, encrypted_settings: secretMetadata.encryptedSettings } }
          : {})
      };
      const manifestBytes = jsonBytes(manifest);
      if (manifestBytes.byteLength > this.config.backupMaxManifestBytes) throw new BackupError("backup manifest is too large", "backup_manifest_too_large", 413);
      const entries: Record<string, Uint8Array> = { "manifest.json": manifestBytes, "database.sqlite": databaseBytes };
      for (const file of dataFiles) entries[file.archivePath] = fs.readFileSync(file.path);
      const archive = createZip(entries);
      if (archive.byteLength > this.config.backupMaxArchiveBytes) throw new BackupError("backup archive is too large", "backup_archive_too_large", 413);
      fs.writeFileSync(archivePath, archive, { mode: 0o600 });
      scanZipArchive(archivePath, this.config);
      if (!password) {
        return { path: archivePath, encrypted: false, filename: "prg32-cartridge-store-backup-v2.zip" };
      }
      const encryptedPath = archivePath + ".enc";
      encryptBackup(archivePath, encryptedPath, password);
      fs.rmSync(archivePath, { force: true });
      return { path: encryptedPath, encrypted: true, filename: "prg32-cartridge-store-backup-v2.zip.enc" };
    } finally {
      fs.rmSync(job, { recursive: true, force: true });
    }
  }

  async export(password = ""): Promise<BackupArtifact> {
    return this.withMaintenanceLock(() => this.buildArtifact(password));
  }

  private validateInventory(extracted: ReturnType<typeof extractZipArchive>, manifest: BackupManifest): void {
    const allNames = new Set([...extracted.entries.values()].filter((entry) => !entry.directory).map((entry) => entry.name));
    const fileEntries = [...extracted.entries.values()].filter((entry) => !entry.directory && entry.name !== "manifest.json");
    const names = new Set(fileEntries.map((entry) => entry.name));
    if (!allNames.has("manifest.json") || !allNames.has("database.sqlite")) {
      throw new BackupError("backup is missing required files", "backup_required_file_missing");
    }
    for (const entry of fileEntries) {
      if (entry.name !== "manifest.json" && entry.name !== "database.sqlite" && !entry.name.startsWith("data/")) {
        throw new BackupError("backup contains an unexpected root entry", "backup_unexpected_entry");
      }
    }
    if (manifest.abi !== BACKUP_V2_ABI) return;
    const inventory = new Map<string, BackupInventoryEntry>();
    for (const item of manifest.inventory) {
      const normalized = validateArchiveEntryPath(item.path, this.config);
      if (normalized.startsWith("data/") && isDerivedRelativePath(normalized.slice("data/".length))) {
        throw new BackupError("backup inventory contains derived data", "backup_inventory_mismatch");
      }
      if (inventory.has(normalized)) throw new BackupError("backup inventory contains duplicates", "backup_manifest_invalid");
      inventory.set(normalized, { ...item, path: normalized });
    }
    if (inventory.size !== names.size || [...names].some((name) => !inventory.has(name))) {
      throw new BackupError("backup inventory does not match the archive", "backup_inventory_mismatch");
    }
    for (const [name, item] of inventory) {
      const source = name === "database.sqlite" ? extracted.databasePath : path.join(extracted.dataPath, name.slice("data/".length));
      const stats = assertRegularFile(source, "backup_inventory_missing");
      const digest = sha256(fs.readFileSync(source));
      if (stats.size !== item.size || digest !== item.sha256) {
        throw new BackupError("backup inventory checksum mismatch", "backup_inventory_mismatch");
      }
    }
  }

  private validateStaged(extracted: ReturnType<typeof extractZipArchive>, manifest: BackupManifest): { readonly schema: SchemaSnapshot; readonly format: string } {
    this.validateInventory(extracted, manifest);
    const staged = new Database(extracted.databasePath, { readonly: true, fileMustExist: true });
    try {
      const liveSchema = inspectSchema(this.database);
      const schema = assertExpectedSchema(staged, liveSchema, manifest);
      if (this.secrets) {
        let secretMetadata;
        try { secretMetadata = this.secrets.preflight(staged); } catch (error) {
          throw new BackupError("backup secret key preflight failed", "backup_secret_key_preflight_failed", 400, { cause: error });
        }
        const declared = manifest.abi === BACKUP_V2_ABI ? manifest.secret_encryption : undefined;
        const declaredIds = declared?.required_key_ids ?? [];
        if ((secretMetadata.encryptedSettings > 0 && !declared) || (declared && (declared.encrypted_settings !== secretMetadata.encryptedSettings || JSON.stringify(declaredIds) !== JSON.stringify(secretMetadata.keyIds)))) {
          throw new BackupError("backup secret metadata does not match database", "backup_secret_metadata_mismatch");
        }
      }
      validateFilesystemReferences(extracted.dataPath, staged);
      return { schema, format: manifest.abi === BACKUP_V2_ABI ? "v2" : "legacy-v1" };
    } catch (error) {
      if (error instanceof BackupError) throw error;
      throw new BackupError("backup validation failed", "backup_validation_failed", 400, { cause: error });
    } finally {
      staged.close();
    }
  }

  private replaceData(sourceData: string): void {
    clearManagedData(this.root, this.config.databasePath);
    copyDataTree(sourceData, this.root, this.config.databasePath);
  }

  private rollback(operation: RestoreJournal, recovery: RecoveryPoint): void {
    const updated = this.transition(operation, "ROLLBACK_REQUIRED");
    try {
      const schema = inspectSchema(this.database);
      restoreDatabase(this.database, recovery.databasePath, schema);
      this.replaceData(recovery.dataPath);
      validateFilesystemReferences(this.root, this.database);
      this.transition(updated, "ROLLED_BACK", { errorCode: "backup_restore_rolled_back" });
    } catch (error) {
      this.transition(updated, "ROLLBACK_FAILED", { errorCode: error instanceof BackupError ? error.code : "backup_rollback_failed" });
      throw new BackupError("backup rollback failed", "backup_rollback_failed", 503, { cause: error });
    }
  }

  async restore(uploadPath: string, password = ""): Promise<RestoreResult> {
    const job = fs.mkdtempSync(path.join(this.stagingRoot, "restore-"));
    let plainPath = uploadPath;
    let operation: RestoreJournal | undefined;
    try {
      if (fs.statSync(uploadPath).size > this.config.backupMaxArchiveBytes) {
        throw new BackupError("backup archive is too large", "backup_archive_too_large", 413);
      }
      const prefix = Buffer.alloc(BACKUP_ENCRYPTION_MAGIC.length);
      const prefixFd = fs.openSync(uploadPath, "r");
      try { fs.readSync(prefixFd, prefix, 0, prefix.length, 0); } finally { fs.closeSync(prefixFd); }
      if (prefix.equals(BACKUP_ENCRYPTION_MAGIC)) {
        if (!password) throw new BackupError("backup password is required", "backup_password_required");
        plainPath = path.join(job, "decrypted.zip");
        decryptBackup(uploadPath, plainPath, password);
      }
      const extractedRoot = path.join(job, "extracted");
      const extracted = extractZipArchive(plainPath, extractedRoot, this.config);
      if (!fs.existsSync(extracted.manifestPath) || !fs.existsSync(extracted.databasePath)) {
        throw new BackupError("backup is missing required files", "backup_required_file_missing");
      }
      if (fs.statSync(extracted.manifestPath).size > this.config.backupMaxManifestBytes) {
        throw new BackupError("backup manifest is too large", "backup_manifest_too_large");
      }
      let rawManifest: unknown;
      try { rawManifest = JSON.parse(fs.readFileSync(extracted.manifestPath, "utf8")) as unknown; } catch (error) {
        throw new BackupError("backup manifest is invalid", "backup_manifest_invalid", 400, { cause: error });
      }
      const rawObject = rawManifest !== null && typeof rawManifest === "object" && !Array.isArray(rawManifest) ? rawManifest as Record<string, unknown> : {};
      const format = rawObject.abi === BACKUP_V2_ABI ? "v2" : "legacy-v1";
      const manifest = validateManifest(rawManifest, format);
      const operationId = "rst-" + crypto.randomUUID();
      operation = this.writeJournal({
        journalVersion: 1,
        operationId,
        state: "RECEIVED",
        createdAt: now(),
        updatedAt: now(),
        format
      });
      const staged = this.transition(operation, "STAGED");
      operation = staged;
      const validation = this.validateStaged(extracted, manifest);
      operation = this.transition(operation, "VALIDATED");
      const currentBytes = directoryBytes(this.root);
      const stagedBytes = extracted.expandedBytes;
      if (availableBytes(this.root) < currentBytes + stagedBytes + this.config.backupMaxExpandedBytes) {
        throw new BackupError("insufficient storage for backup recovery", "backup_insufficient_storage", 507);
      }
      return await this.withMaintenanceLock(async () => {
        if (!operation) throw new BackupError("backup operation state is invalid", "backup_operation_invalid", 500);
        const recovery = await this.createRecoveryPoint(operation.operationId);
        operation = this.transition(operation, "RECOVERY_CREATED", { recoveryRelative: path.relative(this.root, recovery.directory).replaceAll(path.sep, "/") });
        try {
          operation = this.transition(operation, "DB_REPLACE_STARTED");
          restoreDatabase(this.database, extracted.databasePath, validation.schema);
          this.hit("after-db-replacement");
          operation = this.transition(operation, "DB_REPLACED");
          operation = this.transition(operation, "FILESYSTEM_REPLACE_STARTED");
          this.replaceData(extracted.dataPath);
          this.hit("after-filesystem-replacement");
          operation = this.transition(operation, "FILESYSTEM_REPLACED");
          operation = this.transition(operation, "VERIFYING");
          this.hit("before-verification");
          validateFilesystemReferences(this.root, this.database);
          const integrity = this.database.prepare("PRAGMA integrity_check").get() as { integrity_check?: unknown };
          if (integrity.integrity_check !== "ok") throw new BackupError("restored database integrity check failed", "backup_post_restore_invalid");
          operation = this.transition(operation, "COMPLETED");
          return { operationId: operation.operationId, format: validation.format, state: "COMPLETED", entries: extracted.entries.size, expandedBytes: extracted.expandedBytes };
        } catch (error) {
          this.rollback(operation, recovery);
          if (error instanceof BackupError) throw error;
          throw new BackupError("backup restore failed", "backup_restore_failed", 500, { cause: error });
        }
      });
    } catch (error) {
      if (operation && !TERMINAL_STATES.has(operation.state) && !ROLLBACK_STATES.has(operation.state)) {
        try { operation = this.transition(operation, "FAILED", { errorCode: error instanceof BackupError ? error.code : "backup_restore_failed" }); } catch { /* preserve original failure */ }
      }
      if (error instanceof BackupError) throw error;
      throw new BackupError("backup restore failed", "backup_restore_failed", 500, { cause: error });
    } finally {
      fs.rmSync(job, { recursive: true, force: true });
    }
  }

  cleanupArtifact(artifact: BackupArtifact): void {
    try { fs.rmSync(artifact.path, { force: true }); } catch { /* download cleanup is best effort */ }
  }
}

export function backupFormatFromMagic(filePath: string): "encrypted-v2" | "zip" {
  const fd = fs.openSync(filePath, "r");
  try {
    const prefix = Buffer.alloc(20);
    const read = fs.readSync(fd, prefix, 0, prefix.length, 0);
    return read === 20 && prefix.toString("ascii") === "PRG32-BACKUP-ENC-1\n" ? "encrypted-v2" : "zip";
  } finally {
    fs.closeSync(fd);
  }
}

export function validateStagedZipForTests(zipPath: string, config: BackendConfig): number {
  return scanZipArchive(zipPath, config).entries.length;
}
