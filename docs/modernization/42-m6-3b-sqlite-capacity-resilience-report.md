# M6.3b — SQLite Capacity & Operational Resilience Report

**Date:** 2026-10-12
**Status:** complete as an isolated assessment and test-infrastructure milestone
**Operational writer:** Flask remains the only operational writer
**Production cutover:** not authorized
**Schema migration:** none

## 1. Executive summary

M6.3b established a reproducible SQLite capacity and resilience harness for the
isolated TypeScript backend. It generated deterministic small, medium, and large
databases in the operating-system temporary directory, measured database growth
and read latency, captured query plans, exercised WAL/checkpoint behavior,
tested concurrent readers and a writer, verified the process-local score rate
limiter, and demonstrated a consistent SQLite backup while another disposable
writer was active.

No Flask code, firmware, Next.js code, production routing, operational database,
Docker volume, or SQLite schema was changed. No retention, deletion, monitoring
job, backup endpoint, or restore workflow was introduced.

The current capacity bottleneck is the administrator run list: it joins and
aggregates all samples per run and then sorts the result. At the large synthetic
tier it measured a median of 79.764 ms and a p95 of 135.029 ms in the service
layer. Global score and download statistics also scan/aggregate large portions
of their tables, while filtered score and per-run sample reads use existing
indexes effectively.

**Recommendation:** GO for an explicitly approved M6.3c backup/restore design
and implementation assessment; NO-GO for production Fastify writes, automatic
retention/deletion, schema/index changes, or Flask retirement. M6.3c and M6.3d
are not completed by this report.

## 2. Test environment

The experiments ran locally on macOS `darwin/arm64` with Node.js `v24.20.0`,
selected using `nvm use 24`, pnpm `12.5.1`, and the repository's existing
`better-sqlite3` dependency. The fixture runner is
`backend/tests/operations/m63b-run.ts`, invoked by the new
`pnpm capacity:check` script.

Every generated database was placed below the OS temporary directory and removed
by the harness. The large run was started only after checking `/tmp`'s volume;
144 GiB was available and the generated database was 141.90 MiB. No production
path was read or mounted.

Timing methodology:

* SQLite and service-layer operations used three warmups and 15 measured
  repetitions.
* Fastify injection used two warmups and 10 measured repetitions, awaiting each
  request before recording the next measurement.
* Results report median, p95, and maximum wall-clock time. They are comparative
  local measurements, not product SLOs.
* The anonymous Fastify `GET /api/runs` result is intentionally empty. The
  administrator run-list query was measured through `MetricsService` so that
  the expensive authorized path is not hidden by the public visibility policy.

## 3. Database schema inventory

The relevant operational tables and access paths are:

| Table | Synthetic rows (large) | Existing relevant indexes | Main workload |
| --- | ---: | --- | --- |
| `scores` | 100,000 | `scores_game_score_idx(game, score DESC, created_at ASC)` | public leaderboard and score statistics |
| `runs` | 10,000 | primary key on `run_id` | metrics run list, detail, run statistics |
| `samples` | 1,000,000 | unique `(run_id, frame)`, `samples_run_frame_idx`, `samples_run_frame_time_idx` | firmware samples and exports |
| `download_events` | 100,000 | `download_events_game_idx(game_id, downloaded_at)`, `download_events_arch_idx(architecture)` | public download statistics |

The wider unified schema remains the 11-table model documented by
`docs/modernization/31-m5-a-sqlite-schema-assessment.md`. M6.3b did not add,
remove, or modify any table, index, constraint, or migration.

The explicit `samples_run_frame_idx` remains a measured migration candidate
because it duplicates the unique-key access path. It was not removed: changing
it would require a reviewed schema migration and before/after compatibility
evidence.

## 4. Synthetic workload methodology

`backend/tests/operations/m63b-harness.ts` creates the existing table shape,
existing indexes, a deterministic catalog fixture, and deterministic values.
Rows are inserted in bounded transactions. No workload is generated against
the configured Flask database.

The actual workload tiers were:

| Tier | Scores | Runs | Samples | Downloads | Main DB size |
| --- | ---: | ---: | ---: | ---: | ---: |
| small | 1,000 | 100 | 10,000 | 1,000 | 1,515,520 B / 1.45 MiB |
| medium | 10,000 | 1,000 | 100,000 | 10,000 | 14,766,080 B / 14.08 MiB |
| large | 100,000 | 10,000 | 1,000,000 | 100,000 | 148,795,392 B / 141.90 MiB |

The large tier was executed, not extrapolated. The measurements are synthetic
and should not be treated as a production growth forecast: real metadata,
catalog distribution, filesystem behavior, request concurrency, and retention
will differ.

## 5. Query performance results

The following table records the direct SQLite median/p95 in milliseconds for
the main read paths. The full JSON result is reproducible with the command in
the operations README.

| Path | Small median/p95 | Medium median/p95 | Large median/p95 |
| --- | ---: | ---: | ---: |
| `GET /api/scores` | 0.111 / 0.120 | 0.515 / 0.522 | 4.622 / 4.666 |
| `GET /api/scores?game=game-01` | 0.037 / 0.049 | 0.037 / 0.058 | 0.039 / 0.048 |
| `GET /api/stats/downloads` | 0.245 / 0.254 | 2.165 / 2.327 | 23.004 / 23.717 |
| `GET /api/stats/downloads/:game_id` | 0.027 / 0.030 | 0.079 / 0.088 | 0.827 / 0.880 |
| `GET /api/stats/scores` | 0.107 / 0.113 | 0.511 / 0.519 | 4.580 / 4.671 |
| `GET /api/stats/runs` | 0.015 / 0.025 | 0.013 / 0.014 | 0.015 / 0.018 |
| `GET /api/runs` administrator aggregation | 0.674 / 0.727 | 6.305 / 6.460 | 77.572 / 81.924 |
| `GET /api/runs/:run_id` sample detail | 0.065 / 0.078 | 0.060 / 0.067 | 0.063 / 0.067 |

The service-layer administrator run-list path measured 0.679/0.692 ms at small,
6.338/6.353 ms at medium, and 79.764/135.029 ms at large. The large p95 was
affected by local scheduling variance; its maximum was 336.861 ms. Detail,
CSV, and Markdown exports for one 100-sample run stayed below 0.4 ms in the
large run, but export limits remain necessary for unusually large individual
runs.

Fastify injection added the expected serialization/router cost. At large:

| Path | HTTP median/p95 |
| --- | ---: |
| `GET /api/scores` | 4.709 / 4.793 ms |
| `GET /api/stats/downloads` | 27.813 / 28.448 ms |
| `GET /api/stats/downloads/:game_id` | 1.410 / 1.528 ms |
| `GET /api/stats/scores` | 4.730 / 4.836 ms |
| `GET /api/stats/runs` | 0.818 / 0.829 ms |

## 6. Query-plan analysis

The plans were captured with `EXPLAIN QUERY PLAN` against each synthetic tier;
they were stable across tiers:

* Global score ordering: `SCAN scores` plus `USE TEMP B-TREE FOR ORDER BY`.
* Game-filtered scores: `SEARCH scores USING INDEX scores_game_score_idx`.
* Download series: covering scan of `download_events_game_idx` plus a temp
  B-tree for grouping.
* Per-game architecture totals: indexed search on
  `download_events_game_idx`, then temp B-trees for grouping and ordering.
* Run activity count: `SCAN runs`.
* Administrator run list: scan of the run primary-key index, indexed sample
  lookup through `samples_run_frame_time_idx`, and a temp B-tree for ordering.
* Samples for one run: `SEARCH samples USING INDEX samples_run_frame_idx`.

No index was added or removed. The evidence supports a future bounded review of
run-list aggregation and global statistics, not an unapproved schema change.

## 7. WAL and checkpoint findings

The disposable WAL experiment reported SQLite's default auto-checkpoint value
as 1,000 pages. With one reader transaction held open, 5,000 committed rows
produced:

| State | Main | WAL | SHM | Checkpoint result |
| --- | ---: | ---: | ---: | --- |
| Before manual checkpoint | 4,096 B | 65,952 B | 32,768 B | — |
| After `PASSIVE` | 4,096 B | 65,952 B | 32,768 B | `busy=0, log=16, checkpointed=3` |
| `TRUNCATE` while reader open | — | — | — | `busy=1, log=16, checkpointed=3` |
| After reader release and `TRUNCATE` | 53,248 B | 0 B | 32,768 B | `busy=0, log=0, checkpointed=0` |

The long reader did not produce a writer error, but it prevented WAL truncation.
This is the operational distinction: WAL permits the read/write overlap, while a
long-lived snapshot can delay reclaiming WAL bytes. No automatic checkpoint job
was introduced.

## 8. Concurrency and busy handling

The isolated concurrency experiment used four reader processes, one writer
process, WAL mode, and a 250 ms test-only busy timeout. All reader and writer
processes exited without errors. The committed writer produced 101 rows from an
initial one-row table. An intentional transaction failure left the same 101
rows, demonstrating rollback without a partial row.

This is evidence for the current bounded transaction behavior only. It does not
prove that a 250 ms timeout is sufficient for every deployment or that multiple
Fastify instances can coordinate writes. The operational default remains the
existing configured `PRG32_BACKEND_BUSY_TIMEOUT_MS` value (5,000 ms when unset).

## 9. Rate-limiter findings

The existing score limiter is an in-process token bucket keyed by Fastify's
direct request IP. It does not trust arbitrary `X-Forwarded-For` headers because
the application does not enable `trustProxy`. Its bounded map evicts old clients
at the configured maximum.

The deterministic check with a 10-request/60-second window, burst 3, and four
client slots observed:

* 3 burst requests accepted and 2 rejected for one client;
* at most 4 buckets retained after 20 client identities;
* a request was accepted again after the window elapsed.

The limiter is process-local: a restart resets it and multiple backend
instances do not share state. Clients behind one NAT address share a bucket.
No Redis, device credential, anonymous identity, or distributed limiter was
introduced. These limitations must remain explicit in the future Fastify
deployment decision.

## 10. Retention recommendation

The provisional policy is to preserve historical `scores`, `runs`, `samples`,
and `download_events` indefinitely until a separately approved archival or
deletion policy exists. M6.3b introduces no retention job and performs no
deletion.

The capacity admission signal should be based on all of:

1. SQLite main file size plus `-wal` and `-shm` sidecars;
2. filesystem free space, with headroom for at least one validated backup;
3. backup size and backup duration;
4. integrity-check and restore-validation status; and
5. run-list/statistics latency at representative cardinalities.

Archival and deletion are different decisions. Any future archive must preserve
run/sample, score, and download identifiers and must be proven restorable before
source deletion. No threshold is promoted to production policy by this report.

## 11. Backup consistency evidence

The supported `better-sqlite3` backup API was exercised on a small disposable
database in WAL mode while a second disposable process inserted 100 scores.
The backup and source both passed `PRAGMA integrity_check` with `ok`.

* Source sample rows: 10,000; backup sample rows: 10,000.
* Source scores before writer: 1,000; after writer: 1,100; backup scores:
  1,000. The backup therefore captured a coherent pre-writer snapshot.
* Source after the concurrent write: main 1,515,520 B, WAL 45,352 B, SHM
  32,768 B; backup: main 1,515,520 B, WAL 0 B, SHM 32,768 B.
* A destination with a missing parent failed without making the source unusable.
* A copy with a damaged SQLite header was rejected by open/integrity checking.

This is backup-consistency evidence, not a backup/restore migration. The
Flask backup format also contains filesystem cartridge data and therefore cannot
be declared compatible with a future TypeScript restore flow based only on this
SQLite test.

## 12. Failure simulation results

| Scenario | Result | Evidence |
| --- | --- | --- |
| Reader holds WAL snapshot during checkpoint | PASS | `TRUNCATE` returned `busy=1`; final truncate succeeded after release |
| Concurrent readers and writer | PASS | no child errors, committed count stable |
| Interrupted transaction | PASS | intentional failure rolled back the inserted row |
| Failed backup destination | PASS | source remained queryable and integrity-valid |
| Corrupted backup copy | PASS | damaged copy rejected or failed integrity check |
| Read-only/query-only API path | PASS | existing `readonly.test.ts` and stats tests reject DDL/DML |
| Forced disk exhaustion | NOT TESTED | intentionally not attempted on the host |
| Process kill during backup | NOT TESTED | no destructive process-kill experiment was necessary for this gate |
| Production restore/overwrite | NOT TESTED | explicitly deferred to M6.3c |

## 13. Operational monitoring recommendations

The future deployment should expose these as operator-side checks, not public
API diagnostics:

* monitor main DB, WAL, and SHM bytes separately and together;
* alert before free space can no longer hold the database plus one backup and
  temporary backup overhead;
* record backup start/end, byte size, duration, integrity result, and validation
  result;
* run `PRAGMA integrity_check` on a disposable or maintenance copy, not on
  every request;
* track run-list, download-statistics, and global-score latency by row count;
* retain a recovery runbook for busy/locked, read-only filesystem, failed
  backup, and corrupted-copy incidents;
* keep one operational writer until a future migration explicitly proves
  writer ownership and recovery behavior.

External monitoring infrastructure is outside this milestone and was not
added.

## 14. Identified risks

* `samples`, `runs`, `scores`, and `download_events` remain unbounded without a
  product retention decision.
* The administrator run list is an O(runs + samples) grouped join with a temp
  sort and is the first measured scalability concern.
* Global score and download aggregates scan and/or group large portions of their
  tables.
* WAL sidecars can remain large while readers hold snapshots; main-file size
  alone is not sufficient for capacity alerts.
* The rate limiter is process-local and has NAT fairness limitations.
* Flask backup artifacts combine SQLite and filesystem state; SQLite-only proof
  does not establish cartridge-store restore compatibility.
* No forced disk-exhaustion or process-kill backup test was run.

## 15. Deferred architectural decisions

M6.3b deliberately defers:

* backup/restore implementation and format migration (M6.3c);
* any retention/archive/delete job;
* index/schema changes, including removal of the duplicate sample index;
* distributed rate limiting;
* public capacity or diagnostic endpoints;
* production Fastify writes, routing, and cutover;
* Flask retirement and Next.js storefront features.

## 16. Verification results

The final checks were executed after the harness and report changes:

| Check | Command/result |
| --- | --- |
| Backend | `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run check` in `backend/` — PASS; typecheck, lint, build, 14 test files, 79 tests |
| Flask regression | `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` — PASS; 64 tests |
| Python compilation | `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py tests/compatibility/generate_*.py` — PASS |
| Frontend static checks | Node 24 `pnpm run typecheck`, `pnpm run lint`, `pnpm run test` — PASS; 5 tests |
| Frontend production build | `FLASK_PROXY_TARGET=https://api.prg32.dream.test pnpm run build` — PASS |
| Frontend missing-env guard | Plain production `pnpm run build` — expected FAIL because `FLASK_PROXY_TARGET` is required; rerun with the documented target passed |
| Compose | `docker compose config` — PASS |
| Images | `docker build -t prg32-cartridge-store:m63b .`, `docker build -t prg32-cartridge-store-backend:m63b ./backend`, and `docker build -t prg32-cartridge-store-frontend:m63b ./frontend` — PASS |
| Disposable Compose profile | `backend` profile reached `/ready`, `PRAGMA integrity_check` returned `ok`, and the project/temporary fixture were cleaned — PASS |
| Capacity harness | `pnpm capacity:check --workloads=small,medium,large` — PASS; all three tiers and resilience experiments completed |
| Repository hygiene | `git diff --check` — PASS; existing dirty files preserved |

Frontend Vitest emitted the existing Vite `configLoader: 'native'` ESM/CJS
warning; it did not fail the checks. No tracked database, archive, log, or
production artifact was generated. The companion `../PRG32` repository remained
at revision `ff53e81` with only its pre-existing untracked files.

## 17. GO/NO-GO recommendation

**GO:** proceed to a separately approved M6.3c design/implementation gate for
backup/restore migration, using this report's snapshot, WAL, integrity, and
filesystem-boundary evidence as acceptance criteria.

**NO-GO:** do not enable Fastify as a production writer, introduce automatic
retention, modify the SQLite schema/indexes, expose capacity diagnostics,
replace Flask routing, or claim backup/restore migration complete.

M6.3b is complete only for the isolated assessment and operational test
foundation described here. It does not complete M6.3c or M6.3d.
