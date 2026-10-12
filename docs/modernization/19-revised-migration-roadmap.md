# Revised Migration Roadmap

**Revision date:** 2026-10-12
**Goal:** replace Flask/Python with a TypeScript backend serving the Next.js frontend while preserving PRG32 firmware and Cartridge Store contracts
**Operating rule:** Flask remains authoritative until an explicit domain cutover; no uncontrolled dual writes.

## Roadmap principles

- Preserve public HTTP, binary, WebSocket, discovery, identifier, and ABI contracts before improving internal design.
- Keep SQLite and the filesystem as the existing data boundaries until parity is demonstrated.
- Use TypeScript/Fastify for new backend work; do not invest in broad Flask refactoring that will be discarded.
- Fix an exposed vulnerability in Flask when it is the only active writer or public implementation; migration plans do not waive current security obligations.
- Introduce Drizzle as a reviewed typed mapping first, not as an automatic schema migration engine.
- Prefer read-only parallel operation, then one controlled writer cutover per domain.
- Make every milestone reversible through routing, feature flags, database backups, or a documented maintenance window.

## Current position

M0 frontend foundations and M1.1 authentication/CSRF hardening are implemented and tested. M1.1 is **conditionally accepted** as a migration baseline. It is not a declaration that the service is ready for unrestricted public exposure: ZIP and metrics resource limits, export privacy, backup safety, rate limiting, error leakage, and complete proxy/security-header verification remain open.

## Milestone plan

### M1.2 — Immediate security containment in the active Flask service

**Purpose:** close risks that remain exploitable before TypeScript has parity.

**Dependencies:** M1.1 baseline; decision on anonymous metrics/export visibility.

**Scope:**

- bound ZIP entry count, per-entry size, total uncompressed size, compression ratio, duplicate names, and manifest size;
- bound metrics sample count and transaction work;
- make CSV/report ownership rules explicit and enforce them consistently;
- stage backup restore, validate archive limits/ABI/schema, and create a pre-restore recovery point;
- redact or encrypt sensitive configuration values in portable backups;
- add rate limits at the trusted Traefik edge and/or Flask boundary for login, registration, publish, scores, metrics, downloads, and WebSocket connection/message activity;
- replace exception-text API responses with stable generic errors and server-side correlation logging;
- verify security headers, CSP, SVG policy, and forwarded-scheme behavior for the actual `store.prg32.dream.test` and `api.prg32.dream.test` origins;
- add concurrent bootstrap, browser-origin CSRF, and external-provider fixture coverage where possible.

**Acceptance criteria:**

- malicious ZIP and oversized metrics fixtures fail before unbounded materialization;
- export tests prove the chosen anonymous/owner/admin policy;
- restore failure at each extraction/replace boundary leaves the original data recoverable;
- rate-limit tests show bounded behavior and a clear trusted-client exception policy for firmware;
- API errors no longer expose raw internal exception strings;
- a browser test exercises same-origin success and missing/mismatched CSRF;
- the bootstrap race test yields exactly one successful administrator creation;
- OIDC/SAML test fixtures or a documented manual test prove callback cookie behavior.

**Risks:** over-restricting legitimate cartridge bundles or firmware ingestion; provider-specific callback differences; rate limiting behind proxies.

**Rollback:** retain previous limits behind configuration, restore the previous edge middleware configuration, and revert only the containment code if it blocks a known-compatible fixture. Do not roll back authentication hardening to recover from an unrelated limit issue.

### M2 — TypeScript backend foundation, read-only by design

**Purpose:** establish the Fastify/TypeScript runtime without competing with Flask writes.

**Dependencies:** M1.2 decisions; supported Node.js LTS; existing Compose/Traefik network.

**Scope:**

- Fastify application bootstrap, strict TypeScript, typed configuration, structured logging, error boundary, health endpoint;
- Drizzle mapping over an isolated copy of the existing SQLite schema;
- SQLite connection policy with foreign keys, busy handling, and read-only mode;
- request/response schemas and contract fixture harness;
- multistage production image and development Compose service compatible with the existing `dream_edge` network;
- no publication, auth mutation, metrics, score, admin, or backup writes.

**Acceptance criteria:**

- the service starts with the same required environment model and listens on the intended internal port;
- `docker compose` resolves the development profile and Traefik routes without modifying production routing;
- TypeScript typecheck, lint, unit tests, and production build pass;
- the service can open a copied SQLite database read-only and report schema details;
- a contract harness can compare status, content type, JSON fields, and binary bytes against Flask fixtures.

**Risks:** accidental write access, driver differences, dependency inflation, misleading health checks.

**Rollback:** remove the read-only service from the development profile or route it away at Traefik; Flask remains untouched and remains the only writer.

### M2.1 — Data and serialization compatibility gate

**Purpose:** prove that the target can represent current data before serving it.

**Dependencies:** M2.

**Scope:** schema snapshot, Drizzle definitions, JSON serialization fixtures, timestamp/number behavior, password-hash and token-hash fixtures, foreign-key/index comparison, and filesystem/index inventory.

**Acceptance criteria:**

- every current table, column, default, unique constraint, index, and foreign-key action has a reviewed mapping;
- no migration is generated or applied without an approved diff;
- password verifier recognizes all isolated Werkzeug hash formats found in fixtures;
- token hashing and role/group reads match Flask;
- catalog index entries, binary hashes, and architecture names match;
- representative query outputs are byte/type compatible where the public contract requires it.

**Risks:** undocumented legacy rows or hash formats; SQLite driver coercion; JSON null/omission differences.

**Rollback:** keep the mapping read-only and discard the target schema definition; no production data change is needed.

### M3 — Read-only discovery, catalog, and binary parity

**Purpose:** migrate the lowest-risk public read slice first.

**Dependencies:** M2 and M2.1.

**Scope:**

- `/.well-known/prg32-store.json`;
- catalog listing and detail routes;
- icon, screenshot, colophon, and `.prg32` downloads;
- filesystem path validation, ETags/cache behavior, hashes, and architecture selection;
- optional shadow comparison where the same request is sampled against Flask without changing the response.

**Acceptance criteria:**

- all documented catalog and download routes match Flask fixtures for valid, missing, malformed, and architecture-specific requests;
- binary responses are byte-identical and preserve content disposition/content type;
- discovery ABI, port, service type, and identifiers remain unchanged;
- no TypeScript request writes SQLite or the filesystem;
- firmware compatibility tests pass against the target endpoint.

**Risks:** index/file divergence, path traversal, cache differences, wrong external host/scheme.

**Rollback:** Traefik routes return to Flask; target remains available only for comparison.

## M3 implementation evidence

M3 read-only API parity is implemented and documented in
`docs/modernization/23-m3-read-only-api-parity-report.md`.

Completed evidence:

- Fastify read-only routes for discovery, catalog listing/detail, version and
  architecture selection, icon, screenshot, colophon, and binary download;
- Flask-generated differential oracle covering JSON envelopes, ordering,
  pagination, media bytes, binary SHA-256, headers, `206` ranges, `304`
  conditionals, missing resources, and invalid parameters;
- filesystem safety checks for identifiers, traversal, symlink escapes,
  regular files, and no mutation;
- streamed full/ranged downloads with stable content disposition and
  Werkzeug-compatible cache validators;
- explicit documentation of Flask's `download_events` write and Fastify's
  intentional no-write difference during parallel operation;
- Fastify backend typecheck, lint, tests, production build, Compose config,
  and diff checks passed during implementation.

M3 is accepted for the isolated read-only scope. Flask remains the public
API owner and sole writer. No public routing cutover, authentication,
publishing, metrics, scores, or WebSocket migration was started.

### M4 — Authentication, sessions, tokens, and authorization parity

**Purpose:** move browser and firmware authentication deliberately.

**Dependencies:** M1.2 security decisions; M2.1 hash/token fixtures; M3 read-only routing.

**Scope:** local login/register, one-time bootstrap compatibility, logout, CSRF,
roles/groups, API tokens, and explicit session-cookie cutover policy. OIDC and
SAML are explicitly removed from the TypeScript target by the approved
architecture decision; their existing Flask adapters remain operational and
untouched until Flask is retired.

**Required decision before implementation:** use a new TypeScript cookie with controlled re-login, implement a reviewed Flask-cookie compatibility decoder, or retain Flask auth temporarily. The default recommendation is a new cookie and planned re-login; bearer tokens should not be invalidated.

**Acceptance criteria:**

- local hashes and API tokens authenticate exactly as documented;
- no bootstrap reuse and concurrent bootstrap tests pass;
- cookie attributes, expiry, logout, CSRF, and trusted proxy/scheme tests pass through Traefik;
- role boundaries match Flask for every protected route;
- the approved local-auth-only scope is documented, including the Flask-only
  fate of external-provider accounts and configuration;
- anonymous firmware requests retain their documented behavior;
- failed authentication does not leak secrets or internal errors.

**Risks:** forced logout, cookie domain/scheme mismatch, incomplete legacy token support, and Flask-only external-provider accounts during the transition.

**Rollback:** keep Flask auth as the active route owner and restore the previous cookie name/domain; do not delete users, hashes, or tokens.

#### M4.2 status

M4.2 is retired and must not be started. The former provider-integration phase
is removed from the TypeScript migration plan: no OIDC or SAML implementation,
callback migration, or provider dependency will be added to Fastify. Existing
Flask OIDC/SAML adapters and related configuration are not removed or changed
by this decision. Accounts identified by `external_provider` remain a
Flask-owned compatibility concern until the final Flask retirement decision.

M4.1 is implemented as an isolated local-auth foundation. M4.3 is the security
and compatibility audit documented in
`docs/modernization/25-m4-3-authentication-security-audit.md`.

#### M4.4 status

M4.4 remediates the confirmed auth-writer isolation bypass. The writer now
requires an existing disposable root and database, rejects symlink indirection
inside that root, rejects SQLite URI syntax, compares device/inode identity
against the operational database, validates SQLite sidecars, and rechecks
identity after opening. Synthetic regression coverage is green for path
aliases, symlinks, hardlinks, invalid targets, missing schema, disabled mode,
and valid disposable databases.

M4.4 does not make a public or operational write cutover safe by itself. The
remaining driver TOCTOU limitation, mount provenance, session/rate-limit
design, and route-level authorization gates remain prerequisites.

#### M4.5 status

M4.5 establishes a dedicated disposable writer boundary in the single Compose
file. The explicit `writer-init` profile provisions synthetic databases and
filesystem volumes; the `writer` profile uses separate named volumes, a
read-only shadow mount, loopback-only port 5091, a read-only root filesystem,
dropped capabilities, and `no-new-privileges`. It has no Traefik labels, edge
network, operational database mount, or operational cartridge mount.

M4.5 also adds minimum 32-character session/bootstrap secret validation and
constant-time CSRF/bootstrap comparisons. The Flask publishing/review
authorization matrix is documented without implementing publishing. Runtime
smoke evidence passed using temporary synthetic volumes.

M5 remains explicitly rejected. The residual `better-sqlite3` path-opening
TOCTOU limitation, deployment mount trust, process-local sessions/rate
limiting, route-level TypeScript authorization, and publishing reconciliation
gates remain open.

### M5 — Publishing, review, and cartridge storage writes

**Purpose:** move the first filesystem/SQLite write domain only after consistency is testable.

**Dependencies:** M3 parity; M4 authorization; M4.4 write-isolation gate; M4.5 trusted writer boundary; M1.2 ZIP limits; reconciliation and backup procedure.

**Scope:** publish preparation, pending submissions, admin/editor review, index replacement, binary storage, PRG32 parsing, and compensating recovery.

**Acceptance criteria:**

- valid and invalid PRG32 golden vectors match Flask decisions;
- ZIP limits are enforced before extraction/materialization;
- publication is idempotent and has an operation/reconciliation record;
- kill-point tests cover DB commit, file replacement, index replacement, and process restart;
- a consistency command detects orphaned files, missing index entries, and stale pending directories;
- exactly one service is authorized to write this domain during the canary;
- backup and rollback restore a known-good fixture.

**Risks:** partial publication, index corruption, large or malicious archives, reviewer authorization drift.

**Rollback:** stop TypeScript publication, quiesce writes, run reconciliation, restore the pre-cutover backup if required, and route publishing/review back to Flask only after confirming no uncommitted target writes remain.

#### M5.1 status

M5.1 is implemented in `docs/modernization/28-m5-1-publishing-foundation-report.md`.
The Fastify writer profile now accepts the three existing submission routes,
preserves Flask's pending response fields, validates bounded ZIP bundles and
PRG32 binaries, derives ownership from the authenticated principal, and stages
artifacts below the disposable `pending/<submission_id>/` root. SQLite mutations
use a transaction with filesystem compensation; no catalog index or published
cartridge directory is written.

M5.1 is isolated-only. Flask remains the sole operational writer. Review,
approval, publication, deletion, reconciliation, and public routing remain
outside this milestone. M5.2 requires the explicit consistency and recovery
gates listed above plus the prerequisites recorded in the M5.1 report.

#### M5.2a status

M5.2a is implemented and documented in
`docs/modernization/33-m5-2a-publication-consistency-report.md` for the
disposable TypeScript writer only. The filesystem journal records durable
publication operations and expected/prior hashes; staged files and the
Flask-compatible `index.json` are verified before replacement; operation-
specific backups support explicit compensation; and a read-only reconciliation
command detects orphaned, missing, mismatched, stale, conflicting, and
incomplete artifacts. Tests include an actual terminated child process followed
by fresh-process resume.

Flask remains the sole operational writer. No operational schema migration,
public Fastify publication/review endpoint, production mount, deployment, or
M5.2b work was started. The journal is intentionally filesystem-based in the
disposable root, avoiding an unapproved production schema change. M5.2a is
accepted only for this isolated consistency/recovery scope; publication/review
parity remains a separately authorized gate.

#### M5.A status

M5.A cross-repository API, data-model, and architecture audit is complete in
`docs/modernization/29-m5-a-cross-repository-architecture-audit.md`, with the
traceability matrix in `30-m5-a-client-api-traceability.md`, SQLite assessment
in `31-m5-a-sqlite-schema-assessment.md`, and sequencing plan in
`32-m5-a-data-architecture-optimization-plan.md`.

The audit used the local companion repository `../PRG32` at revision
`ff53e81fa5825771a25a09af34f165e75378f1aa` on `main`. It confirms active
firmware/tool consumers for catalog listing, binary downloads, bundle publishing,
conditional scores, and conditional metrics. It also records that the PRG32
score client currently sends no Bearer header while Flask protects `POST
/api/scores`; this must be resolved before scores migration.

M5.A does not implement or authorize M5.2. The current filesystem/index catalog
authority, Flask sole-writer rule, and M5.1 disposable writer boundary remain in
force. The publication operation/reconciliation boundary, kill-point recovery
evidence, schema fingerprint, retention policy, and score-auth decision are
explicit prerequisites. No future milestone is marked complete.

### M6 — Scores, metrics, statistics, and administrative operations

**Purpose:** migrate the remaining HTTP data domains with their explicit privacy and resource policies.

**Dependencies:** M4 authorization; M5 backup/reconciliation; M1.2 metrics/export/rate-limit decisions.

**Scope:** scores/scoreboard, run and sample ingestion, CSV/report exports, download statistics, user/admin operations, settings, and backup/restore.

**Acceptance criteria:**

- firmware score and metrics clients pass compatibility fixtures;
- sample counts, request sizes, transaction duration, and export sizes are bounded;
- anonymous run visibility and ownership are enforced according to the approved policy;
- score ordering and numeric representation match existing responses;
- admin operations preserve role boundaries and audit-relevant identifiers;
- backup archives are validated, secrets protected, and restore is staged/recoverable;
- no domain has Flask and TypeScript writers active simultaneously.

**Risks:** high-volume ingestion, privacy regression, backup secret exposure, report formatting drift.

**Rollback:** route the affected domain back to Flask after write quiescence; restore only from the verified cutover snapshot if data reconciliation cannot prove safety.

### M7 — Multiplayer WebSocket parity

**Purpose:** migrate the same-port WebSocket relay after HTTP auth and routing are stable.

**Dependencies:** M4 token/role behavior; M3 Traefik routing; explicit scaling decision.

**Scope:** status endpoint, WebSocket upgrade, join/leave/message wire protocol, token/player-role checks, peer cap, connection/message limits, and idle behavior.

**Acceptance criteria:**

- firmware/client protocol fixtures pass without message-shape changes;
- upgrade works through `api.prg32.dream.test` on the same service port;
- unauthorized, oversized, over-rate, and over-cap connections are rejected predictably;
- single-process behavior matches Flask; any multi-instance limitation is documented.

**Risks:** upgrade headers, proxy timeouts, in-memory group loss on restart, resource abuse.

**Rollback:** retain the Flask WebSocket route and remove the TypeScript upgrade route while leaving read-only HTTP migration intact.

### M8 — Canary and controlled backend cutover

**Purpose:** make TypeScript the authoritative backend only after domain parity.

**Dependencies:** M3 through M7 acceptance gates; operational runbook; backup and rollback rehearsal.

**Scope:** short maintenance window or explicit traffic switch, final data snapshot, single-writer enablement, monitoring, firmware smoke tests, and rollback decision window.

**Acceptance criteria:**

- all contract, binary, auth, provider, filesystem, metrics, backup, and WebSocket checks are green;
- production-like Compose/Traefik routing has been exercised;
- the final SQLite and filesystem snapshot is identified and recoverable;
- only TypeScript can write migrated domains;
- error rate, latency, resource use, and compatibility telemetry are monitored;
- rollback has an owner, trigger thresholds, and a rehearsed command sequence.

**Risks:** unobserved legacy clients, load differences, proxy-specific behavior, migration-time writes.

**Rollback:** within the decision window, quiesce TypeScript, restore Flask route ownership, reconcile or restore from the final pre-cutover snapshot, and invalidate only the newly introduced browser session if necessary.

### M9 — Flask/Python removal and cleanup

**Purpose:** remove transitional code only after operational evidence.

**Dependencies:** M8 stable for an agreed observation period; no unresolved P0/P1 compatibility issue.

**Scope:** remove Flask runtime and templates only when no longer required, remove compatibility adapters, archive migration runbooks, and simplify Compose/Traefik labels.

**Acceptance criteria:**

- access logs and firmware compatibility checks show no dependency on Flask routes;
- backups and restores use the TypeScript service format and remain recoverable;
- all environment variables have documented owners and no dead compatibility fallbacks remain accidentally;
- Python tests and runtime are removed only after their contract fixtures have equivalent TypeScript coverage;
- deployment, development, and rollback documentation are updated.

**Risks:** premature removal of an obscure firmware or admin client; loss of a proven rollback path.

**Rollback:** restore the archived Flask image and route bundle from the documented release artifact; do not delete the final pre-removal backup until the retention window expires.

## M2 implementation evidence

M2 TypeScript backend foundation is implemented and documented in
`docs/modernization/21-m2-typescript-backend-foundation-report.md`.

Completed evidence:

- isolated Fastify/TypeScript service with Node 24 LTS and pnpm lockfile;
- Drizzle mappings for the current Flask SQLite tables without migrations;
- SQLite opened only as an existing read-only file;
- reusable response compatibility harness and disposable fixture tests;
- Node 24 multistage Docker image with a non-root runtime stage;
- opt-in Compose `backend` profile on loopback port 5090, without Traefik or
  production routing changes;
- Flask suite, backend checks, frontend checks, Compose rendering, and Docker
  build executed successfully.

M2 is intentionally not a backend cutover: Flask remains the sole writer and
the owner of all public API and WebSocket routes. The next gate is M2.1 schema
and serialization compatibility against sanitized fixtures.

## M2.1 implementation evidence

M2.1 data and serialization compatibility is implemented and documented in
`docs/modernization/22-m2-1-data-compatibility-report.md`.

Completed evidence:

- authoritative Flask schema oracle generated from a disposable initialized
  database, with exact comparison of tables, columns, defaults, nullability,
  primary keys, autoincrement, unique constraints, indexes/order, and foreign
  key actions;
- synthetic fixtures covering users, groups, tokens, settings, runs/samples,
  scores, download events, submissions, catalog index data, Unicode, nulls,
  empty values, and binary hashes;
- Python-measured JSON/principal/catalog outputs compared with TypeScript
  serialization and inventory utilities;
- read-only Werkzeug scrypt/PBKDF2 verification with valid, invalid, and
  explicitly unsupported format cases;
- SHA-256 API-token lookup compatibility, owner/group ordering, legacy
  configured-user parsing, and no `last_used` mutation;
- read-only cartridge index/filesystem inventory with hash verification and
  unsafe-path rejection;
- backend 4-file/14-test suite, Flask 63-test suite, Next.js typecheck/lint/
  tests/build, Python compilation, and diff checks all passed.

M2.1 is accepted for its read-only gate. It does not add public TypeScript
API routes, authentication endpoints, publishing, metrics ingestion,
WebSocket migration, or schema migrations. Flask remains authoritative.

## First implementation recommendation

M1.2a security containment, M2, M2.1, M3, M4, M5.1, and M5.2a have been
implemented as isolated or Flask-contained milestones. M5.2b is now complete
for the isolated TypeScript review/publication parity scope and is documented
in `docs/modernization/34-m5-2b-review-publication-parity-report.md`.

The next implementation must not be treated as a cutover: Flask remains the
sole operational writer. The next authorized gate is the remaining M6 domain
assessment/implementation only after the M5.2b Docker and full-repository
evidence is green. Public routing, live-data reconciliation, and dual-writer
synchronization remain prohibited until M8's explicit cutover gate.

Do not start with publishing, auth replacement, or dual-write synchronization. Those domains have the highest compatibility and rollback cost and depend on decisions that are not yet closed.

## Remaining architecture decisions

The following decisions must be recorded before the corresponding milestone is marked complete:

1. whether anonymous firmware runs and their exports are public, owner-only, or admin-only;
2. whether browser sessions are intentionally invalidated at cutover or Flask-cookie compatibility is required;
3. exact TypeScript verifier strategy for all existing Werkzeug password hash prefixes;
4. whether Flask-only external-provider accounts require an explicit retirement,
   export, or support communication before Flask removal;
5. whether mDNS belongs to the TypeScript process or a deployment-owned service;
6. Drizzle migration policy and who approves schema diffs against the existing SQLite file;
7. the authoritative relationship between `index.json`, cartridge files, pending submissions, and review rows;
8. backup encryption/key management and restore retention policy;
9. trusted-edge rate limits and firmware exceptions;
10. whether multiplayer remains single-process or gains a broker for horizontal scaling;
11. the exact Traefik security-header, CSP, WebSocket timeout, and forwarded-scheme policy for `store.prg32.dream.test` and `api.prg32.dream.test`.

## Final recommendation

Proceed with the TypeScript migration as a staged Fastify/TypeScript rewrite.
Treat Drizzle as deferred and keep the existing SQLite contracts. Keep Flask
operationally authoritative until all domain parity, authentication,
publishing/review, metrics, scores, backup recovery, and WebSocket acceptance
tests are complete. M5.2b supplies a disposable review/publication rehearsal;
it does not authorize public routing or Flask removal.

## M5.2b implementation evidence

M5.2b review, approval, rejection, metadata, and publication parity is
implemented and documented in
`docs/modernization/34-m5-2b-review-publication-parity-report.md`.

Completed scope:

- isolated Fastify review list/detail routes plus minimal editor HTML routes;
- explicit `editors`-group authorization, including admin-without-group denial;
- CSRF/session and bearer-only policy parity;
- exact editable/immutable metadata handling and stable error envelopes;
- approval through the M5.2a journal for every submitted architecture;
- durable rejection journal, safe cleanup, serialized state transitions, and
  read-only reconciliation findings;
- actual child-process crash tests for approval and rejection;
- multi-architecture catalog/download compatibility fixtures and copied-store
  backup/restore evidence;
- no Flask, schema, production-data, deployment, or companion-repository
  changes.

M5.2b remains isolated. It does not mark M6, M7, M8, or M9 complete and does
not permit a TypeScript production writer or public route cutover.

## M6.1 implementation evidence

M6.1 metrics, runs, and samples migration is implemented and documented in
`docs/modernization/35-m6-1-metrics-runs-samples-report.md`.

Completed evidence:

- isolated Fastify routes for run creation, firmware batch ingestion, finish,
  list, detail, JSON, CSV, Markdown, and the metrics index;
- firmware-compatible anonymous ingestion with `user_id = NULL`, millisecond
  timestamps, duplicate-frame idempotency, dropped-sample accounting, and no
  CSRF requirement;
- owner/administrator authorization applied consistently to detail and all
  export formats;
- explicit body, sample-count, database-work, export, and structure limits;
- transactional rollback tests, stable error envelopes, no raw exception
  leakage, and an indexed sample lookup query plan;
- disposable metrics schema fixtures with no production SQLite migration;
- Node 24 multistage backend image and single-file Compose writer-profile
  smoke test, including integrity and publication reconciliation checks;
- full Python, TypeScript backend, frontend, Docker, Compose, and diff-check
  evidence recorded in the M6.1 report.

M6.1 does not migrate Flask HTML dashboards, global run statistics, firmware
behavior, WebSockets, production routing, or the operational writer. Flask
remains authoritative and `PRG32_BACKEND_METRICS_WRITE_ENABLED` remains false
by default. M6.2 is the next authorized assessment; it is not started by this
milestone.

## M6.2a design evidence

M6.2a score authentication and firmware compatibility is complete as an audit
and design-only milestone. It is documented in:

- `docs/modernization/36-m6-2a-score-authentication-design.md`;
- `docs/modernization/37-m6-2a-score-authentication-adr.md`.

The audit traced the board-local and external score APIs, Flask authentication,
the exact firmware request/retry path, existing token capabilities, TLS
configuration, score identity, and host-tool consumers. It confirms the
conditional incompatibility identified by M5.A: enabled firmware sends no
credential while Flask requires an authenticated principal. No trusted-network
or reverse-proxy exception was found.

The historical M6.2a direction was a scoped device credential at the existing
`POST /api/scores` path. That recommendation is preserved for traceability but
is now marked **SUPERSEDED — NOT APPROVED** by the explicit M6.2b product
decision. The approved direction is anonymous isolated ingestion with bounded
abuse controls and no device identity.

M6.2a changed documentation only. It did not modify Flask, Fastify, firmware,
SQLite schemas, Docker/deployment configuration, production data, or routing.
M6.2b was subsequently authorized as an isolated implementation and is
documented below.

## M6.2b implementation evidence

M6.2b anonymous score ingestion and public leaderboard migration is implemented
in the isolated Fastify backend and documented in
`docs/modernization/39-m6-2b-anonymous-scores-report.md`.

Completed scope:

- anonymous `POST /api/scores` with the firmware JSON contract and `{ok:true}`
  success response;
- public `GET /api/scores` filtering, limits, ordering, timestamps, and legacy
  response fields;
- optional authenticated browser/bearer behavior, while anonymous firmware
  requests require neither credentials nor CSRF;
- strict firmware-derived validation, bounded body size, stable error
  envelopes, and no client-controlled `submitted_by`;
- process-local bounded source rate limiting with no trust in arbitrary
  `X-Forwarded-For` values;
- disposable-only writer gate, existing auth writer connection reuse,
  row-count capacity admission without automatic deletion, and transactional
  rollback/concurrency tests;
- single-file Compose writer configuration with score writes disabled by
  default.

M6.2b intentionally diverges from Flask's authenticated POST behavior and does
not modify Flask. It does not add device credentials, change firmware, add
schema migrations, expose public Fastify routing, or authorize production
writes. Duplicate submissions retain documented at-least-once semantics.
M6.3 is the next milestone and was not started automatically.

## M6.3a implementation evidence

M6.3a read-only statistics API parity is implemented and documented in
`docs/modernization/41-m6-3a-statistics-parity-report.md`.

Completed isolated scope:

- Fastify equivalents for `GET /api/stats/downloads`,
  `GET /api/stats/downloads/:game_id`, `GET /api/stats/scores`, and
  `GET /api/stats/runs`;
- public access with no authentication or CSRF requirement;
- Flask-compatible date filtering, day/week/month grouping, fallback handling,
  result limits, ordering, score fields, download aggregates, per-game
  breakdowns, and seven-day run activity semantics;
- deterministic Flask-generated compatibility fixtures and Fastify regression
  tests, including empty/boundary/filter/ordering/Unicode-shaped and injection-
  shaped cases;
- explicit SQLite `readonly` plus `query_only` access, no statistics schema
  initialization, no writer connection, DDL/DML rejection, unchanged database
  hash, and no sidecar mutation after requests;
- query-plan evidence recorded without adding or removing indexes.

M6.3a does not implement the Flask `/stats` HTML page, statistics retention,
capacity monitoring, administration, backup/restore, public routing, schema
migrations, firmware changes, or production writes. Flask remains the public
API owner and sole operational writer. M6.3b is recorded below.

## M6.3b implementation evidence

M6.3b SQLite capacity and operational resilience assessment is complete for the
isolated test scope and is documented in
`docs/modernization/42-m6-3b-sqlite-capacity-resilience-report.md`.

Completed evidence:

- deterministic small, medium, and large synthetic SQLite workloads using
  1,000/100/10,000/1,000, 10,000/1,000/100,000/10,000, and
  100,000/10,000/1,000,000/100,000 score/run/sample/download rows;
- measured database growth from 1,515,520 bytes to 148,795,392 bytes without
  touching operational data;
- repeatable SQLite, Fastify-injection, and authorized metrics service latency
  measurements plus `EXPLAIN QUERY PLAN` evidence;
- disposable WAL, automatic/manual checkpoint, long-reader, concurrent
  reader/writer, busy-timeout, transaction rollback, and rate-limiter tests;
- supported SQLite backup consistency with a concurrent disposable writer,
  integrity checks, failed-destination handling, and corrupted-copy rejection;
- explicit retention, free-space, WAL, backup-validation, and incident-response
  recommendations without adding monitoring infrastructure or deletion jobs;
- reusable harness and README under `backend/tests/operations/`, a
  `pnpm capacity:check` command, and four regression tests in
  `backend/tests/sqlite-resilience.test.ts`.

M6.3b does not modify Flask, firmware, Next.js, routing, the operational
database, SQLite schema/indexes, retention behavior, or deployment. It does not
implement backup/restore migration, production Fastify writes, M6.3c, or M6.3d.
The next authorized gate was M6.3c backup/restore design and implementation
assessment, which is now recorded below.

## M6.3c.2 implementation evidence

M6.3c.2 application-level backup and recoverable restore is implemented for the
disposable Fastify writer scope and documented in
`docs/modernization/44-m6-3c2-application-backup-restore-report.md`.

Completed evidence:

- legacy `prg32-cartridge-store-backup-1.0` import compatibility and new
  `prg32-cartridge-store-backup-2.0` export manifests with inventory, sizes,
  SHA-256 hashes, and schema metadata;
- bounded archive inspection and extraction for entry count, archive/expanded/
  per-entry sizes, compression ratio, manifest size, path safety, duplicate
  names, unsupported compression, encryption flags, and special file metadata;
- optional portable AES-256-GCM encryption using a random salt/nonce and
  Node's built-in cryptography, without encrypting the live SQLite database;
- SQLite export through the existing `better-sqlite3` backup API, integrity and
  foreign-key checks, schema compatibility validation, and preservation of the
  open database inode during restore;
- staged restore with a private recovery point, durable operation journal,
  filesystem/database rollback, and restart recovery for incomplete operations;
- consistent use of the existing `publication.lock`, disposable-only admin
  routes, browser-session plus CSRF protection for restore, and stable error
  envelopes without raw exception leakage;
- isolated unit/adversarial coverage and Docker HTTP end-to-end evidence for
  unencrypted/encrypted export and restore, wrong-password/corrupt-archive
  rejection, integrity verification, and disposable-volume boundaries.

M6.3c.2 verification passed with 86 Fastify tests, 64 Flask tests, 5 frontend
tests, frontend typecheck/lint/production build, Docker Compose configuration,
and all three multistage image builds. Backup routes remain disabled by default
and the production readiness gate for large exports remains open because the
current ZIP exporter uses bounded but in-memory `zipSync` assembly. Therefore
this milestone is accepted only for the isolated disposable/test profile; it
does not authorize production backup routes, production Fastify writes, Flask
removal, or M6.3d.

## M6.3d.1 assessment evidence

M6.3d.1 administration and application-settings discovery is complete and
documented in
`docs/modernization/45-m6-3d1-admin-settings-discovery-audit.md`.

Confirmed from the actual Flask route map and source:

- 67 active Flask route rules (69 method-path bindings) cover administration,
  settings, authentication/registration/tokens, publishing, review, metrics,
  scores, and statistics;
- Fastify has 34 fully implemented isolated route rules, 10 partial or
  intentionally different rules, and 23 missing rules on the same basis;
- five conditional OIDC/SAML federation rules are explicitly excluded from
  the target architecture and are not active in the default route map;
- the Next.js frontend is still foundation-only, with no administrative,
  settings, review, statistics, or upload consumer;
- the companion `../PRG32` repository consumes discovery, catalog/download,
  bundle publishing, scores, and metrics, but no administration/settings route;
- M6.1, M6.2, M6.3a, M6.3b, and M6.3c.2 capabilities were verified and are not
  to be duplicated by the next administrative milestone;
- the remaining backend gaps are settings, users/groups/roles, direct catalog
  administration, and their authorization/transaction/audit boundaries.

The proposed M6.3d.2 sequence is: (A) typed settings and safe assets; (B) users,
roles, groups, and security transitions; (C) registration and token policy;
(D) remaining cartridge moderation administration using the existing publication
journal/lock/reconciliation boundary; (E) only explicitly approved remaining
metrics/score/statistics mutations; and (F) integrated compatibility plus
Next.js consumers.

Before implementation, product decisions are required for the settings
allow-list and secret handling, SMTP registration, default registration role,
final-administrator/self-protection rules, session/token invalidation, admin
token revocation, audit trail, editor/admin boundary, HTML retirement, direct
catalog deletion semantics, aggregate privacy, and backup retention/key policy.

M6.3d.1 is documentation-only. No application code, frontend code, Flask
template, Docker/Traefik configuration, schema, operational database, firmware,
or companion repository file was modified as part of this milestone; existing
uncommitted prior work was preserved. No application tests are claimed as new
results. M6.3d.2a implementation had not started at the time of this
assessment, and production Fastify administration was NO-GO.

## M6.3d.2a implementation evidence

M6.3d.2a centralized RBAC foundation is implemented in the isolated Fastify
backend and documented in
`docs/modernization/46-m6-3d2a-rbac-foundation-report.md`.

Completed scope:

- typed static permission registry with explicit mappings for persisted roles
  and the existing `editors` group;
- deny-by-default authorization decisions for unknown permissions, unknown
  groups, unknown roles, anonymous principals, malformed principals, and
  invalid owned resources;
- centralized route integration for token self-management, authenticated
  submissions, editors-only review, admin backup export/restore, and metrics
  list/detail/export ownership decisions;
- preservation of current browser-session/bearer distinction, CSRF checks,
  writer flags, backup feature gates, nullable metrics ownership, and public
  firmware-facing ingestion contracts;
- deterministic registry/policy tests plus the existing Fastify regression
  suite: 16 test files and 91 tests passed, with Node 24.20.0 selected via
  `nvm use 24`.
- frontend typecheck, lint, 5 tests, and production build passed when the
  existing required `FLASK_PROXY_TARGET=http://flask:5080` build environment
  was supplied;
- the Flask regression attempt was blocked by the existing Python 3.9
  virtualenv lacking `hashlib.scrypt` required by Werkzeug password hashing:
  16 passed, 32 failed, and 16 errors. No Flask workaround was introduced.

M6.3d.2a did not add endpoints, change schema/indexes, modify Flask or
`../PRG32`, enable production writes, or change the frontend. The legacy
principal role helpers remain exported for compatibility but are no longer
used by the migrated active protected routes. Final-administrator protection,
session/token invalidation after future user/group mutations, and all
administrative APIs remain outstanding.

## M6.3d.2b implementation evidence

M6.3d.2b typed settings and safe application assets are implemented in the
isolated Fastify backend and documented in
`docs/modernization/47-m6-3d2b-settings-api-assets-report.md`.

Completed scope:

- exact 39-key legacy settings registry with explicit writable,
  read-only/effective, asset-managed, deferred, and excluded classifications;
- strict partial PATCH validation for the eight approved writable settings,
  with stable rejection codes and one SQLite `BEGIN IMMEDIATE` transaction;
- administrator-only GET/PATCH/API asset policy using centralized RBAC,
  browser session plus CSRF for mutations, and a predictable disabled-writer
  response;
- bounded PNG/JPEG/ICO asset uploads with a 2 MiB limit, SVG rejection,
  structural PNG validation, generated paths, private staging, atomic rename,
  transactional active references, compensation, and safe public serving;
- excluded secret redaction, stable error envelopes, and server-side logging;
- isolated settings tests covering persistence, restart, invalid atomic patches,
  RBAC, CSRF, assets, replacement, and post-publication rollback.

No schema/index/migration, Flask, firmware, companion-repository, production
routing, deployment, or frontend feature was changed. No new dependency was
introduced. M6.3d.2b remains isolated and does not authorize production
Fastify writes or the next administrative milestone.

The isolated Fastify implementation and its backend/frontend/Docker checks are
complete. The Flask compatibility gate remains **conditionally open** because
the temporary Python 3.13 run produced 63 passed tests and one pre-existing
mDNS test failure caused by missing `SECRET_KEY` in that test setup. Remaining
risks are the repository Python 3.9/`hashlib.scrypt` environment issue,
deferred SMTP/OIDC/SAML/custom CSS/dynamic mDNS behavior, and the absence of a
Next.js settings consumer.

## M6.3d.2c implementation evidence

M6.3d.2c user, role, and group administration is implemented in the isolated
Fastify writer profile and documented in
`docs/modernization/48-m6-3d2c-user-role-group-administration-report.md`.

Completed scope:

- strict JSON user CRUD, bounded listing, predefined role listing/assignment,
  group CRUD, and complete group-membership replacement;
- centralized RBAC permissions for user, group, and role administration;
- immutable `editors` group identity with membership management but no rename or
  deletion;
- transaction-level final-administrator and self-demotion/self-deletion
  protection using `BEGIN IMMEDIATE`;
- password, role, group, and deletion credential invalidation through
  transactional token deletion plus durable per-user revocation markers in the
  existing `store_settings` table;
- bounded JSONL administrative audit records with fail-closed preflight and
  explicitly documented two-persistence durability limits;
- deterministic authorization, rollback, registration-policy, audit, and
  separate-connection concurrency tests.

Verification evidence:

- Fastify: 18 test files / 100 tests, typecheck, lint, and build passed under
  Node 24.20.0 selected with `nvm use 24`.
- Disposable Docker E2E passed for CRUD, editors authorization/revocation,
  credential invalidation, self/final-admin protection, audit restart
  persistence, disabled writer, and named-volume-only mounts.
- Flask differential remains the known baseline result: 63 passed and one
  existing mDNS test failed because it invokes Flask with `TESTING=False` and
  no `SECRET_KEY`; Flask was not changed.

No new SQLite table, index, migration, dependency, frontend administration,
Flask route, firmware contract, companion-repository file, production write, or
deployment change was introduced. M6.3d.2c is complete for the isolated
profile; the production cutover gate remains closed.

The revised sequence is:

1. M6.3d.2a — centralized RBAC foundation (complete for isolated Fastify).
2. M6.3d.2b — typed settings and safe assets (complete for isolated Fastify;
   see the implementation evidence above).
3. M6.3d.2c — users, roles, groups, final-administrator protection, and
   session/token security transitions (complete for isolated Fastify; see the
   implementation evidence above).
4. M6.3d.2d — registration and API-token administration (complete for
   isolated Fastify; see the implementation evidence below).
5. M6.3d.2e — remaining cartridge moderation administration using the existing
   publication journal/lock/reconciliation boundary (complete for isolated
   Fastify; see the implementation evidence below).
6. M6.3d.2f — Administrative API Integration & SMTP Contract Design
   (complete for the isolated Fastify/Next.js development path; see the
   implementation evidence below).
7. M6.3d.2g — Database Security Hardening & Sensitive Data Encryption
   (M6.3d.2g.1 audit complete; M6.3d.2g.2 implemented for the isolated
   Fastify writer; production cutover remains closed).

M6.3d.2f is complete only for the explicitly configured disposable integration
path. Production remains Flask-authoritative and no Fastify administrative
route is exposed through production Traefik.

## M6.3d.2d implementation evidence

M6.3d.2d registration and API-token administration is implemented in the
isolated Fastify writer and documented in
`docs/modernization/49-m6-3d2d-registration-token-administration-report.md`.

Completed scope:

- complete registration-token generation, expiration, replay rejection, and
  transactionally serialized completion using the existing
  `registration_tokens` table;
- explicit `auth_allow_registration` semantics: new initiation is disabled,
  while already-issued pending links remain compatible with Flask completion;
- effective `auth_require_email_domain` enforcement without widening the
  settings write API;
- fixed public registration role `user`, with no caller-controlled role
  escalation;
- administrator-only `GET /api/admin/tokens` metadata listing with bounded
  pagination, owner filtering, deterministic ordering, and joined owner data;
- `DELETE /api/admin/tokens/:tokenId` using existing `tokens:revoke:any`,
  browser session plus CSRF, disposable writer checks, and immediate single
  token deletion;
- narrowly scoped `tokens:read:any` permission mapped only to administrators;
- reuse of the M6.3d.2c JSONL audit boundary for attempted, committed, failed,
  and rejected administrative token operations;
- no raw token/hash/password/session/CSRF leakage in responses or request
  query-string logs;
- active browser-session invalidation after successful application restore,
  while restored bearer rows retain existing database compatibility semantics.

Verification evidence:

- Fastify: 18 test files / 102 tests, typecheck, lint, and build passed under
  Node 24.20.0 selected with `nvm use 24`.
- Frontend was not modified; with Node 24 selected through `nvm use 24`,
  `FLASK_PROXY_TARGET=http://flask:5080 pnpm run check` passed (typecheck,
  lint, 2 Vitest files / 5 tests, and Next.js production build).
- Flask differential remains the known baseline: 63 passed and one existing
  mDNS test failed because its test setup omits `SECRET_KEY`; Flask was not
  changed.
- Disposable Docker E2E passed on 2026-10-12 for bootstrap, registration
  completion/replay, token metadata redaction, CSRF and bearer-only mutation
  rejection, selective revoke, audit persistence, restart/persistence, and
  disabled-writer behavior. The exact command/evidence and the one-off disabled
  writer override are recorded in the M6.3d.2d report.

No SQLite table, column, index, migration, dependency, Flask route, firmware
contract, companion-repository file, production write, deployment, SMTP
workflow, or Next.js administrative interface was introduced.

M6.3d.2d is complete for the isolated profile. Production cutover remains
closed. M6.3d.2e was the next separately authorized milestone and its evidence
is recorded below.

## M6.3d.2e implementation evidence

M6.3d.2e catalog administration and publication consistency are implemented in
the isolated Fastify/TypeScript writer and documented in
`docs/modernization/50-m6-3d2e-catalog-administration-report.md`.

Completed scope:

- bounded `GET /api/admin/cartridges` listing with deterministic pagination,
  search, version, and architecture filters;
- safe `GET /api/admin/cartridges/:cartridgeId` detail projection that omits
  internal filenames, absolute paths, journal identifiers, and database
  internals;
- `PATCH /api/admin/cartridges/:cartridgeId` with the existing review
  allow-list (`title`, `summary`, `description`, `tags`, `license`, `homepage`,
  `repository`) and immutable ID/version/authors enforcement;
- architecture-aware `DELETE /api/admin/cartridges/:cartridgeId` with safe
  version selection and whole-version deletion;
- centralized `catalog:metadata:write` RBAC for administrators and the
  existing `editors` group, while preserving editors-only submission review;
- reuse of the single publication lock, journal, staging, backups, atomic
  index replacement, compensation, and reconciliation boundary for update and
  delete operations;
- binary metadata/colophon rebuilding, hash/size/index synchronization,
  symlink/path checks, out-of-band hash rechecks, crash recovery, and
  intentionally-deleted verified-variant reconciliation handling;
- bounded JSONL audit records and stable error envelopes without raw exception
  or filesystem-path leakage.

Verification evidence:

- Fastify: 19 test files / 105 tests, typecheck, lint, and build passed under
  Node 24 selected with `nvm use 24`;
- dedicated catalog tests passed for route contracts, RBAC, CSRF, bearer-only
  mutation rejection, metadata parity, architecture deletion, audit evidence,
  journal recovery, and reconciliation;
- frontend: typecheck, lint, 2 Vitest files / 5 tests, and Next.js production
  build passed with the existing required
  `FLASK_PROXY_TARGET=http://flask:5080` environment;
- Flask baseline: 63 passed and one pre-existing mDNS failure caused by the
  test invoking Flask with `TESTING=False` and no `SECRET_KEY`; Flask was not
  changed;
- Docker: single-file Compose and writer profile configuration passed,
  multistage backend image build passed, and a disposable writer E2E passed for
  bootstrap, catalog listing, and stable missing-cartridge mutation errors;
- `git diff --check` passed and the companion `../PRG32` repository remained
  unchanged.

No schema object, migration, dependency, Flask route, Jinja template,
production routing, deployment, firmware contract, or production Fastify
administrative route was introduced. M6.3d.2e is complete for the isolated
profile only; production cutover remains closed.

At the time of the M6.3d.2e report, the next implementation milestones were
explicitly planned and had not started:

- **M6.3d.2g — Database Security Hardening & Sensitive Data Encryption:**
  assess and implement approved encryption and key-management controls for
  sensitive database material without changing public identifiers or firmware
  contracts.

That historical planning note was superseded by the subsequent M6.3d.2g.1
and M6.3d.2g.2 evidence below; production cutover remains closed.

## M6.3d.2f implementation evidence

M6.3d.2f is complete for the isolated development/test integration path. The
Next.js administrative workspace consumes the existing Fastify contracts
through the explicit `PRG32_ADMIN_FASTIFY_TARGET` environment gate. The default
proxy remains Flask-compatible; production builds reject the Fastify admin
target, so no production Traefik or dual-writer path was introduced.

Completed work:

- typed administrative client for settings, assets, users, groups, roles,
  tokens, catalog, and backup/restore;
- browser-session cookie forwarding and in-memory CSRF acquisition for
  mutations, with bearer-only mutations still rejected by Fastify;
- permission-derived navigation using the backend effective permission list;
- minimal responsive workspace with safe feedback, explicit destructive
  confirmations, query invalidation, and restore reauthentication handling;
- optional compatible `permissions` field in Fastify identity responses;
- deterministic frontend API/UI tests, backend auth-regression assertion, and
  disposable Docker E2E evidence for all admin families plus a real cartridge
  publication, metadata update, architecture deletion, and restore session
  invalidation;
- SMTP legacy behavior inventory and future API/provider/encryption contract
  design. SMTP delivery, credential persistence, and encryption remain
  unimplemented.

Verification evidence:

- Fastify: 19 test files / 105 tests, typecheck, lint, and build passed under
  Node 24 selected with `source "$HOME/.nvm/nvm.sh" && nvm use 24`;
- frontend: typecheck, ESLint, 4 Vitest files / 10 tests, and Next.js
  production build passed with `FLASK_PROXY_TARGET=http://flask:5080`;
- Docker: single-file Compose configuration, backend multistage build, and
  frontend dev-container build passed; disposable writer E2Es passed for
  admin settings/users/groups/roles/tokens/backup-restore, session
  invalidation, real publication, metadata update, and architecture-specific
  deletion;
- `git diff --check` passed; no companion-repository files were changed.

At the time of the M6.3d.2f report, **M6.3d.2g — Database Security Hardening
& Sensitive Data Encryption** was planned and required new authorization.
The authorized implementation and verification evidence is recorded in the
following sections.

## M6.3d.2g.1 audit evidence

M6.3d.2g.1 is complete as an audit and architecture decision gate. The full
database schema inventory, sensitive-data classification, password/token/session
assessment, settings/SMTP exposure analysis, backup and filesystem review,
Docker review, key-management and rotation design, proposed ciphertext
envelope, restore compatibility requirements, security test plan, and
implementation scope are recorded in
`docs/modernization/52-m6-3d2g1-database-security-cryptographic-architecture-audit.md`.

The decision is to use application-level envelope encryption for reversible
secret settings with an externally managed, versioned key-encryption key. Hash
material remains one-way and SQLCipher is deferred. No encryption, schema
migration, data migration, dependency, Flask behavior, production routing,
deployment, or production data changed in this milestone.

Evidence collected for the gate:

- Fastify: 19 test files / 105 tests, typecheck, lint, and build passed under
  Node 24 selected with `nvm use 24`.
- Frontend: typecheck, lint, 4 Vitest files / 10 tests, and Next.js production
  build passed with `FLASK_PROXY_TARGET=http://flask:5080`.
- Python compilation passed. Flask remains the known baseline of 63 passed and
  one pre-existing mDNS failure caused by a test invoking `TESTING=False`
  without `SECRET_KEY`.
- Root Compose config and all explicit profiles normalize successfully;
  `git diff --check` passed.

The confirmed risks are documented rather than altered: legacy reversible
secrets may be plaintext in `store_settings`, Flask can log a registration
link when SMTP is unavailable, backups may be exported without encryption,
and key rotation/escrow/restore-key policy is not implemented.

At the time of the M6.3d.2g.1 audit, **M6.3d.2g.2 — application-level secret
encryption, key management, rotation, and restore compatibility — was pending
and not started.** Its subsequent implementation evidence is recorded below;
the production cutover gate remains closed.

## M6.3d.2g.2 implementation evidence

M6.3d.2g.2 is complete for the isolated Fastify/TypeScript writer and is
documented in
`docs/modernization/53-m6-3d2g2-sensitive-data-encryption-key-lifecycle-report.md`.

Implemented scope:

- Node 24 AES-256-GCM/HKDF-SHA256 envelope with `prg32enc:v1:` prefix,
  canonical bounded serialization, strict allow-list validation, fresh
  96-bit nonces, 128-bit tags, purpose separation, and authenticated setting
  key metadata;
- external mode-0600 key registry with one active key, decrypt-only historical
  keys, duplicate/invalid/missing-key rejection, and explicit no-overwrite
  key generation;
- centralized classification of `smtp_password` and `oidc_client_secret` as
  definite secrets, with `saml_idp_x509cert` explicitly left ambiguous rather
  than assuming a public X.509 certificate is secret;
- explicit bounded idempotent plaintext migration, encrypted migration
  snapshot, conflict-checked disposable rollback, and transactional key
  rotation;
- mandatory encrypted administrative backup export when secret encryption is
  enabled, safe V2 manifest key metadata, and staged restore-key preflight;
- secret redaction, read-only Docker registry mount, and no key material in
  image layers, frontend variables, SQLite, or application backups.

Verification evidence:

- Fastify: 20 test files / 111 tests, typecheck, ESLint, and build passed under
  Node 24 selected with `nvm use 24`;
- frontend: typecheck, ESLint, 4 Vitest files / 10 tests, and Next.js
  production build passed;
- backend multistage Docker build passed;
- disposable Docker migration, read-only registry mount, non-root health,
  image key-absence check, key rotation, and post-rotation restart passed;
- existing Flask behavior was not modified and no production data was used.

No SQLite schema, Flask code, firmware contract, companion repository,
production route, SMTP delivery path, or SQLCipher dependency was introduced.
The production cutover gate remains closed. Key escrow/retention ownership,
Flask transitional secret handling, registration-link log remediation, and
explicit classification of any SAML private-key material remain prerequisites
for a later cutover milestone.
