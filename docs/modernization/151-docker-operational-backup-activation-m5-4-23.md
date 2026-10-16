# PRG32 Cartridge Store — M5.4.23 Docker Operational Backup Activation

Date: 2026-10-16
Execution mode: bounded local operational activation
Decision: `M5423_OPERATIONAL_ONLINE_BACKUP_VERIFIED`, `M5423_OPERATIONAL_RESTORE_VERIFIED`, `M5423_DOCKER_SCHEDULER_ACTIVE`

## 1. Executive summary

M5.4.23 completed the authorized local activation against the existing
`prg32-local-operational` Compose project.

- Fastify and Next.js were not restarted, recreated, or rebuilt.
- Fastify remained healthy and retained the canonical writer lease.
- Exactly one new encrypted online backup was created.
- The backup was independently verified and restored into a fresh disposable
  target.
- The optional Docker scheduler is running and healthy with a 24-hour cadence.
- Existing archives were preserved and retention deletion was not enabled.
- No public routing, shared Dream infrastructure, Flask service, or canonical
  application data was modified.

The result is a successful local backup activation, not an operational
cutover approval.

## 2. Authorization boundary

The actions performed were limited to the authorization in M5.4.23:

- one controlled online backup from the canonical root;
- verification of that archive;
- restore into a new `/tmp` disposable root;
- activation of the optional `backup-scheduler` service;
- read-only continuity and health checks;
- removal of the disposable restore target and one incorrectly named,
  disposable scheduler container created during the first Compose invocation.

The initial scheduler invocation omitted the explicit project-name flag and
created `prg32-standalone-backup-scheduler-1`. It was not connected to the
application project, had `RUN_ON_START=false`, performed no backup, and was
removed immediately. The final activation used
`-p prg32-local-operational` and targeted only `backup-scheduler` with
`--no-deps --no-recreate`.

No operational application container was stopped or recreated. No existing
backup was deleted or overwritten.

## 3. Pre-activation operational inventory

The verified Compose project was `prg32-local-operational`. Its effective
configuration used these files and overlays:

- `deploy/standalone/compose.yaml`
- `deploy/standalone/compose.direct.yaml`
- `deploy/integrations/dream/compose.local-persistent.yaml`
- `.local/operational/runtime/m549-federation.compose.yaml`
- `/tmp/prg32-m5411-runtime.override.yaml`

Before activation:

| Component | Container/image | Image ID | State |
|---|---|---|---|
| Fastify | `prg32-local-operational-fastify-1` / `prg32-cartridge-store-fastify:standalone` | `sha256:ddb1881e49431c88b5afc960c742f5210aeb81fc8f8a183378367b070e3efbcb` | healthy, started 2026-10-15 14:43:29Z |
| Next.js | `prg32-local-operational-next-1` / `prg32-cartridge-store-next:standalone` | `sha256:7bb4fa63580cb7cdf96a24ea8967946eef73ea95244eb96f33a6b915c95ea745` | healthy, started 2026-10-15 14:43:35Z |

The canonical root was `.local/operational/data/canonical`, containing the
storage-v2 marker, SQLite database, WAL files, object storage, staging and
journal material. The backup destination was
`.local/operational/backups`, outside the canonical root. The key registry was
`.local/operational/secrets/key-registry.json` and was mounted read-only.

The writer lock was present before activation. Fastify `/ready` reported:
`database=available`, `canonical_storage=available`, and
`writer_lease=held`. Six existing `.backup4` archives were inventoried before
the operation; all six remained byte-for-byte unchanged afterwards.

No scheduler container existed in the operational project before activation.

## 4. Safety gate results

All pre-activation gates passed:

| Gate | Result | Evidence |
|---|---|---|
| Fastify healthy | PASS | `GET /health` returned 200 |
| Next.js healthy | PASS | Docker healthcheck healthy |
| Fastify writer ownership | PASS | `GET /ready` reported `writer_lease=held` |
| Online snapshot mode | PASS | effective scheduler config was `online` |
| Canonical source read-only | PASS | scheduler mount `/data/canonical`, `rw=false` |
| Backup destination writable | PASS | backup completed and markers were promoted |
| Destination outside source | PASS | host paths are separate roots; scheduler validates this |
| Key registry read-only | PASS | `/run/secrets/prg32-backup-key-registry`, `rw=false` |
| No competing scheduler | PASS | no pre-existing scheduler container/job |
| No overwrite | PASS | generated unique archive name; prior hashes unchanged |
| Retention disabled | PASS | no retention command or deletion authorization used |
| Application recreation required | NO | targeted scheduler only |
| Public/shared infrastructure change | NO | no Traefik, Authentik, DNS, or routing action |

## 5. Scheduler image and Compose configuration

The running application image was not rebuilt. Because the previous
operational Fastify image could predate the online-backup implementation, a
temporary compatible base image was built under
`prg32-cartridge-store-fastify:m5423-base`, followed by the dedicated
`prg32-cartridge-store-backup-scheduler:m5423` image. The final scheduler
image contains the current backend distribution and scheduler wrapper.

The scheduler was started with the existing Compose definition and the
following effective safety properties:

- `network_mode: none`;
- no published ports;
- non-root user `node`;
- read-only root filesystem;
- `cap_drop: ALL`;
- `no-new-privileges:true`;
- canonical source read-only;
- key registry read-only;
- backup destination read-write;
- no Docker socket;
- `PRG32_BACKUP_SNAPSHOT_MODE=online`;
- `PRG32_BACKUP_INTERVAL_MS=86400000`;
- `PRG32_BACKUP_RUN_ON_START=false`;
- restart policy `unless-stopped`.

The operator authorization was supplied explicitly when activating the
service; secret-bearing values were not written to this report.

## 6. First live online backup

The controlled one-shot execution ran exactly once through the scheduler
image. Its structured events were `started`, `backup_started`, and
`backup_succeeded`. No automatic retry was performed.

New archive:

```text
prg32-20261016T103538Z-4df9f6d9-a7bc-4c89-af94-7fdf2351e186.backup4
```

Observed archive properties:

- size: 644,251 bytes;
- file mode: `0600`;
- archive SHA-256: `7af8927a98d521a8398848b1b623b0faf252b61c0b4c77f0af85e4f6a30ccbce`;
- completion marker: present;
- verification marker: present;
- encrypted backup-v4 key identifier: recorded by the verifier, with no key
  material exposed;
- backup count changed from 6 to 7.

The six pre-existing archive hashes were compared before and after creation
and did not change. The online backup did not acquire or remove the
canonical writer lock. Fastify remained ready throughout the operation.

## 7. Archive integrity and verification

Independent backup-v4 verification succeeded:

```json
{"verification_state":"complete","archive_bytes":644251}
```

The verifier recomputed the archive SHA-256, authenticated the encrypted
envelope using the configured key registry, validated the completion marker,
and accepted the payload manifest. No plaintext backup archive or key
material was created outside the intended disposable restore target.

## 8. Fresh-target restore

The archive was restored through the existing encrypted backup-v4 restore path
into a new disposable directory under `/tmp`. The restore returned
`state=completed` and the target was never attached to a running service.

The restored target checks returned:

- SQLite `integrity_check`: `ok`;
- foreign-key violations: `0`;
- canonical storage audit: `ok`;
- canonical audit findings: `0`;
- storage tuple: schema `2`, layout `2`, publication journal `1`, backup
  format `3`;
- restored compatible counts: 1 cartridge, 1 release, 1 artifact, 1
  submission, 1 score, 1 run, 2 samples;
- required schema tables and storage layout were present;
- no `.backup4` archive or backup marker was present inside the restored
  target.

The disposable restore target was removed after the checks. The operational
archive and its completion/verification markers were retained.

## 9. Scheduler activation

The final scheduler container is:

```text
prg32-local-operational-backup-scheduler-1
```

It is running with image
`prg32-cartridge-store-backup-scheduler:m5423`, image ID
`sha256:a70153c4c69b17679c8dbfb2ac5df4ccbf210e544fb1596375a6ad328720542b`,
and Docker health status `healthy`.

Private scheduler state records:

- status: `idle`;
- active: `false`;
- interval: 86,400,000 ms;
- last successful execution: `2026-10-16T10:35:38.463Z`;
- next scheduled execution: `2026-10-17T10:36:42.383Z`.

The next scheduled execution has not occurred yet. The scheduler is active,
but this report does not claim a future run.

## 10. Application continuity

Fastify and Next.js container identities were unchanged after activation:

- Fastify ID remained `938bbf2646840620cf2368be7a7633ab2d81356501825ea0120627bb5c1dca07`;
- Next.js ID remained `e91eec3fa093760abdf9d468ddd7fcfc97bad4e5d4011fd0ea54e458ab5b992d`.

Both remained healthy with their original start times. Read-only checks
returned:

- Fastify `/health`: HTTP 200;
- Fastify `/ready`: HTTP 200, database and canonical storage available,
  writer lease held;
- `GET /api/games`: HTTP 200, one catalog entry;
- detail for the existing catalog entry: HTTP 200;
- binary download for the existing catalog entry: HTTP 200, 593 bytes;
- Next.js `/api/games` proxy: HTTP 200.

No destructive application write was used for continuity verification.

## 11. Backup status and observability

The private wrapper status command was extended minimally to read the private
scheduler state file. It now reports:

- archive count: 7;
- latest archive: the new M5.4.23 archive;
- latest verification: `verified`, marker present;
- current backup age at final inspection: approximately 195 seconds;
- scheduler configured: `true`;
- scheduler running: `true`;
- scheduler status: `idle`;
- last success and next scheduled timestamps;
- retention dry-run with zero candidates;
- external custody: not verified.

This is private CLI/status behavior only. No public HTTP status endpoint was
added and no secret-bearing values are emitted.

## 12. Retention safety

No retention command was run. The wrapper status dry-run reported no deletion
candidates, and all seven local archives remain present. Automatic retention
deletion is not enabled by the scheduler. Existing backup files were not
overwritten.

## 13. Failure handling

The first live backup succeeded, so the no-retry rule did not require a live
diagnostic retry. The only activation issue was the missing explicit Compose
project flag in the first scheduler start. That container had not run a
backup, was removed as a disposable resource, and the final activation was
performed with the verified operational project name.

The application containers were not restarted during this correction. The
new verified archive was preserved throughout.

## 14. Monitoring status

Monitoring evidence available locally:

- Docker healthcheck: scheduler healthy;
- structured scheduler log: startup observed; one-shot backup success was
  observed before persistent activation;
- private scheduler state: idle, last success recorded, next execution
  recorded;
- wrapper status: latest archive verified and retention dry-run empty.

No Gatus configuration, alert recipient, or external notification was
changed. Therefore the decision remains
`EXTERNAL_MONITORING_APPROVAL_REQUIRED`. External/off-device custody also
remains `OFF_DEVICE_RECOVERY_NOT_VERIFIED`.

## 15. Rollback policy status

No routing or writer ownership cutover was performed. The existing rollback
model remains in force:

- before routing changes, Flask remains authoritative;
- after routing changes but before canonical writes, controlled rollback may
  be possible;
- after canonical writes, reconciliation and forward-fix are preferred over
  an unverified reverse migration.

This milestone did not approve a post-write rollback policy. The decision
remains `POST_WRITE_ROLLBACK_DECISION_REQUIRED`.

## 16. Validation results

Commands and observed results:

| Check | Result |
|---|---|
| `node --test deploy/operations/backup/prg32-backup.test.mjs deploy/operations/backup/scheduler.test.mjs` | PASS, 8/8 |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS, 56 files / 279 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS, 22 files / 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `./.venv313/bin/python -m pytest -q` | 1 environment failure, 63 passed / 1 failed |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS, 64/64 |
| effective Compose `config --quiet` | PASS |
| independent encrypted backup-v4 verification | PASS |
| fresh-target restore and SQLite/storage audit | PASS |
| application container continuity checks | PASS |
| `git diff --check` | PASS |

The unqualified Python command failed only because the repository’s existing
mDNS test intentionally creates the app with `TESTING=False` and the current
Flask startup contract requires `SECRET_KEY` in that mode. The application
was not changed to hide this requirement. Re-running with the repository’s
test-only secret passed all 64 tests.

The Docker validation was performed with Docker Desktop’s local Docker
Engine. This report does not claim validation on a separate Linux host.

## 17. Files changed

Changes attributable to M5.4.23:

- `deploy/operations/backup/prg32-backup.mjs`: minimal private scheduler
  state integration in `status`;
- `deploy/operations/backup/scheduler.mjs`: preserve last successful run
  metadata when the persistent scheduler process starts;
- `docs/modernization/151-docker-operational-backup-activation-m5-4-23.md`:
  this report.

The repository already contained unrelated dirty changes from earlier
milestones. They were preserved and not reset, cleaned, committed, or pushed.
No Compose file, application source, database schema, routing, or deployment
configuration was modified in this milestone.

## 18. Remaining risks

- The scheduled future run has not yet been observed:
  `SCHEDULED_EXECUTION_NOT_YET_OBSERVED`.
- Backups remain on the same local storage domain; off-device recovery is not
  verified.
- External monitoring and alerting are not approved or configured.
- The scheduler’s private state is an operational observability record; Docker
  health remains the authoritative liveness check.
- The explicit backup authorization is required when the scheduler container
  is recreated from Compose; it is not exposed in this report.
- Linux-host behavior, filesystem permissions, and restart behavior still
  require validation on the designated Linux operational host.
- This does not validate public routing, Traefik, Authentik, Flask retirement,
  or a production cutover.

## 19. Final decision

M5.4.23 local activation is **GO** for the bounded objective:

- `M5423_OPERATIONAL_ONLINE_BACKUP_VERIFIED`
- `M5423_OPERATIONAL_RESTORE_VERIFIED`
- `M5423_DOCKER_SCHEDULER_ACTIVE`

The following decisions remain open or negative:

- `SCHEDULED_EXECUTION_NOT_YET_OBSERVED`
- `OFF_DEVICE_RECOVERY_NOT_VERIFIED`
- `EXTERNAL_MONITORING_APPROVAL_REQUIRED`
- `POST_WRITE_ROLLBACK_DECISION_REQUIRED`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

M5.4.23 is complete within its authorized scope. No operational cutover,
Flask retirement, deployment, commit, or push was performed.
