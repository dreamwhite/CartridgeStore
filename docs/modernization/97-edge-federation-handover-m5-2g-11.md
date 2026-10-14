# PRG32 Cartridge Store — M5.2g.11 Edge, Federation & Handover Readiness

Date: 2026-10-14  
Decision: **PARTIAL GO for isolated edge/federation readiness; NO-GO for operational cutover and Flask retirement**

## 1. Executive result

M5.2g.11 adds and verifies a disposable HTTPS reverse-proxy fixture around
Fastify, a synthetic generic OIDC provider, a synthetic generic SAML provider,
and WebSocket upgrade forwarding. The protocol tests use real TCP/TLS/HTTP and
the real Fastify federation services; they do not use Authentik-specific code.

The isolated results are positive:

- TLS termination and forwarded-header overwrite passed.
- Public discovery and multiplayer URLs use the configured public origin.
- OIDC authorization-code, PKCE, nonce, JWKS and session callback passed.
- SAML signed HTTP-Redirect/POST callback passed.
- Secure session rotation, logout, CSRF and legacy-cookie rejection passed.
- WebSocket upgrade over synthetic TLS passed for valid and invalid tokens.
- The two-service Docker candidate (`fastify`, `next`) reached healthy state and
  exposed canonical readiness through the Next proxy.
- Fastify failure produced a controlled Next proxy failure and recovered after
  restart; no Flask fallback occurred.

This is not operational readiness. The real Dream Traefik instance,
`sso.dream.test`, real certificates, DNS, production secrets, two-origin
browser behavior and live ownership transfer were intentionally not contacted
or modified. Operational cutover and Flask retirement therefore remain
**NO-GO**.

## 2. Scope and safety

The work stayed inside disposable test resources and source/test code. No
operational Compose service, Dockerfile, Traefik configuration, Authentik
configuration, DNS record, operational database, immutable object root,
backup, bind mount, secret or `../PRG32` file was changed.

The candidate containers were stopped after verification. No commit, push,
deployment, Docker prune, volume prune or operational container shutdown was
performed.

The permanent application topology remains exactly two services:

1. Fastify.
2. Next.js.

The reverse proxy and synthetic identity providers used here are test
infrastructure only.

## 3. Source review

Reviewed the actual candidate Compose file, candidate Dockerfiles, Next
candidate rewrites, Fastify app/configuration, authentication/session code,
OIDC/SAML services and routes, canonical storage-v2, backup-v4, readiness,
rollback, migration and differential tests, plus the M5.2g.8–M5.2g.10
reports. The companion `../PRG32` worktree was inspected read-only and was not
modified.

The existing implementation already had protocol-level OIDC/SAML tests, but
those tests injected requests directly into Fastify. M5.2g.11 adds the missing
real disposable TLS-edge path in `backend/tests/edge-federation.test.ts`.

## 4. Isolated edge architecture

The new fixture creates:

- a disposable self-signed certificate with OpenSSL;
- a local HTTPS edge that terminates TLS;
- a real Fastify HTTP upstream;
- a synthetic OIDC HTTP provider in test mode;
- a synthetic SAML HTTPS provider using a generated RSA signing key;
- a raw HTTP upgrade bridge for WebSocket traffic.

The edge overwrites client-controlled `Host` and `X-Forwarded-*` values with
the configured synthetic public origin before forwarding to Fastify. Fastify
does not enable arbitrary forwarded-header trust. Public URL construction uses
the explicit configured origin, not an untrusted incoming header.

The Docker candidate was independently built and run with only `fastify` and
`next`. It used a disposable bind-mounted canonical root, private Compose
networking, Node 24 multi-stage images and no operational network.

## 5. TLS and forwarded-header tests

Passed by the new edge test:

- HTTPS TLS termination.
- Forwarded protocol/host/port replacement at the edge.
- Malicious `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto` values do not
  appear in discovery or multiplayer metadata.
- Discovery remains on the configured HTTPS origin.
- WebSocket traffic is upgraded through the same TLS edge.

The backend intentionally does not trust arbitrary forwarded headers. A future
production deployment may enable a narrowly defined trusted proxy boundary,
but that deployment-specific CIDR/container-network decision is not made here.

## 6. Public routing contract

The isolated edge exercised Fastify API, authentication, discovery and
WebSocket routes. The Docker candidate separately exercised the Next proxy and
canonical `/ready` path.

Verified public URL behavior:

- `https://<synthetic-origin>/api` for API discovery.
- `https://<synthetic-origin>/` for the browser return origin.
- `wss://<synthetic-origin>/api/multiplayer` for multiplayer.
- No internal `fastify:5090`, localhost or insecure HTTP URL in discovery.

The real split deployment origins remain unverified:

- `https://store.prg32.dream.test`
- `https://api.prg32.dream.test`

No production routing was changed.

## 7. Cookie/session continuity

The edge callback test verified:

- Fastify uses `prg32_ts_session`; legacy Flask-style `session` cookies are not
  accepted.
- The federated callback rotates into a new session.
- The issued session cookie is `Secure`, `HttpOnly`, `SameSite=Lax` in the
  disposable HTTPS configuration.
- OIDC correlation is consumed once.
- SAML correlation is consumed once.
- CSRF is available only through the active session and protects logout.
- Logout invalidates the Fastify session.

No operational Flask cookie was decoded or migrated. A controlled re-login is
the cutover policy: users must authenticate again after the Fastify session
boundary becomes authoritative.

The browser behavior across the actual `store.prg32.dream.test` and
`api.prg32.dream.test` origins is not verified because public DNS and the real
edge were out of scope. Cookie-domain and browser policy must be accepted as an
operational deployment gate.

## 8. OIDC end-to-end tests

The synthetic provider implements discovery, authorization redirect, code
issuance, PKCE challenge verification, token exchange, RS256 ID-token signing,
JWKS publication, issuer/audience claims, nonce claims and callback redirect.

The real flow passed through the HTTPS edge:

1. Fastify issued state, nonce, PKCE and correlation material.
2. The synthetic provider authorized the request and redirected to the edge.
3. Fastify exchanged the code and validated the signed ID token/JWKS.
4. The linked external identity resolved to the disposable local user.
5. Fastify rotated the session and redirected to the configured browser origin.
6. An authenticated `/auth/me` request succeeded through the edge.
7. Logout and CSRF invalidated the session.

Existing OIDC tests additionally cover invalid state/correlation, replay,
invalid signatures, unknown keys, signing-key retirement, unknown identities,
disabled accounts, identity collisions and missing confidential secrets.

This is generic OIDC evidence only. It is not evidence of live Authentik or
`sso.dream.test` interoperability.

## 9. SAML end-to-end tests

The synthetic HTTPS provider receives the generated HTTP-Redirect
`AuthnRequest`, extracts the request ID, creates a signed response and returns
a browser-style HTTP-POST form to the edge ACS endpoint.

The real flow passed:

1. SP metadata and login initiation.
2. HTTP-Redirect request to the synthetic IdP.
3. Signed response and signed assertion generation.
4. HTTPS edge POST to the Fastify ACS route.
5. Issuer, audience, destination, recipient, temporal and signature checks.
6. External identity resolution and session rotation.
7. Redirect to the configured browser origin.

Existing SAML tests additionally cover tampering, missing correlation, replay,
certificate overlap/retirement, wrong issuer/audience/destination/recipient,
expired assertions and controlled auto-provisioning.

XML signature validation uses the existing `xml-crypto`/`@node-saml/node-saml`
implementation. No custom SAML cryptography was introduced.

This is generic SAML evidence only. It is not evidence of live Authentik or
`sso.dream.test` interoperability.

## 10. Cross-origin federation

The synthetic flow proved configured public-origin redirects, Secure cookies,
CSRF continuity and authenticated requests after OIDC/SAML callbacks. The
fixture intentionally used one synthetic TLS origin so it did not need DNS or
host-file changes.

The actual dual-origin browser contract, including browser cookie behavior
between `store.prg32.dream.test` and `api.prg32.dream.test`, remains
**NOT_VERIFIED**. Curl-like HTTP checks must not be treated as a substitute for
that browser gate.

## 11. WebSocket edge tests

The disposable edge performed a real HTTP Upgrade to Fastify. Tests passed
for:

- WSS handshake through synthetic TLS.
- Bearer-token authentication.
- Room join and welcome message.
- Invalid token rejection.
- Direct Fastify ownership of the WebSocket route.
- No dependency on Next rewrites for the upgrade.

The multiplayer metadata route now uses the configured public origin when one
is present, preventing internal-host URL leakage. Real Traefik upgrade
behavior remains unverified.

## 12. Discovery/public URL tests

The discovery ABI remained `prg32-store-discovery-1.0`. Existing metadata and
colophon ABI constants were not changed. The synthetic result advertised only
the configured HTTPS/WSS origin and preserved cartridge, publish, submission,
scores, metrics and multiplayer service paths.

mDNS remained disabled in the candidate and was not enabled on the test LAN.
The `_prg32store._tcp.local.` operational advertisement is therefore not
claimed as verified.

## 13. Legacy reconciliation

The existing disposable M5.2b inventory, M5.2c migration and M5.2d
differential gates were executed through the full backend suite:

- legacy inventory and independent verification passed;
- migration and resumability tests passed;
- differential compatibility passed with the existing 22-case parity gate;
- source immutability and corrupted-object refusal passed.

No operational legacy source was opened.

## 14. Delta reconciliation

No unsafe incremental live-delta importer was invented. The repository's
verified safe alternative remains a complete disposable re-import after a
writer freeze, followed by independent differential verification and object
hash validation.

The existing migration/differential tests pass this alternative, but a new
operational post-snapshot delta against real Flask data was not run and is not
authorized. The cutover plan must include downtime for the final quiesced
snapshot and full re-import, or separately authorize implementation of a
bounded delta protocol.

## 15. Writer handover rehearsal

The existing disposable rollback state machine passed with:

`legacy_authoritative → target_prepared → target_verified → target_authoritative → target_failed → target_relinquished → legacy_restored → completed`

It rejects simultaneous legacy and canonical writers and requires the
canonical writer to be relinquished before legacy ownership is restored. This
is a synthetic state-machine rehearsal, not a live ownership switch.

The canonical candidate itself also acquired and released its writer lease
across container lifecycle tests. No Flask process was started or stopped for
the rehearsal.

## 16. Backup/restore handover

The existing encrypted backup-v4 and canonical restore suites passed. Coverage
includes:

- external-key-provider boundary;
- authenticated encryption and tamper rejection;
- wrong, missing and retired-key rejection;
- archive truncation and interruption;
- writer-quiescence requirement;
- fresh-root restore;
- non-ready interrupted targets;
- exact object/staging preservation;
- canonical integrity and foreign-key verification.

No production key, backup or storage root was accessed. Operational RPO/RTO,
retention, key custody and restore authorization remain deployment decisions.

## 17. Rollback scenarios

The safe policy is:

| Scenario | Decision |
| --- | --- |
| Before writer handover | Abort and discard disposable canonical target. Flask remains authoritative. |
| After handover, before public traffic | Stop/quiesce Fastify, verify no writes, restore previous owner only after explicit authorization. |
| After public traffic with no new writes | Possible only after writer freeze and integrity verification. |
| After public traffic with new writes | Requires reconciliation/export or explicit accepted data loss; restart-only rollback is unsafe. |
| Partial publication | Preserve journal/recovery evidence and reconcile before ownership change. |
| Session boundary change | Require controlled re-login; do not migrate opaque Flask cookies. |
| Score/metrics ingestion after cutover | Reconcile accepted writes before any rollback decision. |

No reverse migration was implemented.

## 18. Observability

Verified or reused safe observability includes:

- `/health` process liveness;
- `/ready` database, canonical storage and writer-lease status;
- structured Fastify request/error logs without raw exception leakage;
- federation rejection codes and request IDs;
- canonical publication/recovery state;
- backup and restore structured error codes;
- WebSocket authentication and lifecycle behavior.

External monitoring was not activated. Future alerts should cover readiness
loss, writer-lease contention, recovery-required state, federation callback
failure rate, API/HTTP 5xx, download failure rate, telemetry rejection,
WebSocket upgrade failure and backup verification failure.

## 19. Operational configuration

The candidate verified:

- Node.js 24.20.0;
- non-root runtime users in multi-stage images;
- read-only application containers with disposable `/tmp` tmpfs;
- canonical SQLite and immutable-object bind-mounted root;
- mDNS disabled;
- explicit public-origin configuration;
- private two-service Compose network;
- Fastify writer lease and graceful shutdown;
- Next readiness proxy to Fastify.

Still requiring operational values and approval:

- `store.prg32.dream.test` and `api.prg32.dream.test` DNS/routing;
- external TLS certificate and trusted proxy network boundary;
- external secret/key injection and key registry custody;
- generic OIDC/SAML client/provider metadata at `sso.dream.test`;
- cookie-domain and SameSite policy for the actual browser topology;
- backup retention/RPO/RTO and restore authorization;
- mDNS interface/ownership decision.

No live `.env` or production secret file was generated.

## 20. Failure injection

Passed in isolated or existing disposable suites:

- Fastify unavailable behind Next: HTTP 500, no Flask fallback.
- Fastify restart: canonical readiness and proxy behavior recovered.
- Writer lease contention: backup/candidate writer refused ambiguous access.
- Invalid OIDC signatures, unknown/retired keys and identity failures.
- Invalid/replayed OIDC transactions.
- Invalid/tampered/replayed SAML responses and assertions.
- Invalid WebSocket token.
- Corrupt/truncated/unsafe backup archives.
- Interrupted backup and restore phases.
- Missing/corrupt immutable objects.
- Interrupted publication/review recovery.

Not run against real infrastructure by design:

- Traefik unavailable;
- real provider unavailable;
- real public TLS certificate failure;
- public DNS or mDNS failure.

## 21. Security findings

No unresolved isolated P0 issue was found. The implementation preserves:

- explicit public-origin URL construction;
- no arbitrary forwarded-header trust;
- Secure/HttpOnly session cookies;
- state, nonce, PKCE and replay protection;
- signed OIDC/JWKS and SAML assertion validation;
- strict return-path validation;
- CSRF protection for browser writes;
- token-based WebSocket authorization;
- single-writer lease boundaries;
- secret-free public errors and logs.

Operational P1 risks remain because real edge/provider/cookie configuration
has not been verified. These are readiness blockers, not silently accepted
isolated security failures.

## 22. Operational gate matrix

| Gate | Current result | Evidence | Remaining blocker | Required operational verification |
| --- | --- | --- | --- | --- |
| Canonical data completeness | GO disposable / PARTIAL operational | M5.2c/M5.2d migration and differential suites | No final legacy snapshot | Quiesced source inventory and acceptance manifest |
| Immutable object completeness | GO disposable / PARTIAL operational | Object hash and restore suites | No operational object inventory | Final source/object hash audit |
| Single-writer ownership | GO disposable / PARTIAL operational | Writer lease and rollback state machine | No live owner switch | Freeze legacy and acquire Fastify lease |
| Publication/review continuity | GO disposable / PARTIAL operational | Canonical workflow/review/recovery tests | No final data rehearsal | Verify pending/recovery rows before handover |
| Authentication/session continuity | PARTIAL | Secure session rotation/logout and legacy-cookie rejection | Two-origin browser policy | Browser verification and re-login communication |
| Generic OIDC callback | GO synthetic / NO-GO live | Real HTTPS-edge callback with synthetic provider | No real provider | Verify generic provider metadata and callback |
| Generic SAML callback | GO synthetic / NO-GO live | Signed HTTPS-edge HTTP-POST callback | No real provider | Verify metadata, certificates and ACS at provider |
| Public TLS | GO synthetic / NO-GO live | Disposable TLS termination | No real certificate/edge | Validate Dream TLS termination |
| Public Traefik routing | NOT_VERIFIED | Real Traefik intentionally untouched | No edge access authorized | Verify routes in controlled deployment |
| Public WebSocket upgrade | GO synthetic / NO-GO live | WSS edge upgrade and relay | No Traefik test | Verify external upgrade and reconnect behavior |
| Firmware compatibility | GO disposable | Existing contract/differential suites | No live firmware endpoint | Run approved firmware smoke test |
| LAN mDNS | NOT_VERIFIED | Candidate mDNS disabled | Ownership/interface unresolved | Decide and test one advertiser |
| Download telemetry | GO disposable / PARTIAL operational | Canonical telemetry tests | No live write reconciliation | Reconcile final telemetry delta |
| Scores | GO disposable / PARTIAL operational | Score compatibility tests | No live write reconciliation | Freeze/reconcile score writes |
| Runs/metrics | GO disposable / PARTIAL operational | Firmware-shaped ingestion and limits | No live write reconciliation | Freeze/reconcile metrics writes |
| Backup encryption | GO disposable | Backup-v4 suite | Key custody/RPO not operationalized | Verify external key custody and retention |
| Key custody | PARTIAL | Provider-neutral key registry boundary | No production KMS/HSM decision | Approve injection, rotation and recovery |
| Restore readiness | GO disposable / PARTIAL operational | Fresh-root and interruption tests | No operational restore rehearsal | Authorized restore drill |
| Monitoring | PARTIAL | Readiness/log/error signals | No external alerting | Configure alerts and runbooks |
| Rollback policy | GO policy / NO-GO execution | Single-writer rehearsal and documented data-loss window | No live rollback authorization | Approve freeze/reconciliation policy |
| Legacy retirement | NO-GO | Retirement inventory and candidate runtime scan | Flask still owns operational behavior | Close all ownership and rollback gates |

Synthetic provider or proxy evidence is not classified as proof of live
Authentik, Dream Traefik or public DNS interoperability.

## 23. Legacy retirement readiness

The final runtime candidate contains only Fastify and Next.js, but legacy code
must remain available for migration, differential verification, historical
audit and rollback. The following cannot yet be removed:

- Flask and Python runtime;
- Jinja templates and legacy static assets;
- legacy SQLite/index readers;
- legacy publication/telemetry writers;
- transitional Compose services and Dockerfiles;
- migration/differential tooling;
- compatibility environment variables needed before cutover approval.

Removal becomes eligible only after operational ownership, reconciliation,
backup/restore, external edge/provider acceptance and rollback-window gates are
closed.

## 24. Files changed

Changes made for M5.2g.11:

- `backend/src/catalog/routes.ts` — use configured public origin for discovery
  and host construction whenever configured, not only in candidate mode.
- `backend/src/multiplayer/routes.ts` — use configured public origin for
  WebSocket metadata while preserving legacy fallback behavior.
- `backend/src/app.ts` — pass the configured federation/frontend public origin
  to the multiplayer route registration.
- `backend/tests/edge-federation.test.ts` — new disposable HTTPS edge,
  synthetic OIDC/SAML and WSS integration tests.
- `docs/modernization/97-edge-federation-handover-m5-2g-11.md` — this report.

Previously dirty files from earlier milestones were preserved and not
reformatted or reset.

## 25. Tests added

`backend/tests/edge-federation.test.ts` adds four repeatable tests:

1. TLS edge, hostile forwarded headers and public discovery.
2. OIDC callback, session rotation, CSRF logout and legacy-cookie rejection.
3. SAML signed callback through HTTPS edge.
4. WSS upgrade, valid token join and invalid token rejection.

The fixture creates all keys, certificates, providers, users and databases in
temporary directories. No test artifact is committed as evidence.

## 26. Full verification results

Executed with Node 24 selected through `nvm use 24`:

| Command | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 46 files, 229 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 21 files, 59 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |
| `pnpm --dir backend exec vitest run tests/edge-federation.test.ts --reporter=verbose` | PASS — 1 file, 4 tests |
| Candidate Docker build (`fastify`, `next`) | PASS — Node 24 multi-stage images |
| Candidate Docker readiness and Next proxy discovery | PASS — both containers healthy |
| Candidate Fastify stop/restart injection | PASS — 500 during outage, readiness recovered |

The initial candidate probe was attempted before Next completed its health
start period and received a connection reset. It was not counted as a pass;
the subsequent health-gated run passed.

## 27. Remaining P0/P1 blockers

No isolated P0 blocker remains.

Operational P1 blockers:

1. Real Dream Traefik routing, TLS and WebSocket upgrade are not verified.
2. Real generic OIDC/SAML callbacks through `sso.dream.test` are not verified.
3. Actual two-origin browser cookie/CSRF/session behavior is not verified.
4. Final legacy snapshot and post-freeze reconciliation are not executed.
5. Production key custody, backup retention and RPO/RTO are not approved.
6. Live single-writer ownership transfer and rollback window are not executed.
7. mDNS ownership and production interface behavior remain undecided.

## 28. Recommended next milestone

The next milestone should be a separately authorized **operational preflight
only** against a controlled staging edge/provider configuration. It should
verify the exact `store.prg32.dream.test`, `api.prg32.dream.test` and
`sso.dream.test` contracts, browser cookie behavior, Traefik WebSocket
upgrade, provider callbacks, secret/key injection, monitoring and the final
quiesced reconciliation manifest.

It must still stop short of production cutover until those gates are reviewed.

## 29. GO/NO-GO decisions

| Decision | Result |
| --- | --- |
| M5.2g.11 isolated edge/federation readiness | **PARTIAL GO** — required synthetic edge and protocol paths pass; two-origin/live provider gates remain open |
| Operational cutover | **NO-GO** |
| Flask retirement | **NO-GO** |
| Contact or modification of real Authentik/Traefik | **NOT AUTHORIZED and not performed** |
| M5.2g.12 / M6.3d.2h.12 | **NOT STARTED** |
