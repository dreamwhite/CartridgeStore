# PRG32 Cartridge Store — M5.4.22 Online Backup Coordination

Date: 2026-10-16

## 1. Executive summary

M5.4.22 is **`M5422_ONLINE_BACKUP_VALIDATED`** for disposable targets.

The backup-v4 path now supports an explicit online snapshot mode. It uses the
SQLite Online Backup API while Fastify retains the canonical writer lease. The
database snapshot is then paired with a temporary, read-only filesystem capture
of the files referenced by that snapshot. The archive writer never writes the
canonical root.

The Docker scheduler profile now defaults to online mode and mounts the
canonical source read-only. The scheduler still has no application network,
cannot write the source bind mount, and was not activated against the local
operational root.

Final decisions:

```text
M5422_ONLINE_BACKUP_VALIDATED
M5422_SCHEDULER_READONLY_SOURCE_GO
M5422_BACKUP_V4_COMPATIBLE
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

No live operational backup was created. Fastify, Next.js, Flask, Traefik,
Authentik, Dream networks, public routing, operational SQLite and operational
objects were not modified.

## 2. Root cause

The previous backup-v4 implementation already used `better-sqlite3`'s SQLite
Online Backup API internally, but it also acquired `canonical-writer.lock`
before every encrypted backup. That made the scheduler an application-writer
lease participant and prevented a backup container with a read-only canonical
mount from operating while Fastify was online.

The object inventory was derived from the SQLite snapshot but hashed files
directly from the live filesystem root. A publication cleanup could therefore
remove a staging file between the database snapshot and the archive stream.

M5.4.22 separates these concerns:

- the Fastify writer lease remains owned by Fastify;
- the backup performs a SQLite online snapshot without acquiring that lease;
- referenced and recovery files are captured into a private temporary root;
- the archive is built and independently verified from the captured root.

## 3. Existing storage consistency model

The canonical tuple was verified in code and disposable fixtures:

| Field | Value |
| --- | ---: |
| Schema version | 2 |
| Storage layout version | 2 |
| Publication journal version | 1 |
| Backup format version | 3 |

Fastify opens the canonical database read-write and owns
`canonical-writer.lock` for its process lifetime. Publication promotion writes
immutable objects before making their database references visible. Existing
storage-v2 code does not run a garbage collector or replace an existing object
path; retired object rows and files are retained. This is the current object
consistency invariant used by the online protocol.

The backup source is opened read-only with foreign keys and SQLite busy timeout
enabled. A bounded five-minute progress deadline is applied to the SQLite
backup operation. The source database is never copied through an ordinary
filesystem copy.

## 4. SQLite snapshot implementation

`createCanonicalBackup` calls `Database#backup(snapshotPath)` against a
read-only source connection. The resulting private snapshot is checked for:

- SQLite integrity;
- foreign-key violations;
- required table presence;
- schema fingerprint;
- the storage version tuple;
- ready or recovery-required state as appropriate;
- incomplete publication and migration state.

The SQLite snapshot is a standalone database file and is the only database file
placed in the archive. WAL sidecar copying is not used.

Two snapshot modes are explicit:

- `online`: no `CanonicalWriterLease` is acquired; intended for the scheduler
  while Fastify remains the sole writer;
- `exclusive`: historical mode; requires caller-provided writer quiescence and
  backup-v4 acquires the writer lease.

The CLI accepts `--online` and `--exclusive`; omission remains exclusive for
backward compatibility. The Docker scheduler sets
`PRG32_BACKUP_SNAPSHOT_MODE=online` explicitly.

## 5. Immutable object consistency

After the SQLite snapshot is complete, the implementation derives object and
recoverable-staging keys from that snapshot. Each referenced file is opened and
copied through a bounded chunked descriptor read into a private temporary
capture root. The source descriptor is checked for identity and in-place
mutation. An unlink after opening remains readable through the descriptor; a
replacement or mutation fails closed with `canonical_backup_source_changed`.

The same capture boundary covers:

- `storage/objects` files referenced by `storage_objects`;
- staged and validated submission files;
- publication operation staging;
- publication journal files;
- quarantine evidence;
- compatibility files.

The manifest and archive are generated from this captured root, not from a
second live filesystem read. Unreferenced object files do not become archive
catalog entries. New objects committed after the SQLite snapshot are not
included, which is the expected snapshot boundary.

No object pinning subsystem was added because storage-v2 currently has no
object garbage collector or replacement operation. If a future GC is
introduced, it must either preserve this retention invariant or add an explicit
backup read lease before enabling online backups.

## 6. Writer ownership preservation

The online path never creates, removes, reclaims or modifies
`canonical-writer.lock`. The disposable Docker acceptance observed:

```text
Fastify /ready: writer_lease=held
Scheduler snapshot mode: online
Scheduler backup runs: 2 succeeded
```

The online Vitest case held `CanonicalWriterLease`, opened a separate SQLite
writer, kept a `BEGIN IMMEDIATE` transaction active, and completed an
encrypted backup without a lease conflict. The source writer remained the
application writer; the backup process was read-only with respect to canonical
storage.

Operational authorization is explicit and separate from disposable
authorization. The implementation can support a future operator-approved
online backup, but this milestone did not invoke it against operational data.

## 7. Backup-v4 compatibility

The existing encrypted format remains unchanged:

- ABI: `prg32-cartridge-store-backup-4.0`;
- payload ABI: `prg32-cartridge-store-backup-3.0`;
- payload format: 3;
- AES-256-GCM envelope and external key registry;
- completion marker and authenticated verification;
- fresh-root restore only.

Existing exclusive callers and archives remain compatible. The new mode is a
coordination option, not a format version change. The key registry remains
outside the archive and no key material is logged or embedded.

## 8. CLI and wrapper compatibility

The backend CLI preserves its existing commands and explicit-path contract.
For `backup`, it now accepts:

```text
--online
--exclusive
```

The options are mutually exclusive. The wrapper defaults to `exclusive` when
`PRG32_BACKUP_SNAPSHOT_MODE` is absent, while the scheduler injects `online`.
The wrapper still maintains its destination lock, temporary `.incoming` area,
completion marker, verification marker and structured error output.

The scheduler status and JSON log model was preserved. Logs now include the
selected snapshot mode without including paths, credentials, keys or private
database content.

## 9. Docker mount hardening

The `backup-scheduler` profile in the existing standalone Compose file now
declares:

```text
canonical source: bind read_only=true
backup destination: bind read/write
key registry: Compose secret, read-only
root filesystem: read-only
network: none
capabilities: all dropped
```

The scheduler has no ports and no dependency on Traefik, Authentik, Dream
networks or a database service. Fastify remains the only service with a
read-write canonical bind mount.

The development/production Compose file was not split and no operational
Compose service was changed or restarted.

## 10. Concurrency test evidence

Focused backend storage tests passed:

```text
3 test files
16 tests passed
```

The online-specific case verified:

- active writer lease;
- active SQLite write transaction;
- online backup completion;
- backup-v4 authenticated verification;
- unchanged format and complete payload manifest.

The existing exclusive lease-conflict regression also passed: an exclusive
backup is rejected when a live writer lease exists, while the online mode is
allowed to proceed without taking ownership of that lease.

## 11. Disposable Docker acceptance

The test used a fresh synthetic canonical root, synthetic key registry and
synthetic backup destination. It used Node.js 24 images built from the
repository and the existing standalone Compose file with the
`backup-scheduler` profile.

Observed results:

| Check | Result |
| --- | --- |
| Disposable canonical initialization | PASS |
| Fastify startup and `/ready` | PASS |
| Fastify writer lease retained | PASS |
| Scheduler online mode | PASS |
| Scheduler canonical mount read-only | PASS |
| Scheduler network isolation | PASS — `network_mode: none` |
| First encrypted backup | PASS |
| Second encrypted backup | PASS |
| Independent backup-v4 verification | PASS |
| Archive bytes | `580810` |
| Fresh-root restore | PASS — `completed` |
| Restored SQLite audit | PASS — `ok` |
| Restored foreign-key violations | `0` |
| Canonical source write attempt from scheduler image | PASS — `EROFS` |
| Operational containers restarted | NO |

The final Compose configuration was rendered with synthetic required
environment values. It showed `fastify.read_only=true`, scheduler source
`read_only=true`, scheduler `network_mode=none`, backup destination writable,
and `PRG32_BACKUP_SNAPSHOT_MODE=online`.

This was Docker Desktop on the development machine. It is not claimed as
Linux Docker Engine validation.

## 12. Operational state preservation

The local operational project was inspected only. No scheduler container was
started against its canonical root, no new operational archive was created,
and the Fastify/Next.js containers were not restarted or recreated.

The operational scheduler remains intentionally inactive. Existing encrypted
operational archives were not modified. Off-device custody, external
monitoring approval and post-write rollback policy remain open decisions.

## 13. Validation results

All final checks below were executed with Node.js 24 via `nvm use 24`:

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 56 files, 279 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir cli run typecheck` | PASS |
| `pnpm --dir cli run lint` | PASS |
| `pnpm --dir cli run test` | PASS — 5 files, 9 tests |
| `pnpm --dir cli run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| Scheduler/wrapper Node tests | PASS — 8 tests |
| Backend focused backup tests | PASS — 16 tests |
| Fastify/scheduler Docker image builds | PASS |
| Disposable Docker backup/verify/restore | PASS |
| Compose profile configuration | PASS with synthetic environment |
| `git diff --check` | PASS |

The repository already contains unrelated dirty work from earlier milestones;
those changes were preserved and not reset.

## 14. Files changed

Implementation and tests:

- `backend/src/storage-v2/backup.ts` — online SQLite snapshot and stable
  filesystem capture;
- `backend/src/storage-v2/backup-v4.ts` — online/exclusive coordination and
  operational authorization mapping;
- `backend/src/storage-v2/backup-v4-cli.ts` — explicit snapshot mode flags;
- `backend/tests/storage-v2-backup-v4.test.ts` — concurrent writer/lease test;
- `deploy/operations/backup/prg32-backup.mjs` — wrapper mode propagation;
- `deploy/operations/backup/scheduler.mjs` — mode validation and state/log
  propagation;
- `deploy/operations/backup/scheduler.test.mjs` — scheduler mode regression;
- `deploy/standalone/compose.yaml` — read-only scheduler source and online
  default.

Documentation correction:

- `deploy/standalone/README.md` — backup coordination description.

New report:

- `docs/modernization/150-online-backup-coordination-m5-4-22.md`.

No additional Markdown, JSON or CSV evidence file was created for M5.4.22.

## 15. Remaining risks

1. Online consistency was validated on disposable Docker Desktop, not on the
   designated Linux Docker Engine host.
2. The operational scheduler was not activated, by explicit authorization
   boundary. Operational acceptance still needs a separately approved window.
3. The current safety of object capture depends on storage-v2's present
   immutable/no-GC behavior. Any future garbage collector needs coordination.
4. Off-device archive custody, restore drills, retention deletion policy and
   monitoring approval remain outside this milestone.
5. A post-cutover rollback still requires writer stop, traffic control and
   reconciliation of writes accepted after cutover. Restarting Flask alone is
   not a complete rollback procedure.
6. Public routing and federation were intentionally not retested or changed.

## 16. Final decision

M5.4.22 is **GO for the disposable online backup protocol** and **GO for the
read-only scheduler source mount**. Existing backup-v4 compatibility is
preserved.

It is **NO-GO for operational scheduler activation**, **NO-GO for operational
cutover**, and **NO-GO for Flask retirement**. M5.4.22 is complete within its
authorized scope. The next milestone must separately authorize Linux-host
operational acceptance and custody/monitoring decisions; it must not infer
that authorization from this disposable evidence.
