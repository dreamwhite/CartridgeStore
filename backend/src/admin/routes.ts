import crypto from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { encodePythonJson } from "../compatibility/serialization.js";
import { permissionGuard } from "../authorization/guards.js";
import type { AuthorizationService } from "../authorization/service.js";
import type { Permission } from "../authorization/permissions.js";
import { parseCookies } from "../auth/session.js";
import type { AuthRequestContext, AuthService } from "../auth/service.js";
import { AdminError, type AdminIdentityService, type AdminMutationContext } from "./service.js";
import { AuditUnavailableError } from "./audit.js";
import type { AdminTokenService } from "./token-service.js";
import type { CatalogAdminService } from "./catalog-service.js";

const SESSION_COOKIE = "prg32_ts_session";
type JsonObject = Record<string, unknown>;

interface AdminRouteOptions {
  readonly auth: AuthService;
  readonly authorization: AuthorizationService;
  readonly identity: AdminIdentityService;
  readonly tokens: AdminTokenService;
  readonly catalog: CatalogAdminService;
}

interface UserParams { readonly userId: string }
interface GroupParams { readonly groupId: string }
interface TokenParams { readonly tokenId: string }
interface CartridgeParams { readonly cartridgeId: string }

function json(reply: FastifyReply, body: unknown, status = 200): FastifyReply {
  return reply.code(status).header("content-type", "application/json").send(Buffer.from(`${encodePythonJson(body)}\n`, "utf8"));
}

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new AdminError("invalid_json_object", 400, "request body must be a JSON object");
  return value as JsonObject;
}

function assertFields(value: JsonObject, allowed: readonly string[]): void {
  const permitted = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !permitted.has(key));
  if (unknown) throw new AdminError("unknown_field", 400, "request contains an unknown field");
}

function bearer(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim() || undefined;
  const legacy = request.headers["x-prg32-token"];
  return typeof legacy === "string" ? legacy.trim() || undefined : undefined;
}

function context(request: FastifyRequest, auth: AuthService): AuthRequestContext {
  return auth.context(parseCookies(request.headers.cookie).get(SESSION_COOKIE), bearer(request));
}

function constantTimeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function csrfHeader(request: FastifyRequest): string {
  const value = request.headers["x-csrftoken"] ?? request.headers["x-csrf-token"];
  return typeof value === "string" ? value.trim() : "";
}

function adminFailure(reply: FastifyReply, status: 401 | 403): FastifyReply {
  return json(reply, {
    ok: false,
    error: status === 401 ? "login required" : "administrator privileges required",
    code: status === 401 ? "auth_required" : "admin_required"
  }, status);
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply, options: AdminRouteOptions, permission: Permission, mutation: boolean): AuthRequestContext | null {
  const current = context(request, options.auth);
  if (!current.principal.authenticated) { adminFailure(reply, 401); return null; }
  if (!permissionGuard(options.authorization, current.principal, permission)) { adminFailure(reply, 403); return null; }
  if (mutation && current.bearerOnly) {
    json(reply, { ok: false, error: "browser session required", code: "admin_browser_session_required" }, 403);
    return null;
  }
  if (mutation && (!current.session || !csrfHeader(request) || !constantTimeEqual(current.session.csrfToken, csrfHeader(request)))) {
    json(reply, { ok: false, error: "csrf token missing or invalid", code: "csrf_failed" }, 403);
    return null;
  }
  return current;
}

function mutationContext(current: AuthRequestContext, request: FastifyRequest): AdminMutationContext {
  if (current.principal.id === null) throw new AdminError("auth_required", 401, "login required");
  return { actorUserId: current.principal.id, requestId: request.id };
}

function operationFailure(reply: FastifyReply, request: FastifyRequest, error: unknown): FastifyReply {
  request.log.warn({ err: error, requestId: request.id }, "administrative identity request rejected");
  if (error instanceof AdminError) return json(reply, { ok: false, error: error.message, code: error.code }, error.statusCode);
  if (error instanceof AuditUnavailableError) return json(reply, { ok: false, error: "administrative audit storage is unavailable", code: error.code }, error.statusCode);
  return json(reply, { ok: false, error: "administrative identity operation failed", code: "admin_operation_failed" }, 500);
}

function positiveQuery(value: unknown, field: string, fallback: number, maximum: number): number {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new AdminError("invalid_pagination", 400, `${field} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new AdminError("invalid_pagination", 400, `${field} is invalid`);
  return parsed;
}

function queryObject(request: FastifyRequest): JsonObject {
  const query = request.query;
  if (query === null || typeof query !== "object" || Array.isArray(query)) throw new AdminError("invalid_query", 400, "query is invalid");
  return query as JsonObject;
}

function userId(params: UserParams): number {
  if (!/^\d+$/.test(params.userId)) throw new AdminError("invalid_identifier", 400, "user_id is invalid");
  return Number(params.userId);
}

function groupId(params: GroupParams): number {
  if (!/^\d+$/.test(params.groupId)) throw new AdminError("invalid_identifier", 400, "group_id is invalid");
  return Number(params.groupId);
}

function tokenId(params: TokenParams): number {
  if (!/^[1-9]\d*$/.test(params.tokenId)) throw new AdminError("invalid_identifier", 400, "token_id is invalid");
  const parsed = Number(params.tokenId);
  if (!Number.isSafeInteger(parsed)) throw new AdminError("invalid_identifier", 400, "token_id is invalid");
  return parsed;
}

function requireTokenAdmin(request: FastifyRequest, reply: FastifyReply, options: AdminRouteOptions, mutation: boolean): AuthRequestContext | null {
  const current = context(request, options.auth);
  if (!current.principal.authenticated) { adminFailure(reply, 401); return null; }
  const permission = mutation ? "tokens:revoke:any" : "tokens:read:any";
  if (!permissionGuard(options.authorization, current.principal, permission)) {
    options.tokens.recordRejected(current.principal.id ?? 0, mutation ? "unknown" : "list", mutation ? "api_token.revoke" : "api_token.list", request.id);
    adminFailure(reply, 403);
    return null;
  }
  if (mutation && current.bearerOnly) {
    options.tokens.recordRejected(current.principal.id ?? 0, "unknown", "api_token.revoke", request.id);
    json(reply, { ok: false, error: "browser session required", code: "admin_browser_session_required" }, 403);
    return null;
  }
  if (mutation && (!current.session || !csrfHeader(request) || !constantTimeEqual(current.session.csrfToken, csrfHeader(request)))) {
    options.tokens.recordRejected(current.principal.id ?? 0, "unknown", "api_token.revoke", request.id);
    json(reply, { ok: false, error: "csrf token missing or invalid", code: "csrf_failed" }, 403);
    return null;
  }
  return current;
}

function requireCatalogAdmin(request: FastifyRequest, reply: FastifyReply, options: AdminRouteOptions, mutation: boolean, target: string, action: string): AuthRequestContext | null {
  const current = context(request, options.auth);
  if (!current.principal.authenticated) { adminFailure(reply, 401); return null; }
  if (!permissionGuard(options.authorization, current.principal, "catalog:metadata:write")) {
    options.catalog.recordRejected(current.principal.id ?? 0, target, action, request.id);
    adminFailure(reply, 403);
    return null;
  }
  if (mutation && current.bearerOnly) {
    options.catalog.recordRejected(current.principal.id ?? 0, target, action, request.id);
    json(reply, { ok: false, error: "browser session required", code: "admin_browser_session_required" }, 403);
    return null;
  }
  if (mutation && (!current.session || !csrfHeader(request) || !constantTimeEqual(current.session.csrfToken, csrfHeader(request)))) {
    options.catalog.recordRejected(current.principal.id ?? 0, target, action, request.id);
    json(reply, { ok: false, error: "csrf token missing or invalid", code: "csrf_failed" }, 403);
    return null;
  }
  return current;
}

function cartridgeId(params: CartridgeParams): string {
  if (typeof params.cartridgeId !== "string" || !params.cartridgeId.trim()) throw new AdminError("invalid_identifier", 400, "cartridge_id is invalid");
  return params.cartridgeId;
}

function requiredVersion(query: JsonObject): string {
  if (typeof query.version !== "string" || !query.version.trim()) throw new AdminError("version_required", 400, "version is required");
  return query.version;
}

function optionalString(query: JsonObject, field: string, maximum = 160): string | undefined {
  if (query[field] === undefined) return undefined;
  if (typeof query[field] !== "string" || query[field].length > maximum) throw new AdminError("invalid_filter", 400, `${field} is invalid`);
  return query[field].trim();
}

export function registerAdminRoutes(app: FastifyInstance, options: AdminRouteOptions): void {
  app.get("/api/admin/cartridges", async (request, reply) => {
    const current = requireCatalogAdmin(request, reply, options, false, "list", "catalog.list");
    if (!current) return reply;
    try {
      const query = queryObject(request);
      assertFields(query, ["page", "limit", "q", "version", "architecture"]);
      const page = positiveQuery(query.page, "page", 1, 100000);
      const limit = positiveQuery(query.limit, "limit", 50, 100);
      const search = optionalString(query, "q", 80);
      const version = optionalString(query, "version", 80);
      const architecture = optionalString(query, "architecture", 32);
      return json(reply, { ok: true, ...options.catalog.list({ page, limit, ...(search === undefined ? {} : { query: search }), ...(version === undefined ? {} : { version }), ...(architecture === undefined ? {} : { architecture }) }) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.get<{ Params: CartridgeParams }>("/api/admin/cartridges/:cartridgeId", async (request, reply) => {
    const id = cartridgeId(request.params);
    const current = requireCatalogAdmin(request, reply, options, false, id, "catalog.detail");
    if (!current) return reply;
    try {
      const query = queryObject(request);
      assertFields(query, ["version"]);
      const version = optionalString(query, "version", 80);
      return json(reply, { ok: true, cartridge: options.catalog.detail(id, version) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.patch<{ Params: CartridgeParams }>("/api/admin/cartridges/:cartridgeId", async (request, reply) => {
    const id = cartridgeId(request.params);
    const current = requireCatalogAdmin(request, reply, options, true, id, "catalog.metadata.update");
    if (!current) return reply;
    try {
      const query = queryObject(request);
      assertFields(query, ["version"]);
      const body = object(request.body);
      let metadata: JsonObject;
      if (Object.hasOwn(body, "metadata")) {
        assertFields(body, ["metadata"]);
        metadata = object(body.metadata);
      } else {
        assertFields(body, ["title", "summary", "description", "tags", "license", "homepage", "repository"]);
        metadata = body;
      }
      return json(reply, { ok: true, cartridge: options.catalog.update({ gameId: id, version: requiredVersion(query), metadata }, mutationContext(current, request)) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.delete<{ Params: CartridgeParams }>("/api/admin/cartridges/:cartridgeId", async (request, reply) => {
    const id = cartridgeId(request.params);
    const current = requireCatalogAdmin(request, reply, options, true, id, "catalog.delete");
    if (!current) return reply;
    try {
      const query = queryObject(request);
      assertFields(query, ["version", "architecture"]);
      const version = requiredVersion(query);
      const architecture = optionalString(query, "architecture", 32);
      return json(reply, { ok: true, ...options.catalog.delete({ gameId: id, version, ...(architecture === undefined ? {} : { architecture }) }, mutationContext(current, request)) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.get("/api/admin/users", async (request, reply) => {
    const current = requireAdmin(request, reply, options, "users:read", false);
    if (!current) return reply;
    try {
      const query = queryObject(request);
      assertFields(query, ["page", "limit", "q", "role", "group_id"]);
      const page = positiveQuery(query.page, "page", 1, 100000);
      const limit = positiveQuery(query.limit, "limit", 50, 100);
      const groupIdValue = query.group_id === undefined ? undefined : positiveQuery(query.group_id, "group_id", 1, Number.MAX_SAFE_INTEGER);
      const search = query.q === undefined ? undefined : typeof query.q === "string" && query.q.length <= 80 ? query.q.trim() : (() => { throw new AdminError("invalid_filter", 400, "q is invalid"); })();
      const role = query.role === undefined ? undefined : typeof query.role === "string" ? query.role : (() => { throw new AdminError("invalid_filter", 400, "role is invalid"); })();
      return json(reply, { ok: true, ...options.identity.listUsers({ page, limit, ...(search === undefined ? {} : { query: search }), ...(role === undefined ? {} : { role }), ...(groupIdValue === undefined ? {} : { groupId: groupIdValue }) }) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.get<{ Params: UserParams }>("/api/admin/users/:userId", async (request, reply) => {
    const current = requireAdmin(request, reply, options, "users:read", false);
    if (!current) return reply;
    try { return json(reply, { ok: true, user: options.identity.getUser(userId(request.params)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.post("/api/admin/users", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "users:create", true);
    if (!current) return reply;
    try {
      const body = object(request.body);
      assertFields(body, ["username", "email", "password", "password_confirm", "role", "group_ids"]);
      if (body.role !== undefined && body.role !== "user" && !permissionGuard(options.authorization, current.principal, "users:roles:manage")) return adminFailure(reply, 403);
      return json(reply, { ok: true, user: options.identity.createUser({ username: body.username as string, email: body.email as string, password: body.password as string, ...(body.password_confirm === undefined ? {} : { passwordConfirm: body.password_confirm as string }), ...(body.role === undefined ? {} : { role: body.role as string }), ...(body.group_ids === undefined ? {} : { groupIds: body.group_ids as number[] }) }, mutationContext(current, request)) }, 201);
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.patch<{ Params: UserParams }>("/api/admin/users/:userId", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "users:update", true);
    if (!current) return reply;
    try {
      const body = object(request.body);
      assertFields(body, ["username", "email", "password", "password_confirm"]);
      return json(reply, { ok: true, user: options.identity.updateUser(userId(request.params), { ...(body.username === undefined ? {} : { username: body.username as string }), ...(body.email === undefined ? {} : { email: body.email as string }), ...(body.password === undefined ? {} : { password: body.password as string }), ...(body.password_confirm === undefined ? {} : { passwordConfirm: body.password_confirm as string }) }, mutationContext(current, request)) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.patch<{ Params: UserParams }>("/api/admin/users/:userId/role", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "users:roles:manage", true);
    if (!current) return reply;
    try { const body = object(request.body); assertFields(body, ["role"]); return json(reply, { ok: true, user: options.identity.setRole(userId(request.params), body.role, mutationContext(current, request)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.patch<{ Params: UserParams }>("/api/admin/users/:userId/state", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "users:update", true);
    if (!current) return reply;
    try {
      const body = object(request.body);
      assertFields(body, ["disabled"]);
      if (!Object.hasOwn(body, "disabled")) throw new AdminError("invalid_account_state", 400, "disabled is required");
      return json(reply, { ok: true, user: options.identity.setDisabled(userId(request.params), body.disabled, mutationContext(current, request)) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.put<{ Params: UserParams }>("/api/admin/users/:userId/groups", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "users:groups:manage", true);
    if (!current) return reply;
    try { const body = object(request.body); assertFields(body, ["group_ids"]); if (!Object.hasOwn(body, "group_ids")) throw new AdminError("invalid_group_ids", 400, "group_ids is required"); return json(reply, { ok: true, user: options.identity.replaceGroups(userId(request.params), body.group_ids, mutationContext(current, request)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.delete<{ Params: UserParams }>("/api/admin/users/:userId", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "users:delete", true);
    if (!current) return reply;
    try { return json(reply, { ok: true, ...options.identity.deleteUser(userId(request.params), mutationContext(current, request)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.get("/api/admin/groups", async (request, reply) => {
    const current = requireAdmin(request, reply, options, "groups:read", false);
    if (!current) return reply;
    try { const query = queryObject(request); assertFields(query, ["limit"]); return json(reply, { ok: true, ...options.identity.listGroups(positiveQuery(query.limit, "limit", 100, 100)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.post("/api/admin/groups", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "groups:manage", true);
    if (!current) return reply;
    try { const body = object(request.body); assertFields(body, ["name"]); return json(reply, { ok: true, group: options.identity.createGroup(body.name, mutationContext(current, request)) }, 201); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.patch<{ Params: GroupParams }>("/api/admin/groups/:groupId", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "groups:manage", true);
    if (!current) return reply;
    try { const body = object(request.body); assertFields(body, ["name"]); return json(reply, { ok: true, group: options.identity.renameGroup(groupId(request.params), body.name, mutationContext(current, request)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.delete<{ Params: GroupParams }>("/api/admin/groups/:groupId", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireAdmin(request, reply, options, "groups:manage", true);
    if (!current) return reply;
    try { return json(reply, { ok: true, ...options.identity.deleteGroup(groupId(request.params), mutationContext(current, request)) }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.get("/api/admin/roles", async (request, reply) => {
    const current = requireAdmin(request, reply, options, "roles:read", false);
    if (!current) return reply;
    try { if (Object.keys(queryObject(request)).length) throw new AdminError("unknown_field", 400, "query contains an unknown field"); return json(reply, { ok: true, roles: options.identity.roles() }); }
    catch (error) { return operationFailure(reply, request, error); }
  });

  app.get("/api/admin/tokens", async (request, reply) => {
    const current = requireTokenAdmin(request, reply, options, false);
    if (!current) return reply;
    try {
      const query = queryObject(request);
      assertFields(query, ["page", "limit", "user_id"]);
      const page = positiveQuery(query.page, "page", 1, 100000);
      const limit = positiveQuery(query.limit, "limit", 50, 100);
      const ownerId = query.user_id === undefined ? undefined : positiveQuery(query.user_id, "user_id", 1, Number.MAX_SAFE_INTEGER);
      return json(reply, { ok: true, ...options.tokens.list({ page, limit, ...(ownerId === undefined ? {} : { ownerId }) }) });
    } catch (error) { return operationFailure(reply, request, error); }
  });

  app.delete<{ Params: TokenParams }>("/api/admin/tokens/:tokenId", async (request, reply) => {
    if (!options.auth.isWriteEnabled()) return json(reply, { ok: false, error: "administrative writes are unavailable", code: "admin_write_unavailable" }, 503);
    const current = requireTokenAdmin(request, reply, options, true);
    if (!current) return reply;
    try {
      return json(reply, { ok: true, ...options.tokens.revoke(tokenId(request.params), mutationContext(current, request)) });
    } catch (error) { return operationFailure(reply, request, error); }
  });
}
