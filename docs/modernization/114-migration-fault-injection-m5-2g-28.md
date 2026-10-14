# PRG32 Cartridge Store — M5.2g.28 Migration Fault Injection, Runtime Policy Closure & Rollback

Date: 2026-10-14

## 1. Executive result

This milestone was executed in controlled disposable/read-only mode. The
canonical migration fault-injection paths, runtime policy enforcement,
writer-lease boundaries, backup-v4 restore, and two-service candidate were
implemented or verified without changing operational services, data, routing,
Traefik, Authentik, DNS, TLS, or deployment state.

Decisions:

- `MIGRATION_FAULT_INJECTION_PARTIAL`: migration fault injection itself is
  verified, but the complete M5.2g.28 administrative browser acceptance and
  Mailpit delivery probe were not verified.
- `OPERATIONAL_CUTOVER_NO_GO`: the public domains still expose the
  transitional Next.js/Flask runtime and no operational cutover was authorized.
- `FLASK_RETIREMENT_NO_GO`: Flask remains the observed API runtime and is not
  removed by this milestone.

The worktree was already substantially dirty before this milestone. No reset,
clean, commit, push, deploy, operational Compose action, or production-data
operation was performed.

## 2. Scope and safety boundary

The implementation was limited to disposable canonical storage-v2 tests and
runtime-policy plumbing in the Fastify candidate. Operational Compose was
inspected only. A disposable candidate Compose project was started, health
checked, and removed; this was not the Dream operational project.

No real credentials, user payloads, database, cartridge store, Authentik
configuration, Traefik configuration, public authentication session, or
operational SMTP inbox was used.

## 3. Repository and documentation inventory

Initial checks:

```text
git status --short                         SOURCE_VERIFIED
git log -6 --oneline                       SOURCE_VERIFIED
git diff --check                           SOURCE_VERIFIED
git -C ../PRG32 status --short             SOURCE_VERIFIED
node                                       v24.20.0
pnpm                                       12.5.1
```

Node was selected with `source "$HOME/.nvm/nvm.sh" && nvm use 24`.

Modernization reports `00`–`83` are tracked. Reports `84`–`113` and the
previous evidence fixtures are present as untracked worktree files; they are
not ignored by Git and were not deleted. `docs/modernization/114...md` is the
only new Markdown file created for this milestone. The repository already
contains unrelated dirty source, test, deployment, frontend, and roadmap
changes from previous work; they are not attributed to M5.2g.28 here.

## 4. Runtime policy closure

`backend/src/settings/runtime-policy.ts` provides a small backend-independent
policy boundary. Persisted typed settings are read from the canonical
`application_settings` table, with compatibility defaults and the legacy
registration fallback where required.

The following policies are now enforced at the relevant backend boundary:

| Policy | Default | Enforcement |
| --- | ---: | --- |
| Registration enabled | `true` | Registration service rejects disabled registration |
| Publishing enabled | `true` | Canonical workflow and legacy submission service reject new publishing |
| Maximum artifact bytes | `52428800` | Canonical and legacy submission paths reject oversized bundles |
| Rejection note required | `false` | Review rejection requires a note when enabled; compatible default remains permissive |
| Session lifetime | `86400` seconds | New sessions use the persisted value dynamically |
| Telemetry collection | `true` | Metrics ingestion rejects writes when disabled |
| Maintenance mode | not exposed | Deferred because no complete maintenance traffic policy exists |

Administrative setting updates support `expected_versions` optimistic
concurrency checks. Conflicts return a stable `settings_conflict` error and
do not partially apply the patch. Public settings errors no longer expose raw
exception strings. SMTP runtime configuration is applied on writable startup,
and a synthetic SMTP server verified persistence, restart reload, and test
message submission without using Dream Mailpit.

The frontend administrator surface exposes only the currently enforced
registration, publishing, artifact-limit, rejection-note, and SMTP controls.
The non-enforced maintenance switch is deliberately absent.

Evidence: `UNIT_VERIFIED`, `SOURCE_VERIFIED`.

## 5. Administrative acceptance coverage

The focused admin runtime suite now covers:

- typed setting persistence and safe secret redaction;
- optimistic version conflict rejection;
- registration disable/re-enable;
- dynamic session lifetime for newly issued sessions;
- SMTP settings persistence and restart reload;
- synthetic SMTP connectivity and test-message submission;
- audit evidence for administrative changes.

The existing Playwright suite completed successfully: 12 tests passed in one
worker. It does not contain the full M5.2g.28 25-step browser acceptance for
all admin mutations, rejection-note policy, SMTP UI workflow, and reload
verification. That broader browser matrix is therefore `NOT_VERIFIED`, not
claimed as passed.

## 6. Dream infrastructure and Mailpit observation

Low-volume read-only observations were performed for:

```text
store.prg32.dream.test   -> 127.0.0.1
api.prg32.dream.test     -> 127.0.0.1
sso.dream.test            -> 127.0.0.1
mailpit.dream.test        -> 127.0.0.1
```

Observed public responses:

- `https://store.prg32.dream.test/health`: HTTP 404 from Next.js.
- `https://api.prg32.dream.test/health`: HTTP 404 from Werkzeug/Flask.
- `https://sso.dream.test/`: HTTP 302 to an Authentik login flow.
- `https://mailpit.dream.test/`: HTTP 405 to HEAD.

These are `HTTP_VERIFIED` observations only. They confirm routing and the
currently exposed transitional runtime; they do not constitute authentication
or cutover acceptance. No redirect was followed into a user session.

The local Mailpit container was inspected read-only and reported:

```text
image: axllent/mailpit:v1.27.4
state: running
health: healthy
networks: dream_edge, dream_mail
```

This is `MAILPIT_VERIFIED` for local container metadata. SMTP delivery to the
Dream Mailpit service is `MAILPIT_SMTP_BLOCKED`: no connection or message was
sent to the operational SMTP network, and the inbox was not read.

## 7. Migration inventory and deterministic recovery

The existing M5.2b inventory, M5.2c migration, and M5.2d differential
fixtures were reused. The migration remains disposable, explicit, resumable,
idempotent, and single-writer guarded. The source snapshot is not modified.

Additional deterministic interruption points were exercised after:

- artifact copy;
- media copy;
- submission copy;
- telemetry copy;
- before finalization;
- after finalization;
- before verification.

Each interrupted migration was reopened and resumed. The durable journal
completed without duplicate publication, object overwrite, or simultaneous
writer state.

Evidence: `FAULT_INJECTION_VERIFIED`, `UNIT_VERIFIED`.

The existing negative migration coverage includes source mutation detection,
authorization failures, missing/corrupt source material, read-only source
handling, and unmappable historical-download exceptions. A dedicated browser
orchestrator for every adversarial fixture named in the broader M5.2g.28 brief
was not added; those cases remain `NOT_VERIFIED` as a single end-to-end
acceptance matrix.

## 8. Writer ownership and rollback policy

The canonical writer lease remains the exclusive write boundary. The tests
verify that a second writer cannot acquire ownership while the first owner is
active, and that ownership is released after shutdown/failure paths.

`backend/src/storage-v2/rollback.ts` now exposes a non-destructive
post-cutover assessment. It explicitly returns that lossless rollback is not
available when canonical writes are absent from the legacy snapshot. The
supported decisions are:

- `reconcile_forward` — export/reconcile post-cutover writes;
- `accept_data_loss` — explicitly accept the identified loss window;
- `forward_fix` — repair the new owner without reverse migration.

No reverse migration is implemented. Pre-cutover abort remains disposable
target deletion with Flask retained as authority. Post-cutover rollback
requires writer quiescence, traffic control, reconciliation or an explicit
data-loss decision. Restarting Flask alone is not a rollback protocol.

Evidence: `UNIT_VERIFIED`, `FAULT_INJECTION_VERIFIED`.

## 9. Backup-v4 and restore evidence

The existing encrypted backup-v4 implementation was exercised against
synthetic canonical roots. The focused tests verify:

- encrypted archive creation and independent verification;
- key rotation and historical-key restore;
- wrong-key, tampered-ciphertext, truncated-archive, and incomplete-marker
  rejection;
- writer-lease enforcement;
- interrupted restore leaves a non-ready target;
- canonical application settings, administrative audit events, and catalog
  moderation state survive restore.

The earlier storage-v2 backup suite also passed streaming archive creation,
manifest verification, exact immutable object restoration, staging restore,
corruption rejection, and interrupted backup/restore quarantine.

Evidence: `UNIT_VERIFIED`, `FAULT_INJECTION_VERIFIED`.

## 10. Candidate runtime verification

The disposable candidate was initialized first with the explicit
`storage:candidate-init` authorization. Starting an empty bind root without
this initialization correctly failed closed with an unavailable canonical
database; it was not treated as a successful runtime.

Candidate Compose contains exactly two application services:

1. `fastify`, Node 24 bookworm-slim, canonical SQLite and storage bind mount;
2. `next`, Node 24 bookworm-slim, proxying to `fastify` over a private bridge.

Both Dockerfiles are multi-stage. The candidate runtime uses read-only
containers, `tmpfs` for temporary files, dropped capabilities, and
`no-new-privileges`. No Flask service or Dream operational network is included.

Verified:

```text
docker compose --profile dev config --quiet                         DOCKER_VERIFIED
docker compose -f deploy/candidate/compose.yaml config --quiet      DOCKER_VERIFIED
docker compose -f deploy/candidate/compose.yaml build              DOCKER_VERIFIED
Fastify /health and /ready                                           DOCKER_VERIFIED
Next /health                                                         DOCKER_VERIFIED
candidate compose down                                               DOCKER_VERIFIED
docker build -t prg32-cartridge-store:local .                       DOCKER_VERIFIED
```

The disposable candidate containers and network were absent after cleanup.
The synthetic bind root was not treated as operational data and was not
connected to the Dream infrastructure.

## 11. Security-negative coverage

Stable public settings errors are now generic and do not serialize raw
exception text. Existing authentication, CSRF, bearer-token, session
rotation, authorization, backup, archive-safety, and writer-isolation tests
remain passing.

No credentials, password hashes, session cookies, API tokens, encryption keys,
or private provider records were logged or placed in this report.

Evidence: `UNIT_VERIFIED`, `SOURCE_VERIFIED`.

## 12. Regression commands and actual results

Executed with Node 24 selected through nvm:

```text
pnpm --dir backend run typecheck                         PASS
pnpm --dir backend run lint                             PASS
pnpm --dir backend run test -- --reporter=dot           PASS: 50 files, 259 tests
pnpm --dir backend run build                            PASS
pnpm --dir frontend run typecheck                       PASS
pnpm --dir frontend run lint                            PASS
pnpm --dir frontend run test -- --reporter=dot          PASS: 22 files, 65 tests
pnpm --dir frontend run build                           PASS
pnpm --dir frontend run test:e2e                        PASS: 12 tests, 1 worker
SECRET_KEY=... ./.venv313/bin/python -m pytest -q     PASS: 64 tests
./.venv313/bin/python -m py_compile ...                PASS
docker compose --profile dev config --quiet              PASS
candidate Compose config/build                           PASS
root Dockerfile build                                    PASS
git diff --check                                          PASS
```

The backend suite initially had one timeout in an existing restore-interrupt
test under the default 5-second Vitest timeout. The test was given a bounded
15-second timeout for its real filesystem/process operation and the complete
rerun passed 259/259. This is a test-harness timing correction, not a relaxed
assertion.

## 13. Files changed for M5.2g.28

Implementation:

- `backend/src/settings/runtime-policy.ts`
- `backend/src/settings/service.ts`
- `backend/src/settings/routes.ts`
- `backend/src/auth/session.ts`
- `backend/src/auth/service.ts`
- `backend/src/app.ts`
- `backend/src/storage-v2/workflow.ts`
- `backend/src/storage-v2/rollback.ts`
- `backend/src/submission/service.ts`
- `backend/src/review/service.ts`
- `backend/src/review/routes.ts`
- `backend/src/metrics/service.ts`
- `frontend/src/components/admin/AdminWorkspace.tsx`

Tests:

- `backend/tests/admin-runtime-config.test.ts`
- `backend/tests/storage-v2-migration.test.ts`
- `backend/tests/storage-v2-backup.test.ts`
- `backend/tests/storage-v2-backup-v4.test.ts`

Documentation:

- `docs/modernization/114-migration-fault-injection-m5-2g-28.md`

The working tree contains many pre-existing changes from earlier milestones;
the list above is the M5.2g.28 scope, not a claim that all dirty files were
created in this turn.

## 14. Remaining application gaps

- The complete 25-step administrative browser matrix is not implemented or
  verified; existing Playwright coverage is narrower.
- Mailpit metadata is verified, but operational SMTP delivery is intentionally
  not probed.
- The public domains still expose Flask for the API and therefore do not prove
  Fastify ownership.
- The session cookie `Max-Age` remains configuration-derived while server-side
  session validity uses the persisted runtime lifetime; this should be
  reconciled before operational handover.
- Maintenance mode is intentionally not exposed because a complete traffic,
  health, authentication, and operator-bypass policy is not implemented.
- The broader adversarial fixture matrix is distributed across existing unit
  tests rather than one complete M5.2g.28 orchestrated acceptance test.

## 15. Operational blockers

The following remain explicit blockers and were not changed:

- no approved real-data migration window;
- no writer-quiescence and traffic-freeze procedure executed on operations;
- no public Fastify ownership switch;
- no authentication/session continuity decision for cutover;
- no publication/review/download/telemetry/multiplayer ownership switch;
- no production backup/restore rehearsal;
- no post-cutover rollback data-loss policy approval;
- no final browser acceptance across the real dual origins;
- no authorization to retire Flask.

## 16. Next milestone recommendation

The next milestone should be a narrowly scoped acceptance-closure phase that
adds the missing disposable Playwright admin mutation matrix, reconciles cookie
runtime lifetime semantics, and completes synthetic SMTP/provider acceptance.
It must remain separate from operational cutover until the ownership, backup,
rollback, and real-infrastructure approval gates are explicitly opened.

## 17. Final acceptance

The migration fault-injection implementation is technically verified for the
tested disposable boundaries and is safe to carry forward. The overall
M5.2g.28 acceptance is `PARTIAL` because the specified complete browser and
Mailpit delivery evidence is absent.

```text
MIGRATION_FAULT_INJECTION_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

No operational migration, Flask removal, deployment, commit, or push was
performed.
