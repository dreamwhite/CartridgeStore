import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { openAuthWriteDatabase, type ReadonlyDatabase, type ReadonlyDatabaseManager } from "../db/readonly.js";
import { isAccountEnabled } from "./account-state.js";
import { verifyWerkzeugPasswordHash } from "./password.js";
import { revokedBefore } from "./revocation.js";
import {
  ANONYMOUS,
  authenticateBearer,
  loadPrincipalById,
  normalizeRole,
  principalFromUserRow,
  type Principal,
  type Role
} from "./principal.js";
import { SessionStore, type SessionRecord } from "./session.js";
import { hashApiToken } from "./tokens.js";
import {
  createUserToken,
  listUserTokens,
  revokeUserToken,
  updateUserToken,
} from "./token-management.js";
import { EmailDeliveryError, type EmailService } from "../email/service.js";
import type { RuntimePolicy } from "../settings/runtime-policy.js";
import {
  AuthConflictError,
  AuthValidationError,
  AuthWriteDisabledError,
} from "./errors.js";
import {
  authScalar,
  AUTH_USERNAME_MAX_LENGTH,
  isValidAuthEmail,
  validateAccountInput,
  validatePassword,
} from "./validation.js";

export {
  AuthConflictError,
  AuthValidationError,
  AuthWriteDisabledError,
} from "./errors.js";
export { validatePassword } from "./validation.js";

export interface AuthServiceOptions {
  readonly config: BackendConfig;
  readonly readonlyDatabase: ReadonlyDatabaseManager;
  readonly email?: EmailService;
  readonly runtimePolicy?: RuntimePolicy;
}

export interface AuthRequestContext {
  readonly principal: Principal;
  readonly session: SessionRecord | null;
  readonly bearerOnly: boolean;
}

export class AuthService {
  readonly sessions: SessionStore | null;
  private readonly writeDatabase: ReadonlyDatabase | null;
  private runtimePolicy: RuntimePolicy | undefined;

  constructor(private readonly options: AuthServiceOptions) {
    this.runtimePolicy = options.runtimePolicy;
    this.writeDatabase = options.config.authWriteEnabled ? openAuthWriteDatabase(options.config) : null;
    this.sessions = this.writeDatabase && options.config.authSessionSecret
      ? new SessionStore(options.config.authSessionSecret, () => this.runtimePolicy?.sessionLifetimeSeconds() ?? options.config.authSessionLifetimeSeconds, this.writeDatabase.sqlite)
      : null;
  }

  setRuntimePolicy(policy: RuntimePolicy): void { this.runtimePolicy = policy; }

  sessionLifetimeSeconds(): number {
    return this.runtimePolicy?.sessionLifetimeSeconds() ?? this.options.config.authSessionLifetimeSeconds;
  }

  close(): void {
    this.writeDatabase?.close();
  }

  invalidateAllSessions(): void {
    this.sessions?.clear();
  }

  isWriteEnabled(): boolean {
    return this.writeDatabase !== null;
  }

  database(): Database.Database {
    return (this.writeDatabase ?? this.options.readonlyDatabase.get()).sqlite;
  }

  writableDatabase(): Database.Database {
    if (!this.writeDatabase) throw new AuthWriteDisabledError();
    return this.writeDatabase.sqlite;
  }

  context(cookieValue: string | undefined, bearerToken: string | undefined): AuthRequestContext {
    const session = this.sessions?.get(cookieValue) ?? null;
    try {
      const database = this.database();
      if (session?.userId !== null && session?.userId !== undefined) {
        if (session.createdAt > revokedBefore(database, session.userId) && isAccountEnabled(database, session.userId)) {
          const principal = loadPrincipalById(database, session.userId, "session");
          if (principal.authenticated) return { principal, session, bearerOnly: false };
        }
      }
      if (bearerToken) {
        const principal = authenticateBearer(database, bearerToken, this.isWriteEnabled());
        if (principal.authenticated) return { principal, session, bearerOnly: !session };
      }
    } catch {
      // Shadow/readiness failures must never turn into an auth bypass or an
      // exception that leaks the configured database path.
    }
    return { principal: ANONYMOUS, session, bearerOnly: false };
  }

  csrfToken(session: SessionRecord | null): string | null {
    return session?.csrfToken ?? null;
  }

  issueAnonymousSession(): { readonly record: SessionRecord; readonly cookieValue: string } {
    if (!this.sessions) throw new AuthWriteDisabledError();
    return this.sessions.issue(null);
  }

  rotateSession(old: SessionRecord | null, userId: number): { readonly record: SessionRecord; readonly cookieValue: string } | null {
    if (!this.sessions) return null;
    if (!isAccountEnabled(this.database(), userId)) return null;
    const minimum = revokedBefore(this.database(), userId) + 1;
    return this.sessions.rotate(old, userId, Math.max(Date.now(), minimum));
  }

  recentAdminReauthenticate(session: SessionRecord, password: string): boolean {
    if (session.userId === null) return false;
    const row = this.database().prepare("SELECT password_hash, role, disabled_at, account_status FROM users WHERE id = ?").get(session.userId) as {
      password_hash: string | null; role: string; disabled_at: string | null; account_status?: string | null
    } | undefined;
    if (!row || row.role !== "admin" || !isAccountEnabled(this.database(), session.userId) || !row.password_hash) return false;
    const result = verifyWerkzeugPasswordHash(row.password_hash, password);
    if (result.status !== "valid") return false;
    this.sessions?.recordRecentReauthentication(session);
    return true;
  }

  reauthenticate(session: SessionRecord, password: string): boolean {
    if (session.userId === null) return false;
    const row = this.database().prepare("SELECT password_hash FROM users WHERE id = ?").get(session.userId) as { password_hash: string | null } | undefined;
    if (!row?.password_hash || !isAccountEnabled(this.database(), session.userId)) return false;
    const result = verifyWerkzeugPasswordHash(row.password_hash, password);
    if (result.status !== "valid") return false;
    this.sessions?.recordRecentReauthentication(session);
    return true;
  }

  hasRecentReauthentication(session: SessionRecord): boolean {
    return session.reauthenticatedAt !== null && session.reauthenticatedAt >= Date.now() - this.options.config.authRecentReauthSeconds * 1000;
  }

  login(username: string, password: string): Principal {
    const db = this.writableDatabase();
    const row = db.prepare(
      "SELECT id, username, email, password_hash, role, external_provider, disabled_at, account_status FROM users WHERE username = ? OR email = ?"
    ).get(username.trim(), username.trim().toLowerCase()) as {
      id: number; username: string; email: string; password_hash: string | null; role: string; external_provider: string | null; disabled_at: string | null; account_status?: string | null
    } | undefined;
    if (!row?.password_hash || !isAccountEnabled(db, row.id)) return ANONYMOUS;
    const result = verifyWerkzeugPasswordHash(row.password_hash, password);
    if (result.status !== "valid") return ANONYMOUS;
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(row.id);
    return principalFromUserRow(db, row, "session");
  }

  bootstrap(payload: Record<string, unknown>): Principal {
    const db = this.writableDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const principal = this.bootstrapWithinTransaction(payload, db);
      db.exec("COMMIT");
      return principal;
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Create the first administrator while the caller owns an existing
   * transaction.  The setup wizard uses this to commit the account and its
   * installation-state transition atomically; the legacy bootstrap route
   * continues to use bootstrap() above.
   */
  bootstrapWithinTransaction(payload: Record<string, unknown>, db = this.writableDatabase()): Principal {
    const username = authScalar(payload.username).trim();
    const email = authScalar(payload.email).trim().toLowerCase();
    const password = authScalar(payload.password);
    const confirmation = authScalar(payload.password_confirm, password);
    validateAccountInput(username, email, password, confirmation);
    let userId = 0;
    const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' OR username = 'admin' LIMIT 1").get();
    const completed = db.prepare("SELECT value FROM store_settings WHERE key = 'auth_bootstrap_completed'").get() as { value?: string } | undefined;
    if (existingAdmin || completed?.value === "true") {
      throw new AuthConflictError("bootstrap already completed");
    }
    try {
      const result = db.prepare(
        "INSERT INTO users(username, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
      ).run(username, email, generateWerkzeugScryptHash(password));
      userId = Number(result.lastInsertRowid);
      db.prepare("INSERT OR IGNORE INTO groups(name) VALUES ('editors')").run();
      const group = db.prepare("SELECT id FROM groups WHERE name = 'editors'").get() as { id: number };
      db.prepare("INSERT OR IGNORE INTO user_groups(user_id, group_id) VALUES (?, ?)").run(userId, group.id);
      db.prepare(
        "INSERT INTO store_settings(key, value) VALUES ('auth_bootstrap_completed', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run();
    } catch (error) {
      if (error instanceof AuthConflictError) throw error;
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        throw new AuthConflictError("username or email already exists");
      }
      throw error;
    }
    return loadPrincipalById(db, userId, "session");
  }

  async requestRegistration(email: string): Promise<void> {
    await this.requestRegistrationDetails({ email });
  }

  async requestRegistrationDetails(payload: Record<string, unknown>): Promise<{ readonly email: string }> {
    const db = this.writableDatabase();
    ensureAuthWorkflowSchema(db);
    const normalized = authScalar(payload.email).trim().toLowerCase();
    if (!isValidAuthEmail(normalized)) throw new AuthValidationError("email must be valid");
    const username = authScalar(payload.username, normalized).trim();
    const password = authScalar(payload.password);
    const confirmation = authScalar(payload.password_confirm, password);
    if (payload.username !== undefined || payload.password !== undefined || payload.password_confirm !== undefined) {
      if (!username || username.length > AUTH_USERNAME_MAX_LENGTH) throw new AuthValidationError("username is required and must be at most 80 characters");
      validatePassword(password, confirmation);
    }
    let token = "";
    try {
      db.exec("BEGIN IMMEDIATE");
      if (this.runtimePolicy && !this.runtimePolicy.registrationEnabled()) throw new AuthValidationError("registration is closed");
      if (!this.runtimePolicy) {
        const setting = db.prepare("SELECT value FROM store_settings WHERE key = 'auth_allow_registration'").get() as { value?: string } | undefined;
        if (setting?.value === "false") throw new AuthValidationError("registration is closed");
      }
      const requiredDomain = registrationDomain(db);
      if (requiredDomain && !normalized.endsWith(`@${requiredDomain}`)) {
        throw new AuthValidationError(`email must belong to ${requiredDomain}`);
      }
      const existing = db.prepare("SELECT id FROM users WHERE email = ? OR username = ?").get(normalized, username);
      if (existing) {
        db.exec("COMMIT");
        return { email: normalized };
      }
      token = crypto.randomBytes(32).toString("base64url");
      db.prepare("UPDATE registration_tokens SET used_at = datetime('now') WHERE email = ? AND used_at IS NULL").run(normalized);
      db.prepare(
        "INSERT INTO registration_tokens(email, username, password_hash, token_hash, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+24 hours'))"
      ).run(normalized, username, password ? generateWerkzeugScryptHash(password) : null, hashApiToken(token));
      db.exec("COMMIT");
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      throw error;
    }
    if (!this.options.email) throw new AuthValidationError("registration email delivery is unavailable");
    try { await this.options.email.sendRegistration(normalized, token); }
    catch (error) {
      try { db.prepare("UPDATE registration_tokens SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL").run(hashApiToken(token)); } catch { /* diagnostics stay server-side */ }
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError();
    }
    return { email: normalized };
  }

  completeRegistration(payload: Record<string, unknown>): Principal {
    const db = this.writableDatabase();
    ensureAuthWorkflowSchema(db);
    const token = authScalar(payload.token);
    const password = authScalar(payload.password);
    const confirmation = authScalar(payload.password_confirm, password);
    try {
      db.exec("BEGIN IMMEDIATE");
      const record = db.prepare(
        "SELECT id, email, username, password_hash FROM registration_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
      ).get(hashApiToken(token)) as { id: number; email: string; username: string | null; password_hash: string | null } | undefined;
      if (!record) throw new AuthValidationError("registration link is invalid or expired");
      if (!record.password_hash) validatePassword(password, confirmation);
      const existing = db.prepare("SELECT id FROM users WHERE email = ? OR username = ?").get(record.email, record.username ?? record.email);
      if (existing) {
        db.prepare("UPDATE registration_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(record.id);
        db.exec("COMMIT");
        throw new AuthValidationError("account already exists");
      }
      const finalPasswordHash = record.password_hash ?? generateWerkzeugScryptHash(password);
      const finalUsername = record.username?.trim() || record.email;
      const result = db.prepare(
        "INSERT INTO users(username, email, password_hash, role) VALUES (?, ?, ?, 'user')"
      ).run(finalUsername, record.email, finalPasswordHash);
      const consumed = db.prepare(
        "UPDATE registration_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL AND expires_at > datetime('now')"
      ).run(record.id).changes;
      if (consumed !== 1) throw new AuthValidationError("registration link is invalid or expired");
      db.exec("COMMIT");
      return loadPrincipalById(db, Number(result.lastInsertRowid), "session");
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  emailMessages(): readonly Record<string, unknown>[] {
    return this.options.email?.testMessages().map((message) => ({ to: message.to, from: message.from, subject: message.subject, text: message.text, html: message.html, created_at: message.createdAt })) ?? [];
  }

  changePassword(userId: number, currentPassword: string, password: string, confirmation: string): void {
    validatePassword(password, confirmation);
    const db = this.writableDatabase();
    const row = db.prepare("SELECT password_hash, external_provider, email FROM users WHERE id = ? AND disabled_at IS NULL").get(userId) as { password_hash: string | null; external_provider: string | null; email: string } | undefined;
    if (!row?.password_hash || row.external_provider) throw new AuthValidationError("local password management is unavailable for this account");
    if (verifyWerkzeugPasswordHash(row.password_hash, currentPassword).status !== "valid") throw new AuthValidationError("current password is incorrect");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(generateWerkzeugScryptHash(password), userId);
    db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(userId);
    this.sessions?.invalidateUser(userId);
  }

  async requestPasswordReset(identifier: string): Promise<void> {
    const db = this.writableDatabase();
    ensureAuthWorkflowSchema(db);
    const normalized = identifier.trim();
    if (!normalized) return;
    const row = db.prepare("SELECT id, email, password_hash, external_provider, disabled_at FROM users WHERE lower(email) = lower(?) OR username = ? LIMIT 1").get(normalized, normalized) as { id: number; email: string; password_hash: string | null; external_provider: string | null; disabled_at: string | null } | undefined;
    if (!row || row.disabled_at !== null || !row.password_hash || row.external_provider) return;
    const token = crypto.randomBytes(32).toString("base64url");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(row.id);
      db.prepare("INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run(row.id, hashApiToken(token));
      db.exec("COMMIT");
    } catch (error) { if (db.inTransaction) db.exec("ROLLBACK"); throw error; }
    if (!this.options.email) throw new EmailDeliveryError();
    try { await this.options.email.sendPasswordReset(row.email, token); }
    catch (error) {
      db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL").run(hashApiToken(token));
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError();
    }
  }

  completePasswordReset(token: string, password: string, confirmation: string): void {
    validatePassword(password, confirmation);
    const db = this.writableDatabase();
    ensureAuthWorkflowSchema(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db.prepare("SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')").get(hashApiToken(token)) as { id: number; user_id: number } | undefined;
      if (!row) throw new AuthValidationError("password reset link is invalid or expired");
      const user = db.prepare("SELECT password_hash, external_provider, disabled_at FROM users WHERE id = ?").get(row.user_id) as { password_hash: string | null; external_provider: string | null; disabled_at: string | null } | undefined;
      if (!user?.password_hash || user.external_provider || user.disabled_at !== null) throw new AuthValidationError("password reset link is invalid or expired");
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(generateWerkzeugScryptHash(password), row.user_id);
      const consumed = db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(row.id).changes;
      if (consumed !== 1) throw new AuthValidationError("password reset link is invalid or expired");
      db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(row.user_id);
      this.sessions?.invalidateUser(row.user_id);
      db.exec("COMMIT");
    } catch (error) { if (db.inTransaction) db.exec("ROLLBACK"); throw error; }
  }

  listTokens(userId: number): Array<Record<string, unknown>> {
    return listUserTokens(this.database(), userId);
  }

  createToken(userId: number, label: string): Record<string, unknown> {
    return createUserToken(this.writableDatabase(), userId, label);
  }

  updateToken(userId: number, tokenId: number, label: string): boolean {
    return updateUserToken(this.writableDatabase(), userId, tokenId, label);
  }

  revokeToken(userId: number, tokenId: number): boolean {
    return revokeUserToken(this.writableDatabase(), userId, tokenId);
  }
}

function registrationDomain(database: Database.Database): string {
  const setting = database.prepare("SELECT value FROM store_settings WHERE key = 'auth_require_email_domain'").get() as { value?: string } | undefined;
  return typeof setting?.value === "string" ? setting.value.trim().toLowerCase().replace(/^@+/, "") : "";
}

function ensureAuthWorkflowSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id, used_at, expires_at);
  `);
  for (const [column, definition] of [["username", "TEXT"], ["password_hash", "TEXT"]] as const) {
    const present = (database.prepare("PRAGMA table_info(registration_tokens)").all() as Array<{ name: string }>).some((row) => row.name === column);
    if (!present) database.exec(`ALTER TABLE registration_tokens ADD COLUMN "${column}" ${definition}`);
  }
}

export function generateWerkzeugScryptHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 132 * (2 ** 15) * 8 * 1
  });
  return `scrypt:32768:8:1$${salt}$${digest.toString("hex")}`;
}

export function configuredRole(value: string): Role {
  return normalizeRole(value);
}
