# PRG32 Cartridge Store — M5.4.14 Final Local Operational Gate Closure

Date: 2026-10-15

## 1. Executive summary

M5.4.14 is **`M5414_LOCAL_TECHNICAL_GATES_PARTIAL`**.

The safe technical work was completed without changing public routing,
Authentik, Traefik, Flask, operational ownership, or the canonical operational
database. The local Fastify/Next.js runtime remained healthy. A disposable
restored canonical root was used to provision a least-privilege `player`
identity through the supported administration and token APIs. That identity
successfully joined a multiplayer room, relayed state, and was rejected after
token revocation. Anonymous and invalid/revoked credentials were rejected.

The previously failing CLI Docker-network acceptance passed on rerun and the
full CLI check passed. Backup-v4 automation, retention safety, monitoring and
rollback contracts were reviewed and prepared. No approved off-device backup
destination, external alert delivery, or post-write rollback policy exists.

The multiplayer contract currently authorizes a player by role, not by a
persisted per-board ACL. Therefore cross-board denial cannot be claimed as an
implemented guarantee; this remains an explicit compatibility/product decision
before cutover. No privilege-model redesign was introduced in this milestone.

Always:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Authorization boundary

Only PRG32-owned code, tests and disposable roots were inspected or changed.
The real Dream infrastructure was observed only through low-volume,
non-mutating GET/HEAD-style checks. No POST, login, provider administration,
DNS/TLS change, public router change, Authentik change, Flask restart, or
operational ownership switch was performed.

The disposable authenticated multiplayer test used a fresh restore of the
existing backup-v4 archive. The player account and API token were created via
the normal Fastify administrative/authentication interfaces inside that
disposable target. No SQLite row was inserted directly and no credential or
token is recorded here.

## 3. Protected state

The operational root, legacy databases, immutable objects, existing federation
providers and identity mappings, Authentik resources, and existing encrypted
archives were preserved. The live Fastify and Next.js containers were not
recreated by this milestone.

Read-only baseline evidence:

| Invariant | Result |
| --- | --- |
| Fastify /ready | HTTP 200; database, canonical storage and writer lease available |
| Fastify multiplayer status | HTTP 200; authentication enabled; zero rooms |
| Fastify and Next.js containers | healthy; restart count remained 0 |
| SQLite integrity | `ok` |
| Foreign-key violations | 0 |
| Storage metadata | schema 2, layout 2, journal 1, backup format 3, state `ready` |
| Setup state | `INSTALLATION_COMPLETE` |
| Users | 2 operational users, including 1 administrator |
| Federation | 2 providers, 2 external identities, 1 encrypted provider secret |
| Catalog | 1 cartridge, 1 release |
| Telemetry | 1 run, 2 samples, 1 score |
| Publishing | 1 submission, 1 submission artifact |

The public non-authenticated roots remained observable as `200` for
`store.prg32.dream.test` and `api.prg32.dream.test`, and `302` for
`sso.dream.test`. Public `/health` and `/ready` were not exposed through the
current transitional public routing. These observations do not constitute a
cutover claim.

## 4. Baseline health

The existing encrypted archive
`.local/operational/backups/m5413-pre-recreate.backup4` was independently
verified again as complete. Its backup ID, byte count and SHA-256 matched the
M5.4.13 evidence. A fresh disposable restore used for multiplayer acceptance
completed successfully before the disposable account was provisioned.

The operational canonical root was not used as a write target for the
multiplayer test. Disposable account and token mutations remained confined to
`.local/operational/restore-tests/m5414-ws-restore`.

## 5. Multiplayer authentication contract

The actual Fastify contract is:

1. Canonical persisted API tokens are resolved by token hash and joined to the
   canonical user record.
2. A token can be supplied through the WebSocket `Authorization: Bearer`
   header, `x-prg32-token`, query `token`, or the join message token fields.
3. When authentication is enabled, a join requires an authenticated principal
   whose role is at least `player` according to the existing role ordering.
4. Invalid, missing, disabled, suspended, banned or revoked credentials fail
   with the stable `player role required` error.
5. `PRG32_USERS` remains a legacy compatibility path, but the operational
   canonical runtime did not require or configure it.
6. Token revocation is enforced by the canonical token lookup on subsequent
   connections.

The role implementation currently assigns `user` and `player` the same numeric
authorization level for the multiplayer gate. This is an existing
compatibility/design boundary, not a change made here. The current room
signature is a routing/grouping identifier; there is no persisted board ACL
that can deny an otherwise valid player from joining a different signature.
Administrators are not granted a special multiplayer bypass by this test.

## 6. Positive WSS acceptance

The supported disposable API flow succeeded:

- existing disposable administrator session authenticated;
- a synthetic `player` identity was created through `POST /api/admin/users`;
- the player authenticated through `/auth/login`;
- a token was created through `POST /auth/tokens`;
- two authenticated WebSocket peers joined the same room;
- state was relayed between peers;
- the token was revoked through `DELETE /auth/tokens/:token_id`;
- a new connection using the revoked token was rejected;
- an anonymous connection was rejected;
- the token was never printed or persisted in the report.

The existing synthetic TLS-edge test also passed its authenticated WSS upgrade,
join and relay boundary in `tests/edge-federation.test.ts`. This provides
transport-level WSS evidence. The new disposable API-provisioning probe
provides canonical identity and revocation evidence over the direct local
Fastify socket. A single combined API-provisioned identity-through-TLS-edge
scenario was not added because the current milestone does not authorize a
runtime or routing change.

Cross-board authorization is **not verified**: the current contract has no
board ACL to exercise. This is recorded as a compatibility/product decision,
not hidden as a successful security control.

## 7. Multiplayer compatibility findings

The positive path does not depend on `PRG32_USERS`; canonical API tokens are
sufficient for a supported `player` identity. The legacy configuration remains
available for firmware/tool compatibility and was not removed.

The smallest safe conclusion is:

- canonical token authentication: supported and verified in a disposable root;
- role gate and revocation: supported and verified;
- administrator privilege inheritance: no separate bypass observed;
- per-board authorization: absent from the current contract;
- firmware protocol shape: unchanged (`join`, `state`, `leave`, room signature
  and player ID fields remain compatible).

No role-model or schema redesign is authorized as part of M5.4.14. Before an
operational cutover, the operator/product owner must decide whether room
signatures are intentionally open to every authenticated player or whether a
future board-permission milestone is required.

## 8. CLI Docker timeout root cause

The exact previously failing test was:

```text
pnpm --dir cli exec vitest run tests/integration/docker-network.test.ts --reporter verbose
```

The first historical failure occurred while waiting for the disposable
Fastify container to become ready within the finite 60-second deadline. Its
failure cleanup removed the disposable container and network before a useful
post-failure inspection could be collected. The failure therefore cannot be
attributed conclusively to a Fastify crash, a bad readiness endpoint, or a
Docker network defect.

The controlled rerun passed in approximately 13 seconds, and a second rerun
after the diagnostic change passed in approximately 12 seconds. The available
evidence classifies the original event as transient or unreproducible Docker
startup contention/diagnostic loss, not a deterministic application failure.
No timeout was increased and no arbitrary sleep was introduced.

## 9. CLI remediation

`cli/tests/integration/docker-network.test.ts` now retains the same bounded
progress-based polling and, on timeout, collects sanitized:

- elapsed startup time;
- Docker container state and exit information;
- relevant stdout/stderr logs;
- redaction of token, secret and password assignments.

The test continues to clean up only its own disposable resources. It does not
prune unrelated Docker images, containers, networks, volumes or build cache.

## 10. CLI Docker acceptance

The recovered acceptance passed:

```text
1 test file passed
1 test passed
```

The full CLI check also passed:

```text
5 test files passed
9 tests passed
typecheck passed
lint passed
build passed
```

The acceptance covered disposable network creation, Fastify startup and
readiness, private Docker DNS, synthetic HTTPS, authenticated CLI access,
negative authorization behavior, expected exit codes and disposable teardown.

## 11. Backup automation contract

The existing backup-v4 CLI remains the only backup automation boundary. No
second format or service was introduced. The operator contract is:

```text
prg32-store backup create --source <canonical-root> \
  --output <destination/archive.backup4> \
  --key-registry <external-key-registry>

prg32-store backup verify --archive <destination/archive.backup4> \
  --key-registry <external-key-registry>

prg32-store backup restore --yes --archive <archive.backup4> \
  --target <fresh-disposable-root> \
  --key-registry <external-key-registry>
```

The underlying backend backup-v4 implementation requires explicit paths,
writer quiescence, authenticated encryption, an external key registry, atomic
completion publication, no completed-output overwrite, fresh-target restore
and independent verification. The archive never contains its encryption key.

A future scheduler/transfer wrapper must require explicit source,
destination and key-registry paths, publish through a temporary destination
followed by an atomic rename where supported, verify the destination checksum,
fail on concurrent writers, and never silently delete or overwrite an archive.
No scheduler, cloud account, Dream-specific path or unapproved transfer was
configured.

## 12. Retention safety

The proposed policy remains seven daily, four weekly and three monthly
recovery points, with daily creation, pre-change backups, RPO 24 hours, RTO 4
hours and quarterly fresh-root restore verification.

The existing retention implementation was reviewed and exercised with three
synthetic disposable copies of a verified backup. With `keepNewest=1` and the
explicit authorization
`PRG32_STORAGE_V2_BACKUP_RETENTION_DISPOSABLE`, exactly two disposable copies
were selected and deleted and one valid copy remained. No operational archive
was touched. Dry-run remains the default in the implementation, and deletion
requires explicit authorization.

This is local retention safety evidence, not off-device retention evidence.
`OFF_DEVICE_BACKUP_DESTINATION_REQUIRED` remains open.

## 13. Monitoring preparation

The portable external monitoring contract should check:

| Signal | Alert condition |
| --- | --- |
| Fastify health/readiness | non-200, database/storage unavailable, or writer lease unavailable |
| Next.js health | non-200 or restart loop |
| Backup age/verification | older than the 24-hour RPO or verification failure |
| Disk capacity | warning below 20%; critical below 10% |
| Container restarts | repeated restart or healthcheck failure |
| TLS | warning at 30 days; critical at 7 days |
| OIDC/SAML | discovery, metadata or callback dependency unavailable |
| SMTP | approved relay unavailable |
| HTTP errors | sustained 5xx increase |

The existing private `/ready` contract is suitable for internal monitoring;
its resource details must not be exposed as a public unauthenticated API.
No Dream Gatus configuration or alert recipient was changed. Alert delivery
has not been tested, so monitoring is prepared but not operationally accepted.

Decision: **`EXTERNAL_MONITORING_APPROVAL_REQUIRED`**.

## 14. Rollback policy

The rollback boundary is explicitly three-state:

- **State A — before public routing switch:** Flask remains authoritative; a
  disposable candidate can be discarded without reversing application data.
- **State B — after routing switch, before canonical writes:** routing may be
  returned only after writer ownership, health and backup state are checked.
- **State C — after canonical writes:** never blindly reactivate Flask. Stop
  the new writer, reconcile post-switch writes or apply a separately approved
  data-loss policy, then restore exactly one consistent owner.

Post-write rollback is not a restart operation and no reverse migration was
implemented. The possible data-loss window and the choice between forward
fix, explicit reconciliation or explicitly accepted data loss remain operator
decisions.

Decision: **`POST_WRITE_ROLLBACK_DECISION_REQUIRED`**.

## 15. Final readiness matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Fastify/Next local health | PASS | Healthy containers; `/ready` 200 |
| Canonical SQLite/storage state | PASS | Integrity, FK and metadata checks passed |
| Federation persistence | PASS | Existing providers/mappings remained present |
| Authenticated player provisioning | PASS | Supported disposable admin/token APIs |
| Direct authenticated multiplayer | PASS | Join, relay, revocation and anonymous rejection |
| WSS transport boundary | PASS | Existing synthetic TLS-edge test passed |
| Cross-board authorization | NOT VERIFIED | No board ACL exists in current contract |
| CLI Docker acceptance | PASS | Focused and full CLI checks passed |
| Backup create/verify/restore | PASS | Existing backup-v4 archive verified and disposable restore passed |
| Retention safety | PASS | Disposable authorized apply left newest valid copy |
| Portable backup automation | PARTIAL | Contract prepared; no destination/scheduler installed |
| Off-device backup | BLOCKED | No approved destination |
| Monitoring | PARTIAL | Contract prepared; delivery unconfigured |
| Rollback | PARTIAL | Pre-cutover safe branch documented; post-write policy open |
| Public routing handover | NOT AUTHORIZED | No routing change performed |
| Flask retirement | NO-GO | Flask remains authoritative transitionally |

## 16. Tests executed

All Node commands used Node.js 24 through `nvm use 24`.

Passed:

- `pnpm --dir backend run typecheck`
- `pnpm --dir backend run lint`
- `pnpm --dir backend run test` — 56 files, 278 tests
- `pnpm --dir backend run build`
- focused backend federation/multiplayer/backup-v4 suite — 3 files, 11 tests
- disposable API-provisioned multiplayer acceptance — join, relay, revocation,
  anonymous and invalid/revoked rejection
- `pnpm --dir frontend run typecheck`
- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run test` — 22 files, 65 tests
- `pnpm --dir frontend run build`
- `pnpm --dir cli run typecheck`
- `pnpm --dir cli run lint`
- `pnpm --dir cli run check` — 5 files, 9 tests, build included
- `pnpm --dir cli run build`
- focused CLI Docker-network acceptance — 1 file, 1 test
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` — 64 passed
- standalone Compose `config --quiet`
- operational Compose `config --quiet` with non-secret placeholders
- `git diff --check`
- encrypted backup-v4 verification and fresh disposable restore
- synthetic disposable retention apply
- read-only container health, database and public-origin observations

One parallel validation attempt produced a frontend session-guard timeout
while React Query was still displaying `Checking your session…`. The affected
test passed immediately when rerun in isolation, and the definitive serial
frontend suite passed all 22 files and 65 tests. No application change was
made for this transient runner condition.

## 17. Files changed

Changed for M5.4.14:

- `cli/tests/integration/docker-network.test.ts` — bounded timeout diagnostics
  with sanitized container-state/log evidence.
- `docs/modernization/142-final-local-operational-gates-m5-4-14.md` — this
  report.

Previously dirty files and reports from M5.4.8–M5.4.13 were preserved and not
rewritten. No operational Compose file, shared infrastructure resource,
database schema or legacy data was modified. No commit or push was performed.

## 18. Operator decisions still required

Before any operational cutover, the operator must decide:

1. The approved off-device encrypted-backup destination and custody of the
   external key registry.
2. Scheduler/transfer ownership, retention deletion semantics and restore-test
   cadence.
3. Whether multiplayer room signatures intentionally have no board ACL, or a
   future board-permission milestone is required.
4. External monitoring system and alert delivery configuration.
5. Post-write rollback policy: forward fix, explicit reconciliation or
   explicitly accepted data loss.
6. Public routing handover window and final single-writer ownership procedure.

## 19. Final decision

```text
M5414_LOCAL_TECHNICAL_GATES_PARTIAL
OFF_DEVICE_BACKUP_DESTINATION_REQUIRED
EXTERNAL_MONITORING_APPROVAL_REQUIRED
POST_WRITE_ROLLBACK_DECISION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The local technical gates materially advanced: authenticated canonical
multiplayer provisioning and CLI Docker acceptance are no longer blocked. The
milestone remains PARTIAL because cross-board authorization is not an existing
enforceable contract and the backup, monitoring and post-write rollback gates
still require operator decisions. No operational GO is implied.

## 20. Recommended next authorized phase

Authorize a final operator-input closure phase, still pre-cutover, to select
and independently restore-test an approved off-device destination, configure
external monitoring delivery, decide multiplayer board authorization semantics,
and approve the post-write rollback policy. After those decisions, rerun the
full pre-cutover acceptance against the unchanged legacy owner before any
routing or ownership switch.

Do not retire Flask, change public routing, modify Authentik or migrate
university data as part of this report.
