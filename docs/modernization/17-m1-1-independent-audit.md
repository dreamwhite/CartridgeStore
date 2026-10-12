# M1.1 — Independent Security Audit

**Audit date:** 2026-10-12
**Scope:** read-only review of the M1.1 implementation and its compatibility with a future Fastify/TypeScript backend
**Status:** M1.1 is substantially implemented, but it is not a complete security closure gate.

## Executive verdict

The M1.1 changes remove the deterministic default administrator, add one-time bootstrap protection, introduce CSRF protection for cookie-authenticated mutations, preserve bearer-token paths used by firmware, and make the session cookie policy explicit. The implementation is supported by the existing Python and frontend checks.

The result is **acceptable as a controlled transition baseline**, not as evidence that every production security risk is closed. Three kinds of evidence remain incomplete:

1. bootstrap serialization was reviewed in code and covered by sequential tests, but no runtime test starts competing bootstrap requests;
2. browser-origin and external identity-provider flows were not exercised end-to-end;
3. several pre-existing resource-exhaustion, privacy, backup, rate-limiting, and error-handling risks remain open and must not be deferred merely because Flask is planned for replacement.

The main M1.1 compatibility observation is that the local login/bootstrap paths mark the Flask session as permanent, while the OIDC and SAML adapters currently establish a session without explicitly setting `session.permanent = True`. This does not silently prove that OIDC/SAML is broken, but it gives those flows different expiration semantics and requires an explicit compatibility decision and provider-level test before cutover.

## Evidence reviewed

The audit reviewed the M1.1 source changes, tests, existing modernization documents, route registration, API contract document, Docker configuration, and the current SQLite/file-storage implementation.

The following final checks were recorded for the implementation under review:

| Check | Result |
|---|---|
| `python3 -m py_compile app.py cartridge_store/*.py` | Passed |
| `PATH="$PWD/.venv313/bin:$PATH" SECRET_KEY=m1-1-test pytest -q` | 57 passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 2 files, 5 tests passed; existing Vitest config-loader warning only |
| `FLASK_PROXY_TARGET=http://flask:5080 npm run build` | Passed |
| `git diff --check` | Passed |
| `PRG32_DEV_SECRET_KEY=m1-1-dev-secret docker compose --profile dev config` | Passed |
| `SECRET_KEY=m1-1-prod docker compose --profile prod config` | Passed |
| `docker build -t prg32-cartridge-store:m1-1-local .` | Passed |
| Frontend multistage Docker build with the frontend Dockerfile and proxy build arguments | Passed |

These results are implementation evidence, not a claim that external OIDC/SAML providers, a real browser under the Traefik hostnames, or concurrent production traffic were tested.

## M1.1 acceptance criteria

| Criterion | Finding | Evidence and confidence |
|---|---|---|
| Bootstrap cannot be reused | **Verified for sequential use.** The endpoint rejects a completed bootstrap and the completion marker is persisted in `store_settings`. | Security tests cover first success, invalid/missing secret, validation errors, and repeat attempts. High confidence for the tested path. |
| Concurrent bootstrap cannot create multiple administrators | **Atomicity is present; runtime concurrency is unverified.** The endpoint uses `BEGIN IMMEDIATE`, checks the marker under the write lock, inserts the user, and commits the marker in the same transaction. | Code review supports the invariant. No test launches competing requests against the same database. Medium confidence until a concurrent stress test is added. |
| Existing administrators are unaffected | **Verified for the tested fixture.** Initialization no longer creates or changes an administrator, and bootstrap creates a new administrator rather than mutating existing rows. | Existing-admin test and schema review. High confidence for the normal path. |
| Cookie settings are explicit and documented | **Verified.** HttpOnly, SameSite, Secure, lifetime, and refresh behavior are configured explicitly. Development Compose disables Secure for local HTTP; production enables it. | Application config, Compose files, and M1.1 documentation. High confidence for configuration selection; deployment proxy behavior remains a separate concern. |
| Expiration and logout behavior | **Mostly verified.** Local login/bootstrap sessions are permanent and use the configured lifetime; logout clears the session. | Route and test review. OIDC/SAML do not explicitly set permanence and therefore need a separate decision. |
| CSRF covers cookie-authenticated mutations | **Verified by enforcement logic and unit tests; browser E2E unverified.** The global request hook requires a matching session token for authenticated cookie mutations and covers anonymous login/registration endpoints explicitly. | 57-test run plus route review. High confidence for Flask test-client behavior; no cross-origin browser test was run. |
| Bearer compatibility | **Verified for the existing token paths.** Valid bearer requests bypass cookie CSRF because they are not authenticated by a browser session. Token hashes and legacy token lookup remain supported. | Auth implementation and API tests. High confidence for covered endpoints. |
| Anonymous firmware compatibility | **Verified by contract and route review.** Anonymous metrics/run ingestion remains possible, while browser sessions cannot silently mutate those routes without CSRF. | API contract review and tests. Product privacy policy for anonymous run visibility remains unresolved. |
| Authentication and role boundaries | **Verified for tested local paths; provider paths need manual verification.** Admin/editor/player requirements remain enforced by route decorators/helpers. | Route and test review. High confidence for local auth; medium for external identity mapping. |
| Public API contracts | **No intentional breaking shape change found.** Existing paths, identifiers, firmware ABI names, binary responses, and bearer behavior are preserved. | `13-api-contracts.md`, route/source review, and tests. High confidence for reviewed contracts; parity snapshots should still be generated for migration. |
| OIDC/SAML are not silently broken by cookie policy | **Not fully verified.** SameSite=Lax is compatible with an OIDC top-level GET callback in the normal flow. SAML ACS is a POST and external IdP/proxy behavior was not tested. The adapters also do not explicitly mark the session permanent. | Static inspection only. Low-to-medium confidence until provider fixtures/manual tests exist. |

## Detailed findings

### Bootstrap and account initialization

The insecure deterministic `admin/password` initialization path is removed. A fresh database does not receive an administrator implicitly. Bootstrap requires the configured `PRG32_BOOTSTRAP_TOKEN`, validates the submitted account, and uses a write transaction to serialize the “check marker → create admin → mark complete” sequence.

The transaction is the right protection against two requests both observing an incomplete state. The remaining gap is evidence: the test suite does not create two simultaneous requests against one SQLite database and assert that exactly one receives `201` and the other receives `409`. This is a test gap, not a finding that the transaction is absent.

Existing administrator rows, role values, group memberships, and identifiers are not rewritten by application initialization. The bootstrap path creates an additional administrator and adds the expected group membership.

### Cookie sessions, logout, and CSRF

The explicit policy is:

- HttpOnly enabled;
- SameSite configurable, defaulting to `Lax`;
- Secure enabled in production and disabled for the local HTTP development profile;
- permanent lifetime controlled by `PRG32_SESSION_LIFETIME_HOURS`;
- refresh on request enabled;
- logout clears the session;
- `/auth/csrf` returns a no-store token for frontend clients;
- mutating requests from a valid cookie session require the token in a supported header or form field.

The global enforcement hook is important because it covers mutations added by separate Flask route modules, including publishing, review, settings, user/token administration, scores, and browser-origin metrics mutations. Valid bearer-only requests retain the firmware path. WebSocket authentication is protocol/token based and is not a Flask form mutation, so it is evaluated separately by the multiplayer protocol.

This was verified with Flask tests and source review, not with a real browser using `store.prg32.dream.test` through Traefik. The remaining browser test should exercise a legitimate same-origin form, a missing token, a mismatched token, and a bearer request without a browser session.

### OIDC and SAML compatibility

The cookie default `Lax` is normally suitable for an OIDC callback delivered as a top-level GET. Authlib also stores flow state in the Flask session, so the callback must be tested with the real callback host, scheme, and cookie attributes. SAML ACS is a POST callback; the current adapter does not appear to require an authenticated pre-existing session to accept the assertion, but the full IdP flow was not exercised.

Both external adapters establish `user_id` and `role` but do not explicitly set `session.permanent = True`, unlike local login and bootstrap. This means the implementation should not claim identical expiration semantics across providers. Before backend cutover, choose one of:

- set permanence consistently and add provider integration tests;
- intentionally keep provider sessions browser-session scoped and document that policy;
- migrate providers to the new backend as a separate controlled milestone.

There is also a deployment concern independent of SameSite: redirect/discovery URLs use the request scheme, while Flask has not been changed to blindly trust forwarded headers. Behind TLS-terminating Traefik, the externally visible HTTPS scheme must be supplied through a reviewed trusted-proxy arrangement or configured explicitly. This was not changed during M1.1 and was not validated with an external IdP.

### Firmware and public API compatibility

The review found no intentional removal of the documented routes or identifiers. In particular, the following remain in scope for compatibility testing:

- catalog, detail, icon, screenshot, colophon, and binary download routes;
- publish and review workflows;
- scores and scoreboard responses;
- metrics run creation, sample ingestion, finish, list, detail, CSV, and report routes;
- multiplayer status and the `/api/multiplayer` WebSocket;
- discovery at `/.well-known/prg32-store.json`.

Firmware bearer tokens continue to be recognized without requiring a browser CSRF token. Anonymous run/metrics ingestion remains available. This is compatible with existing firmware behavior, but it also makes the privacy policy for anonymous run exports a first-class migration decision.

### Risks that remain open after M1.1

These are not cleared by the authentication work:

| Risk | Current observation | Classification |
|---|---|---|
| Metrics export ownership | CSV and report routes check existence more broadly than the detail route; anonymous runs are currently viewable under the existing policy. | Immediate policy/security decision |
| ZIP/resource exhaustion | Bundle uploads have a request cap, but there are no robust entry-count, per-entry, total-uncompressed, compression-ratio, or duplicate-name limits. | Immediate hardening |
| Metrics sample exhaustion | A JSON body can contain an unbounded sample list within the request limit. | Immediate hardening |
| Backup exposure and restore safety | Admin-only access exists, but archives contain sensitive configuration values and restore is destructive without a staged rollback point. | Immediate hardening before production backup use |
| Rate limiting | Login, registration, publish, score, metrics, downloads, and WebSocket activity have no application-level limiter. | Immediate if internet-reachable; otherwise transitional with edge enforcement |
| Error leakage | Some API error handlers serialize exception text. | Immediate hardening |
| Security headers | Traefik has some header middleware, but the complete browser policy and CSP/SVG decision are not demonstrated by tests. | Immediate deployment verification |
| Theme/custom SVG trust boundary | Trusted-admin content is rendered as safe HTML/static content. | Transitional, or immediate if untrusted administrators are possible |
| Dependency findings | Production dependency findings were not reported by the final audit as a runtime blocker; the development ESLint chain still has npm audit findings. | Transitional maintenance |
| WebSocket resource controls | Peer cap exists, but message size/rate and connection abuse controls are limited. | Transitional hardening |

## Audit conclusion

M1.1 can be accepted as a security foundation for controlled migration work, with the following qualification: it is not a release gate for an internet-exposed service until the immediate findings above are either fixed or explicitly mitigated at a trusted edge with evidence.

The migration should not add a second set of uncontrolled writers while these risks are being addressed. Flask remains the only write authority until the TypeScript backend has contract, data, authentication, and rollback evidence.
