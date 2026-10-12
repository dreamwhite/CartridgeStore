# M2.1 — Data and Serialization Compatibility Gate

Date: 2026-10-12
Status: **complete for the approved read-only scope**

## Outcome

The TypeScript/Fastify foundation can interpret the current Flask SQLite
schema, representative records, Werkzeug password hashes, API tokens, and
the cartridge index/filesystem model without opening a write path. The gate
used a disposable Flask-created database and synthetic fixture data only.

No migration was generated or applied. No production database, cartridge
directory, credentials, or external service was accessed. Flask remains the
only writer and the owner of every public API and WebSocket route.

## Schema compatibility matrix

`tests/compatibility/generate_python_oracle.py` initializes Flask's schema in
a temporary directory, clears only bootstrap defaults in that temporary
database, inserts the explicit synthetic fixture, and records SQLite
introspection output. TypeScript compares that snapshot with an equivalent
temporary database using `inspectSchema` and `compareSchemaSnapshots`.

| Area | Result | Evidence |
| --- | --- | --- |
| Tables | Verified | All 11 current tables are present: users, api_tokens, groups, user_groups, registration_tokens, store_settings, runs, samples, scores, download_events, cartridge_submissions. |
| Columns and affinity | Verified | Names, SQLite types, primary-key positions, nullability, and defaults compare with no differences. |
| Autoincrement | Verified | AUTOINCREMENT is preserved for Flask's integer identity tables; TEXT and composite primary keys remain non-autoincrement. |
| Unique constraints | Verified | SQLite-generated unique indexes and the samples `(run_id, frame)` constraint match. |
| Foreign keys | Verified | Referenced table/column, `ON DELETE`, `ON UPDATE`, and match behavior match, including CASCADE, SET NULL, and the nullable runs user reference. |
| Named indexes | Verified | Named index columns, uniqueness, and order match, including `scores_game_score_idx` as `game ASC, score DESC, created_at ASC`. |
| Defaults and timestamps | Verified | Text `datetime('now')` and integer Unix-second `strftime('%s', 'now')` defaults match; `runs.created_at` and `samples.created_at` are non-null. |
| JSON storage | Verified | Metadata and architecture JSON remain required SQLite TEXT columns; no JSON column or schema rewrite is introduced. |
| Schema evolution | Preserved | The target opens an existing file read-only and performs no migration. The current Flask-added `runs.user_id` column is included. |

The comparison is exact for the sanitized fixture: zero schema differences.
Missing tables/columns are classified critical, type/nullability and
index/FK changes high, and default/primary-key metadata changes medium.

## Serialization compatibility

The fixture covers users, Unicode roles/groups, API and registration tokens,
settings including an empty value, runs, metric samples, scores, downloads,
cartridge submissions, catalog metadata, optional colophon, architecture
names, and a binary hash.

Verified behavior:

- SQLite rows preserve integer values, nullable values, empty strings, Unicode,
  and timestamp representations without coercion.
- `projectSqliteRow` preserves existing values and represents a requested field
  absent from a row as `null`; it does not silently omit contract keys.
- Stored JSON decodes to the same object/array values as Python. Recursive key
  sorting and compact encoding reproduce the fixture's Python-compatible JSON
  strings, while array order remains unchanged.
- `Principal.as_dict()` compatibility preserves `id`, `name`, `username`,
  `email`, `role`, `groups`, and `authenticated`.
- The catalog projection preserves the index ABI, game/version IDs,
  `esp32c6`, Unicode metadata, optional `colophon: null`, binary filename,
  size, and SHA-256 hash.

No serialization difference was observed in the representative fixture. This
does not assert that every historical row is valid: malformed JSON, unknown
legacy fields, and undocumented timestamp values remain future fixture inputs.

## Password-hash compatibility

The read-only verifier in `backend/src/auth/password.ts` recognizes the
Werkzeug formats observed in the installed application:

- `scrypt:N:r:p$salt$digest`, including the current `scrypt:32768:8:1`;
- `pbkdf2:sha256[:iterations]$salt$digest`;
- `pbkdf2:sha1[:iterations]$salt$digest`.

Synthetic valid and invalid cases were measured with Werkzeug and verified in
TypeScript. Node's scrypt/PBKDF2 primitives and constant-time digest
comparison are used. The implementation never writes hashes, resets
passwords, or logs plaintext. Unknown/malformed methods return explicit
`unsupported` status; the synthetic `md5` case is not accepted. Excessive
PBKDF2 iteration counts are also explicitly unsupported.

This is a verifier only. It does not define a new hashing policy and does not
implement login, session, or password-management endpoints.

## API-token compatibility

`hashApiToken` produces the existing lowercase SHA-256 hex digest. The lookup
utility joins `api_tokens` to `users`, returns owner identity, role, label,
timestamps, and alphabetically ordered group names, and returns `null` for a
missing token. Synthetic API and registration token hashes match the Python
oracle.

The lookup is intentionally read-only: it does not update Flask's
`api_tokens.last_used`. The current data model has no separate revoked flag;
revocation is represented by token-row removal/absence, which remains a future
mutation-domain concern. Legacy configured-user array/object parsing is
covered without creating token records.

## Cartridge filesystem compatibility

`inventoryCartridgeStore` reads `index.json` and referenced files without
creating directories, rewriting the index, publishing, deleting, or opening
SQLite. The synthetic inventory verifies:

- `prg32-cartridge-store-index-1.0`;
- stable game/version/architecture identifiers, including `esp32c6`;
- relative file resolution beneath the data root;
- existence, byte size, and SHA-256 comparison;
- optional/missing metadata represented as reported by the index;
- deterministic version and variant ordering;
- unsafe `../` filenames rejected before file reads.

The utility inventories the public index/filesystem boundary; it does not yet
parse every PRG32 binary trailer or implement HTTP catalog/download routes.
Those are intentionally deferred to M3.

## Read-only and isolation evidence

- `openReadonlyDatabase` requires an existing regular file and uses SQLite
  read-only mode with `fileMustExist`.
- Tests prove a missing database is not created and direct DDL/INSERT attempts
  fail.
- Python oracle generation and TypeScript compatibility tests use temporary
  databases/directories only.
- Cartridge inventory tests snapshot directory entries before/after and verify
  no mutation.
- No public Fastify route, authentication endpoint, publishing path, metrics
  ingestion path, WebSocket path, or migration runner was added.
- Existing Compose/Traefik and Next.js proxy routing were not changed by M2.1.

## Exact verification results

All Node/pnpm commands used Node `v24.20.0` after `nvm use 24`.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` in `backend/` | PASS — pnpm 12.5.1 lockfile verified |
| `pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm run test` in `backend/` | PASS — 4 files, 14 tests |
| `pnpm run build` in `backend/` | PASS |
| `SECRET_KEY=m2-1-test .venv313/bin/pytest -q` | PASS — 63 passed |
| `npm run typecheck` in `frontend/` | PASS |
| `npm run lint` in `frontend/` | PASS |
| `npm run test` in `frontend/` | PASS — 2 files, 5 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 npm run build` in `frontend/` | PASS — Next.js production build |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `git diff --check` | PASS |

The frontend test runner emits the existing Vite warning about future native
config loading; it is non-fatal.

## Files added or modified for M2.1

Added:

- `backend/src/compatibility/schema.ts`;
- `backend/src/compatibility/serialization.ts`;
- `backend/src/compatibility/cartridge-inventory.ts`;
- `backend/src/auth/password.ts` and `backend/src/auth/tokens.ts`;
- `backend/tests/compatibility.test.ts`;
- `backend/tests/fixtures/compatibility-input.json`;
- `backend/tests/fixtures/python-schema-snapshot.json`;
- `backend/tests/fixtures/python-compatibility-oracle.json`;
- `tests/compatibility/generate_python_oracle.py`;
- this report.

Updated for compatibility corrections:

- `backend/src/db/schema.ts` — required integer timestamp defaults and score
  index ordering;
- `backend/src/db/schema-inspection.ts` — index order, foreign-key, SQL, and
  autoincrement introspection;
- `backend/tests/readonly.test.ts` — exact representative indexes and
  timestamp nullability;
- `docs/modernization/19-revised-migration-roadmap.md`.

The repository contains earlier M0/M1/M2 changes from preceding milestones;
this list identifies M2.1 additions and corrections, not unrelated work.

## Unresolved incompatibilities and risks

1. The verifier deliberately rejects unsupported Werkzeug methods instead of
   guessing. A production inventory of historical hashes is required before
   M4 authentication migration.
2. The TypeScript layer has no write ownership, transaction behavior, or Flask
   session-cookie compatibility. Those remain M4/M5 concerns.
3. The fixture covers documented/current schema behavior, not arbitrary
   undocumented legacy rows or corrupted files.
4. Catalog inventory does not replace PRG32 format validation and does not
   provide catalog HTTP parity; M3 must add golden binary/HTTP fixtures.
5. SQLite driver behavior was verified on the Node 24 environment used here;
   production-like backup copies and filesystem permissions still need an
   operational rehearsal.

None is a blocker for the M2.1 read-only gate. These are explicit entry
conditions for later domains and must not be hidden by unevidenced fallbacks.

## Recommended M3 entry criteria

Begin M3 only after the team accepts this report and has:

- retained the generated synthetic oracle and added newly discovered
  historical hash/index fixtures without production secrets;
- selected a copied SQLite/database snapshot for a read-only shadow run;
- prepared catalog/discovery/binary golden responses, including missing,
  malformed, optional-asset, architecture-selection, path-safety, and
  content-disposition cases;
- confirmed Traefik/Next.js routing remains Flask-owned during comparison;
- defined the comparison sampling and rollback procedure.

M2.1 stops here. It does not start M3, implement public catalog endpoints, or
change Flask ownership.
