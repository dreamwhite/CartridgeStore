# M6.3a — Statistics API Parity Report

**Date:** 2026-10-12
**Status:** accepted in isolated Fastify scope; Flask remains authoritative
**Production cutover:** NO-GO

## 1. Executive summary

M6.3a adds a separate read-only Fastify statistics domain for the four approved
API endpoints:

* `GET /api/stats/downloads`
* `GET /api/stats/downloads/:game_id`
* `GET /api/stats/scores`
* `GET /api/stats/runs`

The implementation preserves the current Flask response contracts and public
access behavior. It uses the existing read-only SQLite manager and a read-only
catalog lookup. It does not initialize tables, acquire a writer connection,
modify the schema, record downloads, modify scores/runs, or change public
routing.

The isolated acceptance gate is green. This does not authorize production
Fastify routing or a writer cutover. M6.3b, M6.3c, and M6.3d were not started.

## 2. Implemented endpoints

| Endpoint | Result |
| --- | --- |
| `GET /api/stats/downloads` | Public Flask-compatible total, time series, and top-game aggregate |
| `GET /api/stats/downloads/:game_id` | Public per-game total, architecture breakdown, and filtered time series |
| `GET /api/stats/scores` | Public `{ "scores": [...] }` with Flask ordering and limit behavior |
| `GET /api/stats/runs` | Public total, finished, and seven-day active-run counts |

The Flask `/stats` HTML dashboard was intentionally not implemented. No other
statistics endpoint was added.

## 3. Flask/Fastify contract matrix

| Property | Flask | Fastify M6.3a | Classification |
| --- | --- | --- | --- |
| Method/routes | Four GET routes above | Same four GET routes | Preserved |
| Authentication/CSRF | Public | Public; no auth or CSRF hook | Preserved |
| Download limit | Default 30, clamped 1–365 | Same; invalid values fall back to 30 | Preserved |
| Score limit | Default 20, clamped 1–100 | Same; invalid values fall back to 20 | Preserved |
| Granularity | `day`, `week`, `month`; invalid values become `day` | Same, case/whitespace normalized | Preserved |
| Date inputs | Exact `YYYY-MM-DD` accepted; malformed values ignored | Same | Preserved |
| Download series | SQLite date expression, descending SQL rows reversed for response | Same expressions and response ordering | Preserved |
| Per-game total/architectures | Not date-filtered; only `game_id` filtered | Same | Preserved |
| Per-game series | Uses date/granularity/filter query | Same | Preserved |
| Top games | Count desc, game ID asc; catalog title fallback to ID | Same, one catalog index read and same fallback | Preserved |
| Score selection | All rows; no game/player filter in this endpoint | Same | Preserved |
| Score ordering | `score DESC, created_at ASC` | Same | Preserved |
| Run activity | `created_at >= int(time.time()) - 604800` | Same; injectable clock only for tests | Preserved |
| Empty data | Empty series/top/architectures and zero totals/counts | Same | Preserved |
| Error behavior | Normal valid contract returns 200; malformed filters use fallbacks | Same | Preserved |

The score statistics endpoint is intentionally separate from `GET /api/scores`.
It was not given new filters, identity fields, authentication, or score-write
behavior.

## 4. Exact aggregation semantics

### Downloads

The implementation reproduces Flask's SQL expressions:

```sql
day:   date(downloaded_at)
week:  date(downloaded_at, 'weekday 0', '-6 days')
month: substr(downloaded_at, 1, 7) || '-01'
```

The optional `since` and `until` values use `date(downloaded_at) >= date(?)`
and `date(downloaded_at) <= date(?)`. Invalid dates are ignored, as in Flask.
The series query groups and orders descending, then reverses rows before
serialization. Total and top-game queries retain the same filter set. The
per-game architecture breakdown intentionally ignores date filters because
that is the existing Flask behavior; only its series is date-filtered.

Top-game titles are resolved from one read-only catalog index lookup. If the
catalog is absent, malformed, or has no matching ID, the response falls back
to the game ID and an empty `last_published`, matching Flask's error fallback.

### Scores

The endpoint selects only `game`, `player`, `score`, `created_at`, and
`submitted_by`, orders by score descending and creation time ascending, and
applies the existing 20/100 limit policy. No user-controlled SQL fragment is
used and no ingestion path is touched.

### Runs

The endpoint performs the same three aggregate queries as Flask: all rows,
rows with non-null `finished_at`, and rows whose integer `created_at` is at
least seven days before the current epoch-second clock. It never selects an
individual run or sample.

## 5. Database queries and index usage

New source files:

* `backend/src/stats/service.ts`
* `backend/src/stats/routes.ts`

The service uses the existing `ReadonlyDatabaseManager` and `better-sqlite3`
read-only handle. All values are bound parameters. Dynamic SQL is limited to
three source-controlled period expressions and fixed WHERE/ORDER fragments.
No DDL, DML, migration, or index change was added.

`EXPLAIN QUERY PLAN` evidence on the fixture database:

| Query | Observed plan | Decision |
| --- | --- | --- |
| Per-game architecture breakdown | Uses `download_events_game_idx`; temporary B-trees for grouping/order | Reuse existing index; no change in M6.3a |
| Global score statistics | Scans `scores` and uses a temporary B-tree for ordering | Existing index begins with `game`; document for later capacity review |
| Active run count | Scans `runs` | No `created_at` index added; review only with measured operational evidence |

The plan findings are recorded for a later operational milestone. They do not
justify an unapproved schema change in this read-only parity slice.

## 6. Read-only guarantees

The statistics domain:

* receives only the existing `ReadonlyDatabaseManager`;
* never calls `AuthService.writableDatabase()`;
* does not call Flask-style schema initialization;
* shares the established read-only database lifecycle;
* opens SQLite with `readonly: true`, `fileMustExist: true`, and `query_only=ON`;
* rejects `CREATE TABLE` and `DELETE` attempts on the opened handle;
* does not create or alter `-wal`, `-shm`, or `-journal` sidecars.

Tests hash the disposable SQLite file and compare its directory entries before
and after all four endpoint requests. The hash and entries remain unchanged.
No operational database was mounted or accessed.

## 7. Security considerations

* All request-derived game IDs, dates, and limits are bound values or explicit
  allow-listed branches.
* Invalid dates, granularity, and limits use the existing Flask fallback
  semantics instead of creating new error behavior.
* SQL-injection-shaped game IDs remain ordinary unmatched identifiers.
* HTML/script-shaped and Unicode display strings remain data; no new HTML route
  was added and no value is interpolated into SQL.
* Statistics remain public aggregates and expose no new owner, device, or
  authenticated-principal fields.
* The existing score authentication, anonymous ingestion, rate limiter,
  capacity gate, metrics authorization, CSRF boundaries, and writer isolation
  are untouched.

## 8. Differential fixture coverage

`tests/compatibility/generate_stats_oracle.py` builds a synthetic Flask app and
database, fixes the Flask statistics clock to `1700000000`, executes the
actual Flask endpoints, and emits deterministic responses. The Fastify tests
use the same synthetic rows and assert those generated contract values.

Coverage includes:

* empty behavior through zero/unknown aggregates;
* multiple games and architectures;
* multiple dates, day/week/month grouping, date windows, and exact seven-day
  run boundaries;
* score ties, historical timestamps, default and bounded limits;
* missing filters, invalid dates, invalid granularity, and invalid limits;
* unknown game IDs;
* anonymous and owned run rows in aggregate input;
* SQL-injection-shaped IDs, long values, Unicode, and HTML/script-shaped data;
* unexpected query parameters and no authentication/CSRF requirement.

The comparison does not normalize meaningful status codes, field names, types,
ordering, or null/empty behavior.

## 9. Regression and test results

| Check | Result |
| --- | --- |
| Targeted `pnpm exec vitest run tests/stats.test.ts` | PASS — 4 tests |
| Fastify `pnpm run check` | PASS — final run after implementation: typecheck, ESLint, 13 test files / 75 tests, production build |
| Flask `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| Python compilation | PASS — `app.py`, `cartridge_store/*.py`, and statistics oracle generator |
| Frontend under `nvm use 24` | PASS — typecheck, lint, 2 files / 5 tests, Next.js production build |
| Compose config | PASS — `docker compose --profile backend config` |
| Backend Docker image | PASS — Node 24 multistage image |
| Flask Docker image | PASS — existing multistage image rebuilt |
| Next.js Docker image | PASS — existing Node 24 multistage image rebuilt |
| `git diff --check` | PASS |

The frontend build emitted the existing Vite `configLoader: 'native'` warning;
it did not fail the check.

## 10. Docker E2E results

A fresh temporary host directory and project `prg32-m63a-e2e` were used. The
backend profile mounted the synthetic database read-only at `/fixtures`; no
Traefik network, production path, or writer volume was used.

Verified:

1. Fastify `/health` became healthy.
2. All four statistics endpoints returned HTTP 200 with expected fixture
   values, including per-game architecture/series data.
3. Public `GET /api/scores` returned the historical score row.
4. Public anonymous `GET /api/runs` returned the existing empty-list contract.
5. `POST /api/scores` remained disabled and returned HTTP 503 with
   `scores_unavailable`.
6. The host SQLite SHA-256 was unchanged before and after all GET requests.
7. Inside the container, `query_only=1` and `PRAGMA integrity_check` returned
   `ok`.
8. The Compose project and temporary volumes were removed after the test.

The first health poll observed a transient connection reset while the service
was starting; the retry succeeded and the E2E assertions passed.

## 11. Files created or modified

Created:

* `backend/src/stats/service.ts`
* `backend/src/stats/routes.ts`
* `backend/tests/stats.test.ts`
* `tests/compatibility/generate_stats_oracle.py`
* this report

Modified:

* `backend/src/app.ts` — registers only the four statistics routes and an
  optional test clock injection;
* `backend/src/db/readonly.ts` — enables SQLite `query_only` on the existing
  read-only connection;
* `backend/src/disposable-fixture.ts` — adds `download_events` and its two
  existing indexes to the disposable writer fixture only;
* `docs/modernization/19-revised-migration-roadmap.md` — adds the explicit
  M6.3a evidence subsection.

No Flask application module, operational SQLite file, production routing,
Next.js source, firmware repository, or deployment configuration was changed.

## 12. Remaining compatibility differences

No intentional endpoint response difference was found in the tested M6.3a
scope. The Flask `/stats` HTML page remains Flask-owned and is intentionally
not a Fastify endpoint. Fastify's injectable clock is test infrastructure; the
runtime default remains the current epoch-second clock.

## 13. Operational risks

The observed full scans for global score ordering and active-run counts remain
potential capacity concerns as historical data grows. M6.3a does not add
retention, archival, global rate limiting, WAL monitoring, backup/restore, or
automatic deletion. These remain M6.3b/operations decisions and production
cutover blockers.

The public aggregate policy remains bounded by the existing Flask contract.
No new identity or moderation semantics were introduced. Anonymous score
forgery and duplicate retry behavior remain the approved M6.2b properties.

## 14. Recommendation for M6.3b

**GO for M6.3b assessment/implementation in isolation; NO-GO for production
cutover.** The next slice should address the documented capacity, retention,
backup/recovery, and operational evidence decisions from
[`40-m6-3-discovery-and-implementation-plan.md`](40-m6-3-discovery-and-implementation-plan.md).
It must continue using disposable databases and the single Compose file's
profiles. Do not start M6.3b automatically as part of this milestone.
