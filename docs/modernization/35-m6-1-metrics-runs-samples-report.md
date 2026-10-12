# M6.1 Metrics, Runs & Samples Migration Report

Date: 2026-10-12
Status: implemented as an isolated TypeScript compatibility slice; Flask remains the sole operational writer.

## Decision and boundary

M6.1 adds the metrics/runs/samples domain to the Fastify/TypeScript backend without changing public routing, production configuration, SQLite schema, firmware behavior, or the Flask implementation. The TypeScript write path is disabled by default and can only be enabled in the disposable writer profile with the existing authentication writer gate and test-mode requirements.

There is no dual writer and no cutover. The implementation is suitable for compatibility testing and the next migration gate, not for production traffic.

## Implemented API surface

The TypeScript service now exposes the following contracts:

| Endpoint | Compatibility behavior |
| --- | --- |
| `POST /api/runs` | Accepts anonymous firmware runs, preserves run metadata, milliseconds, and `user_id = NULL` for anonymous requests. Upserts by `run_id` with Flask-compatible field cleaning. |
| `POST /api/metrics/batch` | Accepts firmware samples without authentication or CSRF. Preserves `received`, `inserted`, duplicate-frame ignore behavior, dropped-sample accounting, and stable rejection codes. |
| `POST /api/runs/<run_id>/finish` | Preserves `finished_ms` and monotonic dropped-sample updates. |
| `GET /api/runs` | Anonymous returns an empty list; administrators see all runs; authenticated users see only owned runs. |
| `GET /api/runs/<run_id>` | Owner and administrator access only, with the existing `run` and `summary` envelope. |
| `GET /api/runs/<run_id>?format=json` | Pretty JSON download containing run, samples, and summary. |
| `GET /api/runs/<run_id>/samples.csv` | Preserves the documented CSV header and sample field order. |
| `GET /api/runs/<run_id>/report.md` | Preserves the Markdown report structure and summary calculations. |
| `GET /api/metrics` | Returns the TypeScript metrics endpoint index. |

The Flask HTML dashboard routes under `/users/<username>/runs` remain Flask-owned UI routes. `/api/stats/runs` remains outside M6.1 and is reserved for the later statistics milestone; it was not reimplemented speculatively.

## Firmware compatibility

The implementation was checked against `../PRG32/components/prg32/prg32_metrics.c`. The firmware sends unauthenticated JSON requests with no CSRF token and uses these fields:

- run start: `run_id`, `board_id`, `target`, `display_backend`, `firmware_version`, `firmware_git_sha`, `game_name`, `sample_period_frames`, `started_ms`;
- samples: `frame`, `timestamp_ms`, `update_us`, `draw_us`, `present_us`, `frame_us`, `heap_free`, `heap_min_free`, `input_mask`, `fps_x100`, `upload_queue_depth`, `deadline_missed`;
- batch/finish: `dropped_samples` and `finished_ms` where applicable.

The firmware batch limit is 64 samples. The TypeScript default request limit is 1024 samples, so valid firmware batches remain accepted. Firmware retry behavior is unchanged because the Flask endpoint remains authoritative.

## Storage and transaction behavior

The service uses the existing `runs` and `samples` tables and existing indexes through parameterized SQL. No schema migration was added. Writes use `BEGIN IMMEDIATE`, commit only after all work succeeds, and roll back on validation, SQLite, or injected failure. Samples use the existing unique `(run_id, frame)` constraint and `INSERT OR IGNORE`, so retries do not duplicate samples.

The read path uses the configured read-only SQLite connection when the writer gate is disabled. When enabled, it reuses the already-validated authentication writer connection; it does not open an independent alias and cannot fall back to the operational database. The disposable fixture now includes the existing metrics tables and indexes so compatibility tests use isolated data only.

The runs list uses one grouped sample-count query. Per-run sample summaries are loaded only for an authorized detail or export request. The compatibility query-plan test confirms use of the existing `samples_run_frame_idx` index for run sample lookup.

## Resource limits

Defaults are intentionally explicit and configurable:

| Limit | Default | Rejection |
| --- | ---: | --- |
| JSON request body | 2 MiB | HTTP 413, `metrics_payload_too_large` |
| Samples per batch | 1024 | HTTP 413, `metrics_sample_limit` |
| Database work per batch | 2048 | HTTP 413, `metrics_work_limit` |
| Export samples | 100,000 | HTTP 413, `metrics_export_too_large` |
| Run identifier | 96 characters | Flask-compatible truncation/cleaning |
| Firmware and metadata fields | existing Flask-compatible bounds | Flask-compatible truncation/cleaning |

Sample payloads must be flat objects. Invalid JSON, missing run/sample fields, nested structures, non-dictionary samples, missing runs, and oversized requests return stable error envelopes. Raw exception messages are not returned to clients; diagnostics remain server-side.

Environment variables are:

```text
PRG32_BACKEND_METRICS_WRITE_ENABLED=false
PRG32_BACKEND_METRICS_WRITE_MODE=test
PRG32_BACKEND_METRICS_DISPOSABLE_ROOT=/writer-data
PRG32_BACKEND_METRICS_MAX_CONTENT_BYTES=2097152
PRG32_BACKEND_METRICS_MAX_SAMPLES=1024
PRG32_BACKEND_METRICS_MAX_DB_WORK=2048
PRG32_BACKEND_METRICS_MAX_EXPORT_SAMPLES=100000
```

The metrics writer requires `PRG32_BACKEND_AUTH_WRITE_ENABLED=true`, `PRG32_BACKEND_AUTH_WRITE_MODE=test`, and the same validated disposable root. The default Compose configuration keeps metrics writes disabled.

## Authorization policy

- Firmware run creation, batch ingestion, and finish remain anonymous-compatible and do not require CSRF.
- A run with `user_id = NULL` is visible only to administrators.
- A run with an owner is visible to that owner and administrators.
- Ordinary users cannot read another user's run or any anonymous run.
- Detail, JSON, CSV, and Markdown exports apply the same authorization policy.
- Public aggregate statistics remain a later domain and are not exposed by this migration slice.

This policy is implemented without inventing ownership data. Existing anonymous runs retain `user_id = NULL`.

## Security invariants for the future Fastify backend

1. Firmware ingestion must accept the documented unauthenticated request shape and must not require browser CSRF tokens.
2. Anonymous ingestion must persist `user_id = NULL` unless an authenticated owner is explicitly present.
3. Every batch must be bounded before database work begins.
4. Nested or structurally invalid samples must be rejected predictably.
5. Duplicate `(run_id, frame)` samples must be idempotent.
6. A batch must be atomic: failed work cannot leave partial samples or dropped-count updates.
7. Run detail and every export format must use the same owner/administrator authorization decision.
8. Raw exception text, SQL details, filesystem paths, and secrets must never cross the API boundary.
9. The TypeScript writer must remain disabled unless explicitly enabled in an isolated test writer environment.
10. The metrics writer must never open or mutate the operational Flask database through a path alias or fallback.
11. Run/sample timestamps and firmware field names remain compatible with the documented ABI.

## Files changed

New:

- `backend/src/metrics/errors.ts`
- `backend/src/metrics/service.ts`
- `backend/src/metrics/routes.ts`
- `backend/tests/metrics.test.ts`
- this report

Modified:

- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/disposable-fixture.ts`
- `docker-compose.yml`
- `docs/modernization/19-revised-migration-roadmap.md`

No Flask production module, SQLite production file, firmware repository, deployment routing, or authentication behavior was changed.

## Compatibility and failure evidence

The isolated test suite covers:

- anonymous firmware start, batch, duplicate retry, and finish;
- millisecond timestamps, dropped samples, and `user_id = NULL`;
- admin detail and all three export forms;
- owner access and cross-user/anonymous denial;
- sample, work, nested-structure, and body-size limits;
- stable error responses;
- transaction rollback after an injected pre-commit failure;
- disabled writer behavior;
- the sample lookup query plan.

Docker smoke evidence used a fresh Compose project and disposable volumes. The firmware-shaped flow returned `200` for start, first batch, duplicate batch, and finish; the duplicate batch returned `inserted: 0`; administrator exports returned `200`; an ordinary bearer user received `403` for detail and CSV; `PRAGMA integrity_check` returned `ok`; and `node dist/reconcile.js --check` returned `CONSISTENT` with zero findings. Volumes were removed after the test.

## Verification executed

| Check | Result |
| --- | --- |
| `pnpm run check` in `backend/` | PASS — 11 files, 61 tests; typecheck, ESLint, Vitest, build |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `FLASK_PROXY_TARGET=http://flask:5080 pnpm run build` in `frontend/` under `nvm use 24` | PASS — 5 tests; Next production build passed. One existing Vite config-loader warning was emitted. |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config`, writer-init config, writer config | PASS |
| `git diff --check` | PASS |
| `docker build -t riscv-prg32/cartridge-store-backend:dev .` from `backend/` | PASS — Node 24 multistage image |
| `docker build -t prg32-cartridge-store:m61-local .` | PASS — Flask multistage image |
| `docker build -t prg32-cartridge-store-frontend:m61-local .` from `frontend/` | PASS — Next.js Node 24 multistage image |
| Compose disposable writer smoke test | PASS — details above |

## Remaining risks and rollback

M6.1 does not provide rate limiting, global concurrency coordination, metrics retention, public aggregate statistics, or migration of the Flask HTML dashboard. These remain explicit later work. The TypeScript writer is not production-ready because the operational cutover, backup/restore rehearsal against real deployment data, and dual-writer prohibition have not changed.

Rollback is configuration-only for this slice: keep `PRG32_BACKEND_METRICS_WRITE_ENABLED=false`, stop the optional TypeScript writer profile, and continue serving the Flask routes. No production schema or data rollback is required because M6.1 performs no production writes.

## Recommendation

**GO for M6.2 assessment/implementation in isolation. NO-GO for TypeScript metrics production cutover.** M6.1 acceptance evidence is green, but Flask must remain the sole writer until the remaining domain gates, operational backup/recovery evidence, and the explicit M8 cutover decision are complete. Do not start M6.2 automatically as part of this milestone.
