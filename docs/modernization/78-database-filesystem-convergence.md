# M5 database and filesystem convergence assessment

Date: 2026-10-14
Status: preparation only; no operational data was changed.

## Current authority

Flask remains the only operational writer. Its idempotent startup DDL and
small `ALTER TABLE` helpers are the effective migration authority for the
legacy SQLite schema. There is no central legacy migration-version table.
Fastify's Drizzle definitions are a serialization/type mapping and its
federation migration helper applies only isolated federation objects; Drizzle
is not an authority for the existing operational database.

The canonical legacy tables are:

`users`, `groups`, `user_groups`, `api_tokens`, `registration_tokens`,
`store_settings`, `scores`, `runs`, `samples`, `download_events`, and
`cartridge_submissions`. Foreign keys, unique constraints and indexes are
captured in `backend/tests/fixtures/python-schema-snapshot.json`.

The shadow snapshot also contains disposable fixture-only artifacts. Those
must not be treated as production schema or copied into an operational
database.

## Storage ownership

| Resource | Flask today | Fastify today | Safe M5 conclusion |
| --- | --- | --- | --- |
| Legacy SQLite tables | read/write | read-only shadow; isolated test writer | Flask owns them. |
| Federation tables | not present in legacy contract by default | isolated auth-writer database | Keep isolated until a deliberate schema/data migration. |
| `index.json` | authoritative catalog index | isolated read/write publication implementation | Flask owns public index. |
| `cartridges/<game>/<version>/<architecture>.prg32` | public binary files | isolated writer store | Flask owns public binaries. |
| `pending/<submission_id>` | Flask submission staging | isolated Fastify staging | Never share pending roots during dual operation. |
| `assets/` and custom assets | Flask | isolated admin asset route | Flask owns public assets. |
| backups and recovery journals | Flask legacy archive | isolated v2/archive/journal implementation | One explicitly selected owner only. |
| multiplayer state | Flask process memory | Fastify process memory | One WebSocket owner at a time. |

Flask `GameStore` uses `PRG32_STORE_DATA`, an ABI-tagged `index.json`, atomic
temporary index replacement, and the public cartridge tree. Its review path
compensates database and files on ordinary errors, but it has no durable
cross-process publication journal. Fastify's publication and review journals
are stronger for crash recovery, but currently operate below disposable roots
and do not establish compatibility with the legacy public index.

## SQLite and crash semantics

Both runtimes use SQLite transactions, and publication/restore paths use
explicit locking or backup/integrity checks. This does not make two writers
safe: separate connection libraries, schema bootstrapping, filesystem index
replacement, journal state and telemetry can still diverge. WAL/journal files
are part of SQLite's live filesystem behavior and must remain beside the
database during backup and handover; copying only the main `.sqlite` file is
not a safe live migration.

No WAL checkpoint, backup, migration, restore, or write test was run against
the operational Flask data in this milestone. All runtime inspection used
read-only or disposable roots.

## Convergence options

### Option A — shared database and filesystem with dual writers

Rejected. It creates races around `index.json`, publication journals, download
telemetry, pending directories, transaction boundaries and recovery. SQLite's
locking cannot make two different publication implementations one atomic
operation.

### Option B — continuous dual-write or CDC bridge

Rejected for the current service. It would require conflict resolution,
replay ordering, ownership of firmware writes, failure handling and a stable
source of truth for files as well as rows. It also materially expands scope.

### Option C — one-time schema and filesystem migration to a new Fastify model

Possible later, but not recommended as the first handover. It would combine
route cutover, session continuity, schema migration, index conversion and
publication recovery in one event.

### Option D — Fastify adopts the legacy schema and paths, then single-writer handover

Recommended. First make Fastify a read-only observer of the exact legacy
schema/filesystem, compare responses and side effects, then stop Flask, take a
verified backup, run a controlled Fastify handover, and keep Flask stopped for
the resources Fastify owns. Rollback means restore the backup and return the
route owner to Flask; it must not mean starting both writers.

### Option E — keep Flask as permanent operational owner

Safe short-term fallback. Next.js can continue using same-origin Flask
rewrites while Fastify remains an isolated replacement under test. This is the
current state and is acceptable until all handover gates are green.

## Recommended convergence sequence

1. Freeze the legacy schema contract and record a read-only fingerprint.
2. Add Fastify adapters for the legacy tables and exact filesystem layout;
   do not introduce a competing migration authority.
3. Run disposable shadow comparisons for catalog, stats, scores, metrics,
   publication, backup inventory and authorization.
4. Prove backup/restore, integrity, foreign keys and index consistency on a
   copy. Do not test restore against `data/` or a live store.
5. Choose one first route group (recommended: read-only statistics) and
   switch only that route at the edge after response-diff evidence.
6. For the first write group, stop Flask ownership, make a verified backup,
   run Fastify against the adopted legacy paths, and verify immediately.
7. Keep a documented rollback window. Restore the backup only while both
   application writers are stopped.

## M5 evidence and remaining gaps

The dev Compose stack proves the current isolation boundary: Flask uses
`.local/flask/data`, while Fastify writer state uses `.local/writer/`; the
shadow database is mounted read-only. The route and source inventory confirms
that no operational handover has happened.

Still required before any write handover:

- exact schema/index/foreign-key parity without fixture-only tables;
- legacy index and asset compatibility in Fastify;
- download-event parity in the Fastify catalog path;
- publication/review journal reconciliation with the legacy pending/index
  behavior;
- auth/session transition policy;
- backup and restore rehearsal on a disposable copy;
- mDNS single-advertiser ownership and firmware regression;
- route-specific canary, rollback and operator runbook.
