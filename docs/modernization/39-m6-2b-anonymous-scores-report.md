# M6.2b — Anonymous Scores & Leaderboard Migration Report

Date: 2026-10-12
Status: implemented in the isolated Fastify/TypeScript backend; Flask remains the sole operational writer.

## 1. Executive summary

M6.2b implements anonymous score ingestion and public leaderboard reads in Fastify while preserving the PRG32 firmware payload and success response. The approved product decision intentionally supersedes the M6.2a scoped-device-credential proposal: no user account, bearer token, device token, device identifier, signature, hardware attestation, or CSRF token is required for a valid anonymous firmware score request.

The implementation is isolated and disabled by default. It reuses the existing validated authentication writer connection only when the explicit score writer gate is enabled in the disposable writer profile. No Flask code, firmware code, production database, SQLite schema migration, public route, Traefik exposure, or deployment was changed.

The implementation adds proportionate controls for an anonymous endpoint: strict bounded validation, a process-local bounded source limiter, deterministic row-count capacity admission, parameterized SQL, `BEGIN IMMEDIATE` transactions, rollback-safe errors, and no heuristic duplicate suppression.

## 2. Approved architectural decision

Anonymous score submission is intentional. The `player` field is a display nickname, not an authenticated identity. A leaderboard entry is community-submitted and unverified; authentication is not being used to claim gameplay integrity.

The existing `scores` table remains authoritative:

```text
scores(id, game, player, score, created_at, submitted_by)
```

Anonymous Fastify writes set `submitted_by` to the server-controlled neutral value `anonymous`. A client-supplied `submitted_by` field is ignored. Existing authenticated browser or bearer requests remain supported where practical and store the authenticated principal name, but authentication is optional for score submission.

The previous M6.2a device-token proposal remains intact for historical traceability and is marked `SUPERSEDED — NOT APPROVED` in [37-m6-2a-score-authentication-adr.md](37-m6-2a-score-authentication-adr.md). The current decision is recorded in [38-m6-2b-anonymous-score-ingestion-adr.md](38-m6-2b-anonymous-score-ingestion-adr.md).

## 3. Firmware compatibility

The implementation was derived from `../PRG32/components/prg32/prg32_http_scores.c` at revision `ff53e81fa5825771a25a09af34f165e75378f1aa`.

The external firmware request is:

```http
POST /api/scores
Content-Type: application/json

{"game":"<escaped>","player":"<escaped>","score":<uint32>}
```

Observed firmware behavior:

- remote sync uses a three-second timeout;
- no Authorization header, CSRF token, device identifier, nonce, or idempotency key is sent;
- the response body is ignored;
- every non-2xx response is treated as failure;
- pending local records remain pending after transport or HTTP failure;
- a successful insertion followed by a lost response can be submitted again;
- local scores are persisted in NVS and remote synchronization is optional;
- `PRG32_WIFI_SCORES_ENABLE` defaults to disabled;
- the board-local score structure uses `game[24]`, `player[24]`, and `uint32_t score`.

Fastify accepts valid firmware-shaped JSON without credentials or CSRF and returns HTTP 200 with `{ "ok": true }`. No firmware change was made or required.

## 4. Flask/Fastify contract matrix

| Behavior | Flask current contract | Fastify M6.2b | Classification |
| --- | --- | --- | --- |
| `GET /api/scores` | Public JSON list | Public JSON list | Preserved |
| `POST /api/scores` auth | `login_required`; cookie sessions need CSRF; valid bearer-only requests bypass CSRF | Anonymous accepted; valid browser sessions still require CSRF; valid bearer requests remain accepted | Intentional divergence |
| Success | HTTP 200, `{ "ok": true }` | HTTP 200, `{ "ok": true }` | Preserved |
| Fields | `game`, `player`, `score`, unknown fields ignored | Same firmware fields; client `submitted_by` ignored | Preserved with security hardening |
| Text handling | String coercion, trim, truncate to 24 | String-only, trim, reject above 23 UTF-8 bytes to match firmware storage capacity | Intentional stricter validation |
| Score handling | `int()` coercion, non-negative, no explicit Flask upper bound | Integer only, `[0, 4294967295]`, rejects fractions and non-finite values | Intentional stricter validation |
| Anonymous source | Not accepted by Flask POST | `submitted_by = "anonymous"` | Intentional product decision |
| GET query | `game`, `player`, `limit`, default 20, clamp 1–100 | Same | Preserved |
| Ordering | `score DESC, created_at ASC` | Same | Preserved |
| Storage | One SQLite row per accepted request | One SQLite row per accepted request | Preserved |
| Duplicate delivery | No deduplication | No deduplication | Preserved at-least-once semantics |

Fastify does not claim exact Flask authentication or coercion parity. Flask was intentionally not modified.

## 5. Implemented API behavior

### `POST /api/scores`

- Requires a JSON object but no credentials for anonymous firmware requests.
- Does not require CSRF when no authenticated browser session is present.
- Preserves valid `game`, `player`, and unsigned 32-bit `score` semantics.
- Generates `created_at` on the server in epoch seconds.
- Uses parameterized SQL and one transaction per accepted score.
- Uses `anonymous` for anonymous `submitted_by`.
- Does not infer identity from player names, IPs, headers, or network metadata.

Authenticated browser sessions are not allowed to bypass the existing CSRF boundary: a valid session without a CSRF token receives `csrf_failed`. Valid bearer-only requests remain compatible without browser CSRF. An invalid bearer header does not grant identity and can still be treated as an anonymous request when the payload is valid.

### `GET /api/scores`

The public leaderboard preserves Flask behavior:

- `game` exact filter;
- `player` exact filter;
- default limit 20;
- invalid limit falls back to 20;
- limit clamped to 1–100;
- score descending and `created_at` ascending tie order;
- response array fields `game`, `player`, `score`, `created_at`, `submitted_by`;
- historical rows remain readable;
- no abuse-control internals or filesystem/database paths are exposed.

No new public endpoint was introduced. Flask HTML routes such as `GET /scores` remain Flask-owned and were not migrated as unrelated UI work.

## 6. Input validation

Fastify rejects malformed or unsafe input with a stable `invalid_score_payload` envelope. It rejects:

- missing required fields;
- arrays or non-object bodies;
- nested objects and arrays in fields;
- non-string game/player values;
- empty trimmed game/player values;
- game/player values over 23 UTF-8 bytes;
- negative scores;
- fractional scores;
- non-finite or non-safe-integer scores;
- scores above `UINT32_MAX`;
- malformed JSON;
- request bodies over the configured body limit.

Unknown scalar fields are ignored for compatibility. Unknown nested structures are rejected. The default request body limit is 1024 bytes, substantially above the current firmware's bounded body construction while still preventing oversized anonymous payloads.

## 7. Rate limiting

The writer uses a bounded in-memory token bucket keyed by Fastify's resolved `request.ip`. Fastify proxy trust is not enabled, so arbitrary `X-Forwarded-For` values are not used. This avoids accepting spoofed client identity from an untrusted header.

Defaults:

| Setting | Default |
| --- | ---: |
| Accepted submissions per source window | 120 |
| Window | 60 seconds |
| Initial/refill burst | 16 |
| Maximum limiter entries | 4096 |

Rate-limited requests return HTTP 429, `Retry-After: 1`, and:

```json
{"ok":false,"error":"score rate limit exceeded","code":"score_rate_limited"}
```

The limiter is process-local and resets on restart. Its state is bounded by eviction of expired and oldest entries. It does not provide cross-process coordination. Multiple consoles behind one NAT share the observed source address; the defaults are intentionally not a low classroom-blocking threshold. A future horizontally scaled deployment needs a trusted edge or shared limiter.

## 8. Database capacity protection

M6.2b implements deterministic row-count admission in the disposable writer:

- default maximum score rows: 100,000;
- the limit is configurable through `PRG32_BACKEND_SCORES_MAX_ROWS`;
- capacity is checked inside the same SQLite transaction as insertion;
- a full table returns HTTP 503, `Retry-After: 60`, and `scores_capacity_reached`;
- no rows are automatically deleted;
- no low-score eviction, background cleanup, or retention task was added.

This is a row-count bound, not a complete filesystem-capacity or WAL-growth bound. SQLite page size, WAL files, free disk space, and historical retention remain separate M6.3/M6.5 concerns. The capacity policy is explicitly disposable-only and does not change production data.

## 9. SQLite transaction guarantees

The score write path performs:

1. request validation;
2. source rate-limit admission;
3. `BEGIN IMMEDIATE`;
4. row-count capacity check;
5. parameterized insert;
6. `COMMIT`;
7. `{ "ok": true }` response.

Any SQLite or injected failure rolls back before returning a stable `scores_storage_failed` response. The writer reuses the already validated authentication writer connection and cannot fall back to the operational database. SQLite busy timeout remains configured by the shared backend configuration. No second writer process was introduced.

## 10. Disposable writer isolation

New configuration is disabled by default:

```text
PRG32_BACKEND_SCORES_WRITE_ENABLED=false
PRG32_BACKEND_SCORES_WRITE_MODE=test
PRG32_BACKEND_SCORES_DISPOSABLE_ROOT=/writer-data
PRG32_BACKEND_SCORES_MAX_CONTENT_BYTES=1024
PRG32_BACKEND_SCORES_RATE_LIMIT_MAX=120
PRG32_BACKEND_SCORES_RATE_LIMIT_WINDOW_SECONDS=60
PRG32_BACKEND_SCORES_RATE_LIMIT_BURST=16
PRG32_BACKEND_SCORES_RATE_LIMIT_MAX_CLIENTS=4096
PRG32_BACKEND_SCORES_MAX_ROWS=100000
```

Enabling score writes requires the existing isolated authentication writer, test mode, validated disposable root, and the same writer database boundary. It does not enable metrics or submission writes. Existing symlink, hardlink, SQLite URI, path containment, identity, read-only root filesystem, dropped capability, and no-new-privileges protections remain in effect.

## 11. Docker end-to-end results

A fresh Compose project and fresh named volumes were used with the existing single `docker-compose.yml`.

1. `auth-writer-init` created an isolated database containing the existing auth, submission, metrics, and scores tables.
2. With the default score setting, anonymous `POST /api/scores` returned HTTP 503 with `scores_unavailable`.
3. With `PRG32_BACKEND_SCORES_WRITE_ENABLED=true` and metrics explicitly enabled, firmware-shaped anonymous requests returned HTTP 200.
4. With a disposable test limiter of two requests per one-second window, the third immediate request returned HTTP 429, and submission after recovery returned HTTP 200.
5. With a disposable maximum of three rows, the next request returned HTTP 503 with `scores_capacity_reached` and did not increase the row count.
6. Public filtering and `limit=2` returned the expected ordered leaderboard rows.
7. Metrics run creation, batch ingestion, and finish continued to return HTTP 200.
8. SQLite verification reported 3 scores, all `submitted_by = "anonymous"`, 1 run, 1 sample, and `PRAGMA integrity_check = ok`.
9. `node dist/reconcile.js --check` returned `CONSISTENT` with zero findings.
10. Containers, network, and named volumes were removed with `docker compose -p prg32-m62b down -v`.

No Traefik labels, public hostname, operational mount, or production data was used.

## 12. Security and compatibility tests

`backend/tests/scores.test.ts` contains nine tests covering:

- valid anonymous firmware submission without Authorization or CSRF;
- invalid Authorization treated as non-authoritative anonymous input;
- authenticated browser CSRF preservation and bearer compatibility;
- public filtering, limits, ordering, timestamps, and response fields;
- empty/oversized/nested/array/malformed/fractional/negative/out-of-range input;
- SQL-injection-shaped and HTML/script-shaped display values as data;
- rate threshold, recovery, source-key behavior, and bounded eviction;
- capacity rejection without deletion;
- transaction rollback after a SQLite insert failure;
- concurrent inserts and SQLite busy/locked behavior;
- public reads while score writes are disabled.

The test suite does not claim physical hardware or QEMU execution. Firmware compatibility was checked from the actual C request construction and then exercised through a sanitized JSON fixture in Docker.

## 13. Files created or modified

Created:

- `backend/src/scores/errors.ts`
- `backend/src/scores/service.ts`
- `backend/src/scores/routes.ts`
- `backend/tests/scores.test.ts`
- `docs/modernization/38-m6-2b-anonymous-score-ingestion-adr.md`
- this report

Modified:

- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/disposable-fixture.ts`
- `docker-compose.yml`
- `docs/modernization/37-m6-2a-score-authentication-adr.md` — historical proposal marked superseded
- `docs/modernization/19-revised-migration-roadmap.md`

Not modified:

- Flask application code;
- PRG32 firmware or host tooling;
- SQLite production schema or data;
- frontend application;
- production routing, Traefik configuration, or deployment.

## 14. Verification results

Commands executed for M6.2b:

| Command/check | Result |
| --- | --- |
| `pnpm run check` in `backend/` | PASS — 12 test files, 70 tests; typecheck, ESLint, Vitest, production build |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| Frontend `nvm use 24 && pnpm run typecheck && pnpm run lint && pnpm run test && FLASK_PROXY_TARGET=http://flask:5080 pnpm run build` | PASS — 5 tests and Next.js production build; existing Vite config-loader warning only |
| `docker compose --profile dev config`, writer-init config, writer config | PASS |
| `docker build -t riscv-prg32/cartridge-store-backend:dev .` from `backend/` | PASS — Node 24 multistage image |
| `docker build -t prg32-cartridge-store:m62b-local .` | PASS — Flask multistage image |
| `docker build -t prg32-cartridge-store-frontend:m62b-local .` from `frontend/` | PASS — Next.js Node 24 multistage image |
| Disposable Docker score/metrics smoke | PASS — results in Section 11 |
| `PRAGMA integrity_check` | PASS — `ok` |
| Publication reconciliation | PASS — `CONSISTENT`, zero findings |
| `git diff --check` | PASS |

## 15. Remaining anonymous-ingestion risks

- Anonymous clients can forge scores by design; rate limits reduce abuse but do not establish authenticity.
- `player` remains self-asserted display text and can impersonate a person.
- No idempotency key exists, so firmware retries can create duplicate rows.
- Process-local rate limiting resets on restart and is not coordinated across replicas.
- Shared NAT addresses can combine multiple classroom consoles into one source bucket.
- Row-count admission does not fully cap SQLite WAL growth, file size, or disk exhaustion.
- HTTPS is recommended but M6.2b does not change HTTP-based development firmware.
- No anti-cheat or hardware-attestation property is provided.
- Public leaderboard data remains publicly readable, including `submitted_by` and player nickname fields.

## 16. M6.3 prerequisites

Before M6.3, decide and document:

1. score retention and archival policy;
2. operational database/WAL/disk capacity monitoring;
3. whether anonymous score aggregates require abuse filtering or moderation;
4. global rate-limit strategy if more than one Fastify process is deployed;
5. whether download telemetry and score statistics share public/admin visibility rules;
6. backup/restore evidence for the growing score table;
7. whether the public leaderboard needs pagination beyond the existing 1–100 limit.

## 17. Cutover blockers and recommendation

M6.2b does not authorize production score writes or public Fastify routing. Flask remains the sole operational writer, and score writes are disabled by default in Compose.

**GO for M6.3 assessment/implementation in isolation. NO-GO for production cutover.** M6.2b acceptance criteria are green for the disposable Fastify scope, but anonymous abuse, retention, multi-instance limiting, backup, and operational capacity remain cutover blockers. M6.3 was not started automatically.
