# PRG32 Cartridge Store — Publication and Backup SRP Refactoring Report

Date: 2026-10-13  
Scope: controlled maintainability refactor of the TypeScript backend  
Status: **GO for the isolated refactor; no new milestone started**

## Objective

This batch addressed the two largest backend services identified by the
architecture audit:

- `backend/src/consistency/publication.ts` — publication consistency,
  filesystem replacement, journal transitions, recovery, reconciliation, and
  catalog operations;
- `backend/src/backup/service.ts` — backup export/import, archive validation,
  database replacement, filesystem replacement, recovery, and maintenance
  locking.

The goal was meaningful SRP decomposition without changing public APIs,
SQLite schema, journal/archive formats, binary artifacts, firmware contracts,
WebSocket behavior, authentication, federation, Flask behavior, or Docker
production behavior.

## Baseline and characterization

Before changing the services, the existing backend checks were run with Node
24 selected through `nvm use 24`. The baseline was green: 26 test files and
132 tests passed, including the existing publication and backup suites.

Two focused characterization cases were added before the extraction:

1. publication refuses a missing pending artifact before writing a journal
   operation or changing the submission status;
2. publication compensates a filesystem replacement interruption and restores
   the original target bytes and pending database status;
3. backup rejects a manifest/filesystem inventory mismatch before live data or
   SQLite is mutated.

The focused consistency/backup tests passed with 17 tests. These cases protect
the failure boundaries that make a superficial line-count refactor unsafe.

## Publication workflow and preserved ordering

The publication service still owns the workflow because the order between the
filesystem and SQLite states is the behavior being protected:

1. validate the pending submission, metadata, paths, and expected artifacts;
2. write the `PREPARED` journal state;
3. materialize staged artifacts and the staged index, then write `STAGED`;
4. verify staged hashes and binary metadata, then write `VERIFIED`;
5. replace live artifact files while retaining recovery backups, then write
   `FILES_REPLACED`;
6. atomically replace the live index, then write `INDEX_REPLACED`;
7. update the submission/catalog database inside its existing immediate
   transaction, then write `DATABASE_UPDATED`;
8. write `COMPLETED` and remove pending, staging, and recovery material.

Recovery can resume or compensate an interrupted operation. Reconciliation
continues to detect missing or mismatched artifacts. SQLite and filesystem
changes are not treated as one atomic transaction; the existing journal and
backup protocol remains the compensating mechanism.

### Extracted publication boundary

`backend/src/consistency/publication-files.ts` now owns the filesystem and
locking primitives:

- bounded file reads and SHA-256 file hashing;
- safe relative paths, root containment, and symlink-component checks;
- directory creation, atomic file writes, JSON reads, directory scans, and
  regular-file existence checks;
- the publication lock, including stale-lock handling and lock cleanup.

`publication.ts` retains orchestration, journal state transitions, recovery,
compensation, database transactions, reconciliation, and catalog/variant
operations. Those responsibilities are coupled by transaction ordering and
are intentionally not hidden behind additional generic abstractions.

## Backup workflow and preserved ordering

The backup service continues to coordinate the complete protected workflow:

1. acquire the maintenance lock and create a consistent SQLite backup;
2. collect the live filesystem inventory and write the existing manifest;
3. create the archive and apply the existing encryption format when enabled;
4. validate upload size, archive paths, manifest, inventory, SQLite schema,
   catalog references, and pending-submission references before mutation;
5. create the existing recovery point, replace the database and managed
   filesystem data, and verify the restored state;
6. mark restore completion or execute the existing rollback/recovery path.

Archive encoding/decoding remains in `backend/src/backup/archive.ts`.

### Extracted backup boundary

`backend/src/backup/inventory.ts` now owns live-data inventory and filesystem
reference concerns:

- regular-file validation and SHA-256 inventory collection;
- database-artifact exclusion and derived-directory policy;
- copying and clearing managed data;
- validating catalog and pending-submission filesystem references;
- free-space and directory-size calculations.

`backup/service.ts` retains archive orchestration, SQLite snapshot/schema
validation, restore transactions, journal/recovery, rollback, and maintenance
locking because those operations must remain visible together to preserve the
pre-mutation validation and recovery guarantees.

## Structural result

| Module | Before | After | Extracted responsibility |
|---|---:|---:|---|
| `consistency/publication.ts` | ~1339 lines | 1226 | orchestration remains; filesystem/lock primitives moved out |
| `consistency/publication-files.ts` | new | 132 | publication filesystem safety and lock |
| `backup/service.ts` | ~751 lines | 602 | orchestration remains; inventory moved out |
| `backup/inventory.ts` | new | 153 | backup inventory and filesystem references |

The new modules are dependency-inward: they do not import the service classes,
so no service/helper cycle was introduced. No dependency was added to the
lockfile.

## Compatibility evidence

- Existing public HTTP routes and response shapes were not changed.
- Existing identifiers and SQLite schema were not changed.
- Publication journal states, filenames, and recovery semantics were not
  changed.
- Backup archive, manifest, encryption, and restore formats were not changed.
- Firmware-facing metrics/scores, binary downloads, and WebSocket routes were
  not changed.
- Flask remains present and unchanged as an authoritative compatibility
  service for the existing routes.
- No production routing, deployment, database migration, or data operation
  was performed.
- The removed Playwright/Authentik E2E workflow was not restored or invoked.

## Verification evidence

All Node commands used Node 24 through `source "$HOME/.nvm/nvm.sh" && nvm use
24`.

| Check | Result |
|---|---|
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run test` | PASS — 26 files, 135 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 10 files, 29 tests |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS in the prior baseline verification for this batch |

The frontend test run reports the existing non-failing Vite
`configLoader: native` warning. A frontend build without
`FLASK_PROXY_TARGET` is intentionally rejected by the existing configuration
guard; the documented build command supplies that target.

The canonical development stack was also rebuilt and started with:

```text
docker compose --profile dev up -d --build
```

The resulting services were healthy: `flask`, `next`,
`auth-writer`, and `auth-writer-edge-proxy`; the one-shot
`auth-writer-init` completed successfully. Representative requests through
the configured Traefik network returned:

```text
200 https://store.prg32.dream.test/
200 https://store.prg32.dream.test/login
200 https://api.prg32.dream.test/auth/csrf
200 https://api.prg32.dream.test/api/auth/providers
200 https://api.prg32.dream.test/api/games
```

The first store probe was made during Next readiness and returned 502; the
subsequent probe after the container reported ready returned 200. This is
recorded as startup timing evidence, not hidden as a pass.

## Remaining risks and deliberately retained boundaries

1. Publication reconciliation, journal recovery, and compensation remain in
   one orchestration module. Splitting them further would obscure the exact
   ordering between journal states, filesystem backups, and SQLite updates
   without a larger characterization campaign.
2. Backup restore journal/recovery and database replacement remain in the
   service for the same reason: validation-before-mutation and restart
   rollback are a single safety boundary.
3. The tree contains prior milestone changes and is intentionally not clean;
   this report does not claim ownership of unrelated dirty files.
4. Federation browser acceptance remains historical and unverified by design;
   Playwright and the disposable Authentik workflow remain out of scope.

## Rollback considerations

The refactor is source-level and data-neutral. Rolling it back means restoring
the two original helper groups into their services and deleting the two new
helper modules; no database migration, archive conversion, journal conversion,
dependency rollback, or production action is required. The characterization
tests can remain as regression coverage during that rollback.

## Next milestone recommendation

Proceed to a review/commit boundary for this isolated maintainability batch.
The next implementation milestone should be selected separately and should
continue one transaction-sensitive seam at a time, with characterization tests
before each extraction. Do not begin M6.3d.2h.12 or reintroduce browser E2E as
part of this refactor.
