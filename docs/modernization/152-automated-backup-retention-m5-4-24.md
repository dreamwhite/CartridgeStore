# PRG32 Cartridge Store — M5.4.24 Automated Backup Retention

Date: 2026-10-16
Execution mode: bounded implementation, disposable deletion acceptance and controlled local scheduler configuration

## 1. Executive summary

M5.4.24 implemented automatic local retention around the existing backup-v4
workflow and enabled it only for the Docker `backup-scheduler` container in
the local operational project.

- The existing 7/4/3 calendar policy was reused.
- Retention runs only after a successful backup and independent verification.
- Candidate archives are validated for safe names, regular files, marker
  integrity, byte counts, SHA-256, ownership and transfer evidence.
- The existing `.prg32-backup.lock` coordinates create, verify, restore,
  transfer-marker and retention operations.
- Disposable tests exercised actual deletion: 18 encrypted archives became 9
  retained and 9 deleted.
- The operational dry-run found 7 archives, 0 candidates and 0 anomalies.
- Automatic retention is configured for future scheduled runs, but no future
  operational cleanup has executed yet.
- Fastify and Next.js were not restarted or recreated; no operational archive
  was deleted.

## 2. Operator retention decision

The approved decisions were applied:

- automatic local retention: enabled;
- policy: 7 daily, 4 weekly, 3 monthly generations;
- storage: local filesystem backup destination;
- off-device copies: administrator-managed;
- Gatus: intentionally excluded;
- no additional monitoring service, host cron, systemd, launchd or Docker
  socket was added.

The persistent local operational environment now contains
`PRG32_BACKUP_RETENTION_ENABLED=true`. The Compose default remains
conservative (`false`) for installations that have not explicitly enabled
and accepted retention.

Final decisions are:

- `M5424_RETENTION_ENGINE_VALIDATED`
- `M5424_OPERATIONAL_RETENTION_DRYRUN_GO`
- `M5424_AUTOMATIC_RETENTION_ENABLED`
- `AUTOMATIC_RETENTION_EXECUTION_NOT_YET_OBSERVED`
- `OFF_DEVICE_RECOVERY_NOT_VERIFIED`
- `EXTERNAL_GATUS_MONITORING_SKIPPED`
- `POST_WRITE_ROLLBACK_DECISION_REQUIRED`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 3. Existing retention implementation

The existing wrapper selection algorithm was retained and hardened rather
than replaced. `selectRetention` sorts newest first and protects:

1. the newest independently verified archive;
2. the newest verified archive explicitly;
3. all incomplete, unverified or untransferred archives;
4. the newest archive in each selected daily bucket;
5. the newest archive in each selected ISO-week bucket;
6. the newest archive in each selected monthly bucket.

Deletion is restricted to archives that are complete, wrapper-verified and
explicitly marked as transferred by an administrator. This preserves the
existing conservative off-device-custody contract. Historical operational
archives that have a valid backup-v4 completion marker but no wrapper
verification marker remain protected and are not treated as safe deletion
candidates.

The wrapper now provides a shared asynchronous `performRetention` operation
for dry-run and apply modes. It validates the complete inventory before any
deletion and reports structured counts, candidates and anomalies.

## 4. Calendar policy

The policy is evaluated in UTC, matching the active scheduler configuration.

- Daily buckets use the UTC calendar date (`YYYY-MM-DD`).
- Weekly buckets use ISO weeks, Monday-based (`YYYY-Www`).
- Monthly buckets use UTC year and month (`YYYY-MM`).
- Records are selected newest-first within each bucket.
- Empty buckets contribute no archive.
- Missed scheduled backups simply produce no record for the missing bucket;
  no synthetic generation is created.
- Multiple calendar protections may point to the same physical archive, so
  7/4/3 does not imply 14 physical files.
- Same-day generations keep the newest one for the daily bucket.
- An archive remains protected if it is incomplete, lacks wrapper
  verification, lacks administrative transfer evidence, or is otherwise
  unsafe.

The operational dry-run was evaluated with 7/4/3 and returned all seven
archives protected and no deletion candidates.

## 5. Execution order

The scheduler workflow is now:

1. create an online or configured backup-v4 archive;
2. let the wrapper independently verify it before promotion;
3. require completion and verification markers;
4. record the newly verified archive as required retained state;
5. evaluate the retention inventory;
6. validate every candidate, including current SHA-256 and all markers;
7. apply deletion only after all safety gates pass;
8. record backup and retention outcomes in private scheduler state and JSON
   logs;
9. mark the scheduled workflow successful only when both backup and enabled
   retention succeed.

If creation or verification fails, retention is not invoked. A disposable
Docker failure with `EROFS` proved that the scheduler records backup failure
and leaves the archive set untouched.

## 6. Deletion safety

The apply path fails closed for:

- malformed or unsafe archive names;
- path traversal or a path outside the approved destination;
- symlink or non-regular archive entries;
- malformed completion, verification or transfer markers;
- unsupported backup-v4 ABI metadata;
- byte-count or SHA-256 mismatch;
- duplicate backup identifiers;
- missing completion, verification or transfer evidence;
- an inconsistent inventory;
- an active destination lock;
- an attempt to delete the required newly created archive;
- an attempt to remove the only independently verified recoverable archive.

Unknown files, directories, scheduler state, `.incoming`, lock files and
unrelated sidecars are never deletion candidates. Deletion uses `unlinkSync`
only after all candidate files and sidecars have been rechecked as regular
files inside the destination. The engine does not follow symlinks.

Retention does not delete canonical SQLite files, immutable objects, key
registries or anything outside the backup destination.

## 7. Concurrency protection

Retention reuses `.prg32-backup.lock`, the lock already used by the backup
wrapper. Backup creation, retention, wrapper verification, wrapper restore
and transfer-marker creation now all coordinate through this same lock.

The unit tests cover an active lock and verify that retention fails with
`backup_lock_busy`. Candidate validation is performed after the lock is held,
and all candidates are validated before the first delete. A process
interruption during the delete loop can leave an already deleted candidate
absent and remaining candidates present; the operation reports failure and
never claims complete success. The archive and marker set is designed to be
re-evaluated safely on the next run.

Direct consumers of the lower-level backup-v4 library should continue to
coordinate with the same destination lock when restoring or verifying an
archive. The scheduler and operational wrapper paths now enforce that
coordination.

## 8. Test matrix

Focused tests passed 13/13:

- calendar selection and overlapping daily/weekly/monthly buckets;
- duplicate same-day generation handling;
- unverified and untransferred preservation;
- actual archive and marker deletion after checksum validation;
- malformed marker fail-closed behavior;
- unknown-file preservation;
- symlink preservation and rejection;
- active-lock rejection;
- required-new-archive protection;
- duplicate backup identifier rejection;
- unsafe archive-name rejection;
- strict retention configuration parsing;
- existing scheduler interval, timezone, snapshot and state health rules.

The disposable deletion test used real encrypted backup-v4 archives and
actual filesystem deletion, not only dry-run output.

## 9. Disposable Docker acceptance

A disposable canonical root, key registry and backup destination were created
with synthetic data only. Eighteen encrypted backup-v4 archives were created
with valid completion, verification and administrative transfer markers.

The current scheduler image ran the retention command in an isolated Docker
container with no network, read-only root filesystem, dropped capabilities,
read-only key registry and writable backup destination:

- before: 18 archives;
- retained: 9 archives;
- deleted: 9 archives;
- anomalies: 0;
- unknown operator file: preserved;
- every retained archive: independently verified;
- fresh-target restore: completed.

A separate disposable scheduler workflow with a synthetic writable canonical
fixture completed `backup_succeeded` followed by `retention_succeeded`, with
one newly created archive retained and zero deletion candidates.

An attempted disposable online run with a read-only canonical bind on Docker
Desktop returned `backup_v4_creation_failed` after the scheduler started; it
did not invoke retention, delete any archive or leave an accepted target. A
separate exclusive read-only attempt returned `EROFS` as expected. This is a
Docker Desktop disposable filesystem limitation, not an operational
reconfiguration: the local operational source remains online/read-only as
validated by M5.4.23. The disposable workflow success used a writable
synthetic source only to exercise scheduler orchestration; the operational
Compose scheduler retains the required read-only canonical mount.

All disposable roots and containers were removed after acceptance.

## 10. Operational dry-run

The operational destination was evaluated without `--apply` and without
triggering a backup. Results:

- archive count: 7;
- latest verified archive: the M5.4.23 archive;
- retained set: all 7 existing archives;
- deletion candidates: 0;
- anomalies: 0;
- retention policy: 7/4/3;
- existing archive SHA-256 values: unchanged;
- canonical root: not modified;
- scheduler before configuration activation: healthy and idle.

The six historical archives with only backup-v4 completion evidence were
preserved. Their missing wrapper verification markers do not block the dry
run because they are never classified as deletion candidates.

No operational archive was deleted during M5.4.24.

## 11. Scheduler configuration activation

The optional scheduler was rebuilt under the distinct temporary image tag
`prg32-cartridge-store-backup-scheduler:m5424` and only the scheduler service
was recreated using:

```text
docker compose -p prg32-local-operational ... --profile backup-scheduler \
  up -d --no-deps --force-recreate backup-scheduler
```

Fastify and Next.js were not targeted. The active scheduler configuration is:

- retention enabled: `true`;
- snapshot mode: `online`;
- interval: 86,400,000 ms (24 hours);
- run on start: `false`;
- network: `none`;
- published ports: none;
- root filesystem: read-only;
- user: `node`;
- canonical mount: read-only;
- key registry mount: read-only;
- backup destination: read-write only;
- healthcheck: healthy.

The private state records the next scheduled backup. Retention has not run
operationally since activation because `RUN_ON_START=false` and no extra live
backup was authorized.

## 12. Application continuity

Fastify and Next.js identities and start times remained unchanged:

- Fastify: `938bbf2646840620cf2368be7a7633ab2d81356501825ea0120627bb5c1dca07`;
- Next.js: `e91eec3fa093760abdf9d468ddd7fcfc97bad4e5d4011fd0ea54e458ab5b992d`.

Post-activation checks passed:

- Fastify `/health`: HTTP 200;
- Fastify `/ready`: HTTP 200, database available, canonical storage
  available, writer lease held;
- Next.js `/health`: HTTP 200;
- Fastify catalog read: HTTP 200;
- Next.js `/api/games` proxy: HTTP 200.

No application write, routing change, canonical mutation or public
infrastructure change was performed.

## 13. Observability

The private status command now reports:

- `retention_enabled`;
- last retention evaluation timestamp;
- last retention success timestamp;
- last retention failure code;
- retained and deleted counts;
- latest verified backup;
- scheduler status and next execution;
- retention dry-run candidates and anomalies.

The active scheduler state is `idle`, healthy and retention-enabled. Its
retention evaluation and success fields are null because no future scheduled
backup has run. Structured logs emit `retention_succeeded` or
`retention_failed` after the backup result. No public endpoint, Gatus
integration, alert recipient or secret-bearing status output was added.

## 14. Failure and rollback behavior

If backup creation or independent verification fails, retention is skipped.
If retention fails, the scheduler records a failure and does not mark the
scheduled workflow successful. Existing archives and canonical data remain
untouched.

To roll back this configuration, disable
`PRG32_BACKUP_RETENTION_ENABLED`, recreate only `backup-scheduler` with
`--no-deps`, and preserve the remaining archives. This milestone does not
restore deleted archives or perform reverse migration. Fastify, Next.js,
Flask, routing and canonical data are outside the retention rollback path.

## 15. Validation results

| Check | Result |
|---|---|
| `node --test deploy/operations/backup/prg32-backup.test.mjs deploy/operations/backup/scheduler.test.mjs` | PASS, 13/13 |
| `pnpm --dir backend exec vitest run tests/storage-v2-backup-v4.test.ts` | PASS, 1 file / 6 tests |
| disposable Docker retention with 18 encrypted archives | PASS, 9 deleted / 9 retained |
| disposable retained archive verification | PASS |
| disposable fresh-target restore | PASS |
| disposable scheduler backup+retention workflow | PASS with synthetic writable source |
| operational retention dry-run | PASS, 7 archives / 0 candidates / 0 anomalies |
| effective Compose config | PASS |
| scheduler health | PASS |
| Fastify/Next continuity | PASS |
| `git diff --check` | PASS |

The read-only Docker Desktop fixture limitation is recorded in section 9;
it did not affect the operational container or destination.

## 16. Files changed

Changes attributable to M5.4.24:

- `deploy/operations/backup/prg32-backup.mjs` — fail-closed retention,
  marker/hash validation, safe deletion, inventory anomalies and shared lock
  coordination;
- `deploy/operations/backup/scheduler.mjs` — retention configuration,
  post-backup retention workflow and private retention state/log fields;
- `deploy/operations/backup/prg32-backup.test.mjs` — actual deletion and
  adversarial retention tests;
- `deploy/operations/backup/scheduler.test.mjs` — retention configuration
  tests;
- `deploy/standalone/compose.yaml` — retention setting in the scheduler
  service;
- `.local/operational/secrets/standalone.env` — explicit local retention
  enablement;
- `docs/modernization/152-automated-backup-retention-m5-4-24.md` — this
  report.

No application container, database schema, public route, Dream infrastructure,
Gatus configuration or Flask service was modified. No commit or push was
performed.

## 17. Remaining risks

- The first future scheduled operational retention has not yet occurred:
  `AUTOMATIC_RETENTION_EXECUTION_NOT_YET_OBSERVED`.
- Operational historical archives without wrapper verification markers remain
  protected indefinitely until an administrator performs a separately
  authorized verification/transfer workflow.
- Local archives and off-device custody are still separate operator
  responsibilities; off-device recovery remains unverified.
- Docker Desktop's read-only bind behavior did not reproduce the successful
  operational online fixture inside a new disposable root; Linux-host
  validation remains required before relying on the scheduler outside this
  local environment.
- Retention deletion is not a transactional filesystem operation across all
  sidecars. An interruption after individual unlink operations requires
  re-evaluation and recovery from the remaining verified archive set.
- External alerting is intentionally not configured.

## 18. Final decision

M5.4.24 is **GO** for the bounded retention objective:

- `M5424_RETENTION_ENGINE_VALIDATED`
- `M5424_OPERATIONAL_RETENTION_DRYRUN_GO`
- `M5424_AUTOMATIC_RETENTION_ENABLED`

The following remain explicitly unresolved or negative:

- `AUTOMATIC_RETENTION_EXECUTION_NOT_YET_OBSERVED`
- `OFF_DEVICE_RECOVERY_NOT_VERIFIED`
- `EXTERNAL_GATUS_MONITORING_SKIPPED`
- `POST_WRITE_ROLLBACK_DECISION_REQUIRED`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

M5.4.24 is complete within scope. No operational archive was deleted, no
extra live backup was triggered, and no application or public infrastructure
cutover was performed.
