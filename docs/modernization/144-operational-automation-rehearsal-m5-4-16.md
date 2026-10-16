# PRG32 Cartridge Store — M5.4.16 Operational Automation Rehearsal

Date: 2026-10-15

## 1. Executive summary

M5.4.16 disposable acceptance is **`M5416_DISPOSABLE_REHEARSAL_GO`**.

The milestone adds a portable wrapper around the existing authenticated
encrypted backup-v4 CLI, calendar-aware retention selection, a portable
monitoring example, and an isolated HTTP/WebSocket cutover rehearsal. The
backup and restore exercise used a fresh synthetic canonical root and a fresh
disposable key registry. It created, independently verified, restored and
revalidated an encrypted archive without touching operational data.

The simulated handover exercised candidate health failure, a healthy route
switch, explicit single-writer ownership, pre-write rollback, a post-write
rollback block and a forward-fix path. Public routing, Flask, Dream
infrastructure, Authentik, operational Compose and the operational canonical
database were not changed.

These decisions remain open:

- **`OFF_DEVICE_BACKUP_DESTINATION_REQUIRED`**
- **`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**
- **`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**
- final public routing and single-writer handover authorization

Always:

- **`OPERATIONAL_CUTOVER_NO_GO`**
- **`FLASK_RETIREMENT_NO_GO`**

## 2. Authorization boundary

The implementation was limited to PRG32-owned scripts, tests and an example
monitoring configuration. All backup and restore mutations were directed at
temporary disposable roots under `/tmp`. No operational backup was deleted,
no real backup was transferred off-device, no scheduler or daemon was
installed, and no monitoring recipient was configured.

No public Traefik route, DNS record, TLS certificate, Authentik provider,
shared Dream network, Flask process, transitional auth-writer, operational
SQLite database or `../PRG32` file was modified. No commit or push was made.

## 3. Protected state

The following state remains outside the mutation scope:

- `.local/operational/` and `.local/operational-m543/`;
- operational SQLite and immutable cartridge objects;
- administrators, federation users, OIDC/SAML mappings and provider data;
- existing backup archives and backup key registry;
- setup completion and SMTP settings;
- Flask databases, objects and transitional auth-writer state;
- Authentik resources, Dream infrastructure and current public routing;
- previous modernization reports.

The new wrapper has no operational default paths. It requires explicit source,
destination, key-registry and authorization inputs.

## 4. Baseline health

The M5.4.15 baseline was re-used without repeating federation browser suites.
It recorded Node.js `v24.20.0`, pnpm `12.5.1`, healthy Fastify and Next.js
containers, Fastify `/ready` HTTP 200 with database/storage/writer lease
available, and multiplayer status HTTP 200 with authentication enabled and a
maximum of eight peers per room.

The existing operational backup-v4 archive also remained verified:

| Evidence | Result |
| --- | --- |
| Backup ID | `8ec8d294-cb9b-425e-8f50-2cb68060132f` |
| Size | `644251` bytes |
| SHA-256 | `d04aff2586191a24fb3aa26ff5476c81a5d8a01d017e70e4ded3db3a2d39f335` |
| Key ID | `key-20261015-01` |
| Verification | complete |

Fresh low-volume unauthenticated GET observations returned:

- `store.prg32.dream.test` — HTTP 200;
- `api.prg32.dream.test` — HTTP 200;
- `sso.dream.test` — HTTP 302.

These observations confirm current behavior only. They do not prove public
Fastify ownership and were not used to change routing.

## 5. Backup automation implementation

`deploy/operations/backup/prg32-backup.mjs` is a dependency-free Node.js 24
wrapper. It delegates all archive creation, authenticated encryption,
completion markers, verification and restore integrity checks to the existing
`prg32-store`/backup-v4 implementation. It does not introduce a second backup
format or backup engine.

Supported commands are:

```text
create
verify
restore
mark-transferred
retention
```

The wrapper requires explicit environment inputs:

- `PRG32_BACKUP_SOURCE` — existing canonical source directory;
- `PRG32_BACKUP_DESTINATION` — existing regular destination directory;
- `PRG32_BACKUP_KEY_REGISTRY` — external regular key-registry file;
- `PRG32_BACKUP_AUTHORIZATION` — explicit operation authorization;
- `PRG32_BACKUP_CLI_BIN` — optional installed CLI or local `.js` entrypoint;
- `PRG32_BACKUP_ARCHIVE` and `PRG32_BACKUP_RESTORE_TARGET` for targeted
  verification/restore;
- `PRG32_BACKUP_EXPECTED_SHA256` for transfer confirmation.

Creation uses a destination `.incoming` directory and a unique partial name.
The existing CLI first creates and authenticates the encrypted archive. The
wrapper independently verifies it, computes a streaming SHA-256 digest, then
atomically renames the archive into its final destination and publishes the
completion marker last. A completed archive or marker is never overwritten.
Failed attempts remove only their own partial files and leave no completed
archive. A destination lock prevents concurrent wrapper operations; the
underlying backup-v4 writer lease still prevents backup during an active
canonical writer.

`mark-transferred` records only checksum, timestamp and operator-confirmed
status in a non-secret sidecar. It does not pretend that a local filesystem is
an off-device failure domain. SSH/SFTP and cloud-specific transfer logic are
intentionally not implemented.

`PRG32_BACKUP_DRY_RUN=1` validates the explicit paths and prints the planned
archive without invoking the backup engine.

## 6. Disposable backup acceptance

A new temporary canonical root and a new temporary key registry were created.
The real wrapper invoked the built CLI at `cli/dist/main.js`, which in turn
used the existing backend backup-v4 implementation.

| Check | Result |
| --- | --- |
| Encrypted backup creation | PASS |
| Archive completion marker | PASS |
| Independent authenticated verification | PASS |
| Destination SHA-256 | PASS — `c7b8a1e7dbe58536adf4a19d2c824d0bd01582771bf9f626c4d9f365d3759ca0` |
| Archive size | PASS — `482338` bytes |
| Disposable backup ID | `b96101d0-a826-487a-8229-dd3c4629336c` |
| Fresh-root restore | PASS — state `completed` |
| SQLite/object verification | PASS through backup-v4 restore |
| Duplicate invocation | PASS — exit 1, `archive_exists` |
| Missing destination | PASS — exit 1, no archive published |
| Missing key registry | PASS — exit 1, no archive published |
| Concurrent writer lease | PASS — exit 1, no archive published |
| Partial-transfer cleanup | PASS — `.incoming` had no partial files |
| Plaintext archive leakage | PASS — destination contained encrypted archive and non-secret markers only |

The restore target was fresh and disposable. No operational source, archive,
database or object directory was used for destructive testing.

## 7. Retention policy implementation

`selectRetention` in the wrapper implements distinct UTC calendar buckets:

- seven newest daily generations;
- four newest ISO-week generations;
- three newest UTC-month generations.

The newest valid archive, newest verified recovery point, all incomplete or
unverified archives and all archives without transfer evidence are always
protected. Only archives that are complete, verified and transfer-confirmed
can become deletion candidates.

Retention is dry-run by default. `--apply` requires
`PRG32_BACKUP_RETENTION_CONFIRM=I_UNDERSTAND_BACKUP_DELETION`. A disposable
retention run selected one synthetic old candidate, rejected deletion without
the confirmation, then deleted that candidate only after explicit confirmation
inside the disposable destination. The newest archive remained present.

Calendar selection is covered by three focused Node tests, including same-day
selection and protection of untransferred/unverified archives.

## 8. Monitoring integration

`deploy/operations/monitoring/monitoring.example.yaml` is a portable,
Gatus-compatible-style example. It contains no credentials, recipients,
Dream-specific origin, provider configuration or mandatory service.

It includes probes for:

- Fastify `/health`;
- Fastify `/ready`;
- Next.js `/health`;
- public Store HTTPS availability and certificate expiry;
- public API HTTPS availability and certificate expiry.

Backup age, last verified checksum, transfer evidence, disk capacity, restart
loops and single-writer state are explicitly identified as host/job checks.
They require a trusted external monitor or scheduler and are not exposed as
public readiness details.

No alert recipient or production scheduler was invented. External monitoring
delivery therefore remains unverified.

## 9. Monitoring validation

The example was statically checked for placeholder origins and absence of
secret-bearing values. No YAML parser was installed in the repository runtime,
so no third-party YAML parser was added solely for this milestone.

The disposable rehearsal validated the corresponding local classifications:
healthy Fastify/readiness responses returned 200, simulated candidate failure
returned 503, and the endpoint fixture was removed at process completion.
This is local probe validation, not proof of external alert delivery or TLS
certificate monitoring in Dream infrastructure.

## 10. Multiplayer contract preservation

No multiplayer implementation or firmware contract was changed. The previous
decision remains **`MULTIPLAYER_CONTRACT_COMPATIBLE`**:

- `signature` remains a cartridge-level grouping identifier;
- it is not a private-room secret or board ACL;
- the existing player-role threshold and `PRG32_USERS` compatibility remain;
- protocol message formats and documented limits remain unchanged;
- no new ACL or arbitrary-join restriction was introduced.

The disposable rehearsal exercised the existing boundary shape with HTTP
multiplayer status and a WebSocket upgrade response `101 Switching Protocols`.

## 11. Disposable cutover rehearsal

`deploy/operations/rehearsal/cutover-rehearsal.mjs` starts two synthetic local
HTTP backends and an ephemeral local reverse proxy. It does not connect to
public hosts, Dream networks, Flask, Fastify or an operational database.

The rehearsal produced these states:

1. Candidate health failure returned 503 and aborted the simulated switch;
   legacy remained the route and writer owner.
2. A healthy candidate accepted a simulated route switch with exactly one
   candidate writer and zero canonical writes.
3. A pre-write rollback relinquished candidate ownership before restoring
   legacy route and writer ownership.
4. A post-write candidate request produced one canonical write; blind rollback
   was blocked and the route stayed on candidate for forward-fix.

The temporary root and all local servers were removed in `finally` cleanup.
The rehearsal emitted one sanitized JSON result to stdout and did not create a
JSON evidence file.

## 12. Writer-ownership simulation

The rehearsal rejects any attempt to set a second writer while the current
writer is active. It explicitly clears ownership before transferring it. The
result was:

| Invariant | Result |
| --- | --- |
| Single writer before handover | PASS |
| Single writer after candidate handover | PASS |
| Pre-write rollback after relinquishing candidate | PASS |
| Simultaneous writer attempt rejected | PASS |
| Candidate canonical writes recorded | PASS — 1 synthetic write |
| Legacy snapshot marker unchanged | PASS |

This is a state-machine rehearsal, not an operational lease transfer.

## 13. Simulated routing acceptance

The proxy exercised the following synthetic endpoints:

| Surface | Result |
| --- | --- |
| Basic application availability | PASS |
| Catalog listing | PASS |
| Cartridge download | PASS |
| Anonymous session boundary | PASS — 401 |
| Authenticated session boundary | PASS — 200 |
| Anonymous admin authorization | PASS — 401 |
| Authenticated admin authorization | PASS — 200 |
| Health | PASS |
| Readiness | PASS |
| Multiplayer HTTP | PASS |
| Multiplayer WebSocket upgrade | PASS — 101 |

No public hostname, reverse proxy, authentication provider or deployment
configuration was changed.

## 14. Forward-fix procedure

The recommended post-write response is forward-fix, not an automatic return
to Flask:

1. Keep the canonical writer owner explicit and prevent a second writer.
2. Isolate the failing workflow or endpoint without discarding canonical data.
3. Create and verify a fresh encrypted recovery archive.
4. Identify the failed component and preserve incident evidence.
5. Apply the smallest safe correction in a disposable validation target.
6. Revalidate health, readiness, API compatibility and object integrity.
7. Resume writes only after explicit approval.
8. Record the accepted recovery point and incident outcome.

A post-write reverse rollback may require reconciliation of writes accepted by
Fastify after cutover. Simply restarting Flask could lose those writes. The
operator must choose between explicit accepted data loss, export/reconciliation
of post-cutover writes, or forward-fix. That decision remains
**`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**. No reverse migration was
implemented.

## 15. Tests executed

Node.js 24 was selected with `source "$HOME/.nvm/nvm.sh"; nvm use 24`.

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 56 files, 278 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir cli run typecheck` | PASS |
| `pnpm --dir cli run lint` | PASS |
| `pnpm --dir cli run test` | PASS — 5 files, 9 tests |
| `pnpm --dir cli run build` | PASS |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `node --test deploy/operations/backup/prg32-backup.test.mjs` | PASS — 3 tests |
| `node deploy/operations/rehearsal/cutover-rehearsal.mjs` | PASS — all endpoint and ownership assertions |
| disposable wrapper create/verify/restore | PASS |
| disposable failure-safety suite | PASS |
| disposable retention dry-run/apply gate | PASS |
| standalone Compose config with explicit placeholders | PASS |
| operational Compose config with explicit placeholders | PASS |
| standalone + Dream overlay config with explicit placeholders | PASS |
| `git diff --check` | PASS |

The first Compose validation attempts without required environment variables
were rejected by the existing fail-closed Compose interpolation checks. The
same three configurations passed after supplying non-secret placeholder values;
no Compose file was modified.

## 16. Files changed

New PRG32-owned implementation/configuration files:

- [deploy/operations/backup/prg32-backup.mjs](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/prg32-backup.mjs)
- [deploy/operations/backup/prg32-backup.test.mjs](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/backup/prg32-backup.test.mjs)
- [deploy/operations/monitoring/monitoring.example.yaml](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/monitoring/monitoring.example.yaml)
- [deploy/operations/rehearsal/cutover-rehearsal.mjs](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/deploy/operations/rehearsal/cutover-rehearsal.mjs)
- this report.

Previously dirty files from earlier milestones were preserved and not folded
into this report or rewritten. No existing Compose, application or
modernization report was modified by M5.4.16.

## 17. Remaining operator decisions

1. Select and document a destination in a separate failure domain. The wrapper
   supports an operator-mounted local or remote filesystem; it does not pick a
   cloud, SSH host or credential.
2. Provide external key-registry custody and a tested recovery procedure.
3. Approve backup schedule, transfer verification, retention owner and
   deletion escalation.
4. Select an external monitor, alert recipients, thresholds and maintenance
   window; verify a real alert delivery separately.
5. Approve the post-write rollback policy and its accepted data-loss or
   reconciliation decision.
6. Authorize a real cutover window, traffic switch, writer lease transfer and
   rollback owner in a later milestone.

## 18. Final readiness matrix

| Gate | Status |
| --- | --- |
| Standalone two-service architecture | GO — validated; no third mandatory application service |
| Dream independence | GO — standalone Compose remains separate; Dream overlay optional |
| Existing backup-v4 compatibility | GO — existing archive verifies |
| Portable backup wrapper | GO — disposable create/verify/restore passed |
| Calendar retention | GO — dry-run default and explicit deletion gate passed |
| Real off-device destination | NO-GO — `OFF_DEVICE_BACKUP_DESTINATION_REQUIRED` |
| Monitoring example | GO — portable checks prepared |
| Real alert delivery | NO-GO — `EXTERNAL_MONITORING_APPROVAL_REQUIRED` |
| Multiplayer contract | GO — `MULTIPLAYER_CONTRACT_COMPATIBLE` |
| Disposable routing rehearsal | GO — local proxy and synthetic endpoints passed |
| Single-writer handover | GO in disposable rehearsal only |
| Post-write rollback policy | NO-GO — `POST_WRITE_ROLLBACK_DECISION_REQUIRED` |
| Operational public cutover | NO-GO — not authorized or performed |
| Flask retirement | NO-GO — Flask remains transitional authority |

## 19. Final decision

**`M5416_DISPOSABLE_REHEARSAL_GO`**

The non-destructive technical work authorized for M5.4.16 is complete. The
result is not operational cutover authorization. The open external decisions
remain explicitly visible:

```text
M5416_DISPOSABLE_REHEARSAL_GO
OFF_DEVICE_BACKUP_DESTINATION_REQUIRED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 20. Recommended next authorized action

Do not cut over yet. First approve the off-device destination and key custody,
configure and test external monitoring delivery, and record the post-write
rollback decision. After those operator decisions are documented, authorize a
separate cutover-preparation milestone with an explicit maintenance window and
single-writer handover owner. M5.4.16 itself is complete and stops here.
