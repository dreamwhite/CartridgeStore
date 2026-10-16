# PRG32 Cartridge Store — M5.4.18 Local Backup Activation

Date: 2026-10-16

## 1. Executive summary

M5.4.18 local backup activation is **`M5418_LOCAL_BACKUP_READY`**.

The operator-approved local backup architecture was validated without touching
the operational canonical database or creating a new live backup. The existing
backup-v4 wrapper now also provides a read-only operator `status` command. It
reports local archive count, latest archive, archive age, wrapper verification
markers, retention dry-run candidates, scheduler state and external-custody
state without exposing secrets or filesystem details through HTTP.

A fresh synthetic root and disposable key registry completed create,
authenticated verify, SHA-256 transfer evidence, calendar-retention testing
and fresh-root restore. Existing operational backup `m5413-pre-recreate.backup4`
was independently verified in read-only mode.

The local result is not off-device disaster-recovery evidence. No scheduler,
NAS/SFTP/S3 integration, public endpoint, monitoring integration, routing
change, Flask shutdown, commit or push was performed.

Final decisions:

```text
M5418_LOCAL_BACKUP_READY
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Approved local backup architecture

The operator approved the following boundary:

- Cartridge Store creates local encrypted backup-v4 archives.
- Cartridge Store verifies archive integrity and manages local retention.
- Cartridge Store supports restoration into a fresh target.
- The system administrator owns off-device copying, external retention,
  external storage, disaster-recovery infrastructure and recovery-material
  custody.

The application does not implement NAS, SFTP, S3, cloud-provider logic or a
backup daemon. The standalone deployment continues to have exactly two
application services: Fastify and Next.js.

## 3. Authorization boundary

Authorized actions were limited to reading existing local operational state,
modifying the PRG32-owned backup wrapper to add read-only status reporting,
validating existing encrypted backups, running disposable create/verify/restore
and retention tests, validating Node.js/Compose/YAML configuration, and
creating this report.

Not performed:

- no backup created from the live operational canonical root;
- no operational archive deleted or overwritten;
- no host scheduler installed;
- no off-device transfer attempted;
- no public routing or shared Dream infrastructure change;
- no Authentik, Flask, auth-writer or `../PRG32` modification;
- no commit or push.

## 4. Backup destination contract

The local destination is the existing Git-ignored directory:

```text
.local/operational/backups/
```

The wrapper still requires an explicit absolute
`PRG32_BACKUP_DESTINATION` and accepts any operator-controlled persistent
filesystem path. It refuses missing, unsafe or symbolic-link destinations.
The local directory currently contains six completed `.backup4` archives and
their completion markers.

This directory is local custody only. It is not presented as a separate
failure domain and does not satisfy external disaster-recovery verification.

## 5. Key-registry separation

The operational key registry remains outside the archive directory at:

```text
.local/operational/secrets/key-registry.json
```

The path was used only for read-only verification of the existing operational
archive. Disposable acceptance used a separate synthetic registry. The wrapper
requires `PRG32_BACKUP_KEY_REGISTRY`, refuses missing/unsafe registry paths and
never embeds key material in an archive or log.

## 6. Backup scheduling contract

The target operating policy remains one local backup every 24 hours, an
additional backup before upgrades, seven daily generations, four weekly
generations and three monthly generations.

The wrapper is intentionally one-shot. The new `status` command reports:

- `scheduling_configured: false`;
- current local archive count and latest timestamp;
- last wrapper verification-marker state;
- backup age;
- retention dry-run selection;
- `external_custody_verified: false`.

No crontab, launchd job, systemd timer, container or persistent backup daemon
was installed. Therefore:

**`LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE`**

An operator may later invoke the one-shot command from a separately approved
host scheduler without adding an application service.

## 7. Retention safety

The existing wrapper retention implementation remains calendar-aware:

- seven distinct newest UTC daily buckets;
- four distinct newest ISO-week buckets;
- three distinct newest UTC-month buckets.

It protects the newest valid archive, newest verified recovery point,
unverified archives, incomplete archives and archives without transfer
evidence. It is dry-run by default. Actual deletion requires:

```text
PRG32_BACKUP_RETENTION_CONFIRM=I_UNDERSTAND_BACKUP_DELETION
```

The operational directory was inspected only. Its six existing archives were
not deleted or changed. Deletion was tested only against a synthetic copied
archive in a disposable destination; the old synthetic candidate was removed
only after explicit confirmation while the newest synthetic archive remained.

## 8. Local backup status

The new operator-facing command is:

```bash
PRG32_BACKUP_DESTINATION=/path/to/backups \
  node deploy/operations/backup/prg32-backup.mjs status
```

Read-only status of the existing local destination:

| Field | Result |
| --- | --- |
| Archive count | 6 |
| Latest archive | `m5413-pre-recreate.backup4` |
| Latest archive timestamp | `2026-10-15T14:43:18.714Z` |
| Retention dry-run candidates | 0 |
| Scheduler configured | false |
| External custody verified | false |
| Wrapper verification marker | not recorded for historical archives |

The historical archive was nevertheless verified directly during this
milestone with the existing CLI path. The status distinction is intentional:
the old archives have backup-v4 completion markers but no wrapper-generated
`.verified.json` marker.

## 9. Disposable acceptance

The disposable run used a fresh canonical root, fresh key registry, fresh
destination and fresh restore target under `/tmp`.

| Check | Result |
| --- | --- |
| Backup-v4 encrypted create | PASS |
| Authenticated verify | PASS |
| Archive size | `482338` bytes |
| Archive SHA-256 | `cde667fd4a72ac19f9ce523ec5bab19b04fe2caf9114a56a4d37678832ddbb5b` |
| Disposable backup ID | `55a32fba-530e-4af7-90d2-ca64b8c63c88` |
| Transfer marker | PASS |
| Retention dry-run | PASS; synthetic old candidate identified |
| Retention deletion | PASS; synthetic candidate only |
| Fresh-target restore | PASS; state `completed` |
| Restore operation ID | `81fc7157-913c-4b7f-9869-0eb6dd32ac11` |
| `.incoming` cleanup | PASS |
| Operational data modified | NO |

The focused Node test suite passed three tests covering calendar selection,
untransferred/unverified protection and same-day newest selection.

## 10. Existing operational backup verification

The existing operational archive was verified without creating or modifying a
live archive:

| Field | Result |
| --- | --- |
| Archive | `m5413-pre-recreate.backup4` |
| Backup ID | `8ec8d294-cb9b-425e-8f50-2cb68060132f` |
| Bytes | `644251` |
| Archive SHA-256 | `94ba3cbb3430c0f6732163274953672488ce803144c0a9b6c6d24af732b7df6f` |
| Verification state | complete |
| Key registry | external local registry, read-only access |

No completion marker, archive bytes, key registry or canonical source was
changed by this verification.

## 11. Portability

The implementation remains portable across standalone Linux deployment,
optional Dream integration and generic university infrastructure.

It has no hardcoded Dream path, no mandatory external backup service, no cloud
provider dependency and no university-specific code. The only required
runtime dependency for the wrapper is Node.js 24 plus the existing local
`prg32-store` backup-v4 CLI.

## 12. Validation results

Node.js 24 was selected with `source "$HOME/.nvm/nvm.sh"; nvm use 24`.

| Validation | Result |
| --- | --- |
| `node --test deploy/operations/backup/prg32-backup.test.mjs` | PASS — 3 tests |
| Wrapper syntax checks | PASS |
| Disposable create/verify/transfer/retention/restore | PASS |
| Operational backup verification | PASS |
| Local `status` command | PASS — 6 archives, zero retention candidates |
| Monitoring example validation | PASS in prior M5.4.17; YAML parser available |
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| CLI typecheck | PASS |
| Standalone Compose config | PASS |
| Operational Compose config | PASS |
| Standalone + Dream overlay config | PASS |
| Fastify `/ready` | PASS — HTTP 200 |
| Next.js `/health` | PASS — HTTP 200 |
| `git diff --check` | PASS |

No operational container was restarted and no Docker prune or volume operation
was run.

## 13. Files changed

M5.4.18 changed/added exactly:

- [deploy/operations/backup/prg32-backup.mjs](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/prg32-backup.mjs) — added read-only `status` command;
- [docs/modernization/146-local-backup-activation-m5-4-18.md](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/docs/modernization/146-local-backup-activation-m5-4-18.md) — this report.

Previous milestone files and pre-existing dirty worktree changes were
preserved. No additional M5.4.18 Markdown, JSON or CSV evidence file was
created.

## 14. Remaining operator decisions

The local backup decision is closed, but these remain outside this bounded
activation:

- external off-device copy and disaster-recovery verification;
- host scheduler installation and cadence approval;
- external monitoring recipients, alert delivery and configuration approval;
- formal post-write rollback/reconciliation policy;
- public cutover maintenance window and named cutover/recovery operators.

Therefore:

- **`OFF_DEVICE_RECOVERY_NOT_VERIFIED`**;
- **`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**;
- **`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**.

## 15. Final decision

**`M5418_LOCAL_BACKUP_READY`**

Local encrypted backup creation, verification, retention handling and
fresh-target restoration are ready for an operator-managed local workflow.
Scheduling is not active, external custody is not verified, monitoring is not
activated and no public cutover is authorized.

```text
M5418_LOCAL_BACKUP_READY
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
