# PRG32 Cartridge Store — M5.4.15 Final Pre-Cutover Operator Decisions

Date: 2026-10-15

## 1. Executive summary

M5.4.15 is **`M5415_PRECUTOVER_PREPARATION_GO`**.

All preparation that can be completed safely without operator choices is now
documented and validated. The canonical Fastify/SQLite/filesystem authority is
healthy locally, the standalone topology remains exactly two application
services, the existing encrypted backup verifies, and no public routing or
operational data was changed.

The multiplayer contract is classified **`MULTIPLAYER_CONTRACT_COMPATIBLE`**.
The firmware and legacy Flask implementations define `signature` as a
cartridge-level grouping identifier, not as a private-room secret or persisted
board ACL. Fastify preserves that behavior. Arbitrary authenticated joins are
therefore a documented product property and abuse consideration, not silently
described as board authorization.

Preparation GO does not authorize cutover. These remain open:

- `OFF_DEVICE_BACKUP_DESTINATION_REQUIRED`
- `EXTERNAL_MONITORING_APPROVAL_REQUIRED`
- `POST_WRITE_ROLLBACK_DECISION_REQUIRED`
- final public routing and single-writer handover authorization

Always:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Authorization boundary

This phase performed read-only runtime checks, source/documentation inspection,
configuration validation with placeholders, backup verification and report
preparation. It did not create production identities, rotate credentials,
transfer archives, delete archives, install a scheduler, change Gatus, change
Dream infrastructure, modify Authentik, stop Flask, restart application
containers, switch routing or migrate university data.

The sibling `../PRG32` repository was inspected read-only. No file in that
repository was changed. No commit or push was performed.

## 3. Protected state

The following state remains protected and unchanged:

- `.local/operational/` and `.local/operational-m543/`;
- canonical SQLite and immutable cartridge objects;
- existing administrator, federation user, OIDC/SAML mappings and providers;
- backup-v4 archives and external key registry;
- completed setup state and SMTP configuration;
- Flask databases, Flask objects and transitional auth-writer state;
- Authentik resources and existing public routing;
- modernization reports from prior milestones.

No operational canonical write was performed by M5.4.15.

## 4. Baseline health

The read-only baseline passed:

| Check | Result |
| --- | --- |
| Node.js / pnpm | Node `v24.20.0`, pnpm `12.5.1` via `nvm use 24` |
| Fastify container | healthy |
| Next.js container | healthy |
| Fastify `/ready` | HTTP 200; database, storage and writer lease available |
| Multiplayer status | HTTP 200; auth enabled, zero rooms, maximum 8 peers/room |
| Existing backup-v4 | verified complete |
| Backup ID | `8ec8d294-cb9b-425e-8f50-2cb68060132f` |
| Backup size | 644251 bytes |
| SQLite/database state | previously verified `integrity_check=ok`, FK violations 0 |
| Public Store root | `store.prg32.dream.test` returned HTTP 200 |
| Public API root | `api.prg32.dream.test` returned HTTP 200 |
| SSO root | `sso.dream.test` returned HTTP 302 |

The public observations were low-volume unauthenticated GET requests only.
They confirm current routing behavior, not Fastify public ownership.

## 5. Multiplayer authorization contract

The source-backed contract is consistent across Fastify, Flask and the PRG32
firmware documentation:

1. A cartridge opts into multiplayer with
   `prg32_multiplayer_join(signature, flags)`.
2. The signature is a short path-safe ASCII identifier, up to 47 characters.
3. Peers see state only when they join the same signature.
4. The protocol consists of `join`, `state` and `leave`, with `welcome`,
   `peer`, `leave` and stable error responses.
5. Neither implementation persists room membership or board permissions.
6. The legacy Flask hub authenticates at join using configured/API users and
   applies the same player-role gate.
7. Fastify authenticates canonical API tokens and retains legacy
   `PRG32_USERS` compatibility.
8. Room state is process-local and bounded to eight peers by default.

Room signatures are therefore grouping identifiers, not authorization secrets.
The public documentation promises isolation between different cartridge
signatures, but does not promise private rooms, ownership, invitations or
per-board ACLs. Adding an ACL would require a new product and authorization
contract and could change existing firmware behavior; it is not introduced
here.

## 6. Multiplayer compatibility decision

Decision: **`MULTIPLAYER_CONTRACT_COMPATIBLE`**.

Evidence:

- `README.md`, `docs/api.md` and the PRG32 firmware manual describe
  cartridge-level grouping by signature.
- `cartridge_store/multiplayer.py` and `backend/src/multiplayer/hub.ts` both
  group peers by signature and do not consult a board-permission store.
- `backend/tests/multiplayer-differential.test.ts` compares the legacy and
  Fastify room protocol.
- Existing Fastify tests verify authentication failure, room isolation,
  capacity, state relay and cleanup.

Current abuse considerations are explicit:

- any authenticated principal satisfying the existing player-role gate can
  attempt arbitrary valid signatures;
- there is no per-IP WebSocket rate limiter or persistent room ownership;
- payload size is bounded at 64 KiB and room capacity defaults to eight peers;
- room state is single-process and external edge connection limits remain an
  operational responsibility;
- `user` and `player` currently share the same numeric multiplayer threshold.

These are compatibility/design properties. If the product later requires
private boards, invitation-only rooms or board ownership, the smallest safe
next step is a separately authorized protocol/RBAC design milestone. No ACL is
to be inferred from a signature and no current room should be called private.

## 7. Off-device backup destination matrix

No destination is selected by this report.

| Option | Complexity | Recovery independence | Key custody | Linux portability | Decision status |
| --- | --- | --- | --- | --- | --- |
| Operator-mounted external disk | Low | Low to medium; depends on physical separation and custody | External registry stored separately from disk when possible | High | Operator choice |
| Operator-mounted NAS/remote filesystem | Medium | Medium to high, subject to NAS availability | Mount credentials supplied by operator; registry remains separately controlled | High with NFS/SMB/SFTP mount policy | Operator choice |
| Operator-controlled remote server over SSH/SFTP/rsync | Medium to high | High when independently hosted | SSH key/credential handled by operator; encrypted transport and separate registry | High | Operator choice |
| Operator-approved object storage transfer | High | High if account and region are independent | Provider credentials supplied externally; application remains cloud-agnostic | Depends on transfer tool | Operator choice; not required |

Minimum inputs required to activate a real destination:

1. Destination type, owner, mount/endpoint and filesystem path.
2. Transfer identity and secret-injection method, with no credentials in Git.
3. External key-registry custody and recovery procedure.
4. Retention owner and approval for deletion semantics.
5. Daily schedule, maintenance window and failure escalation.
6. Destination checksum mechanism and independent restore-test target.
7. Confirmation that the destination is not the same failure domain as the
   application host.

The recommended default for a self-hosted Linux installation is an
operator-controlled remote server over authenticated encrypted transport,
provided the operator already owns and monitors that server. This is a
recommendation only, not an approval or configuration change. A mounted disk
or NAS remains valid when physical custody and failure-domain separation are
documented.

## 8. Backup operating contract

The existing encrypted and authenticated backup-v4 CLI remains authoritative:

```text
prg32-store backup create --source <canonical-root> \
  --output <temporary-destination/archive.backup4> \
  --key-registry <external-key-registry>

prg32-store backup verify --archive <temporary-destination/archive.backup4> \
  --key-registry <external-key-registry>

prg32-store backup restore --yes \
  --archive <verified-archive.backup4> \
  --target <fresh-recovery-root> \
  --key-registry <external-key-registry>
```

Portable operating procedure:

1. Quiesce canonical writes under the approved single-writer procedure.
2. Create the archive with explicit source, temporary output and external key
   registry paths.
3. Verify the archive locally before any transfer.
4. Transfer only the encrypted archive over the operator-approved transport.
5. Verify destination size and checksum independently.
6. Publish the completed destination file atomically; never overwrite a
   completed archive.
7. Apply remote retention only after a dry-run and explicit deletion approval.
8. Keep key material outside the archive and avoid co-locating all recovery
   keys with the only archive copy.
9. Alert on creation, verification, transfer or retention failure.
10. Restore only into a fresh target and run SQLite, object and canonical
    integrity verification before considering recovery complete.
11. Perform a quarterly fresh-root restore drill.
12. Retain archive ID, timestamps, size, checksum, verification result and
    restore-drill evidence as audit records without recording secrets.

The policy target remains daily creation, pre-change backups, seven daily,
four weekly and three monthly copies, RPO 24 hours, RTO 4 hours and quarterly
restore verification. No scheduler or remote transfer was installed.

## 9. Monitoring decision package

### Internal checks

The application and container checks remain:

- Fastify `/health` for process availability;
- Fastify `/ready` for database, canonical storage and writer lease;
- Next.js `/health` for frontend availability;
- Docker healthchecks for local process supervision.

Readiness details remain private and must not be exposed through public
unauthenticated routing.

### External checks

An external monitor should probe the approved public Store/API origins,
including HTTP/TLS status, and separately verify the `wss://` upgrade path
without using credentials in monitoring configuration.

### Backup and infrastructure checks

Monitor backup age and last verified archive, destination checksum, disk
capacity, container restart loops, TLS expiry, OIDC/SAML discovery or callback
availability, SMTP relay availability and sustained HTTP 5xx rates.

### Operator choices

| Choice | Benefit | Tradeoff |
| --- | --- | --- |
| Existing external monitoring | No new application service; aligns with current operations | Requires existing ownership and integration |
| Gatus or equivalent | Simple declarative HTTP/TLS checks | Must be operated and alerted independently |
| Generic host monitoring | Covers disk, process and restart signals | Needs application-specific probes added |
| Managed monitoring | Off-host alerting and escalation | External cost, credentials and provider dependency |

Recommended default: use the operator’s existing external monitoring if it can
cover HTTP/TLS, Docker/host and backup signals; otherwise add Gatus or an
equivalent external monitor without adding a mandatory application container.

Required operator inputs:

- monitoring system and owner;
- monitored Store/API origins and internal probe reachability;
- alert recipients and escalation path;
- warning/critical thresholds and maintenance windows;
- certificate and federation/SMTP ownership;
- test window for actual alert delivery.

Alert delivery remains unconfigured and unverified:
**`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**.

## 10. Post-write rollback decision matrix

| Option | Preconditions and steps | Consistency/data impact | Recovery profile | Approval |
| --- | --- | --- | --- | --- |
| Forward fix | Keep Fastify sole writer, stop or isolate the faulty workflow, repair forward, verify backup and health | Preserves canonical writes; safest after writes | Usually lowest operational risk | Recommended default, not approved here |
| Explicit reconciliation | Stop new writes, inventory post-switch canonical writes, map/export them into the legacy-compatible model, verify both sides, then choose owner | Risk of mapping gaps, duplicates or rejected writes; no reverse migration exists | Longer maintenance window and manual audit | Requires explicit operator and data-owner approval |
| Explicit accepted data loss | Stop Fastify writer, preserve canonical archive, return traffic to Flask, declare the post-switch write interval lost | Loses writes after the selected legacy snapshot; must be recorded | Potentially fastest but highest data impact | Requires explicit written acceptance; not approved |

State handling:

- **State A — before routing handover:** Flask remains authoritative; discard
  only disposable candidates.
- **State B — after handover, before canonical writes:** return routing only
  after verifying writer ownership, health, backup and state.
- **State C — after canonical writes:** never blindly restart Flask. Quiesce
  Fastify, preserve canonical evidence, reconcile or apply an explicitly
  approved loss policy, and establish exactly one writer.

Safest default: **forward fix**. It avoids reverse migration and preserves the
most information. This report does not approve it, reconciliation or data
loss on behalf of the operator.

## 11. Public handover checklist

This is an executable checklist only; it was not executed.

- [ ] Final cutover authorization and named operator.
- [ ] Approved maintenance window, contacts and escalation channel.
- [ ] Snapshot current public routing for `store.prg32.dream.test` and
      `api.prg32.dream.test`.
- [ ] Preserve a legacy Flask snapshot and verify it unchanged.
- [ ] Create and verify canonical encrypted backup-v4.
- [ ] Transfer and independently verify the approved off-device copy.
- [ ] Verify key-registry recovery without exposing key material.
- [ ] Quiesce legacy writers and confirm single-writer ownership.
- [ ] Record the exact routing change sequence and abort thresholds.
- [ ] Verify Fastify health/readiness and Next.js health.
- [ ] Verify local administrator login, OIDC login and SAML login.
- [ ] Verify firmware catalog listing, detail, media and download contracts.
- [ ] Verify cartridge publishing, review and administrative workflow.
- [ ] Verify SMTP delivery through the approved relay.
- [ ] Verify multiplayer join, relay, reconnect and rejection boundaries.
- [ ] Verify metrics, runs, scores and scoreboard compatibility.
- [ ] Verify monitoring alerts by an actual test event.
- [ ] Observe the system for the approved stabilization window.
- [ ] Apply state-aware rollback decision if an abort threshold is reached.
- [ ] Preserve Flask, legacy databases and recovery evidence after handover.

No item in this checklist changed public routing or stopped Flask.

## 12. Final blocker classification

| Item | Classification | Evidence/impact | Owner/action | Blocks cutover? |
| --- | --- | --- | --- | --- |
| Off-device backup destination | `OPERATOR_DECISION` | No destination is approved; no independent recovery copy exists | Operator selects type, failure domain and custody; perform restore drill | Yes |
| Scheduler and retention owner | `OPERATOR_DECISION` | CLI contract exists; no scheduler or deletion authority is installed | Operator assigns scheduler/retention owner and approval workflow | Yes |
| External monitoring/alert delivery | `EXTERNAL_DEPENDENCY` | Health contracts exist; alert recipients and delivery are unconfigured | Operator supplies monitor, recipients, thresholds and test window | Yes |
| Multiplayer board privacy | `DEFERRED_NONCRITICAL` | Legacy/Firmware contract has grouping, not private-room ACLs | Product owner accepts public grouping or authorizes a future ACL design | Only if private boards are required |
| Arbitrary authenticated room joins | `DEFERRED_NONCRITICAL` | Compatible behavior; no per-IP WS limiter, but auth, payload and room limits exist | Operator accepts risk or authorizes dedicated abuse-control work | No under current classroom contract |
| Post-write rollback policy | `OPERATOR_DECISION` | State C cannot safely fall back by restarting Flask | Operator selects forward fix, reconciliation or accepted loss | Yes |
| Public routing switch | `CUTOVER_AUTHORIZATION` | Current public roots still show transitional ownership | Named operator authorizes Traefik/DNS/TLS procedure | Yes |
| Single-writer handover | `CUTOVER_AUTHORIZATION` | Fastify lease works locally; real ownership switch was not run | Operator schedules quiescence and verifies writer ownership | Yes |
| Production credential/key custody | `EXTERNAL_DEPENDENCY` | Local evidence uses protected local custody only | Operator supplies production secret/key provider and recovery test | Yes |
| mDNS/multi-replica scaling | `DEFERRED_NONCRITICAL` | mDNS is optional; room state is single-process | Defer until deployment requires it; use one replica or explicit design | No for single-instance cutover |

No `TECHNICAL_DEFECT` remains in the reviewed pre-cutover preparation scope.

## 13. Final readiness matrix

| Gate | Status |
| --- | --- |
| Two-service standalone architecture | PASS |
| Dream independence | PASS by Compose contract; Dream remains optional |
| Fastify/Next local health | PASS |
| Canonical storage and writer lease | PASS |
| Existing encrypted backup verification | PASS |
| Multiplayer protocol compatibility | `MULTIPLAYER_CONTRACT_COMPATIBLE` |
| Backup operating procedure | PREPARED |
| Off-device destination | NOT SELECTED |
| Monitoring design | PREPARED |
| Alert delivery | NOT CONFIGURED |
| Rollback decision matrix | PREPARED; State C approval open |
| Public handover checklist | PREPARED, NOT EXECUTED |
| Public routing authorization | OPEN |
| Operational cutover | `NO-GO` |
| Flask retirement | `NO-GO` |

## 14. Tests executed

Node.js 24 was selected with `nvm use 24`.

Passed:

- `pnpm --dir backend run typecheck`
- `pnpm --dir backend run lint`
- `pnpm --dir frontend run typecheck`
- `pnpm --dir frontend run lint`
- `pnpm --dir cli run typecheck`
- `pnpm --dir cli run lint`
- `docker compose -f deploy/standalone/compose.yaml config --quiet`
- `docker compose -f deploy/operational/compose.yaml config --quiet` using
  non-secret placeholders
- `docker compose -f deploy/standalone/compose.yaml -f deploy/integrations/dream/compose.local-persistent.yaml config --quiet`
- backup-v4 independent verification of the existing protected archive
- read-only Fastify `/ready` and multiplayer status checks
- low-volume public GET observations for Store, API and SSO roots
- `git diff --check`

No application source, test or deployment behavior was changed in M5.4.15;
therefore the full suites were not repeated. M5.4.14 already recorded the
serial full-suite evidence: backend 56 files/278 tests, frontend 22 files/65
tests, CLI 5 files/9 tests and Python 64 tests.

## 15. Files changed

Created exactly one new modernization report:

- `docs/modernization/143-final-precutover-operator-decisions-m5-4-15.md`

No source, test, Compose, Dockerfile, database, operational data, shared
infrastructure or sibling-repository file was changed by M5.4.15. Existing
dirty files and prior untracked reports were preserved.

## 16. Exact operator inputs required

Before cutover authorization, obtain and record:

1. Backup destination type, endpoint/mount, owner and failure-domain evidence.
2. Transfer credentials mechanism and external key-registry custody/recovery.
3. Backup scheduler, retention approver and quarterly restore-drill owner.
4. Monitoring platform, origins, recipients, escalation and thresholds.
5. Explicit multiplayer decision: grouping-only semantics or future private
   board authorization.
6. Post-write rollback choice and accepted data-loss boundary, if any.
7. Maintenance window, named operator contacts and public routing authorization.
8. Single-writer quiescence procedure and final ownership sign-off.
9. Production secret/session continuity and federation provider custody.

## 17. Final decision

```text
M5415_PRECUTOVER_PREPARATION_GO
MULTIPLAYER_CONTRACT_COMPATIBLE
OFF_DEVICE_BACKUP_DESTINATION_REQUIRED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The preparation package is complete. The remaining gates are operator,
external-dependency and cutover-authorization decisions, not unresolved
application defects. This GO does not authorize public ownership handover.

## 18. Recommended next authorized phase

Authorize a separate operator-led cutover rehearsal only after the inputs in
section 16 are supplied. That phase may execute the checklist in a controlled
maintenance window, but must still preserve Flask until backup, monitoring,
single-writer ownership, federation continuity and state-aware rollback are
accepted. Any real routing switch or Flask retirement requires explicit
authorization beyond this report.
