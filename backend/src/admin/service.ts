import type Database from "better-sqlite3";

import { markRevokedBefore } from "../auth/revocation.js";
import { hasAccountStateColumn, invalidateAccountAccess } from "../auth/account-state.js";
import { generateWerkzeugScryptHash, validatePassword } from "../auth/service.js";
import { ROLE_LEVELS, normalizeRole, type Role } from "../auth/principal.js";
import type { BackendConfig } from "../config/env.js";
import { AdminAuditLog } from "./audit.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const GROUP_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const MAX_GROUP_IDS = 50;

type DatabaseSource = Database.Database | (() => Database.Database);

export interface AdminMutationContext {
  readonly actorUserId: number;
  readonly requestId: string;
}

export interface UserCreateInput {
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly passwordConfirm?: string;
  readonly role?: string;
  readonly groupIds?: readonly number[];
}

export interface UserUpdateInput {
  readonly username?: string;
  readonly email?: string;
  readonly password?: string;
  readonly passwordConfirm?: string;
}

export interface UserView {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly role: Role;
  readonly external_provider: string | null;
  readonly created_at: string;
  readonly last_login: string | null;
  readonly groups: readonly GroupView[];
  readonly disabled_at: string | null;
}

export interface GroupView {
  readonly id: number;
  readonly name: string;
  readonly created_at: string;
  readonly user_count: number;
}

export class AdminError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = "AdminError";
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveId(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new AdminError("invalid_identifier", 400, `${label} is invalid`);
  return Number(value);
}

function normalizeUsername(value: unknown): string {
  const username = text(value);
  if (!USERNAME_RE.test(username)) throw new AdminError("invalid_username", 400, "username is invalid");
  return username;
}

function normalizeEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new AdminError("invalid_email", 400, "email is invalid");
  return email;
}

function normalizeRoleValue(value: unknown): Role {
  if (typeof value !== "string") throw new AdminError("invalid_role", 400, "role is invalid");
  try {
    return normalizeRole(value);
  } catch {
    throw new AdminError("invalid_role", 400, "role is invalid");
  }
}

function normalizeGroupIds(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_GROUP_IDS) throw new AdminError("invalid_group_ids", 400, "group_ids is invalid");
  const ids = value.map((item) => positiveId(item, "group id"));
  if (new Set(ids).size !== ids.length) throw new AdminError("duplicate_group_ids", 400, "group_ids contains duplicates");
  return ids;
}

function normalizeGroupName(value: unknown): string {
  const name = text(value).toLowerCase();
  if (!GROUP_RE.test(name)) throw new AdminError("invalid_group_name", 400, "group name is invalid");
  return name;
}

function sqliteCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function jsonGroups(value: unknown): GroupView[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is GroupView => {
      if (item === null || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return Number.isSafeInteger(row.id) && typeof row.name === "string";
    }).map((item) => ({
      id: Number(item.id),
      name: item.name,
      created_at: typeof item.created_at === "string" ? item.created_at : "",
      user_count: 0
    }));
  } catch {
    return [];
  }
}

export class AdminIdentityService {
  private readonly source: DatabaseSource;
  private readonly writable: Database.Database | null;
  private readonly audit: AdminAuditLog;

  constructor(options: { readonly config: BackendConfig; readonly database: DatabaseSource; readonly writableDatabase: Database.Database | null; readonly audit?: AdminAuditLog }) {
    this.source = options.database;
    this.writable = options.writableDatabase;
    this.audit = options.audit ?? new AdminAuditLog(options.config);
  }

  private get database(): Database.Database {
    return typeof this.source === "function" ? this.source() : this.source;
  }

  private requireWriter(): Database.Database {
    if (!this.writable) throw new AdminError("admin_write_unavailable", 503, "administrative writes are unavailable");
    return this.writable;
  }

  private ensureEditors(database: Database.Database): void {
    const row = database.prepare("SELECT id FROM groups WHERE name = 'editors'").get() as { id?: number } | undefined;
    if (!row?.id) throw new AdminError("admin_identity_inconsistent", 503, "protected editors group is unavailable");
  }

  private user(database: Database.Database, userId: number): UserView {
    const disabledColumn = hasAccountStateColumn(database) ? "users.disabled_at" : "NULL AS disabled_at";
    const row = database.prepare(
      `SELECT id, username, email, role, external_provider, created_at, last_login, ${disabledColumn},
              (SELECT json_group_array(json_object('id', groups.id, 'name', groups.name, 'created_at', groups.created_at))
                 FROM user_groups JOIN groups ON groups.id = user_groups.group_id
                WHERE user_groups.user_id = users.id) AS groups_json
         FROM users WHERE id = ?`
    ).get(userId) as {
      id: number; username: string; email: string; role: string; external_provider: string | null;
      created_at: string; last_login: string | null; groups_json: string | null; disabled_at: string | null
    } | undefined;
    if (!row) throw new AdminError("user_not_found", 404, "user not found");
    let role: Role;
    try { role = normalizeRole(row.role); } catch { throw new AdminError("admin_identity_inconsistent", 503, "stored user role is invalid"); }
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role,
      external_provider: row.external_provider,
      created_at: row.created_at,
      last_login: row.last_login,
      groups: jsonGroups(row.groups_json ?? "[]")
      ,disabled_at: row.disabled_at
    };
  }

  private mutate<T>(context: AdminMutationContext, action: string, targetType: string, targetId: string, callback: (database: Database.Database) => T): T {
    const database = this.requireWriter();
    this.audit.ensureReady();
    this.audit.append({ actor_user_id: context.actorUserId, target_type: targetType, target_id: targetId, action, outcome: "attempted", request_id: context.requestId });
    try {
      database.exec("BEGIN IMMEDIATE");
      const result = callback(database);
      database.exec("COMMIT");
      try {
        this.audit.append({ actor_user_id: context.actorUserId, target_type: targetType, target_id: targetId, action, outcome: "committed", request_id: context.requestId });
      } catch {
        // SQLite is already committed. The report documents this unavoidable
        // two-persistence limitation; preflight remains fail-closed.
      }
      return result;
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      try {
        this.audit.append({ actor_user_id: context.actorUserId, target_type: targetType, target_id: targetId, action, outcome: "failed", request_id: context.requestId });
      } catch {
        // Preserve the original stable mutation error.
      }
      if (error instanceof AdminError) throw error;
      const code = sqliteCode(error);
      if (code === "SQLITE_CONSTRAINT_UNIQUE") throw new AdminError("identity_conflict", 409, "identity value already exists");
      if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") throw new AdminError("user_delete_restricted", 409, "user has protected historical references");
      throw new AdminError("admin_operation_failed", 500, "administrative operation failed");
    }
  }

  listUsers(options: { readonly page: number; readonly limit: number; readonly query?: string; readonly role?: string; readonly groupId?: number }): { readonly users: readonly UserView[]; readonly page: number; readonly limit: number; readonly total: number } {
    const limit = Math.min(Math.max(options.limit, 1), 100);
    const page = Math.max(options.page, 1);
    const filters: string[] = [];
    const values: Array<string | number> = [];
    if (options.query) {
      const escaped = options.query.replace(/[\\%_]/g, (item) => `\\${item}`);
      filters.push("(users.username LIKE ? ESCAPE '\\' OR users.email LIKE ? ESCAPE '\\')");
      values.push(`%${escaped}%`, `%${escaped}%`);
    }
    if (options.role) { const role = normalizeRoleValue(options.role); filters.push("users.role = ?"); values.push(role); }
    if (options.groupId !== undefined) { positiveId(options.groupId, "group_id"); filters.push("EXISTS (SELECT 1 FROM user_groups filter_ug WHERE filter_ug.user_id = users.id AND filter_ug.group_id = ?)"); values.push(options.groupId); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const database = this.database;
    const disabledColumn = hasAccountStateColumn(database) ? "users.disabled_at" : "NULL AS disabled_at";
    const total = Number((database.prepare(`SELECT COUNT(*) AS count FROM users ${where}`).get(...values) as { count: number }).count);
    const rows = database.prepare(
      `SELECT users.id, users.username, users.email, users.role, users.external_provider, users.created_at, users.last_login, ${disabledColumn},
              (SELECT json_group_array(json_object('id', groups.id, 'name', groups.name, 'created_at', groups.created_at))
                 FROM user_groups JOIN groups ON groups.id = user_groups.group_id
                WHERE user_groups.user_id = users.id) AS groups_json
         FROM users ${where} ORDER BY users.created_at ASC, users.id ASC LIMIT ? OFFSET ?`
    ).all(...values, limit, (page - 1) * limit) as Array<{
      id: number; username: string; email: string; role: string; external_provider: string | null;
      created_at: string; last_login: string | null; groups_json: string | null; disabled_at: string | null
    }>;
    const users = rows.map((row) => this.userFromRow(row));
    return { users, page, limit, total };
  }

  private userFromRow(row: { id: number; username: string; email: string; role: string; external_provider: string | null; created_at: string; last_login: string | null; groups_json: string | null; disabled_at: string | null }): UserView {
    let role: Role;
    try { role = normalizeRole(row.role); } catch { throw new AdminError("admin_identity_inconsistent", 503, "stored user role is invalid"); }
    return { id: row.id, username: row.username, email: row.email, role, external_provider: row.external_provider, created_at: row.created_at, last_login: row.last_login, groups: jsonGroups(row.groups_json ?? "[]"), disabled_at: row.disabled_at };
  }

  getUser(userId: number): UserView { return this.user(this.database, positiveId(userId, "user_id")); }

  createUser(input: UserCreateInput, context: AdminMutationContext): UserView {
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    if (typeof input.password !== "string" || !input.password) throw new AdminError("invalid_password", 400, "password is required");
    validatePassword(input.password, input.passwordConfirm ?? input.password);
    const role = input.role === undefined ? "user" : normalizeRoleValue(input.role);
    const groupIds = normalizeGroupIds(input.groupIds);
    const passwordHash = generateWerkzeugScryptHash(input.password);
    return this.mutate(context, "user.create", "user", "pending", (database) => {
      this.ensureEditors(database);
      this.assertGroups(database, groupIds);
      const result = database.prepare("INSERT INTO users(username, email, password_hash, role) VALUES (?, ?, ?, ?)").run(username, email, passwordHash, role);
      const userId = Number(result.lastInsertRowid);
      this.setGroups(database, userId, groupIds);
      return this.user(database, userId);
    });
  }

  updateUser(userId: number, input: UserUpdateInput, context: AdminMutationContext): UserView {
    const id = positiveId(userId, "user_id");
    if (input.username === undefined && input.email === undefined && input.password === undefined) throw new AdminError("empty_user_update", 400, "user update is empty");
    const username = input.username === undefined ? undefined : normalizeUsername(input.username);
    const email = input.email === undefined ? undefined : normalizeEmail(input.email);
    if (input.password !== undefined) {
      if (!input.password) throw new AdminError("invalid_password", 400, "password must not be empty");
      validatePassword(input.password, input.passwordConfirm ?? input.password);
    }
    const passwordHash = input.password === undefined ? undefined : generateWerkzeugScryptHash(input.password);
    return this.mutate(context, "user.update", "user", String(id), (database) => {
      this.ensureEditors(database);
      this.user(database, id);
      const fields: string[] = [];
      const values: string[] = [];
      if (username !== undefined) { fields.push("username = ?"); values.push(username); }
      if (email !== undefined) { fields.push("email = ?"); values.push(email); }
      if (passwordHash !== undefined) { fields.push("password_hash = ?"); values.push(passwordHash); }
      values.push(String(id));
      database.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      if (passwordHash !== undefined) {
        database.prepare("DELETE FROM api_tokens WHERE user_id = ?").run(id);
        markRevokedBefore(database, id);
      }
      return this.user(database, id);
    });
  }

  setRole(userId: number, roleValue: unknown, context: AdminMutationContext): UserView {
    const id = positiveId(userId, "user_id");
    const role = normalizeRoleValue(roleValue);
    return this.mutate(context, "user.role.update", "user", String(id), (database) => {
      this.ensureEditors(database);
      const current = this.user(database, id);
      if (id === context.actorUserId && role !== "admin") throw new AdminError("self_demotion_forbidden", 409, "administrators cannot demote themselves");
      if (current.role === "admin" && role !== "admin") {
        const count = Number((database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count);
        if (count <= 1) throw new AdminError("final_administrator_required", 409, "at least one administrator must remain");
      }
      if (current.role !== role) {
        database.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
        database.prepare("DELETE FROM api_tokens WHERE user_id = ?").run(id);
        markRevokedBefore(database, id);
      }
      return this.user(database, id);
    });
  }

  setDisabled(userId: number, disabledValue: unknown, context: AdminMutationContext): UserView {
    if (typeof disabledValue !== "boolean") throw new AdminError("invalid_account_state", 400, "disabled must be boolean");
    const id = positiveId(userId, "user_id");
    return this.mutate(context, disabledValue ? "user.account.disabled" : "user.account.enabled", "user", String(id), (database) => {
      if (!hasAccountStateColumn(database)) throw new AdminError("account_state_unavailable", 503, "account state is unavailable");
      this.ensureEditors(database);
      const current = this.user(database, id);
      if (id === context.actorUserId && disabledValue) throw new AdminError("self_disable_forbidden", 409, "administrators cannot disable themselves");
      if (current.role === "admin" && disabledValue && current.disabled_at === null) {
        const count = Number((database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL").get() as { count: number }).count);
        if (count <= 1) throw new AdminError("final_administrator_required", 409, "at least one enabled administrator must remain");
      }
      const next = disabledValue ? new Date().toISOString() : null;
      database.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(next, id);
      if (disabledValue) invalidateAccountAccess(database, id);
      return this.user(database, id);
    });
  }

  replaceGroups(userId: number, value: unknown, context: AdminMutationContext): UserView {
    const id = positiveId(userId, "user_id");
    const groupIds = normalizeGroupIds(value);
    return this.mutate(context, "user.groups.replace", "user", String(id), (database) => {
      this.ensureEditors(database);
      this.user(database, id);
      this.assertGroups(database, groupIds);
      const before = (database.prepare("SELECT group_id FROM user_groups WHERE user_id = ? ORDER BY group_id").all(id) as Array<{ group_id: number }>).map((row) => row.group_id);
      if (before.join(",") !== [...groupIds].sort((a, b) => a - b).join(",")) {
        this.setGroups(database, id, groupIds);
        database.prepare("DELETE FROM api_tokens WHERE user_id = ?").run(id);
        markRevokedBefore(database, id);
      }
      return this.user(database, id);
    });
  }

  deleteUser(userId: number, context: AdminMutationContext): { readonly user_id: number } {
    const id = positiveId(userId, "user_id");
    return this.mutate(context, "user.delete", "user", String(id), (database) => {
      this.ensureEditors(database);
      const current = this.user(database, id);
      if (id === context.actorUserId) throw new AdminError("self_deletion_forbidden", 409, "administrators cannot delete themselves");
      if (current.role === "admin") {
        const count = Number((database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count);
        if (count <= 1) throw new AdminError("final_administrator_required", 409, "at least one administrator must remain");
      }
      database.prepare("DELETE FROM api_tokens WHERE user_id = ?").run(id);
      markRevokedBefore(database, id);
      database.prepare("DELETE FROM users WHERE id = ?").run(id);
      return { user_id: id };
    });
  }

  listGroups(limit: number): { readonly groups: readonly GroupView[]; readonly limit: number } {
    const database = this.database;
    this.ensureEditors(database);
    const bounded = Math.min(Math.max(limit, 1), 100);
    const rows = database.prepare(
      `SELECT groups.id, groups.name, groups.created_at, COUNT(user_groups.user_id) AS user_count
         FROM groups LEFT JOIN user_groups ON user_groups.group_id = groups.id
        GROUP BY groups.id ORDER BY groups.name ASC, groups.id ASC LIMIT ?`
    ).all(bounded) as Array<{ id: number; name: string; created_at: string; user_count: number }>;
    return { groups: rows, limit: bounded };
  }

  createGroup(nameValue: unknown, context: AdminMutationContext): GroupView {
    const name = normalizeGroupName(nameValue);
    return this.mutate(context, "group.create", "group", "pending", (database) => {
      this.ensureEditors(database);
      const result = database.prepare("INSERT INTO groups(name) VALUES (?)").run(name);
      return this.group(database, Number(result.lastInsertRowid));
    });
  }

  renameGroup(groupId: number, nameValue: unknown, context: AdminMutationContext): GroupView {
    const id = positiveId(groupId, "group_id");
    const name = normalizeGroupName(nameValue);
    return this.mutate(context, "group.rename", "group", String(id), (database) => {
      this.ensureEditors(database);
      const current = this.group(database, id);
      if (current.name === "editors") throw new AdminError("protected_group", 409, "the editors group cannot be renamed");
      database.prepare("UPDATE groups SET name = ? WHERE id = ?").run(name, id);
      return this.group(database, id);
    });
  }

  deleteGroup(groupId: number, context: AdminMutationContext): { readonly group_id: number } {
    const id = positiveId(groupId, "group_id");
    return this.mutate(context, "group.delete", "group", String(id), (database) => {
      this.ensureEditors(database);
      const current = this.group(database, id);
      if (current.name === "editors") throw new AdminError("protected_group", 409, "the editors group cannot be deleted");
      database.prepare("DELETE FROM user_groups WHERE group_id = ?").run(id);
      database.prepare("DELETE FROM groups WHERE id = ?").run(id);
      return { group_id: id };
    });
  }

  roles(): readonly Record<string, unknown>[] {
    const database = this.database;
    return Object.entries(ROLE_LEVELS).map(([name, level]) => ({
      name,
      level,
      user_count: Number((database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = ?").get(name) as { count: number }).count)
    }));
  }

  private group(database: Database.Database, groupId: number): GroupView {
    const row = database.prepare(
      `SELECT groups.id, groups.name, groups.created_at, COUNT(user_groups.user_id) AS user_count
         FROM groups LEFT JOIN user_groups ON user_groups.group_id = groups.id
        WHERE groups.id = ? GROUP BY groups.id`
    ).get(groupId) as GroupView | undefined;
    if (!row) throw new AdminError("group_not_found", 404, "group not found");
    return row;
  }

  private assertGroups(database: Database.Database, groupIds: readonly number[]): void {
    if (!groupIds.length) return;
    const placeholders = groupIds.map(() => "?").join(",");
    const rows = database.prepare(`SELECT id FROM groups WHERE id IN (${placeholders})`).all(...groupIds) as Array<{ id: number }>;
    if (rows.length !== groupIds.length) throw new AdminError("group_not_found", 404, "one or more groups do not exist");
  }

  private setGroups(database: Database.Database, userId: number, groupIds: readonly number[]): void {
    database.prepare("DELETE FROM user_groups WHERE user_id = ?").run(userId);
    const insert = database.prepare("INSERT INTO user_groups(user_id, group_id) VALUES (?, ?)");
    for (const groupId of groupIds) insert.run(userId, groupId);
  }
}
