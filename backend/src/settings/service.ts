import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { ARCHITECTURES } from "../submission/prg32.js";
import { DISCOVERY_ABI, DISCOVERY_SERVICE_TYPE, SETTINGS, WRITABLE_SETTING_KEYS, type SettingValue, type WritableSettingKey } from "./definitions.js";
import { parseSettingsPatch, parseStoredValue, SettingsValidationError } from "./schemas.js";
import type { SecretStore } from "../secrets/service.js";

type DatabaseSource = Database.Database | (() => Database.Database);
type AssetKind = "logo" | "favicon";

export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

export class SettingsError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SettingsError";
  }
}

export interface SettingView {
  readonly value: SettingValue;
  readonly type: string;
  readonly writable: boolean;
  readonly restart_required: boolean;
  readonly runtime: string;
}

export interface SettingsServiceOptions {
  readonly config: BackendConfig;
  readonly database: DatabaseSource;
  readonly writableDatabase: Database.Database | null;
  readonly assetDirectory?: string;
  readonly fault?: (point: "after-asset-publish" | "before-settings-commit") => void;
  readonly secrets?: SecretStore;
}

function rawValue(database: Database.Database, key: string): string | undefined {
  const row = database.prepare("SELECT value FROM store_settings WHERE key = ?").get(key) as { value?: unknown } | undefined;
  return typeof row?.value === "string" ? row.value : undefined;
}

function settingValue(database: Database.Database, key: keyof typeof SETTINGS): SettingValue {
  return parseStoredValue(key, rawValue(database, key));
}

function settingView(database: Database.Database, key: keyof typeof SETTINGS, value = settingValue(database, key)): SettingView {
  const definition = SETTINGS[key];
  return {
    value,
    type: definition.type,
    writable: definition.visibility === "writable",
    restart_required: definition.restartRequired,
    runtime: definition.runtime
  };
}

function assetMime(kind: AssetKind, data: Uint8Array): { readonly extension: "png" | "jpg" | "ico"; readonly mimeType: string } | null {
  const bytes = Buffer.from(data);
  if (bytes.byteLength >= 33 && bytes.subarray(0, 8).equals(Buffer.from("\x89PNG\r\n\x1a\n", "binary"))) {
    let offset = 8;
    let hasHeader = false;
    while (offset + 12 <= bytes.byteLength) {
      const length = bytes.readUInt32BE(offset);
      const chunkEnd = offset + 12 + length;
      if (chunkEnd > bytes.byteLength) return null;
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      if (!hasHeader) {
        if (type !== "IHDR" || length !== 13 || bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0) return null;
        hasHeader = true;
      }
      if (type === "IEND") {
        return hasHeader && length === 0 && chunkEnd === bytes.byteLength
          ? { extension: "png", mimeType: "image/png" }
          : null;
      }
      offset = chunkEnd;
    }
    return null;
  }
  if (data.byteLength >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && data[data.byteLength - 2] === 0xff && data[data.byteLength - 1] === 0xd9) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (kind === "favicon" && data.byteLength >= 6 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0 && (data[4] ?? 0) > 0) {
    return { extension: "ico", mimeType: "image/x-icon" };
  }
  return null;
}

function assertRegularDirectory(directory: string): void {
  const resolved = path.resolve(directory);
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new SettingsError("asset_storage_unavailable", 503, "asset storage is unavailable");
    existing = parent;
  }
  const existingStats = fs.lstatSync(existing);
  if (!existingStats.isDirectory()) throw new SettingsError("asset_storage_unavailable", 503, "asset storage is unavailable");
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new SettingsError("asset_storage_unavailable", 503, "asset storage is unavailable");
}

function safeAssetFilename(kind: AssetKind, filename: string): boolean {
  return new RegExp(`^${kind}-[a-f0-9]{32}\\.(png|jpg|ico)$`).test(filename);
}

export class SettingsService {
  private readonly databaseSource: DatabaseSource;
  private readonly writable: Database.Database | null;
  private readonly config: BackendConfig;
  private readonly assetDirectory: string;
  private readonly fault: SettingsServiceOptions["fault"];
  readonly secrets: SecretStore | undefined;

  constructor(options: SettingsServiceOptions) {
    this.databaseSource = options.database;
    this.writable = options.writableDatabase;
    this.config = options.config;
    this.assetDirectory = options.assetDirectory ?? path.join(options.config.storeDataDirectory, "static");
    this.fault = options.fault;
    this.secrets = options.secrets;
  }

  private get database(): Database.Database {
    return typeof this.databaseSource === "function" ? this.databaseSource() : this.databaseSource;
  }

  read(): Record<string, unknown> {
    const database = this.database;
    const settings: Record<string, SettingView> = {};
    for (const key of WRITABLE_SETTING_KEYS) settings[key] = settingView(database, key);
    for (const key of ["theme_logo_url", "theme_favicon_url"] as const) settings[key] = settingView(database, key);
    return {
      ok: true,
      settings,
      read_only: {
        auth_default_role: settingView(database, "auth_default_role", "user"),
        auth_require_email_domain: settingView(database, "auth_require_email_domain"),
        publish_require_auth: settingView(database, "publish_require_auth", true),
        publish_max_bundle_mb: settingView(database, "publish_max_bundle_mb", Math.floor(this.config.submissionMaxArchiveBytes / (1024 * 1024))),
        publish_allowed_architectures: settingView(database, "publish_allowed_architectures", Object.keys(ARCHITECTURES)),
        mdns: {
          enabled: settingValue(database, "mdns_enabled"),
          name: settingValue(database, "mdns_name"),
          service_type: DISCOVERY_SERVICE_TYPE,
          port: this.discoveryPort(),
          runtime: "discovery contract is fixed; Fastify does not dynamically reconfigure mDNS"
        },
        discovery: {
          abi: DISCOVERY_ABI,
          service_type: DISCOVERY_SERVICE_TYPE,
          port: this.discoveryPort(),
          version: this.config.storeVersion
        },
        smtp: {
          configured: false,
          delivery_available: false,
          runtime: "SMTP delivery is not implemented by Fastify; credentials remain deployment-managed"
        }
      }
    };
  }

  private discoveryPort(): number {
    const candidate = Number(this.config.storePortOverride);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 5080;
  }

  update(value: unknown): Record<string, unknown> {
    if (!this.writable) throw new SettingsError("settings_unavailable", 503, "settings write isolation is unavailable");
    let patch: Partial<Record<WritableSettingKey, SettingValue>>;
    try {
      patch = parseSettingsPatch(value);
    } catch (error) {
      if (error instanceof SettingsValidationError) throw error;
      throw new SettingsError("settings_invalid_value", 400, "settings patch is invalid");
    }
    if (Object.keys(patch).length === 0) return this.read();
    const database = this.writable;
    try {
      database.exec("BEGIN IMMEDIATE");
      const write = database.prepare("INSERT INTO store_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      for (const key of WRITABLE_SETTING_KEYS) {
        const valueForKey = patch[key];
        if (valueForKey === undefined) continue;
        write.run(key, Array.isArray(valueForKey) ? valueForKey.join(",") : String(valueForKey));
      }
      this.fault?.("before-settings-commit");
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      if (error instanceof SettingsValidationError || error instanceof SettingsError) throw error;
      throw new SettingsError("settings_storage_failed", 503, "settings update failed", { cause: error });
    }
    return this.read();
  }

  assetPath(kind: AssetKind): { readonly path: string; readonly extension: string; readonly mimeType: string } | null {
    const key = kind === "logo" ? "theme_logo_url" : "theme_favicon_url";
    const stored = rawValue(this.database, key) ?? "";
    const prefix = `/api/assets/${kind}/`;
    if (stored.startsWith(prefix)) {
      const filename = stored.slice(prefix.length);
      if (!safeAssetFilename(kind, filename)) return null;
      const resolved = path.resolve(this.assetDirectory, filename);
      if (path.dirname(resolved) !== path.resolve(this.assetDirectory)) return null;
      const type = filename.endsWith(".png") ? "image/png" : filename.endsWith(".jpg") ? "image/jpeg" : "image/x-icon";
      return { path: resolved, extension: filename.split(".").pop() ?? "", mimeType: type };
    }
    // Read-only compatibility with Flask's historical /static/custom URLs.
    const legacyPrefix = "/static/custom/";
    if (stored.startsWith(legacyPrefix)) {
      const filename = stored.slice(legacyPrefix.length);
      if (!/^[A-Za-z0-9._-]+$/.test(filename)) return null;
      const resolved = path.resolve(this.assetDirectory, filename);
      if (path.dirname(resolved) !== path.resolve(this.assetDirectory)) return null;
      const type = filename.endsWith(".png") ? "image/png" : filename.endsWith(".jpg") ? "image/jpeg" : filename.endsWith(".ico") ? "image/x-icon" : "application/octet-stream";
      return { path: resolved, extension: filename.split(".").pop() ?? "", mimeType: type };
    }
    return null;
  }

  replaceAsset(kind: AssetKind, data: Uint8Array): { readonly kind: AssetKind; readonly url: string; readonly mime_type: string; readonly size: number } {
    if (!this.writable) throw new SettingsError("settings_unavailable", 503, "settings write isolation is unavailable");
    if (data.byteLength === 0) throw new SettingsError("asset_empty", 400, `${kind} upload is empty`);
    if (data.byteLength > MAX_ASSET_BYTES) throw new SettingsError("asset_too_large", 413, `${kind} upload is too large`);
    const detected = assetMime(kind, data);
    if (!detected) throw new SettingsError("asset_invalid_type", 400, `${kind} must be a valid PNG, JPEG, or favicon ICO`);
    assertRegularDirectory(this.assetDirectory);
    const key = kind === "logo" ? "theme_logo_url" : "theme_favicon_url";
    const previous = rawValue(this.writable, key) ?? "";
    const filename = `${kind}-${crypto.randomBytes(16).toString("hex")}.${detected.extension}`;
    const staging = path.join(this.assetDirectory, `.staging-${filename}`);
    const finalPath = path.join(this.assetDirectory, filename);
    const url = `/api/assets/${kind}/${filename}`;
    let staged = false;
    let published = false;
    try {
      const fd = fs.openSync(staging, "wx", 0o600);
      try {
        fs.writeFileSync(fd, data);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      staged = true;
      fs.renameSync(staging, finalPath);
      staged = false;
      published = true;
      const directoryFd = fs.openSync(this.assetDirectory, "r");
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
      this.fault?.("after-asset-publish");
      this.writable.exec("BEGIN IMMEDIATE");
      this.writable.prepare("INSERT INTO store_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, url);
      this.writable.exec("COMMIT");
      const old = this.assetPathFromValue(kind, previous);
      if (old && old !== finalPath) {
        try { fs.unlinkSync(old); } catch { /* orphan cleanup is best effort after the active reference is safe */ }
      }
      return { kind, url, mime_type: detected.mimeType, size: data.byteLength };
    } catch (error) {
      if (this.writable.inTransaction) this.writable.exec("ROLLBACK");
      const current = rawValue(this.writable, key);
      if (published && current !== url) {
        try { fs.unlinkSync(finalPath); } catch { /* preserve diagnostics without leaking them */ }
      }
      if (staged) {
        try { fs.unlinkSync(staging); } catch { /* cleanup is best effort */ }
      }
      if (error instanceof SettingsError) throw error;
      throw new SettingsError("asset_publication_failed", 503, `${kind} asset publication failed`, { cause: error });
    }
  }

  private assetPathFromValue(kind: AssetKind, stored: string): string | null {
    const prefix = `/api/assets/${kind}/`;
    if (!stored.startsWith(prefix)) return null;
    const filename = stored.slice(prefix.length);
    return safeAssetFilename(kind, filename) ? path.resolve(this.assetDirectory, filename) : null;
  }
}
