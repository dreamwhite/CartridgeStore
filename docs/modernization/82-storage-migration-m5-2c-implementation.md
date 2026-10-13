# PRG32 Cartridge Store — M5.2c legacy-to-canonical migration executor

Date: 2026-10-14
Status: disposable migration executor implemented; operational migration NO-GO.

## 1. Executive result

M5.2c now has a working developer-only TypeScript migration pipeline. It reads
an explicitly prepared, read-only M5.2b snapshot and writes only to a new
explicitly authorized storage-v2 disposable root. It is deterministic,
idempotent, resumable after injected interruption, fail-closed on source
mutation or path confusion, and independently verifies the target against the
source manifest and read-only integrity audit.

This is not an operational import. Flask remains the authoritative writer;
no public route, Fastify startup, Next.js rewrite, Docker volume, Traefik,
Authentik, backup, production database, or ../PRG32 state is changed.

## 2. Implemented modules

New isolated modules under backend/src/storage-v2/migration/:

- types.ts — explicit disposable authorization, journal, plan, result and verification contracts;
- planner.ts — stable target IDs for cartridges, releases, artifacts, media, submissions, exceptions and migration operations;
- journal.ts — atomic bounded JSON journal with source fingerprints, checkpoints, recovery state and completion state;
- executor.ts — preflight gate, compatible-table transfer, catalog/release transformation, object/media/site-asset promotion, submission/review and telemetry mapping, publication finalization, safe resume and guarded disposable disposal;
- verification.ts — target integrity audit plus independent differential comparison of logical content and compatible-table fingerprints;
- cli.ts — developer-only migrate, resume, verify, status and explicitly authorized dispose commands;
- index.ts — programmatic exports only.

The migration module is not imported by Fastify startup or any HTTP route.

## 3. Source verification and safety boundary

Before target initialization the executor requires:

1. explicit snapshot configuration;
2. explicit manifest input (manifestPath in the CLI config or an in-memory test manifest);
3. explicit target root;
4. exact disposable authorization token M5.2c-DISPOSABLE-TARGET;
5. supported manifest ABI and target schema/layout tuple;
6. manifest canonical SHA-256 verification;
7. independent M5.2b source verification;
8. inventoryComplete=true, migrationReady=true, zero blocking anomalies, and operationalCutoverReady=false;
9. non-overlapping, non-symlink source and target roots.

The target is not initialized if any preflight gate fails. Production
environment variables are never used as source or target defaults. Targets
inside the repository, source snapshot, filesystem root, or operational root
are refused.

M5.2b now classifies unmappable download telemetry as a non-blocking warning
because M5.2c preserves it explicitly in migration_exceptions; missing or
corrupt public artifacts, unsafe paths, invalid identities and source
integrity failures remain blockers.

## 4. Target schema and visibility protocol

The target schema version is now 2 (layout 2, publication journal 1,
backup format 3). The additive migration_exceptions table retains unmappable
historical records without fabricating artifact relationships:

- exception_id, migration ID, entity kind, legacy ID and reason code are deterministic;
- payload_json contains only non-secret event identity, mapping status and timestamp data;
- IP hashes, user agents, password hashes and token hashes are never written to the manifest, report, journal, CLI output or diagnostics.

The initializer writes a .prg32-storage-v2 marker in the disposable root.
The target retains the schema/layout/version checks and the portable bind
mount structure from M5.2a.

Visibility is deliberately staged:

1. compatible rows and cartridge/release rows are created in target-only draft/staged state;
2. artifact, media and site-asset bytes are copied through the existing immutable object service;
3. all object hashes, sizes, MIME types and relationships are verified;
4. submissions remain private in generated staging paths;
5. one SQLite transaction changes all migrated releases to published, all artifacts to published, commits operation items, and records completion;
6. read-only integrity and differential verification must pass before the journal becomes completed.

Filesystem promotion and SQLite publication are not claimed to be one atomic
transaction. A crash before finalization leaves a resumable journal and no
published migrated release.

## 5. Database transformation

The executor copies common columns explicitly, in foreign-key order, for:

users, groups, user_groups, api_tokens, registration_tokens, store_settings,
scores, runs, and samples.

Existing compatible IDs, timestamps, password hashes, token hashes, role/group
relationships and firmware score/metrics values are preserved in memory and
written only to the disposable target. No authentication is enabled against
these migrated records.

Catalog data maps as follows:

- legacy game IDs remain cartridge_id values;
- each legacy game@version receives a stable internal release ID;
- each valid legacy architecture receives one stable artifact relationship;
- legacy public ordering is represented by deterministic publication ordering based on the available legacy publication/update timestamp and identity;
- missing historical revision evidence is not expanded into fabricated revisions.

## 6. Immutable artifacts and media

ObjectStore.storeFile was added as a bounded streaming promotion primitive.
It hashes with a 64 KiB buffer, writes an exclusive temporary file, flushes,
links without overwrite, inserts the storage_objects row, and verifies the
source identity again after promotion. Existing deterministic object IDs are
reused only when kind, MIME, hash, size, state and physical bytes all match.

Embedded ICON and SCRN blocks are parsed from the already verified PRG32
artifact, bounded to the existing parser limit and promoted as media objects.
Architecture and media kind remain explicit. Configured site assets are copied
as generated site_asset objects with deterministic logical keys; their
storage paths are never derived from arbitrary legacy filenames.

## 7. Submissions and reviews

Legacy integer submission IDs are preserved in both submission_id and
legacy_submission_id. Supported states map to the target lifecycle without
auto-approval or auto-publication of pending work. Pending and historical
staging bytes are copied to generated private keys under
storage/staging/submissions/<id>/artifacts/; original names are metadata only.

Validated architecture rows preserve hash, size, architecture and metadata.
Approved, rejected and cancelled records receive a deterministic review
decision using only the legacy reviewer evidence. No reviewer identity or
timestamp is invented when the source does not provide one.

## 8. Telemetry and exceptions

Exactly mapped download events preserve legacy event ID, cartridge/version,
architecture, user reference, timestamp, compatible IP hash/user-agent fields
and an explicit unknown delivery outcome because the legacy source has no
delivery outcome field. Unmapped and ambiguous events are not attached to a
guessed artifact; they are retained in migration_exceptions and excluded
from public artifact aggregates.

The independent verifier checks both mapped events and exception count. It
also fingerprints compatible score, run and sample tables without emitting
their values or sensitive fields.

## 9. Journal, idempotency and recovery

Each target contains:
journal/migrations/<migration_id>.json

The journal records only the manifest/source fingerprint, target version,
phase, completed logical IDs, checkpoints, stable error codes, recovery state
and completion state. It never stores credentials, hashes from auth records,
IP hashes, user agents or raw exception messages.

Each phase is independently checkpointed: compatible tables, artifacts, media
and site assets, submissions, telemetry, finalization and verification. A
rerun verifies and reuses deterministic target rows and objects. It never
silently overwrites a conflicting object or relationship. A completed rerun
returns alreadyCompleted=true after a fresh differential verification.

Deterministic fault injection is available through the programmatic faultAt
setting for initialization, compatible transfer, artifact/media/submission/
telemetry checkpoints, finalization and verification. Failures persist
recovery_required plus a resumable stable error code.

## 10. Rollback

The source snapshot is never modified. Recovery is preferred. An incomplete
target may be disposed only through the explicit developer-only dispose
command, exact authorization token, target safety checks and storage-v2 marker
validation. Completed targets are refused by the disposal guard. No arbitrary
directory deletion or source deletion is implemented.

## 11. Independent verification and fixtures

verifyMigratedTarget runs auditStorage and compares:

- cartridge/release/artifact/media/site-asset counts and logical mappings;
- artifact/media/site-asset hash and size metadata;
- architecture and publication state/order;
- submission IDs, states and staged artifact hashes;
- mapped downloads and explicit exception count;
- users, groups, tokens, settings, scores, runs and samples through safe in-memory fingerprints.

backend/tests/storage-v2-migration.test.ts uses only synthetic disposable
snapshots and covers:

- complete cartridge/release/artifact/media migration;
- compatible user data, pending submission and telemetry;
- secret-free exception reporting;
- idempotent completed rerun;
- interrupted artifact checkpoint and resume;
- unmappable telemetry preservation;
- authorization and changed-source preflight failure.

## 12. CLI usage

From the backend directory with Node 24:

    pnpm storage:migrate -- --config /tmp/prg32-migration-config.json --output /tmp/migration-result.json
    pnpm storage:resume -- --config /tmp/prg32-migration-config.json
    pnpm storage:verify -- --config /tmp/prg32-migration-config.json
    pnpm storage:status -- --target /tmp/prg32-target --migration migration_<manifest-prefix>
    pnpm storage:dispose -- --target /tmp/prg32-target --migration migration_<manifest-prefix> --authorization M5.2c-DISPOSABLE-TARGET

The configuration must contain snapshot, manifestPath, targetRoot, and
authorization; it has no production defaults. CLI output is structured and
secret-free. Exit code 0 means success; exit code 2 means a stable safety,
verification or migration failure.

## 13. Verification record

Executed with Node 24 selected by nvm use 24:

- pnpm --dir backend run typecheck — passed;
- pnpm --dir backend run lint — passed;
- pnpm --dir backend run test — passed: 32 files, 171 tests;
- pnpm --dir backend run build — passed;
- pnpm --dir frontend run typecheck — passed;
- pnpm --dir frontend run lint — passed;
- pnpm --dir frontend run test — passed: 20 files, 55 tests;
- FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build — passed;
- SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m py_compile app.py cartridge_store/*.py — passed;
- SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q — passed: 64 tests;
- docker compose --profile dev config --quiet — passed;
- git diff --check — passed.

The disposable migration test executed M5.2b inventory and independent
manifest verification, M5.2c migration, target integrity audit, independent
differential verification, completed rerun, interrupted artifact resume,
unmappable telemetry exception preservation and the CLI status command. The
dedicated migration fixture passed: 4 tests. The existing M5.2b fixture passed:
6 tests. Frontend Vitest emitted only the existing Vite config-loader warning;
it did not fail the check. No command reported a failure.

## 14. Remaining limitations and M5.2d prerequisites

- Snapshot preparation still requires writer quiescence and an operator-created consistent SQLite/WAL copy.
- Historical catalog data does not prove revisions beyond the available index.json evidence; no synthetic revision history is created.
- The target migration does not expose a public API, downloads, publishing routes, authentication, WebSockets or mDNS.
- M5.2d still requires a separately authorized read-only API/download differential gate, firmware compatibility checks, and operational one-writer decision.
- Backup/restore rehearsal remains M5.2e and is not started here.

M5.2c decision: GO for disposable migration execution and verification;
NO-GO for operational migration, Fastify cutover, Flask retirement, public
storage-v2 routes, deployment, or M5.2d.

## M5.2d follow-up regression evidence

This historical M5.2c result is not rewritten. During the separately
authorized M5.2d gate, the same migration executor was exercised against a
new populated synthetic source and nine deterministic interruption points:
initialization, compatible-table transfer, artifact/media/submission/
telemetry checkpoints, finalization, and verification. All nine interrupted
targets resumed and passed independent verification. A completed target with
one corrupted immutable artifact was detected and refused by the read-only
projection. Source fingerprints remained unchanged.

The M5.2d report records the new evidence and keeps operational migration,
backup/restore, live telemetry writes and Flask retirement out of scope.
