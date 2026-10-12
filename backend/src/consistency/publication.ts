import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { INDEX_ABI, safeGameId, safeVersion } from "../catalog/catalog.js";
import { encodePythonJson } from "../compatibility/serialization.js";
import { buildSubmissionCartridge, normalizeArchitecture, validateCartridgeBinary, validateMetadata, type parseCartridge } from "../submission/prg32.js";
import { PublicationConsistencyError } from "./errors.js";

export const PUBLICATION_STATES = [
  "PREPARED",
  "STAGED",
  "VERIFIED",
  "FILES_REPLACED",
  "INDEX_REPLACED",
  "DATABASE_UPDATED",
  "COMPLETED",
  "COMPENSATING",
  "COMPENSATED",
  "RECOVERY_REQUIRED",
  "FAILED"
] as const;

export type PublicationState = typeof PUBLICATION_STATES[number];
export type FaultPoint =
  | "after-operation-record"
  | "after-pending-validation"
  | "after-staging"
  | "after-staged-verification"
  | "before-binary-replacement"
  | "after-binary-replacement"
  | "before-index-temp-write"
  | "after-index-temp-write"
  | "before-index-replacement"
  | "after-index-replacement"
  | "before-database-update"
  | "after-database-update"
  | "before-completion"
  | "after-completion"
  | "before-compensation"
  | "after-compensation";

export interface PublicationVariantPlan {
  readonly architecture: string;
  readonly sourceRelative: string;
  readonly targetRelative: string;
  readonly stagedRelative: string;
  readonly backupRelative: string;
  readonly expectedSha256: string;
  readonly previousSha256: string | null;
  readonly size: number;
  readonly metadata: Record<string, unknown>;
  readonly colophon: Record<string, unknown> | null;
  readonly iconMime: string | null;
  readonly screenshotMime: string | null;
  readonly hasScreenshot: boolean;
  readonly hasSignature: boolean;
}

export type PublicationOperationKind = "submission" | "catalog";
export type CatalogMutationAction = "update" | "delete";

export interface PublicationOperation {
  readonly journalVersion: 1;
  readonly operationKind?: PublicationOperationKind;
  readonly catalogAction?: CatalogMutationAction;
  readonly operationId: string;
  readonly submissionId: number;
  readonly gameId: string;
  readonly version: string;
  readonly variants: readonly PublicationVariantPlan[];
  readonly previousIndexSha256: string | null;
  readonly expectedIndexSha256: string;
  readonly indexStagedRelative: string;
  readonly indexBackupRelative: string;
  readonly state: PublicationState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewedMetadata?: Record<string, unknown>;
  readonly reviewer?: { readonly id: number; readonly name: string };
  readonly error?: { readonly code: string; readonly message: string };
}

export interface PublicationReviewOptions {
  readonly metadata?: Record<string, unknown>;
  readonly reviewer?: { readonly id: number; readonly name: string };
}

export interface CatalogMutationOptions {
  readonly gameId: string;
  readonly version: string;
  readonly metadata?: Record<string, unknown>;
  readonly architecture?: string;
}

export const REVIEW_EDITABLE_METADATA_FIELDS = [
  "title",
  "summary",
  "description",
  "tags",
  "license",
  "homepage",
  "repository"
] as const;

export type ReconciliationClassification = "CONSISTENT" | "RECOVERABLE" | "AMBIGUOUS" | "CORRUPT";

export interface ReconciliationFinding {
  readonly code: string;
  readonly classification: Exclude<ReconciliationClassification, "CONSISTENT">;
  readonly message: string;
  readonly path?: string;
  readonly operationId?: string;
  readonly submissionId?: number;
  readonly details?: Record<string, unknown>;
}

export interface ReconciliationReport {
  readonly status: ReconciliationClassification;
  readonly checkedAt: string;
  readonly root: string;
  readonly findings: readonly ReconciliationFinding[];
  readonly counts: Record<string, number>;
}

interface SubmissionRow {
  readonly id: number;
  readonly game_id: string;
  readonly version: string;
  readonly status: string;
  readonly pending_dir: string;
  readonly metadata_json: string;
  readonly architectures_json: string;
}

interface StoredArchitecture {
  readonly architecture?: unknown;
  readonly stored?: unknown;
  readonly file?: unknown;
}

interface LockRecord {
  readonly pid: number;
  readonly token: string;
  readonly createdAt: string;
}

const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const MAX_CARTRIDGE_BYTES = 128 * 1024 * 1024;
const MAX_SCAN_ENTRIES = 4096;
const LOCK_MIN_AGE_MS = 1000;
const LOCK_FILE = "publication.lock";
const JOURNAL_ROOT = "publication-operations";
const STAGING_ROOT = "publication-staging";
const BACKUP_ROOT = "publication-backups";
const PENDING_ROOT = "pending";
const CARTRIDGE_ROOT = "cartridges";

function fail(message: string, code = "publication_consistency_failed", details?: unknown): never {
  throw new PublicationConsistencyError(message, code, details);
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(message, "journal_corrupt");
  return value as Record<string, unknown>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function applyReviewMetadata(original: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
  const forbidden = ["id", "version", "authors"] as const;
  for (const field of forbidden) {
    if (Object.hasOwn(updates, field) && JSON.stringify(updates[field]) !== JSON.stringify(original[field])) {
      fail(`metadata.${field} cannot be changed during review`, "review_metadata_invalid");
    }
  }
  const metadata = clone(original);
  for (const field of REVIEW_EDITABLE_METADATA_FIELDS) {
    if (Object.hasOwn(updates, field)) metadata[field] = updates[field];
  }
  metadata.id = original.id;
  metadata.version = original.version;
  metadata.authors = original.authors ?? [];
  try {
    validateMetadata(metadata);
  } catch (error) {
    fail(error instanceof Error ? error.message : "review metadata is invalid", "review_metadata_invalid");
  }
  return metadata;
}

function reviewedImage(source: Uint8Array, architecture: string, metadata: Record<string, unknown> | undefined, colophonOverride?: Record<string, unknown> | null): { readonly image: Buffer; readonly parsed: ReturnType<typeof parseCartridge> } {
  const original = validateCartridgeBinary(source);
  if (!metadata) return { image: Buffer.from(source), parsed: original };
  if (!original.metadata || !original.icon) fail("pending cartridge metadata or icon is missing", "pending_cartridge_invalid");
  let normalizedArchitecture: "esp32c6" | "qemu";
  try {
    normalizedArchitecture = normalizeArchitecture(architecture);
  } catch (error) {
    fail(error instanceof Error ? error.message : "unsupported architecture", "pending_cartridge_invalid");
  }
  const variantMetadata = applyReviewMetadata(original.metadata, metadata);
  const rebuilt = buildSubmissionCartridge(
    original.legacyPayload,
    variantMetadata,
    original.icon,
    normalizedArchitecture,
    original.screenshot,
    colophonOverride === undefined ? original.colophon : colophonOverride
  );
  return { image: Buffer.from(rebuilt), parsed: validateCartridgeBinary(rebuilt) };
}

function catalogColophon(original: Record<string, unknown> | null, metadata: Record<string, unknown>): Record<string, unknown> | null {
  if (!original) return null;
  const next = clone(original);
  next.title = metadata.title;
  next.version = metadata.version;
  return next;
}

function isoNow(): string {
  return new Date().toISOString();
}

function sha256(value: Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortedJson(item)])
    );
  }
  return value;
}

function serializeJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(sortedJson(value), null, 2)}\n`, "utf8");
}

function readBounded(filePath: string, limit: number, code: string): Buffer {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.size > limit) fail("file exceeds the reconciliation limit", code, { path: filePath });
  return fs.readFileSync(filePath);
}

function assertSafeRelative(value: string, label: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..") || /^[A-Za-z]:/.test(normalized)) {
    fail(`${label} is unsafe`, "unsafe_publication_path");
  }
  return normalized;
}

function assertInside(root: string, candidate: string, label: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail(`${label} escapes disposable root`, "unsafe_publication_path");
  return resolved;
}

function assertNoSymlinkComponents(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail("publication path escapes disposable root", "unsafe_publication_path");
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("publication path contains a symlink", "unsafe_publication_path");
  }
}

function ensureDirectory(root: string, relative: string): string {
  const candidate = assertInside(root, path.join(root, relative), "directory");
  assertNoSymlinkComponents(root, candidate);
  fs.mkdirSync(candidate, { recursive: true, mode: 0o700 });
  assertNoSymlinkComponents(root, candidate);
  return candidate;
}

function writeAtomic(root: string, relative: string, data: Uint8Array): void {
  const safeRelative = assertSafeRelative(relative, "atomic file");
  const target = assertInside(root, path.join(root, safeRelative), "atomic file");
  const parent = path.dirname(target);
  ensureDirectory(root, path.relative(root, parent));
  assertNoSymlinkComponents(root, target);
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeSync(fd, Buffer.from(data));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, target);
  try {
    const directoryFd = fs.openSync(parent, "r");
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } catch {
    // Directory fsync is not available on every supported development host.
  }
}

function readJsonFile(root: string, relative: string, limit: number, code: string): unknown {
  const safeRelative = assertSafeRelative(relative, "journal path");
  const target = assertInside(root, path.join(root, safeRelative), "journal path");
  assertNoSymlinkComponents(root, target);
  try {
    return JSON.parse(readBounded(target, limit, code).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof PublicationConsistencyError) throw error;
    fail("journal or index JSON is malformed", code);
  }
}

function listDirectories(root: string, relative: string): string[] {
  const directory = assertInside(root, path.join(root, relative), "scan directory");
  if (!fs.existsSync(directory)) return [];
  assertNoSymlinkComponents(root, directory);
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  if (entries.length > MAX_SCAN_ENTRIES) fail("directory scan exceeds the reconciliation limit", "scan_limit");
  return entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name);
}

function fileExists(root: string, relative: string): boolean {
  const candidate = assertInside(root, path.join(root, assertSafeRelative(relative, "file path")), "file path");
  if (!fs.existsSync(candidate)) return false;
  assertNoSymlinkComponents(root, candidate);
  return fs.lstatSync(candidate).isFile();
}

function parseObjectJson(value: string, label: string): Record<string, unknown> {
  try { return object(JSON.parse(value) as unknown, label); } catch (error) {
    if (error instanceof PublicationConsistencyError) throw error;
    fail(`${label} is malformed`, "submission_metadata_corrupt");
  }
}

function parseArchitectures(value: string): StoredArchitecture[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { fail("submission architectures are malformed", "submission_metadata_corrupt"); }
  if (!Array.isArray(parsed)) fail("submission architectures are not an array", "submission_metadata_corrupt");
  return parsed.map((item) => object(item, "submission architecture is malformed") as StoredArchitecture);
}

function imageMime(data: Uint8Array | null): string | null {
  if (!data) return null;
  if (Buffer.from(data.subarray(0, 8)).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (Buffer.from(data.subarray(0, 3)).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  return null;
}

function parseOperation(value: unknown): PublicationOperation {
  const raw = object(value, "publication operation is malformed");
  if (raw.journalVersion !== 1 || typeof raw.operationId !== "string" || typeof raw.submissionId !== "number" || typeof raw.gameId !== "string" || typeof raw.version !== "string" || typeof raw.expectedIndexSha256 !== "string" || typeof raw.indexStagedRelative !== "string" || typeof raw.indexBackupRelative !== "string" || typeof raw.createdAt !== "string" || typeof raw.updatedAt !== "string" || !PUBLICATION_STATES.includes(raw.state as PublicationState) || !Array.isArray(raw.variants)) {
    fail("publication operation is malformed", "journal_corrupt");
  }
  const variants = raw.variants.map((item) => {
    const variant = object(item, "publication variant is malformed");
    if (typeof variant.architecture !== "string" || typeof variant.sourceRelative !== "string" || typeof variant.targetRelative !== "string" || typeof variant.stagedRelative !== "string" || typeof variant.backupRelative !== "string" || typeof variant.expectedSha256 !== "string" || (variant.previousSha256 !== null && typeof variant.previousSha256 !== "string") || typeof variant.size !== "number" || variant.metadata === null || typeof variant.metadata !== "object" || Array.isArray(variant.metadata) || (variant.colophon !== null && (typeof variant.colophon !== "object" || Array.isArray(variant.colophon)))) fail("publication variant is malformed", "journal_corrupt");
    return variant as unknown as PublicationVariantPlan;
  });
  if (raw.reviewedMetadata !== undefined && (raw.reviewedMetadata === null || typeof raw.reviewedMetadata !== "object" || Array.isArray(raw.reviewedMetadata))) fail("publication reviewed metadata is malformed", "journal_corrupt");
  if (raw.reviewer !== undefined) {
    const reviewer = object(raw.reviewer, "publication reviewer is malformed");
    if (!Number.isSafeInteger(reviewer.id) || (reviewer.id as number) <= 0 || typeof reviewer.name !== "string" || !reviewer.name) fail("publication reviewer is malformed", "journal_corrupt");
  }
  const operationKind = raw.operationKind === undefined ? "submission" : raw.operationKind;
  if (operationKind !== "submission" && operationKind !== "catalog") fail("publication operation kind is malformed", "journal_corrupt");
  if (operationKind === "catalog" && raw.catalogAction !== "update" && raw.catalogAction !== "delete") fail("catalog operation action is malformed", "journal_corrupt");
  return { ...raw, variants } as unknown as PublicationOperation;
}

function statusForFindings(findings: readonly ReconciliationFinding[]): ReconciliationClassification {
  if (findings.length === 0) return "CONSISTENT";
  if (findings.some((finding) => finding.classification === "CORRUPT")) return "CORRUPT";
  if (findings.some((finding) => finding.classification === "AMBIGUOUS")) return "AMBIGUOUS";
  return "RECOVERABLE";
}

export interface PublicationConsistencyOptions {
  readonly root: string;
  readonly database: Database.Database;
  readonly fault?: (point: FaultPoint) => void;
}

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

  private withLock<T>(callback: () => T): T {
    const token = crypto.randomUUID();
    const record: LockRecord = { pid: process.pid, token, createdAt: isoNow() };
    try {
      const fd = fs.openSync(this.lockPath, "wx", 0o600);
      try { fs.writeSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let existing: LockRecord;
      try { existing = JSON.parse(fs.readFileSync(this.lockPath, "utf8")) as LockRecord; } catch { fail("publication lock is malformed", "publication_lock_ambiguous"); }
      const age = Date.now() - Date.parse(existing.createdAt);
      let alive = true;
      try { process.kill(existing.pid, 0); } catch { alive = false; }
      if (alive || !Number.isFinite(age) || age < LOCK_MIN_AGE_MS) fail("publication lock is held", "publication_lock_held", existing);
      const stale = `${this.lockPath}.stale-${crypto.randomUUID()}`;
      fs.renameSync(this.lockPath, stale);
      try { fs.unlinkSync(stale); } catch { /* preserve a stale lock if cleanup is denied */ }
      return this.withLock(callback);
    }
    try { return callback(); } finally {
      try {
        const current = JSON.parse(fs.readFileSync(this.lockPath, "utf8")) as LockRecord;
        if (current.token === token) fs.unlinkSync(this.lockPath);
      } catch { /* a crash or external change is reconciled explicitly */ }
    }
  }

  private loadIndex(): { index: Record<string, unknown>; hash: string | null } {
    const indexPath = path.join(this.root, "index.json");
    if (!fs.existsSync(indexPath)) return { index: { abi: INDEX_ABI, updated_at: isoNow(), games: {} }, hash: null };
    const bytes = readBounded(indexPath, MAX_INDEX_BYTES, "index_corrupt");
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")) as unknown; } catch { fail("catalog index is malformed", "index_corrupt"); }
    const index = object(parsed, "catalog index is malformed");
    if (index.abi !== undefined && index.abi !== INDEX_ABI) fail("catalog index ABI is unsupported", "index_corrupt");
    if (index.games === null || typeof index.games !== "object" || Array.isArray(index.games)) fail("catalog index games is malformed", "index_corrupt");
    return { index: clone(index), hash: sha256(bytes) };
  }

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
      const loaded = this.loadIndex();
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
      const expectedIndex = this.indexForOperation(loaded.index, gameId, version, variants, createdAt);
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
    const loaded = this.loadIndex();
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
    const expectedIndex = this.catalogIndexForOperation(loaded.index, gameId, version, variants, action, createdAt);
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

  private catalogIndexForOperation(
    index: Record<string, unknown>,
    gameId: string,
    version: string,
    variants: readonly PublicationVariantPlan[],
    action: CatalogMutationAction,
    updatedAt: string
  ): Record<string, unknown> {
    const next = clone(index);
    next.abi = INDEX_ABI;
    next.updated_at = updatedAt;
    const games = object(next.games, "catalog index games is malformed");
    const game = object(games[gameId], "game not found");
    const versions = object(game.versions, "catalog versions are malformed");
    const versionRecord = object(versions[version], "version not found");
    const architectures = object(versionRecord.architectures, "catalog architectures are malformed");
    if (action === "delete") {
      for (const variant of variants) delete architectures[variant.architecture];
      if (Object.keys(architectures).length === 0) delete versions[version];
      else versionRecord.architectures = architectures;
      if (Object.keys(versions).length === 0) delete games[gameId];
      else {
        if (game.latest_version === version && !Object.hasOwn(versions, version)) game.latest_version = Object.keys(versions).sort().at(-1);
        game.updated_at = updatedAt;
      }
      next.games = games;
      return next;
    }
    const first = variants[0];
    if (!first?.metadata) fail("catalog metadata is unavailable", "catalog_inconsistent");
    const metadata = first.metadata;
    game.title = metadata.title;
    game.summary = typeof metadata.summary === "string" ? metadata.summary : "";
    game.authors = Array.isArray(metadata.authors) ? metadata.authors : [];
    game.tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    game.updated_at = updatedAt;
    for (const variant of variants) {
      const previous = object(architectures[variant.architecture], "catalog variant is malformed");
      architectures[variant.architecture] = {
        ...previous,
        architecture: variant.architecture,
        filename: variant.targetRelative,
        size: variant.size,
        sha256: variant.expectedSha256,
        icon_mime: variant.iconMime,
        screenshot_mime: variant.screenshotMime,
        has_screenshot: variant.hasScreenshot,
        has_signature: variant.hasSignature,
        updated_at: updatedAt
      };
    }
    versionRecord.metadata = metadata;
    versionRecord.colophon = first.colophon;
    versionRecord.architectures = architectures;
    versionRecord.updated_at = updatedAt;
    versions[version] = versionRecord;
    game.versions = versions;
    games[gameId] = game;
    next.games = games;
    return next;
  }

  private indexForOperation(index: Record<string, unknown>, gameId: string, version: string, variants: readonly PublicationVariantPlan[], updatedAt: string): Record<string, unknown> {
    const next = clone(index);
    next.abi = INDEX_ABI;
    next.updated_at = updatedAt;
    const games = object(next.games ?? {}, "catalog index games is malformed");
    const currentGame = object(games[gameId] ?? { id: gameId, created_at: next.updated_at, versions: {} }, "catalog game is malformed");
    const versions = object(currentGame.versions ?? {}, "catalog versions are malformed");
    const currentVersion = object(versions[version] ?? { version, published_at: next.updated_at, architectures: {} }, "catalog version is malformed");
    const architectures = object(currentVersion.architectures ?? {}, "catalog architectures are malformed");
    const first = variants[0];
    if (!first) fail("publication has no variants", "submission_metadata_corrupt");
    const metadata = first.metadata;
    currentGame.id = gameId;
    currentGame.title = metadata.title;
    currentGame.summary = typeof metadata.summary === "string" ? metadata.summary : "";
    currentGame.authors = Array.isArray(metadata.authors) ? metadata.authors : [];
    currentGame.tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    currentGame.latest_version = version;
    currentGame.updated_at = next.updated_at;
    for (const variant of variants) {
      const previous = object(architectures[variant.architecture] ?? {}, "catalog variant is malformed");
      architectures[variant.architecture] = {
        ...previous,
        architecture: variant.architecture,
        filename: variant.targetRelative,
        size: variant.size,
        sha256: variant.expectedSha256,
        icon_mime: variant.iconMime,
        screenshot_mime: variant.screenshotMime,
        has_screenshot: variant.hasScreenshot,
        has_signature: variant.hasSignature,
        updated_at: next.updated_at
      };
    }
    currentVersion.version = version;
    currentVersion.updated_at = next.updated_at;
    currentVersion.metadata = metadata;
    currentVersion.colophon = first.colophon;
    currentVersion.architectures = architectures;
    versions[version] = currentVersion;
    currentGame.versions = versions;
    games[gameId] = currentGame;
    next.games = games;
    return next;
  }

  stage(operationId: string): PublicationOperation {
    return this.withLock(() => {
      let operation = this.readOperation(operationId);
      if (operation.state === "STAGED" || operation.state === "VERIFIED") return operation;
      if (operation.state !== "PREPARED") fail("operation cannot be staged from its current state", "invalid_operation_transition");
      const loaded = this.loadIndex();
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
      const expectedIndex = this.indexForOperation(loaded.index, operation.gameId, operation.version, operation.variants, operation.createdAt);
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
      const indexBytes = readBounded(assertInside(this.root, path.join(this.root, operation.indexStagedRelative), "staged index"), MAX_INDEX_BYTES, "staged_index_corrupt");
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
    const loaded = this.loadIndex();
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
      ? this.catalogIndexForOperation(loaded.index, operation.gameId, operation.version, operation.variants, operation.catalogAction as CatalogMutationAction, operation.createdAt)
      : this.indexForOperation(loaded.index, operation.gameId, operation.version, operation.variants, operation.createdAt);
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
    const index = readBounded(assertInside(this.root, path.join(this.root, operation.indexStagedRelative), "staged index"), MAX_INDEX_BYTES, "staged_index_corrupt");
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
    const findings: ReconciliationFinding[] = [];
    const add = (finding: ReconciliationFinding) => findings.push(finding);
    let rows: SubmissionRow[] = [];
    try { rows = this.database.prepare("SELECT id, game_id, version, status, pending_dir, metadata_json, architectures_json FROM cartridge_submissions ORDER BY id").all() as SubmissionRow[]; }
    catch { add({ code: "SUBMISSION_TABLE_UNAVAILABLE", classification: "CORRUPT", message: "cartridge_submissions cannot be inspected" }); }
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const pendingKeys = new Set(rows.filter((row) => row.status === "pending").map((row) => `${row.game_id}/${row.version}`));
    const verifiedExpectations: Array<{ row: SubmissionRow; gameId: string; version: string; architecture: string }> = [];
    const safeDirectoryExists = (relative: string): boolean => {
      try {
        const candidate = assertInside(this.root, path.join(this.root, assertSafeRelative(relative, "pending directory")), "pending directory");
        assertNoSymlinkComponents(this.root, candidate);
        return fs.existsSync(candidate) && fs.lstatSync(candidate).isDirectory();
      } catch (error) {
        add({ code: "UNSAFE_PUBLICATION_PATH", classification: "CORRUPT", message: error instanceof Error ? error.message : "publication path is unsafe", path: relative });
        return false;
      }
    };
    const safeFileExists = (relative: string): boolean => {
      try { return Boolean(relative) && fileExists(this.root, relative); }
      catch (error) {
        add({ code: "UNSAFE_PUBLICATION_PATH", classification: "CORRUPT", message: error instanceof Error ? error.message : "publication path is unsafe", path: relative });
        return false;
      }
    };
    for (const row of rows) {
      const pendingDirectory = row.pending_dir || `${PENDING_ROOT}/${row.id}`;
      const hasPendingDirectory = safeDirectoryExists(pendingDirectory);
      if (row.status === "pending" && !hasPendingDirectory) add({ code: "PENDING_ROW_WITHOUT_DIRECTORY", classification: "RECOVERABLE", message: "pending database row has no pending directory", submissionId: row.id, path: pendingDirectory });
      if (row.status !== "pending" && hasPendingDirectory) add({ code: "VERIFIED_SUBMISSION_WITH_PENDING_ARTIFACTS", classification: "RECOVERABLE", message: "non-pending submission still has pending artifacts", submissionId: row.id, path: pendingDirectory });
      if (row.status === "pending") {
        let architectures: StoredArchitecture[] = [];
        try { architectures = parseArchitectures(row.architectures_json); }
        catch (error) {
          add({ code: "SUBMISSION_METADATA_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "submission architectures are malformed", submissionId: row.id });
        }
        for (const item of architectures) {
          const stored = typeof item.stored === "string" ? item.stored : "";
          if (!stored || !safeFileExists(stored)) add({ code: "MISSING_PENDING_VARIANT", classification: "RECOVERABLE", message: "pending row references a missing architecture file", submissionId: row.id, path: stored });
        }
      }
      if (row.status === "verified") {
        let gameId = row.game_id;
        let version = row.version;
        try {
          const metadata = parseObjectJson(row.metadata_json, "submission metadata");
          gameId = safeGameId(typeof metadata.id === "string" ? metadata.id : row.game_id);
          version = safeVersion(typeof metadata.version === "string" ? metadata.version : row.version);
        } catch (error) {
          add({ code: "SUBMISSION_METADATA_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "submission metadata is malformed", submissionId: row.id });
        }
        try {
          for (const item of parseArchitectures(row.architectures_json)) {
            if (typeof item.architecture === "string" && item.architecture) verifiedExpectations.push({ row, gameId, version, architecture: item.architecture });
          }
        } catch (error) {
          add({ code: "SUBMISSION_METADATA_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "submission architectures are malformed", submissionId: row.id });
        }
      }
    }
    let pendingDirectories: string[] = [];
    try { pendingDirectories = listDirectories(this.root, PENDING_ROOT); } catch (error) { add({ code: "PENDING_SCAN_FAILED", classification: "CORRUPT", message: error instanceof Error ? error.message : "pending directory cannot be scanned" }); }
    for (const directory of pendingDirectories) {
      const id = Number(directory);
      if (!Number.isSafeInteger(id) || !rowById.has(id)) add({ code: "ORPHAN_PENDING_DIRECTORY", classification: "AMBIGUOUS", message: "pending directory has no database row", path: `${PENDING_ROOT}/${directory}` });
    }
    const loaded = (() => { try { return this.loadIndex().index; } catch (error) { add({ code: "INDEX_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "catalog index is corrupt", path: "index.json" }); return null; } })();
    const indexedFiles = new Set<string>();
    const indexedKeys = new Set<string>();
    if (loaded) {
      try {
        const games = object(loaded.games, "catalog index games is malformed");
        for (const [gameId, game] of Object.entries(games)) {
          const gameRecord = object(game, "catalog game is malformed");
          const versions = object(gameRecord.versions, "catalog versions are malformed");
          for (const [versionId, version] of Object.entries(versions)) {
            indexedKeys.add(`${gameId}/${versionId}`);
            const versionRecord = object(version, "catalog version is malformed");
            const architectures = object(versionRecord.architectures, "catalog architectures are malformed");
            for (const variant of Object.values(architectures)) {
              const record = object(variant, "catalog variant is malformed");
              const filename = typeof record.filename === "string" ? record.filename : "";
              if (!filename || !safeFileExists(filename)) add({ code: "INDEX_ENTRY_MISSING_FILE", classification: "CORRUPT", message: "index entry points to a missing file", path: filename });
              else {
                indexedFiles.add(filename);
                if (typeof record.sha256 === "string" && sha256File(assertInside(this.root, path.join(this.root, filename), "catalog file")) !== record.sha256) add({ code: "PUBLISHED_HASH_MISMATCH", classification: "CORRUPT", message: "published file hash differs from index", path: filename });
              }
            }
          }
        }
        for (const expectation of verifiedExpectations) {
          const target = `${CARTRIDGE_ROOT}/${expectation.gameId}/${expectation.version}/${expectation.architecture}.prg32`;
          if (!indexedFiles.has(target)) add({ code: "SUBMISSION_MARKED_VERIFIED_WITHOUT_PUBLICATION", classification: "AMBIGUOUS", message: "verified submission architecture is absent from the catalog index", submissionId: expectation.row.id, path: target });
          if (!safeFileExists(target)) add({ code: "MISSING_ARCHITECTURE_VARIANT", classification: "CORRUPT", message: "verified submission architecture file is missing", submissionId: expectation.row.id, path: target });
        }
        for (const key of pendingKeys) if (indexedKeys.has(key)) add({ code: "PUBLISHED_ARTIFACT_PENDING_SUBMISSION", classification: "RECOVERABLE", message: "catalog index contains an artifact whose submission is still pending", path: key });
        const cartridges = assertInside(this.root, path.join(this.root, CARTRIDGE_ROOT), "cartridge directory");
        if (fs.existsSync(cartridges)) {
          const walk = (directory: string, relative: string, depth: number): void => {
            if (depth > 4) return;
            const entries = fs.readdirSync(directory, { withFileTypes: true });
            if (entries.length > MAX_SCAN_ENTRIES) fail("cartridge scan exceeds the reconciliation limit", "scan_limit");
            for (const entry of entries) {
              if (entry.isSymbolicLink()) add({ code: "UNSAFE_CARTRIDGE_OBJECT", classification: "CORRUPT", message: "published catalog contains a symlink", path: `${relative}/${entry.name}` });
              else if (entry.isDirectory()) walk(path.join(directory, entry.name), `${relative}/${entry.name}`, depth + 1);
              else if (entry.isFile() && entry.name.endsWith(".prg32")) {
                const publishedPath = `${relative}/${entry.name}`;
                if (!indexedFiles.has(publishedPath)) add({ code: "PUBLISHED_FILE_MISSING_FROM_INDEX", classification: "AMBIGUOUS", message: "published cartridge is not referenced by index", path: publishedPath });
              }
            }
          };
          walk(cartridges, CARTRIDGE_ROOT, 0);
        }
      } catch (error) {
        add({ code: "INDEX_SCHEMA_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "catalog index structure is malformed", path: "index.json" });
      }
    }
    const operations: PublicationOperation[] = [];
    try {
      for (const operationId of listDirectories(this.root, JOURNAL_ROOT)) {
        try { operations.push(this.readOperation(operationId)); }
        catch (error) { add({ code: "JOURNAL_CORRUPT", classification: "CORRUPT", message: error instanceof Error ? error.message : "publication journal is corrupt", operationId }); }
      }
    } catch (error) { add({ code: "JOURNAL_SCAN_FAILED", classification: "CORRUPT", message: error instanceof Error ? error.message : "publication journal cannot be scanned" }); }
    const intentionallyDeletedTargets = new Set(
      operations
        .filter((operation) => operation.operationKind === "catalog" && operation.catalogAction === "delete" && operation.state === "COMPLETED")
        .flatMap((operation) => operation.variants.map((variant) => variant.targetRelative))
    );
    for (let index = findings.length - 1; index >= 0; index -= 1) {
      const finding = findings[index];
      if (finding && (finding.code === "SUBMISSION_MARKED_VERIFIED_WITHOUT_PUBLICATION" || finding.code === "MISSING_ARCHITECTURE_VARIANT") && finding.path && intentionallyDeletedTargets.has(finding.path)) {
        findings.splice(index, 1);
      }
    }
    const targetOwners = new Map<string, PublicationOperation[]>();
    for (const operation of operations) {
      if (!["COMPLETED", "COMPENSATED", "FAILED"].includes(operation.state)) {
        const recovery: Exclude<ReconciliationClassification, "CONSISTENT"> = operation.state === "RECOVERY_REQUIRED" || operation.state === "COMPENSATING" ? "AMBIGUOUS" : "RECOVERABLE";
        add({ code: operation.state === "COMPENSATING" ? "INTERRUPTED_COMPENSATION" : "INCOMPLETE_PUBLICATION", classification: recovery, message: `publication operation is ${operation.state}`, operationId: operation.operationId, submissionId: operation.submissionId });
      }
      for (const variant of operation.variants) {
        const owners = targetOwners.get(variant.targetRelative) ?? [];
        owners.push(operation);
        targetOwners.set(variant.targetRelative, owners);
      }
      if (operation.state === "VERIFIED" && !safeFileExists(operation.indexStagedRelative)) add({ code: "VERIFIED_OPERATION_MISSING_INDEX_STAGE", classification: "AMBIGUOUS", message: "verified operation has no staged index", operationId: operation.operationId });
    }
    for (const [target, owners] of targetOwners) if (owners.length > 1 && owners.some((operation) => !["COMPLETED", "COMPENSATED", "FAILED"].includes(operation.state))) add({ code: "CONFLICTING_PUBLICATION_RECORDS", classification: "AMBIGUOUS", message: "multiple operations target the same published artifact", path: target, details: { operation_ids: owners.map((operation) => operation.operationId) } });
    const recoverablePublicationKeys = new Set(operations.filter((operation) => !["COMPLETED", "COMPENSATED", "FAILED"].includes(operation.state)).map((operation) => `${operation.gameId}/${operation.version}`));
    for (let index = 0; index < findings.length; index += 1) {
      const finding = findings[index];
      if (finding?.code === "PUBLISHED_ARTIFACT_PENDING_SUBMISSION" && finding.path && !recoverablePublicationKeys.has(finding.path)) {
        findings[index] = { ...finding, classification: "AMBIGUOUS", message: "catalog index contains an artifact whose pending submission has no recoverable publication operation" };
      }
    }
    for (const root of [STAGING_ROOT, JOURNAL_ROOT]) {
      try {
        const directory = assertInside(this.root, path.join(this.root, root), "temporary scan");
        if (fs.existsSync(directory)) {
          const scan = (current: string, relative: string): void => {
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
              const next = path.join(current, entry.name);
              const nextRelative = `${relative}/${entry.name}`;
              if (entry.isSymbolicLink()) add({ code: "UNSAFE_PUBLICATION_OBJECT", classification: "CORRUPT", message: "publication workspace contains a symlink", path: nextRelative });
              else if (entry.isDirectory()) scan(next, nextRelative);
              else if (entry.name.includes(".tmp-")) add({ code: "STALE_TEMPORARY_FILE", classification: "RECOVERABLE", message: "temporary publication file remains", path: nextRelative });
            }
          };
          scan(directory, root);
        }
      } catch (error) { add({ code: "TEMPORARY_SCAN_FAILED", classification: "CORRUPT", message: error instanceof Error ? error.message : "publication temporary area cannot be scanned", path: root }); }
    }
    return { status: statusForFindings(findings), checkedAt: isoNow(), root: this.root, findings, counts: Object.fromEntries(findings.reduce((map, finding) => map.set(finding.code, (map.get(finding.code) ?? 0) + 1), new Map<string, number>())) };
  }
}
