import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import type { Principal } from "../auth/principal.js";
import type { BackendConfig } from "../config/env.js";
import { ReviewError, type ReviewErrorCode } from "../review/errors.js";
import type {
  ReviewWorkflowService,
  SubmissionRecord
} from "../review/service.js";
import { SubmissionError } from "../submission/errors.js";
import { normalizeArchitecture, validateCartridgeBinary } from "../submission/prg32.js";
import { type SubmissionResult } from "../submission/service.js";
import { StagingStore } from "./staging.js";
import { assertExplicitDisposableRoot, assertExplicitOperationalRoot } from "./catalog.js";
import { safeGameId, safeVersion } from "../catalog/catalog.js";
import { expectedStorageKey } from "./objects.js";
import {
  promoteCanonicalObject,
  verifyCanonicalObject,
  type CanonicalObjectPlan,
} from "./workflow-objects.js";
import { type StorageDatabase } from "./types.js";
import { CanonicalWriterLease } from "./writer-lock.js";
import { CANONICAL_OPERATIONAL_WORKFLOW_MODE, CANONICAL_WRITE_AUTHORIZATION, CANONICAL_WORKFLOW_MODE } from "./read-mode.js";
import { assertSubmissionStagingSafe } from "./staging-audit.js";
import type { RuntimePolicy } from "../settings/runtime-policy.js";
import {
  materializeCanonicalPayloads,
  type CanonicalPayloadArtifact,
} from "./workflow-payloads.js";
import {
  json,
  object,
  parseJson,
  publicationMetadata,
  sha256,
  uuid,
} from "./workflow-codecs.js";
import {
  type CanonicalDownloadEvent,
  type CanonicalWorkflowFaultPoint,
  type CanonicalWorkflowOptions,
} from "./workflow-contracts.js";
import {
  loadCanonicalArtifacts,
  loadCanonicalSubmission,
  safeSubmissionMetadata,
  toSubmissionRecord,
  type CanonicalArtifactRow,
  type CanonicalSubmissionRow,
} from "./workflow-records.js";
import { canonicalWorkflowPrincipal } from "./workflow-authorization.js";
import { prepareCanonicalSubmissionBundle } from "./workflow-input.js";
import { buildCanonicalPublicationPlan } from "./workflow-publication-plan.js";
import {
  commitCanonicalVisibility,
  type CanonicalWorkflowManifest,
} from "./workflow-visibility.js";
import { recordCanonicalDownload } from "./workflow-downloads.js";
import {
  listCanonicalSubmissions,
  listOwnedCanonicalSubmissions
} from "./workflow-queries.js";

export type {
  CanonicalDownloadEvent,
  CanonicalWorkflowFaultPoint,
  CanonicalWorkflowOptions,
} from "./workflow-contracts.js";

const WORKFLOW_JOURNAL_VERSION = 1;
const MAX_OPERATION_BYTES = 2 * 1024 * 1024;
type ObjectPlan = CanonicalObjectPlan;

interface OperationRow {
  readonly operation_id: string;
  readonly submission_id: number;
  readonly release_id: string | null;
  readonly state: string;
  readonly manifest_json: string;
}

function now(): string {
  return new Date().toISOString();
}

function fail(message: string, code: ReviewErrorCode = "review_operation_failed", status = 400): never {
  throw new ReviewError(message, code, status);
}

function inside(root: string, relative: string): string {
  const normalized = relative.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..") || /^[A-Za-z]:/u.test(normalized)) fail("canonical staging path is unsafe", "review_operation_failed", 500);
  const candidate = path.resolve(root, normalized);
  const rootPath = path.resolve(root);
  if (!candidate.startsWith(`${rootPath}${path.sep}`)) fail("canonical staging path escapes the disposable root", "review_operation_failed", 500);
  let current = rootPath;
  for (const component of path.relative(rootPath, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("canonical staging path contains a symlink", "review_operation_failed", 500);
  }
  return candidate;
}

function readStaged(root: string, row: CanonicalPayloadArtifact): Buffer {
  const target = inside(root, row.staging_key);
  const stats = fs.lstatSync(target);
  if (!stats.isFile() || stats.size !== row.size_bytes) fail("staged artifact is missing or has changed", "review_operation_failed", 500);
  const bytes = fs.readFileSync(target);
  if (sha256(bytes) !== row.sha256) fail("staged artifact integrity verification failed", "review_operation_failed", 500);
  return bytes;
}

export class CanonicalWorkflowService implements ReviewWorkflowService {
  readonly root: string;
  readonly database: Database.Database;
  readonly paths: StorageDatabase["paths"];
  private readonly resource: StorageDatabase;
  private readonly staging: StagingStore;
  private lease: CanonicalWriterLease | null = null;
  private readonly config: BackendConfig;
  private readonly fault: CanonicalWorkflowOptions["fault"];
  private readonly policy: RuntimePolicy | undefined;

  constructor(options: CanonicalWorkflowOptions) {
    this.config = options.config;
    this.root = options.config.canonicalWorkflowMode === CANONICAL_OPERATIONAL_WORKFLOW_MODE
      ? assertExplicitOperationalRoot(options.root)
      : assertExplicitDisposableRoot(options.root, options.config.candidateRuntimeMode === undefined
        ? [options.config.storeDataDirectory, options.config.databasePath]
        : []);
    if (path.resolve(this.root) !== path.resolve(options.config.canonicalStorageRoot ?? "")) throw new Error("canonical workflow root does not match canonical read root");
    this.resource = options.database;
    this.database = options.database.sqlite;
    this.paths = options.database.paths;
    if (this.resource.readOnly) throw new Error("canonical workflow requires a writable disposable SQLite target");
    const disposableAuthorized = options.config.canonicalWorkflowMode === CANONICAL_WORKFLOW_MODE && options.config.canonicalWriteAuthorization === CANONICAL_WRITE_AUTHORIZATION;
    const operationalAuthorized = options.config.canonicalWorkflowMode === CANONICAL_OPERATIONAL_WORKFLOW_MODE && typeof options.config.canonicalWriteAuthorization === "string" && options.config.canonicalWriteAuthorization.length >= 32;
    if (!disposableAuthorized && !operationalAuthorized) {
      throw new Error("canonical workflow authorization is invalid");
    }
    this.staging = new StagingStore(this.resource.paths);
    this.fault = options.fault;
    this.policy = options.policy;
    try {
      this.lease = new CanonicalWriterLease(this.root);
      assertSubmissionStagingSafe(this.database, this.resource.paths);
      this.recoverIncomplete();
    } catch (error) {
      this.lease?.close();
      this.resource.close();
      throw error;
    }
  }

  close(): void { this.lease?.close(); this.lease = null; this.resource.close(); }

  private hit(point: CanonicalWorkflowFaultPoint): void { this.fault?.(point); }

  private submissionRow(id: number): CanonicalSubmissionRow {
    return loadCanonicalSubmission(this.database, id, fail);
  }

  private artifactRows(id: number): CanonicalArtifactRow[] {
    return loadCanonicalArtifacts(this.database, id);
  }

  private record(row: CanonicalSubmissionRow): SubmissionRecord {
    return toSubmissionRecord(this.database, row);
  }

  createFromBundle(bundle: Uint8Array, principal: Principal, sourceSubmissionId: number | null = null): SubmissionResult {
    if (this.policy && !this.policy.publishingEnabled()) throw new SubmissionError("publishing is disabled", "invalid_request", 403);
    if (this.policy && bundle.byteLength > this.policy.maxArtifactBytes()) throw new SubmissionError("bundle upload is too large", "submission_payload_too_large", 413);
    const owner = canonicalWorkflowPrincipal(this.database, principal);
    const prepared = prepareCanonicalSubmissionBundle(bundle, this.config);
    const metadata = publicationMetadata(prepared.manifest);
    const cartridgeId = safeGameId(String(metadata.id));
    const version = safeVersion(String(metadata.version));
    let submissionId = 0;
    try {
      this.database.exec("BEGIN IMMEDIATE");
      const duplicate = this.database.prepare("SELECT submission_id FROM submissions WHERE cartridge_id = ? AND version = ? AND status IN ('pending_review', 'validated', 'approved', 'published') LIMIT 1").get(cartridgeId, version);
      if (duplicate) throw new SubmissionError("submission already exists", "invalid_request");
      const revision = sourceSubmissionId === null ? { id: null, number: 1 } : (() => {
        const source = this.database.prepare("SELECT submission_id, submitted_by_user_id, status, revision_number FROM submissions WHERE submission_id = ?").get(sourceSubmissionId) as { submission_id: number; submitted_by_user_id: number; status: string; revision_number: number } | undefined;
        if (!source || source.submitted_by_user_id !== owner.id || source.status !== "rejected") throw new ReviewError("source submission is not eligible for revision", "review_not_authorized", 403);
        return { id: source.submission_id, number: source.revision_number + 1 };
      })();
      this.database.prepare("INSERT OR IGNORE INTO cartridges(cartridge_id, created_at, updated_at, publisher_user_id, state) VALUES (?, ?, ?, ?, 'active')").run(cartridgeId, now(), now(), owner.id);
      const cartridge = this.database.prepare("SELECT state FROM cartridges WHERE cartridge_id = ?").get(cartridgeId) as { state?: string } | undefined;
      if (!cartridge || cartridge.state !== "active") fail("cartridge is unavailable", "review_state_conflict");
      const inserted = this.database.prepare("INSERT INTO submissions(cartridge_id, version, status, submitted_by_user_id, submitted_by, created_at, revision_of_submission_id, revision_number) VALUES (?, ?, 'pending_review', ?, ?, ?, ?, ?)").run(cartridgeId, version, owner.id, owner.name, now(), revision.id, revision.number);
      submissionId = Number(inserted.lastInsertRowid);
      for (const variant of prepared.variants) {
        const parsed = validateCartridgeBinary(variant.image);
        const metadataJson = json(parsed.metadata ?? metadata);
        const staged = this.staging.stageSubmissionArtifact(submissionId, normalizeArchitecture(variant.architecture), path.basename(variant.file), variant.image);
        this.database.prepare("INSERT INTO submission_artifacts(submission_artifact_id, submission_id, architecture, source_filename, staging_key, sha256, size_bytes, media_type, validation_state, metadata_json, colophon_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?, ?, ?)").run(uuid("submission-artifact"), submissionId, staged.architecture, staged.sourceFilename, staged.stagingKey, staged.sha256, staged.sizeBytes, staged.mediaType, metadataJson, parsed.colophon ? json(parsed.colophon) : null, now());
      }
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      if (submissionId > 0) {
        try { fs.rmSync(path.join(this.resource.paths.submissionStagingRoot, String(submissionId)), { recursive: true, force: true }); } catch { /* recovery audit retains database evidence */ }
      }
      throw error;
    }
    return { status: "pending", ok: true, review_required: true, submission_id: submissionId, id: cartridgeId, version, submitted: prepared.variants.map((item) => ({ architecture: item.architecture, file: item.file })) };
  }

  recordDownload(event: CanonicalDownloadEvent): void {
    recordCanonicalDownload(this.database, event, now);
  }

  list(status: string | undefined): SubmissionRecord[] {
    return listCanonicalSubmissions(this.database, status);
  }

  listMine(userId: number, status: string | undefined, page = 1, perPage = 25) {
    return listOwnedCanonicalSubmissions(
      this.database,
      userId,
      status,
      page,
      perPage,
      fail
    );
  }

  detail(submissionId: number): SubmissionRecord { return this.record(this.submissionRow(submissionId)); }

  approve(submissionId: number, metadataUpdates: Record<string, unknown>, principal: Principal, note = ""): SubmissionRecord {
    const reviewer = canonicalWorkflowPrincipal(this.database, principal, true);
    const row = this.submissionRow(submissionId);
    if (row.status !== "pending_review") fail("submission is not pending", "review_state_conflict");
    const existing = this.database.prepare("SELECT operation_id FROM publication_operations WHERE submission_id = ? AND state NOT IN ('completed', 'failed', 'compensated') ORDER BY created_at DESC LIMIT 1").get(submissionId) as { operation_id?: string } | undefined;
    if (existing?.operation_id) { this.execute(existing.operation_id); return this.detail(submissionId); }
    const artifacts = this.artifactRows(submissionId);
    if (artifacts.length === 0) fail("submission has no artifacts", "review_operation_failed", 500);
    const releaseId = uuid("release");
    const operationId = `pub-${crypto.randomUUID()}`;
    const publicationPlan = buildCanonicalPublicationPlan({
      artifacts,
      metadataUpdates,
      readStaged: (artifact) => readStaged(this.root, artifact),
      safeMetadata: safeSubmissionMetadata,
      fail,
    });
    const { colophon, metadata: reviewed, objects } = publicationPlan;
    const manifest: CanonicalWorkflowManifest = { journalVersion: WORKFLOW_JOURNAL_VERSION, operationId, releaseId, submissionId, cartridgeId: row.cartridge_id, version: row.version, reviewUpdates: JSON.parse(JSON.stringify(metadataUpdates)) as Record<string, unknown>, metadata: reviewed, colophon, reviewer, objects };
    this.hit("before-durable-intent");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.submissionRow(submissionId);
      if (current.status !== "pending_review") fail("submission is not pending", "review_state_conflict");
      this.database.prepare("INSERT INTO publication_operations(operation_id, operation_kind, submission_id, state, manifest_json, created_at, updated_at) VALUES (?, 'submission', ?, 'prepared', ?, ?, ?)").run(operationId, submissionId, json(manifest), now(), now());
      for (const item of objects) {
        this.database.prepare("INSERT INTO storage_objects(object_id, object_kind, storage_key, sha256, size_bytes, media_type, state, created_at, created_by_operation_id) VALUES (?, ?, ?, ?, ?, ?, 'staged', ?, ?)").run(item.objectId, item.objectKind, expectedStorageKey(item.objectKind, item.objectId, item.mediaType), item.sha256, item.sizeBytes, item.mediaType, now(), operationId);
        this.database.prepare("INSERT INTO publication_operation_items(operation_item_id, operation_id, item_kind, architecture, target_role, expected_object_id, source_staging_key, target_storage_key, expected_sha256, expected_size_bytes, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned')").run(uuid("publication-item"), operationId, item.objectKind, item.architecture, item.targetRole, item.objectId, item.sourceStagingKey, expectedStorageKey(item.objectKind, item.objectId, item.mediaType), item.sha256, item.sizeBytes);
      }
      this.database.prepare("INSERT INTO review_decisions(decision_id, submission_id, decision, reviewer_user_id, reviewer_name, metadata_json, note, created_at) VALUES (?, ?, 'approved', ?, ?, ?, ?, ?)").run(uuid("decision"), submissionId, reviewer.id, reviewer.name, json(metadataUpdates), note.slice(0, 4000), now());
      this.database.prepare("INSERT INTO publication_events(operation_id, from_state, to_state, event_code, details_json, created_at) VALUES (?, NULL, 'prepared', 'publication_intent_created', '{}', ?)").run(operationId, now());
      this.database.exec("COMMIT");
    } catch (error) { if (this.database.inTransaction) this.database.exec("ROLLBACK"); throw error; }
    this.hit("after-durable-intent");
    this.execute(operationId);
    return this.detail(submissionId);
  }

  reject(submissionId: number, principal: Principal, note = ""): SubmissionRecord {
    const reviewer = canonicalWorkflowPrincipal(this.database, principal, true);
    if (this.policy?.requireReviewNoteOnRejection() && note.trim().length === 0) fail("a rejection note is required", "review_invalid_request");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.submissionRow(submissionId);
      if (row.status !== "pending_review") fail("submission is not pending", "review_state_conflict");
      this.database.prepare("UPDATE submissions SET status = 'rejected', reviewed_by_user_id = ?, reviewed_by = ?, reviewed_at = ? WHERE submission_id = ? AND status = 'pending_review'").run(reviewer.id, reviewer.name, now(), submissionId);
      this.database.prepare("INSERT INTO review_decisions(decision_id, submission_id, decision, reviewer_user_id, reviewer_name, metadata_json, note, created_at) VALUES (?, ?, 'rejected', ?, ?, NULL, ?, ?)").run(uuid("decision"), submissionId, reviewer.id, reviewer.name, note.slice(0, 4000), now());
      this.database.exec("COMMIT");
    } catch (error) { if (this.database.inTransaction) this.database.exec("ROLLBACK"); throw error; }
    return this.detail(submissionId);
  }

  private operation(operationId: string): { row: OperationRow; manifest: CanonicalWorkflowManifest } {
    const row = this.database.prepare("SELECT operation_id, submission_id, release_id, state, manifest_json FROM publication_operations WHERE operation_id = ?").get(operationId) as OperationRow | undefined;
    if (!row) fail("publication operation not found", "review_operation_failed", 500);
    if (row.manifest_json.length > MAX_OPERATION_BYTES) fail("publication operation is too large", "review_operation_failed", 500);
    const manifest = object(parseJson(row.manifest_json, "publication manifest"), "publication manifest") as unknown as CanonicalWorkflowManifest;
    if (manifest.journalVersion !== 1 || manifest.operationId !== operationId || !Array.isArray(manifest.objects)) fail("publication journal is corrupt", "review_operation_failed", 500);
    return { row, manifest };
  }

  private verifyFile(item: ObjectPlan): boolean {
    return verifyCanonicalObject(this.root, item);
  }

  private promote(item: ObjectPlan, bytes: Buffer): void {
    promoteCanonicalObject(
      {
        root: this.root,
        objectTempRoot: this.resource.paths.objectTempRoot,
        database: this.database,
        fail,
      },
      item,
      bytes,
    );
  }

  private transition(operationId: string, fromState: string, toState: string, eventCode: string): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database.prepare("SELECT state FROM publication_operations WHERE operation_id = ?").get(operationId) as { state?: string } | undefined;
      if (!current || current.state !== fromState) { this.database.exec("ROLLBACK"); return; }
      const updatedAt = now();
      this.database.prepare("UPDATE publication_operations SET state = ?, updated_at = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE completed_at END WHERE operation_id = ?").run(toState, updatedAt, toState, toState === "completed" ? updatedAt : null, operationId);
      this.database.prepare("INSERT INTO publication_events(operation_id, from_state, to_state, event_code, details_json, created_at) VALUES (?, ?, ?, ?, '{}', ?)").run(operationId, fromState, toState, eventCode, now());
      this.database.exec("COMMIT");
    } catch (error) { if (this.database.inTransaction) this.database.exec("ROLLBACK"); throw error; }
  }

  execute(operationId: string): void {
    const { row, manifest } = this.operation(operationId);
    if (row.state === "completed") return;
    const payloads = materializeCanonicalPayloads(
      manifest,
      this.artifactRows(manifest.submissionId),
      {
        readStaged: (row) => readStaged(this.root, row),
        safeMetadata: safeSubmissionMetadata,
        fail,
      },
    );
    if (row.state === "prepared" || row.state === "objects_staged") {
      for (const item of manifest.objects) {
        this.hit("before-object-promotion");
        if (!this.verifyFile({ ...item, targetStorageKey: expectedStorageKey(item.objectKind, item.objectId, item.mediaType) })) {
          const bytes = payloads.get(item.objectId);
          if (!bytes) fail("publication object payload is unavailable", "review_operation_failed", 500);
          this.promote(item, bytes);
        } else this.database.prepare("UPDATE storage_objects SET state = 'available' WHERE object_id = ?").run(item.objectId);
        this.database.prepare("UPDATE publication_operation_items SET state = 'verified' WHERE operation_id = ? AND expected_object_id = ?").run(operationId, item.objectId);
        this.transition(operationId, row.state === "prepared" ? "prepared" : "objects_staged", "objects_staged", "object_promoted");
        this.hit("after-object-promotion");
      }
      this.transition(operationId, "objects_staged", "objects_verified", "objects_verified");
    }
    const current = this.operation(operationId).row;
    if (current.state === "objects_verified") {
      commitCanonicalVisibility({
        database: this.database,
        manifest,
        operationId,
        now,
        fail,
        beforeVisibility: () => this.hit("before-visibility"),
        afterVisibility: () => this.hit("after-visibility"),
      });
    }
    const afterVisibility = this.operation(operationId).row;
    if (afterVisibility.state === "database_committed" || afterVisibility.state === "cleanup_pending") {
      this.hit("before-completion");
      this.hit("during-staging-cleanup");
      const submissionDirectory = path.join(this.resource.paths.submissionStagingRoot, String(manifest.submissionId));
      if (fs.existsSync(submissionDirectory)) fs.rmSync(submissionDirectory, { recursive: true, force: true });
      this.transition(operationId, afterVisibility.state, "completed", "publication_completed");
    }
  }

  recoverIncomplete(): void {
    const rows = this.database.prepare("SELECT operation_id, state FROM publication_operations WHERE operation_kind = 'submission' AND state IN ('prepared', 'objects_staged', 'objects_verified', 'database_committed', 'cleanup_pending') ORDER BY created_at").all() as Array<{ operation_id: string; state: string }>;
    for (const row of rows) this.execute(row.operation_id);
    const corrupt = this.database.prepare("SELECT COUNT(*) AS count FROM publication_operations WHERE operation_kind = 'submission' AND state = 'recovery_required'").get() as { count: number };
    if (Number(corrupt.count) > 0) throw new Error("canonical publication recovery is required");
  }
}
