# PRG32 Cartridge Store — M5.4.17 Operational Activation Gates

Date: 2026-10-16

## 1. Executive summary

M5.4.17 is **`M5417_ACTIVATION_PREPARATION_GO`**.

All technical work authorized before an operational activation passed:

- the existing backup-v4 wrapper was reviewed and focused-tested;
- a fresh synthetic canonical root was backed up, verified, marked as
  transferred, restored into a fresh root and checked;
- calendar retention remained dry-run by default;
- the monitoring example parsed successfully with the existing Ruby YAML
  parser;
- the running local Fastify and Next.js services passed read-only application
  probes;
- the existing Dream Gatus container was inspected without configuration
  changes;
- backend, frontend and CLI typechecks passed;
- standalone, operational and optional Dream Compose configurations passed
  with explicit non-secret placeholders.

The operational blockers remain intentionally open:

```text
OFF_DEVICE_BACKUP_DESTINATION_REQUIRED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

This is preparation GO only. No public cutover, Flask shutdown, routing
change, operational data mutation, scheduler installation, backup transfer,
credential rotation, commit or push was performed.

## 2. Authorization boundary

M5.4.17 was limited to read-only runtime inspection, disposable backup and
restore validation, isolated local HTTP probes, YAML validation, Compose
configuration validation and this report.

No shared Dream Gatus, Dream Traefik, Authentik provider, DNS record, TLS
certificate, public route, Flask process, transitional auth-writer,
operational canonical database or `../PRG32` file was changed. No operational
backup was deleted or transferred off-device. Temporary mutable data was kept
under disposable `/tmp` roots.

## 3. Protected state

The following state remains protected and was not reinitialized:

- `.local/operational/` and `.local/operational-m543/`;
- canonical SQLite and immutable cartridge objects;
- administrator, federation user, OIDC/SAML mappings and provider data;
- backup archives and the external key registry;
- setup completion and SMTP configuration;
- Flask databases and objects;
- transitional auth-writer state;
- Authentik resources and Dream shared infrastructure;
- existing public routing and prior modernization reports.

The repository already contained unrelated dirty and untracked files from
earlier milestones. They were preserved. M5.4.17 added only this report.

## 4. Operational baseline

Read-only runtime inspection found the local operational pair running healthy:

- `prg32-local-operational-fastify-1` — healthy, local port `15080`;
- `prg32-local-operational-next-1` — healthy, local port `13000`.

The application probes returned:

| Probe | Result |
| --- | --- |
| Fastify `/health` | HTTP 200 |
| Fastify `/ready` | HTTP 200; database, canonical storage and writer lease available |
| Fastify `/api/multiplayer/status` | HTTP 200; zero rooms, maximum 8 peers, auth enabled |
| Next.js `/health` | HTTP 200 |
| Next.js `/api/games` proxy | HTTP 200 |
| Fastify catalog `/api/games` | HTTP 200 |
| Synthetic cartridge metadata | HTTP 200 |
| Synthetic cartridge download | HTTP 200, `application/octet-stream`, 593 bytes |
| SMTP configuration presence | configured names present; no message sent |

The catalog fixture was the existing synthetic `org.example.m547.local`; no
private user or credential data was printed.

The previously verified operational backup-v4 evidence remains:

| Field | Value |
| --- | --- |
| Backup ID | `8ec8d294-cb9b-425e-8f50-2cb68060132f` |
| Bytes | `644251` |
| SHA-256 | `d04aff2586191a24fb3aa26ff5476c81a5d8a01d017e70e4ded3db3a2d39f335` |
| Key ID | `key-20261015-01` |
| State | complete and verified |

Public routing was not changed. The previously observed unauthenticated roots
remain `store.prg32.dream.test` HTTP 200, `api.prg32.dream.test` HTTP 200 and
`sso.dream.test` HTTP 302.

## 5. Backup automation verification

The existing
`deploy/operations/backup/prg32-backup.mjs` wrapper remains the only portable
automation layer. No replacement backup system was created.

Focused review confirmed:

- source, destination, key registry and authorization are explicit;
- the destination must already be a safe regular directory;
- the external key registry is never embedded in the archive;
- backup-v4 encryption and authenticated verification remain authoritative;
- the destination lock and canonical writer lease are both respected;
- archive creation uses `.incoming` staging and atomic rename;
- completion markers are published last;
- completed archives cannot be overwritten;
- failed partial output is cleaned up;
- SHA-256 is streamed and recorded as non-secret evidence;
- retention is calendar-aware, dry-run by default and deletion-gated;
- transferred evidence is explicit and does not claim off-device separation.

`node --test deploy/operations/backup/prg32-backup.test.mjs` passed all three
focused tests.

## 6. Off-device destination status

No operator-approved off-device destination is present in the PRG32-owned
configuration or environment. No mounted volume, NAS, SSH host or cloud
account was inferred to be approved merely because it exists.

Therefore:

**`OFF_DEVICE_BACKUP_DESTINATION_REQUIRED`**

The activation inputs still required are:

1. destination type and operator-controlled endpoint or mount;
2. documented failure-domain separation from the application host;
3. transfer identity and external secret-injection method;
4. external backup key-registry custody and recovery procedure;
5. backup schedule, maintenance window and retention owner;
6. destination checksum and independent restore-test target;
7. explicit approval for transfer and deletion semantics.

The disposable destination used in this milestone is not evidence of off-device
recovery.

## 7. Disposable backup acceptance

A new synthetic canonical root and disposable key registry were created. The
real wrapper invoked the existing CLI and backup-v4 implementation.

| Check | Result |
| --- | --- |
| Encrypted backup creation | PASS |
| Authenticated independent verification | PASS |
| Archive completion marker | PASS |
| Archive bytes | `482338` |
| Archive SHA-256 | `b696fff79f62d3449108c7ac92474dbf70f4e84a196c27c3c4cfcaca698e8522` |
| Disposable backup ID | `444c9d70-9d19-4970-904f-9b8b0191a89f` |
| Transfer marker | PASS |
| Calendar retention dry-run | PASS; newest archive protected |
| Fresh-root restore | PASS; state `completed` |
| Restore operation ID | `793c1f9c-3901-42be-8f20-285e5a4b9e50` |
| SQLite/object restoration | PASS through backup-v4 restore |
| `.incoming` cleanup | PASS; no partial files remained |

Prior M5.4.16 disposable tests also verified refusal of missing key,
missing destination, duplicate archive, active writer lease and unauthorized
retention deletion. No operational archive was used for destructive testing.

## 8. Monitoring integration readiness

`deploy/operations/monitoring/monitoring.example.yaml` parses with the
available Ruby YAML parser and contains five endpoints:

- Fastify health;
- Fastify readiness;
- Next.js health;
- public Store HTTPS and certificate expiry;
- public API HTTPS and certificate expiry.

The example contains no credentials, provider configuration, Dream-specific
origin, recipient or mandatory service. Backup age, verified-backup state,
disk capacity, restart loops and single-writer state remain host/job checks;
they are not exposed through public readiness.

The existing `dream-gatus-gatus-1` container is present with image
`ghcr.io/twin/gatus:v5.36.0`. Its existing startup configuration validates five
endpoints and explicitly reports alerting as unconfigured. Its config bind
mount is read-only. No Gatus file, endpoint, alert recipient or shared state
was modified.

Therefore:

**`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**

No real alert delivery was tested or claimed.

## 9. Isolated application probes

The available local operational ports were used without restarting or changing
containers:

| Surface | Result |
| --- | --- |
| Fastify health | 200 |
| Fastify readiness | 200 |
| Multiplayer status | 200 |
| Next.js health | 200 |
| Next.js backend-neutral API proxy | 200 |
| Canonical catalog | 200 |
| Cartridge metadata | 200 |
| Cartridge download | 200, 593 bytes |
| SMTP behavior | not exercised; configuration presence only |

No browser federation login or mutating HTTP request was performed.

## 10. Rollback policy status

The existing state-aware policy remains unchanged:

- State A: legacy/Flask remains authoritative before a routing switch;
- State B: a simulated switch can be rolled back before canonical writes;
- State C: post-write blind rollback is blocked and forward-fix preserves
  canonical writes.

Forward-fix remains the recommended strategy, but recommendation is not
operator approval. A post-write rollback could lose writes accepted by
Fastify unless those writes are reconciled or explicit data loss is accepted.
No reverse migration was implemented.

Therefore:

**`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**

## 11. Exact operator inputs

Before activation, the operator must provide and approve:

1. **Backup destination:** filesystem path or endpoint, failure domain,
   transfer identity and secret-injection mechanism.
2. **Key custody:** location, access method and recovery procedure for the
   external key registry.
3. **Backup operations:** schedule, retention owner, transfer verification,
   restore-test target and deletion approval.
4. **Monitoring:** system owner, Store/API origins, internal probe reachability,
   thresholds, alert recipients and an alert-delivery test window.
5. **Rollback:** forward-fix versus reconciliation/data-loss decision after
   any post-cutover write.
6. **Cutover:** explicit maintenance window, traffic owner, writer handover
   owner, abort authority and recovery owner.

No value is invented in the repository for these inputs.

## 12. Final activation sequence

The following is the exact sequence to run only after the preceding inputs are
approved.

### A. Prepare and verify the destination

1. Provision the operator-approved destination and external key-registry
   custody.
2. Set explicit `PRG32_BACKUP_SOURCE`, `PRG32_BACKUP_DESTINATION`,
   `PRG32_BACKUP_KEY_REGISTRY` and `PRG32_BACKUP_AUTHORIZATION` values through
   the approved secret mechanism.
3. Run the wrapper in dry-run mode.
4. Run `create`, then `verify`, and compare the destination SHA-256.
5. Record transfer evidence with `mark-transferred`.
6. Run retention dry-run; apply only after the separately approved deletion
   confirmation.
7. Restore into a new independent recovery root and complete SQLite/object
   verification.

### B. Prepare activation evidence

1. Confirm Fastify `/health`, `/ready`, catalog, metadata, download and
   multiplayer status.
2. Confirm Next.js `/health` and the `/api` proxy.
3. Confirm the approved external monitor sees health, readiness, HTTPS/TLS and
   backup checks.
4. Verify the writer owner is singular and the legacy source snapshot is
   unchanged.

### C. Cutover gate

Only a later explicitly authorized activation may switch public ownership.
Before that switch, record the maintenance window, abort owner, recovery point,
writer handover owner and approved post-write rollback policy.

### D. Abort conditions

Abort immediately if any of the following occurs:

- no independently verified backup or restore target;
- destination checksum mismatch or incomplete transfer marker;
- writer lease is unavailable or more than one writer is possible;
- Fastify/Next health, readiness, catalog, download or WebSocket checks fail;
- authentication/session continuity is not approved;
- monitoring cannot deliver or record the approved alert;
- the rollback decision is still ambiguous;
- any step would require modifying shared infrastructure outside the approved
  window.

### E. Recovery procedure

Preserve the last verified archive, stop new writes through the approved
single-writer control, isolate the faulty workflow, restore or reconcile only
in a fresh target, and apply forward-fix after evidence review. Do not silently
restart Flask as a post-write rollback and do not permit simultaneous writers.

## 13. Validation results

Node.js 24 was selected using `source "$HOME/.nvm/nvm.sh"; nvm use 24`.

| Command/check | Result |
| --- | --- |
| Backup wrapper focused tests | PASS — 3 tests |
| Wrapper syntax checks | PASS |
| Disposable backup create/verify/mark/retention/restore | PASS |
| Monitoring YAML parse | PASS — 5 endpoints via Ruby YAML |
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| CLI typecheck | PASS |
| Standalone Compose config | PASS with explicit placeholders |
| Operational Compose config | PASS with explicit placeholders |
| Standalone + Dream overlay config | PASS with explicit placeholders |
| Isolated local application probes | PASS |
| `git diff --check` | PASS |

No Docker restart, prune, volume operation, scheduler installation or shared
monitoring mutation was executed.

## 14. Files changed

M5.4.17 added exactly one repository file:

- [docs/modernization/145-operational-activation-gates-m5-4-17.md](/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/docs/modernization/145-operational-activation-gates-m5-4-17.md)

The backup wrapper, focused tests, monitoring example and rehearsal used here
were created in M5.4.16 and were not replaced. Disposable roots and command
outputs were outside the repository. No additional Markdown, JSON or CSV
evidence file was created for M5.4.17.

## 15. Final readiness matrix

| Gate | Status |
| --- | --- |
| Fastify local operational health | GO |
| Next.js local operational health | GO |
| Canonical storage/readiness | GO |
| Existing encrypted backup verification | GO |
| Backup wrapper | GO |
| Disposable backup and restore | GO |
| Calendar retention dry-run | GO |
| Approved off-device destination | NO-GO — `OFF_DEVICE_BACKUP_DESTINATION_REQUIRED` |
| Monitoring example syntax | GO |
| External alert delivery | NO-GO — `EXTERNAL_MONITORING_APPROVAL_REQUIRED` |
| Isolated catalog/metadata/download/proxy probes | GO |
| Multiplayer status compatibility | GO |
| Post-write rollback policy | NO-GO — `POST_WRITE_ROLLBACK_DECISION_REQUIRED` |
| Public routing change | NOT PERFORMED |
| Operational cutover | NO-GO |
| Flask retirement | NO-GO |

## 16. Final decision

**`M5417_ACTIVATION_PREPARATION_GO`**

All currently authorized technical activation checks pass. The result does not
authorize public ownership change or Flask retirement because destination,
monitoring and post-write rollback decisions still require explicit operator
approval.

The next authorized phase should be the actual operational activation/cutover
window after those decisions are recorded. It should not introduce another
generic readiness audit.

```text
M5417_ACTIVATION_PREPARATION_GO
OFF_DEVICE_BACKUP_DESTINATION_REQUIRED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
