import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { extractZipArchive } from "../backup/archive.js";
import { BackupError } from "../backup/format.js";
import { auditStorage } from "./integrity.js";
import { initializeDisposableStorage, isDisposablePath, openTargetStorage } from "./database.js";
import { TARGET_VERSION_TUPLE } from "./schema.js";
import type { StorageDatabase } from "./types.js";
import {
  predictedCanonicalZipBytes,
  writeCanonicalZipArchive,
  type ArchiveEntrySource,
} from "./backup-archive.js";
import {
  CANONICAL_BACKUP_ABI,
  CANONICAL_BACKUP_AUTHORIZATION,
  CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION,
  CANONICAL_BACKUP_VERSION,
  DEFAULT_CANONICAL_BACKUP_LIMITS,
  type CanonicalBackupLimits,
  type CanonicalBackupManifest,
  type CanonicalBackupOptions,
  type CanonicalBackupResult,
  type CanonicalBackupSnapshotMode,
  type CanonicalRestoreOptions,
  type CanonicalRestoreReport,
  type CanonicalRestoreResult,
} from "./backup-contracts.js";
import {
  copyExtractedData,
  promoteRestoredDatabase,
  restoreStatePath,
  writeDurable,
  writeRestoreState as writeState,
} from "./backup-restore-io.js";
import {
  manifestPayload,
  verifyCanonicalBackup as verifyBackupArchive,
} from "./backup-verification.js";
import {
  assertDatabase,
  canonicalJson,
  hashText,
  schemaFingerprint,
  sha256File,
} from "./backup-validation.js";
import { captureReferencedFiles } from "./backup-files.js";
import { buildBackupInventory } from "./backup-inventory.js";

export {
  CANONICAL_BACKUP_ABI,
  CANONICAL_BACKUP_AUTHORIZATION,
  CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION,
  CANONICAL_BACKUP_VERSION,
  DEFAULT_CANONICAL_BACKUP_LIMITS,
} from "./backup-contracts.js";
export type {
  CanonicalBackupFaultPoint,
  CanonicalBackupInventoryEntry,
  CanonicalBackupLimits,
  CanonicalBackupManifest,
  CanonicalBackupOptions,
  CanonicalBackupResult,
  CanonicalBackupSnapshotMode,
  CanonicalRestoreFaultPoint,
  CanonicalRestoreOptions,
  CanonicalRestoreReport,
  CanonicalRestoreResult,
} from "./backup-contracts.js";

const SQLITE_SNAPSHOT_TIMEOUT_MS = 5 * 60 * 1000;

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

function backendConfig(limitsValue: CanonicalBackupLimits): BackendConfig {
  return { backupMaxArchiveBytes: limitsValue.maxArchiveBytes, backupMaxExpandedBytes: limitsValue.maxExpandedBytes, backupMaxEntryBytes: limitsValue.maxEntryBytes, backupMaxManifestBytes: limitsValue.maxManifestBytes, backupMaxEntries: limitsValue.maxEntries, backupMaxPathBytes: limitsValue.maxPathBytes, backupMaxPathDepth: limitsValue.maxPathDepth, backupMaxCompressionRatio: limitsValue.maxCompressionRatio } as BackendConfig;
}

export function verifyCanonicalBackup(archivePathValue: string, options: { readonly limits?: Partial<CanonicalBackupLimits> } = {}): { readonly manifest: CanonicalBackupManifest; readonly archiveSha256: string; readonly archiveBytes: number } {
  return verifyBackupArchive(archivePathValue, options);
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
      const inventoryOptions = {
        snapshot,
        sourceRoot: capturedRoot,
        maxEntryBytes: limitValue.maxEntryBytes,
        ...(options.fault ? { fault: options.fault } : {}),
      };
      const built = buildBackupInventory(inventoryOptions);
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
        const nextPredicted = predictedCanonicalZipBytes(
          payloadEntries,
          manifestBytes,
        );
        if (nextPredicted === predictedArchiveBytes) break;
        predictedArchiveBytes = nextPredicted;
      }
      const finalManifest: CanonicalBackupManifest = { ...base!, canonical_manifest_sha256: manifestHash };
      if (manifestBytes.byteLength > limitValue.maxManifestBytes) throw new BackupError("canonical backup manifest is too large", "canonical_backup_manifest_too_large");
      const archive = writeCanonicalZipArchive(
        outputPath,
        payloadEntries,
        manifestBytes,
        manifestHash,
        limitValue,
        options.fault,
      );
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
  const statePath = restoreStatePath(resolved(root, "target root"));
  if (fs.existsSync(statePath)) throw new BackupError("canonical restore target has an incomplete or completed restore journal", "canonical_restore_target_not_ready", 409);
}
