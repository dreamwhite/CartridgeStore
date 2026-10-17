import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { safeGameId, safeVersion } from "../catalog/catalog.js";
import { encodePythonJson } from "../compatibility/serialization.js";
import {
  normalizeArchitecture,
  validateCartridgeBinary,
  type parseCartridge,
} from "../submission/prg32.js";
import {
  applyReviewMetadata,
  catalogColophon,
  fail,
  imageMime,
  isoNow,
  object,
  parseArchitectures,
  parseObjectJson,
  parseOperation,
  reviewedImage,
  serializeJson,
  sha256,
} from "./publication-codecs.js";
import {
  type CatalogMutationAction,
  type CatalogMutationOptions,
  type FaultPoint,
  type PublicationConsistencyOptions,
  type PublicationOperation,
  type PublicationReviewOptions,
  type PublicationState,
  type PublicationVariantPlan,
  type ReconciliationReport,
} from "./publication-contracts.js";
import {
  assertInside,
  assertNoSymlinkComponents,
  assertSafeRelative,
  ensureDirectory,
  listDirectories,
  readBounded,
  readJsonFile,
  sha256File,
  withPublicationLock,
  writeAtomic
} from "./publication-files.js";
import { reconcilePublication } from "./reconciliation.js";
import {
  indexForCatalogMutation,
  indexForPublication,
  loadPublicationIndex,
  PUBLICATION_INDEX_MAX_BYTES,
} from "./publication-index.js";

export { applyReviewMetadata } from "./publication-codecs.js";
export {
  PUBLICATION_STATES,
  REVIEW_EDITABLE_METADATA_FIELDS,
} from "./publication-contracts.js";
export type {
  CatalogMutationAction,
  CatalogMutationOptions,
  FaultPoint,
  PublicationConsistencyOptions,
  PublicationOperation,
  PublicationOperationKind,
  PublicationReviewOptions,
  PublicationState,
  PublicationVariantPlan,
  ReconciliationClassification,
  ReconciliationFinding,
  ReconciliationReport,
} from "./publication-contracts.js";

interface SubmissionRow {
  readonly id: number;
  readonly game_id: string;
  readonly version: string;
  readonly status: string;
  readonly pending_dir: string;
  readonly metadata_json: string;
  readonly architectures_json: string;
}

const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_CARTRIDGE_BYTES = 128 * 1024 * 1024;
const LOCK_FILE = "publication.lock";
const JOURNAL_ROOT = "publication-operations";
const STAGING_ROOT = "publication-staging";
const BACKUP_ROOT = "publication-backups";
const PENDING_ROOT = "pending";
const CARTRIDGE_ROOT = "cartridges";

export class PublicationConsistencyService {
  readonly root: string;
  private readonly database: Database.Database;
  private readonly journalRoot: string;
  private readonly stagingRoot: string;
  private readonly backupRoot: string;
  private readonly lockPath: string;

  constructor(options: PublicationConsistencyOptions) {
    this.root = path.resolve(options.root);
    this.database = options.database;
    if (!fs.existsSync(this.root) || !fs.lstatSync(this.root).isDirectory() || fs.lstatSync(this.root).isSymbolicLink()) fail("publication root must be a regular directory", "unsafe_publication_root");
    this.journalRoot = ensureDirectory(this.root, JOURNAL_ROOT);
    this.stagingRoot = ensureDirectory(this.root, STAGING_ROOT);
    this.backupRoot = ensureDirectory(this.root, BACKUP_ROOT);
    this.lockPath = path.join(this.root, LOCK_FILE);
    this.fault = options.fault;
  }

  private readonly fault: ((point: FaultPoint) => void) | undefined;

  private hit(point: FaultPoint): void { this.fault?.(point); }

  private operationPath(operationId: string): string {
    if (!/^pub-[a-f0-9-]{16,80}$/.test(operationId)) fail("operation ID is unsafe", "unsafe_publication_path");
    return path.join(JOURNAL_ROOT, operationId, "operation.json");
  }

  private readOperation(operationId: string): PublicationOperation {
    return parseOperation(readJsonFile(this.root, this.operationPath(operationId), MAX_JOURNAL_BYTES, "journal_corrupt"));
  }

  private writeOperation(operation: PublicationOperation): PublicationOperation {
    const updated = { ...operation, updatedAt: isoNow() } as PublicationOperation;
    writeAtomic(this.root, this.operationPath(operation.operationId), serializeJson(updated));
    return updated;
  }

  private transition(operation: PublicationOperation, state: PublicationState, error?: { code: string; message: string }): PublicationOperation {
    const next = { ...operation, state, ...(error ? { error } : {}) } as PublicationOperation;
    return this.writeOperation(next);
  }

  private withLock<T>(callback: () => T): T { return withPublicationLock(this.lockPath, callback); }

  private pendingRow(submissionId: number): SubmissionRow {
    const row = this.database.prepare("SELECT id, game_id, version, status, pending_dir, metadata_json, architectures_json FROM cartridge_submissions WHERE id = ?").get(submissionId) as SubmissionRow | undefined;
    if (!row) fail("submission not found", "submission_not_found");
    return row;
  }

  prepare(submissionId: number, options: PublicationReviewOptions = {}): PublicationOperation {
    return this.withLock(() => this.prepareUnlocked(submissionId, options));
  }

  publish(submissionId: number, options: PublicationReviewOptions = {}): PublicationOperation {
    return this.withLock(() => this.executeUnlocked(this.prepareUnlocked(submissionId, options)));
  }

  prepareCatalog(options: CatalogMutationOptions): PublicationOperation {
    return this.withLock(() => this.prepareCatalogUnlocked(options));
  }

  mutateCatalog(options: CatalogMutationOptions): PublicationOperation {
    return this.withLock(() => this.executeUnlocked(this.prepareCatalogUnlocked(options)));
  }

  runSerialized<T>(callback: () => T): T {
    return this.withLock(callback);
  }

  private prepareUnlocked(submissionId: number, options: PublicationReviewOptions): PublicationOperation {
      const row = this.pendingRow(submissionId);
      if (row.status !== "pending") fail("submission is not pending", "invalid_submission_state");
      const metadata = parseObjectJson(row.metadata_json, "submission metadata");
      const reviewedMetadata = options.metadata ? applyReviewMetadata(metadata, options.metadata) : undefined;
      if (options.reviewer && (!Number.isSafeInteger(options.reviewer.id) || options.reviewer.id <= 0 || !options.reviewer.name.trim())) {
        fail("reviewer identity is invalid", "review_authorization_invalid");
      }
      const metadataId = typeof metadata.id === "string" ? metadata.id : row.game_id;
      const metadataVersion = typeof metadata.version === "string" ? metadata.version : row.version;
      const gameId = safeGameId(metadataId);
      const version = safeVersion(metadataVersion);
      if (gameId !== row.game_id || version !== row.version) fail("submission identity does not match metadata", "submission_identity_mismatch");
      const pendingDir = assertSafeRelative(row.pending_dir, "pending directory");
      if (pendingDir !== `${PENDING_ROOT}/${submissionId}`) fail("submission pending directory is unsafe", "unsafe_publication_path");
      const architectures = parseArchitectures(row.architectures_json);
      if (architectures.length === 0) fail("submission has no architectures", "submission_metadata_corrupt");
      const seen = new Set<string>();
      const indexSource: Array<{ architecture: string; sourceRelative: string; image: Buffer; parsed: ReturnType<typeof parseCartridge> }> = [];
      for (const item of architectures) {
        const architecture = typeof item.architecture === "string" ? item.architecture : "";
        if (!architecture || seen.has(architecture)) fail("submission contains duplicate architectures", "submission_metadata_corrupt");
        seen.add(architecture);
        const sourceRelative = assertSafeRelative(typeof item.stored === "string" ? item.stored : "", "pending file");
        if (!sourceRelative.startsWith(`${pendingDir}/`) || !sourceRelative.endsWith(`/${architecture}.prg32`)) fail("pending file does not match the submission", "unsafe_publication_path");
        const sourcePath = assertInside(this.root, path.join(this.root, sourceRelative), "pending file");
        assertNoSymlinkComponents(this.root, sourcePath);
        if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) fail("pending cartridge file is missing", "pending_file_missing", { sourceRelative });
        const pendingImage = readBounded(sourcePath, MAX_CARTRIDGE_BYTES, "pending_file_too_large");
        const rebuilt = reviewedImage(pendingImage, architecture, reviewedMetadata);
        const image = rebuilt.image;
        const parsed = rebuilt.parsed;
        if (!parsed.metadata || parsed.metadata.id !== gameId || parsed.metadata.version !== version) fail("pending cartridge metadata does not match submission", "submission_identity_mismatch");
        indexSource.push({ architecture, sourceRelative, image, parsed });
      }
      this.hit("after-pending-validation");
      const loaded = loadPublicationIndex(this.root);
      const operationId = `pub-${crypto.randomUUID()}`;
      const createdAt = isoNow();
      const variants: PublicationVariantPlan[] = indexSource.map(({ architecture, sourceRelative, image, parsed }) => {
        const targetRelative = `${CARTRIDGE_ROOT}/${gameId}/${version}/${architecture}.prg32`;
        const backupRelative = `${BACKUP_ROOT}/${operationId}/${targetRelative}`;
        const targetPath = assertInside(this.root, path.join(this.root, targetRelative), "published file");
        let previousSha256: string | null = null;
        if (fs.existsSync(targetPath)) {
          assertNoSymlinkComponents(this.root, targetPath);
          if (!fs.lstatSync(targetPath).isFile()) fail("published target is not a regular file", "published_artifact_corrupt");
          previousSha256 = sha256File(targetPath);
        }
        return {
          architecture,
          sourceRelative,
          targetRelative,
          stagedRelative: `${STAGING_ROOT}/${operationId}/${targetRelative}`,
          backupRelative,
          expectedSha256: sha256(image),
          previousSha256,
          size: image.byteLength,
          metadata: parsed.metadata as Record<string, unknown>,
          colophon: parsed.colophon,
          iconMime: imageMime(parsed.icon),
          screenshotMime: imageMime(parsed.screenshot),
          hasScreenshot: parsed.screenshot !== null,
          hasSignature: parsed.blocks.some((block) => block.type === "SIGN")
        };
      });
      const expectedIndex = indexForPublication(
        loaded.index,
        gameId,
        version,
        variants,
        createdAt,
      );
      const expectedIndexBytes = serializeJson(expectedIndex);
      const operation: PublicationOperation = {
        journalVersion: 1,
        operationId,
        submissionId,
        gameId,
        version,
        variants,
        previousIndexSha256: loaded.hash,
        expectedIndexSha256: sha256(expectedIndexBytes),
        indexStagedRelative: `${STAGING_ROOT}/${operationId}/index.json`,
        indexBackupRelative: `${BACKUP_ROOT}/${operationId}/index.json`,
        state: "PREPARED",
        createdAt,
        updatedAt: createdAt,
        ...(reviewedMetadata ? { reviewedMetadata } : {}),
        ...(options.reviewer ? { reviewer: { id: options.reviewer.id, name: options.reviewer.name.trim() } } : {})
      };
      const written = this.writeOperation(operation);
      this.hit("after-operation-record");
      return written;
  }

  private prepareCatalogUnlocked(options: CatalogMutationOptions): PublicationOperation {
    const gameId = safeGameId(options.gameId);
    const version = safeVersion(options.version);
    const loaded = loadPublicationIndex(this.root);
    const games = object(loaded.index.games, "catalog index games is malformed");
    if (!Object.hasOwn(games, gameId)) fail("game not found", "catalog_not_found");
    const game = object(games[gameId], "game not found");
    const versions = object(game.versions, "catalog versions are malformed");
    if (!Object.hasOwn(versions, version)) fail("version not found", "catalog_not_found");
    const currentVersion = object(versions[version], "version not found");
    const architectures = object(currentVersion.architectures, "catalog architectures are malformed");
    const selected = options.architecture === undefined
      ? Object.keys(architectures).sort()
      : [normalizeArchitecture(options.architecture)];
    if (selected.length === 0) fail("version has no published architectures", "catalog_not_found");
    const operationId = `pub-${crypto.randomUUID()}`;
    const action: CatalogMutationAction = options.metadata === undefined ? "delete" : "update";
    const reviewedMetadata = action === "update"
      ? applyReviewMetadata(object(currentVersion.metadata, "catalog metadata is malformed"), options.metadata as Record<string, unknown>)
      : undefined;
    const variants: PublicationVariantPlan[] = [];
    for (const architecture of selected) {
      const rawVariant = architectures[architecture];
      const variant = object(rawVariant, "catalog variant is malformed");
      const filename = typeof variant.filename === "string" ? assertSafeRelative(variant.filename, "catalog file") : "";
      if (!filename.startsWith(`${CARTRIDGE_ROOT}/`)) fail("catalog file is outside the published root", "unsafe_publication_path");
      const target = assertInside(this.root, path.join(this.root, filename), "published file");
      assertNoSymlinkComponents(this.root, target);
      const stats = fs.lstatSync(target);
      if (!stats.isFile()) fail("published artifact is not a regular file", "published_artifact_corrupt");
      const source = readBounded(target, MAX_CARTRIDGE_BYTES, "published_file_corrupt");
      const original = validateCartridgeBinary(source);
      const image = action === "update"
        ? reviewedImage(source, architecture, reviewedMetadata, catalogColophon(original.colophon, reviewedMetadata as Record<string, unknown>))
        : { image: Buffer.from(source), parsed: original };
      variants.push({
        architecture,
        sourceRelative: filename,
        targetRelative: filename,
        stagedRelative: `${STAGING_ROOT}/${operationId}/${filename}`,
        backupRelative: `${BACKUP_ROOT}/${operationId}/${filename}`,
        expectedSha256: action === "update" ? sha256(image.image) : "",
        previousSha256: sha256(source),
        size: action === "update" ? image.image.byteLength : source.byteLength,
        metadata: (action === "update" ? image.parsed.metadata : original.metadata) ?? {},
        colophon: action === "update" ? image.parsed.colophon : original.colophon,
        iconMime: imageMime(image.parsed.icon),
        screenshotMime: imageMime(image.parsed.screenshot),
        hasScreenshot: image.parsed.screenshot !== null,
        hasSignature: image.parsed.blocks.some((block) => block.type === "SIGN")
      });
    }
    const createdAt = isoNow();
    const expectedIndex = indexForCatalogMutation(
      loaded.index,
      gameId,
      version,
      variants,
      action,
      createdAt,
    );
    const expectedIndexBytes = serializeJson(expectedIndex);
    const operation: PublicationOperation = {
      journalVersion: 1,
      operationKind: "catalog",
      catalogAction: action,
      operationId,
      submissionId: 0,
      gameId,
      version,
      variants,
      previousIndexSha256: loaded.hash,
      expectedIndexSha256: sha256(expectedIndexBytes),
      indexStagedRelative: `${STAGING_ROOT}/${operationId}/index.json`,
      indexBackupRelative: `${BACKUP_ROOT}/${operationId}/index.json`,
      state: "PREPARED",
      createdAt,
      updatedAt: createdAt,
      ...(reviewedMetadata ? { reviewedMetadata } : {})
    };
    const written = this.writeOperation(operation);
    this.hit("after-operation-record");
    return written;
  }

  stage(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "STAGED" || operation.state === "VERIFIED") return operation;
      if (operation.state !== "PREPARED") fail("operation cannot be staged from its current state", "invalid_operation_transition");
      const loaded = loadPublicationIndex(this.root);
      if (loaded.hash !== operation.previousIndexSha256) fail("catalog index changed after preparation", "publication_index_changed");
      for (const variant of operation.variants) {
        const sourcePath = assertInside(this.root, path.join(this.root, variant.sourceRelative), "pending file");
        const pendingImage = readBounded(sourcePath, MAX_CARTRIDGE_BYTES, "pending_file_too_large");
        const image = reviewedImage(pendingImage, variant.architecture, operation.reviewedMetadata).image;
        if (sha256(image) !== variant.expectedSha256) fail("pending file hash changed", "pending_hash_mismatch", variant);
        const stagePath = assertInside(this.root, path.join(this.root, variant.stagedRelative), "staged file");
        ensureDirectory(this.root, path.dirname(path.relative(this.root, stagePath)));
        writeAtomic(this.root, variant.stagedRelative, image);
      }
      const expectedIndex = indexForPublication(
        loaded.index,
        operation.gameId,
        operation.version,
        operation.variants,
        operation.createdAt,
      );
      const indexBytes = serializeJson(expectedIndex);
      if (sha256(indexBytes) !== operation.expectedIndexSha256) fail("planned index identity changed", "publication_plan_mismatch");
      this.hit("before-index-temp-write");
      writeAtomic(this.root, operation.indexStagedRelative, indexBytes);
      this.hit("after-index-temp-write");
      operation = this.transition(operation, "STAGED");
      this.hit("after-staging");
      return operation;
    });
  }

  verifyStaged(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "VERIFIED") return operation;
      if (operation.state !== "STAGED") fail("operation cannot be verified from its current state", "invalid_operation_transition");
      for (const variant of operation.variants) {
        const stagePath = assertInside(this.root, path.join(this.root, variant.stagedRelative), "staged file");
        const image = readBounded(stagePath, MAX_CARTRIDGE_BYTES, "staged_file_corrupt");
        if (sha256(image) !== variant.expectedSha256) fail("staged file hash mismatch", "staged_hash_mismatch", variant);
        validateCartridgeBinary(image);
      }
      const indexBytes = readBounded(assertInside(this.root, path.join(this.root, operation.indexStagedRelative), "staged index"), PUBLICATION_INDEX_MAX_BYTES, "staged_index_corrupt");
      if (sha256(indexBytes) !== operation.expectedIndexSha256) fail("staged index hash mismatch", "staged_index_mismatch");
      this.hit("after-staged-verification");
      operation = this.transition(operation, "VERIFIED");
      return operation;
    });
  }

  replaceFiles(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "FILES_REPLACED" || operation.state === "INDEX_REPLACED" || operation.state === "DATABASE_UPDATED" || operation.state === "COMPLETED") return operation;
      if (operation.state !== "VERIFIED") fail("files cannot be replaced from the current operation state", "invalid_operation_transition");
      for (const variant of operation.variants) {
        const target = assertInside(this.root, path.join(this.root, variant.targetRelative), "published target");
        ensureDirectory(this.root, path.dirname(path.relative(this.root, target)));
        const current = fs.existsSync(target) ? sha256File(target) : null;
        if (current === variant.expectedSha256) continue;
        if (current !== variant.previousSha256) fail("published target changed outside the operation", "publication_target_ambiguous", variant);
        if (variant.previousSha256 !== null) {
          const backup = assertInside(this.root, path.join(this.root, variant.backupRelative), "publication backup");
          if (!fs.existsSync(backup)) {
            ensureDirectory(this.root, path.dirname(path.relative(this.root, backup)));
            fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
            if (sha256File(backup) !== variant.previousSha256) fail("publication backup hash mismatch", "publication_backup_corrupt");
          }
        }
        this.hit("before-binary-replacement");
        const staged = assertInside(this.root, path.join(this.root, variant.stagedRelative), "staged file");
        if (!fs.existsSync(staged) || sha256File(staged) !== variant.expectedSha256) fail("staged file is unavailable for replacement", "staged_file_corrupt");
        fs.renameSync(staged, target);
        this.hit("after-binary-replacement");
        if (sha256File(target) !== variant.expectedSha256) fail("published file hash mismatch after replacement", "publication_hash_mismatch");
      }
      operation = this.transition(operation, "FILES_REPLACED");
      return operation;
    });
  }

  replaceIndex(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "INDEX_REPLACED" || operation.state === "DATABASE_UPDATED" || operation.state === "COMPLETED") return operation;
      if (operation.state !== "FILES_REPLACED") fail("index cannot be replaced from the current operation state", "invalid_operation_transition");
      const indexPath = path.join(this.root, "index.json");
      const current = fs.existsSync(indexPath) ? sha256File(indexPath) : null;
      if (current !== operation.expectedIndexSha256) {
        if (current !== operation.previousIndexSha256) fail("catalog index changed outside the operation", "publication_index_ambiguous");
        if (current !== null) {
          const backup = assertInside(this.root, path.join(this.root, operation.indexBackupRelative), "index backup");
          if (!fs.existsSync(backup)) {
            ensureDirectory(this.root, path.dirname(path.relative(this.root, backup)));
            fs.copyFileSync(indexPath, backup, fs.constants.COPYFILE_EXCL);
            if (sha256File(backup) !== operation.previousIndexSha256) fail("index backup hash mismatch", "publication_backup_corrupt");
          }
        }
        this.hit("before-index-replacement");
        const staged = assertInside(this.root, path.join(this.root, operation.indexStagedRelative), "staged index");
        if (!fs.existsSync(staged) || sha256File(staged) !== operation.expectedIndexSha256) fail("staged index is unavailable", "staged_index_corrupt");
        fs.renameSync(staged, indexPath);
        this.hit("after-index-replacement");
      }
      if (sha256File(indexPath) !== operation.expectedIndexSha256) fail("catalog index hash mismatch after replacement", "publication_index_mismatch");
      operation = this.transition(operation, "INDEX_REPLACED");
      return operation;
    });
  }

  updateDatabase(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "DATABASE_UPDATED" || operation.state === "COMPLETED") return operation;
      if (operation.state !== "INDEX_REPLACED") fail("database cannot be updated from the current operation state", "invalid_operation_transition");
      this.hit("before-database-update");
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const row = this.database.prepare("SELECT status FROM cartridge_submissions WHERE id = ?").get(operation.submissionId) as { status?: string } | undefined;
        if (!row) fail("submission disappeared during publication", "submission_not_found");
        if (row.status === "pending") {
          if (operation.reviewedMetadata && operation.reviewer) {
            this.database.prepare("UPDATE cartridge_submissions SET status = 'verified', metadata_json = ?, reviewed_by_user_id = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(encodePythonJson(operation.reviewedMetadata), operation.reviewer.id, operation.reviewer.name, operation.submissionId);
          } else {
            this.database.prepare("UPDATE cartridge_submissions SET status = 'verified', reviewed_by = 'publication-consistency', reviewed_at = datetime('now') WHERE id = ?").run(operation.submissionId);
          }
        } else if (row.status !== "verified") {
          fail("submission state changed outside the operation", "submission_state_ambiguous", row);
        }
        this.database.exec("COMMIT");
      } catch (error) {
        if (this.database.inTransaction) this.database.exec("ROLLBACK");
        throw error;
      }
      this.hit("after-database-update");
      operation = this.transition(operation, "DATABASE_UPDATED");
      return operation;
    });
  }

  complete(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "COMPLETED") {
        this.cleanupCompletedUnlocked(operation);
        return operation;
      }
      if (operation.state !== "DATABASE_UPDATED") fail("operation cannot complete from the current state", "invalid_operation_transition");
      this.hit("before-completion");
      operation = this.transition(operation, "COMPLETED");
      this.cleanupCompletedUnlocked(operation);
      this.hit("after-completion");
      return operation;
    });
  }

  execute(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "COMPLETED") {
        this.cleanupCompletedUnlocked(operation);
        return operation;
      }
      if (operation.state === "COMPENSATED") return operation;
      if (operation.state === "RECOVERY_REQUIRED" || operation.state === "FAILED") fail("operation requires explicit recovery", "recovery_required");
      if (operation.state === "PREPARED") { operation = this.stageUnlocked(operation); }
      if (operation.state === "STAGED") { operation = this.verifyUnlocked(operation); }
      if (operation.state === "VERIFIED") { operation = this.replaceFilesUnlocked(operation); }
      if (operation.state === "FILES_REPLACED") { operation = this.replaceIndexUnlocked(operation); }
      if (operation.state === "INDEX_REPLACED") { operation = this.updateDatabaseUnlocked(operation); }
      if (operation.state === "DATABASE_UPDATED") { operation = this.completeUnlocked(operation); }
      return operation;
    });
  }

  private stageUnlocked(operation: PublicationOperation): PublicationOperation {
    const loaded = loadPublicationIndex(this.root);
    if (loaded.hash !== operation.previousIndexSha256) fail("catalog index changed after preparation", "publication_index_changed");
    for (const variant of operation.variants) {
      if (operation.operationKind === "catalog" && operation.catalogAction === "delete") continue;
      const source = assertInside(this.root, path.join(this.root, variant.sourceRelative), "pending file");
      const pendingImage = readBounded(source, MAX_CARTRIDGE_BYTES, "pending_file_too_large");
      const original = validateCartridgeBinary(pendingImage);
      const colophon = operation.operationKind === "catalog" && operation.catalogAction === "update"
        ? catalogColophon(original.colophon, operation.reviewedMetadata as Record<string, unknown>)
        : undefined;
      const image = reviewedImage(pendingImage, variant.architecture, operation.reviewedMetadata, colophon).image;
      if (sha256(image) !== variant.expectedSha256) fail("pending file hash changed", "pending_hash_mismatch");
      writeAtomic(this.root, variant.stagedRelative, image);
    }
    const index = operation.operationKind === "catalog"
      ? indexForCatalogMutation(
          loaded.index,
          operation.gameId,
          operation.version,
          operation.variants,
          operation.catalogAction as CatalogMutationAction,
          operation.createdAt,
        )
      : indexForPublication(
          loaded.index,
          operation.gameId,
          operation.version,
          operation.variants,
          operation.createdAt,
        );
    const indexBytes = serializeJson(index);
    if (sha256(indexBytes) !== operation.expectedIndexSha256) fail("planned index identity changed", "publication_plan_mismatch");
    this.hit("before-index-temp-write");
    writeAtomic(this.root, operation.indexStagedRelative, indexBytes);
    this.hit("after-index-temp-write");
    operation = this.transition(operation, "STAGED");
    this.hit("after-staging");
    return operation;
  }

  private verifyUnlocked(operation: PublicationOperation): PublicationOperation {
    for (const variant of operation.variants) {
      if (operation.operationKind === "catalog" && operation.catalogAction === "delete") continue;
      const image = readBounded(assertInside(this.root, path.join(this.root, variant.stagedRelative), "staged file"), MAX_CARTRIDGE_BYTES, "staged_file_corrupt");
      if (sha256(image) !== variant.expectedSha256) fail("staged file hash mismatch", "staged_hash_mismatch");
      validateCartridgeBinary(image);
    }
    const index = readBounded(assertInside(this.root, path.join(this.root, operation.indexStagedRelative), "staged index"), PUBLICATION_INDEX_MAX_BYTES, "staged_index_corrupt");
    if (sha256(index) !== operation.expectedIndexSha256) fail("staged index hash mismatch", "staged_index_mismatch");
    this.hit("after-staged-verification");
    return this.transition(operation, "VERIFIED");
  }

  private replaceFilesUnlocked(operation: PublicationOperation): PublicationOperation {
    for (const variant of operation.variants) {
      const target = assertInside(this.root, path.join(this.root, variant.targetRelative), "published target");
      if (operation.operationKind === "catalog" && operation.catalogAction === "delete") {
        const current = fs.existsSync(target) ? sha256File(target) : null;
        if (current !== variant.previousSha256) fail("published target changed outside the operation", "publication_target_ambiguous");
        const backup = assertInside(this.root, path.join(this.root, variant.backupRelative), "publication backup");
        ensureDirectory(this.root, path.dirname(path.relative(this.root, backup)));
        if (!fs.existsSync(backup)) {
          fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
          if (sha256File(backup) !== variant.previousSha256) fail("publication backup hash mismatch", "publication_backup_corrupt");
        }
        this.hit("before-binary-replacement");
        fs.unlinkSync(target);
        this.hit("after-binary-replacement");
        continue;
      }
      ensureDirectory(this.root, path.dirname(path.relative(this.root, target)));
      const current = fs.existsSync(target) ? sha256File(target) : null;
      if (current === variant.expectedSha256) continue;
      if (current !== variant.previousSha256) fail("published target changed outside the operation", "publication_target_ambiguous");
      if (variant.previousSha256 !== null) {
        const backup = assertInside(this.root, path.join(this.root, variant.backupRelative), "publication backup");
        if (!fs.existsSync(backup)) { ensureDirectory(this.root, path.dirname(path.relative(this.root, backup))); fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL); }
      }
      this.hit("before-binary-replacement");
      fs.renameSync(assertInside(this.root, path.join(this.root, variant.stagedRelative), "staged file"), target);
      this.hit("after-binary-replacement");
      if (sha256File(target) !== variant.expectedSha256) fail("published file hash mismatch after replacement", "publication_hash_mismatch");
    }
    return this.transition(operation, "FILES_REPLACED");
  }

  private replaceIndexUnlocked(operation: PublicationOperation): PublicationOperation {
    const indexPath = path.join(this.root, "index.json");
    const current = fs.existsSync(indexPath) ? sha256File(indexPath) : null;
    if (current !== operation.expectedIndexSha256) {
      if (current !== operation.previousIndexSha256) fail("catalog index changed outside the operation", "publication_index_ambiguous");
      if (current !== null) {
        const backup = assertInside(this.root, path.join(this.root, operation.indexBackupRelative), "index backup");
        if (!fs.existsSync(backup)) { ensureDirectory(this.root, path.dirname(path.relative(this.root, backup))); fs.copyFileSync(indexPath, backup, fs.constants.COPYFILE_EXCL); }
      }
      this.hit("before-index-replacement");
      fs.renameSync(assertInside(this.root, path.join(this.root, operation.indexStagedRelative), "staged index"), indexPath);
      this.hit("after-index-replacement");
    }
    if (sha256File(indexPath) !== operation.expectedIndexSha256) fail("catalog index hash mismatch", "publication_index_mismatch");
    return this.transition(operation, "INDEX_REPLACED");
  }

  private updateDatabaseUnlocked(operation: PublicationOperation): PublicationOperation {
    this.hit("before-database-update");
    if (operation.operationKind === "catalog") return this.transition(operation, "DATABASE_UPDATED");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare("SELECT status FROM cartridge_submissions WHERE id = ?").get(operation.submissionId) as { status?: string } | undefined;
      if (!row) fail("submission disappeared during publication", "submission_not_found");
      if (row.status === "pending") {
        if (operation.reviewedMetadata && operation.reviewer) {
          this.database.prepare("UPDATE cartridge_submissions SET status = 'verified', metadata_json = ?, reviewed_by_user_id = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(encodePythonJson(operation.reviewedMetadata), operation.reviewer.id, operation.reviewer.name, operation.submissionId);
        } else {
          this.database.prepare("UPDATE cartridge_submissions SET status = 'verified', reviewed_by = 'publication-consistency', reviewed_at = datetime('now') WHERE id = ?").run(operation.submissionId);
        }
      }
      else if (row.status !== "verified") fail("submission state changed outside the operation", "submission_state_ambiguous");
      this.database.exec("COMMIT");
    } catch (error) { if (this.database.inTransaction) this.database.exec("ROLLBACK"); throw error; }
    this.hit("after-database-update");
    return this.transition(operation, "DATABASE_UPDATED");
  }

  private completeUnlocked(operation: PublicationOperation): PublicationOperation {
    this.hit("before-completion");
    const completed = this.transition(operation, "COMPLETED");
    this.cleanupCompletedUnlocked(completed);
    this.hit("after-completion");
    return completed;
  }

  private cleanupCompletedUnlocked(operation: PublicationOperation): void {
    fs.rmSync(assertInside(this.root, path.join(this.root, `${STAGING_ROOT}/${operation.operationId}`), "staging directory"), { recursive: true, force: true });
    if (operation.operationKind !== "catalog") {
      fs.rmSync(assertInside(this.root, path.join(this.root, `${PENDING_ROOT}/${operation.submissionId}`), "pending directory"), { recursive: true, force: true });
    }
  }

  recover(operationId: string, action: "resume" | "compensate"): PublicationOperation {
    return this.withLock(() => {
      const operation = this.readOperation(operationId);
      if (action === "resume") {
        if (operation.state === "RECOVERY_REQUIRED" || operation.state === "FAILED") fail("ambiguous operation cannot be resumed", "recovery_ambiguous");
        return this.executeUnlocked(operation);
      }
      return this.compensateUnlocked(operation);
    });
  }

  private executeUnlocked(initial: PublicationOperation): PublicationOperation {
    let operation = initial;
    if (operation.state === "COMPLETED") {
      this.cleanupCompletedUnlocked(operation);
      return operation;
    }
    if (operation.state === "COMPENSATED") return operation;
    if (operation.state === "PREPARED") operation = this.stageUnlocked(operation);
    if (operation.state === "STAGED") operation = this.verifyUnlocked(operation);
    if (operation.state === "VERIFIED") operation = this.replaceFilesUnlocked(operation);
    if (operation.state === "FILES_REPLACED") operation = this.replaceIndexUnlocked(operation);
    if (operation.state === "INDEX_REPLACED") operation = this.updateDatabaseUnlocked(operation);
    if (operation.state === "DATABASE_UPDATED") operation = this.completeUnlocked(operation);
    return operation;
  }

  private compensateUnlocked(operation: PublicationOperation): PublicationOperation {
    if (operation.state === "COMPLETED" || operation.state === "COMPENSATED") return operation;
    this.hit("before-compensation");
    let current = this.transition(operation, "COMPENSATING");
    for (const variant of current.variants) {
      const target = assertInside(this.root, path.join(this.root, variant.targetRelative), "published target");
      if (current.operationKind === "catalog" && current.catalogAction === "delete") {
        const currentHash = fs.existsSync(target) ? sha256File(target) : null;
        if (currentHash === variant.previousSha256) continue;
        if (currentHash !== null) fail("cannot compensate a changed published file", "recovery_ambiguous", variant);
        const backup = assertInside(this.root, path.join(this.root, variant.backupRelative), "publication backup");
        if (!fs.existsSync(backup) || sha256File(backup) !== variant.previousSha256) fail("compensation backup is unavailable", "recovery_ambiguous", variant);
        ensureDirectory(this.root, path.dirname(path.relative(this.root, target)));
        fs.copyFileSync(backup, target, fs.constants.COPYFILE_EXCL);
        continue;
      }
      if (!fs.existsSync(target)) continue;
      const currentHash = sha256File(target);
      if (currentHash === variant.previousSha256) continue;
      if (currentHash !== variant.expectedSha256) fail("cannot compensate a changed published file", "recovery_ambiguous", variant);
      if (variant.previousSha256 === null) fs.unlinkSync(target);
      else {
        const backup = assertInside(this.root, path.join(this.root, variant.backupRelative), "publication backup");
        if (!fs.existsSync(backup) || sha256File(backup) !== variant.previousSha256) fail("compensation backup is unavailable", "recovery_ambiguous", variant);
        fs.copyFileSync(backup, target);
      }
    }
    const indexPath = path.join(this.root, "index.json");
    if (fs.existsSync(indexPath)) {
      const currentHash = sha256File(indexPath);
      if (currentHash === current.expectedIndexSha256) {
        if (current.previousIndexSha256 === null) fs.unlinkSync(indexPath);
        else {
          const backup = assertInside(this.root, path.join(this.root, current.indexBackupRelative), "index backup");
          if (!fs.existsSync(backup) || sha256File(backup) !== current.previousIndexSha256) fail("index compensation backup is unavailable", "recovery_ambiguous");
          fs.copyFileSync(backup, indexPath);
        }
      } else if (currentHash !== current.previousIndexSha256) fail("cannot compensate a changed catalog index", "recovery_ambiguous");
    }
    if (current.operationKind !== "catalog") {
      const row = this.database.prepare("SELECT status FROM cartridge_submissions WHERE id = ?").get(current.submissionId) as { status?: string } | undefined;
      if (row?.status === "verified") this.database.prepare("UPDATE cartridge_submissions SET status = 'pending', reviewed_by = '', reviewed_at = NULL WHERE id = ?").run(current.submissionId);
    }
    fs.rmSync(assertInside(this.root, path.join(this.root, `${STAGING_ROOT}/${current.operationId}`), "staging directory"), { recursive: true, force: true });
    current = this.transition(current, "COMPENSATED");
    this.hit("after-compensation");
    return current;
  }

  listOperations(): PublicationOperation[] {
    return listDirectories(this.root, JOURNAL_ROOT).map((operationId) => this.readOperation(operationId));
  }

  reconcile(): ReconciliationReport {
    return reconcilePublication({
      root: this.root,
      database: this.database,
      loadIndex: () => loadPublicationIndex(this.root).index,
      readOperation: (operationId) => this.readOperation(operationId),
    });
  }
}
