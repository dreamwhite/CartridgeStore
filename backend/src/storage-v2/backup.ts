import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { extractZipArchive, scanZipArchive } from "../backup/archive.js";
import { BackupError } from "../backup/format.js";
import { auditStorage } from "./integrity.js";
import { initializeDisposableStorage, isDisposablePath, openTargetStorage } from "./database.js";
import { expectedStorageKey } from "./objects.js";
import { TARGET_TABLES, TARGET_VERSION_TUPLE, COMPATIBLE_TABLES } from "./schema.js";
import { inspectSchema } from "../db/schema-inspection.js";
import type { ObjectKind, StorageDatabase } from "./types.js";

export const CANONICAL_BACKUP_ABI = "prg32-cartridge-store-backup-3.0";
export const CANONICAL_BACKUP_AUTHORIZATION = "PRG32_STORAGE_V2_DISPOSABLE_BACKUP";
export const CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION = "PRG32_STORAGE_V2_OPERATIONAL_BACKUP";
export const CANONICAL_BACKUP_VERSION = 3;

const CHUNK_BYTES = 1024 * 1024;
const SQLITE_SNAPSHOT_TIMEOUT_MS = 5 * 60 * 1000;
const RESTORE_STATE_FILE = ".prg32-storage-v2-restore.json";
const INCOMPLETE_PUBLICATION_STATES = new Set([
  "prepared", "objects_staged", "objects_verified", "database_committed", "cleanup_pending",
  "recovery_required", "compensating"
]);

export interface CanonicalBackupLimits {
  readonly maxArchiveBytes: number;
  readonly maxExpandedBytes: number;
  readonly maxEntryBytes: number;
  readonly maxManifestBytes: number;
  readonly maxEntries: number;
  readonly maxPathBytes: number;
  readonly maxPathDepth: number;
  readonly maxCompressionRatio: number;
}

export const DEFAULT_CANONICAL_BACKUP_LIMITS: CanonicalBackupLimits = {
  maxArchiveBytes: 4 * 1024 * 1024 * 1024,
  maxExpandedBytes: 8 * 1024 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
  maxEntries: 50_000,
  maxPathBytes: 1024,
  maxPathDepth: 32,
  maxCompressionRatio: 200
};

export type CanonicalBackupFaultPoint =
  | "before-sqlite-snapshot"
  | "after-sqlite-snapshot"
  | "during-object-inventory"
  | "during-object-streaming"
  | "before-archive-finalization"
  | "after-archive-finalization";

export type CanonicalBackupSnapshotMode = "exclusive" | "online";

export type CanonicalRestoreFaultPoint =
  | "before-target-initialization"
  | "after-sqlite-restore"
  | "during-object-extraction"
  | "during-staging-restoration"
  | "during-journal-restoration"
  | "before-final-integrity-verification"
  | "after-verification-before-completion";

export interface CanonicalBackupOptions {
  readonly sourceRoot: string;
  readonly outputPath: string;
  readonly authorization: string;
  readonly writerQuiesced: boolean;
  /** Exclusive is the historical, externally-quiesced path; online never owns the application writer lease. */
  readonly snapshotMode?: CanonicalBackupSnapshotMode;
  readonly limits?: Partial<CanonicalBackupLimits>;
  readonly fault?: (point: CanonicalBackupFaultPoint) => void;
}

export interface CanonicalRestoreOptions {
  readonly archivePath: string;
  readonly targetRoot: string;
  readonly authorization: string;
  readonly limits?: Partial<CanonicalBackupLimits>;
  readonly fault?: (point: CanonicalRestoreFaultPoint) => void;
}

export interface CanonicalBackupResult {
  readonly backupId: string;
  readonly archivePath: string;
  readonly completionMarker: string;
  readonly archiveSha256: string;
  readonly archiveBytes: number;
  readonly manifest: CanonicalBackupManifest;
}

export interface CanonicalRestoreResult {
  readonly backupId: string;
  readonly targetRoot: string;
  readonly state: "completed" | "recovery_required";
  readonly operationId: string;
  readonly report: CanonicalRestoreReport;
}

export interface CanonicalBackupInventoryEntry {
  readonly archivePath: string;
  readonly sourceKey: string;
  readonly kind: "sqlite_snapshot" | "object" | "submission_staging" | "journal" | "quarantine" | "compatibility";
  readonly objectKind?: ObjectKind;
  readonly objectId?: string;
  readonly storageKey?: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly classification: "required" | "optional" | "reconstructible" | "recovery_required";
}

export interface CanonicalBackupManifest {
  readonly abi: typeof CANONICAL_BACKUP_ABI;
  readonly format_version: typeof CANONICAL_BACKUP_VERSION;
  readonly application: "prg32-cartridge-store";
  readonly backup_id: string;
  readonly created_at: string;
  readonly snapshot: {
    readonly identity: string;
    readonly database: "database.sqlite";
    readonly size_bytes: number;
    readonly sha256: string;
  };
  readonly versions: typeof TARGET_VERSION_TUPLE;
  readonly schema: { readonly fingerprint: string; readonly tables: readonly string[] };
  readonly inventory: readonly CanonicalBackupInventoryEntry[];
  readonly object_count: number;
  readonly object_kinds: Readonly<Record<ObjectKind, number>>;
  readonly staging_count: number;
  readonly recovery_required: boolean;
  readonly required_recovery_material: readonly string[];
  readonly aggregate_bytes: { readonly expanded: number; readonly archive: number };
  readonly archive_inventory_sha256: string;
  readonly canonical_manifest_sha256: string;
  readonly verification_state: "complete" | "recovery_required";
}

export interface CanonicalRestoreReport {
  readonly databaseSha256: string;
  readonly inventoryEntries: number;
  readonly objectsVerified: number;
  readonly stagingEntries: number;
  readonly recoveryMaterialEntries: number;
  readonly integrity: ReturnType<typeof auditStorage>;
  readonly databaseFingerprint: string;
}

interface ArchiveEntrySource {
  readonly archivePath: string;
  readonly sourcePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface RestoreJournal {
  readonly abi: typeof CANONICAL_BACKUP_ABI;
  readonly operation_id: string;
  readonly backup_id: string;
  readonly archive_sha256: string;
  readonly state: "preparing" | "restoring_database" | "restoring_objects" | "restoring_staging" | "restoring_journals" | "verifying" | "completed" | "recovery_required" | "failed";
  readonly updated_at: string;
  readonly error_code?: string;
}

function limits(value?: Partial<CanonicalBackupLimits>): CanonicalBackupLimits {
  const result = { ...DEFAULT_CANONICAL_BACKUP_LIMITS, ...value };
  for (const [key, numberValue] of Object.entries(result)) {
    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) throw new BackupError(`canonical backup limit ${key} is invalid`, "canonical_backup_limit_invalid");
  }
  return result;
}

function validateBackupAuthorization(value: string): "disposable" | "operational" {
  if (value === CANONICAL_BACKUP_AUTHORIZATION) return "disposable";
  if (value === CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION) return "operational";
  throw new BackupError("explicit backup authorization is required", "canonical_backup_authorization_required", 403);
}

function snapshotMode(value: CanonicalBackupSnapshotMode | undefined): CanonicalBackupSnapshotMode {
  if (value === undefined || value === "exclusive" || value === "online") return value ?? "exclusive";
  throw new BackupError("canonical backup snapshot mode is invalid", "canonical_backup_snapshot_mode_invalid", 400);
}

function resolved(value: string, label: string): string {
  if (!value || value.trim() === "") throw new BackupError(`${label} is required`, "canonical_backup_path_required");
  const result = path.resolve(value);
  if (result === path.parse(result).root) throw new BackupError(`${label} may not be the filesystem root`, "canonical_backup_path_unsafe");
  return result;
}

function inside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function sha256File(filePath: string): { readonly sizeBytes: number; readonly sha256: string } {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new BackupError("canonical backup requires regular files", "canonical_backup_file_invalid");
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  let sizeBytes = 0;
  try {
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      sizeBytes += count;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return { sizeBytes, sha256: hash.digest("hex") };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function schemaFingerprint(sqlite: Database.Database): { readonly fingerprint: string; readonly tables: readonly string[] } {
  const snapshot = inspectSchema(sqlite);
  return { fingerprint: hashText(canonicalJson(snapshot)), tables: snapshot.tables.map((table) => table.name).sort() };
}

function tableNames(sqlite: Database.Database): readonly string[] {
  return (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
}

function assertDatabase(sqlite: Database.Database, allowRecoveryState = false): void {
  const integrity = sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check?: unknown };
  if (integrity.integrity_check !== "ok") throw new BackupError("canonical SQLite integrity check failed", "canonical_backup_database_integrity");
  if (sqlite.prepare("PRAGMA foreign_key_check").all().length > 0) throw new BackupError("canonical SQLite foreign-key check failed", "canonical_backup_database_foreign_keys");
  const names = new Set(tableNames(sqlite));
  for (const table of [...COMPATIBLE_TABLES, ...TARGET_TABLES]) if (!names.has(table)) throw new BackupError("canonical SQLite schema is incomplete", "canonical_backup_schema_incompatible");
  const row = sqlite.prepare("SELECT * FROM storage_metadata WHERE singleton_id = 1").get() as Record<string, unknown> | undefined;
  if (!row || row.application !== "prg32-cartridge-store" || row.schema_version !== TARGET_VERSION_TUPLE.schemaVersion || row.storage_layout_version !== TARGET_VERSION_TUPLE.storageLayoutVersion || row.publication_journal_version !== TARGET_VERSION_TUPLE.publicationJournalVersion || row.backup_format_version !== TARGET_VERSION_TUPLE.backupFormatVersion || (!allowRecoveryState && row.state !== "ready") || (allowRecoveryState && !["ready", "recovery_required"].includes(String(row.state)))) {
    throw new BackupError("canonical SQLite version tuple or state is incompatible", "canonical_backup_version_incompatible");
  }
}

function recoveryRequired(sqlite: Database.Database): boolean {
  const metadata = sqlite.prepare("SELECT state FROM storage_metadata WHERE singleton_id = 1").get() as { state?: string } | undefined;
  const publication = sqlite.prepare("SELECT state FROM publication_operations").all() as Array<{ state: string }>;
  const migration = sqlite.prepare("SELECT state FROM schema_migrations").all() as Array<{ state: string }>;
  return metadata?.state === "recovery_required" || publication.some((row) => INCOMPLETE_PUBLICATION_STATES.has(row.state)) || migration.some((row) => row.state === "running");
}

function pathForStorageKey(root: string, storageKey: string): string {
  if (!/^storage\/(objects|staging)\/[A-Za-z0-9._/-]+$/u.test(storageKey) || storageKey.includes("..")) throw new BackupError("canonical storage key is unsafe", "canonical_backup_storage_key_unsafe");
  const candidate = path.resolve(root, storageKey);
  if (!inside(candidate, root)) throw new BackupError("canonical storage key escapes the source root", "canonical_backup_storage_key_unsafe");
  return candidate;
}

function collectFiles(root: string, relativeRoot: string, classification: CanonicalBackupInventoryEntry["classification"], kind: CanonicalBackupInventoryEntry["kind"], entries: ArchiveEntrySource[], inventory: CanonicalBackupInventoryEntry[], maxEntryBytes: number): void {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return;
  const walk = (directory: string): void => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, item.name);
      const relative = path.relative(root, candidate).replaceAll(path.sep, "/");
      if (item.isSymbolicLink()) throw new BackupError("canonical backup rejects symlinks", "canonical_backup_symlink_rejected");
      if (item.isDirectory()) { walk(candidate); continue; }
      if (!item.isFile()) throw new BackupError("canonical backup rejects non-regular files", "canonical_backup_file_type_unsupported");
      const identity = sha256File(candidate);
      if (identity.sizeBytes > maxEntryBytes) throw new BackupError("canonical backup entry is too large", "canonical_backup_entry_too_large");
      const archivePath = `data/${relative}`;
      entries.push({ archivePath, sourcePath: candidate, ...identity });
      inventory.push({ archivePath, sourceKey: relative, kind, sizeBytes: identity.sizeBytes, sha256: identity.sha256, classification });
    }
  };
  walk(absoluteRoot);
}

function sameFileIdentity(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

/**
 * Capture one source file through an open descriptor.  This is deliberately
 * independent of the application writer lease: a staged file may be unlinked
 * by publication cleanup after the SQLite snapshot, but an already-open
 * descriptor remains a stable POSIX read view.  Replacement or in-place
 * mutation is rejected.
 */
function captureStableFile(sourcePath: string, targetPath: string, maxEntryBytes: number): void {
  const sourceBefore = fs.lstatSync(sourcePath);
  if (sourceBefore.isSymbolicLink() || !sourceBefore.isFile()) throw new BackupError("canonical backup rejects non-regular files", "canonical_backup_file_type_unsupported");
  if (sourceBefore.size > maxEntryBytes) throw new BackupError("canonical backup entry is too large", "canonical_backup_entry_too_large");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporary = `${targetPath}.tmp-${crypto.randomUUID()}`;
  const inputFd = fs.openSync(sourcePath, fs.constants.O_RDONLY);
  const outputFd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  let copied = 0;
  try {
    while (true) {
      const count = fs.readSync(inputFd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      copied += count;
      if (copied > maxEntryBytes) throw new BackupError("canonical backup entry is too large", "canonical_backup_entry_too_large");
      fs.writeSync(outputFd, buffer, 0, count);
    }
    fs.fsyncSync(outputFd);
    const sourceAfter = fs.fstatSync(inputFd);
    if (!sameFileIdentity(sourceBefore, sourceAfter)) throw new BackupError("canonical backup source file changed during snapshot", "canonical_backup_source_changed", 409);
    try {
      const currentPath = fs.lstatSync(sourcePath);
      if (!sameFileIdentity(sourceBefore, currentPath)) throw new BackupError("canonical backup source file was replaced during snapshot", "canonical_backup_source_changed", 409);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // An unlink after opening is safe: the descriptor still references the
      // exact file that belonged to the SQLite snapshot.
    }
  } finally {
    fs.closeSync(inputFd);
    fs.closeSync(outputFd);
  }
  try {
    if (fs.existsSync(targetPath)) throw new BackupError("canonical backup snapshot contains a duplicate path", "canonical_backup_duplicate_entry");
    fs.renameSync(temporary, targetPath);
    fs.chmodSync(targetPath, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* preserve the original error */ }
    throw error;
  }
}

function captureDirectory(sourceRoot: string, targetRoot: string, relativeRoot: string, maxEntryBytes: number): void {
  const sourceDirectory = path.join(sourceRoot, relativeRoot);
  if (!fs.existsSync(sourceDirectory)) return;
  const walk = (directory: string): void => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const sourcePath = path.join(directory, item.name);
      const relative = path.relative(sourceRoot, sourcePath);
      if (item.isSymbolicLink()) throw new BackupError("canonical backup rejects symlinks", "canonical_backup_symlink_rejected");
      if (item.isDirectory()) { walk(sourcePath); continue; }
      if (!item.isFile()) throw new BackupError("canonical backup rejects non-regular files", "canonical_backup_file_type_unsupported");
      captureStableFile(sourcePath, path.join(targetRoot, relative), maxEntryBytes);
    }
  };
  walk(sourceDirectory);
}

function captureReferencedFiles(snapshot: Database.Database, sourceRoot: string, targetRoot: string, maxEntryBytes: number): void {
  const keys = new Set<string>();
  const objects = snapshot.prepare("SELECT storage_key FROM storage_objects ORDER BY object_id").all() as Array<{ storage_key: string }>;
  for (const row of objects) keys.add(String(row.storage_key));
  const staging = snapshot.prepare("SELECT staging_key FROM submission_artifacts WHERE validation_state IN ('staged', 'validated') ORDER BY submission_artifact_id").all() as Array<{ staging_key: string }>;
  for (const row of staging) keys.add(String(row.staging_key));
  for (const storageKey of keys) {
    const sourcePath = pathForStorageKey(sourceRoot, storageKey);
    const targetPath = pathForStorageKey(targetRoot, storageKey);
    captureStableFile(sourcePath, targetPath, maxEntryBytes);
  }
  // Recovery evidence and compatibility files are not derived from directory
  // enumeration as catalog truth, but they are captured before inventorying so
  // the archive never mixes a live file with the SQLite snapshot.
  captureDirectory(sourceRoot, targetRoot, "storage/staging/operations", maxEntryBytes);
  captureDirectory(sourceRoot, targetRoot, "journal", maxEntryBytes);
  captureDirectory(sourceRoot, targetRoot, "storage/quarantine", maxEntryBytes);
  captureDirectory(sourceRoot, targetRoot, "compatibility", maxEntryBytes);
}

function buildInventory(resource: StorageDatabase, snapshot: Database.Database, backupId: string, sourceRoot: string, maxEntryBytes: number, fault?: (point: CanonicalBackupFaultPoint) => void): { readonly entries: ArchiveEntrySource[]; readonly inventory: CanonicalBackupInventoryEntry[]; readonly objectKinds: Record<ObjectKind, number>; readonly stagingCount: number; readonly recoveryMaterial: readonly string[]; readonly recoveryRequired: boolean } {
  const entries: ArchiveEntrySource[] = [];
  const inventory: CanonicalBackupInventoryEntry[] = [];
  const objectKinds: Record<ObjectKind, number> = { artifact: 0, media: 0, site_asset: 0 };
  const objects = snapshot.prepare("SELECT object_id, object_kind, storage_key, sha256, size_bytes, media_type FROM storage_objects ORDER BY object_id").all() as Array<Record<string, unknown>>;
  for (const row of objects) {
    fault?.("during-object-inventory");
    const objectKind = String(row.object_kind) as ObjectKind;
    const objectId = String(row.object_id);
    const storageKey = String(row.storage_key);
    if (!(["artifact", "media", "site_asset"] as readonly string[]).includes(objectKind)) throw new BackupError("canonical object kind is invalid", "canonical_backup_object_invalid");
    if (expectedStorageKey(objectKind, objectId, String(row.media_type)) !== storageKey) throw new BackupError("canonical object storage key is not derived from identity", "canonical_backup_object_invalid");
    const sourcePath = pathForStorageKey(sourceRoot, storageKey);
    const identity = sha256File(sourcePath);
    if (identity.sizeBytes !== Number(row.size_bytes) || identity.sha256 !== String(row.sha256)) throw new BackupError("canonical object identity is inconsistent", "canonical_backup_object_integrity");
    const archivePath = `data/${storageKey}`;
    entries.push({ archivePath, sourcePath, ...identity });
    inventory.push({ archivePath, sourceKey: storageKey, kind: "object", objectKind, objectId, storageKey, sizeBytes: identity.sizeBytes, sha256: identity.sha256, classification: "required" });
    objectKinds[objectKind] += 1;
  }
  // Promoted/quarantined rows retain historical identity in SQLite but no
  // longer reference private staging bytes. Back up only recoverable staging.
  const stagingRows = snapshot.prepare("SELECT staging_key, submission_id, architecture, sha256, size_bytes FROM submission_artifacts WHERE validation_state IN ('staged', 'validated') ORDER BY submission_artifact_id").all() as Array<Record<string, unknown>>;
  for (const row of stagingRows) {
    const stagingKey = String(row.staging_key);
    const sourcePath = pathForStorageKey(sourceRoot, stagingKey);
    const identity = sha256File(sourcePath);
    if (identity.sizeBytes !== Number(row.size_bytes) || identity.sha256 !== String(row.sha256)) throw new BackupError("submission staging identity is inconsistent", "canonical_backup_staging_integrity");
    const archivePath = `data/${stagingKey}`;
    entries.push({ archivePath, sourcePath, ...identity });
    inventory.push({ archivePath, sourceKey: stagingKey, kind: "submission_staging", objectId: String(row.submission_id), sizeBytes: identity.sizeBytes, sha256: identity.sha256, classification: "required" });
  }
  collectFiles(sourceRoot, "storage/staging/operations", "recovery_required", "journal", entries, inventory, maxEntryBytes);
  collectFiles(sourceRoot, "journal", "recovery_required", "journal", entries, inventory, maxEntryBytes);
  collectFiles(sourceRoot, "storage/quarantine", "recovery_required", "quarantine", entries, inventory, maxEntryBytes);
  collectFiles(sourceRoot, "compatibility", "optional", "compatibility", entries, inventory, maxEntryBytes);
  const duplicatePaths = new Set<string>();
  for (const item of inventory) if (duplicatePaths.has(item.archivePath)) throw new BackupError("canonical backup contains duplicate identities", "canonical_backup_duplicate_entry"); else duplicatePaths.add(item.archivePath);
  return { entries: entries.sort((left, right) => left.archivePath.localeCompare(right.archivePath)), inventory: inventory.sort((left, right) => left.archivePath.localeCompare(right.archivePath)), objectKinds, stagingCount: stagingRows.length, recoveryMaterial: inventory.filter((item) => item.classification === "recovery_required").map((item) => item.archivePath), recoveryRequired: recoveryRequired(snapshot) };
}

function crcTable(): readonly number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let bit = 0; bit < 8; bit += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
}

const CRC_TABLE = crcTable();

function streamCrcAndHash(sourcePath: string, outputFd: number, fault?: (point: CanonicalBackupFaultPoint) => void): { readonly sizeBytes: number; readonly sha256: string; readonly crc32: number } {
  const inputFd = fs.openSync(sourcePath, "r");
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  let crc = 0xffffffff;
  let sizeBytes = 0;
  try {
    while (true) {
      const count = fs.readSync(inputFd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      sizeBytes += count;
      hash.update(chunk);
      for (const byte of chunk) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
      fs.writeSync(outputFd, chunk);
      fault?.("during-object-streaming");
    }
  } finally {
    fs.closeSync(inputFd);
  }
  return { sizeBytes, sha256: hash.digest("hex"), crc32: (crc ^ 0xffffffff) >>> 0 };
}

function writeU16(fd: number, value: number): void { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value, 0); fs.writeSync(fd, buffer); }
function writeU32(fd: number, value: number): void { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0, 0); fs.writeSync(fd, buffer); }

function writeZipEntry(fd: number, entry: ArchiveEntrySource, fault?: (point: CanonicalBackupFaultPoint) => void): { readonly name: string; readonly sizeBytes: number; readonly sha256: string; readonly crc32: number; readonly offset: number } {
  const name = Buffer.from(entry.archivePath, "utf8");
  if (name.length > 0xffff || entry.sizeBytes > 0xffffffff) throw new BackupError("canonical backup ZIP entry exceeds format bounds", "canonical_backup_archive_unsupported");
  const offset = fs.fstatSync(fd).size;
  writeU32(fd, 0x04034b50); writeU16(fd, 20); writeU16(fd, 0x800); writeU16(fd, 0); writeU16(fd, 0); writeU16(fd, 0); writeU32(fd, 0); writeU32(fd, entry.sizeBytes); writeU32(fd, entry.sizeBytes); writeU16(fd, name.length); writeU16(fd, 0); fs.writeSync(fd, name);
  const streamed = streamCrcAndHash(entry.sourcePath, fd, fault);
  if (streamed.sizeBytes !== entry.sizeBytes || streamed.sha256 !== entry.sha256) throw new BackupError("canonical source changed while creating backup", "canonical_backup_source_changed");
  return { name: entry.archivePath, ...streamed, offset };
}

function writeZipArchive(outputPath: string, entries: readonly ArchiveEntrySource[], manifestBytes: Buffer, manifestHash: string, limitsValue: CanonicalBackupLimits, fault?: (point: CanonicalBackupFaultPoint) => void): { readonly archiveBytes: number; readonly archiveSha256: string } {
  const temporary = `${outputPath}.partial-${process.pid}-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR, 0o600);
  const central: Array<{ name: string; sizeBytes: number; sha256: string; crc32: number; offset: number }> = [];
  const manifestPath = `${temporary}.manifest`;
  const sidecarPath = `${temporary}.manifest.sha256`;
  try {
    fs.writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
    fs.writeFileSync(sidecarPath, `${manifestHash}\n`, { mode: 0o600 });
    const allEntries: ArchiveEntrySource[] = [
      { archivePath: "manifest.json", sourcePath: manifestPath, sizeBytes: manifestBytes.byteLength, sha256: hashText(manifestBytes.toString("utf8")) },
      { archivePath: "manifest.sha256", sourcePath: sidecarPath, sizeBytes: Buffer.byteLength(`${manifestHash}\n`), sha256: hashText(`${manifestHash}\n`) },
      ...entries
    ];
    for (const entry of allEntries) {
      if (central.length >= limitsValue.maxEntries) throw new BackupError("canonical backup contains too many entries", "canonical_backup_too_many_entries");
      if (entry.sizeBytes > limitsValue.maxEntryBytes) throw new BackupError("canonical backup entry is too large", "canonical_backup_entry_too_large");
      central.push(writeZipEntry(fd, entry, fault));
    }
    fault?.("before-archive-finalization");
    const centralOffset = fs.fstatSync(fd).size;
    for (const item of central) {
      const name = Buffer.from(item.name, "utf8");
      writeU32(fd, 0x02014b50); writeU16(fd, 20); writeU16(fd, 20); writeU16(fd, 0x800); writeU16(fd, 0); writeU16(fd, 0); writeU16(fd, 0); writeU32(fd, item.crc32); writeU32(fd, item.sizeBytes); writeU32(fd, item.sizeBytes); writeU16(fd, name.length); writeU16(fd, 0); writeU16(fd, 0); writeU16(fd, 0); writeU16(fd, 0); writeU32(fd, 0); writeU32(fd, item.offset); fs.writeSync(fd, name);
    }
    const centralSize = fs.fstatSync(fd).size - centralOffset;
    writeU32(fd, 0x06054b50); writeU16(fd, 0); writeU16(fd, 0); writeU16(fd, central.length); writeU16(fd, central.length); writeU32(fd, centralSize); writeU32(fd, centralOffset); writeU16(fd, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
    fs.rmSync(manifestPath, { force: true });
    fs.rmSync(sidecarPath, { force: true });
  }
  fs.renameSync(temporary, outputPath);
  const outputDirectory = fs.openSync(path.dirname(outputPath), fs.constants.O_RDONLY);
  try { fs.fsyncSync(outputDirectory); } finally { fs.closeSync(outputDirectory); }
  fault?.("after-archive-finalization");
  const archiveIdentity = sha256File(outputPath);
  if (archiveIdentity.sizeBytes > limitsValue.maxArchiveBytes) throw new BackupError("canonical backup archive is too large", "canonical_backup_archive_too_large");
  return { archiveBytes: archiveIdentity.sizeBytes, archiveSha256: archiveIdentity.sha256 };
}

function manifestPayload(manifest: Omit<CanonicalBackupManifest, "canonical_manifest_sha256">): string {
  return `${canonicalJson(manifest)}\n`;
}

function predictedZipBytes(entries: readonly ArchiveEntrySource[], manifestBytes: Buffer): number {
  const sidecarBytes = 65;
  const all = [
    { name: "manifest.json", size: manifestBytes.byteLength },
    { name: "manifest.sha256", size: sidecarBytes },
    ...entries.map((entry) => ({ name: entry.archivePath, size: entry.sizeBytes }))
  ];
  const local = all.reduce((total, entry) => total + 30 + Buffer.byteLength(entry.name, "utf8") + entry.size, 0);
  const central = all.reduce((total, entry) => total + 46 + Buffer.byteLength(entry.name, "utf8"), 0);
  return local + central + 22;
}

function readManifest(extractedPath: string, limitValue: CanonicalBackupLimits): { readonly manifest: CanonicalBackupManifest; readonly bytes: Buffer } {
  const bytes = fs.readFileSync(extractedPath);
  if (bytes.byteLength > limitValue.maxManifestBytes) throw new BackupError("canonical backup manifest is too large", "canonical_backup_manifest_too_large");
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; } catch { throw new BackupError("canonical backup manifest is invalid", "canonical_backup_manifest_invalid"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BackupError("canonical backup manifest is invalid", "canonical_backup_manifest_invalid");
  const manifest = value as Partial<CanonicalBackupManifest>;
  if (manifest.abi !== CANONICAL_BACKUP_ABI || manifest.format_version !== CANONICAL_BACKUP_VERSION || manifest.application !== "prg32-cartridge-store" || typeof manifest.backup_id !== "string" || !manifest.snapshot || !manifest.versions || !Array.isArray(manifest.inventory) || typeof manifest.canonical_manifest_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.canonical_manifest_sha256)) throw new BackupError("canonical backup manifest is incompatible", "canonical_backup_manifest_incompatible");
  if (manifest.versions.schemaVersion !== TARGET_VERSION_TUPLE.schemaVersion || manifest.versions.storageLayoutVersion !== TARGET_VERSION_TUPLE.storageLayoutVersion || manifest.versions.publicationJournalVersion !== TARGET_VERSION_TUPLE.publicationJournalVersion || manifest.versions.backupFormatVersion !== TARGET_VERSION_TUPLE.backupFormatVersion) throw new BackupError("canonical backup version tuple is incompatible", "canonical_backup_version_incompatible");
  const parsedManifest = manifest as CanonicalBackupManifest;
  const withoutHash = JSON.parse(JSON.stringify(parsedManifest)) as Record<string, unknown>;
  delete withoutHash.canonical_manifest_sha256;
  if (hashText(manifestPayload(withoutHash as Omit<CanonicalBackupManifest, "canonical_manifest_sha256">)) !== parsedManifest.canonical_manifest_sha256) throw new BackupError("canonical backup manifest hash is invalid", "canonical_backup_manifest_tampered");
  return { manifest: parsedManifest, bytes };
}

function backendConfig(limitsValue: CanonicalBackupLimits): BackendConfig {
  return { backupMaxArchiveBytes: limitsValue.maxArchiveBytes, backupMaxExpandedBytes: limitsValue.maxExpandedBytes, backupMaxEntryBytes: limitsValue.maxEntryBytes, backupMaxManifestBytes: limitsValue.maxManifestBytes, backupMaxEntries: limitsValue.maxEntries, backupMaxPathBytes: limitsValue.maxPathBytes, backupMaxPathDepth: limitsValue.maxPathDepth, backupMaxCompressionRatio: limitsValue.maxCompressionRatio } as BackendConfig;
}

function archiveIdentity(filePath: string): string { return sha256File(filePath).sha256; }

function writeState(root: string, state: RestoreJournal): void {
  const filePath = path.join(root, RESTORE_STATE_FILE);
  writeDurable(filePath, `${canonicalJson(state)}\n`);
}

function writeDurable(filePath: string, value: string): void {
  const temporary = `${filePath}.tmp-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try {
    fs.writeSync(fd, value, undefined, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, filePath);
  const directory = fs.openSync(path.dirname(filePath), fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function copyExtractedData(extractedData: string, targetRoot: string, fault?: (point: CanonicalRestoreFaultPoint) => void): void {
  if (!fs.existsSync(extractedData)) return;
  const walk = (directory: string): void => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, item.name);
      const relative = path.relative(extractedData, source);
      const destination = path.join(targetRoot, relative);
      if (item.isSymbolicLink()) throw new BackupError("canonical restore rejects symlinks", "canonical_restore_symlink_rejected");
      if (item.isDirectory()) { fs.mkdirSync(destination, { recursive: true, mode: 0o700 }); walk(source); continue; }
      if (!item.isFile() || fs.existsSync(destination)) throw new BackupError("canonical restore refuses an overwrite", "canonical_restore_conflict");
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL); fs.chmodSync(destination, 0o600);
      if (relative.startsWith(`storage${path.sep}staging${path.sep}`)) fault?.("during-staging-restoration");
      if (relative.startsWith(`journal${path.sep}`)) fault?.("during-journal-restoration");
      else fault?.("during-object-extraction");
    }
  };
  walk(extractedData);
}

/**
 * Docker bind mounts and tmpfs use different filesystems. Keep the normal
 * atomic rename when possible, but make restore portable across that
 * boundary without weakening the fresh-target and recovery-state checks.
 */
function promoteRestoredDatabase(source: string, destination: string): void {
  try {
    fs.renameSync(source, destination);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o600);
  fs.unlinkSync(source);
}

function prepareVerificationRoot(extracted: ReturnType<typeof extractZipArchive>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-backup-verify-"));
  for (const relative of [
    "storage/objects/artifacts", "storage/objects/media", "storage/objects/site-assets", "storage/objects/.tmp",
    "storage/staging/submissions", "storage/staging/operations", "storage/quarantine", "journal/publications", "backups", "compatibility"
  ]) fs.mkdirSync(path.join(root, relative), { recursive: true, mode: 0o700 });
  fs.copyFileSync(extracted.databasePath, path.join(root, "store.sqlite"));
  copyExtractedData(extracted.dataPath, root);
  return root;
}

export function verifyCanonicalBackup(archivePathValue: string, options: { readonly limits?: Partial<CanonicalBackupLimits> } = {}): { readonly manifest: CanonicalBackupManifest; readonly archiveSha256: string; readonly archiveBytes: number } {
  const archivePath = resolved(archivePathValue, "archive path");
  const limitValue = limits(options.limits);
  scanZipArchive(archivePath, backendConfig(limitValue));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-backup-verify-"));
  try {
    const extracted = extractZipArchive(archivePath, temporary, backendConfig(limitValue));
    const names = [...extracted.entries.values()].filter((entry) => !entry.directory).map((entry) => entry.name).sort();
    if (!names.includes("manifest.json") || !names.includes("manifest.sha256") || !names.includes("database.sqlite")) throw new BackupError("canonical backup required entry is missing", "canonical_backup_required_file_missing");
    const parsed = readManifest(extracted.manifestPath, limitValue);
    const sidecar = fs.readFileSync(path.join(temporary, "manifest.sha256"), "utf8").trim();
    if (sidecar !== parsed.manifest.canonical_manifest_sha256) throw new BackupError("canonical backup manifest sidecar is invalid", "canonical_backup_manifest_tampered");
    const inventory = parsed.manifest.inventory;
    const objectIds = new Set<string>();
    const objectKinds: Record<ObjectKind, number> = { artifact: 0, media: 0, site_asset: 0 };
    for (const item of inventory.filter((entry) => entry.kind === "object")) {
      if (!item.objectId || !item.objectKind || objectIds.has(item.objectId)) throw new BackupError("canonical backup contains duplicate object identities", "canonical_backup_duplicate_identity");
      objectIds.add(item.objectId); objectKinds[item.objectKind] += 1;
    }
    if (objectIds.size !== parsed.manifest.object_count || JSON.stringify(objectKinds) !== JSON.stringify(parsed.manifest.object_kinds)) throw new BackupError("canonical backup object inventory is inconsistent", "canonical_backup_inventory_mismatch");
    const expected = new Set(["manifest.json", "manifest.sha256", ...inventory.map((item) => item.archivePath)]);
    if (expected.size !== names.length || names.some((name) => !expected.has(name))) throw new BackupError("canonical backup archive inventory differs from its manifest", "canonical_backup_inventory_mismatch");
    const databaseIdentity = sha256File(extracted.databasePath);
    if (databaseIdentity.sizeBytes !== parsed.manifest.snapshot.size_bytes || databaseIdentity.sha256 !== parsed.manifest.snapshot.sha256) throw new BackupError("canonical backup SQLite snapshot is corrupt", "canonical_backup_database_integrity");
    if (hashText(canonicalJson(inventory)) !== parsed.manifest.archive_inventory_sha256) throw new BackupError("canonical backup inventory hash is invalid", "canonical_backup_inventory_mismatch");
    const verificationRoot = prepareVerificationRoot(extracted);
    try {
      const resource = openTargetStorage(verificationRoot, "read-only");
      try {
        assertDatabase(resource.sqlite, parsed.manifest.recovery_required);
        const audit = auditStorage(resource.sqlite, resource.paths);
        if (!audit.ok && !parsed.manifest.recovery_required) throw new BackupError("canonical backup storage audit failed", "canonical_backup_storage_integrity");
        const databaseObjects = resource.sqlite.prepare("SELECT object_id, object_kind, storage_key, sha256, size_bytes FROM storage_objects ORDER BY object_id").all() as Array<Record<string, unknown>>;
        const manifestObjects = inventory.filter((item) => item.kind === "object");
        if (databaseObjects.length !== manifestObjects.length) throw new BackupError("canonical backup object inventory does not match SQLite", "canonical_backup_inventory_mismatch");
        for (const row of databaseObjects) {
          const item = manifestObjects.find((candidate) => candidate.objectId === String(row.object_id));
          if (!item || item.objectKind !== row.object_kind || item.storageKey !== row.storage_key || item.sha256 !== row.sha256 || item.sizeBytes !== Number(row.size_bytes)) throw new BackupError("canonical backup object identity does not match SQLite", "canonical_backup_inventory_mismatch");
        }
        const databaseStaging = resource.sqlite.prepare("SELECT staging_key, sha256, size_bytes FROM submission_artifacts WHERE validation_state IN ('staged', 'validated') ORDER BY submission_artifact_id").all() as Array<Record<string, unknown>>;
        const manifestStaging = inventory.filter((item) => item.kind === "submission_staging");
        if (databaseStaging.length !== manifestStaging.length) throw new BackupError("canonical backup staging inventory does not match SQLite", "canonical_backup_inventory_mismatch");
        for (const row of databaseStaging) {
          const item = manifestStaging.find((candidate) => candidate.sourceKey === String(row.staging_key));
          if (!item || item.sha256 !== row.sha256 || item.sizeBytes !== Number(row.size_bytes)) throw new BackupError("canonical backup staging identity does not match SQLite", "canonical_backup_inventory_mismatch");
        }
      } finally { resource.close(); }
    } finally { fs.rmSync(verificationRoot, { recursive: true, force: true }); }
    for (const item of inventory) {
      const candidate = item.archivePath === "database.sqlite" ? extracted.databasePath : path.join(temporary, item.archivePath);
      const identity = sha256File(candidate);
      if (identity.sizeBytes !== item.sizeBytes || identity.sha256 !== item.sha256) throw new BackupError("canonical backup inventory checksum mismatch", "canonical_backup_inventory_mismatch");
    }
    const archiveBytes = fs.statSync(archivePath).size;
    if (parsed.manifest.aggregate_bytes.archive !== archiveBytes) throw new BackupError("canonical backup archive size is inconsistent", "canonical_backup_inventory_mismatch");
    return { manifest: parsed.manifest, archiveSha256: archiveIdentity(archivePath), archiveBytes };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export async function createCanonicalBackup(options: CanonicalBackupOptions): Promise<CanonicalBackupResult> {
  const authorizationKind = validateBackupAuthorization(options.authorization);
  const mode = snapshotMode(options.snapshotMode);
  if (mode === "exclusive" && !options.writerQuiesced) throw new BackupError("writer quiescence is required for canonical backup", "canonical_backup_writer_not_quiesced", 409);
  const sourceRoot = resolved(options.sourceRoot, "source root");
  const outputPath = resolved(options.outputPath, "output path");
  if ((authorizationKind === "disposable" && !isDisposablePath(sourceRoot)) || !fs.existsSync(path.join(sourceRoot, ".prg32-storage-v2"))) throw new BackupError("canonical backup source must be an initialized storage root", "canonical_backup_source_not_disposable", 403);
  if (inside(outputPath, sourceRoot)) throw new BackupError("backup output may not be inside the source root", "canonical_backup_output_unsafe");
  if (fs.existsSync(outputPath) || fs.existsSync(`${outputPath}.complete.json`)) throw new BackupError("completed backup output already exists", "canonical_backup_output_exists", 409);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const limitValue = limits(options.limits);
  const resource = openTargetStorage(sourceRoot, "read-only");
  const backupId = crypto.randomUUID();
  const snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-storage-v2-snapshot-"));
  const snapshotPath = path.join(snapshotDirectory, "database.sqlite");
  try {
    assertDatabase(resource.sqlite);
    const audit = auditStorage(resource.sqlite, resource.paths);
    if (!audit.ok) throw new BackupError("canonical source storage audit failed", "canonical_backup_source_integrity");
    options.fault?.("before-sqlite-snapshot");
    const snapshotDeadline = Date.now() + SQLITE_SNAPSHOT_TIMEOUT_MS;
    await resource.sqlite.backup(snapshotPath, {
      progress: () => {
        if (Date.now() > snapshotDeadline) throw new BackupError("canonical SQLite snapshot exceeded its time bound", "canonical_backup_snapshot_timeout", 503);
        return 100;
      }
    });
    options.fault?.("after-sqlite-snapshot");
    const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      assertDatabase(snapshot);
      const identity = sha256File(snapshotPath);
      const capturedRoot = path.join(snapshotDirectory, "captured");
      captureReferencedFiles(snapshot, sourceRoot, capturedRoot, limitValue.maxEntryBytes);
      const built = buildInventory(resource, snapshot, backupId, capturedRoot, limitValue.maxEntryBytes, options.fault);
      const databaseEntry: ArchiveEntrySource = { archivePath: "database.sqlite", sourcePath: snapshotPath, ...identity };
      const allInventory = [{ archivePath: "database.sqlite", sourceKey: "store.sqlite", kind: "sqlite_snapshot" as const, sizeBytes: identity.sizeBytes, sha256: identity.sha256, classification: "required" as const }, ...built.inventory];
      const expanded = allInventory.reduce((total, item) => total + item.sizeBytes, 0);
      if (expanded > limitValue.maxExpandedBytes) throw new BackupError("canonical backup expanded size is too large", "canonical_backup_expanded_too_large");
      const archiveInventorySha256 = hashText(canonicalJson(allInventory));
      const schema = schemaFingerprint(snapshot);
      const payloadEntries = [databaseEntry, ...built.entries];
      let predictedArchiveBytes = 0;
      let base: Omit<CanonicalBackupManifest, "canonical_manifest_sha256">;
      let manifestHash = "";
      let manifestBytes = Buffer.alloc(0);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        base = {
        abi: CANONICAL_BACKUP_ABI, format_version: CANONICAL_BACKUP_VERSION, application: "prg32-cartridge-store", backup_id: backupId, created_at: new Date().toISOString(),
        snapshot: { identity: hashText(`${backupId}:${identity.sha256}`), database: "database.sqlite", size_bytes: identity.sizeBytes, sha256: identity.sha256 }, versions: TARGET_VERSION_TUPLE,
        schema, inventory: allInventory, object_count: built.inventory.filter((item) => item.kind === "object").length, object_kinds: built.objectKinds,
        staging_count: built.stagingCount, recovery_required: built.recoveryRequired, required_recovery_material: built.recoveryMaterial, aggregate_bytes: { expanded, archive: predictedArchiveBytes }, archive_inventory_sha256: archiveInventorySha256,
        verification_state: built.recoveryRequired ? "recovery_required" : "complete"
        };
        manifestHash = hashText(manifestPayload(base));
        const manifest: CanonicalBackupManifest = { ...base, canonical_manifest_sha256: manifestHash };
        manifestBytes = Buffer.from(`${canonicalJson(manifest)}\n`, "utf8");
        const nextPredicted = predictedZipBytes(payloadEntries, manifestBytes);
        if (nextPredicted === predictedArchiveBytes) break;
        predictedArchiveBytes = nextPredicted;
      }
      const finalManifest: CanonicalBackupManifest = { ...base!, canonical_manifest_sha256: manifestHash };
      if (manifestBytes.byteLength > limitValue.maxManifestBytes) throw new BackupError("canonical backup manifest is too large", "canonical_backup_manifest_too_large");
      const archive = writeZipArchive(outputPath, payloadEntries, manifestBytes, manifestHash, limitValue, options.fault);
      if (archive.archiveBytes > limitValue.maxArchiveBytes) throw new BackupError("canonical backup archive is too large", "canonical_backup_archive_too_large");
      const verification = verifyCanonicalBackup(outputPath, { limits: limitValue });
      const marker = `${outputPath}.complete.json`;
      writeDurable(marker, `${canonicalJson({ abi: CANONICAL_BACKUP_ABI, backup_id: backupId, archive_sha256: verification.archiveSha256, archive_bytes: verification.archiveBytes, completed_at: new Date().toISOString() })}\n`);
      return { backupId, archivePath: outputPath, completionMarker: marker, archiveSha256: verification.archiveSha256, archiveBytes: verification.archiveBytes, manifest: finalManifest };
    } finally { snapshot.close(); }
  } catch (error) {
    try { if (fs.existsSync(outputPath) && !fs.existsSync(`${outputPath}.complete.json`)) fs.renameSync(outputPath, `${outputPath}.incomplete-${crypto.randomUUID()}`); } catch { /* quarantine is best effort */ }
    if (error instanceof BackupError) throw error;
    throw new BackupError("canonical backup creation failed", "canonical_backup_failed", 500, { cause: error });
  } finally { resource.close(); fs.rmSync(snapshotDirectory, { recursive: true, force: true }); }
}

export function restoreCanonicalBackup(options: CanonicalRestoreOptions): CanonicalRestoreResult {
  if (options.authorization !== CANONICAL_BACKUP_AUTHORIZATION) throw new BackupError("explicit disposable restore authorization is required", "canonical_backup_authorization_required", 403);
  const archivePath = resolved(options.archivePath, "archive path");
  const targetRoot = resolved(options.targetRoot, "target root");
  if (!isDisposablePath(targetRoot)) throw new BackupError("canonical restore target must be disposable", "canonical_restore_target_not_disposable", 403);
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length > 0) throw new BackupError("canonical restore target must be a new empty root", "canonical_restore_conflict", 409);
  const limitValue = limits(options.limits);
  const verified = verifyCanonicalBackup(archivePath, { limits: limitValue });
  const operationId = crypto.randomUUID();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-storage-v2-restore-"));
  let resource: StorageDatabase | undefined;
  try {
    options.fault?.("before-target-initialization");
    const initialized = initializeDisposableStorage(targetRoot);
    resource = initialized;
    const targetPaths = initialized.paths;
    writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "preparing", updated_at: new Date().toISOString() });
    resource.close(); resource = undefined;
    const extracted = extractZipArchive(archivePath, temporary, backendConfig(limitValue));
    fs.rmSync(path.join(targetRoot, "store.sqlite"), { force: true });
    promoteRestoredDatabase(extracted.databasePath, path.join(targetRoot, "store.sqlite"));
    const originalDatabaseIdentity = sha256File(targetPaths.databasePath);
    if (originalDatabaseIdentity.sha256 !== verified.manifest.snapshot.sha256) throw new BackupError("restored SQLite snapshot differs from backup", "canonical_restore_database_mismatch");
    writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "restoring_database", updated_at: new Date().toISOString() });
    const restoredDb = new Database(path.join(targetRoot, "store.sqlite"));
    restoredDb.pragma("foreign_keys = ON");
    restoredDb.prepare("UPDATE storage_metadata SET state = 'recovery_required', updated_at = ? WHERE singleton_id = 1").run(new Date().toISOString());
    restoredDb.close();
    options.fault?.("after-sqlite-restore");
    writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "restoring_objects", updated_at: new Date().toISOString() });
    options.fault?.("during-object-extraction");
    writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "restoring_staging", updated_at: new Date().toISOString() });
    options.fault?.("during-staging-restoration");
    writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "restoring_journals", updated_at: new Date().toISOString() });
    options.fault?.("during-journal-restoration");
    copyExtractedData(extracted.dataPath, targetRoot, options.fault);
    writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "verifying", updated_at: new Date().toISOString() });
    const state = verified.manifest.recovery_required ? "recovery_required" : "completed";
    const restored = new Database(path.join(targetRoot, "store.sqlite"));
    restored.pragma("foreign_keys = ON");
    try {
      const databaseIdentity = originalDatabaseIdentity;
      const audit = auditStorage(restored, targetPaths);
      if (audit.findings.some((finding) => finding.severity === "error" && finding.code !== "schema_initialization_incomplete")) throw new BackupError("restored canonical storage audit failed", "canonical_restore_integrity");
      options.fault?.("before-final-integrity-verification");
      options.fault?.("after-verification-before-completion");
      if (state === "completed") restored.prepare("UPDATE storage_metadata SET state = 'ready', updated_at = ? WHERE singleton_id = 1").run(new Date().toISOString());
      const finalAudit = auditStorage(restored, targetPaths);
      if (state === "completed" && !finalAudit.ok) throw new BackupError("restored canonical storage failed final audit", "canonical_restore_integrity");
      const report: CanonicalRestoreReport = { databaseSha256: databaseIdentity.sha256, inventoryEntries: verified.manifest.inventory.length, objectsVerified: verified.manifest.object_count, stagingEntries: verified.manifest.staging_count, recoveryMaterialEntries: verified.manifest.required_recovery_material.length, integrity: finalAudit, databaseFingerprint: schemaFingerprint(restored).fingerprint };
      writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state, updated_at: new Date().toISOString() });
      return { backupId: verified.manifest.backup_id, targetRoot, state, operationId, report };
    } finally { restored.close(); }
  } catch (error) {
    if (fs.existsSync(targetRoot)) {
      try { writeState(targetRoot, { abi: CANONICAL_BACKUP_ABI, operation_id: operationId, backup_id: verified.manifest.backup_id, archive_sha256: verified.archiveSha256, state: "recovery_required", updated_at: new Date().toISOString(), error_code: error instanceof BackupError ? error.code : "canonical_restore_failed" }); } catch { /* preserve original error */ }
    }
    if (error instanceof BackupError) throw error;
    throw new BackupError("canonical restore failed", "canonical_restore_failed", 500, { cause: error });
  } finally { resource?.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function assertRestoreTargetNotReady(root: string): void {
  const statePath = path.join(resolved(root, "target root"), RESTORE_STATE_FILE);
  if (fs.existsSync(statePath)) throw new BackupError("canonical restore target has an incomplete or completed restore journal", "canonical_restore_target_not_ready", 409);
}
