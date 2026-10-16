# PRG32 Cartridge Store — M5.4.20 Local Scheduler Activation

Date: 2026-10-16

## 1. Executive result

M5.4.20 is **prepared and validated for Linux deployment**, but the
systemd timer is **not active**.

The approved target is Linux with a systemd oneshot service and timer. The
current execution host is macOS (`Darwin`), and no designated Linux
operational host or deployment identity was available in this workspace.
Consequently, no systemd unit was installed, enabled, started or simulated as
active.

Final state:

```text
M5420_LINUX_SYSTEMD_PREPARED
LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE
SCHEDULED_EXECUTION_NOT_YET_OBSERVED
OFF_DEVICE_RECOVERY_NOT_VERIFIED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Authorization and safety boundary

The operator clarification authorizes encrypted operational backup creation
on the designated Linux host, with the following policy:

- Linux and systemd only;
- dedicated unprivileged `prg32` service account;
- daily execution at 03:15;
- manual pre-upgrade backup supported;
- read-only access to the canonical source root;
- encrypted backup creation authorized;
- automatic retention deletion not authorized.

The Linux host was not available or identified from this macOS workspace.
The clarification explicitly prohibits installing systemd on the development
Mac, so the deployment was limited to repository-side preparation and
validation.

No operational backup was created. No canonical database or object store was
modified. No existing archive was deleted, replaced or marked transferred.
No Docker service, Dream infrastructure, Authentik configuration, public
routing or Flask process was changed. No commit or push was performed.

## 3. Systemd deployment contract

The prepared files are:

- `deploy/operations/backup/scheduling/prg32-backup.service`;
- `deploy/operations/backup/scheduling/prg32-backup.timer`;
- `deploy/operations/backup/scheduling/run-backup.sh`.

The service is a `Type=oneshot` job running as:

```text
User=prg32
Group=prg32
UMask=0077
NoNewPrivileges=true
```

The timer runs once per day at 03:15 with `Persistent=true` and a fifteen
minute `RandomizedDelaySec`. The timer only invokes the oneshot service; it
does not perform retention deletion.

The service currently expects the following deployment paths and values to be
provided by the Linux operator:

| Item | Required value |
| --- | --- |
| Unit environment | `/etc/prg32/cartridge-store-backup.env` |
| Repository/runtime root | `/opt/prg32-cartridge-store` as referenced by the unit |
| Node runtime | `PRG32_NODE_BIN`, an absolute Node.js 24 binary |
| Wrapper | `PRG32_BACKUP_WRAPPER`, the repository backup wrapper |
| Source | `PRG32_BACKUP_SOURCE`, canonical root readable by `prg32` |
| Destination | `PRG32_BACKUP_DESTINATION`, writable only as required by `prg32` |
| Key registry | `PRG32_BACKUP_KEY_REGISTRY`, readable by `prg32`, mode `0600` where applicable |
| Authorization | `PRG32_BACKUP_AUTHORIZATION`, supplied outside Git |
| Backup CLI | `PRG32_BACKUP_CLI_BIN` and optional arguments, supplied outside Git |

The host-specific values were not invented because the Linux host and its
filesystem layout were not available for inspection. The unit must not be
installed until an operator confirms that `/opt/prg32-cartridge-store` and
the environment-file paths match the designated host.

## 4. Backup behavior

The existing backup-v4 wrapper remains the only backup implementation. The
systemd runner calls its `create` operation. The wrapper performs:

1. explicit path and authorization validation;
2. destination locking to reject overlapping executions;
3. encrypted backup creation through the existing backup-v4 CLI;
4. independent verification before publication;
5. SHA-256 evidence generation;
6. atomic promotion from the incoming directory;
7. completion and verification sidecar creation;
8. cleanup of incomplete temporary output.

The scheduled job never enables retention deletion. The approved retention
policy remains 7 daily, 4 weekly and 3 monthly generations, but selection is
dry-run/operator-reviewed only. No automatic deletion is part of this
milestone.

The additional pre-upgrade backup is represented by manually starting the
same oneshot service on the approved Linux host:

```bash
sudo systemctl start prg32-backup.service
```

That command was documented only; it was not executed from this Mac.

## 5. Linux installation procedure for the designated host

This procedure is intentionally not executed here:

```bash
sudo install -d -o root -g root -m 0755 /etc/prg32
sudo install -o root -g root -m 0644 \
  deploy/operations/backup/scheduling/prg32-backup.service \
  /etc/systemd/system/prg32-backup.service
sudo install -o root -g root -m 0644 \
  deploy/operations/backup/scheduling/prg32-backup.timer \
  /etc/systemd/system/prg32-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now prg32-backup.timer
sudo systemctl is-enabled prg32-backup.timer
sudo systemctl is-active prg32-backup.timer
systemctl list-timers prg32-backup.timer
```

Before executing it, the operator must ensure that:

- the `prg32` account and group exist and are unprivileged;
- the account can read the canonical source root but cannot write to it;
- the account can write only to the approved backup destination and required
  temporary directory;
- the account can read the external key registry without exposing its value;
- the Node binary is Node.js 24;
- the repository path in `ExecStart` exists and is immutable from the job's
  perspective;
- `/etc/prg32/cartridge-store-backup.env` is root-owned and not committed;
- no duplicate timer or cron job exists.

The first activation should use a manually observed
`systemctl start prg32-backup.service`, followed by read-only inspection of
the completion and verification sidecars. Only after that observation should
the operator rely on the daily timer.

## 6. Validation performed in this workspace

The following checks were executed with Node.js selected through `nvm use 24`:

| Check | Result |
| --- | --- |
| Host identity | PASS — macOS detected; no Linux installation attempted |
| Node.js version | PASS — `v24.20.0` |
| pnpm version | PASS — `12.5.1` |
| `node --test deploy/operations/backup/prg32-backup.test.mjs` | PASS — 3 tests |
| `sh -n deploy/operations/backup/scheduling/run-backup.sh` | PASS |
| `node --check deploy/operations/backup/prg32-backup.mjs` | PASS |
| systemd unit/timer structural parse | PASS — sections parsed successfully |
| `systemd-analyze verify` | NOT AVAILABLE — systemd is not installed on this macOS host |
| Read-only operational backup status | PASS — 6 archives, zero retention candidates |
| `git diff --check` | PASS |

The status probe reported `scheduling_configured: false`, which is the
expected result because no scheduler was installed. No live `create` command
was run.

The scheduler runner and backup wrapper had already passed disposable
creation, verification, restore and concurrent-lock acceptance in M5.4.19;
this milestone did not repeat those mutating disposable tests because the
scope was Linux scheduler activation and the host prerequisite was absent.

## 7. Existing operational state

The operational backup directory was inspected read-only. The current
read-only status was:

| Field | Value |
| --- | --- |
| Archive count | 6 |
| Latest archive | `m5413-pre-recreate.backup4` |
| Retention dry-run candidates | 0 |
| Scheduler configured | `false` |
| External custody | not verified |
| Latest wrapper verification marker | not recorded |

The existing encrypted archive and key registry remain untouched. This status
does not establish a scheduled execution or external disaster-recovery copy.

## 8. Files changed

This milestone added exactly one Markdown report:

- `docs/modernization/148-local-scheduler-activation-m5-4-20.md` — this
  activation and deployment-readiness report.

No systemd unit was edited in this milestone. The pre-existing scheduler
examples remain the implementation under validation. No additional report,
JSON, CSV or host configuration file was created.

## 9. Remaining blockers

M5.4.20 cannot be marked operationally active until the designated Linux host
is supplied and verified. The remaining host-side gates are:

1. verify the Linux hostname and filesystem paths;
2. verify the `prg32` account, group and least-privilege permissions;
3. install the unit and timer on that Linux host;
4. reload systemd and enable the timer;
5. run and observe one manual pre-upgrade backup;
6. verify the resulting encrypted archive and sidecars;
7. confirm that no duplicate scheduler exists;
8. decide separately whether external monitoring and off-device custody are
   approved.

Automatic retention deletion remains explicitly prohibited. Public cutover,
Flask retirement, Dream infrastructure changes and routing changes remain
outside this milestone.

## 10. Final decisions

The Linux scheduler is prepared but not active:

- **M5.4.20:** `M5420_LINUX_SYSTEMD_PREPARED`;
- **scheduler:** `LOCAL_BACKUP_SCHEDULER_NOT_ACTIVE`;
- **scheduled run:** `SCHEDULED_EXECUTION_NOT_YET_OBSERVED`;
- **off-device recovery:** `OFF_DEVICE_RECOVERY_NOT_VERIFIED`;
- **monitoring:** `EXTERNAL_MONITORING_APPROVAL_REQUIRED`;
- **rollback:** `POST_WRITE_ROLLBACK_DECISION_REQUIRED`;
- **operational cutover:** `OPERATIONAL_CUTOVER_NO_GO`;
- **Flask retirement:** `FLASK_RETIREMENT_NO_GO`.

No claim of scheduler activation is made until the systemd units are actually
installed and observed on the designated Linux operational host.
