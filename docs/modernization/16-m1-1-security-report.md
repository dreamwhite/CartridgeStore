# PRG32 Cartridge Store — M1.1 Security Hardening Report

Date: 2026-10-12
Scope: administrator bootstrap, Flask session policy, and CSRF protection only
Status: M1.1 implementation complete; parent M1 remains open

## Outcome

M1.1 closes the authentication bootstrap, browser-session, and CSRF controls
identified in the security audit without changing the public firmware API
shapes, identifiers, SQLite schema, cartridge bytes, or WebSocket protocol.
Flask remains the compatibility authority during the incremental Next.js
migration. No TypeScript backend rewrite, storefront feature, deployment, or
commit was performed.

## Administrator bootstrap

`ensure_default_admin()` no longer creates the known `admin` / `password`
account. A fresh installation remains without an administrator until an
operator supplies `PRG32_BOOTSTRAP_TOKEN` and calls `POST /auth/bootstrap` with
the new username, email, and password. The secret is accepted only in the
`X-PRG32-Bootstrap-Token` header, is never returned, and is not logged.

The endpoint performs an atomic first-run check, creates the administrator in
the existing `editors` group, and records completion in the existing
`store_settings` key/value table. A second attempt returns `409`. Existing
administrator credentials, numeric IDs, roles, and group memberships are not
overwritten. Test-only bootstrap configuration is available only when the app
is created with `TESTING=True`.

Setup instructions are in [`docs/api.md`](../api.md),
[`docs/getting_started.md`](../getting_started.md), and
[`docs/docker.md`](../docker.md). Existing docs that described the known
password were updated.

## Session policy

The application now explicitly configures:

- `HttpOnly=True`;
- `SameSite=Lax` by default, configurable to `Strict` or deliberate
  cross-site `None`;
- permanent sessions with an eight-hour default lifetime;
- refresh-on-request for active sessions;
- `Secure=True` when `PRG32_ENV=production` or
  `PRG32_SESSION_COOKIE_SECURE=1`;
- HTTP-compatible cookies in the local development profile.

Production Compose sets `PRG32_ENV=production` and
`PRG32_SESSION_COOKIE_SECURE=1`. The Traefik edge terminates HTTPS; Flask does
not add a broad `ProxyFix` configuration or blindly trust forwarded headers.
The policy and reverse-proxy boundary are documented in
[`docs/deployment.md`](../deployment.md) and [`docs/docker.md`](../docker.md).
Logout clears the complete session. Existing login, token, role, publishing,
review, and federated-auth workflows retain their route boundaries.

## CSRF policy

CSRF tokens are random, session-bound values. They are available through:

- `GET /auth/csrf` for same-origin clients, with `Cache-Control: no-store`;
- hidden `csrf_token` fields in all server-rendered mutating forms;
- `X-CSRFToken` or `X-CSRF-Token` headers for JSON/form fetches.

Cookie-authenticated state-changing requests reject missing or invalid tokens
with HTTP 403. JSON responses use the stable diagnostic envelope:
`{"ok": false, "error": "csrf token missing or invalid", "code": "csrf_failed"}`.
Valid Bearer/API-token-only requests bypass browser CSRF because they have no
browser session. Existing anonymous firmware metrics ingestion and valid
Bearer clients remain compatible; a browser session using those mutation routes
must still provide a CSRF token.

The Next.js API boundary includes `getCsrfToken()` and `withCsrfToken()` in
`frontend/src/lib/api/client.ts`, so a future frontend mutation can obtain the
token and send it explicitly without embedding Flask business logic.

## Tests added or updated

`tests/test_security_m1_1.py` verifies:

- fresh install does not accept the historical known password;
- valid, invalid, and repeated bootstrap attempts;
- existing-admin migration without credential/ID/role/group replacement;
- Secure, HttpOnly, SameSite, permanent lifetime, expiration, and logout;
- missing, invalid, and valid CSRF for cookie-auth JSON mutations;
- HTML form token rendering;
- Bearer-only compatibility.

Existing API and service tests were updated to model browser mutations with
explicit CSRF and firmware ingestion with isolated anonymous clients. The
contract suite still covers catalog listing/detail, version and architecture
selection, binary downloads, authentication, publishing/review, statistics,
scoreboard, metrics, multiplayer status, and administrative boundaries.

## Verification evidence

The final command results are recorded below after the implementation checks
complete. A check is only marked passed when its command exits successfully.

| Check | Command | Result |
| --- | --- | --- |
| Python syntax | `python3 -m py_compile app.py cartridge_store/*.py` | Passed |
| Backend and API/security tests | `PATH="$PWD/.venv313/bin:$PATH" SECRET_KEY=m1-1-test pytest -q` | 57 passed |
| TypeScript | `npm run typecheck` in `frontend/` | Passed |
| ESLint | `npm run lint` in `frontend/` | Passed |
| Frontend unit tests | `npm run test` in `frontend/` | 2 files, 5 tests passed; existing non-failing Vitest config warning |
| Frontend production build | `FLASK_PROXY_TARGET=http://flask:5080 npm run build` in `frontend/` | Passed |
| Patch whitespace | `git diff --check` | Passed |
| Dev Compose configuration | `PRG32_DEV_SECRET_KEY=m1-1-dev-secret docker compose --profile dev config` | Passed |
| Production Compose configuration | `SECRET_KEY=m1-1-prod docker compose --profile prod config` | Passed |
| Flask production image | `docker build -t prg32-cartridge-store:m1-1-local .` | Passed |
| Next.js production image | `docker build --build-arg FLASK_PROXY_TARGET=http://flask:5080 --build-arg NEXT_PUBLIC_FLASK_WS_URL=wss://api.prg32.dream.test/api/multiplayer -f frontend/Dockerfile -t prg32-cartridge-store-frontend:m1-1-local frontend` | Passed |

## Deviations and remaining risks

- The approved target remains Next.js/TypeScript. This milestone hardens the
  current Flask compatibility boundary because removing Flask or moving auth
  before parity evidence would break the rollback path.
- No database schema migration was introduced. Bootstrap completion uses the
  existing settings key/value table.
- M1.1 intentionally does not address ZIP expansion limits, metrics export
  authorization, backup secret handling, rate limiting, security headers, or
  the frontend storefront. Those remain M1.2 or later work.
- `PRG32_BOOTSTRAP_TOKEN` is an operator secret, not a password replacement
  for ongoing login. Operators must keep it out of logs, source control,
  browser URLs, and CI output.
- `SameSite=Lax` is the safe default. An installation using a deliberate
  cross-site authentication POST must explicitly configure `SameSite=None` and
  Secure cookies after reviewing its proxy and identity-provider boundary.

## Next milestone

M1.2 should address the remaining accepted security-audit items—especially
metrics export authorization, backup/restore secret handling, ZIP expansion
limits, rate limiting, and explicit security headers—without broadening into
the storefront or TypeScript backend rewrite. After M1 security acceptance,
the next migration slice should be a read-only Next.js catalog/discovery parity
implementation with fixture comparison and a Flask rollback path.
