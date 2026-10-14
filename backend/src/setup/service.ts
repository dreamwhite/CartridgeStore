import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type { AdminAuditLog } from "../admin/audit.js";
import type { AuthService } from "../auth/service.js";
import type { BackendConfig } from "../config/env.js";
import type { FederationProviderOperations } from "../federation/operations.js";
import type { FederationProviderService, ProviderInput } from "../federation/provider.js";
import type { SettingsService } from "../settings/service.js";

export const SETUP_STATES = [
  "INFRASTRUCTURE_NOT_READY",
  "INSTALLATION_REQUIRED",
  "INSTALLATION_IN_PROGRESS",
  "INSTALLATION_COMPLETE",
  "INSTALLATION_RECOVERY_REQUIRED"
] as const;
export type SetupState = typeof SETUP_STATES[number];

export const SETUP_STEPS = ["admin", "store", "registration", "security", "smtp", "oidc", "saml", "mdns", "review"] as const;
export type SetupStep = typeof SETUP_STEPS[number];

const SETUP_SESSION_SECONDS = 15 * 60;
const SETUP_SESSION_COOKIE = "prg32_setup_session";
const MAX_SETUP_PAYLOAD_BYTES = 64 * 1024;

export class SetupError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SetupError";
  }
}

export interface SetupSession {
  readonly id: string;
  readonly csrfToken: string;
  readonly expiresAt: number;
}

export interface SetupServiceOptions {
  readonly config: BackendConfig;
  readonly auth: AuthService;
  readonly settings: SettingsService;
  readonly providers: FederationProviderService | null;
  readonly operations: FederationProviderOperations | null;
  readonly audit?: AdminAuditLog;
  readonly database: Database.Database | null;
}

interface SetupRow {
  state: SetupState;
  completed_steps_json: string;
  admin_user_id: number | null;
  recovery_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
}

function now(): string { return new Date().toISOString(); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, field: string, max = 512, required = false): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new SetupError("setup_invalid_value", 400, `${field} is required`);
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new SetupError("setup_invalid_value", 400, `${field} is invalid`);
  return value.trim();
}

function boolValue(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new SetupError("setup_invalid_value", 400, `${field} is invalid`);
  return value;
}

function parseSteps(value: string): SetupStep[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SetupStep => typeof item === "string" && (SETUP_STEPS as readonly string[]).includes(item));
  } catch { return []; }
}

function safeProvider(provider: ReturnType<FederationProviderService["get"]>): Record<string, unknown> {
  return {
    provider_id: provider.providerId,
    protocol: provider.protocol,
    display_name: provider.displayName,
    issuer: provider.issuer,
    enabled: provider.enabled,
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    acs_url: provider.acsUrl,
    client_auth_method: provider.clientAuthMethod,
    client_secret_configured: provider.clientSecretReference !== null,
    saml_certificate_count: provider.samlTrustedCertificatesPem.length,
    updated_at: provider.updatedAt
  };
}

export class SetupService {
  private readonly sessions = new Map<string, SetupSession>();
  private activeSessionId: string | null = null;

  constructor(private readonly options: SetupServiceOptions) {
    this.reconcileExistingInstallation();
  }

  static cookieName(): string { return SETUP_SESSION_COOKIE; }
  static sessionLifetimeSeconds(): number { return SETUP_SESSION_SECONDS; }

  private reconcileExistingInstallation(): void {
    if (!this.options.database) return;
    const database = this.options.database;
    const current = database.prepare("SELECT state FROM setup_state WHERE singleton_id = 1").get() as { state?: SetupState } | undefined;
    if (!current || current.state !== "INSTALLATION_REQUIRED") return;
    const admin = database.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as { id?: number } | undefined;
    if (admin?.id !== undefined) {
      database.prepare("UPDATE setup_state SET state = 'INSTALLATION_COMPLETE', completed_steps_json = '[\"admin\"]', admin_user_id = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE singleton_id = 1 AND state = 'INSTALLATION_REQUIRED'").run(admin.id, now(), now());
      return;
    }
    const users = database.prepare("SELECT 1 FROM users LIMIT 1").get();
    if (users) database.prepare("UPDATE setup_state SET state = 'INSTALLATION_RECOVERY_REQUIRED', recovery_reason = 'existing accounts require operator recovery', updated_at = ? WHERE singleton_id = 1 AND state = 'INSTALLATION_REQUIRED'").run(now());
  }

  legacyBootstrapAllowed(): boolean {
    return this.options.config.authWriteMode === "test" || (this.options.database !== null && this.row().state === "INSTALLATION_COMPLETE");
  }

  private get database(): Database.Database {
    if (!this.options.database) throw new SetupError("infrastructure_not_ready", 503, "installation infrastructure is not ready");
    return this.options.database;
  }

  private row(): SetupRow {
    const row = this.database.prepare("SELECT state, completed_steps_json, admin_user_id, recovery_reason, started_at, completed_at FROM setup_state WHERE singleton_id = 1").get() as SetupRow | undefined;
    if (!row) throw new SetupError("setup_state_unavailable", 503, "installation state is unavailable");
    return row;
  }

  private infrastructure(): Record<string, unknown> {
    if (!this.options.database) return {
      ready: false,
      fastify: true,
      canonical_sqlite: false,
      storage: false,
      writer_lease: false,
      secret_registry: false,
      bootstrap_authorization: Boolean(this.options.config.authBootstrapToken),
      mdns_infrastructure_allowed: false
    };
    const database = this.options.database;
    const metadata = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'storage_metadata'").get();
    const storage = metadata
      ? (database.prepare("SELECT state FROM storage_metadata WHERE singleton_id = 1").get() as { state?: string } | undefined)?.state === "ready"
      : true;
    const secretRegistry = this.options.config.secretEncryptionEnabled
      ? Boolean(this.options.config.secretKeyRegistryPath)
      : true;
    const writer = Boolean(this.options.config.authWriteEnabled && this.options.auth.isWriteEnabled());
    return {
      ready: storage && secretRegistry && writer && Boolean(this.options.config.authSessionSecret) && Boolean(this.options.config.authBootstrapToken),
      fastify: true,
      canonical_sqlite: storage,
      storage: storage,
      writer_lease: writer,
      secret_registry: secretRegistry,
      bootstrap_authorization: Boolean(this.options.config.authBootstrapToken),
      mdns_infrastructure_allowed: this.options.config.mdnsEnabled
    };
  }

  status(): Record<string, unknown> {
    const infrastructure = this.infrastructure();
    if (!this.options.database) return {
      ok: true,
      state: "INFRASTRUCTURE_NOT_READY",
      setup_required: false,
      authorization_required: false,
      infrastructure,
      public_origins: { store: this.options.config.frontendPublicOrigin ?? null, api: this.options.config.federationPublicOrigin ?? this.options.config.oidcPublicOrigin ?? null },
      mdns: { infrastructure_allowed: false, application_enabled: false, effective_enabled: false, service_type: "_prg32store._tcp.local.", abi: "prg32-store-discovery-1.0", port: this.options.config.mdnsPort, restart_required: true }
    };
    const row = this.row();
    const state = infrastructure.ready ? row.state : "INFRASTRUCTURE_NOT_READY";
    return {
      ok: true,
      state,
      setup_required: state === "INSTALLATION_REQUIRED" || state === "INSTALLATION_IN_PROGRESS" || state === "INSTALLATION_RECOVERY_REQUIRED",
      authorization_required: state !== "INSTALLATION_COMPLETE" && state !== "INFRASTRUCTURE_NOT_READY",
      infrastructure,
      public_origins: {
        store: this.options.config.frontendPublicOrigin ?? null,
        api: this.options.config.federationPublicOrigin ?? this.options.config.oidcPublicOrigin ?? null
      },
      mdns: {
        infrastructure_allowed: this.options.config.mdnsEnabled,
        application_enabled: this.applicationMdnsPreference(),
        effective_enabled: this.options.config.mdnsEnabled && this.applicationMdnsPreference(),
        service_type: "_prg32store._tcp.local.",
        abi: "prg32-store-discovery-1.0",
        port: this.options.config.mdnsPort,
        restart_required: true
      }
    };
  }

  private applicationMdnsPreference(): boolean {
    try {
      const row = this.database.prepare("SELECT value_json FROM application_settings WHERE setting_key = 'discovery.mdns_enabled'").get() as { value_json?: string } | undefined;
      return row?.value_json === "true";
    } catch { return false; }
  }

  progress(session: SetupSession): Record<string, unknown> {
    this.requireSession(session);
    const row = this.row();
    return {
      ok: true,
      state: row.state,
      completed_steps: parseSteps(row.completed_steps_json),
      admin_user_id: row.admin_user_id,
      started_at: row.started_at,
      completed_at: row.completed_at,
      csrf_token: session.csrfToken,
      settings: this.options.settings.read(),
      providers: this.options.providers?.list().map((provider) => safeProvider(provider)) ?? []
    };
  }

  authorize(token: string): { readonly session: SetupSession; readonly progress: Record<string, unknown> } {
    const infrastructure = this.infrastructure();
    const state = this.row().state;
    if (!infrastructure.ready) throw new SetupError("infrastructure_not_ready", 503, "installation infrastructure is not ready");
    if (state === "INSTALLATION_COMPLETE") throw new SetupError("setup_already_complete", 409, "installation is already complete");
    if (state === "INSTALLATION_RECOVERY_REQUIRED") throw new SetupError("setup_recovery_required", 409, "installation recovery requires operator intervention");
    const expectedToken = this.options.config.authBootstrapToken ? Buffer.from(this.options.config.authBootstrapToken) : null;
    const providedToken = Buffer.from(token ?? "");
    if (!expectedToken || expectedToken.length !== providedToken.length || !crypto.timingSafeEqual(expectedToken, providedToken)) {
      throw new SetupError("setup_authorization_invalid", 403, "installation authorization is invalid");
    }
    if (this.activeSessionId && this.sessions.has(this.activeSessionId)) throw new SetupError("setup_session_conflict", 409, "another installation session is active");
    const session: SetupSession = { id: crypto.randomBytes(32).toString("base64url"), csrfToken: crypto.randomBytes(32).toString("base64url"), expiresAt: Date.now() + SETUP_SESSION_SECONDS * 1000 };
    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.row();
      if (current.state === "INSTALLATION_REQUIRED") {
        this.database.prepare("UPDATE setup_state SET state = 'INSTALLATION_IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE singleton_id = 1").run(now(), now());
      }
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      this.sessions.delete(session.id);
      this.activeSessionId = null;
      throw new SetupError("setup_state_unavailable", 503, "installation state could not be updated", { cause: error });
    }
    return { session, progress: this.progress(session) };
  }

  session(id: string | undefined): SetupSession | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(id);
      if (this.activeSessionId === id) this.activeSessionId = null;
      return null;
    }
    return session;
  }

  invalidate(session: SetupSession): void {
    this.sessions.delete(session.id);
    if (this.activeSessionId === session.id) this.activeSessionId = null;
  }

  requireSession(session: SetupSession | null): asserts session is SetupSession {
    if (!session) throw new SetupError("setup_authorization_required", 401, "installation authorization is required");
    if (session.expiresAt <= Date.now()) throw new SetupError("setup_authorization_expired", 401, "installation authorization has expired");
    const state = this.row().state;
    if (state === "INSTALLATION_COMPLETE") throw new SetupError("setup_already_complete", 409, "installation is already complete");
    if (state === "INSTALLATION_RECOVERY_REQUIRED") throw new SetupError("setup_recovery_required", 409, "installation recovery requires operator intervention");
  }

  saveStep(session: SetupSession, stepValue: unknown, payload: unknown, requestId: string): Record<string, unknown> {
    this.requireSession(session);
    if (typeof stepValue !== "string" || !(SETUP_STEPS as readonly string[]).includes(stepValue)) throw new SetupError("setup_step_invalid", 400, "installation step is invalid");
    if (!isRecord(payload) || Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_SETUP_PAYLOAD_BYTES) throw new SetupError("setup_payload_invalid", 400, "installation step payload is invalid");
    const step = stepValue as SetupStep;
    const row = this.row();
    if (parseSteps(row.completed_steps_json).includes(step)) return this.progress(session);
    if (step === "admin") this.saveAdmin(session, payload, requestId);
    else if (step === "store") this.updateSettings(session, payload, ["application.store_name", "application.store_description", "application.contact_email"], requestId);
    else if (step === "registration") this.updateSettings(session, payload, ["registration.enabled", "registration.require_email_verification"], requestId);
    else if (step === "security") this.updateSettings(session, payload, ["session.lifetime_seconds", "publishing.enabled", "review.require_note_on_rejection", "security.notify_user_on_account_change"], requestId);
    else if (step === "smtp") this.updateSettings(session, payload, ["smtp.enabled", "smtp.host", "smtp.port", "smtp.encryption", "smtp.auth_enabled", "smtp.username", "smtp.from_name", "smtp.from_email", "smtp.reply_to", "smtp.connection_timeout_ms", "smtp.delivery_timeout_ms", "smtp.password"], requestId);
    else if (step === "oidc") this.saveOidc(session, payload, requestId);
    else if (step === "saml") this.saveSaml(session, payload, requestId);
    else if (step === "mdns") this.saveMdns(session, payload, requestId);
    else this.markStep(session, step, requestId);
    return this.progress(session);
  }

  private saveAdmin(session: SetupSession, payload: Record<string, unknown>, requestId: string): void {
    const db = this.database;
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.row();
      if (row.admin_user_id !== null || parseSteps(row.completed_steps_json).includes("admin")) throw new SetupError("setup_admin_already_created", 409, "the initial administrator already exists");
      const principal = this.options.auth.bootstrapWithinTransaction(payload, db);
      const steps = JSON.stringify(["admin"]);
      db.prepare("UPDATE setup_state SET state = 'INSTALLATION_IN_PROGRESS', completed_steps_json = ?, admin_user_id = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE singleton_id = 1").run(steps, principal.id, now(), now());
      db.exec("COMMIT");
      this.audit(session, "setup.admin.created", String(principal.id), requestId, principal.id ?? null);
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      if (error instanceof SetupError) throw error;
      throw new SetupError("setup_admin_failed", 400, "initial administrator could not be created", { cause: error });
    }
  }

  private updateSettings(session: SetupSession, payload: Record<string, unknown>, allowed: readonly string[], requestId: string, stepOverride?: SetupStep): void {
    const application: Record<string, unknown> = {};
    for (const key of allowed) {
      const source = key === "smtp.password" ? key : key;
      if (Object.hasOwn(payload, source)) application[source] = payload[source];
    }
    const current = this.row();
    if (current.admin_user_id === null) throw new SetupError("setup_admin_required", 409, "create the initial administrator first");
    this.options.settings.update({ application_settings: application }, { actorUserId: current.admin_user_id, requestId });
    this.markStep(session, stepOverride ?? this.currentStep(allowed), requestId);
  }

  private currentStep(allowed: readonly string[]): SetupStep {
    if (allowed.includes("application.store_name")) return "store";
    if (allowed.includes("registration.enabled")) return "registration";
    if (allowed.includes("session.lifetime_seconds")) return "security";
    return "smtp";
  }

  private saveOidc(session: SetupSession, payload: Record<string, unknown>, requestId: string): void {
    if (!boolValue(payload.enabled, "enabled", false)) return this.markStep(session, "oidc", requestId);
    if (!this.options.providers || !this.options.operations) throw new SetupError("federation_unavailable", 503, "federation administration is unavailable");
    const providerId = stringValue(payload.provider_id, "provider_id", 64, true) as string;
    const apiOrigin = this.apiOrigin();
    const clientAuthMethod = stringValue(payload.client_auth_method, "client_auth_method", 40) ?? "client_secret_basic";
    if (clientAuthMethod !== "client_secret_basic" && clientAuthMethod !== "client_secret_post" && clientAuthMethod !== "none") throw new SetupError("setup_invalid_value", 400, "client_auth_method is invalid");
    const clientSecret = stringValue(payload.client_secret, "client_secret", 16384, clientAuthMethod !== "none");
    const discoveryIssuer = stringValue(payload.discovery_issuer, "discovery_issuer", 512);
    const input: ProviderInput = {
      providerId,
      protocol: "oidc",
      displayName: stringValue(payload.display_name, "display_name", 160, true) as string,
      issuer: stringValue(payload.issuer, "issuer", 512, true) as string,
      clientId: stringValue(payload.client_id, "client_id", 240, true) as string,
      clientAuthMethod,
      ...(discoveryIssuer === undefined ? {} : { discoveryIssuer }),
      redirectUri: `${apiOrigin}/api/auth/oidc/${encodeURIComponent(providerId)}/callback`,
      scopes: Array.isArray(payload.scopes) ? payload.scopes.filter((item): item is string => typeof item === "string") : ["openid", "profile", "email"]
    };
    const actor = this.row().admin_user_id as number;
    const context = { actorUserId: actor, requestId };
    const created = this.options.providers.create(input, context);
    if (clientSecret) {
      this.options.operations.rotateProviderSecret(created.providerId, "oidc-client-secret", clientSecret, context);
      this.options.providers.update(created.providerId, { clientSecretReference: `federated-provider:${created.providerId}:oidc-client-secret` }, context);
    }
    this.options.operations.setEnabled(created.providerId, true, context);
    this.markStep(session, "oidc", requestId);
  }

  private saveSaml(session: SetupSession, payload: Record<string, unknown>, requestId: string): void {
    if (!boolValue(payload.enabled, "enabled", false)) return this.markStep(session, "saml", requestId);
    if (!this.options.providers || !this.options.operations) throw new SetupError("federation_unavailable", 503, "federation administration is unavailable");
    const providerId = stringValue(payload.provider_id, "provider_id", 64, true) as string;
    const apiOrigin = this.apiOrigin();
    const idpEntityId = stringValue(payload.idp_entity_id, "idp_entity_id", 512, true) as string;
    const input: ProviderInput = {
      providerId,
      protocol: "saml",
      displayName: stringValue(payload.display_name, "display_name", 160, true) as string,
      issuer: idpEntityId,
      idpEntityId,
      spEntityId: `${apiOrigin}/api/auth/saml/${encodeURIComponent(providerId)}/metadata`,
      acsUrl: `${apiOrigin}/api/auth/saml/${encodeURIComponent(providerId)}/acs`,
      samlEntryPoint: stringValue(payload.saml_entry_point, "saml_entry_point", 512, true) as string,
      samlNameIdFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
      samlIdpCertificatePem: stringValue(payload.saml_idp_certificate_pem, "saml_idp_certificate_pem", 65536, true) as string,
      samlWantAssertionsSigned: true,
      samlWantAuthnResponseSigned: true,
      samlSignAuthnRequests: false
    };
    const actor = this.row().admin_user_id as number;
    const context = { actorUserId: actor, requestId };
    const created = this.options.providers.create(input, context);
    this.options.operations.setEnabled(created.providerId, true, context);
    this.markStep(session, "saml", requestId);
  }

  private saveMdns(session: SetupSession, payload: Record<string, unknown>, requestId: string): void {
    const enabled = boolValue(payload.enabled, "enabled", false);
    if (enabled && !this.options.config.mdnsEnabled) throw new SetupError("mdns_infrastructure_denied", 409, "mDNS is disabled by deployment policy");
    this.updateSettings(session, { "discovery.mdns_enabled": enabled }, ["discovery.mdns_enabled"], requestId, "mdns");
  }

  private apiOrigin(): string {
    const origin = this.options.config.federationPublicOrigin ?? this.options.config.oidcPublicOrigin ?? this.options.config.frontendPublicOrigin;
    if (!origin) throw new SetupError("public_api_origin_unavailable", 503, "the public API origin is not configured");
    return origin.replace(/\/$/u, "");
  }

  private markStep(session: SetupSession, step: SetupStep, requestId: string): void {
    this.requireSession(session);
    const row = this.row();
    const steps = parseSteps(row.completed_steps_json);
    if (!steps.includes(step)) steps.push(step);
    this.database.prepare("UPDATE setup_state SET state = CASE WHEN state = 'INSTALLATION_REQUIRED' THEN 'INSTALLATION_IN_PROGRESS' ELSE state END, completed_steps_json = ?, updated_at = ? WHERE singleton_id = 1").run(JSON.stringify(steps.sort()), now());
    if (row.admin_user_id !== null) this.audit(session, `setup.step.${step}`, step, requestId, row.admin_user_id);
  }

  complete(session: SetupSession, requestId: string): Record<string, unknown> {
    this.requireSession(session);
    const db = this.database;
    db.exec("BEGIN IMMEDIATE");
    let adminId: number | null = null;
    try {
      const row = this.row();
      const steps = parseSteps(row.completed_steps_json);
      const missing = SETUP_STEPS.filter((step) => !steps.includes(step));
      if (missing.length > 0 || row.admin_user_id === null) throw new SetupError("setup_steps_incomplete", 409, `installation steps are incomplete: ${missing.join(", ") || "admin"}`);
      if (row.state === "INSTALLATION_COMPLETE") throw new SetupError("setup_already_complete", 409, "installation is already complete");
      adminId = row.admin_user_id;
      db.prepare("UPDATE setup_state SET state = 'INSTALLATION_COMPLETE', completed_at = ?, updated_at = ?, recovery_reason = NULL WHERE singleton_id = 1").run(now(), now());
      db.exec("COMMIT");
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      if (error instanceof SetupError) throw error;
      throw new SetupError("setup_completion_failed", 503, "installation could not be completed", { cause: error });
    }
    if (adminId !== null) this.audit(session, "setup.completed", "installation", requestId, adminId);
    this.invalidate(session);
    return { ok: true, state: "INSTALLATION_COMPLETE", redirect: "/auth/login" };
  }

  private audit(_session: SetupSession, action: string, targetId: string, requestId: string, actorUserId: number | null): void {
    if (!this.options.audit || actorUserId === null) return;
    try { this.options.audit.append({ actor_user_id: actorUserId, target_type: "installation", target_id: targetId, action, outcome: "committed", request_id: requestId }); } catch { /* setup state remains authoritative; diagnostics never expose secrets */ }
  }
}
