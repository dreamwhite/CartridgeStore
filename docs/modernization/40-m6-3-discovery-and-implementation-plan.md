# M6.3 — Discovery and Implementation Plan

**Date:** 2026-10-12
**Status:** assessment and planning only; no M6.3 implementation started
**Operational owner:** Flask/Python
**Target:** isolated Fastify/TypeScript service
**Cutover:** not authorized

## 1. Executive summary

The repository roadmap defines **M6** as the remaining data-domain migration:
scores and scoreboard, metrics runs and samples, CSV/Markdown exports, download
statistics, user and administrator operations, settings, and backup/restore.
It does not define a separate M6.3 scope. The M6.3 label in the preceding
M6.2b report is therefore a sequencing marker, not an approved feature
boundary.

Two M6 slices are already implemented in the isolated Fastify service:

* M6.1: metrics run/sample ingestion, detail, exports, and owner/administrator
  authorization.
* M6.2b: anonymous score ingestion and public score listing, with bounded
  validation, rate limiting, disposable capacity admission, and rollback-safe
  transactions.

The remaining M6 domains are still Flask-owned: download statistics, the
statistics HTML surface, administrative and settings operations, backup and
restore, and the Flask HTML run/profile surfaces. Fastify has no equivalent
statistics, administrative, or backup routes. Flask also remains the only
operational writer for every domain.

**Recommendation:** GO for a separately approved, isolated M6.3 implementation
after the product decisions in section 11 are recorded; NO-GO for production
Fastify routing, production writes, dual writers, or Flask retirement. The
first implementation slice should be read-only statistics and contract
fixtures, followed by disposable-only operational backup/admin work. No
automatic retention or deletion should be introduced.

The facts below are source-checked. Text labelled **Recommendation** is an
architectural proposal and is not an existing repository decision.

## 2. Authoritative M6.3 scope

### 2.1 Roadmap-defined scope

The authoritative roadmap, [`19-revised-migration-roadmap.md`](19-revised-migration-roadmap.md),
defines M6 as:

* scores and scoreboard;
* run and sample ingestion;
* CSV and Markdown report exports;
* download statistics;
* user and administrator operations;
* settings;
* backup and restore.

Its M6 acceptance criteria require firmware compatibility fixtures, bounded
ingestion and export work, the approved anonymous-run visibility policy,
score-ordering compatibility, preserved administrative identifiers and role
boundaries, validated/protected/recoverable backups, and no simultaneous Flask
and TypeScript writers.

### 2.2 Already completed inside M6

M6.1 and M6.2b are completed only for isolated Fastify/disposable data:

| Area | Implemented evidence | Still operationally owned by |
| --- | --- | --- |
| Metrics ingestion | `POST /api/runs`, `POST /api/metrics/batch`, finish; bounded and transactional | Flask |
| Metrics reads/exports | run list/detail, JSON, CSV, Markdown, owner/admin checks | Flask |
| Scores | anonymous-compatible Fastify `POST /api/scores`; public Fastify `GET /api/scores` | Flask |
| Score abuse controls | bounded process-local limiter and disposable row-count gate | Flask has no equivalent containment parity gate |
| SQLite writes | isolated writer profile only, disabled by default | Flask operational database |

Evidence is recorded in [`35-m6-1-metrics-runs-samples-report.md`](35-m6-1-metrics-runs-samples-report.md)
and [`39-m6-2b-anonymous-scores-report.md`](39-m6-2b-anonymous-scores-report.md).

### 2.3 Proposed M6.3 boundary

**Proposed scope, requiring approval:**

1. Fastify read-only parity for `/api/stats/downloads`,
   `/api/stats/downloads/<game_id>`, `/api/stats/scores`, and
   `/api/stats/runs`.
2. Contract fixtures for existing score, metrics, and statistics responses,
   including empty data, filters, limits, dates, ordering, authorization, and
   error cases.
3. Operational assessment and disposable-only evidence for score/metrics
   retention, SQLite/WAL/disk capacity, rate-limit behavior, and backup/restore.
4. A reviewed plan for Fastify settings and administrative parity, with actual
   mutations deferred to an explicitly enabled disposable writer gate.
5. A bounded, staged backup/restore implementation only if product decisions
   and security acceptance criteria are approved before coding.

**Not in M6.3:** public routing, production database writes, production
retention jobs, automatic score deletion, schema migrations, Flask changes,
firmware changes, Traefik changes, WebSocket migration, frontend storefront
features, or deployment.

### 2.4 Scope discrepancy

No source document assigns a unique set of features to “M6.3”. The roadmap
contains M6, M6.1 evidence, and M6.2a/M6.2b evidence, but no formal M6.3
acceptance section. This document records the discrepancy; it does not silently
edit the roadmap. Before implementation, the owner should either approve the
proposed boundary above or revise the roadmap explicitly.

## 3. Current implementation inventory

### 3.1 Flask authority

Source inspection confirms:

* `cartridge_store/scores.py` creates/maintains `scores` and its index,
  exposes public `GET /api/scores` and `/scores`, and protects
  `POST /api/scores` with `login_required`. The POST path coerces values and
  truncates text to 24 Python characters.
* `cartridge_store/metrics.py` exposes firmware-compatible anonymous writes,
  run/sample reads, CSV/Markdown/JSON exports, and the metrics index. Reads
  use `can_view_run`: an owner or administrator may view owned runs; an
  anonymous/unowned run is administrator-only.
* `cartridge_store/stats.py` records a `download_events` row on every catalog
  download and exposes the three statistics API families plus `/stats`.
  Historical rows have no retention job.
* `cartridge_store/app.py` owns settings, users/groups/roles, cartridge admin,
  backup download, and backup restore routes. Backup creation uses SQLite's
  backup API and includes the database and data directory. Restore extracts to
  a temporary directory but then removes existing data children before copying
  replacement data.
* Flask initializes domain tables with idempotent `CREATE TABLE IF NOT EXISTS`
  and `CREATE INDEX IF NOT EXISTS` statements. Route initialization can still
  write on a nominally read request.

### 3.2 Fastify/TypeScript implementation

The isolated backend currently contains typed SQLite mappings and read-only
connection management, catalog/discovery/download parity, local auth/session/
token foundations, isolated submission/review/publication work, metrics and
score services, and the single-file Compose writer profiles. Score/metrics
writes are disabled by default and require the validated disposable auth
writer.

It does **not** contain Fastify equivalents for `/api/stats/*`, `/stats`, the
Flask user/run HTML pages, full settings/administration, backup/restore, or
production retention/capacity monitoring.

### 3.3 Frontend and deployment

The Next.js frontend is infrastructure-only. The inspected source has no M6
storefront, score, metrics, statistics, or administration feature consumer.
Existing Compose/Traefik labels route development Flask at
`api.prg32.dream.test` and Next.js at `store.prg32.dream.test`; M6.3 must not
alter those routes.

### 3.4 Companion firmware

Read-only inspection of `../PRG32` at revision
`ff53e81fa5825771a25a09af34f165e75378f1aa` confirms:

* score submission sends `POST /api/scores` with
  `{"game":"...","player":"...","score":<uint32>}`, no credential, and keeps
  its existing at-least-once retry behavior;
* metrics sends unauthenticated `POST /api/runs`, batches to
  `POST /api/metrics/batch`, and finishes with
  `POST /api/runs/<run_id>/finish`;
* firmware score storage uses bounded 24-byte C fields and has no server-side
  score identity or idempotency key;
* no firmware modification is required or authorized by this assessment.

The companion repository was inspected only and was not modified.

## 4. Flask/Fastify contract matrix

“Not implemented” is a current Fastify fact, not permission to change Flask.

| Endpoint | Flask | Fastify | Classification | Required action |
| --- | --- | --- | --- | --- |
| `GET /api/scores` | Public JSON; optional exact `game`/`player`; limit 1–100; `score DESC, created_at ASC`; five fields | Same isolated behavior | Preserved | Differential fixtures |
| `POST /api/scores` | Authenticated; browser session requires CSRF; anonymous firmware-shaped request rejected | Anonymous approved by M6.2b; session CSRF still applies; bearer-only bypasses browser CSRF | Intentional divergence | Preserve decision; do not change Flask |
| `GET /scores` | Public server-rendered leaderboard, default limit 50 | Not implemented | Missing implementation | Keep Flask; defer Fastify HTML decision |
| `POST /api/runs` | Anonymous-compatible upsert by `run_id`; field cleaning | Same isolated behavior | Preserved | Compare conflict and ownership behavior |
| `POST /api/metrics/batch` | Flat samples, bounded count/work, duplicate frames ignored, dropped count | Same with limits and rollback | Preserved | Differential and concurrency fixtures |
| `POST /api/runs/<run_id>/finish` | Updates finish/drop fields; 404 if absent | Same isolated behavior | Preserved | Keep monotonic dropped count |
| `GET /api/runs` | Anonymous `[]`; admin all; user-owned runs | Same isolated policy | Preserved | Verify nullable ownership |
| `GET /api/runs/<id>` | Owner/admin; `{ok, run, summary}` | Same isolated policy | Preserved | Keep detail/export policy aligned |
| `GET /api/runs/<id>?format=json` | Owner/admin JSON download | Same isolated behavior | Preserved | Golden serialization fixture |
| `GET /api/runs/<id>/samples.csv` | Owner/admin fixed CSV header/order | Same isolated behavior | Preserved | Byte/field-order fixture |
| `GET /api/runs/<id>/report.md` | Owner/admin Markdown report | Same isolated behavior | Preserved | Golden report and size bound |
| `GET /api/stats/downloads` | Public series/total/top games; date, granularity, limit filters | Not implemented | Missing | M6.3 read-only candidate |
| `GET /api/stats/downloads/<game_id>` | Public total/architectures/series | Not implemented | Missing | M6.3 read-only candidate |
| `GET /api/stats/scores` | Public `{scores: [...]}`, score ordering and limit | Not implemented | Missing | M6.3 candidate; confirm privacy |
| `GET /api/stats/runs` | Public `{total, finished, active_last_7_days}` | Not implemented | Missing | M6.3 candidate; confirm privacy |
| `/stats` | Public Flask HTML dashboard/charts | Not implemented | Flask-owned UI | Defer to Next.js product scope |
| `/admin/*`, `/setup`, token/admin APIs | Flask role/session/CSRF-protected operations | No complete parity | Missing | Freeze authorization first |
| `GET /admin/backup/download` | Admin-only SQLite/data archive | Not implemented | Missing/high risk | Disposable-only design |
| `POST /admin/backup/restore` | Admin-only upload; current restore replaces data children | Not implemented | Missing/high risk | Require security/product approval |
| `WS /api/multiplayer` | Flask relay | Not implemented | Outside M6.3 | M7 only |

Important compatibility facts:

1. The M6.2b score write difference is intentionally approved in
   [`38-m6-2b-anonymous-score-ingestion-adr.md`](38-m6-2b-anonymous-score-ingestion-adr.md).
2. Fastify score validation is stricter than Flask coercion: it rejects
   non-string names, nested values, fractional/negative/out-of-range scores,
   and names over 23 UTF-8 bytes. This is a deliberate divergence.
3. Both implementations parameterize domain values. Future statistics SQL
   must retain fixed, allow-listed grouping and ordering expressions.
4. No evidence authorizes public aggregates to identify owners, devices, or
   authenticated principals.

## 5. Database and operational analysis

### 5.1 Schema and access paths

Relevant structures are `scores`, `runs`, `samples`, and `download_events`.
Indexes are `scores_game_score_idx(game, score DESC, created_at ASC)`,
`samples_run_frame_idx(run_id, frame)`, `samples_run_frame_time_idx(run_id,
frame_us)`, the unique `(run_id, frame)` constraint, and the two
`download_events` indexes on game/time and architecture.

The explicit sample index duplicates the unique constraint key. Removal is not
part of M6.3 without measured evidence and an approved schema decision.

### 5.2 Retention and archival

There is no score retention, archive, moderation, or automatic deletion job.
M6.2b's `scoresMaxRows` is a disposable writer admission threshold only. It
does not preserve historical data, compact SQLite, limit WAL growth, or solve
filesystem exhaustion. Anonymous submissions are at-least-once and have no
idempotency key.

**Recommendation:** document and measure retention first. If archival becomes
necessary, use an explicit export/archive artifact with an auditable operator
action and reviewed restore path. Do not change the `scores` schema or add
automatic deletion for the initial M6.3 slice.

### 5.3 SQLite capacity and concurrency

Fastify configures a busy timeout and uses `BEGIN IMMEDIATE` for isolated score
and metrics writes. M6.2b tests locked/busy behavior, concurrent inserts,
rollback, and `PRAGMA integrity_check` in disposable containers. The score
limiter is process-local, bounded, evicts stale/oldest client buckets, resets
on restart, and is not shared across replicas.

Open gaps are filesystem free-space/WAL telemetry, a checkpoint policy,
coverage of non-score growth (samples, download events, backups), historical
report materialization, multi-instance rate limiting, and full-disk recovery.

**Recommendation:** add read-only operational diagnostics and disposable load
evidence, not an application-level deletion policy. Redis or another global
limiter is not justified until multi-instance deployment is approved and
measured as a requirement.

### 5.4 Backup and recovery

Flask snapshots SQLite with the backup API and stores the database plus data
directory in a ZIP manifest. The current restore reads the upload into memory,
extracts it, validates only basic presence/path/database-open conditions,
deletes existing data children, and copies replacement content. Existing audit
documents record sensitive settings and destructive restore as unresolved risks.

Fastify has publication-operation backups and reconciliation for the isolated
publishing writer, but no full-store backup/restore parity.

**Recommendation:** define archive limits, manifest/schema validation, secret
redaction/encryption and key ownership, staged extraction, a pre-restore
snapshot, recoverable replacement, failure injection, and authorization before
coding. All tests target disposable copies only.

## 6. Security assessment

### Preserved controls

* score/metrics SQL values are parameterized;
* score input and metrics body/sample/database work are bounded before writes;
* score and metrics writers are isolated, gated, and disabled by default;
* stable public score/metrics errors hide raw storage exceptions;
* metrics detail and all export formats share owner/administrator policy;
* arbitrary `X-Forwarded-For` is not trusted by the score source limiter;
* firmware score and metrics shapes remain credential-free.

### Remaining risks

Anonymous scores are forgeable by design; `player` is an unverified nickname.
Retries can create duplicate rows. Process-local limits do not coordinate
across replicas and can combine classroom consoles behind one NAT address.
Public score rows currently include `submitted_by` and player text. Backup
restore is destructive and archives may contain secrets. Statistics need fixed
allow-listed SQL and bounded limits. Historical exports must not load unlimited
rows into memory. Future admin mutations must retain session/CSRF/role/group
boundaries and must not rely on frontend routing for authorization.

No new dependency is recommended at this stage. Controls should remain
explicit, typed, bounded, and reusable by the future Fastify backend.

## 7. Outstanding M6.2b concerns and ownership

| Concern | Current evidence | M6.3 treatment | Owner |
| --- | --- | --- | --- |
| Retention/archival | No job; row gate is disposable-only | Decide and measure; no automatic deletion | Product + operations |
| SQLite/WAL/disk capacity | Busy timeout and row gate only | Disposable diagnostics/load evidence | Operations |
| Anonymous abuse | Process-local bounded limiter | Keep; decide whether multi-instance scale is real | Product + operations |
| Shared NAT fairness | One source bucket may combine consoles | Document trade-off; do not trust arbitrary proxy headers | Product |
| Duplicate retries | No firmware idempotency key | Preserve at-least-once; no heuristic dedupe | Firmware/product |
| Public aggregates | `/api/stats/*` remain Flask public | Freeze field/privacy policy before parity | Product |
| Backup growth | Full archive includes DB/data | Disposable staged backup/recovery gate | Operations/security |
| Flask score-auth divergence | Intentional M6.2b decision | Do not modify Flask; cutover blocked | Migration owner |

## 8. Proposed architecture

**Recommendation:** keep current domain boundaries and add M6.3 in gates:

1. **Statistics read gate:** a Fastify statistics service reads through the
   read-only manager, uses fixed query builders, clamps limits, preserves Flask
   envelopes, and performs no writes.
2. **Operational evidence gate:** disposable measurements cover row counts,
   SQLite/WAL size, query duration, busy behavior, export bounds, and archive
   size. Diagnostics stay out of public responses without an approved contract.
3. **Backup/recovery gate:** reuse SQLite snapshot and publication-backup
   conventions, stage extraction, validate before replacement, and target only
   an explicit disposable root.
4. **Administration gate:** reuse `AuthService`, principal/role/group
   predicates, CSRF/session helpers, and typed schema. Mutations stay behind
   the writer gate and outside Traefik.
5. **Integrated gate:** compare Flask/Fastify responses in a fresh Compose
   project while Flask remains route and operational writer owner.

Drizzle remains a typed mapping/inspection layer, not a migration engine. No
schema migration, score identity table, Redis service, or firmware credential
is recommended for M6.3.

## 9. Incremental implementation plan

### Step 1 — Freeze the M6.3 product boundary

Resolve the missing formal submilestone definition. Expected changes are only
a decision record and, after approval, the roadmap section. Reuse the M6
roadmap, M6.1 report, and M6.2b ADR/report. There is no database operation.
Acceptance is a named in/out route list, explicit privacy policy, and rollback
owner. Rollback is to discard the decision record; Flask remains unchanged.

### Step 2 — Read-only statistics parity

Add `backend/src/stats/service.ts`, `backend/src/stats/routes.ts`, sanitized
fixtures, and minimal app registration/config changes. Reuse
`ReadonlyDatabaseManager`, typed schema, catalog lookup, Flask statistics
fixtures, and `encodePythonJson`. Preserve envelopes, date/granularity
parsing, limits, ordering, and empty responses. Use only parameterized reads
on `download_events`, `scores`, and `runs`; add no DDL or writes.

Tests must compare Flask/Fastify method, status, content type, fields, ordering,
filters, dates, empty data, SQL-injection-shaped values, and query plans.
Docker must use a fresh read-only fixture profile with no Traefik route.
Acceptance is parity for all four API statistics routes plus write-spy or
`query_only` evidence. Rollback is optional Fastify registration removal.

### Step 3 — Capacity and export evidence

Use tests and an operations report, not production code, to measure synthetic
row growth, database/WAL size, checkpoints, concurrent readers/writers,
timeouts, bounded exports, limiter restart/eviction/NAT behavior, and
integrity. Reuse current limits, busy timeout, reconciliation, and Compose
writer volumes. No public response or schema change is allowed. Acceptance is
a documented capacity envelope and alert/rollback trigger with no deletion
policy. Destroy only the disposable Compose project after testing.

### Step 4 — Staged backup/restore in isolation

Add an isolated backup service/tests and fixture manifest only after the secret
and restore policy is approved. Reuse Flask manifest ABI, SQLite snapshot
behavior, publication backups, path-safety helpers, and admin predicates.
Require bounded archive bytes/entries, duplicate/unsafe-path rejection, secret
handling, admin authorization, browser CSRF, pre-restore recovery, stable
errors, and failure injection at every replace boundary. Restore only
disposable roots; verify integrity and reconciliation. Acceptance is
recoverability after every simulated failure. No operational restore is
permitted.

### Step 5 — Administrative/settings parity

Only after Step 1 decisions, add a typed `backend/src/admin/` slice and tests.
Reuse `AuthService`, CSRF/session/token code, role/group predicates, schema,
and Flask fixtures. Preserve identifiers, redirects/JSON where retained,
group-vs-role distinctions, self-demotion protection, and secret handling.
Use disposable writer transactions and allow-listed settings keys.

Test anonymous/user/editor/admin, CSRF, bearer, races, rollback, token/session
compatibility, and self-protection. Compose uses `writer-init`/`writer` only,
with no public labels. Acceptance is that unauthorized mutations never
succeed. Rollback is to keep all TypeScript writer flags disabled.

### Step 6 — Integrated M6 gate

Run the full route, firmware, auth, export, statistics, backup, integrity,
reconciliation, Docker, frontend, and Python matrices against isolated data.
Prove no operational mount and no dual writer. Acceptance requires every
approved M6.3 criterion to be green while M8 remains a separate cutover gate.

## 10. Testing and verification strategy

| Layer | Required evidence |
| --- | --- |
| Unit | Limit parsing, date/granularity allow-list, score/metrics boundaries, stable errors, authorization, archive validation |
| HTTP integration | Flask/Fastify method, route, status, content type, envelope, fields, ordering, filters, limits, empty responses |
| Firmware | Existing `../PRG32` score/metrics fixtures; no firmware changes; anonymous writes remain accepted in isolated Fastify |
| SQLite | Schema/index read-only comparison, parameter binding, query plans, busy timeout, concurrency, rollback, integrity |
| Authorization | Anonymous, owner, other user, editor, admin, bearer-only, session+CSRF, missing/mismatched CSRF, anonymous-run policy |
| Security | Injection-shaped filters, nested/oversized payloads, archive traversal/duplicates, sanitized errors, proxy headers, secrets |
| Capacity | Synthetic growth, row/WAL/database/archive size, bounded exports, limiter restart/NAT behavior, no deletion |
| Recovery | Corrupt/missing manifests, malformed SQLite, replace failures, pre-restore recovery, restart, staged validation |
| Docker | Compose config, fresh profile volumes, disabled-by-default writer, explicit disposable enablement, health, cleanup |
| Regression | Full pytest, backend typecheck/lint/Vitest/build, frontend Node 24 checks, `py_compile`, `git diff --check` |

Tests must never use production data or the operational SQLite path. Destructive
operations must target a fresh named disposable Compose project.

## 11. Risks and unresolved product decisions

The following decisions block claiming M6.3 implementation acceptance:

1. Is score retention indefinite, operator-archived, or time-bounded? Who may
   archive and how is historical integrity proved?
2. Are `/api/stats/scores` and `/api/stats/runs` public aggregate-only
   endpoints, and must `submitted_by` be excluded from public statistics?
3. Is one Fastify process the future deployment shape? If not, what trusted
   global rate-limit mechanism is approved?
4. What database/WAL/free-space thresholds and alerting channels are required,
   and who owns full-disk recovery?
5. Should Flask `/scores` and `/stats` remain until Next.js feature work, or is
   a separate Fastify compatibility page required?
6. What backup secret policy is approved: redaction/reinjection, encryption, or
   deployment-managed secret storage, and who controls the key?
7. Must restore preserve current destructive semantics, or may the target
   require a staged recoverable operator workflow?
8. Which admin/settings routes are in M6.3 and which remain Flask until M8/M9?
9. Is pagination beyond the existing leaderboard limit of 100 required?

Main risks are anonymous abuse, unbounded historical growth, backup secret
exposure, destructive restore, statistics privacy drift, and accidental dual
writes. None is solved by adding a frontend route.

## 12. GO/NO-GO recommendation

* **GO:** approve the M6.3 boundary and begin the isolated read-only
  statistics/fixture slice.
* **GO with conditions:** perform disposable backup/admin experiments only after
  retention, aggregate privacy, backup secret, and restore decisions are
  recorded.
* **NO-GO:** public Fastify routing, operational SQLite writes, production
  retention/deletion, dual writers, Traefik changes, firmware changes, or Flask
  removal.

M6.3 is **not implemented** by this document. Flask remains the operational
backend and sole operational writer. The next implementation should start with
the read-only statistics contract gate, not production cutover or retention
deletion.

## Evidence inspected

* [`13-api-contracts.md`](13-api-contracts.md)
* [`18-typescript-backend-migration-assessment.md`](18-typescript-backend-migration-assessment.md)
* [`19-revised-migration-roadmap.md`](19-revised-migration-roadmap.md)
* [`29-m5-a-cross-repository-architecture-audit.md`](29-m5-a-cross-repository-architecture-audit.md)
* [`30-m5-a-client-api-traceability.md`](30-m5-a-client-api-traceability.md)
* [`35-m6-1-metrics-runs-samples-report.md`](35-m6-1-metrics-runs-samples-report.md)
* [`37-m6-2a-score-authentication-adr.md`](37-m6-2a-score-authentication-adr.md)
* [`38-m6-2b-anonymous-score-ingestion-adr.md`](38-m6-2b-anonymous-score-ingestion-adr.md)
* [`39-m6-2b-anonymous-scores-report.md`](39-m6-2b-anonymous-scores-report.md)
* `cartridge_store/scores.py`, `metrics.py`, `stats.py`, `users.py`, and
  `app.py`
* `backend/src/scores/`, `backend/src/metrics/`, `backend/src/auth/`,
  `backend/src/db/`, `backend/src/app.ts`, and `docker-compose.yml`
* `../PRG32/components/prg32/prg32_http_scores.c` and
  `../PRG32/components/prg32/prg32_metrics.c`

## Verification of assessment boundary

No application source code, operational database, production configuration, or
`../PRG32` file was modified for this assessment. The only intended repository
addition is this document. `git diff --check` was run after creation.
