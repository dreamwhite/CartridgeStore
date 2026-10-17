import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { inspectSchema } from "../db/schema-inspection.js";
import {
  assertInside,
  BACKUP_ENCRYPTION_MAGIC,
  BACKUP_V2_ABI,
  BackupError,
  type BackupInventoryEntry,
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
import {
  availableBytes,
  clearManagedData,
  collectFiles,
  copyDataTree,
  directoryBytes,
  validateFilesystemReferences
} from "./inventory.js";
import {
  type BackupArtifact,
  type BackupFaultPoint,
  type BackupServiceOptions,
  type RestoreResult,
} from "./service-contracts.js";
import {
  acquireLock,
  ensureDirectory,
  jsonBytes,
  now,
  readJson,
  releaseLock,
  safeDirectory,
  sha256,
  writeAtomic,
} from "./operations.js";
import {
  restoreDatabase,
  schemaFingerprint,
} from "./database.js";
import { validateStagedBackup } from "./validation.js";

export type {
  BackupArtifact,
  BackupFaultPoint,
  BackupServiceOptions,
  RestoreResult,
} from "./service-contracts.js";

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

interface RecoveryPoint {
  readonly directory: string;
  readonly databasePath: string;
  readonly dataPath: string;
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
      const validation = validateStagedBackup(extracted, manifest, {
        config: this.config,
        database: this.database,
        secrets: this.secrets,
      });
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
