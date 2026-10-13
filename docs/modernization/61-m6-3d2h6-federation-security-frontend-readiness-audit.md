# PRG32 Cartridge Store — M6.3d.2h.6 Federation Security Audit & Frontend Integration Readiness

Status: **audit complete; frontend authentication work may proceed in an isolated
next milestone; production federation remains NO-GO**.

This document audits the Fastify/TypeScript federation foundation and its Next.js
integration boundary. It does not implement authentication UI, provider
administration, production routes, database migrations, or deployment changes.

## 1. Executive summary

The current implementation has a coherent protocol-neutral boundary for local
authentication, OIDC, SAML, identity linking, sessions, CSRF, RBAC, encrypted
provider secrets, durable transactions, replay checks, provider generations, and
test-only lifecycle operations.

The frontend is ready to begin an isolated authentication integration, subject to
adding a dedicated API target/rewrite and UI-specific tests. It is not yet an
authentication-enabled product: the Next app currently has no login page, auth
provider selector, session hook, protected-route middleware, or logout UI.

Production federation is not ready. Federation services are constructed only
when the isolated auth writer is enabled, and configuration currently requires
that writer to run in `test` mode with a disposable database/root. Provider
administration is also not exposed through a production RBAC route. Real IdP
certificate/key rollover and the browser lifecycle matrix remain unverified.

## 2. Scope and method

Reviewed the implementation and documentation for M6.3d.2h.1 through
M6.3d.2h.5b, especially:

- `docs/modernization/19-revised-migration-roadmap.md`
- `docs/modernization/54-m6-3d2h1-federated-authentication-identity-mapping-audit.md`
- `docs/modernization/55-m6-3d2h2-federated-identity-foundation-security-prerequisites-report.md`
- `docs/modernization/56-m6-3d2h3-openid-connect-protocol-implementation-report.md`
- `docs/modernization/57-m6-3d2h4-saml2-service-provider-implementation-report.md`
- `docs/modernization/58-m6-3d2h5-authentik-oidc-saml-end-to-end-validation-report.md`
- `docs/modernization/59-m6-3d2h5a-playwright-connectivity-recovery-e2e-report.md`
- `docs/modernization/60-m6-3d2h5b-federation-certificate-lifecycle-provider-operations-report.md`

Also inspected the actual TypeScript source, tests, Next.js source, Compose
profiles, and the disposable Authentik harness. The sibling `../PRG32` repository
was not modified.

The full browser lifecycle matrix was intentionally not rerun, per the explicit
request to skip that slow verification. The prior 5a result is historical
evidence only. This audit does not claim real Authentik key/certificate rotation
was verified.

## 3. Repository state and change boundary

The worktree already contained changes from the previous milestones. This audit
added only this report and the corresponding roadmap entry. No application source,
test, Compose, database, production data, credential, or deployment file was
changed for M6.3d.2h.6.

The existing dirty worktree was preserved; it was not reset or cleaned. The
untracked `docs/quickstart-qemu.md` and `run-qemu` under `../PRG32` were observed
as pre-existing sibling-repository files and were left untouched.

## 4. Architecture inventory

The relevant runtime boundary is:

```text
Next.js browser app
        │ same-origin fetch/rewrites
        ├── transitional Flask/Jinja/API routes
        └── isolated Fastify TypeScript API (writer/test boundary)
                    ├── local auth/session service
                    ├── OIDC adapter
                    ├── SAML SP adapter
                    ├── federation provider/transaction stores
                    ├── exact external-identity links
                    └── centralized authorization service
```

Actual construction is in `backend/src/app.ts`, `buildApp`. The federation
services are created only when `auth.isWriteEnabled()` and an auth session secret
are present. Test lifecycle routes are registered only when
`options.config.authWriteMode === "test"`.

The frontend foundation is in:

- `frontend/src/app/layout.tsx` — root layout and shared providers;
- `frontend/src/app/providers.tsx` — TanStack Query and theme provider;
- `frontend/src/lib/api/client.ts` — same-origin fetch, credentials, error and
  response validation helpers;
- `frontend/src/lib/api/admin.ts` — isolated admin proxy client and CSRF helper;
- `frontend/next.config.ts` — Flask rewrites and development/test-only
  `__admin-fastify` rewrite.

## 5. Local authentication audit

### Verified controls

- Password verification is implemented in `backend/src/auth/password.ts` by
  `verifyWerkzeugPasswordHash`. It supports the compatibility formats
  `scrypt`, `pbkdf2:sha256`, and `pbkdf2:sha1`, bounds PBKDF2 iterations, and uses
  `crypto.timingSafeEqual` for the final digest comparison.
- `backend/src/auth/service.ts`, `login`, accepts username or normalized email,
  rejects missing/disabled/invalid credentials without exposing which condition
  failed, and updates login state only after successful authentication.
- `backend/src/auth/routes.ts`, `POST /auth/login`, requires a writable isolated
  backend, CSRF for cookie context, an IP-keyed bounded rate limit, and rotates
  the session on success.
- Account disablement is enforced by `isAccountEnabled` and account-state checks
  in `backend/src/auth/account-state.ts` and `backend/src/auth/service.ts`.
- Password/role/group/delete state changes use revocation boundaries and/or
  immediate session/token invalidation through `invalidateAccountAccess`.
- API tokens are stored and looked up by SHA-256 hash in
  `backend/src/auth/tokens.ts`; disabled users do not authenticate with them.
- Bootstrap uses a separately configured header token with a constant-time
  comparison, one-time database semantics, and a rate limit.
- Login and registration errors are stable application errors. Unexpected errors
  use the stable `auth_operation_failed` envelope.

### Session behavior

`backend/src/auth/session.ts`, `SessionStore`, issues 32 random-byte session IDs,
stores an HMAC-derived identifier in SQLite, encrypts the CSRF token with
AES-256-GCM under an HKDF-derived key, expires records, and rotates old sessions
inside a SQLite transaction. The signed cookie value is `v1.<id>.<hmac>`.

Session creation, rotation, and logout are wired in `backend/src/auth/routes.ts`.
The default lifetime is eight hours (`PRG32_BACKEND_SESSION_LIFETIME_SECONDS`).
Logout invalidates the current record and sends an expired cookie. Local login,
bootstrap, registration completion, OIDC success, and SAML success all use
session rotation.

### Remaining local-auth limitation

There is no recent-password/re-authentication timestamp in
`AdminMutationContext` (`backend/src/admin/service.ts`) and no re-authentication
gate in `requireAdmin`, `requireTokenAdmin`, or `requireCatalogAdmin`
(`backend/src/admin/routes.ts`). CSRF and session authentication are present, but
an attacker holding a valid administrator browser session can attempt admin
mutations until that session expires or is revoked.

## 6. OIDC audit

`backend/src/oidc/service.ts` uses a generic discovery/client boundary and does
not contain Authentik-specific protocol assumptions. Provider-specific data is
loaded through `FederationProviderService`.

### Verified controls

- Authorization-code flow with state, nonce, and PKCE S256 generated per durable
  transaction (`start`).
- Discovery and endpoint binding are bounded and require the discovered issuer and
  endpoints to remain on the configured issuer origin. Production provider URLs
  require HTTPS; HTTP is allowed only by the test configuration path.
- Client secrets are retrieved by exact provider-scoped secret reference through
  `SecretStore`; they are not returned by public provider listing or status.
- Callback browser correlation is signed with the backend session secret and
  bound to transaction ID and a request-specific browser binding.
- Durable transaction consumption binds protocol, provider, state, request ID,
  callback binding, provider generation, expiry, and single-use consumption.
- ID-token verification checks issuer, audience, `azp` where applicable, nonce,
  signature, and temporal claims. JWKS retrieval is bounded; the current code
  creates a local JWKS set from the bounded response for verification rather than
  claiming a long-lived remote-key cache.
- The callback uses a safe local return path and never accepts an arbitrary
  external redirect target.
- Unknown, disabled, retired, stale-generation, expired, and replayed flows are
  rejected with stable errors; raw provider/exception details are logged server
  side rather than returned.
- A successful callback resolves an exact external identity and rotates the local
  session.

### Provider-neutrality result

The implementation depends on standard OIDC discovery, authorization-code,
PKCE, ID-token, JWKS, issuer, subject, and optional standard profile claims. It
does not require Authentik endpoints, claim names, or an Authentik management API.

## 7. SAML audit

`backend/src/saml/service.ts` implements a deliberately narrow generic SP flow.

### Verified controls

- SP-initiated HTTP-Redirect AuthnRequest and HTTP-POST ACS are implemented.
- `GET /api/auth/saml/:providerId/metadata` exposes generated SP metadata.
- Response size, RelayState, XML envelope identifiers, and form fields are
  bounded.
- The configured trusted certificate set is used; embedded incoming certificates
  are not trusted. Certificate validity is checked and the lifecycle code supports
  bounded A+B overlap.
- Issuer, audience, destination, recipient, `InResponseTo`, temporal conditions,
  response/assertion signature policy, and persistent NameID are checked.
- The browser correlation cookie is signed and bound to a durable transaction.
  RelayState and transaction state are checked before final durable consumption.
- Replayed response/request/assertion identifiers and consumed transactions are
  rejected. Successful identity resolution rotates the local session.
- IdP-initiated SSO, SLO, Artifact/SOAP bindings, and optional encrypted
  assertions are not silently enabled; they remain outside this narrow scope.

### Concurrency note

Node-SAML exposes a cache `get/remove` interface rather than an atomic consume
hook. The adapter performs final durable SQLite consumption after library
validation. This is bounded and covered by protocol tests, but concurrent
duplicate-response confidence still needs an explicit adversarial concurrency
test before production federation approval.

## 8. Identity binding and RBAC

`backend/src/federation/identity.ts` defines the identity boundary as:

```text
protocol + provider_id + issuer + subject
```

Email, display name, username, and group claims do not auto-link accounts and do
not auto-create local users. An unknown external identity requires an explicit
link operation. Disabled local users and retired identity links are rejected.

`backend/src/authorization/permissions.ts`, `guards.ts`, `policies.ts`, and
`service.ts` provide centralized permission evaluation. Federation group claims
do not escalate local roles. Existing admin endpoints use permission guards and
record administrative actions in the bounded audit log.

Account disablement immediately invalidates sessions and tokens. Provider
disablement, security-setting changes, generation changes, and secret rotation
invalidate pending federation transactions.

The break-glass/bootstrap path is intentionally separate from normal federation
and requires a configured one-time header token. No federation callback bypasses
the exact identity link or local account-state checks.

## 9. Session, cookie, and CSRF matrix

| Artifact | Creation/use | Attributes and lifetime | Security purpose |
|---|---|---|---|
| `prg32_ts_session` | `/auth/csrf`, local login/registration/bootstrap, successful OIDC/SAML | `Path=/`, `HttpOnly`, host-only; `Secure` from `PRG32_BACKEND_SESSION_SECURE`; `SameSite` from `PRG32_BACKEND_SESSION_SAMESITE` (default `lax`); Max-Age from session lifetime (default 8h) | Signed, durable local session |
| `prg32_oidc_correlation` | OIDC login start/callback | `Path=/`, `HttpOnly`, `SameSite=Lax`, Max-Age 300s, `Secure` when configured | Binds browser to OIDC transaction; cleared on success/error |
| `prg32_saml_correlation` | SAML login start/ACS | `Path=/`, `HttpOnly`, `SameSite=None`, unconditional `Secure`, Max-Age 300s | Allows cross-site IdP POST correlation; cleared on success/error |
| CSRF token | Returned by `/auth/csrf`; stored encrypted in session; sent as `X-CSRFToken` or `X-CSRF-Token` | Not a separate cookie; session lifetime | Double-submit-style browser mutation protection |

Bearer headers (`Authorization: Bearer` and legacy `x-prg32-token`) are accepted
for API authentication. Administrative mutations reject bearer-only context and
require a browser session plus CSRF. This prevents an API token from being used
as a browser admin mutation credential.

The same-origin Next rewrite is the preferred integration mode. Direct browser
cross-origin calls would require deliberate cookie `SameSite=None; Secure`, CORS,
origin, and proxy policy and should not be introduced casually.

## 10. CSRF audit

Cookie-authenticated state changes in `backend/src/auth/routes.ts` and
`backend/src/admin/routes.ts` compare the supplied CSRF token with the encrypted
session token using a constant-time comparison. The frontend admin client obtains
the token once from `/__admin-fastify/auth/csrf` and sends `X-CSRFToken`.

Bearer-only API operations are treated separately. The current frontend client
uses `credentials: "same-origin"`, which is compatible with a same-origin Next
rewrite and avoids a new cross-origin credential surface.

## 11. Test-only route isolation

The relevant files are:

- `backend/src/federation/lifecycle-test-routes.ts`;
- `backend/src/authentik-writer-init.ts`;
- `backend/src/config/env.ts`;
- `backend/src/app.ts`;
- the `writer`, `writer-init`, and `authentik-e2e` profiles in the single
  root `docker-compose.yml`.

The lifecycle routes require a dedicated header token and are only registered
inside the federation writer branch when `authWriteMode` is `test`. Configuration
rejects enabled auth writes unless the auth database, session secret, and
disposable root are provided and the auth write database is separate from the
shadow database. The disposable Authentik profile uses generated runtime secrets,
isolated volumes, a private network, and no production provider credentials.

This is adequate as a test boundary, but it is not a production administrative
authorization model: the lifecycle token bypasses native user RBAC by design.
The operational invariant must therefore be that no production-like deployment
sets `PRG32_BACKEND_AUTH_WRITE_ENABLED=true` or `AUTH_WRITE_MODE=test`.

## 12. Provider lifecycle classification

| Capability | Classification | Evidence |
|---|---|---|
| Enable/disable provider | Implemented; unit tested | `FederationProviderService.setEnabled`, lifecycle tests |
| Provider generation invalidation | Implemented; unit tested | `provider.ts`, `transaction.ts`, OIDC/SAML fixtures |
| Revoke pending transactions | Implemented; unit tested | `FederationProviderOperations`, transaction store |
| OIDC secret rotation | Implemented; fixture tested | `operations.ts`, encrypted `SecretStore` path |
| SAML A+B trust overlap | Implemented; fixture tested | trusted certificate set and lifecycle tests |
| Certificate expiry/fingerprint status | Implemented; unit tested | provider status and SAML validation |
| Identity-link retirement | Implemented; unit tested | `FederationIdentityService`/operations |
| Local account disablement | Implemented; existing regression tested | `invalidateAccountAccess` |
| Production provider-admin UI/API | Not implemented | no production federation admin route |
| Real Authentik rotation | Not verified | explicitly skipped in this audit |
| Browser lifecycle matrix | Deferred by user request | not counted as a pass |

## 13. Generic provider independence

The protocol adapters are provider-neutral. Authentik is used only in disposable
integration infrastructure to exercise a real OIDC/SAML provider. No production
credential, `kelyon-admin/admin` credential, production Authentik endpoint, or
provider-specific administration API is used or required.

Provider configuration is stored as protocol data and provider-scoped secret
references. OIDC uses standard discovery and claims; SAML uses configured
entity ID, ACS, entry point, persistent NameID, and trusted certificate material.

## 14. Existing Next.js architecture

The Next app is a foundation, not an auth product. `Providers` currently wires
TanStack Query and theme state. The API client validates selected response
schemas and gives stable `ApiRequestError`/validation errors. There is no auth
store or auth query yet.

`frontend/next.config.ts` currently rewrites `/api`, `/auth`, `/admin`, and
related paths to `FLASK_PROXY_TARGET`. The only Fastify rewrite is the
development/test-only `/__admin-fastify/:path*` target controlled by
`PRG32_ADMIN_FASTIFY_TARGET`; production builds reject that target. Therefore
the existing frontend still treats Flask as the public API authority and must
not silently switch it during the auth UI milestone.

## 15. Exact endpoint matrix for frontend planning

The following paths are present in source; no invented endpoint names are used.

| Function | Method/path | Current auth/CSRF contract | Frontend status |
|---|---|---|---|
| Discover public federation methods | `GET /api/auth/providers` | public safe provider metadata; no secrets | backend only |
| Obtain browser CSRF | `GET /auth/csrf` | write-enabled backend; may issue anonymous session cookie; `no-store` | generic client helper exists |
| Local login metadata | `GET /auth/login` | public metadata response | no UI |
| Local login | `POST /auth/login` | cookie session + CSRF; rotates session | no UI |
| Current user | `GET /auth/me` or `GET /api/me` | cookie or bearer; returns user and effective permissions | no auth hook |
| Local logout | `POST /auth/logout` | authenticated cookie session + CSRF; expires session cookie | no UI |
| OIDC start | `GET /api/auth/oidc/:providerId/login?return_to=...` | redirect; signed correlation cookie | no UI |
| OIDC callback | `GET /api/auth/oidc/:providerId/callback` | provider callback + correlation; safe local redirect or stable JSON error | no UI |
| SAML start | `GET /api/auth/saml/:providerId/login?return_to=...` | redirect; signed `SameSite=None; Secure` correlation cookie | no UI |
| SAML ACS | `POST /api/auth/saml/:providerId/acs` | form `SAMLResponse` + `RelayState` and correlation | no UI |
| SAML metadata | `GET /api/auth/saml/:providerId/metadata` | public SP metadata | no UI |
| Self API tokens | `GET/POST/PATCH/DELETE /auth/tokens...` | permission + CSRF for writes | outside auth UI scope |
| Admin users/groups/roles | `/api/admin/users...`, `/api/admin/groups...`, `/api/admin/roles` | local admin permission; mutations browser session + CSRF | existing admin client via test proxy |
| Admin settings/assets | `/api/admin/settings...`, `/api/assets...` | admin permission; mutation CSRF | existing admin client |
| Admin catalog | `/api/admin/cartridges...` | catalog permission; mutation CSRF | existing admin client |
| Backup | `/admin/backup/download`, `/admin/backup/restore` | admin browser session and existing policy | existing admin client |

There is currently no backend re-auth endpoint and no production provider-admin
route. Those omissions are explicit inputs to the next milestone.

## 16. Recommended login UI architecture

The next frontend milestone should add only:

1. a route-level login page that calls `/api/auth/providers` and presents local,
   OIDC, and SAML options from the returned metadata;
2. a small `useCurrentUser` TanStack Query hook for `/auth/me`, with a disabled
   anonymous result rather than a second client-side identity authority;
3. local login and logout mutations using `/auth/csrf`, `X-CSRFToken`, and the
   existing same-origin `requestJson` helper;
4. redirect initiation by navigating the browser to the exact OIDC/SAML start
   paths, preserving only a safe local return path;
5. route-level loading/error boundaries and a protected-page guard that uses the
   server result, not a client-only role claim;
6. tests for provider listing, local login error handling, session refresh,
   logout, CSRF failure, and safe return-path handling.

Do not add an Authentik SDK, email-based auto-linking, a second token store,
provider-specific claim mapping, or frontend business logic copied from Flask.

## 17. Manual OIDC configuration checklist

For a generic provider, an operator must verify:

- local display name and stable provider ID;
- issuer/discovery URL supplied by the IdP;
- confidential client ID and client secret stored only through the encrypted
  provider-secret path;
- exact callback URI:
  `<public-origin>/api/auth/oidc/<providerId>/callback`;
- `openid` scope; `email`/`profile` only if needed;
- a stable `sub` claim; email is not an identity key;
- supported signing algorithm and JWKS endpoint reachable from the backend;
- HTTPS and exact origin in production;
- one pre-linked test user and one unknown-user negative case;
- provider disablement, replay, stale-generation, and expired-transaction cases.

No Authentik-specific setting is required by the application contract.

## 18. Manual SAML configuration checklist

For a generic IdP, an operator must verify:

- local provider ID and display name;
- IdP Entity ID, SSO entry point, and current trusted signing certificate;
- generated SP metadata and exact ACS URL;
- SP Entity ID and any configured SP signing certificate/key reference;
- signed response and signed assertion policy;
- persistent NameID format and stable subject value;
- exact audience, destination, recipient, and `InResponseTo` behavior;
- HTTPS public origin and browser cookie compatibility;
- one pre-linked test user and one unknown-user negative case;
- planned A+B certificate overlap and explicit retirement procedure.

IdP-initiated login, SLO, Artifact/SOAP, and encrypted assertions are not part
of the current supported contract.

## 19. Provider administration readiness specification

A future provider-admin surface must be implemented as native Fastify routes,
not lifecycle test routes. It must:

- use centralized permissions and deny bearer-only mutation requests;
- require a browser session, CSRF, recent administrator reauthentication, and
  bounded audit logging;
- never return client secrets, private keys, raw certificates, or decrypted
  secret values;
- show only certificate fingerprints, validity windows, generation, enabled
  state, pending transaction count, and safe protocol metadata;
- make enable/disable, secret rotation, trust overlap, retirement, and pending
  revocation explicit confirmation actions;
- perform provider generation changes and transaction invalidation atomically;
- expose safe, predictable errors and no raw upstream exception strings;
- have adversarial tests for authorization, CSRF, reauth, replay, stale
  generation, key retirement, and audit failure.

This specification is planning output only; no provider-admin route was added.

## 20. SQLite and migration compatibility

Federation schema version 5 is additive and idempotent through the existing
migration mechanism in `backend/src/db/federation-migrations.ts`. It adds provider
generation, trusted SAML certificate-set storage, and transaction generation
data. Existing local-auth, metrics, score, catalog, and firmware contracts are
not replaced.

The migration remains compatible with the single SQLite database model and the
isolated auth writer/shadow arrangement. No schema migration was performed in
this audit and no production database was opened or modified.

## 21. Flask/Fastify isolation

Flask remains authoritative for the current public storefront and legacy routes.
Fastify is the TypeScript migration surface. The current Next rewrite sends
public `/auth` and `/api` paths to Flask unless a future explicitly configured
rewrite changes that boundary. The admin client’s `/__admin-fastify` path is
deliberately development/test-only.

The next auth UI must select its backend target explicitly and preserve existing
Jinja, firmware, WebSocket, and production routing contracts. It must not make a
partial route switch that leaves callbacks on a different origin or changes the
meaning of existing Flask endpoints.

## 22. Test coverage matrix

| Area | Evidence verified for this audit | Result |
|---|---|---|
| Local auth/session/CSRF | full backend check plus `tests/auth.test.ts` | pass |
| OIDC protocol and replay/identity fixtures | `tests/oidc.test.ts` | pass, 4 tests |
| SAML validation/replay/identity fixtures | `tests/saml.test.ts` | pass, 4 tests |
| Federation foundation | `tests/federation-foundation.test.ts` | pass, 3 tests |
| Lifecycle operations and rollover fixtures | `tests/federation-lifecycle.test.ts`, OIDC/SAML fixture tests | pass, included in 37 targeted tests |
| RBAC/admin/CSRF | `tests/authorization.test.ts`, `tests/admin.test.ts` | pass, included in 37 targeted tests |
| Complete backend regression suite | `pnpm run check` | 24 files, 126 tests pass |
| Frontend unit tests | `frontend pnpm run check` | 4 files, 10 tests pass |
| Frontend production build | Next.js build with `FLASK_PROXY_TARGET` | pass |
| Dependency audit | `pnpm audit --prod` in backend | no known vulnerabilities |
| Compose topology | root single-file profile config | pass |
| 5a Authentik browser matrix | historical evidence only | 6/6 previously; not rerun |
| 5b browser lifecycle matrix | explicitly skipped | not verified |
| Real provider key/certificate rotation | not executed | not verified |
| Frontend login UI | not implemented by scope | not applicable |

## 23. Security findings

### FND-01 — MEDIUM — Test lifecycle route relies on operational mode isolation

Files/functions: `backend/src/config/env.ts` `loadConfig`,
`backend/src/app.ts` `buildApp`, and
`backend/src/federation/lifecycle-test-routes.ts`.

Evidence: routes are protected by a test token and registered when the federation
writer is active in `test` mode. The configuration forces enabled auth writes to
use `test`, but there is no separate immutable production-build flag proving that
test routes can never be enabled in a misconfigured production-like process.

Impact: an operator who incorrectly enables the isolated test writer in a public
deployment could expose a non-RBAC lifecycle surface. This is an operational
misconfiguration risk, not an observed default production exposure.

Remediation: add a separately named opt-in test-route flag plus a disposable-root
assertion and a production startup test that fails closed. Keep the current token
and isolated database requirements. Target milestone: provider-admin hardening.

### FND-02 — MEDIUM — No recent administrator reauthentication gate

Files/functions: `backend/src/admin/routes.ts` `requireAdmin`,
`requireTokenAdmin`, `requireCatalogAdmin`; `backend/src/admin/service.ts`
`AdminMutationContext`.

Evidence: admin mutations require permission, browser session, and CSRF, but the
mutation context contains only actor ID and request ID and no recent-auth state.

Impact: a stolen valid admin session can perform sensitive mutations until it is
expired or revoked.

Remediation: implement a separate recent-auth/reauthentication contract before
provider administration and high-impact settings operations. Do not solve this
by weakening CSRF or by accepting bearer tokens. Target milestone: provider-admin
surface and frontend admin security gate.

### FND-03 — MEDIUM — SAML cache final-consume concurrency needs an explicit gate

Files/functions: `backend/src/saml/service.ts`
`DurableSamlCacheProvider` and `SamlService.complete`.

Evidence: Node-SAML’s cache interface is get/remove; final durable transaction
consumption occurs after protocol validation. Existing replay fixtures pass, but
there is no dedicated concurrent duplicate-response test in the verified suite.

Impact: the intended single-use invariant is implemented at the SQLite boundary,
but confidence under simultaneous duplicate callbacks is lower than the normal
single-request evidence.

Remediation: add a deterministic concurrent callback test and review the adapter
against the selected Node-SAML version before production federation approval.

### FND-04 — MEDIUM — Logout policy is local-only

Files/functions: `backend/src/auth/routes.ts` `POST /auth/logout`,
`backend/src/oidc/routes.ts`, and `backend/src/saml/routes.ts`.

Evidence: local session invalidation and cookie clearing are implemented. There
is no RP-initiated OIDC logout or SAML Single Logout flow.

Impact: logging out locally does not necessarily terminate an upstream IdP
session. This is not a local-session bypass, but it must be an explicit product
security decision before federation launch.

Remediation: document local-only logout as the initial policy or implement and
test provider logout as a separate milestone. Do not infer provider logout from
local cookie deletion.

### FND-05 — LOW — Frontend auth integration is not yet present

Files: `frontend/src/app`, `frontend/src/lib/api`, `frontend/next.config.ts`.

Evidence: no login page, auth query/store, protected-route middleware, or logout
mutation exists; public auth rewrites still target Flask.

Impact: the current Next app cannot be used as the federation login surface.

Remediation: implement the isolated login UI and same-origin Fastify auth proxy
in the next authorized frontend milestone. This is an expected missing feature,
not an identified backend vulnerability.

## 24. Required remediations before production federation

1. Create a production-safe provider-admin API with native RBAC, CSRF, audit, and
   recent reauthentication.
2. Make lifecycle test routes fail closed with an explicit test-only flag and
   disposable-root assertion.
3. Add concurrent SAML duplicate-response verification.
4. Decide and document local-only versus upstream federated logout.
5. Verify real generic-provider key/certificate rollover in a disposable
   environment without using production credentials.
6. Establish distributed rate-limit/cache behavior if more than one backend
   replica is ever used.
7. Define the production Fastify deployment boundary and callback origins before
   changing Next rewrites.

## 25. Deferred and intentionally excluded work

Not done in this milestone:

- frontend authentication UI or route middleware;
- provider administration UI/API;
- Flask retirement or storefront rewrite;
- production federation enablement;
- database schema changes;
- Authentik credentials or production provider access;
- full browser lifecycle rerun;
- real key/certificate rotation;
- OIDC RP-initiated logout or SAML SLO;
- commits, pushes, deployment, or changes in `../PRG32`.

## 26. Verification commands and results

Executed under Node 24 using `source "$HOME/.nvm/nvm.sh" && nvm use 24`:

```text
backend: pnpm run check
PASS — typecheck, ESLint, 24 Vitest files / 126 tests, TypeScript build

backend: pnpm audit --prod
PASS — no known vulnerabilities

frontend: FLASK_PROXY_TARGET=http://backend:5080 pnpm run check
PASS — typecheck, ESLint, 4 Vitest files / 10 tests, Next.js production build

backend targeted federation/auth/admin tests
PASS — 7 files / 37 tests

docker compose --profile dev --profile backend --profile writer \
  --profile writer-init --profile prod --profile authentik-e2e config
PASS — normalized single-file Compose configuration
```

The frontend check printed the existing Vitest warning about ESM syntax in
`vitest.config.ts` under the future native config loader. It did not fail the
check. The full Authentik lifecycle command was not executed by authorization.

## 27. Files changed for M6.3d.2h.6

- Added `docs/modernization/61-m6-3d2h6-federation-security-frontend-readiness-audit.md`.
- Updated `docs/modernization/19-revised-migration-roadmap.md`.

No backend source, frontend source, tests, Compose file, database, deployment
file, or sibling repository file was changed in this audit.

## 28. Frontend authentication readiness decision

**GO for an isolated frontend authentication implementation milestone.**

There is no identified critical/high backend authentication blocker in the
reviewed boundary. Exact login, callback, session, CSRF, and current-user
contracts exist, and the existing Next client/provider structure can reuse them.
The GO is conditional on keeping the work behind an explicit Fastify target or
same-origin rewrite, adding UI-specific tests, and preserving the current Flask
routes until cutover is separately authorized.

## 29. Production federation readiness decision

**NO-GO.**

The current federation writer is intentionally test/disposable-only, provider
administration is not a production RBAC surface, recent admin reauthentication is
missing, concurrent SAML consumption needs a dedicated test, upstream logout is
undefined, and real provider certificate/key rotation is unverified. The 5a 6/6
browser result proves disposable protocol connectivity, not production readiness.

## 30. Recommended next milestone

Proceed with **M6.3d.2h.7 — Next.js authentication integration readiness**:

- add the same-origin Fastify auth target/rewrite for isolated development only;
- implement local login/logout and generic OIDC/SAML initiation UI;
- add current-user/session query, protected route behavior, error boundaries, and
  CSRF-aware mutations;
- add frontend contract tests without Authentik-specific code;
- keep Flask public routing and Jinja pages unchanged;
- carry FND-01 through FND-04 as explicit backend/provider-admin prerequisites.

Do not enable production federation or begin provider administration as part of
that frontend milestone. A later, separately authorized milestone must close the
production NO-GO findings and perform the real generic-provider operational gate.
