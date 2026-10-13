# M6.3d.2h.8 — Canonical Authentication Routing & Secure Provider Administration API

Status: **complete for the isolated Fastify/Next.js foundation; production federation and Flask/Fastify cutover remain NO-GO**.

## 1. Executive summary

This milestone replaced the temporary browser-visible `/__auth-fastify/*`
namespace with the canonical authentication paths and added a native,
provider-neutral Fastify administration boundary for OIDC and SAML providers.
The new administrative mutations require a local administrator session,
centralized RBAC, browser CSRF, and recent local password reauthentication.

The isolated mode is disabled by default and is rejected by production Next.js
build configuration. Existing Flask catch-all routing remains the owner of
non-authentication paths. No Flask code, firmware code, production database,
deployment, commit, or push was changed.

## 2. Initial repository state

M6.3d.2h.7 had a working isolated Next.js authentication UI, but the browser
client depended on `/__auth-fastify/*`; provider administration existed only as
service and disposable lifecycle primitives. Findings FND-01 (lifecycle route
activation), FND-02 (recent administrator reauthentication), FND-03 (SAML
duplicate consumption coverage), and the missing native provider-admin HTTP
boundary were open.

The sibling `../PRG32` repository was inspected only for status and was not
modified.

## 3. Canonical routing architecture

The browser client now calls exactly these paths:

| Contract | Canonical path |
|---|---|
| CSRF | `GET /auth/csrf` |
| Login discovery | `GET /auth/login` |
| Local login | `POST /auth/login` |
| Current user | `GET /auth/me` |
| Local logout | `POST /auth/logout` |
| Provider discovery | `GET /api/auth/providers` |
| OIDC start | `GET /api/auth/oidc/:providerId/login` |
| OIDC callback | `GET /api/auth/oidc/:providerId/callback` |
| SAML start | `GET /api/auth/saml/:providerId/login` |
| SAML ACS | `POST /api/auth/saml/:providerId/acs` |
| SAML metadata | `GET /api/auth/saml/:providerId/metadata` |

`/login` and `/account` remain the canonical frontend routes. No public
`/__auth-fastify/*` alias remains in the frontend client or Next configuration.

When `PRG32_AUTH_INTEGRATION_ENABLED=true`, an explicit valid
`PRG32_AUTH_FASTIFY_TARGET` receives `/auth/*` and `/api/auth/*`. Flask routes
are excluded from those namespaces by route pattern, not merely by rewrite
ordering. Other `/api/*`, `/admin/*`, storefront, Jinja, and WebSocket paths
continue to use their existing owners.

The mode is disabled by default, requires both explicit variables, and rejects
loopback/invalid target syntax, credentials, paths, queries, and fragments.
Production builds reject either authentication integration variable.

## 4. Development/test configuration

Example isolated configuration:

```text
PRG32_AUTH_INTEGRATION_ENABLED=true
PRG32_AUTH_FASTIFY_TARGET=http://auth-writer:5090
PRG32_AUTH_PUBLIC_ORIGIN=https://store.prg32.dream.test
```

The public origin is passed to Fastify as both the OIDC and federation public
origin in the disposable writer profile. It must match the browser origin and
the configured callback URLs. The operational default remains Flask-authority.

## 5. Flask isolation guarantees

- The auth integration flag defaults to false.
- Invalid or incomplete auth-proxy configuration fails closed.
- Production Next.js configuration rejects auth integration activation.
- Flask catch-alls exclude canonical auth namespaces only in isolated mode.
- Non-auth Flask and Jinja routes were not renamed or removed.
- The unrelated `/__admin-fastify/*` development integration was retained.
- No Flask source or production routing was changed.

If Fastify is unavailable while isolated mode is enabled, the canonical request
fails at the configured proxy boundary; it does not silently fall back to
Flask authentication.

## 6. OIDC callback routing

The callback remains:

`<public-origin>/api/auth/oidc/<providerId>/callback`

The Next rewrite forwards that exact path to Fastify. Fastify continues to
validate provider, issuer, redirect URI, state, nonce, PKCE, generation, and
replay semantics. Protocol payloads are not transformed.

## 7. SAML ACS routing

The ACS remains:

`<public-origin>/api/auth/saml/<providerId>/acs`

The canonical rewrite applies to the whole `/api/auth/*` namespace, so SAML
POST method, form body, content type, and same-origin cookies remain associated
with the canonical request. The SAML cookie continues to require
`SameSite=None; Secure`; HTTPS browser interoperability was not re-run in this
milestone.

Metadata remains:

`<public-origin>/api/auth/saml/<providerId>/metadata`

## 8. Cookie and origin behavior

Local session cookies remain same-origin and HttpOnly. OIDC and SAML services
continue to compare configured public origins and exact callback bindings. The
Next proxy does not expose the backend target to browser code.

## 9. Removed temporary routing

Removed from the active client/configuration:

- `AUTH_PROXY_PREFIX` runtime dependence;
- `/__auth-fastify/*` auth rewrite;
- auth UI URLs built under the temporary prefix.

The temporary namespace is not a compatibility alias and is not a permanent
public contract.

## 10. Administrative API endpoint matrix

All routes below are native Fastify routes. Read routes require
`federation:read`; mutations require `federation:manage`, a local browser
session, CSRF, and recent local administrator reauthentication where marked.

| Method | Path | Policy |
|---|---|---|
| `POST` | `/api/admin/federation/reauthenticate` | admin session + CSRF + local password |
| `GET` | `/api/admin/federation/providers` | authenticated admin read |
| `POST` | `/api/admin/federation/providers` | manage + CSRF + recent re-auth |
| `GET` | `/api/admin/federation/providers/:providerId` | authenticated admin read |
| `PATCH` | `/api/admin/federation/providers/:providerId` | manage + CSRF + recent re-auth |
| `GET` | `/api/admin/federation/providers/:providerId/status` | authenticated admin read |
| `POST` | `/api/admin/federation/providers/:providerId/enable` | manage + CSRF + recent re-auth |
| `POST` | `/api/admin/federation/providers/:providerId/disable` | manage + CSRF + recent re-auth |
| `POST` | `/api/admin/federation/providers/:providerId/rotate-secret` | manage + CSRF + recent re-auth |
| `POST` | `/api/admin/federation/providers/:providerId/certificates` | manage + CSRF + recent re-auth |
| `POST` | `/api/admin/federation/providers/:providerId/transactions/revoke` | manage + CSRF + recent re-auth |
| `GET` | `/api/admin/federation/identities` | authenticated admin read |
| `POST` | `/api/admin/federation/identities` | manage + CSRF + recent re-auth |
| `POST` | `/api/admin/federation/identities/:identityId/retire` | manage + CSRF + recent re-auth |

No provider-admin UI was added.

## 11. Provider configuration schema

The API reuses `FederationProviderService` and its existing schema. OIDC uses
provider ID, display name, issuer, client ID, client authentication method,
redirect URI, discovery issuer, and bounded scopes. SAML uses IdP entity ID,
SP entity ID, ACS, SSO entry point, persistent NameID, trusted certificates,
and the existing signature/profile options.

Provider IDs, URLs, protocol values, scopes, certificate bounds, and boolean/
numeric options are validated before persistence. OIDC and SAML remain generic;
there are no Authentik-specific fields or management API calls.

Provider status returns safe identifiers, enabled state, generation, timestamps,
configuration completeness, pending count, and certificate fingerprints/validity
metadata where a real X.509 certificate is supplied. It does not return client
secrets, private keys, raw assertions, cookies, tokens, or raw secret envelope
values.

## 12. OIDC secret management

Confidential client secrets are accepted only by authenticated administrative
mutation routes and are stored through the existing provider-scoped encrypted
secret envelope. The server generates the provider-scoped reference; callers
cannot supply an arbitrary secret reference. Rotation increments provider
generation and invalidates pending transactions. Secrets are not returned or
written to audit payloads.

The isolated writer must have the existing secret key registry configured before
secret mutation is accepted. No plaintext provider secret is stored in SQLite.

## 13. SAML certificate management

Certificate/public-key material is bounded, parsed before storage, deduplicated,
and limited to the existing A+B trust-set size of two. The existing rollover
operation preserves overlap and generation invalidation. Incoming SAML response
certificates are not trusted. CRL/OCSP and server-side SP key generation remain
deferred.

## 14. Identity-link administration

Identity administration uses the existing exact binding:

`protocol + provider_id + issuer + external subject`

The API lists safe identity metadata, creates an explicit link to an existing
local user, and retires an existing link. It does not create users, link by
email/username, derive roles from claims, or silently reuse retired identities.
Existing uniqueness, disabled-account, and last-authentication-method checks
remain in `FederationIdentityService`.

## 15. RBAC policy matrix

| Operation | Permission | Browser session | CSRF | Recent local re-auth |
|---|---|---:|---:|---:|
| Provider/status read | `federation:read` | no bearer restriction | no | no |
| Re-authentication | `federation:manage` | yes | yes | password itself |
| Provider create/update | `federation:manage` | yes | yes | yes |
| Enable/disable | `federation:manage` | yes | yes | yes |
| Secret/certificate mutation | `federation:manage` | yes | yes | yes |
| Transaction revocation | `federation:manage` | yes | yes | yes |
| Identity link/retirement | `federation:manage` | yes | yes | yes |

Permissions are added to the centralized permission map; no username-based or
IdP-claim-based administration was introduced. Bearer-only privileged
mutations are rejected.

## 16. Recent administrator reauthentication

The additive federation schema migration (version 6) adds nullable
`auth_sessions.reauthenticated_at`. The value is server-written after verifying
the current administrator's local password with the existing Werkzeug verifier.
It is bound to the current opaque session, expires after the configured default
of 300 seconds, is cleared by session rotation/revocation, and is never
client-supplied. Failed attempts are bounded by the existing auth rate-limit
configuration and return stable errors.

Federated authentication timestamps are not accepted as local administrator
reauthentication.

## 17. CSRF policy

Every browser mutation requires the current session's encrypted CSRF token in
`X-CSRFToken` or `X-CSRF-Token`. A bearer token cannot satisfy this boundary.
Missing and invalid tokens return `csrf_failed` without provider or secret
details.

## 18. Audit logging

Sensitive mutations preflight the existing bounded audit log and use its
provider/identity operation events with actor ID, request ID, action, target,
timestamp, and outcome. Passwords, secrets, private keys, certificates, raw
assertions, tokens, cookies, and CSRF values are excluded. Administrative
errors are logged server-side with stable public error envelopes.

The existing two-persistence limitation remains: an audit write after a
committed SQLite transaction cannot be rolled back atomically. Preflight keeps
the mutation boundary fail-closed when audit storage is unavailable.

## 19. Test-only lifecycle hardening

`/_test/federation/*` routes now require all of:

- `PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_ENABLED=true`;
- test auth-write mode;
- isolated auth database and disposable root;
- a lifecycle token of at least 32 characters;
- non-production runtime configuration.

The flag defaults to false. The native provider-admin API never uses the
lifecycle token.

## 20. SAML concurrency findings

`FederationTransactionStore.consumeByRequestId` already uses `BEGIN IMMEDIATE`
and a conditional single-use update. A focused test using two independent
SQLite handles and concurrent promise scheduling establishes that exactly one
duplicate transaction consumer succeeds and the other fails.

The full browser-level duplicate SAML response journey was not executed. The
Node-SAML adapter remains deliberately unchanged; no protocol validation was
weakened to make the test pass.

## 21. Federated logout policy

Logout remains local PRG32 session invalidation only. OIDC RP-initiated logout
and SAML Single Logout were not implemented and must not be described as
upstream IdP session termination. This is an explicit product policy carried
into the future administration UI and interoperability test plan.

## 22. Test coverage and evidence

Executed with Node.js 24 via `nvm use 24`:

- backend `pnpm run check`: PASS — 25 Vitest files / 130 tests;
- backend `pnpm audit --prod`: PASS — no known production vulnerabilities;
- frontend `FLASK_PROXY_TARGET=http://backend:5080 pnpm run check`: PASS — 8
  Vitest files / 24 tests, TypeScript, ESLint, and Next production build;
- focused federation-admin/foundation tests: PASS — 2 files / 7 tests;
- canonical Next configuration inspection: PASS — canonical auth rewrites,
  pattern-level Flask exclusions, and callback paths observed;
- production Next guard: PASS — accidental auth integration rejected;
- Compose all-profile `config`: PASS;
- `git diff --check`: PASS;
- sibling `../PRG32` status inspected and left unchanged.

No real external OIDC/SAML callback was claimed as verified in this milestone.
The full Playwright lifecycle matrix was not rerun.

## 23. Disposable integration evidence

The existing disposable local Next-to-Fastify login/session/logout evidence
remains valid after the canonical-client change. It covered CSRF, bootstrap,
local login, `/auth/me`, logout, and post-logout rejection. The new focused
HTTP tests cover provider listing, OIDC and SAML provider creation, enablement,
safe response redaction, explicit identity linking/retirement, reauthentication,
and lifecycle-route absence by default.

## 24. Remaining limitations

- Real generic OIDC/SAML browser interoperability and HTTPS callback cookie
  behavior remain unverified here.
- Certificate rotation with real Authentik material remains unverified.
- CRL/OCSP, upstream logout, and SP signing-key generation remain deferred.
- The existing audit/SQLite two-persistence limitation remains documented.
- Provider creation with a confidential secret requires the existing encrypted
  key registry in the isolated writer.
- No provider administration UI was implemented.
- Flask remains operationally authoritative; no cutover was attempted.

## 25. Files changed

Main implementation files:

- `frontend/next.config.ts`;
- `frontend/src/lib/api/auth.ts` and canonical-path tests;
- `backend/src/auth/session.ts`, `backend/src/auth/service.ts`;
- `backend/src/config/env.ts`;
- `backend/src/db/federation-migrations.ts`;
- `backend/src/authorization/permissions.ts`;
- `backend/src/app.ts`;
- `backend/src/federation/admin-routes.ts`;
- `backend/src/federation/provider.ts`;
- `backend/src/federation/identity.ts`;
- `backend/src/federation/operations.ts`;
- `backend/src/federation/lifecycle-test-routes.ts` remains the isolated test
  surface; its registration boundary is enforced in `backend/src/app.ts`;
- `backend/tests/federation-admin.test.ts`;
- `backend/tests/federation-foundation.test.ts`;
- `docker-compose.yml`;
- this report and the revised roadmap.

No Flask, firmware, production configuration, production data, deployment, or
sibling-repository files were modified.

## 26. Acceptance criteria

Canonical routing, default-disablement, production rejection, Flask isolation,
local session compatibility, native provider-admin routes, safe status,
provider lifecycle, encrypted-secret boundary, certificate bounds, explicit
identity linking, RBAC, CSRF, reauthentication, bearer-mutation rejection,
lifecycle test isolation, and deterministic transaction-consumption invariants
are implemented and covered by focused tests.

Real provider browser interoperability, production routing, cutover, upstream
logout, and deployment are intentionally not acceptance claims.

## 27. Production GO/NO-GO

**NO-GO for production federation and public provider administration.**

**GO for the isolated Next.js canonical-auth and Fastify provider-admin
foundation test environment**, subject to disposable credentials/data and the
explicit development configuration.

## 28. Next milestone

Recommend **M6.3d.2h.9 — Generic OIDC/SAML Provider Administration UI**. It may
consume the secured API for provider listing, creation, editing, lifecycle,
secret/certificate management, explicit identity linking, recent
administrator reauthentication, and safe audit feedback. It must not enable
production federation or perform Flask/Fastify cutover automatically.
