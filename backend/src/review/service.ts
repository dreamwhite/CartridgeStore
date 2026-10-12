import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { encodePythonJson } from "../compatibility/serialization.js";
import { PublicationConsistencyService, applyReviewMetadata, type ReconciliationFinding } from "../consistency/publication.js";
import type { Principal } from "../auth/principal.js";
import { ReviewError, type ReviewErrorCode } from "./errors.js";

const REVIEW_OPERATION_ROOT = "review-operations";
const MAX_REVIEW_JOURNAL_BYTES = 512 * 1024;
const MAX_REVIEW_SUBMISSIONS = 1000;
const REVIEW_STATES = ["PREPARED", "DATABASE_UPDATED", "COMPLETED", "RECOVERY_REQUIRED"] as const;
type ReviewState = typeof REVIEW_STATES[number];

export interface SubmissionRecord {
  readonly id: number;
  readonly game_id: string;
  readonly version: string;
  readonly status: string;
  readonly submitted_by_user_id: number | null;
  readonly submitted_by: string;
  readonly reviewed_by_user_id: number | null;
  readonly reviewed_by: string;
  readonly pending_dir: string;
  readonly metadata_json: string;
  readonly architectures_json: string;
  readonly created_at: string;
  readonly reviewed_at: string | null;
  readonly metadata: Record<string, unknown>;
  readonly architectures: readonly Record<string, unknown>[];
}

type SubmissionRow = Omit<SubmissionRecord, "metadata" | "architectures">;

interface RejectionOperation {
  readonly journalVersion: 1;
  readonly operationId: string;
  readonly submissionId: number;
  readonly pendingRelative: string;
  readonly reviewer: { readonly id: number; readonly name: string };
  readonly state: ReviewState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function fail(message: string, code: ReviewErrorCode = "review_invalid_request", statusCode = 400): never {
  throw new ReviewError(message, code, statusCode);
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(message, "review_operation_failed", 500);
  return value as Record<string, unknown>;
}

function now(): string { return new Date().toISOString(); }

function parseJson(value: string, label: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { fail(`${label} is malformed`, "review_operation_failed", 500); }
}

function parseSubmission(row: SubmissionRow): SubmissionRecord {
  const metadata = record(parseJson(row.metadata_json, "submission metadata"), "submission metadata is malformed");
  const architecturesValue = parseJson(row.architectures_json, "submission architectures");
  if (!Array.isArray(architecturesValue) || architecturesValue.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) {
    fail("submission architectures are malformed", "review_operation_failed", 500);
  }
  return { ...row, metadata, architectures: architecturesValue as Record<string, unknown>[] };
}

function safeSubmissionId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) fail("submission id is invalid");
  return value;
}

function safePendingRelative(value: string, submissionId: number): string {
  const expected = `pending/${submissionId}`;
  if (value !== expected) fail("submission pending directory is unsafe", "review_operation_failed", 500);
  return expected;
}

function safeInside(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(root, relative);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) fail("review path escapes disposable root", "review_operation_failed", 500);
  let current = resolvedRoot;
  for (const component of path.relative(resolvedRoot, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("review path contains a symlink", "review_operation_failed", 500);
  }
  return candidate;
}

function writeJournal(root: string, operation: RejectionOperation): RejectionOperation {
  const directory = safeInside(root, `${REVIEW_OPERATION_ROOT}/${operation.operationId}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "operation.json");
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const data = Buffer.from(`${encodePythonJson(operation)}\n`, "utf8");
  if (data.byteLength > MAX_REVIEW_JOURNAL_BYTES) fail("review journal is too large", "review_operation_failed", 500);
  const fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, target);
  return operation;
}

function readJournal(root: string, operationId: string): RejectionOperation {
  if (!/^rej-[a-f0-9-]{16,80}$/.test(operationId)) fail("review operation id is invalid", "review_operation_failed", 500);
  const target = safeInside(root, `${REVIEW_OPERATION_ROOT}/${operationId}/operation.json`);
  const stats = fs.lstatSync(target);
  if (!stats.isFile() || stats.size > MAX_REVIEW_JOURNAL_BYTES) fail("review journal is corrupt", "review_operation_failed", 500);
  const raw = record(parseJson(fs.readFileSync(target, "utf8"), "review journal"), "review journal is corrupt");
  if (raw.journalVersion !== 1 || raw.operationId !== operationId || !Number.isSafeInteger(raw.submissionId) || typeof raw.pendingRelative !== "string" || typeof raw.createdAt !== "string" || typeof raw.updatedAt !== "string" || !REVIEW_STATES.includes(raw.state as ReviewState)) fail("review journal is corrupt", "review_operation_failed", 500);
  const reviewer = record(raw.reviewer, "review journal reviewer is corrupt");
  if (!Number.isSafeInteger(reviewer.id) || typeof reviewer.name !== "string" || !reviewer.name) fail("review journal reviewer is corrupt", "review_operation_failed", 500);
  safePendingRelative(raw.pendingRelative, raw.submissionId as number);
  return raw as unknown as RejectionOperation;
}

function transition(root: string, operation: RejectionOperation, state: ReviewState): RejectionOperation {
  return writeJournal(root, { ...operation, state, updatedAt: now() });
}

function rowFor(database: Database.Database, submissionId: number): SubmissionRecord | null {
  const row = database.prepare("SELECT id, game_id, version, status, submitted_by_user_id, submitted_by, reviewed_by_user_id, reviewed_by, pending_dir, metadata_json, architectures_json, created_at, reviewed_at FROM cartridge_submissions WHERE id = ?").get(submissionId) as SubmissionRow | undefined;
  return row ? parseSubmission(row) : null;
}

function reviewerOf(principal: Principal): { readonly id: number; readonly name: string } {
  if (!principal.authenticated || principal.id === null || !Number.isSafeInteger(principal.id) || principal.id <= 0 || !principal.name.trim()) fail("reviewer authentication is required", "review_not_authorized", 401);
  return { id: principal.id, name: principal.name.trim() };
}

export interface ReviewServiceOptions {
  readonly database: Database.Database;
  readonly root: string;
  readonly maxSubmissions?: number;
  readonly publication?: PublicationConsistencyService;
  readonly fault?: (point: "after-rejection-database-update" | "after-rejection-cleanup") => void;
}

export class ReviewService {
  readonly root: string;
  private readonly database: Database.Database;
  private readonly maxSubmissions: number;
  readonly publication: PublicationConsistencyService;
  private readonly fault: ReviewServiceOptions["fault"];

  constructor(options: ReviewServiceOptions) {
    this.root = path.resolve(options.root);
    this.database = options.database;
    this.maxSubmissions = options.maxSubmissions ?? MAX_REVIEW_SUBMISSIONS;
    this.fault = options.fault;
    if (!fs.existsSync(this.root) || !fs.lstatSync(this.root).isDirectory() || fs.lstatSync(this.root).isSymbolicLink()) fail("review disposable root is invalid", "review_unavailable", 503);
    this.publication = options.publication ?? new PublicationConsistencyService({ root: this.root, database: this.database });
    fs.mkdirSync(safeInside(this.root, REVIEW_OPERATION_ROOT), { recursive: true, mode: 0o700 });
  }

  private hit(point: "after-rejection-database-update" | "after-rejection-cleanup"): void { this.fault?.(point); }

  list(status: string | undefined): SubmissionRecord[] {
    const normalized = status === undefined || status === "all" ? undefined : status;
    const rows = normalized === undefined
      ? this.database.prepare("SELECT id, game_id, version, status, submitted_by_user_id, submitted_by, reviewed_by_user_id, reviewed_by, pending_dir, metadata_json, architectures_json, created_at, reviewed_at FROM cartridge_submissions ORDER BY created_at DESC, id DESC LIMIT ?").all(this.maxSubmissions)
      : this.database.prepare("SELECT id, game_id, version, status, submitted_by_user_id, submitted_by, reviewed_by_user_id, reviewed_by, pending_dir, metadata_json, architectures_json, created_at, reviewed_at FROM cartridge_submissions WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?").all(normalized, this.maxSubmissions);
    return (rows as SubmissionRow[]).map(parseSubmission);
  }

  detail(submissionId: number): SubmissionRecord {
    const row = rowFor(this.database, safeSubmissionId(submissionId));
    if (!row) fail("submission not found", "review_not_found", 404);
    return row;
  }

  approve(submissionId: number, metadataUpdates: Record<string, unknown>, principal: Principal): SubmissionRecord {
    const id = safeSubmissionId(submissionId);
    const reviewer = reviewerOf(principal);
    const row = rowFor(this.database, id);
    if (!row) fail("submission not found", "review_not_found", 404);
    if (row.status !== "pending") fail("submission is not pending", "review_state_conflict");
    const reviewedMetadata = applyReviewMetadata(row.metadata, metadataUpdates);
    try {
      this.publication.publish(id, { metadata: reviewedMetadata, reviewer });
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      throw new ReviewError("review operation failed", "review_operation_failed", 500, { cause: error });
    }
    return this.detail(id);
  }

  reject(submissionId: number, principal: Principal): SubmissionRecord {
    const id = safeSubmissionId(submissionId);
    const reviewer = reviewerOf(principal);
    return this.publication.runSerialized(() => {
      const row = rowFor(this.database, id);
      if (!row) fail("submission not found", "review_not_found", 404);
      if (row.status !== "pending") fail("submission is not pending", "review_state_conflict");
      const operation: RejectionOperation = {
        journalVersion: 1,
        operationId: `rej-${crypto.randomUUID()}`,
        submissionId: id,
        pendingRelative: safePendingRelative(row.pending_dir, id),
        reviewer,
        state: "PREPARED",
        createdAt: now(),
        updatedAt: now()
      };
      writeJournal(this.root, operation);
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const current = rowFor(this.database, id);
        if (!current || current.status !== "pending") fail("submission is not pending", "review_state_conflict");
        this.database.prepare("UPDATE cartridge_submissions SET status = 'rejected', reviewed_by_user_id = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'pending'").run(reviewer.id, reviewer.name, id);
        this.database.exec("COMMIT");
      } catch (error) {
        if (this.database.inTransaction) this.database.exec("ROLLBACK");
        throw error;
      }
      const updated = transition(this.root, operation, "DATABASE_UPDATED");
      this.hit("after-rejection-database-update");
      safePendingRelative(updated.pendingRelative, id);
      fs.rmSync(safeInside(this.root, updated.pendingRelative), { recursive: true, force: true });
      this.hit("after-rejection-cleanup");
      transition(this.root, updated, "COMPLETED");
      return this.detail(id);
    });
  }

  recoverRejection(operationId: string): RejectionOperation {
    return this.publication.runSerialized(() => {
      let operation = readJournal(this.root, operationId);
      const row = rowFor(this.database, operation.submissionId);
      if (!row) fail("submission not found", "review_operation_failed", 500);
      if (operation.state === "COMPLETED") return operation;
      if (operation.state === "PREPARED") {
        if (row.status === "pending") {
          this.database.exec("BEGIN IMMEDIATE");
          try {
            this.database.prepare("UPDATE cartridge_submissions SET status = 'rejected', reviewed_by_user_id = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'pending'").run(operation.reviewer.id, operation.reviewer.name, operation.submissionId);
            this.database.exec("COMMIT");
          } catch (error) { if (this.database.inTransaction) this.database.exec("ROLLBACK"); throw error; }
        } else if (row.status !== "rejected") fail("rejection operation is ambiguous", "review_state_conflict");
        operation = transition(this.root, operation, "DATABASE_UPDATED");
      } else if (operation.state !== "DATABASE_UPDATED") fail("rejection operation requires manual recovery", "review_state_conflict");
      fs.rmSync(safeInside(this.root, operation.pendingRelative), { recursive: true, force: true });
      return transition(this.root, operation, "COMPLETED");
    });
  }

  reconcile(): ReconciliationFinding[] {
    const findings: ReconciliationFinding[] = [];
    const directory = safeInside(this.root, REVIEW_OPERATION_ROOT);
    if (!fs.existsSync(directory)) return findings;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        findings.push({ code: "UNSAFE_REVIEW_OBJECT", classification: "CORRUPT", message: "review operation workspace contains a symlink", path: `${REVIEW_OPERATION_ROOT}/${entry.name}` });
        continue;
      }
      if (!entry.isDirectory()) continue;
      try {
        const operation = readJournal(this.root, entry.name);
        if (operation.state !== "COMPLETED") findings.push({ code: "INCOMPLETE_REJECTION_CLEANUP", classification: operation.state === "RECOVERY_REQUIRED" ? "AMBIGUOUS" : "RECOVERABLE", message: `rejection operation is ${operation.state}`, operationId: operation.operationId, submissionId: operation.submissionId });
        const row = rowFor(this.database, operation.submissionId);
        if (!row) findings.push({ code: "REJECTION_SUBMISSION_MISSING", classification: "CORRUPT", message: "rejection operation references a missing submission", operationId: operation.operationId, submissionId: operation.submissionId });
        else if (operation.state === "COMPLETED" && row.status !== "rejected") findings.push({ code: "REJECTION_STATUS_MISMATCH", classification: "AMBIGUOUS", message: "completed rejection does not match submission status", operationId: operation.operationId, submissionId: operation.submissionId });
        else if (operation.state === "COMPLETED" && fs.existsSync(safeInside(this.root, operation.pendingRelative))) findings.push({ code: "REJECTED_SUBMISSION_WITH_PENDING_ARTIFACTS", classification: "RECOVERABLE", message: "rejected submission still has pending artifacts", operationId: operation.operationId, submissionId: operation.submissionId, path: operation.pendingRelative });
      } catch (error) {
        findings.push({ code: "REJECTION_JOURNAL_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "rejection journal is corrupt", operationId: entry.name });
      }
    }
    return findings;
  }
}
