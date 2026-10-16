# PRG32 Cartridge Store — M5.4.19 Local Operations Scheduling

Date: 2026-10-16

## 1. Executive summary

M5.4.19 completed with **`BACKUP_INTEGRITY_VERIFIED`** and
**`M5419_SCHEDULER_PREPARED`**.

The reported SHA-256 discrepancy was resolved without modifying the archive.
The current authoritative bytes of `m5413-pre-recreate.backup4` hash to
`94ba3cbb3430c0f6732163274953672488ce803144c0a9b6c6d24af732b7df6f`, which
matches its completion marker and independent backup-v4 verification. The
`d04aff...` value in earlier reports is stale or belongs to a different
historical artifact; no historical byte snapshot exists to prove when that
different value was produced.

Portable systemd and launchd examples were added but not installed. A
disposable scheduled one-shot run created, verified, marked, retained and
restored an encrypted archive. Concurrent invocation was safely rejected by
the wrapper lock. The operational backup directory was inspected read-only;
no live operational backup was created or deleted.

Final state:

```text
BACKUP_INTEGRITY_VERIFIED
M5419_SCHEDULER_PREPARED
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Authorization boundary

The work was limited to read-only operational archive inspection, PRG32-owned
wrapper/scheduler examples, disposable backup and restore tests, syntax and
configuration validation, and this report.

No host scheduler, crontab, launchd agent or systemd unit was installed or
enabled. No operational canonical root was used as a backup source. No
operational archive was deleted, replaced or rewritten. No public routing,
Dream shared service, Authentik, Flask process, auth-writer, Docker service or
`../PRG32` file was modified. No commit or push was made.

## 3. Protected state

The following state remained protected:

- `.local/operational/` and `.local/operational-m543/`;
- canonical SQLite and immutable objects;
- administrator and federation identities;
- OIDC/SAML mappings and provider configuration;
- existing encrypted backup archives and external key registry;
- SMTP settings;
- Flask databases and objects;
- transitional auth-writer;
- Authentik and Dream infrastructure;
- public routing and previous modernization reports.

All mutating tests used fresh temporary roots under `/tmp` and disposable key
registries.

## 4. Backup hash discrepancy

The investigated archive is:

```text
/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/.local/operational/backups/m5413-pre-recreate.backup4
```

Read-only filesystem identity:

| Field | Value |
| --- | --- |
| Size | `644251` bytes |
| Inode | `82292319` |
| Modification time | `2026-10-15T16:43:18+0200` |
| Backup ID | `8ec8d294-cb9b-425e-8f50-2cb68060132f` |

Direct hashing of the current bytes produced:

```text
94ba3cbb3430c0f6732163274953672488ce803144c0a9b6c6d24af732b7df6f
```

The completion marker contains the same archive size, backup ID and
`94ba3cbb...` hash. The backup-v4 verify command independently returned
`verification_state: complete` and the same SHA-256.

Historical reports M5.4.13, M5.4.16 and M5.4.17 recorded
`d04aff2586191a24fb3aa26ff5476c81a5d8a01d017e70e4ded3db3a2d39f335` for the
same named path and backup ID. Since no historical byte snapshot or inode
record accompanies that value, the exact historical cause cannot be proven.
The current file, marker and verifier establish that `94ba3cbb...` is the
authoritative hash for the archive that exists now. Historical reports were
not rewritten.

## 5. Authoritative archive integrity

Integrity result: **`BACKUP_INTEGRITY_VERIFIED`**.

Checks performed without mutation:

1. Resolved the exact repository-local archive path.
2. Recorded size, inode and modification time.
3. Computed SHA-256 directly from archive bytes.
4. Compared the digest with the completion marker.
5. Ran the existing backup-v4 authenticated verification using the external
   key registry.
6. Confirmed the backup ID, byte count and verification state agree.

No archive replacement, marker regeneration, key rotation or restore over a
live root occurred.

## 6. Scheduler architecture

Scheduling remains external to the application process and uses the existing
one-shot wrapper. The target policy is one daily local backup, an additional
pre-upgrade backup, seven daily generations, four weekly generations and
three monthly generations.

The scheduled command invokes `create`; the wrapper itself performs encrypted
creation, authenticated verification, checksum calculation and atomic
publication. Retention deletion is deliberately excluded from the scheduled
unit and remains separately authorized.

The destination lock prevents overlapping wrapper executions. The existing
canonical writer lease remains enforced by backup-v4. Exactly two application
services remain required: Fastify and Next.js.

No scheduler is active:

**`LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE`**

## 7. Scheduler examples

Added non-installed examples under
`deploy/operations/backup/scheduling/`:

- `run-backup.sh` — explicit Node binary and wrapper path, fail-closed;
- `prg32-backup.service` — Linux systemd oneshot service;
- `prg32-backup.timer` — daily 03:15 timer with persistence and jitter;
- `com.prg32.cartridge-store.backup.plist` — macOS launchd example with
  operator-supplied paths and protected environment values.

The examples contain no credentials, developer home directory, Dream path,
cloud provider or automatic retention deletion. The systemd service uses an
operator-owned `EnvironmentFile`; the launchd example contains only path
placeholders. Both require an operator to provide `PRG32_BACKUP_*` values and
a Node.js 24 binary.

Validation:

- shell syntax: PASS;
- launchd plist via `plutil -lint`: PASS;
- systemd unit/timer INI structure: PASS;
- `systemd-analyze`: unavailable on this macOS host, therefore not claimed;
- actual unit installation/enabling: NOT PERFORMED.

## 8. Disposable scheduling acceptance

The scheduler runner was exercised with a fresh canonical root, disposable key
registry and disposable destination. The one-shot runner created an encrypted
archive and the fresh target restore completed successfully.

| Check | Result |
| --- | --- |
| Scheduled runner create | PASS |
| Archive completion marker | PASS |
| Encrypted verify | PASS |
| Concurrent overlap | PASS — exits `0,1`; one run accepted, one rejected |
| Destination lock cleanup | PASS |
| SHA-256 transfer evidence | PASS |
| Fresh-root restore | PASS |
| Operational source modified | NO |

The disposable acceptance archive was not an operational backup and was not
used to claim external recovery.

## 9. Local backup status

The read-only status command is:

```bash
PRG32_BACKUP_DESTINATION=/path/to/backups \
  node deploy/operations/backup/prg32-backup.mjs status
```

Status of `.local/operational/backups/`:

| Field | Result |
| --- | --- |
| Archive count | 6 |
| Latest archive | `m5413-pre-recreate.backup4` |
| Retention dry-run candidates | 0 |
| Scheduler configured | false |
| External custody verified | false |
| Historical wrapper verification marker | not recorded |

The archive was independently verified during this milestone even though the
historical archive predates the wrapper-generated `.verified.json` sidecar.

## 10. Forward-fix decision record

The recommended policy is prepared for operator approval but is not marked as
formally approved by this milestone:

- State A: Flask remains authoritative before public routing changes.
- State B: before canonical writes, rollback may be possible after explicit
  writer-ownership verification.
- State C: after canonical writes, do not blindly return traffic to Flask;
  preserve canonical writes and use forward-fix.

Required constraints remain:

- no simultaneous writers;
- no silent data loss;
- no automatic reverse migration;
- no restore over a live root;
- preserve encrypted recovery points;
- resume writes only after incident-specific approval.

Therefore:

**`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**

## 11. Monitoring readiness

The existing portable monitoring example remains the source for health,
readiness, Store/API HTTPS and TLS checks. Local backup age, last verified
backup and scheduler failure are private host/job checks and can consume the
new `status` command; they are not exposed through public `/ready` responses.

The shared Dream Gatus configuration was not modified. No notification
recipient, alert channel or synthetic alert was configured or sent.

Therefore:

**`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**

## 12. Validation results

Node.js 24 was selected with `source "$HOME/.nvm/nvm.sh"; nvm use 24`.

| Validation | Result |
| --- | --- |
| Direct operational archive SHA-256 | PASS |
| Existing backup-v4 verification | PASS |
| Backup wrapper focused tests | PASS — 3 tests |
| Disposable scheduled create/verify/restore | PASS |
| Disposable retention dry-run and deletion | PASS; synthetic archive only |
| Scheduler shell syntax | PASS |
| launchd plist syntax | PASS |
| systemd unit/timer structure | PASS |
| `systemd-analyze` | NOT AVAILABLE on host |
| Monitoring YAML validation | PASS |
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| CLI typecheck | PASS |
| Standalone Compose config | PASS |
| Operational Compose config | PASS |
| Dream overlay Compose config | PASS |
| Fastify `/ready` | PASS — HTTP 200 |
| Next.js `/health` | PASS — HTTP 200 |
| `git diff --check` | PASS |

No operational service was restarted. No Docker prune, volume operation,
crontab change, launchd load or systemd enablement was executed.

## 13. Files changed

M5.4.19 changed/added:

- [deploy/operations/backup/prg32-backup.mjs](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/prg32-backup.mjs) — read-only `status` command and explicit not-recorded verification state;
- [deploy/operations/backup/scheduling/run-backup.sh](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/scheduling/run-backup.sh);
- [deploy/operations/backup/scheduling/prg32-backup.service](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/scheduling/prg32-backup.service);
- [deploy/operations/backup/scheduling/prg32-backup.timer](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/scheduling/prg32-backup.timer);
- [deploy/operations/backup/scheduling/com.prg32.cartridge-store.backup.plist](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/scheduling/com.prg32.cartridge-store.backup.plist);
- [docs/modernization/147-local-operations-scheduling-m5-4-19.md](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/docs/modernization/147-local-operations-scheduling-m5-4-19.md).

Historical reports were not rewritten. No additional M5.4.19 Markdown, JSON
or CSV evidence file was created.

## 14. Remaining operator decisions

- install and enable one approved host scheduler;
- choose the scheduler owner and maintenance window;
- establish external copy and recovery-material custody;
- approve external monitoring recipients and alert delivery;
- formally approve the State A/B/C forward-fix policy;
- separately authorize any future public cutover and Flask retirement.

## 15. Final decision

**`M5419_SCHEDULER_PREPARED`**

The hash discrepancy is resolved authoritatively, scheduler examples are
prepared and syntax-validated, and disposable scheduled execution is verified.
The local scheduler is intentionally not active because host scheduler
installation was not separately authorized.

```text
BACKUP_INTEGRITY_VERIFIED
M5419_SCHEDULER_PREPARED
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
