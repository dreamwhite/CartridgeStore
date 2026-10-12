# M5.2b — Review, Approval & Publication Parity

**Date:** 2026-10-12
**Status:** implemented for the isolated TypeScript writer only
**Operational writer:** Flask remains the sole writer for production data

## Scope and decision

M5.2b adds review/list/detail, editor-group authorization, metadata review,
approval, rejection, publication reuse, reconciliation, and crash recovery to
the disposable Fastify writer. It does not register a production cutover, edit
Flask, change SQLite schema, change firmware contracts, or add storefront UI.

The implementation is deliberately behind the existing submission-write gate:
`PRG32_BACKEND_SUBMISSION_WRITE_ENABLED=true`,
`PRG32_BACKEND_SUBMISSION_WRITE_MODE=test`, and an explicitly disposable root
and authentication database. With the gate disabled, no TypeScript review
writer is created. Flask therefore remains authoritative for all operational
review/publication writes.

## Contract parity

The following existing Flask contracts are represented in
`backend/src/review/routes.ts`:

| Flask route | TypeScript route | Result |
| --- | --- | --- |
| `GET /api/submissions` | same | default `pending`; `status=all` removes filter; newest first |
| `GET /api/submissions/<id>` | same | `{ok:true,submission}`; missing is 404 `{ok:false,error:"submission not found"}` |
| `POST /api/submissions/<id>/verify` | same | reviewed metadata, publication, verified row |
| `POST /api/submissions/<id>/reject` | same | rejected row and pending-artifact cleanup |
| `GET /editor/submissions` | same | minimal server-rendered HTML review listing |
| `GET /editor/submissions/<id>` | same | minimal server-rendered HTML detail/form |
| editor POST verify/reject | same | CSRF-protected 302 to `/editor/submissions` |

The response fields retain the Flask row representation, including numeric
identifiers, `metadata`, `architectures`, `pending_dir`, submitter/reviewer
fields, and timestamps. Missing/non-pending errors use stable envelopes and do
not expose filesystem paths, exception text, or journal content.

## Authorization and CSRF

Review access requires an authenticated principal in the explicit `editors`
group. A role of `admin` alone is intentionally insufficient, matching the
Flask `editor_required` boundary. Session writes require the existing CSRF
token in the header or HTML form. Bearer-only requests use the established
firmware/API-token exemption. Authentication failures are 401, group failures
403, and CSRF failures are `{ok:false,error:"csrf token missing or invalid",code:"csrf_failed"}`.

Approval records the authenticated reviewer id/name. Rejection records the
same identity. No role escalation or ownership is invented by the TypeScript
layer.

## Metadata and publication behavior

Editable fields are exactly:

`title`, `summary`, `description`, `tags`, `license`, `homepage`, and
`repository`.

`id`, `version`, and `authors` are restored from the submitted metadata. A
changed value for any of those immutable fields is rejected; an equal value is
accepted as Flask does. Unknown fields are ignored. The reviewed metadata is
validated with the existing PRG32 metadata validator before publication.

Approval rebuilds every submitted architecture from the parsed legacy payload,
reviewed metadata, original icon/screenshot/colophon, and original binary
blocks. SIGN blocks are preserved. The existing M5.2a publication journal is
the only publication path: staged bytes, hashes, index replacement, database
transition, operation completion, and pending cleanup are reused without a
second writer or a new SQLite operation table.

Rejection has a small filesystem journal under
`review-operations/<rej-id>/operation.json` with `PREPARED`,
`DATABASE_UPDATED`, and `COMPLETED` states. The row transition is committed
before cleanup; recovery can safely repeat the status update and cleanup. The
pending path is accepted only when it is exactly `pending/<submission-id>` and
all path components are checked for traversal and symlinks.

## Concurrency, crash, and backup invariants

- Approval and rejection share the M5.2a single-instance publication lock.
- The row is re-read inside the serialized operation before a state-changing
  update; only `pending` rows can transition.
- A second operation against a completed/rejected row returns a stable 400
  state-conflict response and cannot delete a published artifact.
- M5.2a's operation journal retains reviewer identity and reviewed metadata so
  a fresh process can resume an interrupted approval without process memory.
- Reconciliation is read-only. It now includes incomplete rejection cleanup,
  rejected rows with stale pending artifacts, missing-row references, corrupt
  journals, and unsafe symlinks.
- A copied disposable database plus store root can be reopened and reconciled
  without repair or mutation.
- `pnpm reconcile --check` merges publication and review findings and exits
  non-zero for ambiguous/corrupt states.

The tests terminate a real child process with `SIGKILL` after publication index
replacement and after rejection database commit. A fresh service resumes each
operation and reaches a clean reconciliation result.

## Files added or modified

Added:

- `backend/src/review/errors.ts`
- `backend/src/review/routes.ts`
- `backend/src/review/service.ts`
- `backend/tests/review.test.ts`
- `backend/tests/fixtures/kill-review.ts`
- this report

Modified:

- `backend/src/app.ts` — registers isolated review routes/service;
- `backend/src/config/env.ts` — adds bounded review listing configuration;
- `backend/src/consistency/publication.ts` — review metadata, reviewer journal
  fields, reviewed-image rebuilding, and review reconciliation integration;
- `backend/src/submission/prg32.ts` — preserves SIGN blocks in rebuilt images;
- `backend/src/reconcile.ts` — merges review findings.

No Flask/Python source, operational database, schema migration, frontend, or
companion `../PRG32` file was changed for M5.2b.

## Differential and compatibility evidence

The contract fixtures are based on the actual Flask route implementation and
the existing Flask contract tests. The TypeScript suite exercises the same
listing default/order, detail-not-found envelope, editor-only access,
forbidden/equal metadata behavior, review identity fields, pending cleanup,
multi-architecture publication, catalog lookup, binary download, rejection,
CSRF, concurrency, crash recovery, and copied-store restore path. The Flask
suite remains a separate executable check and remains the operational
authority; no dual-writer comparison or production data was used.

The Docker smoke used a fresh Compose project and named volumes:

```bash
docker compose -p prg32-m52b --profile writer-init run --rm auth-writer-init
docker compose -p prg32-m52b --profile writer up -d auth-writer
```

It bootstrapped a synthetic editor, submitted a two-architecture ZIP, fetched
detail, approved with changed title/tags, downloaded the published `qemu`
binary, submitted a second ZIP, rejected it, and ran `node dist/reconcile.js
--check` inside the container. The final report was `CONSISTENT` with zero
findings. The project and its named volumes were then removed.

## Defaults and remaining risks

`PRG32_BACKEND_REVIEW_MAX_SUBMISSIONS` defaults to `1000`. Review journal files
are bounded at 512 KiB. The existing publication bounds remain authoritative
for cartridge bytes, index bytes, and scan entries. Review HTML is intentionally
minimal and is not the new storefront.

Remaining risks are intentionally not closed here: operational single-writer
cutover, Flask/TypeScript live-data reconciliation, backup encryption/key
management, external-provider identity migration, public routing, metrics and
scores migration, and multiplayer parity. A hostile operator with write access
to the disposable root can still alter files; reconciliation reports that
state but does not silently repair it.

## Rollback

Disable the disposable writer profile or stop the isolated writer. Flask routes
and operational data are unchanged. For an interrupted disposable operation,
quiesce the writer, save `pnpm reconcile --check`, inspect the journal and
hashes, then explicitly resume or compensate with the M5.2a service. Do not
delete journals or pending data as an automatic rollback.

## Verification

The exact command results are recorded below after the final verification run.

| Check | Result |
| --- | --- |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run check` in `backend/` | PASS — 57 tests; typecheck, lint, tests, build |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| Python compilation and `git diff --check` | PASS |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run typecheck && pnpm run lint && pnpm run test && FLASK_PROXY_TARGET=http://flask:5080 pnpm run build` in `frontend/` | PASS — 5 tests; Next.js production build; Vite config warning only |
| `docker compose --profile dev config`, `--profile writer-init config`, `--profile writer config` | PASS |
| `docker build -t riscv-prg32/cartridge-store-backend:dev ./backend` | PASS — Node 24 multistage image |
| `docker build -f frontend/Dockerfile -t riscv-prg32/cartridge-store-frontend:local ./frontend` | PASS — Node 24 multistage standalone Next.js image |
| `docker build -t riscv-prg32/cartridge-store:dev .` | PASS — Python 3.13 multistage image |
| Docker submission → review → approval/rejection → catalog/download smoke | PASS — isolated writer, two architectures; final reconciliation `CONSISTENT`, zero findings |
| Backup/restore and actual-process crash recovery | PASS — Vitest |

## Next milestone and cutover gate

M5.2b is complete only for this isolated parity scope. It is not a public
cutover and does not authorize M6. The next milestone may address remaining
read/write domains only after this report's Docker and full-repository checks
are green, with Flask still the sole operational writer and an explicit
rollback owner.
