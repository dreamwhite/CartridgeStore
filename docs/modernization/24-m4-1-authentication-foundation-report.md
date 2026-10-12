# M4.1 — TypeScript Authentication Foundation

**Date:** 2026-10-12
**Status:** implemented and locally verified; not a production cutover

## Scope and decision

M4.1 adds isolated local authentication and authorization primitives to the
Fastify/TypeScript backend. Flask remains the operational authentication and
database writer. The TypeScript backend does not receive public Traefik routes
and does not write the configured shadow or production SQLite database.

Authentication writes are fail-closed unless all of these settings are
explicitly supplied:

```text
PRG32_BACKEND_AUTH_WRITE_ENABLED=true
PRG32_BACKEND_AUTH_WRITE_MODE=test
PRG32_BACKEND_AUTH_WRITE_DB=/absolute/path/to/disposable/auth.sqlite
PRG32_BACKEND_SESSION_SECRET=<local-only-secret>
```

The auth database must already exist, contain the compatible Flask tables, and
be different from `PRG32_BACKEND_DB`. No schema migration or automatic table
creation is performed.

## Implemented routes and services

The isolated backend now contains:

| Area | Implementation |
| --- | --- |
| Local login | `POST /auth/login`, username or email lookup, Werkzeug password verification, session rotation |
| Logout | `POST /auth/logout`, session invalidation and cookie clearing |
| Current principal | `GET /auth/me` and `GET /api/me` |
| CSRF | `GET /auth/csrf`, no-store response, session-bound token |
| Bootstrap | `POST /auth/bootstrap`, one-time admin creation in `BEGIN IMMEDIATE` transaction |
| Registration | `POST /auth/register` and `POST /auth/register/complete`, existing validation and registration-token hashing |
| API tokens | list, create, rename, and revoke routes using existing SHA-256 token hashes |
| Authorization | typed principal, role hierarchy, group checks, bearer/session distinction |
| Rate limiting | process-local login, registration, and bootstrap limiter; default 5 attempts per 60 seconds |
| Passwords | Werkzeug `scrypt`, `pbkdf2:sha256`, and `pbkdf2:sha1` verification; unsupported formats fail closed |

The GET login/register endpoints return a JSON route descriptor because this
milestone intentionally does not add frontend UI or HTML rendering to Fastify.
OIDC, SAML, LDAP, publishing, scores, metrics, and WebSocket routes remain
outside M4.1.

## Compatibility matrix

| Flask behavior | TypeScript foundation | Evidence |
| --- | --- | --- |
| User IDs and usernames come from `users` | Preserved; no remapping or second user store | Auth fixture and `/auth/me` tests |
| Roles `reader`, `user`, `player`, `publisher`, `admin` | Same values and ordered hierarchy | `principal.ts` and authorization tests |
| `editors` group controls editor access | Group membership is read from `user_groups` | Group authorization test |
| Werkzeug password hashes | Verified with existing scrypt fixture; PBKDF2 support remains in verifier | M2.1 compatibility tests plus M4.1 tests |
| API token lookup | SHA-256 hash lookup against `api_tokens.token_hash` | Existing token fixture and bearer tests |
| Token ownership and revocation | User-scoped create, rename, and delete | Token lifecycle test |
| Bootstrap | No implicit admin; atomic one-time transaction | Concurrent bootstrap test: one `201`, one `409` |
| Anonymous firmware bearer path | Bearer-only requests bypass browser CSRF | Bearer token mutation test |
| Cookie session | Deliberately not Flask-compatible | Separate `prg32_ts_session` cookie |

## Session and cookie policy

TypeScript sessions use an opaque random session identifier with an HMAC-SHA256
integrity signature. Session records are held in the backend process and are
not serialized using Flask's cookie format. The cookie is:

- `HttpOnly`;
- `Secure` when `PRG32_BACKEND_SESSION_SECURE=true` or `NODE_ENV=production`;
- `SameSite=Lax` by default, configurable to `Strict` or `None`;
- configurable lifetime, default eight hours;
- named `prg32_ts_session`, distinct from Flask's `session` cookie.

Authentication rotates the session identifier. Logout deletes the server-side
record and clears the cookie. Because this foundation intentionally avoids a
schema migration, sessions are process-local: a restart invalidates all
sessions, and multiple backend instances do not share session state. A
distributed session store is a cutover prerequisite.

## CSRF policy

Cookie-authenticated mutations require `X-CSRFToken` or `X-CSRF-Token` matching
the token returned by `/auth/csrf`. Missing or mismatched tokens return:

```json
{"ok": false, "error": "csrf token missing or invalid", "code": "csrf_failed"}
```

Bearer-only requests with a valid `Authorization: Bearer ...` header do not
require browser CSRF. A request containing an invalid bearer token is not
treated as authenticated and does not bypass CSRF.

## Write-isolation guarantees

The normal Fastify configuration opens `PRG32_BACKEND_DB` with SQLite
read-only flags. Authentication routes that need writes return a stable
`auth_unavailable` response when the explicit test writer is not configured.
When enabled, the writer:

1. requires `PRG32_BACKEND_AUTH_WRITE_MODE=test`;
2. requires a separate existing SQLite file;
3. checks the required auth tables before serving requests;
4. never creates or migrates tables;
5. is used only by the isolated auth fixture in M4.1 tests.

Raw passwords, bearer tokens, bootstrap secrets, and session secrets are not
logged. Unexpected auth failures return a stable envelope while diagnostics
remain in Fastify's server-side logger.

## Files changed

- `backend/src/config/env.ts` — fail-closed auth/write-isolation settings.
- `backend/src/db/readonly.ts` — explicit disposable auth writer opening.
- `backend/src/auth/principal.ts` — principals, roles, groups, and guards.
- `backend/src/auth/session.ts` — signed opaque sessions and cookie helpers.
- `backend/src/auth/service.ts` — local auth, bootstrap, registration, and token lifecycle.
- `backend/src/auth/routes.ts` — isolated Fastify auth routes and CSRF/rate limits.
- `backend/src/auth/password.ts` — safe unsupported-hash handling.
- `backend/src/app.ts` — auth module registration and shutdown handling.
- `backend/tests/auth.test.ts` — M4.1 compatibility and security tests.

No Flask routes, Next.js proxy routes, Traefik ownership, SQLite schema, public
API route, cartridge data, or production database was modified.

## Verification

| Command | Result |
| --- | --- |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm run test` in `backend/` | PASS — 6 files, 24 tests |
| `pnpm run build` in `backend/` | PASS |
| `./.venv313/bin/python -m pytest -q` | 1 pre-existing environment failure without `SECRET_KEY` |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 63 tests |
| Frontend Node 24 typecheck/lint/tests/build | PASS; build supplied `FLASK_PROXY_TARGET` |
| `docker compose --profile dev config` | PASS |
| `docker compose --profile backend config` | PASS |
| `SECRET_KEY=compose-prod-check docker compose --profile prod config` | PASS |
| `git diff --check` | PASS |

The unqualified Flask pytest run fails only because one existing mDNS test
constructs a non-testing Flask app without setting `SECRET_KEY`; the existing
application guard rejects that setup. No application behavior was weakened to
hide the failure.

## Remaining risks and dependencies

- Sessions are process-local and require a shared session store before scaling.
- The rate limiter is process-local and is not a replacement for a trusted edge
  limiter.
- OIDC, SAML, and LDAP behavior is not migrated or cut over. Provider callback
  and external-cookie tests remain required.
- Password hash generation is compatible with the current local Flask format,
  but password rehash/upgrade policy is deferred.
- Auth writes are intentionally unusable against the operational database.
- No Fastify business-route authorization integration was attempted for scores,
  metrics, publishing, review, or administration.

## Follow-up status

M4.2 is retired. OIDC and SAML are explicitly excluded from the TypeScript
target; the existing Flask adapters remain untouched and Flask-only during the
transition. M4.3 is the independent authentication security and compatibility
audit. Operational database writes remain disabled until the cutover gate is
explicitly authorized.
