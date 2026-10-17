import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import type { Principal } from "../auth/principal.js";
import type { BackendConfig } from "../config/env.js";
import { ReviewError, type ReviewErrorCode } from "../review/errors.js";
import type { OwnedSubmissionPage, ReviewWorkflowService, SubmissionRecord } from "../review/service.js";
import { SubmissionError } from "../submission/errors.js";
import { buildSubmissionCartridge, normalizeArchitecture, parseCartridge, validateCartridgeBinary } from "../submission/prg32.js";
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
  mediaType,
  object,
  parseJson,
  publicationMetadata,
  reviewedMetadata,
  sha256,
  submissionStatus,
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

export type {
  CanonicalDownloadEvent,
  CanonicalWorkflowFaultPoint,
  CanonicalWorkflowOptions,
} from "./workflow-contracts.js";

const WORKFLOW_JOURNAL_VERSION = 1;
const MAX_OPERATION_BYTES = 2 * 1024 * 1024;
const MAX_SUBMISSION_PAGE = 100;

type ObjectPlan = CanonicalObjectPlan;

interface WorkflowManifest {
  readonly journalVersion: 1;
  readonly operationId: string;
  readonly releaseId: string;
  readonly submissionId: number;
  readonly cartridgeId: string;
  readonly version: string;
  readonly reviewUpdates: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly colophon: Record<string, unknown> | null;
  readonly reviewer: { readonly id: number; readonly name: string };
  readonly objects: readonly ObjectPlan[];
}

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
    const target = this.database.prepare(
      `SELECT r.release_id, a.artifact_id
       FROM releases r
       JOIN artifacts a ON a.release_id = r.release_id
       JOIN storage_objects o ON o.object_id = a.object_id
      WHERE r.cartridge_id = ? AND r.version = ? AND r.state = 'published'
        AND a.architecture = ? AND a.state = 'published' AND o.state = 'available'
      LIMIT 1`
    ).get(event.gameId, event.version, event.architecture) as { release_id?: string; artifact_id?: string } | undefined;
    if (!target?.release_id || !target.artifact_id) throw new Error("canonical download target is unavailable");
    const ipHash = crypto.createHash("sha256").update(event.ipAddress ?? "", "utf8").digest("hex");
    const userId = event.userId !== null && Number.isSafeInteger(event.userId) && event.userId > 0 ? event.userId : null;
    const userAgent = event.userAgent.slice(0, 300);
    const downloadedAt = now();
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.prepare(
        `INSERT INTO download_events(cartridge_id, release_id, artifact_id, version, architecture, user_id, ip_hash, user_agent, downloaded_at, delivery_outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'started')`
      ).run(event.gameId, target.release_id, target.artifact_id, event.version, event.architecture, userId, ipHash, userAgent, downloadedAt);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      throw new Error("canonical download telemetry could not be recorded", { cause: error });
    }
  }

  list(status: string | undefined): SubmissionRecord[] {
    const normalized = status === undefined || status === "all" ? undefined : status === "pending" ? "pending_review" : status === "verified" ? "published" : status;
    const rows = normalized === undefined
      ? this.database.prepare("SELECT submission_id, cartridge_id, version, status, submitted_by_user_id, submitted_by, reviewed_by_user_id, reviewed_by, created_at, reviewed_at, published_release_id, revision_of_submission_id, revision_number FROM submissions ORDER BY created_at DESC, submission_id DESC LIMIT 1000").all()
      : this.database.prepare("SELECT submission_id, cartridge_id, version, status, submitted_by_user_id, submitted_by, reviewed_by_user_id, reviewed_by, created_at, reviewed_at, published_release_id, revision_of_submission_id, revision_number FROM submissions WHERE status = ? ORDER BY created_at DESC, submission_id DESC LIMIT 1000").all(normalized);
    return (rows as CanonicalSubmissionRow[]).map((row) => this.record(row));
  }

  listMine(userId: number, status: string | undefined, page = 1, perPage = 25): OwnedSubmissionPage {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(page) || page <= 0 || !Number.isSafeInteger(perPage) || perPage <= 0 || perPage > MAX_SUBMISSION_PAGE) fail("submission pagination is invalid");
    const normalized = status === undefined || status === "all" ? undefined : status === "pending" ? "pending_review" : status === "verified" ? "published" : status;
    const where = normalized === undefined ? "submitted_by_user_id = ?" : "submitted_by_user_id = ? AND status = ?";
    const params = normalized === undefined ? [userId] : [userId, normalized];
    const total = Number((this.database.prepare(`SELECT COUNT(*) AS total FROM submissions WHERE ${where}`).get(...params) as { total: number }).total);
    const pages = Math.ceil(total / perPage);
    const rows = normalized === undefined
      ? this.database.prepare(`SELECT submission_id, cartridge_id, version, status, created_at, reviewed_at, (SELECT title FROM releases WHERE release_id = submissions.published_release_id) AS title FROM submissions WHERE ${where} ORDER BY created_at DESC, submission_id DESC LIMIT ? OFFSET ?`).all(userId, perPage, (page - 1) * perPage)
      : this.database.prepare(`SELECT submission_id, cartridge_id, version, status, created_at, reviewed_at, (SELECT title FROM releases WHERE release_id = submissions.published_release_id) AS title FROM submissions WHERE ${where} ORDER BY created_at DESC, submission_id DESC LIMIT ? OFFSET ?`).all(userId, normalized, perPage, (page - 1) * perPage);
    return { submissions: (rows as Array<{ submission_id: number; cartridge_id: string; version: string; status: string; title: string | null; created_at: string; reviewed_at: string | null }>).map((row) => ({ id: row.submission_id, game_id: row.cartridge_id, title: row.title || row.cartridge_id, version: row.version, status: submissionStatus(row.status), created_at: row.created_at, reviewed_at: row.reviewed_at })), pagination: { page, per_page: perPage, total, pages, has_next: page < pages, has_prev: page > 1 && pages > 0, next_page: page < pages ? page + 1 : null, prev_page: page > 1 && pages > 0 ? page - 1 : null } };
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
    const first = validateCartridgeBinary(readStaged(this.root, artifacts[0] as CanonicalArtifactRow));
    const baseMetadata = safeSubmissionMetadata(first.metadata);
    const reviewed = reviewedMetadata(baseMetadata, metadataUpdates);
    const releaseId = uuid("release");
    const operationId = `pub-${crypto.randomUUID()}`;
    const objects: ObjectPlan[] = [];
    for (const artifact of artifacts) {
      const artifactId = uuid("artifact");
      const parsed = validateCartridgeBinary(readStaged(this.root, artifact));
      const originalMetadata = safeSubmissionMetadata(parsed.metadata);
      const updatedMetadata = reviewedMetadata(originalMetadata, metadataUpdates);
      const reviewedColophon = parsed.colophon ? { ...parsed.colophon, title: updatedMetadata.title, version: updatedMetadata.version } : null;
      const rebuilt = Buffer.from(buildSubmissionCartridge(parsed.legacyPayload, updatedMetadata, parsed.icon ?? Buffer.alloc(0), artifact.architecture, parsed.screenshot, reviewedColophon));
      objects.push({ objectId: uuid("obj"), objectKind: "artifact", targetRole: "artifact", architecture: artifact.architecture, mediaType: artifact.media_type, sha256: sha256(rebuilt), sizeBytes: rebuilt.byteLength, sourceStagingKey: artifact.staging_key, artifactId, mediaId: null });
      const rebuiltParsed = parseCartridge(rebuilt);
      const mediaEntries: Array<{ role: "icon" | "screenshot"; bytes: Uint8Array }> = [{ role: "icon", bytes: rebuiltParsed.icon ?? new Uint8Array() }];
      if (rebuiltParsed.screenshot) mediaEntries.push({ role: "screenshot", bytes: rebuiltParsed.screenshot });
      for (const media of mediaEntries) {
        if (media.bytes.byteLength === 0) fail("submission media is missing", "review_operation_failed", 500);
        objects.push({ objectId: uuid("obj"), objectKind: "media", targetRole: media.role, architecture: artifact.architecture, mediaType: mediaType(media.bytes), sha256: sha256(media.bytes), sizeBytes: media.bytes.byteLength, sourceStagingKey: artifact.staging_key, artifactId, mediaId: uuid("media") });
      }
    }
    const colophon = first.colophon ? { ...first.colophon, title: reviewed.title, version: reviewed.version } : null;
    const manifest: WorkflowManifest = { journalVersion: WORKFLOW_JOURNAL_VERSION, operationId, releaseId, submissionId, cartridgeId: row.cartridge_id, version: row.version, reviewUpdates: JSON.parse(JSON.stringify(metadataUpdates)) as Record<string, unknown>, metadata: reviewed, colophon, reviewer, objects };
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

  private operation(operationId: string): { row: OperationRow; manifest: WorkflowManifest } {
    const row = this.database.prepare("SELECT operation_id, submission_id, release_id, state, manifest_json FROM publication_operations WHERE operation_id = ?").get(operationId) as OperationRow | undefined;
    if (!row) fail("publication operation not found", "review_operation_failed", 500);
    if (row.manifest_json.length > MAX_OPERATION_BYTES) fail("publication operation is too large", "review_operation_failed", 500);
    const manifest = object(parseJson(row.manifest_json, "publication manifest"), "publication manifest") as unknown as WorkflowManifest;
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

  private commitVisibility(operationId: string, manifest: WorkflowManifest): void {
    this.hit("before-visibility");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database.prepare("SELECT release_id, state FROM releases WHERE cartridge_id = ? AND version = ? AND state = 'published'").get(manifest.cartridgeId, manifest.version) as { release_id?: string; state?: string } | undefined;
      let releaseId = manifest.releaseId;
      if (existing && existing.release_id !== releaseId) fail("published version already exists", "review_state_conflict");
      if (!existing) {
        const order = Number((this.database.prepare("SELECT COALESCE(MAX(published_order), 0) AS value FROM releases").get() as { value: number }).value) + 1;
        const title = typeof manifest.metadata.title === "string" ? manifest.metadata.title : manifest.cartridgeId;
        const summary = typeof manifest.metadata.summary === "string" ? manifest.metadata.summary : "";
        this.database.prepare("INSERT INTO releases(release_id, cartridge_id, version, revision, state, title, summary, authors_json, tags_json, metadata_json, colophon_json, created_at, submitted_at, published_at, published_order, created_by_user_id, reviewer_user_id) VALUES (?, ?, ?, 1, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(releaseId, manifest.cartridgeId, manifest.version, title, summary, json(manifest.metadata.authors ?? []), json(manifest.metadata.tags ?? []), json(manifest.metadata), manifest.colophon ? json(manifest.colophon) : null, now(), now(), now(), order, null, manifest.reviewer.id);
        for (const artifact of manifest.objects.filter((item) => item.objectKind === "artifact")) {
          const compatibility = { legacyPublicVariant: { architecture: artifact.architecture, size: artifact.sizeBytes, sha256: artifact.sha256, has_screenshot: manifest.objects.some((item) => item.objectKind === "media" && item.targetRole === "screenshot" && item.architecture === artifact.architecture), has_signature: false } };
          this.database.prepare("INSERT INTO artifacts(artifact_id, release_id, architecture, object_id, compatibility_json, state, created_at) VALUES (?, ?, ?, ?, ?, 'published', ?)").run(artifact.artifactId, releaseId, artifact.architecture, artifact.objectId, json(compatibility), now());
        }
        for (const media of manifest.objects.filter((item) => item.objectKind === "media")) {
          this.database.prepare("INSERT INTO media(media_id, release_id, architecture, kind, object_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(media.mediaId, releaseId, media.architecture, media.targetRole, media.objectId, now());
        }
      } else releaseId = String(existing.release_id);
      this.database.prepare("UPDATE submission_artifacts SET validation_state = 'promoted' WHERE submission_id = ?").run(manifest.submissionId);
      this.database.prepare("UPDATE submissions SET status = 'published', reviewed_by_user_id = ?, reviewed_by = ?, reviewed_at = COALESCE(reviewed_at, ?), published_release_id = ? WHERE submission_id = ? AND status IN ('pending_review', 'approved')").run(manifest.reviewer.id, manifest.reviewer.name, now(), releaseId, manifest.submissionId);
      this.database.prepare("UPDATE publication_operations SET release_id = ?, state = 'database_committed', committed_at = COALESCE(committed_at, ?), updated_at = ? WHERE operation_id = ? AND state IN ('objects_verified', 'objects_staged', 'prepared')").run(releaseId, now(), now(), operationId);
      this.database.prepare("INSERT INTO publication_events(operation_id, from_state, to_state, event_code, details_json, created_at) VALUES (?, 'objects_verified', 'database_committed', 'canonical_visibility_committed', '{}', ?)").run(operationId, now());
      this.database.exec("COMMIT");
    } catch (error) { if (this.database.inTransaction) this.database.exec("ROLLBACK"); throw error; }
    this.hit("after-visibility");
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
    if (current.state === "objects_verified") this.commitVisibility(operationId, manifest);
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
