# M5.A — Cross-Repository API, Data Model & Architecture Audit

**Date:** 2026-10-12
**Status:** audit complete; implementation not authorized by this milestone
**Decision:** **NO-GO for M5.2 publication/review cutover** until the consistency and firmware-auth gates below are resolved.

## Executive summary

The official companion repository is available locally at `../PRG32` and was
audited as a separate, read-only repository. It is the source of truth for
firmware/tool consumers, not a generic adjacent directory.

Repository evidence:

Companion remote: `https://github.com/riscv-prg32/PRG32`.

| Repository | Location | Revision | Branch | Working tree |
| --- | --- | --- | --- | --- |
| CartridgeStore | current checkout | current working tree | current checkout | already dirty from prior milestones |
| PRG32 | `../PRG32` | `ff53e81fa5825771a25a09af34f165e75378f1aa` | `main` | dirty before this audit: `docs/quickstart-qemu.md`, `run-qemu` |

PRG32 consumers actively depend on the following Cartridge Store surfaces:

* physical firmware setup fetches `/api/games` and downloads architecture-specific
  `.prg32` binaries;
* the host `prg32 store` CLI discovers the service, lists cartridges, downloads
  binaries, and uploads `/api/publish/bundle` with a Bearer token;
* optional firmware score synchronization posts JSON to `/api/scores`;
* optional streaming metrics posts `/api/runs`, `/api/metrics/batch`, and
  `/api/runs/<id>/finish`.

The store's current public catalog is filesystem-authoritative (`index.json` plus
cartridge files). SQLite is authoritative for users/authentication, scores,
metrics, download events, and submission/review records. There is no SQLite row
that owns a published catalog version. This split is workable and should be
retained for the next migration step, but its consistency rules must be made
explicit before a second writer is allowed.

The audit found two blocking gates:

1. Flask publication writes cartridge files and `index.json`, then updates the
   submission row. SQLite and filesystem cannot commit atomically; the current
   compensation covers failures during the filesystem publication loop but does
   not provide a durable operation/reconciliation record for a process crash or
   a later database-commit failure (`cartridge_store/review.py:209-258`).
2. When optional PRG32 Wi-Fi score synchronization is enabled, firmware posts
   `/api/scores` without an Authorization header (`../PRG32/components/prg32/prg32_http_scores.c:458-500`),
   while Flask protects that endpoint with `login_required`
   (`cartridge_store/scores.py:100-102`). This is a conditional firmware/API
   compatibility defect, not a reason to weaken authentication silently.

No PRG32 files, production data, schemas, routes, or deployment configuration
were modified by this audit.

## Scope and methodology

Read-only inspection covered:

* the required modernization reports and API contract freeze;
* Flask routes/services, SQL DDL, SQL call sites, backup/recovery paths, and
  tests;
* the TypeScript/Fastify foundation, Drizzle schema mapping, read-only catalog,
  auth foundation, and isolated M5.1 submission writer;
* `../PRG32` C firmware, Python store tooling, cartridge scripts, configuration,
  API/metrics documentation, and tests;
* Compose/Docker boundaries and the Next.js foundation.

The inventory was built from endpoint strings and call sites, then traced to
handlers and storage. Endpoint names that exist in firmware but are served by
the board itself (for example `/api/runtime`, `/api/games` POST, and
`/api/performance.json`) were not incorrectly counted as Cartridge Store
consumers. Representative `EXPLAIN QUERY PLAN` checks ran against an in-memory
synthetic SQLite database containing the production DDL shape; no operational
database was opened or changed.

## Architectural overview

### Current ownership

| Concern | Current authority | Evidence |
| --- | --- | --- |
| Public catalog and binary files | Flask `GameStore`, filesystem | `cartridge_store/store.py:46-73,75-157` |
| Catalog index | `/data/index.json` | `cartridge_store/store.py:47,100-156` |
| Published artifacts | `/data/cartridges/<id>/<version>/<architecture>.prg32` | `cartridge_store/store.py:94-156` |
| Pending submissions | SQLite row plus `/data/pending/<submission_id>/` | `cartridge_store/review.py:71-125` |
| Users, groups, tokens, settings | SQLite | `cartridge_store/auth/__init__.py:45-96`, `settings.py:14-18` |
| Scores | SQLite | `cartridge_store/scores.py:13-32` |
| Metrics/runs/samples | SQLite | `cartridge_store/metrics.py:18-64` |
| Download telemetry | SQLite | `cartridge_store/stats.py:20-45,52-68` |
| Multiplayer state | process memory; no SQLite table | `cartridge_store/multiplayer.py:289-329` |
| TypeScript catalog | read-only filesystem implementation | `backend/src/catalog/catalog.ts:183-240` |
| TypeScript M5.1 writer | disposable-only SQLite/filesystem boundary | `backend/src/submission/service.ts:120-184` |

Flask remains the only operational writer. Fastify currently has a controlled
disposable writer profile, not production authority. The Next.js frontend is a
foundation shell and is not a domain writer.

### PRG32 integration boundary

The firmware constants preserve the required ABI values: `_prg32store`, `_tcp`,
port `5080`, `prg32-store-discovery-1.0`, and architectures `esp32c6`/`qemu`
(`../PRG32/main/prg32_config.h:182-191`). The host tool uses the same discovery
ABI and sends Bearer tokens for publishing
(`../PRG32/prg32/store/utils.py:11-16,63-89`).

The firmware has two different HTTP worlds:

* the board-local API (`components/prg32/prg32_http_games.c`) exposes runtime,
  upload, local scores, screenshots, and performance data;
* the external Cartridge Store API is consumed by `prg32_setup_store.c` and
  `prg32_http_scores.c`, while metrics use the configured metrics server URL.

This distinction must remain explicit in the Fastify route map.

## Findings

### M5A-001 — BLOCKER — No durable publication consistency boundary

**Evidence:** `cartridge_store/review.py:209-258` rebuilds and publishes each
variant through `GameStore`, commits the submission status afterward, then
removes pending files. `cartridge_store/store.py:94-156` writes the binary and
replaces `index.json`; `app.py:1295-1320` has in-process byte backups for a
publication loop but no persisted operation identifier or reconciliation log.

**Impact:** a process crash or a database failure after filesystem publication
can leave a verified-looking catalog and a pending/rejected database row, or
leave staged files without a corresponding row. SQLite transactions cannot
atomically include filesystem renames.

**Recommendation:** before M5.2, define a durable operation/reconciliation
boundary while retaining the current filesystem catalog. At minimum record the
submission ID, intended variant paths, pre/post SHA-256 values, and operation
state; provide a read-only consistency command that detects missing index files,
orphan binaries, stale pending directories, and status/filesystem disagreement.
Use a stage → verify → replace → index-write → database-state transition with
restart-safe recovery. Do not introduce a distributed transaction framework.

**Classification:** `MIGRATION_REQUIRED`; suggested milestone M5.2. Complexity:
medium. Compatibility impact: none if the public index and binary bytes remain
unchanged.

### M5A-002 — BLOCKER (conditional) — Firmware score write lacks Flask auth

**Evidence:** firmware builds a JSON `POST` to `/api/scores` with only
`Content-Type` and no Bearer header (`../PRG32/components/prg32/prg32_http_scores.c:458-500`).
The Flask route is decorated with `@login_required`
(`cartridge_store/scores.py:100-102`). The feature is optional and disabled by
default in the inspected profile, but `PRG32_WIFI_SCORES_ENABLE` enables it in
physical builds (`../PRG32/main/prg32_config.h:126-138`).

**Impact:** enabled firmware score sync receives `401` unless an unshown proxy
or trusted-client exception exists. Replacing Flask with Fastify without a
reviewed solution would preserve the incompatibility.

**Recommendation:** decide one explicit compatibility contract before M6:
firmware adds a configured scoped token header, or the store exposes a narrowly
scoped authenticated ingestion mechanism with equivalent abuse controls. Do not
make the general score write anonymous and do not invent a token in the backend.
Add a cross-repository fixture and physical/QEMU-compatible HTTP test after the
decision.

**Classification:** `MIGRATION_REQUIRED`; suggested milestone M6 preflight.

### M5A-003 — HIGH — Catalog ownership is clear but not represented relationally

**Evidence:** published identity, version, architecture, metadata, and SHA-256
are stored in `index.json` and the PRG32 trailer/file; `cartridge_submissions`
stores only JSON metadata and pending paths (`cartridge_store/review.py:19-37`).
There is no `cartridge_versions` or `cartridge_variants` table in the current
schema. Fastify M3 correctly reads the index/filesystem and intentionally does
not write download events (`docs/modernization/23-m3-read-only-api-parity-report.md:25-33,60-63`).

**Impact:** a future relational catalog introduced during backend migration
could become a second authority and drift from firmware-visible index data.

**Recommendation:** retain the filesystem/index as catalog authority through M8.
If a relational projection is later needed, define it as derived, add hashes and
generation/version metadata, and validate it against the index rather than
switching authorities implicitly.

**Classification:** `SAFE` as an operating rule; any new authoritative schema
is `MIGRATION_REQUIRED`, suggested after M8 only if measured requirements justify
it.

### M5A-004 — HIGH — Ownership is nullable for anonymous metrics by design

**Evidence:** `runs.user_id` is nullable (`cartridge_store/metrics.py:62-64`),
firmware metrics posts no user authentication (`../PRG32/components/prg32/prg32_metrics.c:239-312`),
and `can_view_run` allows owner or admin, but anonymous/unowned runs are admin
only (`cartridge_store/users.py:37-45`). Detail and export handlers call this
same check (`users.py:73-91`, `metrics.py:301-365`).

**Impact:** the policy is internally consistent, but anonymous firmware runs
cannot be owner-visible after ingestion. A TypeScript migration must not infer
ownership from `submitted_by`, board ID, or game name.

**Recommendation:** preserve nullable ownership and the owner/admin policy;
document anonymous runs as admin-only. If product requirements later need device
ownership, add an explicit authenticated device/token relationship as a reviewed
contract, not a heuristic.

**Classification:** `SAFE` to preserve; device ownership is `MIGRATION_REQUIRED`
and deferred to M6+.

### M5A-005 — HIGH — Schema evolution has no migration history

**Evidence:** Flask initializes tables with `CREATE TABLE IF NOT EXISTS` and
adds columns opportunistically through `ALTER TABLE` in
`cartridge_store/database.py:27-34`; metrics and scores call this during request
setup (`metrics.py:59-64`, `scores.py:13-32`). Fastify has a Drizzle mapping but
no applied migration history (`backend/src/db/schema.ts:4-194`).

**Impact:** schema shape is reproducible for the inspected version, but future
changes can be order-dependent and difficult to roll back while Flask remains
active. A second writer must not guess whether a column/index exists.

**Recommendation:** keep the current schema unchanged for M5.2; create a
read-only schema fingerprint and reviewed versioned migration plan before M6.
Do not generate or apply a migration automatically from the Drizzle mapping.

**Classification:** `MIGRATION_REQUIRED`; suggested M2.1/M6 gate.

### M5A-006 — MEDIUM — Redundant sample index and unbounded historical tables

**Evidence:** `samples` has both the unique `(run_id, frame)` constraint and an
explicit `samples_run_frame_idx` with the same key
(`cartridge_store/metrics.py:35-55`). `metrics`, `scores`, and
`download_events` have no retention job. The metrics report loads all samples
into Python for summaries (`metrics_report.py:36-85`), and user run summaries
re-load every run's samples (`users.py:94-117`).

**Impact:** duplicate index maintenance increases ingestion write cost; samples,
scores, and download events can grow without a documented policy. The report
paths can become memory-heavy as run sizes grow.

**Recommendation:** measure on representative synthetic volumes before removing
the redundant index. Add an explicit retention/archive decision and bounded
export policy in M6. Consider SQL aggregates or a bounded sample query only
after preserving report output compatibility.

**Classification:** `SAFE` to document; index removal or retention migration is
`MIGRATION_REQUIRED`, suggested M6.

### M5A-007 — MEDIUM — Review authorization intentionally differs from cartridge admin

**Evidence:** review API/UI routes require the `editors` group only
(`cartridge_store/review.py:343-405`, `auth/__init__.py:531-549`), while cartridge
administration accepts `admin` role OR `editors` group
(`cartridge_store/app.py:494-531`).

**Assessment:** this is a real inconsistency in authorization predicates, not a
normalization issue. It may be intentional for editor catalog maintenance, but
the repository does not state that intent. It must not be silently changed in
Fastify.

**Recommendation:** treat the current predicates as frozen compatibility behavior
until product/security owners explicitly choose one policy. Add route-by-route
authorization fixtures before M6/M7.

**Classification:** `DEFER` behavior change; documentation/tests are `SAFE`.

### M5A-008 — MEDIUM — Multiplayer is process-local and has no persistence model

**Evidence:** Flask creates an in-memory `MultiplayerHub` and registers the
WebSocket on `/api/multiplayer` (`cartridge_store/multiplayer.py:289-329`). PRG32
defaults to a separate configured WebSocket server URL
(`../PRG32/components/prg32/prg32_multiplayer.c:20-21,415-424`); QEMU uses an
offline stub. No multiplayer table exists.

**Impact:** multiple replicas, restarts, and cross-process connections cannot
share peer state. This is a runtime scaling constraint, not missing relational
normalization.

**Recommendation:** keep it single-process through M7 parity, document the
limitation, and test upgrade/message/peer caps. Do not add SQLite persistence for
ephemeral peer state.

**Classification:** `DEFER`; scaling beyond one process requires a separate
architecture decision.

## Storage and source-of-truth decision

Three options were compared:

| Option | Reliability/complexity | Compatibility and migration risk | Decision |
| --- | --- | --- | --- |
| A. Existing filesystem/index authority | Lowest change; binary serving stays direct; requires reconciliation | Lowest; preserves firmware and backups | **Use through M8** |
| B. SQLite-authoritative catalog with derived files | Strong relational queries, but requires atomic projection and new catalog schema | High; risks index/firmware and rollback drift | Do not introduce now |
| C. Hybrid with explicit boundaries | Keeps files/index authoritative and SQLite for workflow/telemetry | Moderate; requires documented projections and checksums | **Use as the migration model** |

The recommended model is C in operational terms: the public catalog remains A,
while SQLite remains authoritative for identity/auth, workflow state, metrics,
scores, and telemetry. The index is a compatibility representation, not a cache
that Fastify may regenerate casually.

## Verification evidence

Read-only verification performed:

* repository revision, remote, branch, status, and submodule checks;
* endpoint and SQL static searches across both repositories;
* Flask/Fastify/PRG32 source inspection and required modernization documents;
* synthetic SQLite `EXPLAIN QUERY PLAN` for scores, samples, submissions, and
  download-event queries. Existing indexes were selected for all tested filters;
* existing milestone checks had already passed before this audit: Flask pytest,
  TypeScript typecheck/lint/tests/build, Next.js typecheck/lint/tests/build,
  Compose rendering, Docker builds, and `git diff --check`.

Commands executed during this audit:

| Command | Result |
| --- | --- |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | **PASS — 64 passed** |
| `./.venv/bin/python -m pytest -q` | Not a valid validation environment: Python 3.9 lacks `hashlib.scrypt`; no source change made |
| `pytest -q` | Not available on the system PATH; rerun with the repository's Python 3.13 environment above |
| `git diff --check` | **PASS** |
| trailing-whitespace scan over updated audit/roadmap documents | **PASS** |
| `sqlite3 ':memory:'` representative `EXPLAIN QUERY PLAN` checks | **PASS**; existing relevant indexes selected |

No PRG32 build was requested or run; this milestone did not modify that
repository. No operational database was opened.

## Final decision and next gate

M5.A is complete as an audit and does not mark M5.2, M6, M7, or M8 complete.

Go for:

* preserving the current filesystem/index catalog authority;
* continuing read-only Fastify parity and isolated fixture work;
* keeping the M5.1 disposable pending writer isolated.

No-go for:

* public Fastify publication/review cutover;
* a second writer against the operational SQLite/filesystem pair;
* changing score authentication semantics without a PRG32-compatible decision;
* adding a relational catalog or multiplayer persistence table without measured
  requirements.

The ordered work is recorded in
`docs/modernization/32-m5-a-data-architecture-optimization-plan.md` and the
client/API evidence in `30-m5-a-client-api-traceability.md`.
