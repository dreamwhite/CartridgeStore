import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { BackendConfig } from "../config/env.js";
import { extractZipArchive, scanZipArchive } from "../backup/archive.js";
import { BackupError } from "../backup/format.js";
import { auditStorage } from "./integrity.js";
import { openTargetStorage } from "./database.js";
import {
  CANONICAL_BACKUP_ABI,
  CANONICAL_BACKUP_VERSION,
  DEFAULT_CANONICAL_BACKUP_LIMITS,
  type CanonicalBackupLimits,
  type CanonicalBackupManifest,
} from "./backup-contracts.js";
import { copyExtractedData } from "./backup-restore-io.js";
import {
  assertDatabase,
  canonicalJson,
  hashText,
  sha256File,
} from "./backup-validation.js";
import { TARGET_VERSION_TUPLE } from "./schema.js";
import type { ObjectKind } from "./types.js";

function resolved(value: string, label: string): string {
  if (!value || value.trim() === "") {
    throw new BackupError(
      `${label} is required`,
      "canonical_backup_path_required",
    );
  }
  const result = path.resolve(value);
  if (result === path.parse(result).root) {
    throw new BackupError(
      `${label} may not be the filesystem root`,
      "canonical_backup_path_unsafe",
    );
  }
  return result;
}

/** Serializes the manifest payload before its canonical hash is added. */
export function manifestPayload(
  manifest: Omit<CanonicalBackupManifest, "canonical_manifest_sha256">,
): string {
  return `${canonicalJson(manifest)}\n`;
}

function limits(
  value?: Partial<CanonicalBackupLimits>,
): CanonicalBackupLimits {
  const result = { ...DEFAULT_CANONICAL_BACKUP_LIMITS, ...value };
  for (const [key, numberValue] of Object.entries(result)) {
    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
      throw new BackupError(
        `canonical backup limit ${key} is invalid`,
        "canonical_backup_limit_invalid",
      );
    }
  }
  return result;
}

function backendConfig(limitsValue: CanonicalBackupLimits): BackendConfig {
  return {
    backupMaxArchiveBytes: limitsValue.maxArchiveBytes,
    backupMaxExpandedBytes: limitsValue.maxExpandedBytes,
    backupMaxEntryBytes: limitsValue.maxEntryBytes,
    backupMaxManifestBytes: limitsValue.maxManifestBytes,
    backupMaxEntries: limitsValue.maxEntries,
    backupMaxPathBytes: limitsValue.maxPathBytes,
    backupMaxPathDepth: limitsValue.maxPathDepth,
    backupMaxCompressionRatio: limitsValue.maxCompressionRatio,
  } as BackendConfig;
}

function readManifest(
  extractedPath: string,
  limitValue: CanonicalBackupLimits,
): { readonly manifest: CanonicalBackupManifest; readonly bytes: Buffer } {
  const bytes = fs.readFileSync(extractedPath);
  if (bytes.byteLength > limitValue.maxManifestBytes) {
    throw new BackupError(
      "canonical backup manifest is too large",
      "canonical_backup_manifest_too_large",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new BackupError(
      "canonical backup manifest is invalid",
      "canonical_backup_manifest_invalid",
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BackupError(
      "canonical backup manifest is invalid",
      "canonical_backup_manifest_invalid",
    );
  }
  const manifest = value as Partial<CanonicalBackupManifest>;
  if (
    manifest.abi !== CANONICAL_BACKUP_ABI ||
    manifest.format_version !== CANONICAL_BACKUP_VERSION ||
    manifest.application !== "prg32-cartridge-store" ||
    typeof manifest.backup_id !== "string" ||
    !manifest.snapshot ||
    !manifest.versions ||
    !Array.isArray(manifest.inventory) ||
    typeof manifest.canonical_manifest_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(manifest.canonical_manifest_sha256)
  ) {
    throw new BackupError(
      "canonical backup manifest is incompatible",
      "canonical_backup_manifest_incompatible",
    );
  }
  if (
    manifest.versions.schemaVersion !== TARGET_VERSION_TUPLE.schemaVersion ||
    manifest.versions.storageLayoutVersion !==
      TARGET_VERSION_TUPLE.storageLayoutVersion ||
    manifest.versions.publicationJournalVersion !==
      TARGET_VERSION_TUPLE.publicationJournalVersion ||
    manifest.versions.backupFormatVersion !==
      TARGET_VERSION_TUPLE.backupFormatVersion
  ) {
    throw new BackupError(
      "canonical backup version tuple is incompatible",
      "canonical_backup_version_incompatible",
    );
  }
  const parsedManifest = manifest as CanonicalBackupManifest;
  const withoutHash = JSON.parse(JSON.stringify(parsedManifest)) as Record<
    string,
    unknown
  >;
  delete withoutHash.canonical_manifest_sha256;
  if (
    hashText(
      manifestPayload(
        withoutHash as Omit<
          CanonicalBackupManifest,
          "canonical_manifest_sha256"
        >,
      ),
    ) !== parsedManifest.canonical_manifest_sha256
  ) {
    throw new BackupError(
      "canonical backup manifest hash is invalid",
      "canonical_backup_manifest_tampered",
    );
  }
  return { manifest: parsedManifest, bytes };
}

function prepareVerificationRoot(
  extracted: ReturnType<typeof extractZipArchive>,
): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prg32-backup-verify-"),
  );
  for (const relative of [
    "storage/objects/artifacts",
    "storage/objects/media",
    "storage/objects/site-assets",
    "storage/objects/.tmp",
    "storage/staging/submissions",
    "storage/staging/operations",
    "storage/quarantine",
    "journal/publications",
    "backups",
    "compatibility",
  ]) {
    fs.mkdirSync(path.join(root, relative), {
      recursive: true,
      mode: 0o700,
    });
  }
  fs.copyFileSync(extracted.databasePath, path.join(root, "store.sqlite"));
  copyExtractedData(extracted.dataPath, root);
  return root;
}

/** Verifies a canonical backup archive and its SQLite/object inventory. */
export function verifyCanonicalBackup(
  archivePathValue: string,
  options: { readonly limits?: Partial<CanonicalBackupLimits> } = {},
): {
  readonly manifest: CanonicalBackupManifest;
  readonly archiveSha256: string;
  readonly archiveBytes: number;
} {
  const archivePath = resolved(archivePathValue, "archive path");
  const limitValue = limits(options.limits);
  const config = backendConfig(limitValue);
  scanZipArchive(archivePath, config);
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "prg32-backup-verify-"),
  );
  try {
    const extracted = extractZipArchive(archivePath, temporary, config);
    const names = [...extracted.entries.values()]
      .filter((entry) => !entry.directory)
      .map((entry) => entry.name)
      .sort();
    if (
      !names.includes("manifest.json") ||
      !names.includes("manifest.sha256") ||
      !names.includes("database.sqlite")
    ) {
      throw new BackupError(
        "canonical backup required entry is missing",
        "canonical_backup_required_file_missing",
      );
    }
    const parsed = readManifest(extracted.manifestPath, limitValue);
    const sidecar = fs
      .readFileSync(path.join(temporary, "manifest.sha256"), "utf8")
      .trim();
    if (sidecar !== parsed.manifest.canonical_manifest_sha256) {
      throw new BackupError(
        "canonical backup manifest sidecar is invalid",
        "canonical_backup_manifest_tampered",
      );
    }
    const inventory = parsed.manifest.inventory;
    const objectIds = new Set<string>();
    const objectKinds: Record<ObjectKind, number> = {
      artifact: 0,
      media: 0,
      site_asset: 0,
    };
    for (const item of inventory.filter((entry) => entry.kind === "object")) {
      if (
        !item.objectId ||
        !item.objectKind ||
        objectIds.has(item.objectId)
      ) {
        throw new BackupError(
          "canonical backup contains duplicate object identities",
          "canonical_backup_duplicate_identity",
        );
      }
      objectIds.add(item.objectId);
      objectKinds[item.objectKind] += 1;
    }
    if (
      objectIds.size !== parsed.manifest.object_count ||
      JSON.stringify(objectKinds) !==
        JSON.stringify(parsed.manifest.object_kinds)
    ) {
      throw new BackupError(
        "canonical backup object inventory is inconsistent",
        "canonical_backup_inventory_mismatch",
      );
    }
    const expected = new Set([
      "manifest.json",
      "manifest.sha256",
      ...inventory.map((item) => item.archivePath),
    ]);
    if (
      expected.size !== names.length ||
      names.some((name) => !expected.has(name))
    ) {
      throw new BackupError(
        "canonical backup archive inventory differs from its manifest",
        "canonical_backup_inventory_mismatch",
      );
    }
    const databaseIdentity = sha256File(extracted.databasePath);
    if (
      databaseIdentity.sizeBytes !== parsed.manifest.snapshot.size_bytes ||
      databaseIdentity.sha256 !== parsed.manifest.snapshot.sha256
    ) {
      throw new BackupError(
        "canonical backup SQLite snapshot is corrupt",
        "canonical_backup_database_integrity",
      );
    }
    if (
      hashText(canonicalJson(inventory)) !==
      parsed.manifest.archive_inventory_sha256
    ) {
      throw new BackupError(
        "canonical backup inventory hash is invalid",
        "canonical_backup_inventory_mismatch",
      );
    }
    const verificationRoot = prepareVerificationRoot(extracted);
    try {
      const resource = openTargetStorage(verificationRoot, "read-only");
      try {
        assertDatabase(resource.sqlite, parsed.manifest.recovery_required);
        const audit = auditStorage(resource.sqlite, resource.paths);
        if (!audit.ok && !parsed.manifest.recovery_required) {
          throw new BackupError(
            "canonical backup storage audit failed",
            "canonical_backup_storage_integrity",
          );
        }
        const databaseObjects = resource.sqlite
          .prepare(
            "SELECT object_id, object_kind, storage_key, sha256, size_bytes " +
              "FROM storage_objects ORDER BY object_id",
          )
          .all() as Array<Record<string, unknown>>;
        const manifestObjects = inventory.filter(
          (item) => item.kind === "object",
        );
        if (databaseObjects.length !== manifestObjects.length) {
          throw new BackupError(
            "canonical backup object inventory does not match SQLite",
            "canonical_backup_inventory_mismatch",
          );
        }
        for (const row of databaseObjects) {
          const item = manifestObjects.find(
            (candidate) => candidate.objectId === String(row.object_id),
          );
          if (
            !item ||
            item.objectKind !== row.object_kind ||
            item.storageKey !== row.storage_key ||
            item.sha256 !== row.sha256 ||
            item.sizeBytes !== Number(row.size_bytes)
          ) {
            throw new BackupError(
              "canonical backup object identity does not match SQLite",
              "canonical_backup_inventory_mismatch",
            );
          }
        }
        const databaseStaging = resource.sqlite
          .prepare(
            "SELECT staging_key, sha256, size_bytes " +
              "FROM submission_artifacts " +
              "WHERE validation_state IN ('staged', 'validated') " +
              "ORDER BY submission_artifact_id",
          )
          .all() as Array<Record<string, unknown>>;
        const manifestStaging = inventory.filter(
          (item) => item.kind === "submission_staging",
        );
        if (databaseStaging.length !== manifestStaging.length) {
          throw new BackupError(
            "canonical backup staging inventory does not match SQLite",
            "canonical_backup_inventory_mismatch",
          );
        }
        for (const row of databaseStaging) {
          const item = manifestStaging.find(
            (candidate) => candidate.sourceKey === String(row.staging_key),
          );
          if (
            !item ||
            item.sha256 !== row.sha256 ||
            item.sizeBytes !== Number(row.size_bytes)
          ) {
            throw new BackupError(
              "canonical backup staging identity does not match SQLite",
              "canonical_backup_inventory_mismatch",
            );
          }
        }
      } finally {
        resource.close();
      }
    } finally {
      fs.rmSync(verificationRoot, { recursive: true, force: true });
    }
    for (const item of inventory) {
      const candidate =
        item.archivePath === "database.sqlite"
          ? extracted.databasePath
          : path.join(temporary, item.archivePath);
      const identity = sha256File(candidate);
      if (
        identity.sizeBytes !== item.sizeBytes ||
        identity.sha256 !== item.sha256
      ) {
        throw new BackupError(
          "canonical backup inventory checksum mismatch",
          "canonical_backup_inventory_mismatch",
        );
      }
    }
    const archiveBytes = fs.statSync(archivePath).size;
    if (parsed.manifest.aggregate_bytes.archive !== archiveBytes) {
      throw new BackupError(
        "canonical backup archive size is inconsistent",
        "canonical_backup_inventory_mismatch",
      );
    }
    return {
      manifest: parsed.manifest,
      archiveSha256: sha256File(archivePath).sha256,
      archiveBytes,
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
