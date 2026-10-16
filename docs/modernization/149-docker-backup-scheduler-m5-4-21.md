# PRG32 Cartridge Store — M5.4.21 Docker-Native Backup Scheduler

Date: 2026-10-16

## 1. Executive summary

The Docker-native scheduler was implemented and validated against disposable
Docker data. It uses the existing encrypted backup-v4 engine and the existing
backup wrapper; it does not add a second backup implementation, a queue, a
database or a cloud integration.

Disposable acceptance passed for encrypted creation, authenticated
verification, completion and verification markers, repeated backups,
overlapping executions and restore into a Docker bind-mounted target.

The scheduler was **not activated in the local operational Compose project**.
The running Fastify container currently owns the canonical writer lease, and
this milestone does not authorize stopping or quiescing Fastify. Creating the
first live operational backup without that coordination would violate the
single-writer contract.

Final state:

```text
M5421_DOCKER_SCHEDULER_VALIDATED
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OPERATIONAL_BACKUP_NOT_CREATED
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Operator architecture decision

The host-level systemd/launchd approach from M5.4.19 and M5.4.20 is
superseded for application deployment. The application scheduler is now an
optional Docker Compose service:

1. Fastify application;
2. Next.js application;
3. optional `backup-scheduler` support service.

The scheduler is enabled by the `backup-scheduler` Compose profile. It is not
part of the default development, test or fresh-install startup. It has no
public port and no dependency on host Node.js, systemd, launchd or cron.

Dream networks, Traefik, Authentik, Mailpit, public routing and Flask were not
modified.

## 3. Docker scheduler architecture

The implementation consists of:

- `deploy/operations/backup/scheduler.mjs` — bounded long-running scheduler,
  JSON execution state and graceful shutdown;
- `deploy/operations/backup/prg32-backup.mjs` — existing wrapper, reused as
  the sole backup entry point with the minimal idempotent-directory fix;
- `deploy/operations/backup/Dockerfile.scheduler` — thin image extension of
  the existing Fastify runtime image;
- the optional `backup-scheduler` service in
  `deploy/standalone/compose.yaml`.

The image uses the existing Node.js 24 Bookworm-slim Fastify runtime as its
base. It adds only the scheduler and wrapper files, runs as the existing
unprivileged `node` user, has a read-only root filesystem, a bounded `/tmp`
tmpfs, `no-new-privileges`, all Linux capabilities dropped and
`network_mode: none`.

It does not mount the Docker socket, expose a port, publish an HTTP endpoint,
connect to Dream networks or require another infrastructure service.

## 4. Compose integration

The service is defined in the standalone Compose contract with:

```text
profiles: [backup-scheduler]
image: prg32-cartridge-store-backup-scheduler:standalone
network_mode: none
restart: unless-stopped
```

The base standalone configuration remains a two-application-service
deployment unless the profile is explicitly enabled. The Dream overlays do
not attach the scheduler to `dream_edge` or `dream_mail`, so enabling the
profile does not change shared Dream infrastructure.

The profile accepts operator-provided values for the backup destination,
authorization, interval and timezone. The key registry reuses the existing
Compose secret source and is mounted read-only into the scheduler.

The scheduler image is intentionally built as an extension of the Fastify
runtime image. A fresh deployment must build the Fastify image first, or set
`PRG32_FASTIFY_IMAGE` to an already-built compatible Node 24 image. No host
Node.js installation is required.

## 5. Storage and mount safety

The scheduler mounts:

| Mount | Mode | Purpose |
| --- | --- | --- |
| canonical source root at `/data/canonical` | RW bind | existing writer-lease protocol plus read-only backup inspection |
| backup destination at `/data/backups` | RW bind | encrypted archives, completion/verification markers and private scheduler state |
| key registry at `/run/secrets/prg32-backup-key-registry` | read-only secret | backup-v4 key resolution |
| `/tmp` | private bounded tmpfs | backup-v4 temporary payload/encryption work |

The canonical bind is deliberately not marked read-only because the existing
`CanonicalWriterLease` creates and removes `canonical-writer.lock` inside the
canonical root. The backup-v4 engine opens the SQLite database in read-only
mode and verifies immutable objects from the SQLite-derived inventory; it does
not use the mount to write application rows or published objects.

This is a known least-privilege limitation of the current writer-lock design.
The scheduler must not be described as read-only at the filesystem mount
boundary. A future improvement could move the shared lease to an explicitly
coordinated lock mount, but that would require a separate backend writer
protocol change and is outside M5.4.21.

The backup destination is required to be outside the canonical source root.
The scheduler validates this before starting and the existing backup-v4
engine enforces the same boundary.

## 6. SQLite/WAL consistency

The scheduler does not copy `store.sqlite`, `-wal` or `-shm` files directly.
It invokes the existing backup-v4 implementation, which:

1. requires explicit operational backup authorization;
2. requires writer quiescence through the canonical writer lease;
3. creates the canonical payload through the existing SQLite/storage-v2
   backup code;
4. validates SQLite integrity, foreign keys, schema and storage versions;
5. inventories referenced immutable objects from SQLite;
6. encrypts the payload with AES-256-GCM and the external key registry;
7. verifies the authenticated result before publication.

The existing backup-v4 `rename()` of a temporary SQLite snapshot was not
portable across Docker tmpfs and bind mounts. A minimal restore-only fallback
was added: use rename when possible, and on `EXDEV` copy the verified snapshot
to the fresh target and remove the temporary source. The restore state journal
still prevents a partially restored target from being reported ready.

## 7. Writer coordination

The active local operational Fastify process owns
`.local/operational/data/canonical/canonical-writer.lock` with PID `1` in its
container namespace. The running Fastify and Next.js health checks passed, but
the writer lease means a backup cannot safely acquire the same lease while
Fastify remains active.

No quiescence endpoint or maintenance-window authorization was available in
this milestone. Therefore:

- the scheduler was not started against the operational Compose project;
- no live operational backup was attempted;
- no application container was restarted or recreated;
- no writer lock was removed or altered.

This is a deliberate fail-closed result, not a scheduler failure.

## 8. Backup security

The scheduler reuses the existing wrapper safeguards:

- encrypted backup-v4 archive;
- authenticated verification before final promotion;
- SHA-256 evidence;
- completion and verification markers;
- destination lock against concurrent jobs;
- no overwrite of completed archives;
- incomplete output cleanup/quarantine;
- external key registry, never embedded in the archive;
- no secrets in scheduler logs;
- no public key-registry route.

The wrapper was also fixed to make the `.incoming` directory creation
idempotent. This prevents a valid first backup from causing all later runs to
fail with `EEXIST`, and ensures the destination lock is released through the
normal cleanup path.

## 9. Scheduling behavior

The scheduler defaults to one execution every 24 hours. It accepts an
operator-configured `PRG32_BACKUP_INTERVAL_MS` with a one-minute minimum to
prevent tight polling. `PRG32_BACKUP_TIMEZONE` is validated as an IANA
timezone and recorded in private scheduler state and logs. The default is
`UTC`.

`PRG32_BACKUP_RUN_ON_START` defaults to `false`. A controlled first run or
pre-upgrade run can use the same service with `--once` after writer quiescence
has been approved:

```bash
docker compose --profile backup-scheduler run --rm --no-deps \
  backup-scheduler --once
```

The command was not executed against the live operational root. The scheduler
does not perform retention deletion; the existing 7 daily / 4 weekly / 3
monthly policy remains dry-run/operator-reviewed only.

## 10. Retention safety

Automatic deletion is disabled. The scheduler creates no transfer marker and
does not rotate keys. Existing archives remain untouched. Off-device custody
and external transfer remain administrator responsibilities.

## 11. Disposable acceptance

A fresh canonical storage root and fresh key registry were initialized under
`/tmp`. Docker containers used the scheduler image with a read-only rootfs,
private tmpfs and non-root UID 1000.

| Check | Result |
| --- | --- |
| Scheduler container start | PASS |
| Encrypted backup creation | PASS |
| Completion marker | PASS |
| Verification marker | PASS |
| Independent encrypted verify | PASS — `verification_state: complete` |
| Two consecutive backup runs | PASS |
| Overlap protection | PASS — one exit `0`, one exit `1` |
| Fresh Docker bind-mounted restore | PASS |
| Restored SQLite file | PASS |
| Scheduler healthcheck command | PASS |
| Graceful SIGTERM/stop | PASS — exit `0`, state `stopped` |
| Disposable source modification outside lease handling | NO |

The restore acceptance specifically exercised the Docker cross-filesystem
fallback introduced for `EXDEV`.

## 12. Local operational activation

The operational project was identified as `prg32-local-operational`, using
the standalone Compose base, direct loopback overlay, Dream local-persistent
overlay and existing federation runtime overrides. Its Fastify and Next.js
health checks returned success.

The existing operational archive status was read without mutation:

| Field | Result |
| --- | --- |
| Archive count | 6 |
| Latest archive | `m5413-pre-recreate.backup4` |
| Retention candidates | 0 |
| Existing archive verification | PASS — 644251 bytes |
| Competing scheduler container | none |
| Scheduler profile config | PASS |
| Live scheduler activation | NOT PERFORMED |
| New operational backup | NOT CREATED |

The local scheduler was not started because the current writer lease makes a
first live backup unsafe without quiescing Fastify. No application service was
recreated merely to add the optional service.

## 13. First live backup verification

No first live operational backup was created. This is required by the
acceptance boundary because the current Fastify writer lease is active and no
separate quiescence window was approved.

The exact future acceptance sequence is:

1. approve and execute a controlled Fastify writer quiescence window;
2. confirm the canonical writer lease is released by the application;
3. start only `backup-scheduler` with `--no-deps` or `PRG32_BACKUP_RUN_ON_START=true`;
4. verify the new archive, completion marker, verification marker and SHA-256;
5. verify the archive independently with the external key registry;
6. restore only into a new disposable target;
7. resume the application writer only after the backup acceptance passes.

Until those steps are performed, `LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE` remains
the correct state.

## 14. Observability

The scheduler emits structured private container logs for:

- startup and interval configuration;
- backup start;
- backup success;
- backup failure code;
- graceful stop.

It writes a protected state file in the backup destination containing schema,
status, interval, timezone, next scheduled execution, last start/finish,
last success and a stable failure code. It never writes keys, authorization
values, passwords or raw exception text.

The existing wrapper `status` command remains the archive-level source for
archive count, latest backup, backup age and retention dry-run. No public
monitoring endpoint was added.

## 15. Monitoring integration readiness

The Compose healthcheck runs the private scheduler healthcheck command and
marks a failed backup state unhealthy. External monitoring can inspect the
container health, logs and private state file for stopped scheduler, missed
execution, verification failure or excessive backup age.

Shared Dream Gatus was not modified and no notification was sent. Therefore:

**`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**

## 16. Rollback policy status

The existing State A/B/C policy remains unchanged:

- State A: Flask remains authoritative before routing changes.
- State B: controlled rollback may be possible before canonical writes after
  writer checks.
- State C: after canonical writes, forward-fix is preferred; do not blindly
  return traffic to Flask.

No simultaneous writers, silent data loss or automatic reverse migration is
allowed. The policy is not formally approved by this milestone:

**`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**

## 17. Validation results

Node.js `v24.20.0` was selected with `nvm use 24`.

| Validation | Result |
| --- | --- |
| Scheduler unit tests | PASS — 4 tests |
| Existing wrapper tests | PASS — 3 tests |
| Backend storage backup/restore tests | PASS — 14 tests |
| Backend typecheck | PASS |
| Scheduler and wrapper syntax | PASS |
| Scheduler Docker image build | PASS |
| Standalone Compose config | PASS |
| Operational Compose overlay config | PASS |
| Docker disposable create/verify/restore | PASS |
| Docker overlap acceptance | PASS |
| Docker startup/shutdown acceptance | PASS |
| Fastify `/health` and `/ready` | PASS |
| Next.js `/health` | PASS |
| Existing operational archive verify | PASS |
| `git diff --check` | PASS |
| Linux Docker Engine execution | NOT CLAIMED — Docker Desktop macOS only |
| Host systemd/launchd installation | NOT PERFORMED — superseded |

## 18. Files changed

Implementation files:

- `deploy/operations/backup/scheduler.mjs`;
- `deploy/operations/backup/scheduler.test.mjs`;
- `deploy/operations/backup/Dockerfile.scheduler`;
- `deploy/operations/backup/prg32-backup.mjs` — idempotent incoming directory;
- `deploy/standalone/compose.yaml` — optional scheduler profile;
- `backend/src/storage-v2/backup.ts` — Docker `EXDEV` restore fallback.

Documentation:

- `docs/modernization/149-docker-backup-scheduler-m5-4-21.md` — this report.

No database schema migration, public route, shared infrastructure file,
operational environment file, archive, key registry or application container
was changed. No additional M5.4.21 Markdown, JSON or CSV evidence file was
created in the repository.

## 19. Remaining blockers

1. A controlled writer-quiescence protocol is required before the first live
   operational backup. The current Fastify process holds the canonical lease.
2. The operator must choose and verify the production bind path for the
   backup destination and ensure the `node` UID has only the required access.
3. A Linux Docker Engine acceptance run remains unverified; Docker Desktop
   validated the bind-mount and cross-filesystem behavior.
4. External custody and alert recipients remain unapproved.
5. Post-write rollback/reconciliation policy remains unapproved.

The RW canonical bind required by the existing lease is the main remaining
security-hardening concern. It should be addressed by a separately authorized
writer-coordination design before treating the scheduler as production-ready.

## 20. Final decision

M5.4.21 is **GO for disposable Docker scheduler validation** and **NO-GO for
live operational backup activation** until writer quiescence is explicitly
handled.

```text
M5421_DOCKER_SCHEDULER_VALIDATED
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OPERATIONAL_BACKUP_NOT_CREATED
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
