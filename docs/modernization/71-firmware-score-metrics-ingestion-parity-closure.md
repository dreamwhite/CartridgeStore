# PRG32 Cartridge Store — Firmware Score and Metrics Ingestion Parity Closure

Date: 2026-10-13
Status: **GO for isolated Fastify route and contract parity; NO-GO for operational Flask cutover**

## Executive result

The four firmware ingestion endpoints were already implemented and registered
in the current Fastify source. The apparent gap reported by the previous
cutover audit was an inventory false negative, not a missing service or a
missing route:

- `POST /api/scores` is registered through `app.route(...)` in
  `backend/src/scores/routes.ts`;
- `POST /api/runs`, `POST /api/metrics/batch`, and
  `POST /api/runs/:run_id/finish` are registered through `app.route(...)` in
  `backend/src/metrics/routes.ts`;
- `backend/src/app.ts` calls both route registration functions for every app
  instance.

The earlier inventory searched only for `app.get(...)`, `app.post(...)`, and
similar direct method calls. It did not count Fastify's object-form
`app.route(...)` registrations. The route handlers were therefore described as
absent even though M6.1/M6.2b services and HTTP tests exercised them.

This closure adds an explicit runtime registration and disabled-writer
regression test. It does not duplicate score or metrics services, alter
production routing, enable default writes, change the SQLite schema, or modify
firmware.

## Scope and preserved boundaries

Completed in this batch:

1. traced the historical reports, current source, tests, Flask behavior, and
   `../PRG32` firmware clients;
2. corrected the route-registration discrepancy;
3. added a regression test proving the four routes exist in the Fastify runtime
   while read-only configuration cannot write;
4. exercised the existing isolated writer over HTTP with firmware-shaped
   payloads;
5. updated the cutover audit and roadmap.

Explicitly not done:

- no Flask removal or public route switch;
- no schema migration or operational SQLite access;
- no firmware or `../PRG32` modification;
- no multiplayer WebSocket work;
- no OIDC/SAML change, Playwright, Authentik, or browser E2E;
- no deployment, commit, or push;
- no M6.3d.2h.12 work.

The pre-existing dirty-tree state was preserved. The current repository already
contained the untracked root `package.json`, and `../PRG32` already contained
untracked `docs/quickstart-qemu.md` and `run-qemu`.

## Root cause of the discrepancy

### Historical implementation

M6.1 implemented the `MetricsService` and its route module. M6.2b implemented
the `ScoresService` and its route module. Both milestones deliberately kept
writes disabled by default and required the existing isolated authentication
writer boundary.

### Current registration path

`backend/src/app.ts` constructs the services and unconditionally calls:

```text
registerMetricsRoutes(app, { config, auth, metrics })
registerScoreRoutes(app, { config, auth, scores })
```

The route modules use Fastify's object-form registration:

```text
app.route({ method: "POST", url: "/api/scores", ... })
app.route({ method: "POST", url: "/api/runs", ... })
app.route({ method: "POST", url: "/api/metrics/batch", ... })
app.route({ method: "POST", url: "/api/runs/:run_id/finish", ... })
```

The previous audit's route scanner matched direct `app.post(...)` calls but not
`app.route({ method: "POST" ... })`. Consequently it reported all four as
absent even though the services and tests were present.

### Actual configuration behavior

The routes are registered in both read-only and writer app instances. They are
not writable in read-only mode because `ScoresService.create` and the three
metrics write methods call `ensureWrite()` before opening or mutating a
database. This is intentional: a stable route surface returns a predictable
`503` availability response, while the default/read-only app cannot mutate
anything.

Write enablement remains separately gated:

- `PRG32_BACKEND_METRICS_WRITE_ENABLED=true`;
- `PRG32_BACKEND_SCORES_WRITE_ENABLED=true`;
- corresponding `*_WRITE_MODE=test`;
- authentication writer enabled in test mode;
- domain disposable root present and equal to the validated auth disposable
  root;
- write database separate from the read-only shadow/operational path.

Compose keeps both domain write flags false by default in `dev`. The isolated
writer profile is the only place used for the write verification.

## Existing implementation reused

No business logic was rewritten. The following existing boundaries remain the
single implementation:

| Concern | Existing implementation |
| --- | --- |
| Score validation, rate limiting, capacity, transaction | `backend/src/scores/service.ts` |
| Score public error mapping | `backend/src/scores/errors.ts` |
| Score HTTP parsing and CSRF distinction | `backend/src/scores/routes.ts` |
| Run creation, sample batch, finish, transaction rollback | `backend/src/metrics/service.ts` |
| Metrics limits, nested-value rejection, duplicate-frame behavior | `backend/src/metrics/service.ts` |
| Metrics public error mapping | `backend/src/metrics/errors.ts` |
| Metrics HTTP parsing and body limits | `backend/src/metrics/routes.ts` |
| Runtime composition | `backend/src/app.ts` |
| Config validation and writer isolation | `backend/src/config/env.ts`, `backend/src/db/readonly.ts` |
| Disposable schema fixture | `backend/src/disposable-fixture.ts` |

The only application test change is `backend/tests/app.test.ts`, adding one
runtime route/gate regression test. No service, route handler, configuration,
database, or Docker production behavior was changed.

## Firmware contracts verified

The source of truth was inspected in `../PRG32` at the existing checkout.

### Scores

The firmware posts unauthenticated JSON to `POST /api/scores`:

```json
{"game":"<game>","player":"<player>","score":123}
```

The client treats any 2xx response as success and does not send a Bearer or
browser CSRF header. Fastify accepts anonymous ingestion and returns:

```json
{"ok":true}
```

The accepted score is an unsigned 32-bit integer. `game` and `player` retain
the firmware's bounded text shape. Client-supplied `submitted_by` is ignored;
anonymous writes use the server-controlled `anonymous` value.

### Metrics run creation

The firmware posts JSON to `POST /api/runs` with:

```json
{
  "run_id":"...",
  "board_id":"...",
  "target":"qemu|esp32c6",
  "display_backend":"...",
  "firmware_version":"...",
  "firmware_git_sha":"...",
  "game_name":"...",
  "sample_period_frames":1,
  "started_ms":1000
}
```

The request is anonymous and has no CSRF or Bearer requirement. Fastify returns
`{"ok":true,"run_id":"..."}` and stores a null `user_id` for anonymous
firmware ingestion.

### Metrics batch

The firmware posts `POST /api/metrics/batch` with `run_id`, optional
`dropped_samples`, and a `samples` array. Each sample contains the scalar
fields `frame`, `timestamp_ms`, `update_us`, `draw_us`, `present_us`,
`frame_us`, `heap_free`, `heap_min_free`, `input_mask`, `fps_x100`,
`upload_queue_depth`, and `deadline_missed`.

Fastify returns `ok`, `inserted`, and `received`. Duplicate `(run_id, frame)`
rows are ignored, sample ordering is preserved in readback, and dropped counts
are accumulated on the run.

### Metrics completion

The firmware posts `POST /api/runs/<run_id>/finish` with `finished_ms` and
`dropped_samples`. Fastify returns `{"ok":true,"run_id":"..."}`. Completion
uses the existing `MAX` dropped-sample semantics and returns `run_not_found` for
an unknown run.

## Flask compatibility findings

The current Flask implementations were inspected directly:

| Contract | Flask behavior | Fastify behavior |
| --- | --- | --- |
| Score write authentication | Legacy Flask route uses `login_required` | Approved M6.2b anonymous firmware ingestion accepts no auth; browser sessions still need CSRF, bearer requests remain supported |
| Score duplicate behavior | Inserts every accepted request | Inserts every accepted request |
| Score response | HTTP 200, `{ok:true}` | HTTP 200, `{ok:true}` |
| Score invalid input | HTTP 400 with legacy message | HTTP 400 stable `invalid_score_payload` envelope |
| Run creation | Anonymous, upsert by `run_id` | Anonymous, same upsert shape |
| Batch duplicate frames | `INSERT OR IGNORE` | `INSERT OR IGNORE` |
| Batch dropped count | Adds to run total | Adds to run total |
| Batch unknown run | 404 `run_not_found` | 404 `run_not_found` |
| Finish dropped count | `MAX(existing, received)` | Same |
| Finish unknown run | 404 `run_not_found` | Same |
| SQLite transaction | Flask commits request writes | Fastify uses `BEGIN IMMEDIATE`, rollback on batch/storage failure |

The anonymous score-auth difference is deliberate and documented by M6.2b; it
is required for the actual firmware client, which sends no credentials. It is
not a reason to weaken unrelated authenticated browser mutations.

Fastify deliberately adds stricter containment where documented: typed score
bounds, nested-field rejection, body limits, sample/work limits, rate limiting,
capacity admission, stable generic storage errors, and isolated writer checks.
Valid firmware payloads remain compatible.

## Runtime registration and isolation evidence

### Read-only configuration

The added `backend/tests/app.test.ts` regression test builds the actual
Fastify composition root with a missing read-only database path, waits for
Fastify readiness, and checks `app.hasRoute` for all four POST method/path
bindings. It then sends all four HTTP requests and verifies:

| Request | Result |
| --- | --- |
| `POST /api/scores` | HTTP 503, `scores_unavailable` |
| `POST /api/runs` | HTTP 503, `metrics_unavailable` |
| `POST /api/metrics/batch` | HTTP 503, `metrics_unavailable` |
| `POST /api/runs/<run_id>/finish` | HTTP 503, `metrics_unavailable` |

Because the services fail at `ensureWrite()` before database access, the
read-only app cannot mutate the configured operational/shadow path. Existing
score and metrics tests independently cover disabled-domain behavior and public
read availability.

### Isolated writer configuration

The existing score and metrics tests build the real app with disposable SQLite
files, then call all four endpoints through `app.inject` rather than calling
services directly. The current test cases prove:

- anonymous score acceptance and persistence;
- anonymous run, batch, and finish acceptance and persistence;
- response fields and status codes;
- duplicate-frame ignore behavior;
- dropped-sample totals;
- malformed/nested/oversized payload rejection;
- score rate and capacity limits;
- metrics sample/work limits;
- transactional batch rollback;
- no CSRF requirement for firmware-shaped anonymous writes;
- browser CSRF and bearer behavior for scores;
- disabled writer responses.

### Disposable network smoke

The existing `auth-writer` container was recreated with the score and metrics
write gates enabled temporarily. The smoke test sent HTTP requests to
`http://127.0.0.1:5091` — the writer's local disposable port, not the Traefik
edge and not the Flask service — using synthetic firmware payloads:

```text
POST /api/scores                    -> 200 {"ok":true}
POST /api/runs                      -> 200 {"ok":true,"run_id":"..."}
POST /api/metrics/batch             -> 200 {"ok":true,"inserted":1,"received":1}
POST /api/runs/<run_id>/finish      -> 200 {"ok":true,"run_id":"..."}
```

After the smoke test the writer was recreated with the default Compose values;
inspection confirmed:

```text
PRG32_BACKEND_METRICS_WRITE_ENABLED=false
PRG32_BACKEND_SCORES_WRITE_ENABLED=false
```

The Flask container remained healthy and its API route was not called by the
smoke test. No persistent Authentik instance, production route, or sibling
repository was contacted or modified.

## Security and maintainability result

Preserved controls:

- JSON body limits at the Fastify route boundary;
- score text and unsigned integer bounds;
- metrics sample-count, database-work, nested-structure, and body limits;
- per-source score rate limiting and score row capacity admission;
- parameterized SQLite statements;
- transaction rollback on failed score/batch writes;
- generic public storage errors with server-side logging;
- browser CSRF enforcement for authenticated score sessions;
- anonymous firmware ingestion without an artificial browser-cookie gate;
- shared isolated writer database and path identity checks.

No new dependency, repository abstraction, schema migration, or duplicate
service was introduced.

## Verification results

All Node commands used Node `v24.20.0` after `nvm use 24` and pnpm `12.5.1`.

| Check | Result |
| --- | --- |
| Targeted `app`, `scores`, `metrics` tests | PASS — 3 files, 17 tests |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 26 files, 136 tests |
| `pnpm --dir backend run build` | PASS |
| Disposable writer network smoke | PASS — all four HTTP requests returned expected 200 responses |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 10 files, 29 tests |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=<synthetic test value> .venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

No result in this table is inferred from a previous milestone. The frontend
test runner emitted its existing non-fatal Vite native-config warning.

## Gap status and remaining blockers

`CUTOVER-002` and `CUTOVER-003` from report 70 are **closed as Fastify route
registration and isolated ingestion parity gaps**. They were false negatives
caused by the incomplete route scanner, and the new runtime regression test
prevents the same omission from returning unnoticed.

They are not an operational Flask-retirement approval. Remaining blockers are:

- Flask still owns public production routing and operational writes;
- the default Compose development writer keeps both gates disabled;
- catalog download-event ownership, publication/review, backup/restore, mDNS,
  and live SQLite/filesystem ownership remain open cutover work;
- `WS /api/multiplayer` remains absent from Fastify;
- Next.js is not yet the complete storefront;
- session-cookie migration and final canary/rollback evidence remain open.

## Final decision

**GO** for the authorized isolated firmware score and metrics ingestion parity
closure.

**NO-GO** for public Fastify score/metrics routing, Flask removal, or general
Flask-to-Fastify cutover. The existing single-writer boundary remains intact,
and no production behavior has been changed.
