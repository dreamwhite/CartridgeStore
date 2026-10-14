# PRG32 Cartridge Store — M5.2g.2 Fastify Canonical Workflow

Date: 2026-10-14  
Status: **GO for disposable canonical workflow; NO-GO for operational cutover**

## 1. Executive result

M5.2g.2 is implemented as an explicit, opt-in, disposable-only Fastify
submission, review and publication workflow. The actual HTTP routes now use
the canonical storage-v2 SQLite database and immutable object layout when all
workflow guards are enabled. Legacy mode remains the default and is unchanged.

The implementation does not make Fastify the operational owner. Flask,
Compose, Traefik, external authentication, production data, public routing,
and the `../PRG32` repository were not modified.

## 2. Scope and safety boundary

The workflow can be enabled only with all of the following:

- `PRG32_BACKEND_CATALOG_READ_MODE=canonical-disposable`;
- an explicit canonical storage-v2 root with its storage marker;
- the exact M5.2g.1 read authorization value;
- `PRG32_BACKEND_CANONICAL_WORKFLOW_MODE=disposable`;
- the exact M5.2g.2 write authorization value;
- a non-production environment;
- a root separated from the repository, legacy store and legacy database.

The service opens the canonical target read-write only in this mode and holds
a process-lifetime filesystem writer lease. A second workflow process is
rejected while the first lease is live. Legacy submission and publication
services are not instantiated when canonical workflow mode is active.

## 3. Implemented workflow

`backend/src/storage-v2/workflow.ts` implements the disposable canonical
workflow behind the existing route contracts:

- `POST /api/publish`, `POST /api/publish/bundle` and `/publish` validate the
  existing ZIP and cartridge contracts, authenticate the owner, enforce CSRF,
  create canonical `submissions`, and stage private artifact bytes;
- `GET /api/submissions`, `/api/submissions/:id` and
  `/api/submissions/mine` read canonical submission state;
- `POST /api/submissions/:id/verify` records an approval and creates a durable
  publication operation;
- `POST /api/submissions/:id/reject` records a rejection while retaining
  private staging for recovery/audit;
- catalog, detail, media and download routes read the resulting canonical
  release through the M5.2g.1 source.

The canonical path uses the existing tables rather than the legacy index or
legacy cartridge directories:

`submissions`, `submission_artifacts`, `review_decisions`,
`publication_operations`, `publication_operation_items`,
`publication_events`, `storage_objects`, `releases`, `artifacts`, and
`media`.

## 4. Validation and private staging

The workflow reuses the existing ZIP parser and submission bundle validator.
It preserves valid PRG32 bundles and stages each validated variant below the
canonical disposable root. Staging paths are checked against traversal and
symlink attacks, files are written with private permissions, and staged bytes
are recorded with size and SHA-256.

Review metadata is applied through the existing editable-field policy. ID,
version and authors cannot be changed during review. Invalid review metadata
is returned as a stable 400 response; internal exception text is not exposed.

## 5. Durable publication protocol

Approval first writes a durable `prepared` operation, object records in
`staged` state, operation items, the approval decision and a publication event
in one SQLite transaction. Object promotion then:

1. rebuilds the reviewed cartridge from private staging;
2. verifies the planned SHA-256 and byte size;
3. writes through a private temporary file;
4. fsyncs and atomically links the immutable object;
5. verifies the promoted object from disk;
6. marks the object and operation item available/verified.

Only after every referenced artifact and media object is verified does the
workflow commit the published release, artifact/media relationships,
submission status and visibility event. A published catalog row therefore
cannot be created from an unverified or merely staged object.

The operation state and event history are resumable across process reopen.
Existing valid objects are reverified rather than overwritten. Conflicts,
missing staging bytes, hash mismatches and incompatible journal data fail
closed.

## 6. Crash recovery and single-writer behavior

The recovery path resumes operations in `prepared`, `objects_staged`,
`objects_verified`, `database_committed` and `cleanup_pending` states. It does
not auto-publish an unrelated operation, discard incomplete staging, or
reuse an existing target root.

The filesystem lease is held until the workflow is closed. A live competing
PID receives `canonical_writer_lock_held`; malformed lock data fails closed;
dead-process locks may be reclaimed by an explicit new disposable process.

Deterministic fault points cover durable intent, object promotion, visibility,
completion and staging cleanup. An interrupted operation remains durable and
non-ambiguous, and the next disposable process either resumes it or refuses
startup if recovery is not safe.

## 7. Authorization and compatibility

The existing AuthService, permission guards, session cookies, CSRF checks and
generic OIDC/SAML boundaries remain in use. The external provider remains
provider-neutral; local infrastructure uses `sso.dream.test`, and no provider
credentials are stored in this repository.

Canonical ownership is resolved against the canonical `users` table. The
authenticated principal ID and role must match the canonical account, and
disabled or missing accounts are rejected. Review and rejection continue to
require the existing submissions permissions. Anonymous requests, missing
CSRF, stale roles and non-authorized users cannot mutate canonical state.

The route response envelopes and identifiers remain compatible with the
existing submission/review APIs. Canonical internal storage keys are not
exposed through public catalog responses.

## 8. Files changed for M5.2g.2

Implementation and tests:

- `backend/src/app.ts` — selects canonical workflow only in the explicit
  disposable mode and closes it with the app;
- `backend/src/config/env.ts` — validates workflow mode, root and exact write
  authorization;
- `backend/src/storage-v2/read-mode.ts` — adds the M5.2g.2 write marker;
- `backend/src/storage-v2/writer-lock.ts` — persistent single-writer lease;
- `backend/src/storage-v2/workflow.ts` — canonical submission/review/
  publication service;
- `backend/src/storage-v2/index.ts` — exports workflow primitives;
- `backend/src/submission/service.ts` — exposes the existing bundle validator;
- `backend/src/submission/routes.ts` and `backend/src/review/routes.ts` —
  accept the compatible workflow interfaces;
- `backend/src/review/service.ts` — defines the shared review workflow
  boundary;
- `backend/tests/canonical-workflow-http.test.ts` — disposable HTTP,
  recovery and writer-lease coverage.

The worktree already contained M5.2e, M5.2f and M5.2g.1 changes before this
milestone. Those changes were preserved and are not retroactively attributed
to M5.2g.2.

## 9. Verification evidence

Executed with Node.js 24.20.0 after `nvm use 24`:

```text
pnpm --dir backend run typecheck                         PASS
pnpm --dir backend run lint                             PASS
pnpm --dir backend run test                             PASS — 37 files, 190 tests
pnpm --dir backend run build                            PASS
pnpm --dir backend exec vitest run tests/canonical-workflow-http.test.ts
                                                         PASS — 3 tests
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

The bare frontend production build without `FLASK_PROXY_TARGET` failed closed
as designed by `next.config.ts`; it was then run successfully with the
required development proxy target. No Docker service was started or stopped.

The existing M5.2e backup/restore tests remain part of the backend suite and
continue to exercise disposable backup, restore, corruption and interruption
behavior. The M5.2d differential evidence remains available independently;
this milestone does not claim operational parity.

## 10. Remaining risks and limitations

- The canonical writer is intentionally disposable-only and is not public
  operational ownership.
- Download telemetry, scores, metrics, multiplayer WebSocket, mDNS, session
  continuity and reverse-proxy ownership remain separate cutover gates.
- The workflow has no reverse migration and does not reconcile post-cutover
  writes into a Flask snapshot.
- A future operational implementation must define writer quiescence,
  retention/authenticity of backups, monitoring, and a rollback data-loss
  decision before routing changes.
- The private staging/recovery model must be re-audited before any operational
  enablement, especially for orphaned staging after a process crash during
  initial submission creation.

## 11. M5.2g.3 and operational decisions

M5.2g.2 is **GO for disposable canonical submission, review and publication
verification**.

It is **NO-GO** for:

- operational canonical writes;
- public Fastify ownership or traffic cutover;
- dual-writer operation;
- Compose, Traefik, Authentik or provider changes;
- Flask removal or retirement;
- deployment, commit or push;
- starting M5.2g.3 or M6.3d.2h.12.

The next milestone requires a separately authorized operational ownership and
cutover plan, including publication/review, telemetry, scores/metrics,
WebSocket/mDNS, authentication/session continuity and rollback gates.
