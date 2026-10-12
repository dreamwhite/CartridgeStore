# M5.2a — Publication Consistency, Reconciliation & Crash Recovery

**Date:** 2026-10-12
**Status:** implemented for the disposable TypeScript writer only
**Operational writer:** Flask remains the sole writer for production data

## Scope and outcome

M5.2a adds a reusable TypeScript publication-consistency subsystem without
adding a public publication or review route. It operates only when the
isolated writer configuration is enabled with
`PRG32_BACKEND_SUBMISSION_WRITE_MODE=test` and a disposable root/database.

It provides a durable filesystem journal, explicit state transitions,
same-filesystem staging, bounded SHA-256 verification, operation-specific
backups, explicit resume/compensation, a single-instance lock, and a read-only
`pnpm reconcile --check` command. No Flask route, production database,
operational catalog, production Docker mount, or PRG32 companion-repository
file was changed. No SQLite schema migration or operation table was introduced.

## Authority and reusable invariants

| Domain | Authority in this milestone |
| --- | --- |
| Published cartridge bytes | `cartridges/<game>/<version>/<architecture>.prg32` |
| Catalog metadata and variant references | `index.json` |
| Submission/auth/workflow status | Existing SQLite tables, disposable copy only |
| Metrics, scores, downloads, and telemetry | Flask-owned operational SQLite |
| Publication operation durability | Disposable filesystem journal |

Future Fastify acceptance criteria are independent of Flask:

1. Every operation has a durable identity, submission identity, game/version,
   intended architectures, target paths, expected/prior hashes, index hashes,
   state, timestamps, and error state.
2. Absolute paths, traversal, drive prefixes, NULs, and symlink components are
   rejected; all files are regular files below the configured disposable root.
3. Pending/staged bytes are bounded, hash-checked, and PRG32-validated before
   replacement.
4. Index updates preserve unrelated entries, use a bounded temporary file, and
   are verified before replacement.
5. Resume proceeds only when the current artifact equals the expected prior or
   expected new hash. Any other hash is ambiguous and fails closed.
6. Recovery is explicit; startup never silently deletes or compensates data.
7. Reconciliation is read-only and never repairs the filesystem or database.
8. Flask remains the only operational writer until an authorized cutover.

## Disposable layout and state machine

```text
<disposable-root>/
├── pending/<submission-id>/
├── publication-staging/<operation-id>/
├── publication-backups/<operation-id>/
├── publication-operations/<operation-id>/operation.json
├── cartridges/<game>/<version>/<arch>.prg32
├── index.json
└── publication.lock
```

```text
PREPARED -> STAGED -> VERIFIED -> FILES_REPLACED -> INDEX_REPLACED
                                                     -> DATABASE_UPDATED
                                                     -> COMPLETED

Any incomplete state -> explicit resume
Any incomplete state -> COMPENSATING -> COMPENSATED
Ambiguous/manual cases -> RECOVERY_REQUIRED or FAILED
```

Each transition is persisted after its durable boundary. Staged and target
paths remain below one configured root; the implementation does not claim
cross-filesystem atomicity. File and directory fsync is best-effort because
platform support differs.

## Preparation, recovery, and rollback

Preparation validates the pending database identity, architecture list, safe
pending paths, regular files, PRG32 metadata identity, and current catalog
index. It records target/prior hashes before changing published artifacts.
Staging writes and verifies cartridge bytes and a Flask-compatible index.
Replacement backs up existing files/index, replaces them, updates only the
disposable submission row to `verified`, and removes disposable staging and
completed pending input.

The internal service supports `resume` and `compensate`; it is not registered
as a public Fastify route. Compensation restores operation-specific backups
only after proving that current bytes still equal the operation's intended
hash. A changed current hash is refused as ambiguous.

For a disposable recovery: quiesce the writer, save `pnpm reconcile --check`
JSON, choose explicit resume or compensation after inspecting hashes, then
rerun reconciliation. Operational rollback remains the existing Flask
procedure: quiesce writes, snapshot SQLite plus filesystem, reconcile, and
restore a known-good snapshot if compensation cannot prove safety.

## Reconciliation command

```bash
nvm use 24
pnpm reconcile --check
```

The command is available from `backend/`, requires the disposable writer
profile, prints structured JSON to stdout, and prints a one-line summary to
stderr. It exits non-zero for ambiguous/corrupt results. Stable finding codes
cover pending-row/directory mismatches, missing architecture variants, orphan
pending directories, index/file absence, published hash mismatches, published
files missing from the index, verified submissions without publication,
published artifacts with pending submissions, incomplete/conflicting journal
operations, interrupted compensation, stale temporary files, malformed
journals, and unsafe symlinks. `--check` performs no mutation.

## Evidence and compatibility

The Vitest suite includes fault points around operation creation, staging, file
replacement, index replacement, database transition, completion, and
compensation. It terminates a real child process with `SIGKILL` after index
replacement; a fresh process reclaims the stale lock and resumes to
`COMPLETED`. A second test replaces an existing published artifact, verifies
the binary/index backups, interrupts after the disposable database transition,
and compensates back to the exact previous bytes and pending state.

The index preserves the existing `abi`/`games`/`versions`/`architectures`
structure and unrelated entries. Published filenames, PRG32 metadata ABI, and
`esp32c6`/`qemu` architecture identifiers remain unchanged. Flask continues
to own operational publication/review behavior. The local `../PRG32`
companion repository remains unchanged.

## Verification results

| Check | Result |
| --- | --- |
| `nvm use 24 && pnpm run check` in `backend/` | PASS — 53 TypeScript tests; typecheck, lint, and build pass |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 64 Flask tests |
| `python -m py_compile app.py cartridge_store/*.py` | PASS |
| Frontend typecheck, lint, Vitest | PASS — 5 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 pnpm run build` in `frontend/` | PASS |
| Frontend composite `pnpm run check` without `FLASK_PROXY_TARGET` | Expected guard failure at production build; the individual checks and configured production build above pass |
| `docker compose --profile dev config`, `--profile writer-init config`, and `--profile writer config` | PASS |
| Backend multistage Docker build | PASS |
| Flask multistage Docker build | PASS |
| Disposable writer health + `node dist/reconcile.js --check` smoke | PASS — `CONSISTENT`, zero findings |
| `git diff --check` | PASS |

## Files and deviations

Added:

- `backend/src/consistency/errors.ts`
- `backend/src/consistency/publication.ts`
- `backend/src/reconcile.ts`
- `backend/tests/consistency.test.ts`
- `backend/tests/fixtures/kill-publication.ts`
- this report

Modified:

- `backend/package.json` — disposable `reconcile` script;
- `docs/modernization/19-revised-migration-roadmap.md` — status and next gate.

The journal is filesystem-based rather than a new SQLite operation table. This
is deliberate: it keeps M5.2a isolated and avoids an unapproved operational
schema migration. Distributed coordination, automatic repair, public
publication/review parity, score authentication, metrics migration, WebSocket
parity, and routing cutover remain out of scope.

## Next milestone

M5.2a is complete for the isolated consistency/recovery scope. M5.2b is not
started. The next milestone must be separately authorized after review and
must preserve Flask as the single operational writer while defining
publication/review parity, route authorization, and cutover/rollback evidence.
