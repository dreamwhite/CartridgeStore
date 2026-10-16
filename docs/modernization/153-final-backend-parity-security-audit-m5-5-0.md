# PRG32 Cartridge Store — M5.5.0 Final Backend Parity, Compatibility and Security Audit

Date: 2026-10-16  
Scope: source audit, isolated validation and read-only infrastructure observation  
Decision: **NO-GO for backend freeze, operational cutover and Flask retirement**

## 1. Executive summary

M5.5.0 was completed as an audit-only milestone. The repository was inspected
without changing application behavior, operational data, Docker services,
Traefik, Authentik, routing or deployment state. The existing Fastify and
Next.js checks pass, the Python compatibility suite passes, the CLI checks pass,
and the public local Dream endpoints were observed with low-volume,
non-mutating requests.

The audit did not establish complete Flask-to-Fastify behavioral parity. The
legacy providerless federation aliases, several legacy HTML/admin/info routes,
Flask session continuity and some operational side effects remain either
intentionally modernized or not proven equivalent. Firmware-facing catalog,
discovery and binary-download contracts are source-compatible and covered by
existing differential evidence, but no physical firmware or QEMU network run
was performed in this audit.

The material security blocker is the public WebSocket resource-control gap:
the application bounds individual frame size and room membership, but does not
bound unjoined connections, connections per source, identity connections,
message/join rates, idle lifetime, or slow-consumer backpressure. This is a
high-priority denial-of-service risk and applies to both the Fastify target and
the transitional Flask implementation. It must be addressed in M5.5.1 before
the backend can be frozen.

Final decision:

- Functional parity: incomplete.
- Firmware compatibility: source-level compatibility verified; runtime
  compatibility incomplete.
- Security baseline: remediation required.
- Backend freeze: blocked.
- Operational cutover: no-go.
- Flask retirement: no-go.

## 2. Repository and runtime inventory

The repository contains four relevant runtime surfaces:

| Surface | Location | Role | Audit result |
| --- | --- | --- | --- |
| Transitional Flask | `app.py`, `cartridge_store/`, `templates/`, `static/` | Existing public-compatible application and firmware APIs | Inspected; not changed |
| Fastify | `backend/src/` | Candidate TypeScript backend and canonical storage owner | Typecheck, lint, tests and build pass |
| Next.js | `frontend/src/` | Candidate frontend and browser application | Typecheck, lint, tests and production build pass |
| CLI | `cli/src/` | Administrative/disposable operational tooling | Check and integration tests pass |

Relevant deployment definitions:

- `docker-compose.yml`: transitional development/profiles topology, including
  Flask and compatibility/auth-writer services.
- `deploy/standalone/compose.yaml`: final two-service candidate with Fastify,
  Next.js and an optional isolated backup-scheduler profile.
- `deploy/candidate/compose.yaml`: candidate/pre-cutover topology.
- `deploy/operational/compose.yaml`: Dream operational template using external
  networks; it is not the local running target and requires operator secrets.
- `backend/Dockerfile.operational` and `frontend/Dockerfile.operational`:
  multi-stage Node 24/bookworm-slim images with slim runtime stages.

The intended public names remain:

- `store.prg32.dream.test`
- `api.prg32.dream.test`
- `sso.dream.test`

The current local operational candidate observed during the audit consists of
healthy Fastify, Next.js and backup-scheduler containers. A separate legacy
development stack still contains unhealthy `auth-writer` and
`auth-writer-edge-proxy` containers; this was observed read-only and was not
restarted or removed.

## 3. Audit methodology

The audit used:

1. Source inspection of Flask, Fastify, Next.js, CLI and the sibling
   `../PRG32` repository.
2. Inspection of route registration, schemas, error handlers, storage access,
   authentication guards, rate limiters and WebSocket handlers.
3. Existing compatibility, differential, security, storage and operational
   test evidence from the repository.
4. Fresh local checks listed in section 20.
5. Read-only Docker Compose configuration validation.
6. Low-volume public DNS, TLS and unauthenticated GET/HEAD observations only.

No credentials, cookies, tokens, private provider configuration or sensitive
response headers were collected. No POST, PUT, PATCH or DELETE request was
sent to a public host. No public stress or vulnerability scan was performed.

The worktree was already dirty at the start of the audit. Existing changes
were preserved. The sibling `../PRG32` repository was inspected read-only and
was not modified. M5.5.0 added only this report.

## 4. Complete Flask route inventory

The canonical source inventory is `backend/src/readiness/functional-parity.ts`
(`FLASK_ROUTE_PATHS`), cross-checked against the Flask route modules and
templates. The complete normalized path inventory is:

### HTML, setup, administration and discovery

`/`, `/games/:game_id`, `/publish`, `/setup`, `/setup/logo`,
`/setup/favicon`, `/static/custom/:filename`, `/admin/users`,
`/admin/users/:user_id`, `/admin/users/:user_id/role`,
`/admin/users/:user_id/groups`, `/admin/users/:user_id/delete`,
`/admin/groups`, `/admin/groups/:group_id`, `/admin/groups/:group_id/delete`,
`/admin/roles`, `/admin/cartridges`,
`/admin/cartridges/:game_id/:version`,
`/admin/cartridges/:game_id/:version/delete`, `/admin/backup`,
`/admin/backup/download`, `/admin/backup/restore`, `/manifest.webmanifest`,
`/.well-known/prg32-store.json`, `/api`, `/scores`, `/stats`,
`/users/:username`, `/users/:username/runs`,
`/users/:username/runs/:run_id`.

### Catalog and publishing APIs

`GET /api/me`, `GET /api/games`, `GET /api/games/:game_id`,
`GET /api/games/:game_id/icon`, `GET /api/games/:game_id/screenshot`,
`GET /api/games/:game_id/colophon`,
`GET /api/games/:game_id/download`, `POST /api/publish`, and
`POST /api/publish/bundle`.

The catalog query contract includes optional version and architecture
selection, bounded listing parameters and the existing `ok`, `games` and
pagination fields. Download and media responses preserve binary/media bytes
and content types.

### Authentication and federation

`GET /auth/csrf`, `POST /auth/bootstrap`, `POST /auth/register`,
`POST /auth/register/complete`, `POST /auth/login`, `POST /auth/logout`,
`GET /auth/me`, `GET /auth/tokens`, token update/revoke paths,
`GET /auth/oidc/login`, `GET /auth/oidc/callback`,
`GET /auth/saml/login`, `POST /auth/saml/acs`, and
`GET /auth/saml/metadata`.

The providerless OIDC/SAML paths are legacy Flask routes. Fastify uses the
provider-specific API paths documented in section 6.

### Scores, metrics, submissions and multiplayer

`GET/POST /api/scores`, `GET/POST /api/submissions`,
`GET /api/submissions/:submission_id`, verification/rejection submission
paths, `GET /api/metrics`, `POST /api/runs`,
`POST /api/metrics/batch`, `POST /api/runs/:run_id/finish`,
`GET /api/runs`, `GET /api/runs/:run_id`,
`GET /api/runs/:run_id/samples.csv`,
`GET /api/runs/:run_id/report.md`,
`GET /api/stats/downloads`, `GET /api/stats/downloads/:game_id`,
`GET /api/stats/scores`, `GET /api/stats/runs`,
`GET /api/multiplayer/status`, and `GET/WS /api/multiplayer`.

## 5. Complete Fastify route inventory

Fastify route ownership is distributed across the following modules. Each
module was inspected directly; method and payload behavior is defined by its
schemas and route handlers rather than by a generic compatibility shim.

| Module | Registered route families and methods |
| --- | --- |
| `catalog/routes.ts` | `GET /.well-known/prg32-store.json`; catalog listing/detail, media, colophon and download routes under `/api/games` |
| `auth/routes.ts` | `/auth/*` and `/api/auth/*` local auth aliases for CSRF, login, register, completion, logout, current user and tokens; `/api/me`; test-only email inspection when enabled |
| `webauthn-routes.ts` | `/auth/passkeys` and `/api/auth/passkeys` registration, authentication and credential-management flows |
| `oidc/routes.ts` | `GET /api/auth/providers`; provider-specific OIDC login and callback routes |
| `saml/routes.ts` | provider-specific SAML login, ACS and metadata routes |
| `federation/admin-routes.ts` | federation reauthentication, provider list/create/update/delete, identities, link challenges and identity linking under `/api/admin/federation/*` |
| `submission/routes.ts` | `POST /publish`, `POST /api/publish`, `POST /api/publish/bundle`; canonical submission routes and resubmission paths |
| `review/routes.ts` | review queue, detail, approval, rejection and publication workflow APIs |
| `admin/routes.ts` | `/api/admin/catalog/moderation`, `/api/admin/cartridges`, `/api/admin/users`, `/api/admin/groups`, `/api/admin/roles`, `/api/admin/audit`, token administration and related mutations |
| `settings/routes.ts` | `GET/PATCH /api/admin/settings`, SMTP test connection/message, and application asset routes |
| `setup/routes.ts` | `GET /api/setup/status`, `GET /api/setup/progress`, `POST /api/setup/complete` |
| `profile/routes.ts` | profile and user-facing account APIs |
| `metrics/routes.ts` | `GET /api/metrics`, run list/detail and metrics-compatible ingestion/finish/export paths |
| `scores/routes.ts` | `GET/POST /api/scores` and scoreboard-compatible score operations |
| `stats/routes.ts` | `GET /api/stats/runs` and the download/score aggregate statistics families |
| `multiplayer/routes.ts` | `GET /api/multiplayer/status`, `GET /api/multiplayer` information response, and `WS /api/multiplayer` |
| `backup/routes.ts` | `GET /admin/backup/download`, `POST /admin/backup/restore`, only when explicitly enabled |
| `storage-v2/draft-routes.ts` | `GET/POST /api/drafts` and canonical draft/submission preparation paths |
| application bootstrap | `GET /health`, `GET /ready`; test-only federation/email routes when test configuration is enabled |

Fastify also has administrative APIs absent from Flask, including canonical
settings/assets, provider administration, federation identity linking,
canonical drafts and readiness endpoints. These are additions, not evidence
that every legacy HTML route has been replaced.

## 6. Flask-to-Fastify parity matrix

| Capability | Flask | Fastify | Evidence/disposition |
| --- | --- | --- | --- |
| Catalog listing/detail | Public Flask APIs | Canonical Fastify catalog APIs | Migrated and verified by existing M5.2d differential cases |
| Version/architecture selection | Query parameters and legacy metadata | Same compatibility fields plus canonical storage-v2 reads | Existing compatibility fixtures and source inspection pass |
| Media and binary downloads | Flask filesystem responses | Fastify object-backed responses | Existing byte-for-byte differential evidence passes |
| Discovery document | `/.well-known/prg32-store.json` | Same path and ABI fields | Source and public GET checks pass |
| Publishing | Flask `/api/publish` and bundle | Fastify submission/publish handlers | Functional workflow exists; public ownership and crash/cutover behavior remain unproven |
| Review/publication | Flask editor/admin routes | Fastify review/admin/canonical publication routes | Canonical workflow tests pass; complete legacy HTML parity is not established |
| Scores | `/api/scores` | `/api/scores` | Contract and backend tests pass |
| Runs/metrics | `/api/runs`, batch, finish, detail, CSV, Markdown | Same compatible API families | Firmware-compatible ingestion and authorization tests pass |
| Public statistics | Flask `/api/stats/*` and HTML | Fastify stats APIs plus Next `/stats` | Aggregate responses exist; full browser/ownership parity not proven |
| Multiplayer | Flask-Sock `/api/multiplayer` | Fastify WebSocket `/api/multiplayer` | Protocol differential and integration tests pass; resource controls are insufficient |
| Local sessions | Flask signed session cookie | Encrypted/signed Fastify session cookie | Intentional incompatibility; controlled re-login required |
| Providerless OIDC/SAML aliases | `/auth/oidc/*`, `/auth/saml/*` | Provider-specific `/api/auth/{oidc,saml}/:providerId/*` | Compatibility risk; frontend uses modern provider-specific API |
| WebAuthn | Legacy/transition behavior | Fastify passkey lifecycle | Fastify tests pass; no production credential transition claimed |
| Admin/settings | Flask HTML/admin endpoints | Fastify permissioned admin APIs | New canonical surface; legacy HTML compatibility remains incomplete |
| Backup UI | Flask `/admin/backup*` | Fastify download/restore only when enabled; scheduler is offline | Operational scheduler uses encrypted backup-v4; public backup is disabled in operational mode |
| Setup | Flask setup pages | Fastify setup APIs and Next setup UI | Local tests/build pass; real deployment identity still operator-controlled |

The matrix is deliberately not marked “complete parity”: route existence does
not prove matching redirects, cookies, HTML semantics, side effects, headers,
error text, or ownership under cutover.

## 7. Firmware and host compatibility

The sibling repository `../PRG32` was inspected read-only. Relevant source and
documentation are:

- `prg32/store/store_api.py`: mDNS discovery of
  `_prg32store._tcp.local.`, discovery document GET, catalog listing and
  streamed binary download.
- `prg32/store/utils.py`: `prg32-metadata-1.0` and
  `prg32-store-discovery-1.0` constants.
- `prg32/cartridge_format.py`: `esp32c6` and `qemu` architecture profiles.
- `docs/cartridge_store/cartridge_store.md`: catalog, detail, media, colophon
  and download contracts.
- `docs/cartridge_store/score_api.md`: score API contract.
- `components/prg32/prg32_metrics.c`: `/api/runs`,
  `/api/metrics/batch` and run-finish requests; firmware batch size is bounded
  to 64.

The compatibility constants and behaviors are aligned:

| Contract | Required value/behavior | Result |
| --- | --- | --- |
| mDNS service | `_prg32store._tcp.local.` | Source-compatible |
| Default port | `5080` | Source-compatible/configurable |
| Discovery ABI | `prg32-store-discovery-1.0` | Preserved |
| Metadata ABI | `prg32-metadata-1.0` | Preserved |
| Colophon ABI | `prg32-colophon-1.0` | Preserved in server compatibility paths |
| Architectures | `esp32c6`, `qemu` | Preserved |
| Catalog response | Accepts current object response and firmware list/items compatibility | Existing fixtures/differential tests pass |
| Download | `/api/games/<id>/download` with architecture/version query | Source-compatible and byte-tested |
| Metrics | Runs, bounded batch, finish | Contract-compatible tests pass |

No ESP32 board, QEMU network test, or real mDNS network discovery was run in
this audit. The sibling repository also documents that firmware does not
currently scan `.well-known` automatically; host Python discovery uses mDNS.
Therefore source compatibility is verified, but runtime firmware compatibility
remains incomplete.

## 8. Multiplayer security assessment

### Verified behavior

- WebSocket frames are bounded by `@fastify/websocket` to 64 KiB.
- Room membership is bounded by the configured maximum peer count (default 8).
- Authentication is evaluated on connection when a token is supplied and
  authenticated role is required for joining protected rooms.
- Anonymous sockets may connect before joining; this preserves the existing
  protocol behavior.
- Peer state fields and signature parsing are bounded.
- Invalid JSON and malformed state messages receive stable protocol errors.
- Closed/erroring peers are removed and send exceptions trigger cleanup.
- Existing real-upgrade, anonymous/invalid-authentication, room-cap and Flask
  differential tests pass.

### Finding M550-WS-001 — HIGH — incomplete public resource controls

`backend/src/multiplayer/routes.ts` and `backend/src/multiplayer/hub.ts` do not
provide all of the following controls:

- global concurrent connection cap;
- per-IP/source connection cap;
- per-identity connection cap;
- cap for sockets that never join a room;
- message-rate or join-attempt limits;
- idle timeout and application heartbeat/ping-pong policy;
- bounded send queue/backpressure policy or slow-consumer eviction;
- bounded CPU/fanout work per source.

The 64 KiB frame limit and room peer limit do not prevent a client from
opening many unjoined sockets or repeatedly sending valid messages. The same
semantic gap exists in the Flask transitional relay. Impact is memory, CPU,
connection-table and broadcast resource exhaustion. This is the primary
backend-freeze blocker.

Required follow-up is M5.5.1: define measured limits, trusted source-key
semantics, heartbeat/idle behavior, queue policy and adversarial regression
tests. Do not silently infer limits from the current room cap.

## 9. HTTP and rate-limit assessment

Fastify has a local authentication limiter keyed by `request.ip`, with a
default five requests per sixty seconds. OIDC/SAML pending transactions and
score limiter state have bounded structures. Metrics and upload/body limits
are configured in `backend/src/config/env.ts` and multipart registration.

### Finding M550-RATE-001 — MEDIUM — authentication limiter eviction gap

The local auth `RateLimiter` stores per-key state in a `Map` and expires a key
when that same key is next used. It has no global maximum entry count or
periodic eviction. A high-cardinality stream of distinct source keys can grow
the map indefinitely. This is particularly relevant if source IP attribution
can be influenced by a trusted forwarded-header path.

Recommended remediation: bounded entry count, deterministic eviction,
metrics for evictions and regression tests for high-cardinality keys. This is
assigned to M5.5.1.

### Finding M550-PROXY-001 — MEDIUM, conditional — trusted proxy attribution

Fastify accepts a boolean `trustProxy`. It is false by default and canonical
operational mode requires it to be explicitly enabled because Traefik is the
intended ingress. The boolean alone does not express an allowlist of trusted
proxy hops or prove that forwarded headers are overwritten by the edge. If an
untrusted peer can reach Fastify directly, it may spoof source attribution,
affecting rate limits and audit identity.

The current standalone candidate has no direct published host port and the
external-edge model is intentional, so this is not reported as an observed
exploitation. The deployment gate must ensure Fastify is reachable only from
the trusted proxy network and that the proxy canonicalizes forwarded headers.

### Other HTTP observations

- Authentication, setup, admin, federation, publishing, review and token
  mutations use session/RBAC/CSRF or bearer-compatible guards as appropriate.
- Metrics ingestion has bounded payload, sample and database-work limits.
- Multipart upload limits include archive bytes, entry count, entry size,
  aggregate size, compression ratio and manifest/path safety in the relevant
  parser/storage-v2 paths.
- No application-level rate limits were found for catalog search/listing,
  downloads, uploads or the complete WebSocket surface. Edge quotas and
  request timeouts were not independently proven. These are defense-in-depth
  gaps, not fabricated incidents; measure and address them during M5.5.1.
- Fastify does not explicitly set every connection/header timeout in
  `app.ts`; Node/Fastify and the edge provide defaults. The exact production
  effective values require deployment verification.

## 10. Authentication and RBAC assessment

The Fastify authentication boundary contains:

- encrypted/signed `prg32_ts_session` cookies with rotation and invalidation;
- browser CSRF protection for cookie-authenticated mutations;
- bearer token support for firmware/API callers;
- local login, registration, bootstrap, password reset and logout;
- permission guards and resource-owner checks;
- admin/federation recent-reauthentication checks;
- OIDC PKCE, state, nonce, issuer-bound endpoint and replay protections;
- SAML response-size, signature, issuer, audience, destination, recipient,
  `InResponseTo` and replay checks;
- WebAuthn RP/origin/challenge/credential lifecycle checks;
- provider administration restricted to administrative permissions.

No raw password, API-token, session-cookie or encryption-key material was
included in this report or collected by the audit.

The important compatibility limitation is intentional: Flask and Fastify
session cookies are not interchangeable. A cutover requires a controlled
re-login/session continuity decision. It cannot be represented as seamless
cookie compatibility without a separately authorized migration design.

## 11. Upload and download security

The audit verified the following controls by source inspection and existing
tests:

- bounded multipart file count, fields and parts;
- bounded archive bytes, entry count, individual and aggregate uncompressed
  size, compression ratio and manifest size;
- duplicate filename and unsafe path/traversal rejection;
- no public promotion of unreferenced objects;
- content addressed/object-hash checks for canonical artifacts and media;
- private staging boundaries for pending submissions;
- download routes resolve canonical object references rather than accepting
  arbitrary filesystem paths;
- binary compatibility tests compare exact bytes.

No evidence was found that an unreferenced filesystem file becomes a
published cartridge. Existing adversarial upload/storage tests are part of the
passing backend suite. A separate public upload or download stress test was
not run and was outside the audit authorization.

## 12. SQLite and filesystem security

SQLite remains authoritative for canonical metadata and relationships while
immutable artifact/media/site objects remain on the filesystem. The source
inspection found:

- canonical operational mode rejects legacy database/storage fallbacks;
- schema creation/migration behavior remains idempotent where applicable;
- object keys are validated and resolved within the configured root;
- object kind, size and SHA-256 relationships are checked by storage-v2
  audits;
- symlink/path traversal and corrupt-object cases are covered by existing
  storage/backup tests;
- foreign-key and integrity verification are part of canonical audits and
  restore verification;
- backup and scheduler paths are not enabled as public HTTP behavior in the
  operational two-service candidate.

The audit did not modify any operational SQLite database, object root or
volume.

## 13. Backup and scheduler assessment

The existing encrypted backup-v4 and restore implementation was inspected,
including the isolated backup scheduler profile and prior M5.4.18–M5.4.24
evidence. The operational scheduler uses a read-only canonical source bind,
an explicit backup destination and key registry, no network, a read-only
container filesystem, dropped capabilities and no-new-privileges. Retention
is bounded by the existing operational policy; automatic deletion behavior was
not changed by this audit.

The observed local operational scheduler was healthy and the prior M5.4.24
acceptance recorded seven protected backup archives with no anomaly. This was
read-only observation, not a new backup or retention mutation in M5.5.0.

The standalone and Dream operational Compose definitions intentionally have
different variable namespaces and the Dream template does not include the
local scheduler service. This is safe only when the operator selects the
correct deployment contract and supplies its required secrets. Both configs
fail closed when required secret variables are absent; this behavior was
observed during validation.

## 14. Setup Wizard and deployment assessment

Fastify exposes setup status/progress/completion APIs and the Next.js
application exposes setup/admin/federation surfaces. Setup completion and
administrative mutations are guarded by the intended bootstrap/session/CSRF
and permission rules in source and tests.

The candidate deployment has a clear two-service runtime hypothesis:

1. Next.js frontend service.
2. Fastify backend service.

The backup scheduler is an optional operational worker, not a public request
service. Traefik and the generic OIDC/SAML provider remain external. The
deployment templates preserve `store.prg32.dream.test` and
`api.prg32.dream.test` and rely on the external `dream_edge`/`dream_mail`
networks where specified.

Operational readiness is not claimed because identity/session continuity,
write ownership, edge header policy, firmware runtime verification and
cutover/rollback authorization remain open.

## 15. Existing CLI assessment

The CLI was inspected as a bounded administrative/disposable tool. Its
integration suite exercises the real CLI image over private Docker DNS with
synthetic HTTPS; no real public service credentials were used. The CLI check
passed all five test files and nine tests, including the Docker-network case.

The CLI should remain an operator-facing tool with explicit target roots,
authorization and secret injection. It must not become an implicit public API
or bypass Fastify authorization. The long-running integration test was not
repeated during report generation because it had already completed
successfully in this audit.

## 16. Security findings

| ID | Severity | Area | Status | Required action |
| --- | --- | --- | --- | --- |
| M550-WS-001 | HIGH | WebSocket admission, flood control, heartbeat and backpressure | Open | M5.5.1; do not freeze backend |
| M550-RATE-001 | MEDIUM | Auth limiter high-cardinality state | Open | Bound map/eviction and test in M5.5.1 |
| M550-PROXY-001 | MEDIUM conditional | Forwarded IP trust and edge reachability | Deployment gate | Enforce trusted network and canonicalized headers; verify at edge |
| M550-HTTP-001 | MEDIUM/LOW | Missing app-level quotas/timeouts for selected public surfaces | Open defense-in-depth | Measure and set explicit limits in M5.5.1 |
| M550-PARITY-001 | MEDIUM | Providerless federation URL aliases absent in Fastify | Compatibility risk | Decide redirect/compatibility boundary in M5.5.2 |
| M550-PARITY-002 | MEDIUM/LOW | Legacy HTML/info/admin/backup landing routes not all represented by Fastify | Legacy/deprecation risk | Complete route ownership matrix and compatibility decision in M5.5.2 |
| M550-DEPLOY-001 | MEDIUM operational | Standalone/Dream config contracts differ and require explicit secret mapping | Open pre-cutover gate | Validate one selected deployment contract with operator env |

Positive findings:

- no raw underlying exception strings were found in the general Fastify error
  response path; stable envelopes are used while details are logged server-side;
- backup/storage/object integrity controls are bounded and tested;
- authentication and CSRF/RBAC guards are present on the inspected mutation
  surfaces;
- canonical operational configuration rejects unsafe legacy storage fallbacks;
- no production data or routing was changed.

## 17. Functional discrepancies and compatibility risks

The following are not silently classified as parity:

1. **Session continuity:** Flask and Fastify cookies differ. Controlled
   re-login or an explicitly designed migration is required.
2. **Federation aliases:** Flask has providerless `/auth/oidc/*` and
   `/auth/saml/*`; Fastify exposes provider-specific API paths. The Next.js
   frontend uses the modern paths, but old external callers are not guaranteed
   compatibility.
3. **Legacy HTML routes:** Fastify does not reproduce every Flask HTML/admin,
   `/api` informational, `/manifest.webmanifest`, static custom asset or
   `/admin/backup` landing route. Next.js has replacements for many user
   surfaces, but URL/redirect/header/side-effect equivalence is not fully
   proven.
4. **Ownership and write side effects:** Existing differential evidence covers
   disposable reads and selected workflows, not the complete live cutover
   write stream, telemetry, publication, multiplayer and download event
   ownership transition.
5. **Firmware runtime:** source contract alignment is strong, but no physical
   board/QEMU network execution was performed here.

## 18. Missing test coverage

The existing tests are substantial but do not close these gaps:

- per-IP/global/identity/unjoined WebSocket connection limits;
- WebSocket message/join flood controls;
- heartbeat, idle timeout and slow-consumer/backpressure behavior;
- proxy-header spoofing through the actual Traefik edge;
- high-cardinality auth limiter eviction;
- complete legacy URL redirect/response/header matrix;
- Flask-cookie to Fastify-session continuity decision;
- real firmware or QEMU network discovery/download/metrics execution;
- operational SMTP/Authentik behavior with operator-owned configuration;
- full post-cutover write reconciliation and rollback data-loss handling.

No public stress test is recommended as a substitute for these bounded,
isolated regression tests.

## 19. Prioritized remediation plan

### M5.5.1 — Multiplayer and HTTP hardening

Implement and test bounded connection admission, per-source and per-identity
limits, unjoined-socket limits, message/join quotas, heartbeat/idle expiry,
slow-consumer eviction and bounded fanout work. Bound auth limiter state and
define explicit HTTP quotas/timeouts where edge policy is insufficient. Verify
trusted proxy behavior with an isolated edge fixture.

### M5.5.2 — Parity and firmware closure

Complete the route/contract matrix, decide compatibility handling for legacy
providerless federation and HTML/info routes, document session continuity and
run firmware/QEMU network checks where available. Reconcile every remaining
write/side-effect difference before freeze.

### M5.5.3 — Adversarial regression

Add bounded security regression tests for the above controls, malformed
WebSocket frames, high-cardinality source keys, forwarded headers and complete
upload/download boundaries. Keep all fixtures synthetic.

### M5.5.4 — `manage.sh`

Only after the security and parity gates close, consolidate operator commands
without changing deployment behavior or hiding required authorization.

### M5.5.5 — Freeze/readiness

Re-run the complete matrix, selected deployment configuration, edge/federation
acceptance, backup/restore evidence and rollback rehearsal. Obtain explicit
operational cutover authorization separately.

## 20. Validation results

All commands below were executed in the repository worktree. Node commands
used Node.js 24.20.0 selected with `nvm use 24`.

| Command | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 56 files, 279 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0/Turbopack, 38 static pages |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests; includes private Docker-network integration |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `docker compose -f deploy/operational/compose.yaml config --quiet` | BLOCKED/FAIL-CLOSED — required operator secrets/paths absent |
| `docker compose -f deploy/standalone/compose.yaml config --quiet` | BLOCKED/FAIL-CLOSED — required operator secrets/paths absent |
| `git diff --check` | PASS |

The two blocked Compose validations are expected when run without the
operator-provided secret environment; they are not reported as application
test failures. No operational Compose command, container restart, volume
operation or cleanup command was executed.

Read-only public observations:

- DNS for `store.prg32.dream.test`, `api.prg32.dream.test` and
  `sso.dream.test` resolved locally to `127.0.0.1`.
- Store root, discovery, catalog listing and API discovery/catalog endpoints
  returned successful unauthenticated GET responses.
- Multiplayer status returned a successful unauthenticated GET response.
- `api.prg32.dream.test/health` returned HTTP 404; `/health` is a Fastify
  internal route and is not currently exposed by that API edge mapping. This
  needs an explicit operational decision, not an invented compatibility claim.
- All three TLS chains verified with `openssl s_client -verify_return_error`
  against the local mkcert development CA/certificates.
- `sso.dream.test/` returned the expected public HTTP 302 observation.

Firmware hardware/QEMU tests: **NOT RUN** in this audit; no compatible board
or authorized runtime fixture was used. Public authenticated browser flows,
OIDC login and SAML login: **NOT RUN**; the audit explicitly prohibited real
authentication/session creation.

## 21. Backend Freeze blockers

Backend freeze remains blocked by:

1. M550-WS-001 HIGH WebSocket resource-control gap.
2. Unresolved complete legacy-to-Fastify route/behavior parity.
3. Explicit Flask/Fastify session continuity decision.
4. Missing firmware/QEMU runtime evidence.
5. Edge proxy trust and effective timeout/quota verification.
6. Operational write ownership and rollback reconciliation gates.

Passing unit/build checks do not override these architectural and security
gates.

## 22. Final decision

`M550_AUDIT_COMPLETED`

`M550_FUNCTIONAL_PARITY_INCOMPLETE`

`M550_FIRMWARE_COMPATIBILITY_INCOMPLETE`

`M550_SECURITY_REMEDIATION_REQUIRED`

`M550_BACKEND_FREEZE_BLOCKED`

`OPERATIONAL_CUTOVER_NO_GO`

`FLASK_RETIREMENT_NO_GO`

M5.5.0 is complete as an audit. It is not authorization for M5.5.1
implementation, operational cutover, Flask removal, deployment changes or
public ownership transfer. The next authorized milestone should be M5.5.1,
focused first on the WebSocket and HTTP resource-control findings.
