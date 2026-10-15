# PRG32 Cartridge Store — M5.4.5 Operational Cutover Readiness & Handover Plan

## 1. Executive summary

M5.4.5 completed a read-only operational audit and produced an actionable
handover plan. The target application contract is exactly two services:
Fastify owns the canonical API and Next.js owns the storefront. The CLI is a
one-shot administrative tool, not a third long-running service.

The actual machine is not yet in that state. A protected M5.4.3 Fastify+Next
stack is running and healthy, while the active Dream-routed development stack
still contains Flask, Next.js, the transitional Fastify auth-writer and its
Nginx bridge. The observed API router still belongs to Flask, and both
transitional auth services are reported unhealthy.

Decisions:

- `M545_CUTOVER_READINESS_PLAN_PARTIAL`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

The plan is usable, but storage custody, backup policy, real provider settings,
routing handover, maintenance window, monitoring ownership and rollback policy
remain operator decisions.

## 2. Scope and safety

Inspected read-only: Git, modernization reports, Docker containers, health
states, mounts, networks, Compose labels, protected M5.4.3 filesystem
metadata, redacted configuration names, Traefik metadata and Compose renders.

No container was restarted, recreated, stopped or removed. No operational
SQLite/object tree, Dream network, Traefik router, DNS record, TLS certificate,
Authentik provider, Mailpit setting or public origin was changed. No credentials,
tokens, password hashes, private keys or secret values were printed.

The protected `.local/operational-m543/` installation was inspected only and
was not reused as a destructive fixture.

## 3. Baseline and Git state

Observed:

- Node.js `v24.20.0), selected with `nvm use 24`;
- pnpm `12.5.1`;
- HEAD `8760f70f75251f47844dcd6fc18737ec94717ad7`;
- HEAD subject `chore(infrastructure): align operational WebAuthn defaults`;
- HEAD equals the requested previous checkpoint;
- `git diff --check` passed.

The worktree is dirty with a modified `frontend/next-env.d.ts`, untracked
`cli/`, deployment material, reports 124–132, generated/test/dependency
artifacts and root `pnpm-lock.yaml`. These changes were preserved and not
staged, committed, pushed, deleted or rewritten.

## 4. Current Docker topology

| Container | Image | Observed state | Role |
| --- | --- | --- | --- |
| `prg32-m543-local-fastify-1` | `prg32-cartridge-store-fastify:standalone` | running, healthy | protected local canonical Fastify |
| `prg32-m543-local-next-1` | `prg32-cartridge-store-next:standalone` | running, healthy | protected local Next.js |
| `prg32-cartridge-store-flask-1` | `riscv-prg32/cartridge-store:dev` | running, healthy | Flask API |
| `prg32-cartridge-store-next-1` | `riscv-prg32/cartridge-store-frontend:dev` | running, no healthcheck | dev storefront |
| `prg32-cartridge-store-auth-writer-1` | `riscv-prg32/cartridge-store-backend:dev-hot` | running, unhealthy | transitional Fastify auth writer |
| `prg32-cartridge-store-auth-writer-edge-proxy-1` | `nginx:1.29-alpine` | running, unhealthy | transitional auth bridge |
| `prg32-cartridge-store-auth-writer-init-1` | `riscv-prg32/cartridge-store-backend:dev` | exited 0 | transitional initialization |

Old M5.2g10/M5.2g11 containers are exited and are not owners. External
Dream Traefik, Authentik and Mailpit were observed healthy. Relevant networks
include `prg32_cartridge_store_dev`, `prg32-m543-local_app_private`,
`dream_edge`, `dream_mail`, `dream_sso` and
`dream_authentik_private`.

Health was recorded, not remediated.

## 5. Current public routing ownership

Observed Docker labels establish:

| Host/path | Owner | Evidence |
| --- | --- | --- |
| `store.prg32.dream.test` | dev Next.js | router `prg32-store-dev`, port 3000 |
| `api.prg32.dream.test` | Flask | router `prg32-api-dev`, port 5080 |
| API `/auth`, `/api/auth`, `/api/admin/federation` | Nginx bridge | priority 100 router |
| bridge upstream | Fastify `auth-writer:5090` | `docker/auth-writer-edge-proxy.conf` |

The M5.4.3 standalone stack is not Dream-routed and uses synthetic
`store.m543.local`/ `api.m543.local` origins.

## 6. Future two-service topology

The target is:

```
external reverse proxy (optional)
  store origin -> Next.js :3000
  api origin   -> Fastify :5080
Fastify -> operator-controlled canonical SQLite/object root
```

Fastify is the sole canonical writer and owns API, authentication, publishing,
telemetry, scores, metrics, WebSocket and optional mDNS. Next.js owns the
storefront and browser rewrite boundary. Flask, auth-writer and the Nginx auth
bridge do not exist in the final application topology.

## 7. Standalone independence

`deploy/standalone/compose.yaml` contains exactly `fastify` and `next`,
one internal `app_private` network, no host ports, no external Dream network,
no Traefik labels, no Authentik/Mailpit service and operator-supplied canonical
data/key-registry paths. `compose.proxy.yaml` and the Dream override are
explicit optional integrations.

`deploy/operational/compose.yaml` is a separate Dream-coupled template because
it declares external `dream_edge` and `dream_mail`. It must not be confused
with the independent standalone contract.

## 8. Storage ownership

Production storage must be one operator-controlled persistent root mounted to
Fastify as `/data/canonical`, outside the Git checkout and image layers. It
contains canonical SQLite, immutable objects, staging and recovery material.

Before use, the operator must verify non-root ownership, restrictive
permissions, SQLite locking compatibility, capacity for WAL/restore/backups,
external 0600 key registry, writer lease, fail-closed startup, explicit
canonical bootstrap and absence of implicit legacy/index.json authority.

Placeholder only:

```
/srv/prg32/cartridge-store/canonical
/srv/prg32/cartridge-store/secrets/key-registry.json
```

No production root was bootstrapped or modified.

## 9. Existing data classification

| Class | Observed state | Required disposition |
| --- | --- | --- |
| Legacy Flask | `.local/flask/data/cartridge_store.sqlite` (~192 KiB) | preserve files/snapshots; discard contents only after authorization |
| Transitional writer | `.local/writer/auth-data`, `shadow`, `store` | preserve separately; never merge implicitly |
| M5.4.3 acceptance | `.local/operational-m543/`, active/protected | preserve; no destructive reuse |
| University data | not in this worktree | defer; no importer/ETL/bridge |
| Future canonical production | not provisioned | new operator-selected root, explicit bootstrap |

The operator indication that local contents may eventually be discarded is not
deletion authorization. Database files, snapshots and legacy objects remain
retained until D14 is approved.

## 10. Secret and key custody

External custody is required for canonical read/write authorizations, session
and bootstrap secrets, backup-v4/key-registry material, OIDC client-secret
references, SAML signing/verification material, SMTP credentials and WebAuthn
policy where enabled.

The observed M5.4.3 runtime bind-mounts its key registry; it is not in the
image. Secrets must remain outside Git/images/logs, be operator-owned with
restrictive permissions, retain historical backup keys through the restore
window and have an explicit rotation/recovery custodian. D03 remains open.

## 11. Backup policy

Use the existing encrypted backup-v4 system: AES-256-GCM confidentiality and
authenticated integrity, external key registry, completion markers, quiesced
writer, fresh-root restore and independent SQLite/object verification.

M5.4.3 and M5.4.4a are local/disposable evidence. No operational backup was
created or restored here. Frequency, retention, off-host destination, key
custody/rotation, RPO, RTO and restore-drill cadence require operator choices;
no values are invented.

## 12. Authentication and federation

Local auth, generic OIDC, generic SAML and optional WebAuthn are supported.
Authentik is not hardcoded or required for startup. Existing synthetic tests
cover OIDC/SAML protocol behavior, but this audit did not log into or modify the
real provider.

For optional Dream integration, the identity owner must verify issuer/discovery,
JWKS, client configuration, identity mapping, account linking, logout and
controlled re-login. Callback shapes are:

```
https://api.prg32.dream.test/api/auth/oidc/<providerId>/callback
https://api.prg32.dream.test/api/auth/saml/<providerId>/acs
```

Real provider evidence is still operationally unverified.

## 13. WebAuthn

M5.4.3 runs with WebAuthn disabled. That remains the safe default. Enabling it
requires an explicit RP ID, HTTPS origin list, recovery policy, secure-context
and proxy verification. `store.prg32.dream.test` is a possible Dream RP ID,
not a universal default. No real passkey was registered.

## 14. SMTP

Standalone SMTP is disabled by default. Mailpit at `mailpit:1025` on
`dream_mail` is an optional local capture service, not proof of production
delivery. Sender identity, relay/port, TLS/auth mode, secret references,
egress policy and test-send authorization remain open decisions.

## 15. mDNS and firmware

mDNS remains disabled by default and is not a readiness prerequisite. Existing
firmware contracts remain authoritative: discovery
`prg32-store-discovery-1.0`, `_prg32store._tcp`, metadata
`prg32-metadata-1.0`, colophon `prg32-colophon-1.0`, architectures
`esp32c6`/ `qemu`, catalog/download, Range, ETag and WebSocket behavior.

No sibling `../PRG32` file was modified; its unrelated untracked files were
preserved.

## 16. Routing handover

Future ownership is `store.prg32.dream.test -> Next.js` and
`api.prg32.dream.test -> Fastify`. The auth path overlay must move from the
Nginx bridge to Fastify only after the writer freeze and final auth acceptance.

The handover must preserve Host/forwarded-header trust, secure cookies and
approved cookie domain, exact CORS, Next `/api/*` rewrites, OIDC/SAML
callbacks, WebSocket upgrades and health/readiness routes. The current
priority-100 auth router is a collision risk. No routing was changed.

## 17. Cutover state machine

**A — Preflight/snapshot:** approve decisions, verify capacity/permissions,
record routes, quiesce and independently verify encrypted source backup.

**B — Writer quiescence:** close Flask writes, confirm no publication,
submission, user/token, score, metric, run, audit or session writes, and record
the lease. Any unknown writer stops the operation.

**C — Canonical preparation:** use a fresh approved root, explicit bootstrap or
migration, then run schema/object/journal/integrity audits. Failure leaves the
target non-ready and Flask authoritative.

**D — External integrations:** verify TLS, generic OIDC/SAML, SMTP and optional
WebAuthn with their owners; do not hardcode provider assumptions.

**E — Routing handover:** switch Store to operational Next.js and API to
Fastify, then remove transitional auth precedence only in the approved edge
change.

**F — Acceptance:** run catalog, media/download, login/CSRF, approved
federation, publication/review, score/metrics, WebSocket and admin smoke tests.

**G — Observation:** monitor errors, latency, auth, lease, SQLite, backups,
capacity, restarts, WebSockets, SMTP and federation callbacks.

**H — Retirement:** separately authorize reconciliation, retention and removal
of Flask/transitional services. None of these phases was executed.

## 18. Rollback semantics

**Case A, before routing:** keep Flask authoritative and discard only a
disposable target through the approved fresh-root procedure.

**Case B, after routing but before canonical writes:** return to Flask only
after checking journal, submissions, users/tokens, scores, metrics/runs,
audits and sessions. An empty catalog is not proof of no writes.

**Case C, after canonical writes:** do not restart Flask blindly. Stop the new
writer, inventory all post-cutover writes and choose a forward fix, verified
reconciliation or explicitly approved data loss. D06 is blocking.

## 19. Monitoring

Required signals are Fastify `/health`/`/ready`, Next `/health`, HTTP
errors/latency, auth/federation failures, writer lease, SQLite integrity,
backup freshness/verification, disk/WAL capacity, restarts, WebSockets, SMTP
errors and publication/audit failures.

Dream Gatus/Traefik may be an optional integration; standalone must not require
it. Thresholds, alert destination, escalation owner and maintenance
suppression remain undecided. No production monitor was changed.

## 20. CLI operational role

Accepted role: `M544_ADMINISTRATIVE_CLI_GO`.

```
prg32-store status
prg32-store doctor
prg32-store games list
prg32-store submissions list
prg32-store backup create
prg32-store backup verify
prg32-store backup restore
```

Remote commands use Fastify HTTP. Host-side backup-v4 maintenance requires the
existing backend runtime and explicit filesystem/key access. The slim CLI image
is remote-only and is not an alternate SQLite writer.

## 21. Git release readiness

HEAD equals the prior checkpoint, but the worktree is not a releasable clean
checkpoint. Proposed future domain grouping, not executed:

1. `feat(backend): ...`
2. `feat(frontend): ...`
3. `feat(cli): ...`
4. `feat(deploy): ...`
5. `docs(modernization): ...`

Generated artifacts, databases, secrets and historical reports must be
classified before release. Do not include all historical reports in a public
commit by default. No staging, commit or push was performed.

## 22. Operator decision register

| ID | Decision | Status | Blocking | Evidence required |
| --- | --- | --- | --- | --- |
| D01 | canonical storage path | open | yes | path/FS/capacity record |
| D02 | ownership/permissions | open | yes | stat and lease/write checks |
| D03 | secret registry custody | open | yes | custodian/rotation/recovery record |
| D04 | backup destination/retention | open | yes | off-host restore evidence |
| D05 | backup RPO/RTO | open | yes | approved SLO/runbook |
| D06 | rollback after writes | open | yes | reconciliation/loss decision |
| D07 | local fresh-install disposition | partially decided | no | deletion authorization |
| D08 | external OIDC/SAML | open | yes | provider/callback/ACS verification |
| D09 | SMTP relay/sender | open | yes | TLS/auth/delivery policy |
| D10 | WebAuthn/RP ID | default proposed disabled | no | explicit enable/disable |
| D11 | public routing handover | open | yes | router/TLS/smoke evidence |
| D12 | monitoring/alerts | open | yes | owner/threshold/escalation record |
| D13 | maintenance window | open | yes | schedule/operator roster |
| D14 | legacy snapshot retention | open | yes | retention/deletion approval |
| D15 | Git release checkpoint | open | yes | reviewed clean release record |
| D16 | university migration schedule | deferred | no | separately authorized project |

Sixteen decisions are pending/deferred; twelve are currently blocking:
D01–D06, D08–D09 and D11–D15.

## 23. Acceptance matrix

| Area | Status | Evidence/deficiency |
| --- | --- | --- |
| standalone two-service deployment | disposable acceptance GO | standalone Compose and M5.4.3 healthy stack |
| canonical storage/bootstrap | disposable GO | production root/custody not approved |
| local authentication/catalog/workflows | implementation/disposable GO | real handover not run |
| OIDC/SAML | operational not verified | synthetic evidence only |
| WebAuthn | operator decision required | disabled default |
| SMTP | operational not verified | Mailpit capture is not delivery |
| scores/metrics/firmware/WebSockets | disposable GO | final edge still open |
| CLI | disposable acceptance GO | M5.4.4b and current suite pass |
| backup/restore | operator decision required | off-host RPO/RTO/drill open |
| writer lease | operational not verified | no live writer freeze |
| TLS/routing | blocked | current API is Flask; auth bridge collision |
| monitoring | operator decision required | owner/thresholds open |
| rollback/data preservation | blocked/operator decision | post-write policy and retention open |
| Git release/Flask retirement | blocked | dirty worktree; Flask active |

## 24. Validation results

Executed with Node.js 24:

| Check | Result |
| --- | --- |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests; typecheck/lint/test/build |
| backend typecheck/lint/test | PASS — 55 files, 276 tests |
| frontend typecheck/lint/test | PASS — 22 files, 65 tests |
| `docker compose --profile dev config --quiet` | PASS |
| candidate Compose config | PASS |
| operational Compose with synthetic placeholders | PASS |
| standalone Compose with synthetic placeholders | PASS |
| standalone + Dream overlay render, not activated | PASS |
| `git diff --check` | PASS |

No full Docker rebuild, public authenticated request, real provider login,
SMTP delivery, protected-installation destructive test or operational backup
was executed.

## 25. Files changed

Created:

- `docs/modernization/133-operational-cutover-readiness-m5-4-5.md`.

No application source, Compose file, Dockerfile, environment file, database,
filesystem object, Traefik/AuthentiK/Mailpit configuration or sibling-repo file
was modified.

## 26. Remaining blockers

P1 blockers are: Flask still owns the observed API route; transitional auth
services are unhealthy; no approved writer-freeze window exists; real OIDC/SAML
contracts are unverified; canonical root/key/off-host backup/RPO/RTO decisions
are open; post-write rollback policy is unapproved; final Traefik/TLS evidence
is absent; monitoring ownership is open; the worktree is not a reviewed
release checkpoint; and Flask retirement/deletion authorization is absent.

No new application P0 defect was identified by this read-only audit.

## 27. Final decisions

`M545_CUTOVER_READINESS_PLAN_PARTIAL`: plan and decision register are
complete, but critical operator decisions and live handover evidence remain.

`OPERATIONAL_CUTOVER_NO_GO`: current API ownership is Flask and routing,
storage, identity, backup and rollback gates are not approved.

`FLASK_RETIREMENT_NO_GO`: Flask remains active and retention/reconciliation
gates are open.

## 28. Recommended next authorized phase

Approve D01–D06, D08–D09 and D11–D15, produce a clean reviewed release
checkpoint and schedule a controlled maintenance window. Then execute the
handover only under explicit authorization with identity/routing owners present
and a verified backup plus rollback decision.

University migration remains deferred and must be planned separately through
existing administrator UI/API workflows. No importer, ETL or university bridge
should be started for the first local cutover.
