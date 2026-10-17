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
  DEFAULT_ENCRYPTED_BACKUP_V4_LIMITS,
  ENCRYPTED_BACKUP_V4_ABI,
  ENCRYPTED_BACKUP_V4_AUTHORIZATION,
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

const MAGIC = Buffer.from("PRG32-BACKUP-V4\0", "ascii");
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const CHUNK_BYTES = 1024 * 1024;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
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
    if (!KEY_ID_RE.test(record.id) || !Buffer.isBuffer(record.material) || record.material.byteLength !== KEY_BYTES || this.keys.has(record.id)) {
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
  if (!path.isAbsolute(options.inputRegistryPath) || !path.isAbsolute(options.outputRegistryPath) || !KEY_ID_RE.test(options.newKeyId)) throw new BackupError("backup key rotation paths or ID are invalid", "backup_v4_key_rotation_invalid");
  if (path.resolve(options.inputRegistryPath) === path.resolve(options.outputRegistryPath) || fs.existsSync(options.outputRegistryPath)) throw new BackupError("backup key rotation refuses to overwrite a registry", "backup_v4_key_rotation_conflict", 409);
  const current = KeyRegistry.fromFile(options.inputRegistryPath);
  if (current.has(options.newKeyId)) throw new BackupError("backup key rotation ID already exists", "backup_v4_key_rotation_conflict", 409);
  const keys: Array<{ readonly id: string; readonly status: "active" | "decrypt-only"; readonly key: string }> = current.ids().map((id) => { const value = current.require(id); return { id, status: "decrypt-only", key: value.material.toString("base64url") }; });
  keys.push({ id: options.newKeyId, status: "active" as const, key: crypto.randomBytes(KEY_BYTES).toString("base64url") });
  fs.mkdirSync(path.dirname(options.outputRegistryPath), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(options.outputRegistryPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try { fs.writeSync(fd, `${JSON.stringify({ version: 1, active_key_id: options.newKeyId, keys }, null, 2)}\n`, undefined, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { outputPath: options.outputRegistryPath, activeKeyId: options.newKeyId, retainedKeyIds: current.ids() };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function sha256File(filePath: string): string {
  const fd = fs.openSync(filePath, "r"); const hash = crypto.createHash("sha256"); const buffer = Buffer.alloc(CHUNK_BYTES);
  try {
    while (true) { const count = fs.readSync(fd, buffer, 0, buffer.length, null); if (count === 0) break; hash.update(buffer.subarray(0, count)); }
  } finally { fs.closeSync(fd); }
  return hash.digest("hex");
}

function resolved(value: string, label: string): string {
  if (!value || value.trim() === "") throw new BackupError(`${label} is required`, "backup_v4_path_required");
  const result = path.resolve(value);
  if (result === path.parse(result).root) throw new BackupError(`${label} may not be the filesystem root`, "backup_v4_path_unsafe");
  return result;
}

function limits(value?: Partial<EncryptedBackupV4Limits>): EncryptedBackupV4Limits {
  const result = { ...DEFAULT_ENCRYPTED_BACKUP_V4_LIMITS, ...value };
  for (const key of ["maxEnvelopeBytes", "maxHeaderBytes", "maxPayloadBytes"] as const) {
    const numberValue = result[key];
    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) throw new BackupError(`backup v4 limit ${key} is invalid`, "backup_v4_limit_invalid");
  }
  return result;
}

function requireAuthorization(value: string): void {
  if (value !== ENCRYPTED_BACKUP_V4_AUTHORIZATION && value !== ENCRYPTED_BACKUP_V4_OPERATIONAL_AUTHORIZATION) throw new BackupError("explicit encrypted backup authorization is required", "backup_v4_authorization_required", 403);
}

function regularFile(filePath: string, code: string): fs.Stats {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new BackupError("backup path must be a regular file", code);
  return stats;
}

function base64(value: string, expected: number, field: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) throw new BackupError(`backup v4 ${field} is invalid`, "backup_v4_header_invalid");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== expected || decoded.toString("base64url") !== value) throw new BackupError(`backup v4 ${field} is invalid`, "backup_v4_header_invalid");
  return decoded;
}

function key(record: BackupKeyRecord, requireActive = false): Buffer {
  if (!KEY_ID_RE.test(record.id) || record.material.byteLength !== KEY_BYTES) throw new BackupError("backup key metadata is invalid", "backup_v4_key_registry_invalid");
  if (record.status === "retired" || (requireActive && record.status !== "active")) throw new BackupError("backup key is not usable for this operation", "backup_v4_key_retired", 409);
  return Buffer.from(record.material);
}

function wrapDataKey(dataKey: Buffer, master: BackupKeyRecord): { readonly wrapped: Buffer; readonly nonce: Buffer; readonly tag: Buffer } {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(master, true), nonce, { authTagLength: TAG_BYTES });
  const aad = Buffer.from(canonicalJson({ abi: ENCRYPTED_BACKUP_V4_ABI, key_id: master.id, operation: "wrap-data-key" }), "utf8");
  cipher.setAAD(aad);
  return { wrapped: Buffer.concat([cipher.update(dataKey), cipher.final()]), nonce, tag: cipher.getAuthTag() };
}

function unwrapDataKey(header: EncryptedBackupV4Header, provider: BackupKeyProvider): Buffer {
  const record = provider.resolve(header.key_id);
  if (!record) throw new BackupError("required backup key is unavailable", "backup_v4_key_unknown", 409);
  const master = key(record);
  const decipher = crypto.createDecipheriv("aes-256-gcm", master, base64(header.wrap_nonce, NONCE_BYTES, "wrap nonce"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(canonicalJson({ abi: ENCRYPTED_BACKUP_V4_ABI, key_id: header.key_id, operation: "wrap-data-key" }), "utf8"));
  decipher.setAuthTag(base64(header.wrap_tag, TAG_BYTES, "wrap tag"));
  try {
    const dataKey = Buffer.concat([decipher.update(base64(header.wrapped_key, KEY_BYTES, "wrapped key")), decipher.final()]);
    if (dataKey.byteLength !== KEY_BYTES) throw new Error("invalid unwrapped key size");
    return dataKey;
  } catch (error) {
    throw new BackupError("backup key authentication failed", "backup_v4_key_authentication_failed", 400, { cause: error });
  }
}

function headerBytes(header: EncryptedBackupV4Header): Buffer { return Buffer.from(canonicalJson(header), "utf8"); }

function headerFromValue(value: unknown, maxHeaderBytes: number): EncryptedBackupV4Header {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BackupError("backup v4 header is invalid", "backup_v4_header_invalid");
  const header = value as Partial<EncryptedBackupV4Header>;
  if (
    header.abi !== ENCRYPTED_BACKUP_V4_ABI || header.format_version !== ENCRYPTED_BACKUP_V4_VERSION || header.application !== "prg32-cartridge-store" ||
    typeof header.backup_id !== "string" || header.backup_id.length < 1 || header.backup_id.length > 128 || typeof header.created_at !== "string" ||
    header.payload_abi !== "prg32-cartridge-store-backup-3.0" || header.payload_format_version !== 3 ||
    header.versions?.schemaVersion !== TARGET_VERSION_TUPLE.schemaVersion || header.versions?.storageLayoutVersion !== TARGET_VERSION_TUPLE.storageLayoutVersion || header.versions?.publicationJournalVersion !== TARGET_VERSION_TUPLE.publicationJournalVersion || header.versions?.backupFormatVersion !== TARGET_VERSION_TUPLE.backupFormatVersion || typeof header.payload_archive_bytes !== "number" ||
    !Number.isSafeInteger(header.payload_archive_bytes) || header.payload_archive_bytes < 1 || typeof header.payload_archive_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(header.payload_archive_sha256) || typeof header.payload_manifest_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(header.payload_manifest_sha256) || typeof header.key_id !== "string" || !KEY_ID_RE.test(header.key_id) ||
    header.cipher !== "aes-256-gcm" || header.key_wrap !== "aes-256-gcm" || typeof header.nonce !== "string" ||
    typeof header.wrapped_key !== "string" || typeof header.wrap_nonce !== "string" || typeof header.wrap_tag !== "string" || header.tag_bytes !== TAG_BYTES
  ) throw new BackupError("backup v4 header is incompatible", "backup_v4_header_invalid");
  const encoded = headerBytes(header as EncryptedBackupV4Header);
  if (encoded.byteLength > maxHeaderBytes) throw new BackupError("backup v4 header is too large", "backup_v4_header_too_large");
  base64(header.nonce, NONCE_BYTES, "nonce"); base64(header.wrapped_key, KEY_BYTES, "wrapped key"); base64(header.wrap_nonce, NONCE_BYTES, "wrap nonce"); base64(header.wrap_tag, TAG_BYTES, "wrap tag");
  return header as EncryptedBackupV4Header;
}

interface ParsedEnvelope {
  readonly header: EncryptedBackupV4Header;
  readonly headerRaw: Buffer;
  readonly ciphertextOffset: number;
  readonly ciphertextBytes: number;
  readonly tag: Buffer;
  readonly sizeBytes: number;
}

function parseEnvelope(filePath: string, value: EncryptedBackupV4Limits): ParsedEnvelope {
  const stats = regularFile(filePath, "backup_v4_archive_invalid");
  if (stats.size > value.maxEnvelopeBytes) throw new BackupError("backup v4 envelope is too large", "backup_v4_archive_too_large");
  if (stats.size < MAGIC.byteLength + 4 + TAG_BYTES + 1) throw new BackupError("backup v4 envelope is truncated", "backup_v4_archive_truncated");
  const fd = fs.openSync(filePath, "r");
  try {
    const magic = Buffer.alloc(MAGIC.byteLength); fs.readSync(fd, magic, 0, magic.length, 0);
    if (!magic.equals(MAGIC)) throw new BackupError("backup v4 magic is invalid", "backup_v4_format_unsupported");
    const lengthBuffer = Buffer.alloc(4); fs.readSync(fd, lengthBuffer, 0, 4, MAGIC.byteLength);
    const length = lengthBuffer.readUInt32BE(0);
    if (length < 2 || length > value.maxHeaderBytes) throw new BackupError("backup v4 header length is invalid", "backup_v4_header_invalid");
    const raw = Buffer.alloc(length); const read = fs.readSync(fd, raw, 0, length, MAGIC.byteLength + 4);
    if (read !== length) throw new BackupError("backup v4 header is truncated", "backup_v4_archive_truncated");
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString("utf8")) as unknown; } catch (error) { throw new BackupError("backup v4 header is invalid", "backup_v4_header_invalid", 400, { cause: error }); }
    const header = headerFromValue(parsed, value.maxHeaderBytes);
    if (header.payload_archive_bytes > value.maxPayloadBytes) throw new BackupError("backup v4 payload is too large", "backup_v4_payload_too_large");
    const ciphertextOffset = MAGIC.byteLength + 4 + length;
    const ciphertextBytes = stats.size - ciphertextOffset - TAG_BYTES;
    if (ciphertextBytes !== header.payload_archive_bytes || ciphertextBytes < 1) throw new BackupError("backup v4 ciphertext length is inconsistent", "backup_v4_archive_truncated");
    return { header, headerRaw: raw, ciphertextOffset, ciphertextBytes, tag: readAt(fd, stats.size - TAG_BYTES, TAG_BYTES), sizeBytes: stats.size };
  } finally { fs.closeSync(fd); }
}

function readAt(fd: number, position: number, length: number): Buffer {
  const result = Buffer.alloc(length); const read = fs.readSync(fd, result, 0, length, position);
  if (read !== length) throw new BackupError("backup v4 envelope is truncated", "backup_v4_archive_truncated");
  return result;
}

function writeEnvelope(outputPath: string, payloadPath: string, header: EncryptedBackupV4Header, dataKey: Buffer, limitsValue: EncryptedBackupV4Limits, fault?: (point: EncryptedBackupV4FaultPoint) => void): number {
  const temporary = `${outputPath}.partial-${process.pid}-${crypto.randomUUID()}`;
  const rawHeader = headerBytes(header);
  const fdIn = fs.openSync(payloadPath, "r");
  const fdOut = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, base64(header.nonce, NONCE_BYTES, "nonce"), { authTagLength: TAG_BYTES });
  cipher.setAAD(rawHeader);
  try {
    fs.writeSync(fdOut, MAGIC); const length = Buffer.alloc(4); length.writeUInt32BE(rawHeader.byteLength, 0); fs.writeSync(fdOut, length); fs.writeSync(fdOut, rawHeader);
    const input = Buffer.alloc(CHUNK_BYTES); let position = 0;
    while (position < header.payload_archive_bytes) {
      const count = fs.readSync(fdIn, input, 0, Math.min(input.length, header.payload_archive_bytes - position), position);
      if (count === 0) throw new BackupError("backup payload is truncated", "backup_v4_payload_truncated");
      position += count; const encrypted = cipher.update(input.subarray(0, count)); if (encrypted.length > 0) fs.writeSync(fdOut, encrypted); fault?.("during-encryption");
    }
    const final = cipher.final(); if (final.length > 0) fs.writeSync(fdOut, final);
    fault?.("before-envelope-finalization"); fs.writeSync(fdOut, cipher.getAuthTag()); fs.fsyncSync(fdOut);
  } finally { fs.closeSync(fdIn); fs.closeSync(fdOut); }
  fs.renameSync(temporary, outputPath);
  const directory = fs.openSync(path.dirname(outputPath), fs.constants.O_RDONLY); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  const stats = regularFile(outputPath, "backup_v4_archive_invalid");
  if (stats.size > limitsValue.maxEnvelopeBytes) throw new BackupError("backup v4 envelope is too large", "backup_v4_archive_too_large");
  fault?.("after-envelope-finalization");
  return stats.size;
}

function markerPath(archivePath: string): string { return `${archivePath}.complete.json`; }

function writeMarker(archivePath: string, header: EncryptedBackupV4Header, bytes: number): string {
  const marker = markerPath(archivePath); const temporary = `${marker}.tmp-${crypto.randomUUID()}`;
  const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try { fs.writeSync(fd, `${canonicalJson({ abi: ENCRYPTED_BACKUP_V4_ABI, backup_id: header.backup_id, archive_bytes: bytes, archive_sha256: sha256File(archivePath), completed_at: new Date().toISOString() })}\n`, undefined, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, marker); const directory = fs.openSync(path.dirname(marker), fs.constants.O_RDONLY); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); } return marker;
}

function decryptPayload(parsed: ParsedEnvelope, archivePath: string, provider: BackupKeyProvider, destination: string, value: EncryptedBackupV4Limits, fault?: (point: EncryptedBackupV4FaultPoint) => void): void {
  fault?.("before-decryption");
  const dataKey = unwrapDataKey(parsed.header, provider);
  const temporary = `${destination}.partial-${process.pid}-${crypto.randomUUID()}`;
  const fdIn = fs.openSync(archivePath, "r"); const fdOut = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, base64(parsed.header.nonce, NONCE_BYTES, "nonce"), { authTagLength: TAG_BYTES });
  decipher.setAAD(parsed.headerRaw); decipher.setAuthTag(parsed.tag);
  const hash = crypto.createHash("sha256"); let position = 0;
  try {
    const input = Buffer.alloc(CHUNK_BYTES);
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
  const stats = regularFile(temporary, "backup_v4_payload_invalid");
  if (stats.size !== parsed.header.payload_archive_bytes || hash.digest("hex") !== parsed.header.payload_archive_sha256) {
    fs.rmSync(temporary, { force: true }); throw new BackupError("backup v4 payload integrity failed", "backup_v4_payload_integrity");
  }
  fs.renameSync(temporary, destination); fault?.("after-decryption");
  void value;
}

function decryptAndVerify(archivePath: string, provider: BackupKeyProvider, value: EncryptedBackupV4Limits, fault?: (point: EncryptedBackupV4FaultPoint) => void): { readonly parsed: ParsedEnvelope; readonly payloadPath: string; readonly payload: ReturnType<typeof verifyCanonicalBackup> } {
  const parsed = parseEnvelope(archivePath, value);
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
  requireAuthorization(options.authorization);
  const snapshotMode = options.snapshotMode ?? "exclusive";
  if (snapshotMode !== "exclusive" && snapshotMode !== "online") throw new BackupError("backup v4 snapshot mode is invalid", "backup_v4_snapshot_mode_invalid", 400);
  if (snapshotMode === "exclusive" && !options.writerQuiesced) throw new BackupError("writer quiescence is required for encrypted backup", "backup_v4_writer_not_quiesced", 409);
  const sourceRoot = resolved(options.sourceRoot, "source root"); const outputPath = resolved(options.outputPath, "output path"); const value = limits(options.limits);
  const relativeOutput = path.relative(sourceRoot, outputPath);
  if (relativeOutput === "" || (!relativeOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeOutput))) throw new BackupError("encrypted backup output may not be inside the source root", "backup_v4_output_unsafe");
  if (fs.existsSync(outputPath) || fs.existsSync(markerPath(outputPath))) throw new BackupError("completed encrypted backup output already exists", "backup_v4_output_exists", 409);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const lease = snapshotMode === "exclusive" ? new CanonicalWriterLease(sourceRoot) : undefined; const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-backup-v4-create-")); const payloadPath = path.join(temporaryDirectory, "payload-v3.zip");
  try {
    const canonicalAuthorization = options.authorization === ENCRYPTED_BACKUP_V4_OPERATIONAL_AUTHORIZATION ? CANONICAL_BACKUP_OPERATIONAL_AUTHORIZATION : CANONICAL_BACKUP_AUTHORIZATION;
    const payload = await createCanonicalBackup({ sourceRoot, outputPath: payloadPath, authorization: canonicalAuthorization, writerQuiesced: options.writerQuiesced, snapshotMode, ...(value.canonical === undefined ? {} : { limits: value.canonical }) });
    options.fault?.("after-payload-created");
    const active = options.keyProvider.active(); const dataKey = crypto.randomBytes(KEY_BYTES); const wrapped = wrapDataKey(dataKey, active);
    const header: EncryptedBackupV4Header = {
      abi: ENCRYPTED_BACKUP_V4_ABI, format_version: ENCRYPTED_BACKUP_V4_VERSION, application: "prg32-cartridge-store", backup_id: payload.backupId, created_at: new Date().toISOString(), payload_abi: "prg32-cartridge-store-backup-3.0", payload_format_version: 3, versions: TARGET_VERSION_TUPLE, payload_archive_bytes: payload.archiveBytes, payload_archive_sha256: payload.archiveSha256, payload_manifest_sha256: payload.manifest.canonical_manifest_sha256, key_id: active.id, cipher: "aes-256-gcm", key_wrap: "aes-256-gcm", nonce: crypto.randomBytes(NONCE_BYTES).toString("base64url"), wrapped_key: wrapped.wrapped.toString("base64url"), wrap_nonce: wrapped.nonce.toString("base64url"), wrap_tag: wrapped.tag.toString("base64url"), tag_bytes: TAG_BYTES
    };
    const envelopeBytes = writeEnvelope(outputPath, payloadPath, header, dataKey, value, options.fault);
    const marker = writeMarker(outputPath, header, envelopeBytes);
    return { backupId: header.backup_id, archivePath: outputPath, completionMarker: marker, header, envelopeBytes };
  } catch (error) {
    if (fs.existsSync(outputPath) && !fs.existsSync(markerPath(outputPath))) { try { fs.renameSync(outputPath, `${outputPath}.incomplete-${crypto.randomUUID()}`); } catch { /* preserve the original error */ } }
    if (error instanceof BackupError) throw error;
    throw new BackupError("encrypted backup creation failed", "backup_v4_creation_failed", 500, { cause: error });
  } finally { lease?.close(); fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
}

export function inspectEncryptedBackup(archivePathValue: string, options: { readonly limits?: Partial<EncryptedBackupV4Limits> } = {}): EncryptedBackupV4Header {
  const archivePath = resolved(archivePathValue, "archive path"); const value = limits(options.limits); parseCompletionMarker(archivePath); return parseEnvelope(archivePath, value).header;
}

function parseCompletionMarker(archivePath: string): void {
  const marker = markerPath(archivePath); if (!fs.existsSync(marker)) throw new BackupError("encrypted backup completion marker is missing", "backup_v4_incomplete", 409); regularFile(marker, "backup_v4_marker_invalid");
}

export function verifyEncryptedBackup(archivePathValue: string, options: VerifyEncryptedBackupOptions): VerifiedEncryptedBackupV4 {
  const archivePath = resolved(archivePathValue, "archive path"); const value = limits(options.limits); parseCompletionMarker(archivePath); const verified = decryptAndVerify(archivePath, options.keyProvider, value, options.fault);
  return { backupId: verified.parsed.header.backup_id, archivePath, completionMarker: markerPath(archivePath), header: verified.parsed.header, envelopeBytes: verified.parsed.sizeBytes, payloadManifest: verified.payload.manifest, payloadArchiveSha256: verified.payload.archiveSha256 };
}

export function restoreEncryptedBackup(options: RestoreEncryptedBackupOptions): CanonicalRestoreResult {
  requireAuthorization(options.authorization);
  const archivePath = resolved(options.archivePath, "archive path"); const targetRoot = resolved(options.targetRoot, "target root"); const value = limits(options.limits); parseCompletionMarker(archivePath);
  const verified = decryptAndVerify(archivePath, options.keyProvider, value, options.fault);
  const temporaryDirectory = path.dirname(verified.payloadPath);
  try {
    return restoreCanonicalBackup({ archivePath: verified.payloadPath, targetRoot, authorization: CANONICAL_BACKUP_AUTHORIZATION, ...(value.canonical === undefined ? {} : { limits: value.canonical }), ...(options.restoreFault === undefined ? {} : { fault: options.restoreFault }) });
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
}

export function applyBackupRetention(options: RetentionOptions): RetentionResult {
  const directory = resolved(options.directory, "backup retention directory");
  if (!Number.isSafeInteger(options.keepNewest) || options.keepNewest < 0) throw new BackupError("backup retention keepNewest is invalid", "backup_v4_retention_invalid");
  if (options.apply && options.authorization !== RETENTION_AUTHORIZATION) throw new BackupError("explicit disposable retention authorization is required", "backup_v4_retention_authorization_required", 403);
  const protectedIds = new Set(options.protectedBackupIds ?? []); const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".backup4") && fs.existsSync(markerPath(path.join(directory, entry.name)))).map((entry) => path.join(directory, entry.name)) : [];
  const records = entries.map((filePath) => ({ filePath, header: parseEnvelope(filePath, DEFAULT_ENCRYPTED_BACKUP_V4_LIMITS).header })).sort((left, right) => right.header.created_at.localeCompare(left.header.created_at));
  const keep = new Set(records.slice(0, options.keepNewest).map((record) => record.filePath)); const now = Date.now(); const candidates: string[] = []; const protectedFiles: string[] = [];
  for (const record of records) {
    const isProtected = protectedIds.has(record.header.backup_id) || keep.has(record.filePath) || (options.maxAgeMs !== undefined && now - Date.parse(record.header.created_at) <= options.maxAgeMs);
    if (isProtected) protectedFiles.push(record.filePath); else candidates.push(record.filePath);
  }
  const deleted: string[] = [];
  if (options.apply) for (const filePath of candidates) { fs.unlinkSync(filePath); const marker = markerPath(filePath); if (fs.existsSync(marker)) fs.unlinkSync(marker); deleted.push(filePath); }
  return { dryRun: !options.apply, candidates, protectedFiles, deleted };
}
