# PRG32 Cartridge Store — M5.2g.3 Fastify canonical telemetry integration

Date: 2026-10-14  
Status: **GO for disposable canonical integration; NO-GO for operational cutover**

## 1. Executive result

M5.2g.3 connects the real Fastify HTTP routes for download telemetry, scores,
runs, metrics and statistics to the same canonical storage-v2 SQLite runtime
used by the disposable M5.2g.2 workflow. The implementation preserves the
existing firmware-facing envelopes and authentication/rate-limit boundaries,
and adds HTTP/concurrency/idempotency/regression coverage.

The integration is explicitly disposable-only. Legacy mode remains the
default, Flask remains operational owner, and no operational database,
Compose service, routing, Traefik, external provider, `../PRG32` repository,
or public cutover was changed.

## 2. Scope and safety boundary

Canonical telemetry mode is accepted only with the existing M5.2g.1 read
authorization, the M5.2g.2 disposable workflow marker, an explicit isolated
storage-v2 root and non-production configuration. The canonical workflow owns
one writable storage-v2 SQLite connection and one filesystem writer lease.
Scores, runs, samples, download events and statistics use that same database
connection; no second canonical telemetry database is opened.

The AuthService may retain its existing dedicated authentication connection
for session/account operations. That is an authentication boundary, not a
second telemetry writer. No canonical HTTP route is enabled by default or in
production configuration.

## 3. Canonical version and data model

The verified target tuple remains:

| Field | Value |
| --- | ---: |
| Schema version | 2 |
| Storage layout version | 2 |
| Publication journal version | 1 |
| Backup format version | 3 |

Canonical telemetry uses the existing tables without schema migration:

- `download_events` with cartridge, release and artifact identities,
  architecture, principal/IP/user-agent fields and delivery outcome;
- compatible `scores`, `runs`, `samples`, users/groups and settings tables;
- existing `migration_exceptions` and publication/migration evidence.

No SQLite schema or identifier migration was introduced in M5.2g.3.

## 4. Download telemetry protocol

The download route resolves a published, available canonical release, artifact
and immutable object first. Only a successful resolution can create an event.
The event is committed before conditional response handling or streaming,
matching Flask’s existing semantics:

- full requests create one `started` event;
- valid partial requests create one event;
- valid conditional requests that return `304` create one event;
- concurrent valid requests each create one event;
- invalid ranges, missing versions and unavailable objects create no event;
- client disconnects after event commit are represented as started delivery,
  consistent with the legacy pre-stream recording boundary.

User IDs are taken from the authenticated canonical principal when available;
anonymous events retain a null user ID. IP addresses are SHA-256 hashed and
user-agent values are bounded to 300 characters. Raw credentials and session
values are never recorded.

## 5. Scores, runs and metrics

The existing ScoreServer-compatible `POST /api/scores` contract remains
anonymous-compatible and returns its existing success/error shapes. Canonical
score writes use the storage-v2 transaction and existing rate limiter.

The existing MetricsServer-compatible routes remain available:

- `POST /api/runs`;
- `POST /api/metrics/batch`;
- `POST /api/runs/<run_id>/finish`;
- authenticated run detail and export routes.

Canonical run creation is idempotent for an exact retry and returns a stable
409 `run_state_conflict` for the same ID with different metadata. Finishing a
run is likewise idempotent for the same timestamp and rejects a conflicting
timestamp. Batch samples remain transactional: validation or resource-limit
failure does not leave a partial sample batch. Anonymous firmware ingestion is
preserved; owner/admin authorization for private reads remains unchanged.

Statistics routes now select the correct canonical `cartridge_id` column while
legacy mode continues to use legacy `game_id`. Downloads, leaderboard scores
and run totals are read from the same canonical database that accepted the
writes.

## 6. Historical migration and identity reconciliation

The disposable fixture runs the existing M5.2b inventory, M5.2c migration and
M5.2d verification before HTTP activity. Historical download events, scores,
runs, samples and migration exceptions are counted and verified before and
after the new writes. Stable canonical IDs and the pre-existing migration
exception rows are preserved. The source SQLite file and legacy `index.json`
remain byte-for-byte unchanged, and no legacy write occurs in canonical mode.

The integration does not invent ownership for historical anonymous records.
Existing migrated principal IDs remain unchanged and new anonymous firmware
events/runs retain null ownership where the protocol requires it.

## 7. Private staging orphan containment

`backend/src/storage-v2/staging-audit.ts` adds a read-only bounded startup
audit for private submission staging. It verifies the canonical path shape,
submission/artifact references, regular-file boundaries, symlink rejection,
size and SHA-256, unexpected files, scan limits and missing bytes.

An orphaned numeric submission directory, unreferenced file, missing staged
artifact, mismatched hash/size, symlink or ambiguous filesystem entry fails
canonical workflow startup with a recovery-required error. The audit never
deletes or auto-promotes ambiguous bytes, preserving evidence for a deliberate
disposable recovery action. A regression test proves an orphaned directory is
rejected before canonical HTTP startup.

## 8. Writer and concurrency boundary

The existing `CanonicalWriterLease` remains process-persistent. Canonical
workflow startup obtains the lease before recovery and releases it on app
close. The telemetry operations use `BEGIN IMMEDIATE` for download events,
scores, run lifecycle transitions and metric batches. A second disposable
writer is rejected; no dual-writer or public operational ownership is claimed.

## 9. HTTP compatibility coverage

`backend/tests/canonical-telemetry-http.test.ts` exercises the actual Fastify
routes and verifies:

- full, partial, conditional and ten concurrent downloads;
- invalid range and missing-version rejection without telemetry;
- anonymous score ingestion and score rate limiting;
- anonymous run creation, exact retry and conflicting metadata;
- metric batch insertion and sample count;
- idempotent and conflicting run finish;
- authenticated run detail;
- canonical statistics for downloads, scores and runs;
- source/index immutability, migration-exception preservation and no legacy
  index creation;
- private staging orphan fail-closed behavior.

Existing score, metrics, authorization, CSRF, storage, differential and
firmware compatibility suites remain unchanged and pass.

## 10. Fault and adversarial evidence

M5.2g.3 reuses the durable single-writer and transactional primitives from
M5.2e/g.2. The complete backend suite continues to pass the M5.2e backup and
restore fault/adversarial tests, including corrupt archive, truncated or
unsafe member, interrupted backup/restore, object integrity, fresh-root
restore and rollback-state checks. The M5.2g.3 HTTP suite adds concurrency,
transactional metric and writer-boundary coverage. No operational process or
root was used for fault injection.

## 11. Sensitive data and diagnostics

The stable API error envelopes remain in use. Conflict errors expose only the
stable `run_state_conflict` code and bounded public message. Server logs keep
diagnostics through Fastify’s existing logger, while credentials, session
cookies, password hashes, API tokens, encryption keys and private payloads are
not included in the new telemetry records or manifest/report output.

Canonical v3 developer backup encryption behavior is unchanged from M5.2e:
the archive is sensitive, checksums provide integrity rather than
authenticity, and no key is embedded. Operational retention, encryption and
authenticity policy remain cutover gates.

## 12. Files changed for this milestone

The worktree already contained earlier M5.2e, M5.2f, M5.2g.1 and M5.2g.2
changes. The M5.2g.3 implementation changes are:

- `backend/src/app.ts` — selects the canonical database for telemetry and
  statistics and injects the download sink only in canonical mode;
- `backend/src/catalog/routes.ts` — records a resolved download event before
  conditional/stream responses through a typed telemetry boundary;
- `backend/src/metrics/errors.ts` — stable run conflict error contract;
- `backend/src/metrics/service.ts` — canonical idempotent/conflict-safe run
  creation and finish transactions;
- `backend/src/stats/service.ts` and `backend/src/stats/routes.ts` — legacy
  versus canonical download-column selection and route wiring;
- `backend/src/storage-v2/workflow.ts` — canonical download event insertion;
- `backend/src/storage-v2/staging-audit.ts` — bounded read-only staging audit;
- `backend/src/storage-v2/index.ts` — exports the staging audit;
- `backend/tests/canonical-telemetry-http.test.ts` — HTTP, concurrency,
  compatibility, rate-limit and staging-orphan coverage;
- this report and the revised roadmap.

No production configuration, database schema, Flask code, Docker Compose file,
Traefik integration, Authentik/provider state or `../PRG32` file was changed.

## 13. Commands and results

Executed after selecting Node 24 with `nvm use 24` (`v24.20.0`):

```text
pnpm --dir backend run typecheck                         PASS
pnpm --dir backend run lint                             PASS
pnpm --dir backend run test                             PASS — 38 files, 193 tests
pnpm --dir backend run build                            PASS
pnpm --dir backend exec vitest run tests/canonical-telemetry-http.test.ts
                                                         PASS — 3 tests
pnpm --dir backend exec vitest run tests/storage-v2-backup.test.ts
                                                         PASS — 8 tests
pnpm --dir backend exec vitest run tests/storage-v2-differential.test.ts
                                                         PASS — 1 test
pnpm --dir frontend run typecheck                       PASS
pnpm --dir frontend run lint                            PASS
pnpm --dir frontend run test                            PASS — 20 files, 55 tests
FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build
                                                         PASS
SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q
                                                         PASS — 64 tests
python3 -m py_compile app.py cartridge_store/*.py       PASS
docker compose --profile dev config --quiet              PASS
git diff --check                                         PASS
```

The focused backup, differential, workflow and telemetry tests execute only
synthetic disposable roots. No Docker service was started, stopped, removed
or rebuilt. No production data or operational volume was accessed.

## 14. Known limitations

- Delivery outcome remains `started` at the pre-stream boundary; a later
  completion/failure delivery protocol is not introduced.
- The integration is not hot-operational backup or dual-writer support.
- Historical telemetry is reconciled only through the existing disposable
  migration and verification path; no operational reconciliation job exists.
- Auth/session continuity, publication/review ownership, WebSocket/mDNS,
  public routing, backup retention/authenticity and cutover monitoring remain
  open.
- Post-cutover rollback still requires writer quiescence, traffic control and
  reconciliation of writes accepted after the legacy snapshot. Restarting
  Flask alone is not a safe rollback.

## 15. GO/NO-GO decisions

**GO:** disposable canonical Fastify telemetry, scores, runs, metrics and
statistics integration with compatibility evidence.

**NO-GO:** operational Fastify ownership, public routing, dual-writer mode,
Compose simplification, deployment, Flask removal/retirement, or any later
M5.2g/M6.3d.2h milestone.

## 16. Next milestone

M5.2g.4 remains separately gated. Before operational ownership can be
considered, the project still needs final cutover authority, writer
quiescence, session continuity, publication/review and telemetry reconciliation,
WebSocket/mDNS routing ownership, backup authenticity/retention policy,
monitoring and an explicit rollback data-loss decision.
