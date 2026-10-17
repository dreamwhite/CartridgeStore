import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { KeyRegistry, type EncryptionKey } from "../secrets/registry.js";
import { BackupError } from "../backup/format.js";
import {
  CANONICAL_BACKUP_AUTHORIZATION,
  CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION,
  createCanonicalBackup,
  restoreCanonicalBackup,
  verifyCanonicalBackup,
  type CanonicalRestoreResult
} from "./backup.js";
import { CanonicalWriterLease } from "./writer-lock.js";
import { TARGET_VERSION_TUPLE } from "./schema.js";
import {
  ENCRYPTED_BACKUP_CHUNK_BYTES,
  parseEncryptedBackupEnvelope,
  requireRegularBackupFile,
  resolveEncryptedBackupPath,
  sha256EncryptedBackupFile,
  writeEncryptedBackupEnvelope,
  type ParsedEncryptedBackupEnvelope,
} from "./backup-v4-files.js";
import {
  BACKUP_V4_KEY_BYTES,
  BACKUP_V4_NONCE_BYTES,
  BACKUP_V4_TAG_BYTES,
  canonicalBackupJson,
  decodeBackupV4Base64,
  encryptedBackupLimits,
  isBackupV4KeyId,
  requireEncryptedBackupAuthorization,
  unwrapBackupV4DataKey,
  wrapBackupV4DataKey,
} from "./backup-v4-codecs.js";
import {
  DEFAULT_ENCRYPTED_BACKUP_V4_LIMITS,
  ENCRYPTED_BACKUP_V4_ABI,
  ENCRYPTED_BACKUP_V4_OPERATIONAL_AUTHORIZATION,
  ENCRYPTED_BACKUP_V4_VERSION,
  RETENTION_AUTHORIZATION,
  type BackupKeyProvider,
  type BackupKeyRecord,
  type BackupKeyRotationOptions,
  type CreateEncryptedBackupOptions,
  type EncryptedBackupV4FaultPoint,
  type EncryptedBackupV4Header,
  type EncryptedBackupV4Limits,
  type EncryptedBackupV4Result,
  type RetentionOptions,
  type RetentionResult,
  type RestoreEncryptedBackupOptions,
  type VerifiedEncryptedBackupV4,
  type VerifyEncryptedBackupOptions,
} from "./backup-v4-contracts.js";

export {
  DEFAULT_ENCRYPTED_BACKUP_V4_LIMITS,
  ENCRYPTED_BACKUP_V4_ABI,
  ENCRYPTED_BACKUP_V4_AUTHORIZATION,
  ENCRYPTED_BACKUP_V4_OPERATIONAL_AUTHORIZATION,
  ENCRYPTED_BACKUP_V4_VERSION,
  RETENTION_AUTHORIZATION,
} from "./backup-v4-contracts.js";
export type {
  BackupKeyProvider,
  BackupKeyRecord,
  BackupKeyRotationOptions,
  BackupKeyStatus,
  CreateEncryptedBackupOptions,
  EncryptedBackupV4FaultPoint,
  EncryptedBackupV4Header,
  EncryptedBackupV4Limits,
  EncryptedBackupV4Result,
  RetentionOptions,
  RetentionResult,
  RestoreEncryptedBackupOptions,
  VerifiedEncryptedBackupV4,
  VerifyEncryptedBackupOptions,
} from "./backup-v4-contracts.js";

export class KeyRegistryBackupKeyProvider implements BackupKeyProvider {
  constructor(private readonly registry: KeyRegistry) {}

  active(): BackupKeyRecord {
    return this.convert(this.registry.active());
  }

  resolve(keyId: string): BackupKeyRecord | undefined {
    if (!this.registry.has(keyId)) return undefined;
    return this.convert(this.registry.require(keyId));
  }

  private convert(key: EncryptionKey): BackupKeyRecord {
    return { id: key.id, material: Buffer.from(key.material), status: key.status };
  }
}

/** Disposable fixture provider used by tests and recovery rehearsals. */
export class InMemoryBackupKeyProvider implements BackupKeyProvider {
  private readonly keys = new Map<string, BackupKeyRecord>();
  private activeId: string;

  constructor(records: readonly BackupKeyRecord[], activeId?: string) {
    if (records.length === 0) throw new BackupError("at least one backup key is required", "backup_v4_key_registry_invalid");
    for (const record of records) this.add(record);
    this.activeId = activeId ?? records.find((record) => record.status === "active")?.id ?? "";
    if (!this.activeId || this.keys.get(this.activeId)?.status !== "active") throw new BackupError("an active backup key is required", "backup_v4_active_key_invalid");
  }

  active(): BackupKeyRecord { return this.require(this.activeId); }
  resolve(keyId: string): BackupKeyRecord | undefined { return this.keys.get(keyId); }

  rotate(record: BackupKeyRecord): void {
    const current = this.active();
    this.keys.set(current.id, { ...current, status: "decrypt-only" });
    this.add({ ...record, status: "active" });
    this.activeId = record.id;
  }

  retire(keyId: string): void {
    const record = this.require(keyId);
    if (record.id === this.activeId) throw new BackupError("the active backup key cannot be retired", "backup_v4_active_key_invalid");
    this.keys.set(keyId, { ...record, status: "retired" });
  }

  private add(record: BackupKeyRecord): void {
    if (!isBackupV4KeyId(record.id) || !Buffer.isBuffer(record.material) || record.material.byteLength !== BACKUP_V4_KEY_BYTES || this.keys.has(record.id)) {
      throw new BackupError("backup key metadata is invalid", "backup_v4_key_registry_invalid");
    }
    this.keys.set(record.id, { ...record, material: Buffer.from(record.material) });
  }

  private require(keyId: string): BackupKeyRecord {
    const record = this.keys.get(keyId);
    if (!record) throw new BackupError("backup key is unavailable", "backup_v4_key_unknown");
    return record;
  }
}

/** Writes a new protected registry; it never overwrites the source registry. */
export function rotateBackupKeyRegistry(options: BackupKeyRotationOptions): { readonly outputPath: string; readonly activeKeyId: string; readonly retainedKeyIds: readonly string[] } {
  if (!path.isAbsolute(options.inputRegistryPath) || !path.isAbsolute(options.outputRegistryPath) || !isBackupV4KeyId(options.newKeyId)) throw new BackupError("backup key rotation paths or ID are invalid", "backup_v4_key_rotation_invalid");
  if (path.resolve(options.inputRegistryPath) === path.resolve(options.outputRegistryPath) || fs.existsSync(options.outputRegistryPath)) throw new BackupError("backup key rotation refuses to overwrite a registry", "backup_v4_key_rotation_conflict", 409);
  const current = KeyRegistry.fromFile(options.inputRegistryPath);
  if (current.has(options.newKeyId)) throw new BackupError("backup key rotation ID already exists", "backup_v4_key_rotation_conflict", 409);
  const keys: Array<{ readonly id: string; readonly status: "active" | "decrypt-only"; readonly key: string }> = current.ids().map((id) => { const value = current.require(id); return { id, status: "decrypt-only", key: value.material.toString("base64url") }; });
  keys.push({ id: options.newKeyId, status: "active" as const, key: crypto.randomBytes(BACKUP_V4_KEY_BYTES).toString("base64url") });
  fs.mkdirSync(path.dirname(options.outputRegistryPath), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(options.outputRegistryPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try { fs.writeSync(fd, `${JSON.stringify({ version: 1, active_key_id: options.newKeyId, keys }, null, 2)}\n`, undefined, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { outputPath: options.outputRegistryPath, activeKeyId: options.newKeyId, retainedKeyIds: current.ids() };
}

function markerPath(archivePath: string): string { return `${archivePath}.complete.json`; }

function writeMarker(archivePath: string, header: EncryptedBackupV4Header, bytes: number): string {
  const marker = markerPath(archivePath); const temporary = `${marker}.tmp-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try { fs.writeSync(fd, `${canonicalBackupJson({ abi: ENCRYPTED_BACKUP_V4_ABI, backup_id: header.backup_id, archive_bytes: bytes, archive_sha256: sha256EncryptedBackupFile(archivePath), completed_at: new Date().toISOString() })}\n`, undefined, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, marker); const directory = fs.openSync(path.dirname(marker), fs.constants.O_RDONLY); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); } return marker;
}

function decryptPayload(parsed: ParsedEncryptedBackupEnvelope, archivePath: string, provider: BackupKeyProvider, destination: string, value: EncryptedBackupV4Limits, fault?: (point: EncryptedBackupV4FaultPoint) => void): void {
  fault?.("before-decryption");
  const dataKey = unwrapBackupV4DataKey(parsed.header, provider);
  const temporary = `${destination}.partial-${process.pid}-${crypto.randomUUID()}`;
  const fdIn = fs.openSync(archivePath, "r"); const fdOut = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, decodeBackupV4Base64(parsed.header.nonce, BACKUP_V4_NONCE_BYTES, "nonce"), { authTagLength: BACKUP_V4_TAG_BYTES });
  decipher.setAAD(parsed.headerRaw); decipher.setAuthTag(parsed.tag);
  const hash = crypto.createHash("sha256"); let position = 0;
  try {
    const input = Buffer.alloc(ENCRYPTED_BACKUP_CHUNK_BYTES);
    while (position < parsed.ciphertextBytes) {
      const count = fs.readSync(fdIn, input, 0, Math.min(input.length, parsed.ciphertextBytes - position), parsed.ciphertextOffset + position);
      if (count === 0) throw new BackupError("backup v4 ciphertext is truncated", "backup_v4_archive_truncated");
      position += count; const plain = decipher.update(input.subarray(0, count)); if (plain.length > 0) { hash.update(plain); fs.writeSync(fdOut, plain); } fault?.("during-decryption");
    }
    const final = decipher.final(); if (final.length > 0) { hash.update(final); fs.writeSync(fdOut, final); }
    fs.fsyncSync(fdOut);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("backup v4 authentication failed", "backup_v4_authentication_failed", 400, { cause: error });
  } finally { fs.closeSync(fdIn); fs.closeSync(fdOut); }
  const stats = requireRegularBackupFile(temporary, "backup_v4_payload_invalid");
  if (stats.size !== parsed.header.payload_archive_bytes || hash.digest("hex") !== parsed.header.payload_archive_sha256) {
    fs.rmSync(temporary, { force: true }); throw new BackupError("backup v4 payload integrity failed", "backup_v4_payload_integrity");
  }
  fs.renameSync(temporary, destination); fault?.("after-decryption");
  void value;
}

function decryptAndVerify(archivePath: string, provider: BackupKeyProvider, value: EncryptedBackupV4Limits, fault?: (point: EncryptedBackupV4FaultPoint) => void): { readonly parsed: ParsedEncryptedBackupEnvelope; readonly payloadPath: string; readonly payload: ReturnType<typeof verifyCanonicalBackup> } {
  const parsed = parseEncryptedBackupEnvelope(archivePath, value);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-backup-v4-verify-"));
  const payloadPath = path.join(temporaryDirectory, "payload-v3.zip");
  try {
    decryptPayload(parsed, archivePath, provider, payloadPath, value, fault);
    const payload = verifyCanonicalBackup(payloadPath, value.canonical === undefined ? {} : { limits: value.canonical });
    if (payload.archiveSha256 !== parsed.header.payload_archive_sha256 || payload.manifest.backup_id !== parsed.header.backup_id || payload.manifest.canonical_manifest_sha256 !== parsed.header.payload_manifest_sha256) {
      throw new BackupError("backup v4 payload metadata does not match the authenticated header", "backup_v4_metadata_mismatch");
    }
    return { parsed, payloadPath, payload };
  } catch (error) { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); throw error; }
}

export async function createEncryptedCanonicalBackup(options: CreateEncryptedBackupOptions): Promise<EncryptedBackupV4Result> {
  requireEncryptedBackupAuthorization(options.authorization);
  const snapshotMode = options.snapshotMode ?? "exclusive";
  if (snapshotMode !== "exclusive" && snapshotMode !== "online") throw new BackupError("backup v4 snapshot mode is invalid", "backup_v4_snapshot_mode_invalid", 400);
  if (snapshotMode === "exclusive" && !options.writerQuiesced) throw new BackupError("writer quiescence is required for encrypted backup", "backup_v4_writer_not_quiesced", 409);
  const sourceRoot = resolveEncryptedBackupPath(options.sourceRoot, "source root"); const outputPath = resolveEncryptedBackupPath(options.outputPath, "output path"); const value = encryptedBackupLimits(options.limits);
  const relativeOutput = path.relative(sourceRoot, outputPath);
  if (relativeOutput === "" || (!relativeOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeOutput))) throw new BackupError("encrypted backup output may not be inside the source root", "backup_v4_output_unsafe");
  if (fs.existsSync(outputPath) || fs.existsSync(markerPath(outputPath))) throw new BackupError("completed encrypted backup output already exists", "backup_v4_output_exists", 409);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const lease = snapshotMode === "exclusive" ? new CanonicalWriterLease(sourceRoot) : undefined; const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-backup-v4-create-")); const payloadPath = path.join(temporaryDirectory, "payload-v3.zip");
  try {
    const canonicalAuthorization = options.authorization === ENCRYPTED_BACKUP_V4_OPERATIONAL_AUTHORIZATION ? CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION : CANONICAL_BACKUP_AUTHORIZATION;
    const payload = await createCanonicalBackup({ sourceRoot, outputPath: payloadPath, authorization: canonicalAuthorization, writerQuiesced: options.writerQuiesced, snapshotMode, ...(value.canonical === undefined ? {} : { limits: value.canonical }) });
    options.fault?.("after-payload-created");
    const active = options.keyProvider.active(); const dataKey = crypto.randomBytes(BACKUP_V4_KEY_BYTES); const wrapped = wrapBackupV4DataKey(dataKey, active);
    const header: EncryptedBackupV4Header = {
      abi: ENCRYPTED_BACKUP_V4_ABI, format_version: ENCRYPTED_BACKUP_V4_VERSION, application: "prg32-cartridge-store", backup_id: payload.backupId, created_at: new Date().toISOString(), payload_abi: "prg32-cartridge-store-backup-3.0", payload_format_version: 3, versions: TARGET_VERSION_TUPLE, payload_archive_bytes: payload.archiveBytes, payload_archive_sha256: payload.archiveSha256, payload_manifest_sha256: payload.manifest.canonical_manifest_sha256, key_id: active.id, cipher: "aes-256-gcm", key_wrap: "aes-256-gcm", nonce: crypto.randomBytes(BACKUP_V4_NONCE_BYTES).toString("base64url"), wrapped_key: wrapped.wrapped.toString("base64url"), wrap_nonce: wrapped.nonce.toString("base64url"), wrap_tag: wrapped.tag.toString("base64url"), tag_bytes: BACKUP_V4_TAG_BYTES
    };
    const envelopeBytes = writeEncryptedBackupEnvelope(outputPath, payloadPath, header, dataKey, value, options.fault);
    const marker = writeMarker(outputPath, header, envelopeBytes);
    return { backupId: header.backup_id, archivePath: outputPath, completionMarker: marker, header, envelopeBytes };
  } catch (error) {
    if (fs.existsSync(outputPath) && !fs.existsSync(markerPath(outputPath))) { try { fs.renameSync(outputPath, `${outputPath}.incomplete-${crypto.randomUUID()}`); } catch { /* preserve the original error */ } }
    if (error instanceof BackupError) throw error;
    throw new BackupError("encrypted backup creation failed", "backup_v4_creation_failed", 500, { cause: error });
  } finally { lease?.close(); fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
}

export function inspectEncryptedBackup(archivePathValue: string, options: { readonly limits?: Partial<EncryptedBackupV4Limits> } = {}): EncryptedBackupV4Header {
  const archivePath = resolveEncryptedBackupPath(archivePathValue, "archive path"); const value = encryptedBackupLimits(options.limits); parseCompletionMarker(archivePath); return parseEncryptedBackupEnvelope(archivePath, value).header;
}

function parseCompletionMarker(archivePath: string): void {
  const marker = markerPath(archivePath); if (!fs.existsSync(marker)) throw new BackupError("encrypted backup completion marker is missing", "backup_v4_incomplete", 409); requireRegularBackupFile(marker, "backup_v4_marker_invalid");
}

export function verifyEncryptedBackup(archivePathValue: string, options: VerifyEncryptedBackupOptions): VerifiedEncryptedBackupV4 {
  const archivePath = resolveEncryptedBackupPath(archivePathValue, "archive path"); const value = encryptedBackupLimits(options.limits); parseCompletionMarker(archivePath); const verified = decryptAndVerify(archivePath, options.keyProvider, value, options.fault);
  return { backupId: verified.parsed.header.backup_id, archivePath, completionMarker: markerPath(archivePath), header: verified.parsed.header, envelopeBytes: verified.parsed.sizeBytes, payloadManifest: verified.payload.manifest, payloadArchiveSha256: verified.payload.archiveSha256 };
}

export function restoreEncryptedBackup(options: RestoreEncryptedBackupOptions): CanonicalRestoreResult {
  requireEncryptedBackupAuthorization(options.authorization);
  const archivePath = resolveEncryptedBackupPath(options.archivePath, "archive path"); const targetRoot = resolveEncryptedBackupPath(options.targetRoot, "target root"); const value = encryptedBackupLimits(options.limits); parseCompletionMarker(archivePath);
  const verified = decryptAndVerify(archivePath, options.keyProvider, value, options.fault);
  const temporaryDirectory = path.dirname(verified.payloadPath);
  try {
    return restoreCanonicalBackup({ archivePath: verified.payloadPath, targetRoot, authorization: CANONICAL_BACKUP_AUTHORIZATION, ...(value.canonical === undefined ? {} : { limits: value.canonical }), ...(options.restoreFault === undefined ? {} : { fault: options.restoreFault }) });
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
}

export function applyBackupRetention(options: RetentionOptions): RetentionResult {
  const directory = resolveEncryptedBackupPath(options.directory, "backup retention directory");
  if (!Number.isSafeInteger(options.keepNewest) || options.keepNewest < 0) throw new BackupError("backup retention keepNewest is invalid", "backup_v4_retention_invalid");
  if (options.apply && options.authorization !== RETENTION_AUTHORIZATION) throw new BackupError("explicit disposable retention authorization is required", "backup_v4_retention_authorization_required", 403);
  const protectedIds = new Set(options.protectedBackupIds ?? []); const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".backup4") && fs.existsSync(markerPath(path.join(directory, entry.name)))).map((entry) => path.join(directory, entry.name)) : [];
  const records = entries.map((filePath) => ({ filePath, header: parseEncryptedBackupEnvelope(filePath, DEFAULT_ENCRYPTED_BACKUP_V4_LIMITS).header })).sort((left, right) => right.header.created_at.localeCompare(left.header.created_at));
  const keep = new Set(records.slice(0, options.keepNewest).map((record) => record.filePath)); const now = Date.now(); const candidates: string[] = []; const protectedFiles: string[] = [];
  for (const record of records) {
    const isProtected = protectedIds.has(record.header.backup_id) || keep.has(record.filePath) || (options.maxAgeMs !== undefined && now - Date.parse(record.header.created_at) <= options.maxAgeMs);
    if (isProtected) protectedFiles.push(record.filePath); else candidates.push(record.filePath);
  }
  const deleted: string[] = [];
  if (options.apply) for (const filePath of candidates) { fs.unlinkSync(filePath); const marker = markerPath(filePath); if (fs.existsSync(marker)) fs.unlinkSync(marker); deleted.push(filePath); }
  return { dryRun: !options.apply, candidates, protectedFiles, deleted };
}
