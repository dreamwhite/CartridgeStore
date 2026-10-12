import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type { BackendConfig } from "../config/env.js";
import { openAuthWriteDatabase, type ReadonlyDatabase, type ReadonlyDatabaseManager } from "../db/readonly.js";
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_MAX_LENGTH = 80;

function scalar(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : fallback;
}

export interface AuthServiceOptions {
  readonly config: BackendConfig;
  readonly readonlyDatabase: ReadonlyDatabaseManager;
}

export interface AuthRequestContext {
  readonly principal: Principal;
  readonly session: SessionRecord | null;
  readonly bearerOnly: boolean;
}

export class AuthWriteDisabledError extends Error {
  constructor() {
    super("authentication writes are disabled in this backend");
    this.name = "AuthWriteDisabledError";
  }
}

export class AuthService {
  readonly sessions: SessionStore | null;
  private readonly writeDatabase: ReadonlyDatabase | null;

  constructor(private readonly options: AuthServiceOptions) {
    this.sessions = options.config.authWriteEnabled && options.config.authSessionSecret
      ? new SessionStore(options.config.authSessionSecret, options.config.authSessionLifetimeSeconds)
      : null;
    this.writeDatabase = options.config.authWriteEnabled ? openAuthWriteDatabase(options.config) : null;
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
        if (session.createdAt > revokedBefore(database, session.userId)) {
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
    const minimum = revokedBefore(this.database(), userId) + 1;
    return this.sessions.rotate(old, userId, Math.max(Date.now(), minimum));
  }

  login(username: string, password: string): Principal {
    const db = this.writableDatabase();
    const row = db.prepare(
      "SELECT id, username, email, password_hash, role, external_provider FROM users WHERE username = ? OR email = ?"
    ).get(username.trim(), username.trim().toLowerCase()) as {
      id: number; username: string; email: string; password_hash: string | null; role: string; external_provider: string | null
    } | undefined;
    if (!row?.password_hash) return ANONYMOUS;
    const result = verifyWerkzeugPasswordHash(row.password_hash, password);
    if (result.status !== "valid") return ANONYMOUS;
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(row.id);
    return principalFromUserRow(db, row, "session");
  }

  bootstrap(payload: Record<string, unknown>): Principal {
    const db = this.writableDatabase();
    const username = scalar(payload.username).trim();
    const email = scalar(payload.email).trim().toLowerCase();
    const password = scalar(payload.password);
    const confirmation = scalar(payload.password_confirm, password);
    validateAccountInput(username, email, password, confirmation);
    let userId = 0;
    try {
      db.exec("BEGIN IMMEDIATE");
      const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' OR username = 'admin' LIMIT 1").get();
      const completed = db.prepare("SELECT value FROM store_settings WHERE key = 'auth_bootstrap_completed'").get() as { value?: string } | undefined;
      if (existingAdmin || completed?.value === "true") {
        db.exec("ROLLBACK");
        throw new AuthConflictError("bootstrap already completed");
      }
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
      db.exec("COMMIT");
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      if (error instanceof AuthConflictError) throw error;
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        throw new AuthConflictError("username or email already exists");
      }
      throw error;
    }
    return loadPrincipalById(db, userId, "session");
  }

  requestRegistration(email: string): void {
    const db = this.writableDatabase();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) throw new AuthValidationError("email must be valid");
    try {
      db.exec("BEGIN IMMEDIATE");
      const setting = db.prepare("SELECT value FROM store_settings WHERE key = 'auth_allow_registration'").get() as { value?: string } | undefined;
      if (setting?.value === "false") throw new AuthValidationError("registration is closed");
      const requiredDomain = registrationDomain(db);
      if (requiredDomain && !normalized.endsWith(`@${requiredDomain}`)) {
        throw new AuthValidationError(`email must belong to ${requiredDomain}`);
      }
      const existing = db.prepare("SELECT id FROM users WHERE email = ? OR username = ?").get(normalized, normalized);
      if (existing) {
        db.exec("COMMIT");
        return;
      }
      const token = crypto.randomBytes(32).toString("base64url");
      db.prepare("UPDATE registration_tokens SET used_at = datetime('now') WHERE email = ? AND used_at IS NULL").run(normalized);
      db.prepare(
        "INSERT INTO registration_tokens(email, token_hash, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))"
      ).run(normalized, hashApiToken(token));
      db.exec("COMMIT");
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  completeRegistration(payload: Record<string, unknown>): Principal {
    const db = this.writableDatabase();
    const token = scalar(payload.token);
    const password = scalar(payload.password);
    const confirmation = scalar(payload.password_confirm, password);
    validatePassword(password, confirmation);
    try {
      db.exec("BEGIN IMMEDIATE");
      const record = db.prepare(
        "SELECT id, email FROM registration_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
      ).get(hashApiToken(token)) as { id: number; email: string } | undefined;
      if (!record) throw new AuthValidationError("registration link is invalid or expired");
      const existing = db.prepare("SELECT id FROM users WHERE email = ? OR username = ?").get(record.email, record.email);
      if (existing) {
        db.prepare("UPDATE registration_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(record.id);
        db.exec("COMMIT");
        throw new AuthValidationError("account already exists");
      }
      const result = db.prepare(
        "INSERT INTO users(username, email, password_hash, role) VALUES (?, ?, ?, 'user')"
      ).run(record.email, record.email, generateWerkzeugScryptHash(password));
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

  listTokens(userId: number): Array<Record<string, unknown>> {
    return (this.database().prepare(
      "SELECT id, label, created_at, last_used FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC"
    ).all(userId) as Array<{ id: number; label: string | null; created_at: string; last_used: string | null }>).map((row) => ({
      id: row.id,
      label: row.label || "API token",
      created_at: row.created_at,
      last_used: row.last_used || ""
    }));
  }

  createToken(userId: number, label: string): Record<string, unknown> {
    const db = this.writableDatabase();
    const token = `prg32_${crypto.randomBytes(32).toString("base64url")}`;
    const normalizedLabel = (label.trim() || "API token").slice(0, 80);
    const result = db.prepare("INSERT INTO api_tokens(user_id, token_hash, label) VALUES (?, ?, ?)").run(
      userId, hashApiToken(token), normalizedLabel
    );
    return { ok: true, id: Number(result.lastInsertRowid), label: normalizedLabel, token };
  }

  updateToken(userId: number, tokenId: number, label: string): boolean {
    const normalized = label.trim().slice(0, 80);
    if (!normalized) throw new AuthValidationError("label is required");
    return this.writableDatabase().prepare("UPDATE api_tokens SET label = ? WHERE id = ? AND user_id = ?").run(normalized, tokenId, userId).changes > 0;
  }

  revokeToken(userId: number, tokenId: number): boolean {
    return this.writableDatabase().prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(tokenId, userId).changes > 0;
  }
}

export class AuthValidationError extends Error {
  constructor(message: string) { super(message); this.name = "AuthValidationError"; }
}

export class AuthConflictError extends Error {
  constructor(message: string) { super(message); this.name = "AuthConflictError"; }
}

export function validatePassword(password: string, confirmation: string): void {
  if (password.length < 10) throw new AuthValidationError("password must be at least 10 characters");
  if (password !== confirmation) throw new AuthValidationError("password confirmation does not match");
}

function validateAccountInput(username: string, email: string, password: string, confirmation: string): void {
  if (!username || username.length > USERNAME_MAX_LENGTH) throw new AuthValidationError("username is required and must be at most 80 characters");
  if (!EMAIL_RE.test(email)) throw new AuthValidationError("email must be valid");
  validatePassword(password, confirmation);
}

function registrationDomain(database: Database.Database): string {
  const setting = database.prepare("SELECT value FROM store_settings WHERE key = 'auth_require_email_domain'").get() as { value?: string } | undefined;
  return typeof setting?.value === "string" ? setting.value.trim().toLowerCase().replace(/^@+/, "") : "";
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
