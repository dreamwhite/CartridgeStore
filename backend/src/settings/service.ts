import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { ARCHITECTURES } from "../submission/prg32.js";
import { DISCOVERY_ABI, DISCOVERY_SERVICE_TYPE, SETTINGS, WRITABLE_SETTING_KEYS, type SettingValue, type WritableSettingKey } from "./definitions.js";
import { parseSettingsPatch, parseStoredValue, SettingsValidationError } from "./schemas.js";
import type { SecretStore } from "../secrets/service.js";
import type { AdminAuditLog } from "../admin/audit.js";
import type { EmailService, SmtpRuntimeConfig } from "../email/service.js";
import { OutboundValidationError, resolveOutboundHost } from "../setup/outbound.js";

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
  readonly audit?: AdminAuditLog;
  readonly email?: EmailService;
}

const APPLICATION_SETTING_DEFINITIONS = {
  "application.store_name": { type: "string", category: "application", sensitivity: "public", default: "PRG32 Cartridge Store" },
  "application.store_description": { type: "string", category: "application", sensitivity: "public", default: "" },
  "application.contact_email": { type: "string", category: "application", sensitivity: "public", default: "" },
  "registration.enabled": { type: "boolean", category: "registration", sensitivity: "admin", default: true },
  "registration.require_email_verification": { type: "boolean", category: "registration", sensitivity: "admin", default: false },
  "publishing.enabled": { type: "boolean", category: "publishing", sensitivity: "admin", default: true },
  "publishing.max_artifact_bytes": { type: "number", category: "publishing", sensitivity: "admin", default: 50 * 1024 * 1024 },
  // Existing clients may reject without a note.  The policy is opt-in until
  // an administrator explicitly enables it, preserving the current contract.
  "review.require_note_on_rejection": { type: "boolean", category: "review", sensitivity: "admin", default: false },
  "telemetry.collection_enabled": { type: "boolean", category: "telemetry", sensitivity: "admin", default: true },
  "security.notify_user_on_account_change": { type: "boolean", category: "security", sensitivity: "admin", default: true },
  "discovery.mdns_enabled": { type: "boolean", category: "discovery", sensitivity: "admin", default: false },
  "session.lifetime_seconds": { type: "number", category: "session", sensitivity: "admin", default: 86400 },
  "smtp.enabled": { type: "boolean", category: "smtp", sensitivity: "admin", default: false },
  "smtp.host": { type: "string", category: "smtp", sensitivity: "admin", default: "" },
  "smtp.port": { type: "number", category: "smtp", sensitivity: "admin", default: 1025 },
  "smtp.encryption": { type: "enum", category: "smtp", sensitivity: "admin", default: "none" },
  "smtp.auth_enabled": { type: "boolean", category: "smtp", sensitivity: "admin", default: false },
  "smtp.username": { type: "string", category: "smtp", sensitivity: "admin", default: "" },
  "smtp.from_name": { type: "string", category: "smtp", sensitivity: "admin", default: "PRG32 Cartridge Store" },
  "smtp.from_email": { type: "string", category: "smtp", sensitivity: "admin", default: "" },
  "smtp.reply_to": { type: "string", category: "smtp", sensitivity: "admin", default: "" },
  "smtp.connection_timeout_ms": { type: "number", category: "smtp", sensitivity: "admin", default: 10000 },
  "smtp.delivery_timeout_ms": { type: "number", category: "smtp", sensitivity: "admin", default: 10000 }
} as const;
type ApplicationSettingKey = keyof typeof APPLICATION_SETTING_DEFINITIONS;

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
  private readonly audit: AdminAuditLog | undefined;
  private readonly email: EmailService | undefined;

  constructor(options: SettingsServiceOptions) {
    this.databaseSource = options.database;
    this.writable = options.writableDatabase;
    this.config = options.config;
    this.assetDirectory = options.assetDirectory ?? path.join(options.config.storeDataDirectory, "static");
    this.fault = options.fault;
    this.secrets = options.secrets;
    this.audit = options.audit;
    this.email = options.email;
    // Apply persisted SMTP settings at process start.  The environment only
    // supplies bootstrap defaults; the canonical settings row is authoritative
    // for subsequent disposable runtime operation.
    if (this.writable) this.applyEmailRuntime(this.database);
  }

  private get database(): Database.Database {
    return typeof this.databaseSource === "function" ? this.databaseSource() : this.databaseSource;
  }

  read(): Record<string, unknown> {
    const database = this.database;
    const settings: Record<string, SettingView> = {};
    for (const key of WRITABLE_SETTING_KEYS) settings[key] = settingView(database, key);
    for (const key of ["theme_logo_url", "theme_favicon_url"] as const) settings[key] = settingView(database, key);
    const applicationSettings = this.applicationSettings(database);
    const smtp = this.smtpView(database, applicationSettings);
    return {
      ok: true,
      settings,
      application_settings: applicationSettings,
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
        smtp
      }
    };
  }

  private applicationSettings(database: Database.Database): Record<string, unknown> {
    const rows = new Map<string, unknown>();
    if (this.hasTable(database, "application_settings")) {
      for (const row of database.prepare("SELECT setting_key, value_json FROM application_settings").all() as Array<{ setting_key: string; value_json: string }>) {
        try { rows.set(row.setting_key, JSON.parse(row.value_json) as unknown); } catch { /* invalid persisted values are ignored and replaced by a safe default */ }
      }
    }
    return Object.fromEntries(Object.entries(APPLICATION_SETTING_DEFINITIONS).map(([key, definition]) => [key, {
      value: rows.has(key) ? rows.get(key) : definition.default,
      type: definition.type,
      category: definition.category,
      sensitivity: definition.sensitivity,
      writable: true,
      version: this.settingVersion(database, key)
    }]));
  }

  private settingVersion(database: Database.Database, key: string): number {
    if (!this.hasTable(database, "application_settings")) return 0;
    const row = database.prepare("SELECT version FROM application_settings WHERE setting_key = ?").get(key) as { version?: number } | undefined;
    return Number.isSafeInteger(row?.version) ? Number(row?.version) : 0;
  }

  private smtpView(database: Database.Database, settings: Record<string, unknown>): Record<string, unknown> {
    const value = (key: string, fallback: unknown): unknown => {
      const row = settings[key];
      return row && typeof row === "object" && !Array.isArray(row) && "value" in row ? row.value : fallback;
    };
    const secret = rawValue(database, "smtp_password");
    return {
      enabled: value("smtp.enabled", false), host: value("smtp.host", ""), port: value("smtp.port", 1025),
      encryption: value("smtp.encryption", "none"), auth_enabled: value("smtp.auth_enabled", false),
      username: value("smtp.username", ""), from_name: value("smtp.from_name", "PRG32 Cartridge Store"),
      from_email: value("smtp.from_email", this.config.emailFrom), reply_to: value("smtp.reply_to", ""),
      connection_timeout_ms: value("smtp.connection_timeout_ms", 10000), delivery_timeout_ms: value("smtp.delivery_timeout_ms", 10000),
      password_configured: typeof secret === "string" && secret.length > 0,
      configured: Boolean(value("smtp.host", "")),
      delivery_available: Boolean(this.email),
      runtime: "SMTP settings are persistent; passwords are encrypted and never returned"
    };
  }

  private applyEmailRuntime(database: Database.Database): void {
    if (!this.email) return;
    const settings = this.applicationSettings(database);
    const get = (key: string, fallback: unknown): unknown => {
      const item = settings[key];
      return item && typeof item === "object" && !Array.isArray(item) && "value" in item ? item.value : fallback;
    };
    const enabled = get("smtp.enabled", false) === true;
    if (!enabled) {
      this.email.configure({ transport: this.config.emailTransport === "memory" ? "memory" : "disabled", from: this.config.emailFrom, ...(this.config.emailPublicOrigin === undefined ? {} : { publicOrigin: this.config.emailPublicOrigin }) });
      return;
    }
    const host = String(get("smtp.host", ""));
    if (!host) throw new SettingsError("smtp_invalid_configuration", 400, "SMTP host is required when SMTP is enabled");
    const encryption = String(get("smtp.encryption", "none"));
    if (encryption !== "none" && encryption !== "starttls" && encryption !== "implicit_tls") throw new SettingsError("smtp_invalid_configuration", 400, "SMTP encryption is invalid");
    const smtp: SmtpRuntimeConfig = {
      host,
      port: Number(get("smtp.port", 1025)),
      encryption,
      connectionTimeoutMs: Number(get("smtp.connection_timeout_ms", 10000)),
      deliveryTimeoutMs: Number(get("smtp.delivery_timeout_ms", 10000)),
      ...(String(get("smtp.username", "")) ? { username: String(get("smtp.username", "")) } : {})
    };
    const authEnabled = get("smtp.auth_enabled", false) === true;
    if (authEnabled) {
      if (!this.secrets) throw new SettingsError("secret_storage_unavailable", 503, "secret storage is unavailable");
      const password = this.secrets.decrypt(database, "smtp_password");
      if (!password) throw new SettingsError("smtp_invalid_configuration", 400, "SMTP password is not configured");
      (smtp as { password?: string }).password = password;
    }
    this.email.configure({ transport: "smtp", from: String(get("smtp.from_email", this.config.emailFrom)), ...(this.config.emailPublicOrigin === undefined ? {} : { publicOrigin: this.config.emailPublicOrigin }), smtp });
  }

  private hasTable(database: Database.Database, table: string): boolean {
    return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  }

  private parseApplicationPatch(value: unknown): { readonly values: Partial<Record<ApplicationSettingKey, unknown>>; readonly smtpPassword?: string } {
    if (value === undefined) return { values: {} };
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SettingsError("settings_invalid_value", 400, "application_settings must be an object");
    const values: Partial<Record<ApplicationSettingKey, unknown>> = {};
    let smtpPassword: string | undefined;
    for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
      if (key === "smtp.password") {
        if (typeof candidate !== "string" || candidate.length > 4096) throw new SettingsError("settings_invalid_value", 400, "SMTP password is invalid");
        smtpPassword = candidate;
        continue;
      }
      if (!(key in APPLICATION_SETTING_DEFINITIONS)) throw new SettingsError("settings_unknown_key", 400, "unknown application setting");
      const definition = APPLICATION_SETTING_DEFINITIONS[key as ApplicationSettingKey];
      if (definition.type === "boolean" && typeof candidate !== "boolean") throw new SettingsError("settings_invalid_value", 400, "setting value is invalid");
      if (definition.type === "number" && (!Number.isSafeInteger(candidate) || Number(candidate) < 0 || Number(candidate) > 2_000_000_000)) throw new SettingsError("settings_invalid_value", 400, "setting value is invalid");
      if ((definition.type === "string" || definition.type === "enum") && (typeof candidate !== "string" || candidate.length > 512)) throw new SettingsError("settings_invalid_value", 400, "setting value is invalid");
      if (key === "smtp.encryption" && !["none", "starttls", "implicit_tls"].includes(String(candidate))) throw new SettingsError("settings_invalid_value", 400, "SMTP encryption is invalid");
      values[key as ApplicationSettingKey] = candidate;
    }
    return { values, ...(smtpPassword === undefined ? {} : { smtpPassword }) };
  }

  private validateRuntimePatch(values: Partial<Record<ApplicationSettingKey, unknown>>, smtpPassword: string | undefined): void {
    const database = this.database;
    const current = this.applicationSettings(database);
    const get = (key: ApplicationSettingKey, fallback: unknown): unknown => values[key] ?? (current[key] as { value?: unknown } | undefined)?.value ?? fallback;
    if (get("session.lifetime_seconds", 86400) !== undefined && (!Number.isSafeInteger(get("session.lifetime_seconds", 86400)) || Number(get("session.lifetime_seconds", 86400)) < 60)) {
      throw new SettingsError("settings_invalid_value", 400, "session lifetime must be at least 60 seconds");
    }
    const maxArtifact = get("publishing.max_artifact_bytes", 50 * 1024 * 1024);
    if (!Number.isSafeInteger(maxArtifact) || Number(maxArtifact) < 1) throw new SettingsError("settings_invalid_value", 400, "publishing artifact limit is invalid");
    const enabled = get("smtp.enabled", false) === true;
    if (!enabled) return;
    const host = String(get("smtp.host", ""));
    if (!host) throw new SettingsError("smtp_invalid_configuration", 400, "SMTP host is required when SMTP is enabled");
    const encryption = String(get("smtp.encryption", "none"));
    if (!(["none", "starttls", "implicit_tls"] as string[]).includes(encryption)) throw new SettingsError("smtp_invalid_configuration", 400, "SMTP encryption is invalid");
    if (get("smtp.auth_enabled", false) === true && smtpPassword === undefined) {
      const stored = rawValue(database, "smtp_password");
      if (!stored) throw new SettingsError("smtp_invalid_configuration", 400, "SMTP password is not configured");
      if (!this.secrets) throw new SettingsError("secret_storage_unavailable", 503, "secret storage is unavailable");
      try { this.secrets.decrypt(database, "smtp_password"); }
      catch { throw new SettingsError("secret_storage_unavailable", 503, "secret storage is unavailable"); }
    }
  }

  private discoveryPort(): number {
    const candidate = Number(this.config.storePortOverride);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 5080;
  }

  update(value: unknown, context?: { readonly actorUserId: number; readonly requestId: string }): Record<string, unknown> {
    if (!this.writable) throw new SettingsError("settings_unavailable", 503, "settings write isolation is unavailable");
    let patch: Partial<Record<WritableSettingKey, SettingValue>>;
    let application: { readonly values: Partial<Record<ApplicationSettingKey, unknown>>; readonly smtpPassword?: string };
    const expectedVersions: Record<string, number> = {};
    try {
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SettingsError("settings_invalid_value", 400, "settings patch is invalid");
      const input = value as Record<string, unknown>;
      application = this.parseApplicationPatch(input.application_settings);
      const expected = input.expected_versions;
      if (expected !== undefined) {
        if (expected === null || typeof expected !== "object" || Array.isArray(expected)) throw new SettingsError("settings_invalid_value", 400, "expected_versions must be an object");
        for (const [key, version] of Object.entries(expected as Record<string, unknown>)) {
          if (!(key in APPLICATION_SETTING_DEFINITIONS) || !Number.isSafeInteger(version) || Number(version) < 0) throw new SettingsError("settings_invalid_value", 400, "expected_versions is invalid");
          expectedVersions[key] = Number(version);
        }
      }
      const legacy = { ...input };
      delete legacy.application_settings;
      delete legacy.expected_versions;
      patch = parseSettingsPatch(legacy);
    } catch (error) {
      if (error instanceof SettingsValidationError) throw error;
      throw new SettingsError("settings_invalid_value", 400, "settings patch is invalid");
    }
    if (Object.keys(patch).length === 0 && Object.keys(application.values).length === 0 && application.smtpPassword === undefined) return this.read();
    const database = this.writable;
    try {
      this.validateRuntimePatch(application.values, application.smtpPassword);
      database.exec("BEGIN IMMEDIATE");
      for (const [key, expectedVersion] of Object.entries(expectedVersions)) {
        const actual = this.settingVersion(database, key);
        if (actual !== expectedVersion) throw new SettingsError("settings_conflict", 409, "settings version conflict");
      }
      const write = database.prepare("INSERT INTO store_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      for (const key of WRITABLE_SETTING_KEYS) {
        const valueForKey = patch[key];
        if (valueForKey === undefined) continue;
        write.run(key, Array.isArray(valueForKey) ? valueForKey.join(",") : String(valueForKey));
      }
      if (this.hasTable(database, "application_settings")) {
        const writeTyped = database.prepare(`INSERT INTO application_settings(setting_key, value_json, value_type, category, sensitivity, version, updated_at, updated_by_user_id)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, version = application_settings.version + 1, updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id`);
        const now = new Date().toISOString();
        for (const [key, candidate] of Object.entries(application.values)) {
          const definition = APPLICATION_SETTING_DEFINITIONS[key as ApplicationSettingKey];
          writeTyped.run(key, JSON.stringify(candidate), definition.type, definition.category, definition.sensitivity, now, context?.actorUserId ?? null);
        }
      }
      if (application.smtpPassword !== undefined) {
        if (!this.secrets) throw new SettingsError("secret_storage_unavailable", 503, "secret storage is unavailable");
        const encrypted = this.secrets.encrypt("smtp_password", application.smtpPassword);
        database.prepare("INSERT INTO store_settings(key, value) VALUES ('smtp_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(encrypted);
      }
      this.fault?.("before-settings-commit");
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      if (error instanceof SettingsValidationError || error instanceof SettingsError) throw error;
      throw new SettingsError("settings_storage_failed", 503, "settings update failed", { cause: error });
    }
    this.applyEmailRuntime(database);
    if (this.audit && context) {
      this.audit.append({ actor_user_id: context.actorUserId, target_type: "settings", target_id: "application", action: "settings.update", outcome: "committed", request_id: context.requestId, summary: { keys: [...Object.keys(patch), ...Object.keys(application.values), ...(application.smtpPassword === undefined ? [] : ["smtp.password"])].sort() } });
    }
    return this.read();
  }

  async testSmtpConnection(): Promise<void> {
    if (!this.email) throw new SettingsError("smtp_unavailable", 503, "email delivery is unavailable");
    const target = await this.smtpNetworkTarget();
    await this.email.testConnection(target.lookup);
  }

  async sendSmtpTest(to: string): Promise<void> {
    if (!this.email) throw new SettingsError("smtp_unavailable", 503, "email delivery is unavailable");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 254) throw new SettingsError("smtp_test_recipient_invalid", 400, "test recipient is invalid");
    const target = await this.smtpNetworkTarget();
    await this.email.sendTest(to, target.lookup);
  }

  private async smtpNetworkTarget(): Promise<{ readonly lookup: NonNullable<Parameters<EmailService["testConnection"]>[0]> }> {
    const smtp = this.read().read_only as { smtp?: { host?: unknown; port?: unknown } };
    const host = typeof smtp.smtp?.host === "string" ? smtp.smtp.host.trim() : "";
    const port = typeof smtp.smtp?.port === "number" ? smtp.smtp.port : Number(smtp.smtp?.port);
    if (!host || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw new SettingsError("smtp_invalid_configuration", 400, "SMTP target is invalid");
    try { return await resolveOutboundHost(host, port, this.config, { defaultPort: port }); }
    catch (error) {
      if (error instanceof OutboundValidationError) throw new SettingsError(error.code, 403, "SMTP target is not allowed");
      throw new SettingsError("smtp_target_invalid", 400, "SMTP target is not allowed");
    }
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
