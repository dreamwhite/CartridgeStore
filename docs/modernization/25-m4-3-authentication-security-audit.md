# M4.3 — Authentication Security and Compatibility Audit

**Date:** 2026-10-12
**Status:** audited; M4.1 remains isolated and is not approved for public
cutover

## 1. Executive decision

The M4.1 TypeScript authentication foundation is a reasonable isolated local
authentication baseline, and its default deployment mode is fail-closed:
authentication writes are disabled, Flask remains the operational writer, and
the TypeScript service has no public Traefik route. The audit does not approve
M5 or an operational write cutover.

The principal blocker is database-write isolation. The writer rejects the same
configured path textually, but accepts a symlink or hardlink that resolves to
the operational SQLite inode. A disposable runtime check demonstrated both
cases. This must be fixed and regression-tested before any TypeScript process
can be granted operational write authority.

OIDC and SAML are explicitly removed from the TypeScript target. Their Flask
adapters were not changed. M4.2 is retired; this audit does not implement a
replacement provider flow.

## 2. Scope and inspected material

Inspected the required modernization documents 13, 16, 17, 18, and 19; the
M4.1 report (24); actual TypeScript source and tests; Flask auth and database
code; the Next.js application; `backend/Dockerfile`; and the single
`docker-compose.yml` with its profiles and Traefik labels.

The audit covers the M4.1 implementation only. It does not change Flask
behavior, public route ownership, the SQLite schema, deployment, or production
data.

## 3. Findings summary

| Area | Result | Finding |
| --- | --- | --- |
| Sessions and cookies | PASS with warnings | Opaque signed server-side sessions, rotation, expiry, logout invalidation, and secure cookie flags are implemented. Storage is process-local and the secret has no minimum-strength validation. |
| CSRF | PASS with warning | Session-bound synchronizer token and bearer-only distinction work. Token comparison is not timing-safe and Origin/Referer checks are absent as defense-in-depth. |
| Passwords | PASS | Werkzeug scrypt and PBKDF2 verification is covered by M2.1 fixtures; malformed/unsupported hashes fail closed. Unknown-user timing uniformity is not established. |
| API tokens | PASS | 256-bit random tokens, SHA-256 lookup, one-time plaintext return, no token logging, and owner-scoped list/create/rename/revoke are present. |
| Authorization matrix | CONDITIONAL | Role and group primitives are correct, but migrated business routes do not yet exist, so route-by-route parity is not proven. |
| Bootstrap and registration | PASS with warnings | Atomic one-time bootstrap and token lifecycle are implemented. Bootstrap secret comparison is not constant-time and the configured secret has no strength policy. |
| DB write isolation | **BLOCKER for M5** | Textual path comparison does not protect against symlink or hardlink aliases to the operational database. |
| HTTP compatibility | CONDITIONAL | Local-auth JSON routes and form parsing are covered; legacy configured-user auth, Flask HTML redirects, and some route aliases are not yet TypeScript parity. |
| Error leakage | PASS | Unexpected exceptions use stable generic envelopes; raw exception strings and configured paths are not returned. |
| Rate limiting | WARNING | Process-local IP limiter is bounded but not shared across workers/replicas and has no account/global dimension. |

## 4. Session, cookie, and CSRF audit

### 4.1 Sessions and cookies — PASS with warnings

`backend/src/auth/session.ts` uses a 32-byte random opaque identifier and a
HMAC-SHA256 signature. The session record, including its CSRF token, is held
server-side. The cookie contains no user ID, role, email, password, or token.
Signature verification uses `timingSafeEqual`, rejects malformed values, and
expired records are deleted.

Login, registration completion, bootstrap, and logout rotate or invalidate the
session as appropriate. The cookie is `HttpOnly`, host-only, `Path=/`,
`SameSite=Lax` by default, and `Secure` in production unless explicitly
configured otherwise. There is no `Domain` attribute. Cookie clearing uses
`Max-Age=0`.

Warnings:

- sessions are process-local and disappear on restart; multiple backend
  instances do not share them;
- the configured HMAC secret is required but no minimum length or entropy
  policy is enforced;
- no browser/Traefik end-to-end cookie evidence exists yet.

These are cutover prerequisites, not current exposure in the default Compose
profiles because auth writes are disabled and the backend is not publicly
routed.

### 4.2 CSRF — PASS with warning

`GET /auth/csrf` creates an anonymous session and returns a no-store,
session-bound token. Cookie-authenticated mutations require
`X-CSRFToken`, `X-CSRF-Token`, or the compatible form field. A valid bearer
request without a valid session is treated as bearer-only and may skip browser
CSRF; an invalid bearer does not bypass CSRF. When both a session and bearer
are present, the session path remains authoritative and CSRF is required.

The implementation compares CSRF strings with `===`, not a constant-time
comparison. This is a low-severity timing-hardening gap that must be addressed
before public exposure. Origin/Referer validation is not implemented; the
synchronizer token remains the primary control.

## 5. Password and token audit

`backend/src/auth/password.ts` verifies the Flask-compatible `scrypt`,
`pbkdf2:sha256`, and `pbkdf2:sha1` formats. Derived digests are compared with
`timingSafeEqual`; malformed and unsupported formats return a safe unsupported
result. M2.1 compatibility fixtures provide the PBKDF2 evidence and M4.1
tests provide the scrypt and unknown-format evidence. New passwords use the
existing Werkzeug-compatible scrypt representation and a 10-character minimum.

No password, raw bearer token, bootstrap token, or session secret is logged.
The login path returns the same public invalid-credential response for a
missing/invalid password hash. A dedicated user-enumeration timing analysis is
not present, and password rehash/upgrade policy remains deferred.

API tokens use 32 random bytes with a `prg32_` prefix. Only a SHA-256 digest is
stored and token plaintext is returned only at creation. Listing omits
plaintext. The owner ID is included in every list, update, and delete query.
An isolated regression test now proves that a bearer owner cannot list,
rename, or revoke another user's token.

## 6. Authorization matrix

The TypeScript principal model preserves `reader`, `user`, `player`,
`publisher`, and `admin` values and the existing ordered hierarchy. The
`editors` group is loaded from `user_groups`, and the role/group guard helpers
fail for anonymous principals.

The following is the current M4.1 boundary:

| Operation | Current TypeScript status | Decision |
| --- | --- | --- |
| `/auth/me`, `/api/me` | Implemented | Authenticated session or bearer only |
| Login, logout, registration, bootstrap | Implemented in isolated writer | CSRF/session rules apply; bootstrap uses its explicit header |
| Token list/create/rename/revoke | Implemented | Authenticated owner scope; bearer-only mutations may skip CSRF |
| Catalog, publish, review, scores, metrics, admin, multiplayer | Not migrated | Flask remains route owner and writer; no TypeScript parity claim |
| OIDC/SAML | Removed from TypeScript scope | Flask adapters remain untouched and Flask-only |

Therefore role helpers are not evidence of complete authorization parity. M5
must define and test an explicit guard for every migrated business route before
that route is exposed.

## 7. Bootstrap and registration

Bootstrap requires the configured `X-PRG32-Bootstrap-Token`, validates account
input, uses `BEGIN IMMEDIATE`, checks both an admin row and the completion
marker, creates the admin/editor relationship, and commits the marker in the
same transaction. The concurrent test produced exactly one `201` and one
`409`. There is no implicit known-password fallback.

Registration checks the existing setting, normalizes email, invalidates prior
unused email tokens, stores only a SHA-256 token hash, and expires links after
24 hours. Completion validates the token and password, creates a normal user,
and marks the token used in one transaction. Duplicate account behavior is
predictable.

The bootstrap header is compared with ordinary string equality, and bootstrap
secret strength is not validated. These are hardening requirements before a
public bootstrap endpoint exists. The TypeScript foundation does not send
email; it preserves the current isolated fixture-oriented record flow.

## 8. Critical database-write isolation audit

The positive controls are useful:

1. auth writes default to disabled;
2. enabling writes requires `AUTH_WRITE_MODE=test`, an explicit path, and an
   explicit session secret;
3. the writer requires an existing regular file and required auth tables;
4. the normal backend database is opened with SQLite read-only flags;
5. the Compose backend mounts its fixture directory read-only and does not set
   auth-write environment variables.

The isolation check is not sufficient. `config/env.ts` compares
`path.resolve(authWritePath)` and `path.resolve(databasePath)`, while
`db/readonly.ts` uses `fs.statSync` and opens the supplied path directly.
Filesystem aliases are therefore not compared by canonical identity.

Disposable runtime evidence, using a synthetic schema in a temporary directory:

```text
symlink: opened=true
hardlink: opened=true
sqlite-uri: opened=false (configured auth write database is unavailable)
```

The symlink and hardlink both targeted the operational SQLite file. This is a
**BLOCKER for M5 and final cutover**. Required remediation is to establish
canonical/inode-level separation (including symlink and hardlink handling),
enforce approved mount/provenance boundaries, and add regression tests. Do not
enable the writer against an operational or mounted Flask database until that
gate passes. No application fix was applied in this audit.

## 9. HTTP compatibility and error behavior

Implemented compatibility evidence includes username/email login lookup,
Werkzeug hashes, SHA-256 token hashes, roles/groups, bearer authentication,
JSON responses, and URL-encoded form parsing. `prg32_ts_session` is deliberately
not Flask-cookie compatible; controlled re-login is the approved direction.

Known compatibility boundaries:

- the TypeScript GET login/register endpoints return JSON route descriptors,
  not Flask HTML forms or redirects;
- the TypeScript implementation does not wire the legacy `PRG32_USERS`
  configured-user fallback;
- TypeScript exposes PATCH/DELETE token routes but not every historical Flask
  form/alias endpoint;
- business API, export, admin, and WebSocket route parity is not yet claimed;
- Flask OIDC/SAML users and provider configuration remain Flask-only.

Unexpected authentication failures return stable `auth_operation_failed` or
`auth_unavailable` envelopes. Validation/conflict messages are intentional
stable application messages; raw exception text, stack traces, filesystem
paths, and secrets are not sent to clients.

## 10. Rate limiting

Login, registration, and bootstrap attempts use an in-memory limiter keyed by
Fastify's request IP, with defaults of five attempts per 60 seconds. The
limiter does not trust an arbitrary `X-Forwarded-For` header in the current
configuration. It resets on restart and is not shared across workers or
replicas; it has no account/global or credential-specific budget.

This is acceptable only as a local containment measure. A trusted Traefik or
shared limiter, proxy identity policy, and explicit firmware exception policy
are required before public exposure.

## 11. Verification evidence

Executed from the repository workspace:

| Command | Result |
| --- | --- |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm run test` in `backend/` | PASS — 6 files, 25 tests after the owner-scope regression test |
| `pnpm run build` in `backend/` | PASS |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 63 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| Frontend Node 24 typecheck | PASS |
| Frontend Node 24 ESLint | PASS |
| Frontend Vitest | PASS — 2 files, 5 tests |
| Frontend production build with Flask proxy/WebSocket environment | PASS |
| `git diff --check` | PASS |
| `docker compose --profile dev config` | PASS |
| `docker compose --profile backend config` | PASS |
| `SECRET_KEY=compose-prod-check docker compose --profile prod config` | PASS |
| `docker compose --profile backend build backend` | PASS — Node 24 multistage image |

The frontend test run emits Vite's existing config-loader warning; it does not
fail the test. An unqualified Flask pytest invocation without `SECRET_KEY`
still has one existing mDNS setup failure; the required secret-injected run is
green. No application behavior was changed to hide that environment issue.

## 12. Files changed by this audit

- `backend/tests/auth.test.ts` — isolated owner-scope token regression test;
- `docs/modernization/19-revised-migration-roadmap.md` — M4.2 retirement and
  OIDC/SAML scope decision;
- `docs/modernization/24-m4-1-authentication-foundation-report.md` — follow-up
  status corrected to reference retired M4.2;
- `docs/modernization/25-m4-3-authentication-security-audit.md` — this report.

No production source, Flask route, schema, deployment route, Docker profile,
or production data was modified by M4.3.

## 13. M5 entry gate and recommendation

M5 must not begin public or operational writes until all of the following are
true:

1. DB isolation rejects canonical, symlink, hardlink, URI, mount, and other
   operational-file aliases with tests;
2. session storage, secret-strength policy, CSRF comparison, bootstrap-secret
   handling, and rate limiting have approved cutover designs;
3. every migrated route has an explicit role/group/ownership matrix and
   compatibility fixture;
4. legacy `PRG32_USERS` and historical token endpoint compatibility is either
   implemented or explicitly retired with owner approval;
5. browser/Traefik cookie, CSRF, forwarded-scheme, and WebSocket checks pass;
6. rollback keeps Flask as the sole writer until reconciliation and backup
   evidence is available.

The next milestone should be a focused remediation gate for write isolation and
auth hardening, followed by route-level authorization tests. Do not start
publishing writes, provider migration, dual writes, or M4.2 work as part of
this audit.
