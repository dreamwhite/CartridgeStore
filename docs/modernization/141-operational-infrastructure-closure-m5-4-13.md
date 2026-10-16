# PRG32 Cartridge Store — M5.4.13 Operational Infrastructure Closure

Date: 2026-10-15

## 1. Executive summary

M5.4.13 is **`M5413_OPERATIONAL_INFRASTRUCTURE_PARTIAL`**.

The local two-service runtime was recreated with a PRG32-owned optional Dream
integration overlay. Fastify and Next.js remained healthy, the canonical
SQLite/storage state and federation mappings survived recreation, Mailpit was
reachable, and the isolated m549 HTTPS routes remained available. The
standalone Compose file remains independent from Dream networks and Traefik.

The existing encrypted backup-v4 archive was independently verified, a new
pre-recreation backup-v4 was created and verified, and that archive was
restored into a fresh disposable root with SQLite integrity and foreign-key
checks passing.

The operational environment has no approved off-device backup destination, and
no least-privilege board-player identity is currently configured for an
authenticated multiplayer acceptance. These are unresolved cutover gates.

Always:

- **`OPERATIONAL_CUTOVER_NO_GO`**
- **`FLASK_RETIREMENT_NO_GO`**

No shared Dream infrastructure, public router configuration, Flask service,
Authentik resource, operational database or production data was changed.

## 2. Authorization boundary

The work stayed within local, pre-cutover acceptance. Only the local Fastify
and Next.js containers in project `prg32-local-operational` were recreated.
Traefik, Authentik, Mailpit, Flask, the legacy auth-writer services and other
application projects were left running and unchanged.

The existing `deploy/integrations/dream/compose.override.yaml` was not started.
No public `store.prg32.dream.test` or `api.prg32.dream.test` router was claimed.
No credentials, cookies, tokens, assertions, private keys or backup key
material are included in this report.

## 3. Protected state

The operational canonical root remained the existing bind-mounted
`.local/operational/data/canonical` directory. The following facts were
checked before and after recreation:

| Invariant | Result |
| --- | --- |
| Storage metadata tuple | schema 2, layout 2, journal 1, canonical backup format 3 |
| Storage state | `ready` |
| SQLite integrity | `ok` |
| Foreign-key violations | 0 |
| Setup state | `INSTALLATION_COMPLETE` |
| Users | 2 total, including 1 administrator |
| Federation providers | 2 |
| External identity mappings | 2 |
| Encrypted provider secrets | 1 |
| Store settings | 2 keys; secret values not read or reported |
| Canonical cartridges/releases | 1 / 1 |
| Artifact/media objects in SQLite | 1 / 1 |
| Runs/samples/scores | 1 / 2 / 1 |
| Submission/submission artifacts | 1 / 1 |
| Writer lease | held by Fastify after recreation |

The two immutable object files were rehashed during the local audit. Their
bytes and SHA-256 values remained unchanged after recreation. The operational
backup and restore directories are ignored local evidence roots; they are not
tracked deployment state.

## 4. Baseline topology

The checked-in standalone base Compose file defines exactly two application
services:

- `fastify`, listening internally on port 5080;
- `next`, listening internally on port 3000 and depending on Fastify health.

The base file defines only the internal `app_private` network, has no host
ports, no external networks, no Traefik labels, no Dream services and no SMTP
fixture. Its configuration rendered successfully with the local non-secret
environment template.

The local acceptance invocation used:

```text
deploy/standalone/compose.yaml
deploy/standalone/compose.direct.yaml
deploy/integrations/dream/compose.local-persistent.yaml
.local/operational/runtime/m549-federation.compose.yaml
/tmp/prg32-m5411-runtime.override.yaml
```

The last two files are local diagnostic overlays. They preserve the existing
isolated m549 HTTPS routes only; they do not claim the canonical public Store
or API hosts.

After recreation:

| Service | Health | Networks | Restart count |
| --- | --- | --- | ---: |
| Fastify | healthy | `app_private`, `dream_edge`, `dream_mail` | 0 |
| Next.js | healthy | `app_private`, `dream_edge` | 0 |

The external networks were inspected read-only. `dream_edge` is a normal
external bridge network and `dream_mail` is an internal external bridge
network. No network was created, removed or reconfigured by this milestone.

## 5. Persistent Dream integration

Added:

`deploy/integrations/dream/compose.local-persistent.yaml`

This PRG32-owned opt-in overlay:

- attaches Fastify to `dream_edge` and `dream_mail`;
- attaches Next.js to `dream_edge`;
- configures the optional Mailpit SMTP endpoint through operator-overridable
  variables;
- sets `traefik.enable: "false"` on both application services;
- declares both Dream networks as external and therefore does not manage them.

It deliberately does not define router rules. When the existing isolated m549
diagnostic overlay is added after it, that later overlay explicitly enables
only the two m549 routers needed for local browser acceptance. The canonical
Dream override remains unused.

The two application containers were force-recreated with this persistent
overlay. Their expected network attachments and healthchecks were present
after recreation, proving that the attachment is Compose state rather than a
manual `docker network connect` side effect.

Standalone independence was separately verified:

```json
{"services":["fastify","next"],"networks":["app_private"],"labels":{},"ports":[]}
```

The standalone base therefore remains usable on a host with no Dream network,
Traefik, Authentik or Mailpit.

## 6. Container recreation acceptance

Before recreation, a fresh encrypted pre-change backup was created. The
application containers were then recreated without reinitializing the
canonical root. Afterward:

- Fastify `/ready` returned HTTP 200 with database, canonical storage and
  writer lease available;
- the Store origin returned HTTP 200;
- `/api/multiplayer/status` returned HTTP 200;
- Fastify reached Mailpit's read-only HTTP API through `dream_mail`;
- canonical counts, setup completion and federation mapping counts matched;
- both containers were healthy with restart count 0;
- isolated m549 API and Store HTTPS routes remained functional;
- no canonical Store/API Traefik router labels were added.

The local administrator and federation records were not recreated or migrated;
they remained in the existing canonical database.

## 7. Backup-v4 verification

The existing archive was independently verified before the recreation:

```text
.local/operational/backups/m5412-preacceptance.backup4
backup id: 26fd56c2-4c31-414c-ab6e-c47837b0f150
verification state: complete
```

A new pre-recreation archive was created using the existing operational
backup-v4 CLI and external key registry:

```text
.local/operational/backups/m5413-pre-recreate.backup4
backup id: 8ec8d294-cb9b-425e-8f50-2cb68060132f
archive bytes: 644251
archive SHA-256: d04aff2586191a24fb3aa26ff5476c81a5d8a01d017e70e4ded3db3a2d39f335
verification state: complete
```

The archive is encrypted and authenticated by the existing AES-256-GCM
backup-v4 implementation. The key registry remains outside the archive. No
plaintext SQLite copy was transferred. Retention was run in dry-run mode with
`keepNewest=7`; six local archives were protected and no deletion occurred.

## 8. Off-device backup destination

No operator-approved, writable off-device destination was configured or
discovered. The local backup directory is not an off-device destination, and
no NAS, cloud provider or arbitrary network path was selected.

Decision:

**`OFF_DEVICE_BACKUP_DESTINATION_REQUIRED`**

The existing CLI is suitable for the future operator contract because it
requires explicit source, output, authorization and external key-registry
paths. It refuses completed-output overwrite, verifies authenticated archives,
and supports dry-run retention. A scheduler and transfer job must be supplied
by the operator only after a destination, credentials mechanism, retention
deletion policy and restore test window are approved. No host scheduler was
installed.

Required future policy remains:

- daily backups, seven daily copies;
- four weekly copies and three monthly copies;
- RPO 24 hours and RTO 4 hours;
- quarterly fresh-root restore verification;
- encrypted archive transfer only;
- destination checksum verification;
- no archive/key-registry co-location when the destination is unapproved;
- no silent deletion.

## 9. Backup automation and retention

The portable automation boundary remains the existing commands:

```text
prg32-store backup create
prg32-store backup verify
prg32-store backup restore
```

The underlying backend CLI requires explicit absolute paths and authorization;
there are no operational defaults. Restore requires a new target root and does
not merge into or overwrite a live root. Retention is dry-run by default and
requires a separate explicit authorization for deletion.

Status: **PARTIAL** until an operator approves the external destination and
installs an external scheduler/transfer mechanism. This milestone does not
install cron, a scheduler, or a Dream-specific automation.

## 10. Authenticated WebSocket acceptance

The Fastify WebSocket endpoint is active and reports `auth_enabled: true`.
The real isolated m549 WSS probe exercised the negative boundary:

| Probe | Result |
| --- | --- |
| Anonymous board join | rejected with `player role required` |
| Invalid token board join | rejected with `player role required` |

The operational database currently has no API token and the container has no
legacy `PRG32_USERS` compatibility configuration. Therefore no legitimate
least-privilege board-player identity was available for a positive acceptance.
No administrator bypass was invented, no hidden identity was created and no
authentication row was inserted directly into SQLite.

Status: **BLOCKED / NOT_VERIFIED** for positive authenticated participation.
Before cutover, the operator must either provision a supported player-role
identity/token through the normal administration flow and rerun a bounded
join/relay/reconnect/revocation test, or explicitly approve a documented
multiplayer deferral. Neither decision was made here.

## 11. Monitoring contract

Existing application contracts and Docker healthchecks are retained:

- Next.js healthcheck: local `/health` on port 3000;
- Fastify healthcheck: local `/ready` on port 5080;
- Fastify readiness reports database, canonical storage and writer lease;
- `GET /health` and `GET /ready` remain private/readiness contracts and are
  not exposed as public data endpoints by this milestone.

The operator-controlled monitoring contract should check:

| Signal | Actionable condition |
| --- | --- |
| Fastify process/health | non-200 or process exit |
| Fastify readiness | database/storage/lease not available |
| Next.js health | non-200 or restart loop |
| Backup age | older than 24-hour RPO target |
| Backup verification | missing or failed authenticated verification |
| Disk space | warning below 20%, critical below 10% |
| TLS expiry | warning at 30 days, critical at 7 days |
| OIDC/SAML | discovery/metadata or callback dependency unavailable |
| SMTP | approved relay unavailable |
| HTTP errors | sustained 5xx increase |
| Restart loops | repeated container restart or healthcheck failure |

Dream Gatus was not modified. The standalone contract does not hardcode Dream
hostnames and can be implemented by any external monitoring system.

## 12. Rollback readiness

No routing or ownership switch was performed. The rollback state machine is:

- **State A — before public routing switch:** keep Flask authoritative and
  discard only the disposable candidate if necessary;
- **State B — after routing switch, before canonical writes:** switch routing
  back only after checking writer ownership, backup and all health gates;
- **State C — after canonical writes:** do not blindly restart Flask; stop the
  new writer, reconcile post-switch writes or apply a separately authorized
  data-loss policy, then restore one consistent owner.

The M5.4.13 actions demonstrated the safe pre-cutover branch only. Flask was
not stopped, its data was not modified, and no simultaneous writer state was
created. The possible post-cutover data-loss window remains an operator
decision, not an implemented reverse migration.

## 13. Readiness matrix

| Gate | Status | Evidence/decision |
| --- | --- | --- |
| Canonical SQLite integrity | PASS | `PRAGMA integrity_check` returned `ok`; FK check 0 |
| Immutable object integrity | PASS | Referenced objects rehashed before/after recreation |
| First installation wizard | PASS | Existing operational acceptance; setup remains complete |
| Local administrator | PASS | One admin remains in canonical DB |
| Generic OIDC | PASS | M5.4.12 real browser acceptance and persisted mapping |
| Generic SAML | PASS | M5.4.12 real browser acceptance and persisted mapping |
| SMTP integration | PASS | Fastify reached Mailpit over `dream_mail` |
| WebAuthn disabled-by-default | PASS | Runtime flag is false |
| mDNS disabled-by-default | PASS | Runtime flag is false |
| Authenticated WebSocket | BLOCKED | Negative probes pass; no player identity for positive probe |
| Backup-v4 creation | PASS | New operationally authorized archive created |
| Backup-v4 verification | PASS | Independent authenticated verification complete |
| Fresh restore | PASS | New disposable root, SQLite integrity/FK checks pass |
| Off-device backup | BLOCKED | `OFF_DEVICE_BACKUP_DESTINATION_REQUIRED` |
| Backup scheduling | PARTIAL | CLI contract exists; no approved scheduler installed |
| Backup retention | PARTIAL | Dry-run works; deletion policy/destination not approved |
| Monitoring | PARTIAL | Health/readiness contract exists; external alerting not configured |
| Persistent Compose networks | PASS | Network attachments survived force recreation |
| Container restart persistence | PASS | Two services healthy; state and mappings unchanged |
| Public routing handover plan | PARTIAL | Isolated routes observed; public switch not authorized |
| Rollback state machine | PARTIAL | Pre-cutover branch rehearsed; post-write reconciliation remains open |
| Legacy preservation | PASS | Flask and legacy state untouched |
| Firmware API compatibility | PASS | Backend compatibility and multiplayer negative tests pass |
| University deployment independence | PASS | Standalone Compose has no Dream dependency |

## 14. Tests executed

All local Node commands used Node.js 24 via `nvm use 24`.

Passed:

- `pnpm --dir backend run typecheck`
- `pnpm --dir backend run lint`
- `pnpm --dir backend run build`
- `pnpm --dir backend run test` — 56 files, 278 tests
- `pnpm --dir frontend run typecheck`
- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run build`
- `pnpm --dir frontend run test` — 22 files, 65 tests
- `pnpm --dir cli run typecheck`, `lint`, unit tests and build components
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` — 64 passed
- candidate Compose config validation
- operational Compose config validation with non-secret placeholders
- standalone Compose config validation
- persistent Dream overlay Compose config validation
- `git diff --check`
- backup-v4 create, independent verify, fresh-root restore and restore audit
- retention dry-run
- real isolated HTTPS health/store/multiplayer probes
- real isolated WSS anonymous/invalid-token rejection probes

Failed/limited:

- `pnpm --dir cli run check` failed in the existing Docker-network integration
  test `tests/integration/docker-network.test.ts`: its disposable Fastify
  container did not become ready within the test's 60-second wait. The test
  cleanup removed its disposable containers/network/root. The other CLI tests
  in that run passed (4 files, 8 tests passed, 1 skipped before the failing
  Docker suite). This is recorded as a real failure, not converted to PASS.
- Public observations of `store.prg32.dream.test`, `api.prg32.dream.test` and
  `sso.dream.test` resolved locally and had valid local mkcert TLS. Store/API
  roots returned 200 and SSO returned 302. Public API `/health`, `/ready` and
  the tested OIDC discovery path returned 404, which is consistent with the
  current transitional public routing and is not evidence of Fastify cutover.

## 15. Files changed

Added for M5.4.13:

- `deploy/integrations/dream/compose.local-persistent.yaml`
- `docs/modernization/141-operational-infrastructure-closure-m5-4-13.md`

Ignored local evidence created during this milestone:

- `.local/operational/backups/m5413-pre-recreate.backup4` and its completion
  marker;
- `.local/operational/restore-tests/m5413-restore/`.

Previously uncommitted files from earlier milestones were preserved and not
rewritten. No commit or push was performed.

## 16. Remaining operator decisions

Before any cutover authorization, the operator must:

1. Approve and configure a real off-device encrypted-backup destination.
2. Approve retention deletion semantics and an external scheduler/transfer
   mechanism.
3. Provision a supported least-privilege board-player identity, or explicitly
   approve multiplayer deferral after reviewing firmware impact.
4. Decide the public routing handover window for the canonical hosts.
5. Decide the post-cutover write reconciliation/data-loss policy.
6. Configure external alert delivery for the monitoring contract.
7. Re-run the final pre-cutover acceptance after those decisions, without
   changing the legacy owner prematurely.

## 17. Final decision

```text
M5413_OPERATIONAL_INFRASTRUCTURE_PARTIAL
OFF_DEVICE_BACKUP_DESTINATION_REQUIRED
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The local infrastructure and persistence foundation is usable for the next
controlled acceptance, but the evidence is not sufficient for public
ownership handover or Flask retirement.

## 18. Recommended next authorized phase

Authorize a narrowly scoped operator-input closure phase for the three open
gates: approved off-device backup and restore, supported authenticated player
identity acceptance, and external monitoring/rollback decisions. That phase
must remain pre-cutover until all `BLOCKED` and critical `PARTIAL` rows are
resolved and a fresh final backup/restore verification is complete.

Do not retire Flask or switch public routing as part of this report.
