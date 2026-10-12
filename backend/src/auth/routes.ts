import crypto from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { encodePythonJson } from "../compatibility/serialization.js";
import type { BackendConfig } from "../config/env.js";
import { AuthConflictError, type AuthService, AuthValidationError, type AuthRequestContext } from "./service.js";
import { parseCookies, serializeSessionCookie } from "./session.js";
import { principalToJson, type Principal } from "./principal.js";
import type { AuthorizationService } from "../authorization/service.js";
import { permissionGuard } from "../authorization/guards.js";
import { PERMISSIONS } from "../authorization/permissions.js";

const SESSION_COOKIE = "prg32_ts_session";

interface Body {
  readonly [key: string]: unknown;
}

interface TokenParams { readonly token_id: string }

interface AuthRouteOptions {
  readonly config: BackendConfig;
  readonly auth: AuthService;
  readonly authorization: AuthorizationService;
}

function json(reply: FastifyReply, body: unknown, status?: number): FastifyReply {
  if (status !== undefined) reply.code(status);
  return reply.header("content-type", "application/json").send(Buffer.from(`${encodePythonJson(body)}\n`, "utf8"));
}

function body(request: FastifyRequest): Body {
  if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) return request.body as Body;
  if (typeof request.body === "string") {
    return Object.fromEntries(new URLSearchParams(request.body).entries());
  }
  return {};
}

function value(bodyValue: unknown, fallback = ""): string {
  return typeof bodyValue === "string" || typeof bodyValue === "number" || typeof bodyValue === "boolean"
    ? String(bodyValue)
    : fallback;
}

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim() || undefined;
  const legacy = request.headers["x-prg32-token"];
  return typeof legacy === "string" ? legacy.trim() || undefined : undefined;
}

function context(request: FastifyRequest, auth: AuthService): AuthRequestContext {
  const cookies = parseCookies(request.headers.cookie);
  return auth.context(cookies.get(SESSION_COOKIE), bearer(request));
}

function cookie(reply: FastifyReply, config: BackendConfig, value: string, expires = false): void {
  reply.header("set-cookie", serializeSessionCookie({
    name: SESSION_COOKIE,
    secure: config.authCookieSecure,
    sameSite: config.authCookieSameSite,
    maxAgeSeconds: config.authSessionLifetimeSeconds
  }, value, expires));
}

function unavailable(reply: FastifyReply): FastifyReply {
  return json(reply, { ok: false, error: "authentication write isolation is unavailable", code: "auth_unavailable" }, 503);
}

function authFailure(reply: FastifyReply, principal: Principal, message = "login required", status = 401): FastifyReply {
  return json(reply, { ok: false, error: message, user: principalToJson(principal) }, status);
}

function csrfFailure(reply: FastifyReply): FastifyReply {
  return json(reply, { ok: false, error: "csrf token missing or invalid", code: "csrf_failed" }, 403);
}

function csrfHeader(request: FastifyRequest): string {
  const first = request.headers["x-csrftoken"] ?? request.headers["x-csrf-token"];
  return typeof first === "string" ? first.trim() : value(body(request).csrf_token).trim();
}

function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
}

function principalJson(authorization: AuthorizationService, principal: Principal): Record<string, unknown> {
  return {
    ...principalToJson(principal),
    permissions: principal.authenticated
      ? PERMISSIONS.filter((permission) => authorization.hasPermission(principal, permission))
      : []
  };
}

function hasValidCsrf(request: FastifyRequest, authContext: AuthRequestContext): boolean {
  const provided = csrfHeader(request);
  return Boolean(authContext.session?.csrfToken && provided && constantTimeEqual(authContext.session.csrfToken, provided));
}

function ensureWrite(auth: AuthService, reply: FastifyReply): boolean {
  if (auth.isWriteEnabled()) return true;
  unavailable(reply);
  return false;
}

function requireCsrf(request: FastifyRequest, reply: FastifyReply, authContext: AuthRequestContext): boolean {
  if (authContext.bearerOnly) return true;
  if (hasValidCsrf(request, authContext)) return true;
  csrfFailure(reply);
  return false;
}

function clientKey(request: FastifyRequest): string {
  return request.ip || "unknown";
}

class RateLimiter {
  private readonly attempts = new Map<string, { count: number; startedAt: number }>();
  constructor(private readonly max: number, private readonly windowSeconds: number) {}
  allow(key: string, now = Date.now()): boolean {
    const current = this.attempts.get(key);
    if (!current || now - current.startedAt >= this.windowSeconds * 1000) {
      this.attempts.set(key, { count: 1, startedAt: now });
      return true;
    }
    current.count += 1;
    return current.count <= this.max;
  }
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const { auth, config, authorization } = options;
  if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, payload, done) => {
      done(null, payload);
    });
  }
  const limiter = new RateLimiter(config.authRateLimitMax, config.authRateLimitWindowSeconds);

  app.get("/auth/csrf", async (request, reply) => {
    if (!auth.isWriteEnabled()) return unavailable(reply);
    const current = context(request, auth);
    const issued = current.session ? null : auth.issueAnonymousSession();
    const session = current.session ?? issued?.record;
    if (!session) return unavailable(reply);
    if (issued) cookie(reply, config, issued.cookieValue);
    reply.header("cache-control", "no-store");
    return json(reply, { ok: true, csrf_token: session.csrfToken });
  });

  app.get("/auth/login", async (_request, reply) => json(reply, { ok: true, route: "/auth/login", methods: ["GET", "POST"] }));
  app.get("/auth/register", async (_request, reply) => json(reply, { ok: true, route: "/auth/register", methods: ["GET", "POST"] }));

  app.post<{ Body: Body }>("/auth/bootstrap", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!config.authBootstrapToken) return json(reply, { ok: false, error: "bootstrap unavailable" }, 404);
    const provided = request.headers["x-prg32-bootstrap-token"];
    if (typeof provided !== "string" || !constantTimeEqual(config.authBootstrapToken, provided.trim())) return json(reply, { ok: false, error: "invalid bootstrap token" }, 403);
    if (!limiter.allow(`bootstrap:${clientKey(request)}`)) return json(reply, { ok: false, error: "too many requests", code: "rate_limited" }, 429);
    try {
      const principal = auth.bootstrap(body(request));
      const issued = auth.rotateSession(current.session, principal.id ?? 0);
      if (!issued) return unavailable(reply);
      cookie(reply, config, issued.cookieValue);
      return json(reply, { ok: true, user: principalJson(authorization, principal) }, 201);
    } catch (error) {
      return authError(reply, error);
    }
  });

  app.post<{ Body: Body }>("/auth/register", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!requireCsrf(request, reply, current)) return reply;
    if (!limiter.allow(`register:${clientKey(request)}`)) return json(reply, { ok: false, error: "too many requests", code: "rate_limited" }, 429);
    try {
      auth.requestRegistration(value(body(request).email));
      return json(reply, { ok: true, email: value(body(request).email).trim().toLowerCase(), message: "registration email sent" });
    } catch (error) {
      return authError(reply, error);
    }
  });

  app.get("/auth/register/complete", async (_request, reply) => json(reply, {
    ok: true,
    route: "/auth/register/complete",
    methods: ["GET", "POST"]
  }));

  app.post<{ Body: Body }>("/auth/register/complete", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!requireCsrf(request, reply, current)) return reply;
    try {
      const principal = auth.completeRegistration(body(request));
      const issued = auth.rotateSession(current.session, principal.id ?? 0);
      if (!issued) return unavailable(reply);
      cookie(reply, config, issued.cookieValue);
      return json(reply, { ok: true, user: principalJson(authorization, principal) });
    } catch (error) {
      return authError(reply, error);
    }
  });

  app.post<{ Body: Body }>("/auth/login", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!requireCsrf(request, reply, current)) return reply;
    if (!limiter.allow(`login:${clientKey(request)}`)) return json(reply, { ok: false, error: "too many requests", code: "rate_limited" }, 429);
    const principal = auth.login(value(body(request).username), value(body(request).password));
    if (!principal.authenticated || principal.id === null) return authFailure(reply, principal, "invalid username or password");
    const issued = auth.rotateSession(current.session, principal.id);
    if (!issued) return unavailable(reply);
    cookie(reply, config, issued.cookieValue);
    return json(reply, { ok: true, user: principalJson(authorization, principal) });
  });

  app.post("/auth/logout", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!current.principal.authenticated) return authFailure(reply, current.principal);
    if (!requireCsrf(request, reply, current)) return reply;
    auth.sessions?.invalidate(current.session);
    cookie(reply, config, "", true);
    return json(reply, { ok: true });
  });

  const currentUser = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const current = context(request, auth);
    if (!current.principal.authenticated) return authFailure(reply, current.principal);
    return json(reply, { ok: true, user: principalJson(authorization, current.principal) });
  };
  app.get("/auth/me", currentUser);
  app.get("/api/me", currentUser);

  app.get("/auth/tokens", async (request, reply) => {
    const current = context(request, auth);
    if (!current.principal.authenticated || current.principal.id === null) return authFailure(reply, current.principal);
    if (!permissionGuard(authorization, current.principal, "tokens:read:self")) return authFailure(reply, current.principal);
    return json(reply, { ok: true, tokens: auth.listTokens(current.principal.id) });
  });

  app.post<{ Body: Body }>("/auth/tokens", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!current.principal.authenticated || current.principal.id === null) return authFailure(reply, current.principal);
    if (!permissionGuard(authorization, current.principal, "tokens:create:self")) return authFailure(reply, current.principal);
    if (!requireCsrf(request, reply, current)) return reply;
    try {
      return json(reply, auth.createToken(current.principal.id, value(body(request).label, "API token")));
    } catch (error) { return authError(reply, error); }
  });

  app.patch<{ Params: TokenParams; Body: Body }>("/auth/tokens/:token_id", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!current.principal.authenticated || current.principal.id === null) return authFailure(reply, current.principal);
    if (!permissionGuard(authorization, current.principal, "tokens:update:self")) return authFailure(reply, current.principal);
    if (!requireCsrf(request, reply, current)) return reply;
    try {
      const label = value(body(request).label);
      const changed = auth.updateToken(current.principal.id, Number(request.params.token_id), label);
      return changed ? json(reply, { ok: true, id: Number(request.params.token_id), label: label.trim().slice(0, 80) }) : json(reply, { ok: false, error: "token not found" }, 404);
    } catch (error) { return authError(reply, error); }
  });

  app.delete<{ Params: TokenParams }>("/auth/tokens/:token_id", async (request, reply) => {
    if (!ensureWrite(auth, reply)) return reply;
    const current = context(request, auth);
    if (!current.principal.authenticated || current.principal.id === null) return authFailure(reply, current.principal);
    if (!permissionGuard(authorization, current.principal, "tokens:revoke:self")) return authFailure(reply, current.principal);
    if (!requireCsrf(request, reply, current)) return reply;
    return json(reply, { ok: auth.revokeToken(current.principal.id, Number(request.params.token_id)) });
  });

}

function authError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AuthValidationError) return json(reply, { ok: false, error: error.message }, 400);
  if (error instanceof AuthConflictError) return json(reply, { ok: false, error: error.message }, 409);
  return json(reply, { ok: false, error: "authentication operation failed", code: "auth_operation_failed" }, 500);
}
