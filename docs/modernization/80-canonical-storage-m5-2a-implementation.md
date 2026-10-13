# PRG32 Cartridge Store — M5.2a canonical storage implementation

Date: 2026-10-14
Status: isolated foundation implemented; operational cutover **NO-GO**.

This report records the authorized M5.2a implementation only. The code is a
disposable Fastify/TypeScript backend foundation. It is not imported by the
running server, Flask, any route, Docker startup path, or production data
directory. No migration, dual writer, deployment, or M5.2b workflow was
started by this implementation.

## 1. Result

M5.2a is complete for its isolated acceptance scope:

- target SQLite schema and version tuple initialize only from a new empty
  disposable root;
- immutable filesystem object storage records physical metadata once in
  `storage_objects`;
- relationship services validate `object_kind` in application code;
- publication items are identified by `(operation_id, expected_object_id)` and
  support multiple architecture-specific media objects;
- staged submission bytes have a bounded, generated-path primitive without
  creating submission or publication rows;
- resolution and audit are read-only with respect to published data and fail
  closed on unsafe paths, symlinks, missing objects, metadata mismatch, and
  incompatible versions;
- deterministic fault-injection tests cover the write/promotion/database
  boundary.

## 2. Corrected target schema

The implementation is intentionally stricter than the first M5.2 design draft.

`storage_objects` is the sole authority for:

- `storage_key`;
- `sha256`;
- `size_bytes`;
- `media_type`.

`artifacts`, `media`, and `site_assets` store only relationship-specific data
and their `object_id`. They do not duplicate physical metadata. The sole
intentional exception is `submission_artifacts.sha256` and
`submission_artifacts.size_bytes`, which describe bytes in pre-promotion
submission staging.

`publication_operation_items` contains `target_role` and uses:

```sql
UNIQUE (operation_id, expected_object_id)
```

Its application and SQLite checks allow artifact objects, site assets, and
media roles (`icon`/`screenshot`) for release-wide, `esp32c6`, and `qemu`
variants. Therefore one operation can contain four distinct media objects:
both roles for both architectures.

SQLite foreign keys prove object existence. They do not prove semantic kind,
so relationship creation and the integrity audit also require `artifact` ->
`artifact`, `media` -> `media`, and `site_asset` -> `site_asset`.

## 3. Implementation boundary

New isolated files:

- `backend/src/storage-v2/types.ts` — target constants, path and record types;
- `backend/src/storage-v2/schema.ts` — compatible-table and target-table SQL;
- `backend/src/storage-v2/database.ts` — disposable initializer, open, and
  version checks;
- `backend/src/storage-v2/objects.ts` — immutable object write, resolver,
  metadata access, and verification;
- `backend/src/storage-v2/staging.ts` — bounded submission staging primitive;
- `backend/src/storage-v2/relationships.ts` — object-kind and publication-item
  relationship validation;
- `backend/src/storage-v2/integrity.ts` — read-only schema, filesystem,
  relationship, hash, symlink, orphan, and temporary-file audit;
- `backend/src/storage-v2/index.ts` — module exports;
- `backend/tests/storage-v2.test.ts` — deterministic compatibility and
  adversarial fixtures.

The existing Fastify server and Flask application were not wired to this
module. No route, startup behavior, database environment variable, Docker
mount, Jinja template, authentication flow, or production configuration was
changed for M5.2a.

## 4. Disposable initializer and version safeguards

`initializeDisposableStorage(root)` requires a new empty directory, rejects
filesystem roots, repository/operational roots, symlink roots, non-directories,
parent traversal, and non-empty roots, then creates:

```text
<root>/store.sqlite
<root>/storage/objects/{artifacts,media,site-assets,.tmp}
<root>/storage/staging/{submissions,operations}
<root>/storage/quarantine
<root>/journal/publications
<root>/{backups,compatibility}
```

Directories are mode `0700`; the database is mode `0600`. SQLite foreign keys,
busy timeout, and WAL mode are configured for initialization. The transaction
creates both the compatible current tables and target tables, then writes the
ready metadata singleton and applied schema fingerprint.

`openTargetStorage(root, mode)` refuses missing, incomplete, not-ready, or
incompatible roots. The M5.2a baseline tuple was schema `1`; M5.2c
additively advanced it to schema `2` for the migration exception table. The
current tuple is schema `2`, layout `2`, publication journal `1`, and backup
format `3`.

## 5. Object write protocol

`ObjectStore.store` uses a server-generated opaque object ID and a generated
kind-specific key. It validates kind, MIME type, size, and identifier; creates
an exclusive `0600` temporary file; writes and flushes bytes; links into the
final object directory without overwriting; flushes the directory; and only
then inserts an `available` row in SQLite. A failed database insert leaves no
available database object; an orphaned promoted file is discoverable by audit
and can be handled by a later explicit recovery/GC operation.

The resolver derives the expected key from the database object identity,
rejects path traversal and symlink components, requires a regular file and
matching size, and returns an internal descriptor to trusted backend code.
No storage path is a public identifier.

## 6. Read-only integrity audit

`auditStorage` does not repair, delete, rewrite, or promote anything. It
reports structured findings for:

- missing or incompatible schema/version metadata;
- foreign-key violations;
- invalid generated keys, object kinds, states, sizes, hashes, or MIME-derived
  extensions;
- missing, symlinked, non-regular, tampered, or orphaned object files;
- temporary object leftovers;
- relationship-kind mismatches;
- published artifacts whose objects are not available.

Diagnostic paths are relative to the disposable root. The audit never returns
raw filesystem contents as an API response.

## 7. Failure-injection evidence

The test suite injects failures at:

1. before temporary-file creation;
2. during the write;
3. before promotion;
4. after promotion;
5. before database insert;
6. after database insert.

Every case verifies that no `available` object is exposed. The implementation
keeps the original error category for controlled failures and wraps unexpected
I/O failures in stable storage errors.

## 8. Test coverage

The dedicated M5.2a Vitest file contains 18 tests covering:

- complete schema/layout/version initialization;
- physical metadata non-duplication;
- four media items in one publication operation;
- duplicate expected-object rejection;
- relationship kind validation;
- bounded staging and generated staging paths;
- immutable write/resolve/verify behavior;
- invalid kinds, MIME types, IDs, symlinks, and tampered keys;
- read-only audit findings and no-mutation behavior;
- repository/symlink/non-empty-root protections;
- incompatible and incomplete roots;
- all six fault points above.

The final verification record is below; values are populated only from commands
executed for this implementation.

## 9. Compatibility evidence

The compatible table DDL preserves the current Fastify schema mapping for
users, groups, tokens, settings, scores, runs, and samples. Existing public
identifiers and firmware-facing table semantics are not changed. The target
foundation does not read `index.json`, enumerate the legacy cartridge tree, or
open `PRG32_STORE_DATA`/the Flask database.

The design and schema documents were corrected together:

- `docs/modernization/79-canonical-storage-architecture.md`;
- `docs/modernization/79-storage-schema-specification.md`;
- `docs/modernization/79-storage-migration-plan.md`;
- `docs/modernization/79-storage-compatibility-matrix.md`.

## 10. Security and TypeScript migration invariants

The future Fastify implementation must preserve these invariants independently
of module names or ORM choice:

1. operational roots and disposable test roots are never interchangeable;
2. physical metadata has one authority, `storage_objects`;
3. object IDs and storage keys are server-generated and path-safe;
4. object writes are immutable and never overwrite an existing object;
5. a public relationship resolves only an available, regular, in-root object;
6. relationship `object_kind` is validated in application code and audit;
7. journal item identity is `(operation_id, expected_object_id)`;
8. staging bytes are private and are not public catalog objects;
9. initialization/version mismatch fails closed;
10. integrity audit is read-only and produces bounded, non-secret diagnostics;
11. promotion/recovery remains single-writer and journaled;
12. no route or firmware contract changes are implied by storage refactoring.

## 11. Files modified and created

Created for this milestone:

- `backend/src/storage-v2/` (eight TypeScript modules);
- `backend/tests/storage-v2.test.ts` additions for the isolated target;
- `docs/modernization/80-canonical-storage-m5-2a-implementation.md`.

Updated for this milestone:

- the four M5.2 design documents listed in section 9;
- `docs/modernization/19-revised-migration-roadmap.md` (completion evidence
  and next-gate status).

The worktree also contains earlier authorized modernization changes from prior
milestones. They are not rewritten or discarded by this report.

## 12. Remaining risks and limitations

- No legacy inventory/import, migration manifest executor, or differential API
  parity gate exists in M5.2a.
- Publication journaling has its target schema and object primitives but no
  operational publication workflow.
- Orphan cleanup, quarantine recovery, backup/restore, and crash recovery
  rehearsal remain separately gated.
- MIME sniffing, PRG32 parsing, archive extraction, and submission validation
  are not implemented here.
- The target module is not operationally wired; no production behavior is
  claimed to change.
- Browser/Playwright E2E is intentionally outside this storage milestone.

## 13. Rollback considerations

There is no operational rollback to perform because no operational root or
schema was touched. Disposable roots created by tests are removed by the test
harness. If a future migration uses this initializer, rollback must discard
the target root only after the source single-writer remains authoritative; it
must never restore by deleting or overwriting the Flask source root.

## 14. Verification record

Commands and results from the implementation run:

- `nvm use 24` — Node `24.20.0` selected;
- `pnpm --dir backend run typecheck` — passed;
- `pnpm --dir backend run lint` — passed;
- `pnpm --dir backend run test` — passed: 29 files, 160 tests;
- `pnpm --dir backend run build` — passed;
- `pnpm --dir frontend run typecheck` — passed;
- `pnpm --dir frontend run lint` — passed;
- `pnpm --dir frontend run test` — passed: 20 files, 55 tests;
- `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` —
  passed; Next.js produced the production route bundle;
- `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` — passed;
- `SECRET_KEY='m5-2a-ephemeral' ./.venv313/bin/python -m pytest -q` — passed:
  64 tests;
- `docker compose --profile dev config --quiet` — passed;
- `git diff --check` — passed.

Frontend Vitest emitted an existing Vite config-loader deprecation warning;
it did not fail the check. No command reported a failure.

No check is marked passed in this report until its command has actually
completed successfully.

## 15. M5.2b gate

M5.2b is not part of this implementation. The next authorized step, if
requested separately, is a read-only legacy inventory and secret-free
migration-manifest generator against copied fixtures. It must not import real
data, mutate operational roots, or enable a cutover.

Final M5.2a decision: **GO for the isolated target storage foundation; NO-GO
for migration, operational Fastify writes, route cutover, Flask retirement,
deployment, or production schema changes.**
