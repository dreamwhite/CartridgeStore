import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { isAccountEnabled } from "../auth/account-state.js";
import type { Role } from "../auth/principal.js";
import type { AdminAuditLog } from "../admin/audit.js";
import type { FederationProviderService, FederationProtocol } from "./provider.js";

const MAX_SUBJECT = 512;
const MAX_EMAIL = 254;
const MAX_DISPLAY_NAME = 160;
const MAX_GROUPS = 64;

export interface ExternalIdentityInput {
  readonly protocol: FederationProtocol;
  readonly providerId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly groups?: readonly string[];
  readonly authenticatedAt: string;
}

export class ValidatedExternalIdentity {
  private constructor(readonly value: ExternalIdentityInput) {}

  /**
   * This is the only adapter boundary. OIDC/SAML adapters must call it only
   * after their protocol library has validated the issuer, signature, claims,
   * nonce/request correlation, and timestamps. The identity service accepts
   * this branded class, not an arbitrary object.
   */
  static fromProtocolAdapter(input: ExternalIdentityInput): ValidatedExternalIdentity {
    if (input.protocol !== "oidc" && input.protocol !== "saml") throw new FederationIdentityError("federation_identity_invalid", 400, "identity protocol is invalid");
    for (const [label, value, max] of [
      ["provider_id", input.providerId, 64],
      ["issuer", input.issuer, 512],
      ["subject", input.subject, MAX_SUBJECT],
      ["authenticated_at", input.authenticatedAt, 64]
    ] as const) {
      if (typeof value !== "string" || value.length < 1 || value.length > max) throw new FederationIdentityError("federation_identity_invalid", 400, label + " is invalid");
    }
    if (input.email !== undefined && (typeof input.email !== "string" || input.email.length > MAX_EMAIL)) throw new FederationIdentityError("federation_identity_invalid", 400, "email is invalid");
    if (input.displayName !== undefined && (typeof input.displayName !== "string" || input.displayName.length > MAX_DISPLAY_NAME)) throw new FederationIdentityError("federation_identity_invalid", 400, "display name is invalid");
    if (input.groups !== undefined && (!Array.isArray(input.groups) || input.groups.length > MAX_GROUPS || input.groups.some((item) => typeof item !== "string" || item.length > 128))) {
      throw new FederationIdentityError("federation_identity_invalid", 400, "groups are invalid");
    }
    return new ValidatedExternalIdentity({
      ...input,
      providerId: input.providerId.trim(),
      issuer: input.issuer.trim(),
      subject: input.subject,
      ...(input.email === undefined ? {} : { email: input.email.trim().toLowerCase() }),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
      ...(input.groups === undefined ? {} : { groups: Array.from(input.groups) })
    });
  }
}

export interface ResolvedExternalIdentity {
  readonly identityId: number;
  readonly userId: number;
  readonly providerId: string;
  readonly protocol: FederationProtocol;
  readonly issuer: string;
  readonly subject: string;
  readonly lastLoginAt: string;
}

export interface IdentityLinkView {
  readonly id: number;
  readonly userId: number;
  readonly protocol: FederationProtocol;
  readonly providerId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly unlinkedAt: string | null;
}

export interface IdentityAuthorization {
  readonly actorUserId: number;
  readonly actorRole: Role;
  readonly reauthenticatedAt: number;
  readonly requestId: string;
}

export class FederationIdentityError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = "FederationIdentityError";
  }
}

function auditTarget(identity: ValidatedExternalIdentity): string {
  return crypto.createHash("sha256").update(
    identity.value.protocol + "\0" + identity.value.providerId + "\0" + identity.value.issuer + "\0" + identity.value.subject,
    "utf8"
  ).digest("hex").slice(0, 32);
}

export class FederationIdentityService {
  constructor(
    private readonly database: Database.Database,
    private readonly providers: FederationProviderService,
    private readonly audit?: AdminAuditLog
  ) {}

  list(options: { readonly providerId?: string; readonly includeRetired?: boolean; readonly limit?: number; readonly offset?: number } = {}): readonly IdentityLinkView[] {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);
    const filters = options.providerId === undefined
      ? (options.includeRetired ? "" : "WHERE unlinked_at IS NULL")
      : options.includeRetired ? "WHERE provider_id = ?" : "WHERE provider_id = ? AND unlinked_at IS NULL";
    const values = options.providerId === undefined ? [] : [options.providerId];
    return (this.database.prepare(
      `SELECT id, user_id, protocol, provider_id, issuer, subject, created_at, last_login_at, unlinked_at
         FROM user_external_identities ${filters} ORDER BY id ASC LIMIT ? OFFSET ?`
    ).all(...values, limit, offset) as Array<{ id: number; user_id: number; protocol: FederationProtocol; provider_id: string; issuer: string; subject: string; created_at: string; last_login_at: string | null; unlinked_at: string | null }>).map((row) => ({
      id: row.id, userId: row.user_id, protocol: row.protocol, providerId: row.provider_id,
      issuer: row.issuer, subject: row.subject, createdAt: row.created_at,
      lastLoginAt: row.last_login_at, unlinkedAt: row.unlinked_at
    }));
  }

  resolve(identity: ValidatedExternalIdentity): ResolvedExternalIdentity {
    const provider = this.providers.enabled(identity.value.providerId, identity.value.protocol);
    if (provider.issuer !== identity.value.issuer) {
      throw new FederationIdentityError("federation_identity_issuer_mismatch", 401, "federated identity issuer is invalid");
    }
    const row = this.database.prepare(
      "SELECT id, user_id, protocol, provider_id, issuer, subject, last_login_at, unlinked_at FROM user_external_identities WHERE protocol = ? AND provider_id = ? AND issuer = ? AND subject = ?"
    ).get(identity.value.protocol, provider.providerId, provider.issuer, identity.value.subject) as {
      id: number; user_id: number; protocol: FederationProtocol; provider_id: string; issuer: string; subject: string; last_login_at: string | null; unlinked_at: string | null
    } | undefined;
    if (!row || row.unlinked_at !== null) throw new FederationIdentityError("federation_identity_unknown", 401, "federated identity is not linked");
    if (!isAccountEnabled(this.database, row.user_id)) throw new FederationIdentityError("federation_account_disabled", 403, "local account is disabled");
    const lastLoginAt = new Date().toISOString();
    this.database.prepare("UPDATE user_external_identities SET last_login_at = ? WHERE id = ? AND unlinked_at IS NULL").run(lastLoginAt, row.id);
    return { identityId: row.id, userId: row.user_id, providerId: row.provider_id, protocol: row.protocol, issuer: row.issuer, subject: row.subject, lastLoginAt };
  }

  link(identity: ValidatedExternalIdentity, userId: number, authorization: IdentityAuthorization): ResolvedExternalIdentity {
    this.requireLinkAuthorization(userId, authorization);
    const provider = this.providers.enabled(identity.value.providerId, identity.value.protocol);
    if (provider.issuer !== identity.value.issuer) throw new FederationIdentityError("federation_identity_issuer_mismatch", 409, "federated identity issuer is invalid");
    if (!isAccountEnabled(this.database, userId)) throw new FederationIdentityError("federation_account_disabled", 403, "local account is disabled");
    if (!this.database.prepare("SELECT 1 AS present FROM users WHERE id = ?").get(userId)) throw new FederationIdentityError("federation_user_unknown", 404, "local account is unknown");
    const existing = this.database.prepare(
      "SELECT id, user_id, unlinked_at FROM user_external_identities WHERE protocol = ? AND issuer = ? AND subject = ?"
    ).get(identity.value.protocol, provider.issuer, identity.value.subject) as { id: number; user_id: number; unlinked_at: string | null } | undefined;
    if (existing) {
      throw new FederationIdentityError(existing.unlinked_at === null ? "federation_identity_conflict" : "federation_identity_retired", 409, "federated identity is already reserved");
    }
    const now = new Date().toISOString();
    try {
      this.database.exec("BEGIN IMMEDIATE");
      const inserted = this.database.prepare(
        "INSERT INTO user_external_identities(user_id, protocol, provider_id, issuer, subject, last_login_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, identity.value.protocol, provider.providerId, provider.issuer, identity.value.subject, now);
      this.database.exec("COMMIT");
      this.auditMutation(authorization, "federation.identity.linked", auditTarget(identity));
      return { identityId: Number(inserted.lastInsertRowid), userId, providerId: provider.providerId, protocol: provider.protocol, issuer: provider.issuer, subject: identity.value.subject, lastLoginAt: now };
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      if (error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT")) {
        throw new FederationIdentityError("federation_identity_conflict", 409, "federated identity is already reserved");
      }
      throw error;
    }
  }

  unlink(identityId: number, authorization: IdentityAuthorization): void {
    this.requireLinkAuthorization(authorization.actorUserId, authorization);
    const row = this.database.prepare(
      "SELECT user_id, protocol, provider_id, issuer, subject, unlinked_at FROM user_external_identities WHERE id = ?"
    ).get(identityId) as { user_id: number; protocol: FederationProtocol; provider_id: string; issuer: string; subject: string; unlinked_at: string | null } | undefined;
    if (!row || row.unlinked_at !== null) throw new FederationIdentityError("federation_identity_unknown", 404, "federated identity is unknown");
    if (row.user_id !== authorization.actorUserId && authorization.actorRole !== "admin") throw new FederationIdentityError("federation_link_forbidden", 403, "identity linking is not authorized");
    const account = this.database.prepare("SELECT password_hash FROM users WHERE id = ?").get(row.user_id) as { password_hash: string | null } | undefined;
    const links = Number((this.database.prepare("SELECT COUNT(*) AS count FROM user_external_identities WHERE user_id = ? AND unlinked_at IS NULL").get(row.user_id) as { count: number }).count);
    if (!account || (!account.password_hash && links <= 1)) throw new FederationIdentityError("federation_last_auth_method", 409, "the last usable authentication method cannot be removed");
    this.database.prepare("UPDATE user_external_identities SET unlinked_at = datetime('now') WHERE id = ? AND unlinked_at IS NULL").run(identityId);
    this.auditMutation(authorization, "federation.identity.unlinked", String(identityId));
  }

  private requireLinkAuthorization(userId: number, authorization: IdentityAuthorization): void {
    if (!Number.isSafeInteger(authorization.actorUserId) || !Number.isSafeInteger(userId) ||
      authorization.reauthenticatedAt < Date.now() - 5 * 60 * 1000 ||
      (authorization.actorUserId !== userId && authorization.actorRole !== "admin")) {
      throw new FederationIdentityError("federation_link_forbidden", 403, "identity linking requires recent local authorization");
    }
  }

  private auditMutation(context: IdentityAuthorization, action: string, targetId: string): void {
    if (!this.audit) return;
    // Routes preflight the bounded audit store. Surface a post-commit append
    // failure instead of silently accepting an untracked identity mutation.
    this.audit.append({ actor_user_id: context.actorUserId, target_type: "federation_identity", target_id: targetId, action, outcome: "committed", request_id: context.requestId });
  }
}
