# PRG32 Cartridge Store — M5.2b legacy inventory implementation

Date: 2026-10-14
Status: isolated read-only inventory and manifest generator implemented;
operational migration **NO-GO**.

This report covers the M5.2b legacy-storage inventory gate requested after
M5.2a. The roadmap contains an earlier historical M5.2b entry for publication
review parity; that work is not reused as evidence for this legacy-inventory
gate. No M5.2c executor was started.

## 1. Executive result

Implemented a genuinely executable TypeScript toolchain that reads an
explicitly prepared disposable legacy snapshot and produces:

- a deterministic, canonical, secret-free JSON migration manifest;
- a human-readable validation report;
- an independent verifier that rereads the snapshot and detects source
  mutation, hash/size changes, count changes, path changes, and manifest hash
  changes;
- structured anomaly and migration-readiness decisions;
- a developer-only CLI, not a server route or Docker service.

The generator never writes the source snapshot, never initializes
`storage-v2`, never copies an artifact, and never changes Flask, Fastify,
Next.js, Docker, Traefik, Authentik, or `../PRG32`.

## 2. Target SQL corrections and executable contract

The implementation confirmed from `backend/src/storage-v2/schema.ts` and the
relationship service that `site_asset` is a valid publication item kind. The
documented `item_kind` check now includes `site_asset`, and its role check
remains explicit (`target_role = 'site_asset'`, empty architecture).

The documented `submissions` DDL trailing comma after
`legacy_submission_id INTEGER UNIQUE` was removed. The documented submissions
foreign key to `cartridges` was also aligned with the executable target schema.

`backend/src/storage-v2/schema-contract.ts` extracts the SQL fenced blocks from
the target schema document, executes them in a disposable in-memory SQLite
database, and compares them against `TARGET_SCHEMA_SQL` using SQLite
introspection. The comparison covers table names, columns/types/defaults/PKs,
foreign keys, unique/index structures, and normalized table/check SQL. It does
not compare whitespace.

The regression is in
`backend/tests/storage-v2-schema-contract.test.ts`; a documentation drift or
syntax error fails the test.

## 3. Legacy source model

The inspected Flask source model is:

- `index.json` with ABI `prg32-cartridge-store-index-1.0` and nested
  `games -> versions -> architectures` entries;
- cartridge files resolved below the configured data root, normally
  `cartridges/<game>/<version>/<architecture>.prg32`;
- embedded PRG32 `META`, `ICON`, `SCRN`, `COLO`, and optional signature blocks;
- SQLite `cartridge_submissions` rows with JSON architecture references and
  `pending/<submission_id>/` staging files;
- SQLite `download_events` rows keyed by legacy game/version/architecture;
- compatible account, settings, score, run, and sample tables;
- optional custom/site asset files in an explicitly configured directory.

The tool treats `index.json` as migration input only. It never treats it as
the future catalog authority.

## 4. Implemented modules

Under `backend/src/storage-v2/legacy/`:

- `types.ts` — bounded limits, snapshot/config types, manifest types,
  anomalies, readiness and verification contracts;
- `filesystem.ts` — explicit path resolution, symlink/traversal rejection,
  deterministic walking, streaming SHA-256, bounded JSON, canonicalization,
  safe atomic output;
- `database.ts` — readonly SQLite adapter, marker validation, schema/column
  checks, schema/database fingerprints, row counts and foreign-key checks;
- `inventory.ts` — catalog, artifact, embedded media, submission, telemetry,
  orphan and anomaly inventory plus human report generation;
- `manifest.ts` — canonical manifest hashing and independent verification;
- `cli.ts` — developer-only `inventory`, `verify`, and `report` commands;
- `index.ts` — programmatic exports only.

`backend/src/storage-v2/schema-contract.ts` and its test provide the target
documentation/executable-schema gate. None of these modules is imported by
Fastify startup or a public route.

## 5. Snapshot input model and preparation

The API requires an explicit configuration object; it has no environment or
operational-root fallback:

```json
{
  "root": "/tmp/prg32-legacy-snapshot",
  "databasePath": "cartridge_store.sqlite",
  "catalogPath": "index.json",
  "dataRoot": ".",
  "cartridgeRoot": "cartridges",
  "preparedMarkerPath": ".snapshot.json",
  "submissionRoot": "pending",
  "mediaRoot": "custom"
}
```

The marker must be a bounded JSON object with:

```json
{
  "abi": "prg32-legacy-snapshot-1.0",
  "state": "ready",
  "database": "cartridge_store.sqlite",
  "catalog": "index.json",
  "dataRoot": ".",
  "cartridgeRoot": "cartridges"
}
```

All component paths are relative to the snapshot root and must resolve inside
it. Required database, catalog, marker, data, and cartridge components must be
real regular files/directories. Optional submission/media directories may be
absent and are treated as empty. A snapshot with database `-wal`/`-shm`
sidecars fingerprints those components too; a future preparation procedure
must copy a consistent SQLite snapshot including required sidecars.

## 6. Read-only guarantees

The database opens with `better-sqlite3` read-only and `fileMustExist`; the
connection is put in query-only mode. The adapter never creates a fallback
database and never changes journal mode, runs migrations, runs `VACUUM`, runs
`REINDEX`, or updates metadata.

Filesystem scanning uses `lstat`, deterministic directory ordering, bounded
streaming reads and SHA-256. It never copies, renames, rewrites, extracts,
chmods, deletes, or timestamps legacy files. Output paths are rejected when
they are inside the snapshot root.

## 7. Manifest format and canonicalization

The manifest contains:

- `manifestAbi` and `manifestVersion`;
- source schema, database, catalog and storage-inventory fingerprints plus
  relative configured paths;
- target schema/layout versions;
- safe table counts and foreign-key diagnostics;
- cartridges, releases, artifact references, actual sizes/hashes and mapping
  statuses;
- embedded media descriptors with source artifact identity, MIME, size and
  hash;
- submissions with public integer IDs, lifecycle mapping, internal owner/
  reviewer IDs, staging references and artifact hashes;
- telemetry events without raw IP hashes or user-agent values;
- all scanned source files and unreferenced files;
- sorted anomalies and readiness gates;
- `manifestSha256`, computed over the canonical payload with that field
  excluded.

Canonicalization recursively sorts object keys, preserves explicitly sorted
logical arrays, uses JSON's stable integer representation, emits compact UTF-8
JSON, and appends one newline only to the file representation. No absolute
host path, timestamp generated by the scanner, random ID, PID, or temporary
directory name enters the manifest.

## 8. Fingerprinting and independent verification

Source fingerprints are:

- schema fingerprint: sorted `sqlite_master` schema rows;
- database fingerprint: SHA-256 descriptors of the main SQLite file and any
  `-wal`/`-shm` sidecars;
- catalog fingerprint: bounded raw `index.json` bytes;
- storage fingerprint: sorted relative file reference, size and SHA-256
  descriptors for all configured artifact, submission, and site-asset files.

`verifyLegacyManifest` independently opens the source, recalculates the
database/catalog fingerprints, recalculates catalog and database counts,
rehashes every manifest artifact, walks and hashes configured source trees,
compares the complete source-file inventory, and checks the canonical manifest
hash. It does not call the inventory generator as its source of truth.

## 9. Artifact and media discovery

For each catalog variant the tool preserves the public game ID, version and
architecture, validates the legacy filename as a relative path below the
configured cartridge root, rejects traversal/symlink/non-regular files,
streams actual size and SHA-256, and compares declared hash/size when present.

Existing binaries are parsed in memory only after a 128 MiB bound. Embedded
`ICON` and `SCRN` blocks become media inventory entries; the bytes are not
extracted to the source snapshot. MIME signatures are checked for PNG/JPEG.
Embedded metadata identity and runtime architecture are compared to the
catalog identity. Colophon is preserved as bounded JSON. Missing or invalid
referenced artifacts are blockers; orphaned files are retained as evidence
and classified as warnings.

## 10. Submission inventory

`cartridge_submissions` is read in ascending public integer ID order. The
tool preserves submission ID, game/version, lifecycle state, integer owner and
reviewer references, timestamps, bounded metadata, pending directory and
architecture staging references. Supported mappings include pending to
`pending_review`, verified/approved to `approved`, rejected to `rejected`,
cancelled to `cancelled`, and published to `published`.

Staging paths must resolve below the configured submission root. Missing
staging files, unsupported states/architectures, invalid JSON, unsafe paths and
orphaned user references are blockers. Password hashes, token hashes, user
names/emails, cookies, signing keys, and raw account rows are never emitted.

## 11. Telemetry inventory

Download events are ordered by ID and retain only event ID, game/version/
architecture, stable user ID, timestamp, and mapping result. Raw IP hashes and
user agents are intentionally excluded. Exact catalog identity maps to one
artifact; zero matches become `unmapped` warnings and multiple matches become
`ambiguous` warnings because M5.2c preserves both cases as explicit migration
exceptions. No event is attached to a guessed artifact.

Scores, runs, samples, settings, groups, users, tokens and registrations are
represented by table existence, safe schema/count/fingerprint information only.
Free-text firmware game identifiers are not reinterpreted as canonical
cartridge foreign keys.

## 12. Anomaly taxonomy and readiness gates

Stable anomaly codes include missing referenced artifacts, unreferenced files,
invalid paths, symlink escapes, invalid architectures, duplicate identities,
ambiguous mappings, size/hash mismatches, malformed catalog/metadata,
missing staging files, invalid submission states, orphaned submission
references, unmappable downloads, schema incompatibility, inconsistent
snapshots, foreign-key violations, resource-limit failures, and excluded
sensitive fields.

Severity semantics:

- `INFO`: evidence only; does not block mapping;
- `WARNING`: retained or unsupported data needing review but not necessarily
  blocking the entire snapshot;
- `BLOCKER`: a public artifact, identity, relationship, source integrity,
  secret boundary, or schema invariant cannot be established.

`INVENTORY_COMPLETE` is true when all explicitly configured components were
scanned and all findings were recorded, even if blockers exist.
`MIGRATION_READY` is true only when there are no blockers, all fingerprints and
references are valid, and mapping is deterministic. `OPERATIONAL_CUTOVER_READY`
is always false in M5.2b.

## 13. CLI usage and exit codes

From the backend directory with Node 24:

```bash
pnpm legacy:inventory -- --config /tmp/snapshot-config.json \
  --output /tmp/migration-manifest.json \
  --report /tmp/migration-report.md

pnpm legacy:verify -- --config /tmp/snapshot-config.json \
  --manifest /tmp/migration-manifest.json \
  --output /tmp/verification.json

pnpm legacy:report -- --config /tmp/snapshot-config.json \
  --output /tmp/migration-report-again.md
```

Exit code `0` means the requested operation completed and readiness was
non-blocking. Exit code `2` means invalid configuration, verification failure,
or recorded blocking anomalies. The CLI never starts a server, performs a
migration, writes into the source, or creates a Docker service.

## 14. Security and resource safeguards

Implemented limits and safeguards include bounded catalog/marker/manifest/JSON
sizes, maximum JSON depth and node count, maximum parsed cartridge size,
bounded diagnostic count, streaming 64 KiB hashing, safe relative paths,
symlink rejection, regular-file checks, no source extraction, no target object
IDs, output-root separation, and secret-key exclusion. Unsupported or
oversized migration-critical data fails explicitly rather than being silently
truncated.

## 15. Disposable fixtures and verification

`backend/tests/legacy-inventory.test.ts` creates isolated synthetic snapshots
covering:

- empty-capable complete schema and a multi-architecture cartridge;
- embedded icon and screenshot media;
- pending and rejected submissions with public IDs;
- download telemetry and exact mapping;
- orphaned files;
- missing artifacts;
- traversal/invalid paths;
- symlink entries;
- unsupported schema;
- source mutation after inventory and independent verification failure;
- deterministic repeated output, secret exclusion, read-only writes, and all
  three CLI commands.

No operational database, data directory, backup, or `../PRG32` artifact is
used by these tests.

## 16. Known limitations

- Snapshot preparation and writer quiescence are specified but not automated;
  no live process interaction is attempted.
- The inventory does not create a target database or migration journal.
- PRG32 parsing is bounded in memory; larger historical binaries require a
  separately approved streaming parser.
- Media not embedded in PRG32 or present in explicitly configured site-asset
  roots is reported as unavailable/unsupported, not invented.
- Unknown public fields are preserved only in bounded compatibility objects;
  sensitive-looking keys are excluded and block migration.
- The source model cannot prove historical publication revisions beyond what
  `index.json` and the SQLite rows expose; those ambiguities remain blockers.

## 17. M5.2c prerequisites

M5.2c may begin only after a separate authorization and a manifest with
`MIGRATION_READY = true`. It still needs a target-root initializer, explicit
source backup/WAL consistency procedure, idempotent database transformation,
immutable object copy/promotion, media mapping, submission/review mapping,
download exception handling, checkpoints, recovery, rollback and differential
verification. M5.2b does not perform any of those writes.

## 18. Verification record

Executed with Node.js `24.20.0` selected through `nvm use 24`:

- backend typecheck — passed;
- backend lint — passed;
- backend Vitest — passed: 31 files, 167 tests;
- backend production build — passed;
- frontend typecheck — passed;
- frontend lint — passed;
- frontend Vitest — passed: 20 files, 55 tests;
- frontend production build with `FLASK_PROXY_TARGET=http://flask:5080` —
  passed;
- Python 3.13 compile and pytest — passed: 64 tests;
- `docker compose --profile dev config --quiet` — passed;
- `git diff --check` — passed.

Frontend Vitest emitted the existing Vite config-loader deprecation warning;
it did not fail the check. The new inventory CLI was executed against the
synthetic snapshot for `inventory`, `verify`, and `report`; all completed
successfully. The independent verifier returned `ok: true` for the unchanged
fixture and failed after an artifact-tree mutation as expected. The schema
contract test executed the documented SQL and found no differences.

## 19. Decision

M5.2b legacy inventory: **GO for isolated read-only inventory and deterministic
manifest generation** when run against an explicitly prepared disposable
snapshot. **NO-GO for M5.2c, operational migration, Fastify cutover, Flask
retirement, production data, deployment, or runtime routing changes.**
