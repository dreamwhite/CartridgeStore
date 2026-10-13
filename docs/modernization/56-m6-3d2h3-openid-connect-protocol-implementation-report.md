# M6.3d.2h.3 — OpenID Connect Protocol Implementation

Date: 2026-10-13
Status: **Complete for the isolated Fastify/TypeScript writer profile; NO-GO
for production federation, Authentik, frontend login, Flask cutover, and
deployment.**

## 1. Scope and decision

This milestone implements a narrow OIDC Authorization Code flow with PKCE in
the transitional Fastify/TypeScript backend. It does not implement SAML,
Authentik integration, frontend login, production routing, deployment, Flask
changes, operational-database writes, or a storefront feature.

The implementation uses `openid-client` for discovery, authorization URL
construction, authorization-code exchange, PKCE helpers, and protocol response
processing. A bounded `jose` verification step explicitly validates the ID
token signature against the provider's discovered JWKS before the existing
identity service receives a branded identity.

## 2. Dependency selection and security review

Runtime dependencies are pinned where the protocol boundary is security
sensitive:

- `openid-client` **6.8.8**, ESM, Node 20+ baseline and therefore compatible
  with Node 24;
- `jose` **6.2.12** for explicit local JWKS/ID-token signature verification;
- existing `fastify`, `better-sqlite3`, and provider-neutral federation code.

The package review used the upstream [`openid-client` security guidance](https://github.com/panva/openid-client/security),
[v6.8.8 release](https://github.com/panva/openid-client/releases/tag/v6.8.8),
and [upstream API documentation](https://github.com/panva/openid-client#api).
`openid-client` reports v6 as security-supported with no published advisory at
the time of the review. Its normal protocol dependencies are `jose` and
`oauth4webapi`; the direct `jose` dependency is intentional because this
application needs a small, auditable signature-validation boundary.

The existing Drizzle dependency was also moved to the patched installed line
(`0.45.4`, package constraint `^0.45.2`) after `pnpm audit --prod` identified
the pre-existing SQL identifier advisory below that line. The final production
audit reports no known vulnerabilities.

No Authentik package, SAML package, browser SDK, or unbounded HTTP client was
introduced.

## 3. Runtime boundary

OIDC is constructed only when authentication writes are enabled and the
session secret is present. It is therefore unavailable in the read-only
backend profile. The writer remains an isolated SQLite database selected by
the existing `PRG32_BACKEND_AUTH_WRITE_DB` controls.

The public callback origin is explicit through
`PRG32_BACKEND_OIDC_PUBLIC_ORIGIN`. The service fails closed if it is absent,
requires an HTTPS origin outside test mode, and requires each registered
callback to match the origin and exact path
`/api/auth/oidc/<provider_id>/callback`.

## 4. Provider configuration

`backend/src/federation/provider.ts` remains protocol-neutral. OIDC providers
are disabled by default and must contain:

- a bounded provider identifier and display name;
- an HTTPS issuer outside test mode;
- a client identifier;
- `client_secret_basic`, `client_secret_post`, or `none` authentication;
- an exact callback URI;
- a scope list containing `openid`;
- a provider-scoped secret reference when a confidential client method is used.

Provider URLs reject credentials and fragments. The provider identifier is
validated before it reaches SQL, HTTP, audit, or cookie logic.

## 5. Discovery and metadata validation

`backend/src/oidc/service.ts` calls `openid-client.discovery` and bounds the
discovery cache to 16 providers with a five-minute TTL and an in-flight request
map. Cache entries are invalidated by provider `updated_at` changes.

The custom fetch boundary enforces:

- issuer-origin equality for every discovery, token, and JWKS request;
- HTTPS outside test mode;
- no credentials or fragments in outbound URLs;
- no redirects;
- a 5-second client timeout;
- a 1 MiB request and response body limit;
- exact issuer metadata and same-origin authorization, token, and JWKS
  endpoints.

The test-only HTTP allowance is enabled only when
`PRG32_BACKEND_AUTH_WRITE_MODE=test`; it is never enabled by production
configuration.

## 6. Authorization request

`GET /api/auth/oidc/:providerId/login` accepts only the bounded local
`return_to` parameter. It generates fresh state, nonce, and PKCE verifier
material with `openid-client`, uses `S256`, and sends only the authorization
request to the configured provider.

The verifier and nonce are encrypted in the durable federation transaction.
Only a hash of state is persisted. Authorization codes, access tokens, ID
tokens, and provider claims are not persisted.

## 7. Browser correlation and CSRF boundary

`backend/src/oidc/correlation.ts` issues the HttpOnly, SameSite=Lax,
short-lived `prg32_oidc_correlation` cookie. Its signed payload contains only
the opaque transaction ID and a browser binding. The binding is incorporated
into the durable callback binding together with the exact redirect URI.

The callback requires both the signed correlation cookie and matching durable
transaction data. Missing, modified, cross-provider, or replayed correlation
state is rejected before identity resolution. The normal local session cookie
continues to use the existing durable session and CSRF implementation.

## 8. Callback handling

`GET /api/auth/oidc/:providerId/callback`:

1. parses the correlation cookie without logging its value;
2. validates provider, callback binding, state, expiry, and single use;
3. consumes the transaction before token exchange, preventing replay;
4. performs the authorization-code exchange with the stored PKCE verifier;
5. clears the correlation cookie on success and failure;
6. rotates the local anonymous/session principal into a durable authenticated
   session only after identity resolution succeeds; and
7. redirects only to the validated local return path.

Provider errors, missing codes, invalid state, expired transactions, and
replay produce stable error codes rather than provider exception text.

## 9. Token validation

`openid-client` performs the authorization response and token response
processing, including state, nonce, required ID-token presence, issuer,
audience, expiry, and protocol shape checks. The service additionally fetches
the bounded same-origin JWKS and uses `jose.jwtVerify` with:

- the exact configured issuer;
- the exact configured client audience;
- `RS256` as the currently allowed test/provider algorithm;
- the discovered JWKS only.

The application then requires a bounded string `sub`, checks `aud` and `azp`,
and passes only the branded `ValidatedExternalIdentity` to the federation
identity service. Wrong keys, malformed JWTs, issuer mismatch, audience
mismatch, nonce mismatch, and expired responses cannot create a session.

## 10. Identity resolution and linking policy

No email, name, or external group claim auto-links an account. Resolution
requires an existing exact `(protocol, provider, issuer, subject)` link. An
unknown identity returns `oidc_identity_link_required` and no local session.

Linking remains an explicit administrator/local-reauthentication operation in
the foundation. This milestone does not add a user-facing linking route and
does not map external claims to local roles or permissions.

Disabled local accounts return a stable forbidden result. Retired or unknown
links cannot be silently reused.

## 11. Session and logout behavior

Successful OIDC authentication uses the existing durable local session store,
deletes the old anonymous/session record during rotation, and sets the normal
`prg32_ts_session` cookie. Raw session identifiers remain HMAC-protected in
SQLite and CSRF values remain encrypted.

RP-initiated OIDC logout and provider session revocation are deliberately not
implemented. Existing local logout behavior is unchanged and remains the
authoritative logout mechanism for this milestone.

## 12. HTTP contracts

Added routes:

| Route | Behavior |
|---|---|
| `GET /api/auth/providers` | Safe provider metadata; no issuer, client ID, secret, or token material |
| `GET /api/auth/oidc/:providerId/login` | Local authorization start; redirects to the provider |
| `GET /api/auth/oidc/:providerId/callback` | Single-use callback; redirects locally on success |

Error bodies use the existing JSON compatibility serializer and stable
`{ok:false,error,code}` fields. Unknown exceptions become the generic
`oidc_unavailable` response; provider or JWT exception strings are not exposed.
No existing firmware, catalog, score, metrics, multiplayer, or Flask route was
changed.

## 13. Error and audit behavior

The implementation exposes stable codes for configuration, origin, browser
binding, state, replay, expiration, provider errors, token invalidity, unknown
identity, disabled account, and provider unavailability.

Audit events include start, rejection, provider failure, and success outcomes.
Targets use provider IDs or truncated hashes of issuer/subject; raw claims,
authorization codes, token values, correlation cookies, and secret values are
not written to the audit record. Request logs contain request IDs and stable
codes only.

## 14. Rate and resource limits

Login and callback attempts use bounded in-memory rate limiters based on the
existing authentication limits. Each limiter caps its key map at 4096 entries.
Discovery cache entries are capped at 16, network bodies at 1 MiB, requests at
5 seconds, transactions at 300 seconds, and local return paths at 512 bytes.

The in-memory limiter is intentionally a single-writer containment measure,
not a distributed production rate-limit solution. A shared limiter is a
production-readiness requirement.

## 15. Secret handling

Confidential provider clients load only the provider-scoped
`oidc-client-secret` reference through `SecretStore`. Values are decrypted on
use from the existing AES-256-GCM/HKDF envelope and are never returned by
`/api/auth/providers`, logged, persisted in OIDC transactions, or included in
backup plaintext metadata.

Public clients (`none`) are supported for explicitly configured providers and
are rejected if a secret reference is also present. Confidential clients are
the preferred production configuration.

## 16. Database and migration impact

This milestone uses the additive federation schema already introduced by
M6.3d.2h.2. Version 3 adds provider client-auth method and encrypted nonce
storage where needed; it is idempotent and writer-only. The operational
database schema is not migrated or written.

No Drizzle schema replacement, SQLite data migration, or production data
access occurred.

## 17. Backup and restore impact

OIDC transactions and sessions remain ephemeral authentication state. Existing
backup restore logic clears ephemeral sessions and federation transactions
after a successful restore, preserving the h2 security decision. Provider
secret envelopes remain covered by the existing backup inventory and key
rotation paths.

Rollback is a writer-profile operation: disable the OIDC provider, stop the
isolated writer, and restore a verified pre-migration writer backup if needed.
There is no reverse DDL and no safe downgrade of an active federation
database.

## 18. Test provider

`backend/tests/oidc.test.ts` contains a disposable standards-shaped OIDC mock
using Node HTTP and `jose`. It serves discovery, authorization, token, and JWKS
endpoints and validates the received PKCE verifier before issuing an ID token.
It is bound to loopback, uses test-only HTTP allowance, has no external
accounts, and is destroyed after each test. It is not a production provider
and is not Authentik.

## 19. Compatibility tests

The valid fixture uses the exact provider issuer, client ID, redirect URI,
`openid` scope, state, nonce, PKCE S256 challenge, signed ID token, and existing
linked subject. It proves local session creation without persisting the access
or ID token.

The same fixture proves stable rejection for invalid signatures, unknown
subjects, disabled accounts, modified correlation cookies, and replayed
callbacks. Existing authentication and compatibility suites remain in the
same command and were not bypassed.

## 20. Security invariant matrix

| Invariant | Evidence |
|---|---|
| Issuer and endpoint same-origin | `OidcService.createFetch`, metadata checks |
| HTTPS outside test | provider validation, discovery, fetch boundary |
| Explicit trusted callback origin | `PRG32_BACKEND_OIDC_PUBLIC_ORIGIN` validation |
| State is single-use and bound | durable transaction consume and correlation cookie |
| PKCE is S256 and confidential | `randomPKCECodeVerifier`, encrypted transaction verifier |
| Nonce is confidential and checked | encrypted nonce, `expectedNonce`, JWT claims |
| ID token is signed and bounded | `openid-client` processing plus local JWKS `jwtVerify` |
| No automatic account linking | exact identity resolution only |
| Disabled users cannot authenticate | centralized account-state check |
| Tokens are not stored | transaction schema and regression query |
| Errors do not leak provider exceptions | stable OIDC error envelopes and logging codes |
| Provider secrets are scoped/encrypted | `SecretStore.decryptProviderSecret` |

These rules are protocol-independent acceptance criteria for the future
Fastify implementation and any later SAML adapter.

## 21. Verification commands and results

All Node commands selected Node 24.20.0 with `source "$HOME/.nvm/nvm.sh" &&
nvm use 24`. `pnpm` used the repository lockfile.

| Command | Result |
|---|---|
| `pnpm run check` in `backend/` | PASS — typecheck, ESLint, 22 Vitest files / 118 tests, TypeScript build |
| `pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm exec vitest run tests/oidc.test.ts` | PASS — 3 tests |
| `pnpm audit --prod` in `backend/` | PASS — no known vulnerabilities |
| `pnpm run check` in `frontend/` | PARTIAL — typecheck, ESLint, and 4 Vitest files / 10 tests passed; first build stopped because `FLASK_PROXY_TARGET` was unset |
| `FLASK_PROXY_TARGET=http://127.0.0.1:5080 pnpm run build` in `frontend/` | EXPECTED FAIL — production config rejects loopback |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm run build` in `frontend/` | PASS — Next.js production build |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `.venv313/bin/pytest -q` | 63 passed, 1 pre-existing mDNS failure: `TESTING=False` without `SECRET_KEY` |
| `docker compose --profile dev --profile backend --profile writer --profile writer-init --profile prod config` | PASS |
| `docker build -t prg32-cartridge-store:local .` | PASS — existing Flask image; no Docker production routing changed |
| `git diff --check` | PASS |

The Python failure was not changed or masked because Flask is transitional and
this milestone is TypeScript-only.

## 22. Files added

- `backend/src/oidc/correlation.ts`;
- `backend/src/oidc/routes.ts`;
- `backend/src/oidc/service.ts`;
- `backend/tests/oidc.test.ts`;
- this report.

## 23. Files modified for this milestone

- `backend/package.json`;
- `backend/pnpm-lock.yaml`;
- `backend/src/app.ts`;
- `backend/src/config/env.ts`;
- `backend/src/federation/provider.ts`;
- `backend/src/federation/transaction.ts`;
- `docs/modernization/19-revised-migration-roadmap.md`.

Earlier h2 files and reports were already modified in the shared worktree and
were preserved. No Flask source, Jinja template, operational data, Compose
file, deployment file, companion `../PRG32` file, or frontend source was
modified for h3.

## 24. Remaining risks

- OIDC provider administration and secret-entry APIs are not exposed.
- The test client uses `none`; confidential-client exchange paths are
  implemented but require a separate integration fixture with encrypted
  provider secret material before production approval.
- The in-memory rate limiter is not shared across replicas.
- Provider key rotation, JWKS cache rotation, and incident revocation need an
  operational policy.
- RP-initiated logout is not implemented.
- The TypeScript backend remains a migration component beside Flask; no cutover
  or production routing decision is implied.
- The known Flask mDNS test failure remains open.

## 25. Deviations from the requested plan

- A direct `jose` runtime dependency was added because the protocol library's
  parsed claims helper is not an application-level signature policy. The
  explicit JWKS verification keeps the trust boundary visible and testable.
- The disposable test provider is a small local standards-shaped mock rather
  than Authentik. This keeps the milestone isolated and avoids credentials,
  external services, and production-like identity data.
- The frontend build required the already-defined non-loopback
  `FLASK_PROXY_TARGET=http://backend:5080` value for the production-config
  check. No frontend behavior was changed.

## 26. Open decisions

Before production federation, approve:

1. provider administration and encrypted-secret lifecycle;
2. confidential-client integration against a controlled provider;
3. distributed rate-limit and discovery/JWKS cache topology;
4. provider key rotation and emergency disablement procedure;
5. local logout and optional RP-initiated logout contract;
6. frontend login integration after the Next.js migration boundary is ready.

## 27. Acceptance decision

**GO for the isolated TypeScript OIDC protocol foundation.** The required
provider-neutral foundation, real protocol library path, PKCE, state/nonce,
browser binding, issuer/audience/signature validation, exact identity mapping,
session rotation, stable errors, audit, and regression evidence are present.

**NO-GO for production.** The risks and open decisions above must be resolved
before enabling a real provider or exposing federation through production
routing.

## 28. Next milestone

The next authorized milestone should be **M6.3d.2h.4 — narrow SP-initiated
SAML implementation**, only after an independent review of this OIDC report.
It must reuse the same provider, transaction, browser-correlation, identity,
secret, audit, and error invariants. Authentik end-to-end validation remains a
later isolated milestone.

## 29. Stop condition

M6.3d.2h.3 stops here. No SAML work, Authentik work, frontend login, Flask
rewrite, production migration, deployment, commit, or push was performed.
