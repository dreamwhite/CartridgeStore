# PRG32 Cartridge Store — M5.5.5 Final Backend Freeze & Readiness

Date: 2026-10-16  
Scope: final Fastify/Next.js backend contract audit, security and compatibility
consolidation, Docker-only readiness, and management-interface verification.  
Operational cutover: **NO-GO**  
Flask retirement: **NO-GO**

## 1. Executive summary

M5.5.5 is **GO for the application Backend Freeze**. The current Fastify
backend, canonical SQLite storage-v2 authority, Next.js integration boundary,
encrypted backup-v4 system, optional backup scheduler, and Docker Compose
deployment contracts are sufficiently stable for the next authorized phase:
frontend UI redesign.

The freeze is an application-contract decision. It is not approval to change
public routing, transfer operational writer ownership, migrate real data, stop
Flask, or retire the legacy application.

The only implementation defect found in this milestone was a documented
management-interface omission: `./manage.sh help` was documented but only
`--help` worked. The smallest compatible fix was applied and covered by a
regression test. No application runtime behavior, database schema, deployment
service, operational volume, Dream infrastructure, or sibling repository was
changed.

Final markers:

```text
M555_BACKEND_FREEZE_GO
M555_HTTP_CONTRACT_FROZEN
M555_WEBSOCKET_CONTRACT_FROZEN
M555_FIRMWARE_ABI_FROZEN
M555_STORAGE_CONTRACT_FROZEN
M555_AUTH_SECURITY_FROZEN
M555_DOCKER_DEPLOYMENT_READY
M555_MANAGEMENT_INTERFACE_READY
M555_UI_REDESIGN_READY
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The GO markers are limited to the tested application and disposable/self-hosted
deployment scope. Real ingress, identity-provider, writer-ownership,
reconciliation, backup-custody, observation, and rollback gates remain open.

## 2. Scope and source evidence

The audit reviewed the current source rather than treating historical reports
as authoritative. The worktree was already dirty at the start of the
milestone; existing changes were preserved and no reset or cleanup was run.
The sibling `../PRG32` repository was inspected read-only and remains
unchanged.

Primary sources reviewed:

| Area | Current source/evidence |
| --- | --- |
| Fastify bootstrap and lifecycle | `backend/src/app.ts`, `backend/src/server.ts` |
| Configuration and deployment gates | `backend/src/config/env.ts`, `backend/src/preflight/` |
| HTTP route ownership | `backend/src/*/routes.ts`, `backend/src/readiness/functional-parity.ts` |
| Authentication and authorization | `backend/src/auth/`, `backend/src/authorization/`, `backend/src/federation/`, `backend/src/oidc/`, `backend/src/saml/`, `backend/src/security/` |
| Storage authority | `backend/src/storage-v2/`, `backend/src/db/`, `backend/src/consistency/` |
| Backup and restore | `backend/src/storage-v2/backup-v4.ts`, `backend/src/storage-v2/backup-v4-cli.ts`, `deploy/operations/backup/` |
| Management interface | `manage.sh`, `scripts/manage.mjs`, `scripts/manage.test.mjs` |
| Frontend integration | `frontend/src/lib/api/`, `frontend/src/app/`, `frontend/src/components/workflow/` |
| Docker topology | `docker-compose.yml`, `deploy/candidate/compose.yaml`, `deploy/standalone/compose.yaml`, `deploy/operational/compose.yaml`, Dockerfiles under `backend/`, `frontend/`, and `cli/` |
| Firmware ABI | `../PRG32/prg32/store/`, `../PRG32/docs/cartridge_store/`, `../PRG32/main/prg32_config.h` |
| Historical evidence | modernization reports 153 through 157 |

Previous reports were used as evidence only after checking their claims
against current code and fresh checks:

- M5.5.0 security/parity audit.
- M5.5.1 WebSocket and HTTP hardening.
- M5.5.2 functional parity and firmware closure.
- M5.5.3 adversarial regression and compatibility verification.
- M5.5.4 unified management interface.

## 3. Final architecture

The frozen target architecture is:

| Component | Responsibility | Authority/status |
| --- | --- | --- |
| Fastify | HTTP API, authentication, authorization, publishing, review, telemetry, scores, statistics, WebSocket relay, discovery | Canonical application backend |
| Next.js | Browser UI, server-side frontend integration, browser navigation and UI workflows | Canonical frontend |
| SQLite storage-v2 | Canonical relational state and durable application metadata | Authoritative application database |
| Immutable filesystem objects | Cartridge artifacts, media, site assets, and private staging | Authoritative binary storage referenced by SQLite |
| Backup scheduler | Optional encrypted backup-v4 execution in an isolated support container | Support service; not an application writer |
| Flask | Existing transitional application and rollback/reference surface | Not part of the final runtime; retirement remains separately blocked |

The final runtime does not require Flask, legacy `index.json`, legacy
application SQLite, `ReadonlyCatalog`, dual application writers, or native
host-level Node/Python application services. Those removals are future
operational work, not actions taken by this milestone.

The public-origin contract remains:

- Store: `https://store.prg32.dream.test`
- API: `https://api.prg32.dream.test`
- WebSocket: `wss://api.prg32.dream.test/api/multiplayer`
- Optional generic identity-provider boundary: operator-configured; no
  Authentik-specific application dependency is frozen.

## 4. Docker-only deployment policy

Docker Compose v2 is the only supported deployment mechanism. The application
containers use Node.js 24 images and multi-stage builds with slim runtime
stages. The runtime does not require Node.js installed on the application host.

Supported host boundaries are Linux Docker Engine and macOS Docker Desktop.
The host must provide Docker Engine/Desktop and Compose v2; application
services are not installed through systemd, launchd, cron, Kubernetes, Swarm,
or native Node/Python process managers.

The standalone Compose contract is infrastructure-independent: it uses an
internal application network, no mandatory Dream network, no mandatory
Traefik, no mandatory identity-provider container, no host-port publication,
read-only application filesystems, dropped capabilities, `no-new-privileges`,
explicit bind-mounted canonical data, and an external protected key registry.

The operational template retains configurable external networks for a future
operator-approved edge integration. It preserves the two required host rules
for `store.prg32.dream.test` and `api.prg32.dream.test`, but it is not a
deployment approval and was not started.

## 5. Management runtime decision

### Decision: retain the Node.js 24 host manager for now

`manage.sh` is an operator/CI orchestration tool, not an application runtime.
It invokes fixed Docker Compose and repository commands using argument arrays,
validates profiles, paths, service names, environment files and permissions,
redacts configured secret values, and uses bounded subprocess timeouts.

The current host requirement is explicit:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
./manage.sh help
```

`manage.sh` attempts `nvm use 24` without changing the parent shell and fails
closed if Node 24 is unavailable. This is accepted because:

- runtime Fastify/Next.js services remain fully containerized;
- Docker itself is already required by every lifecycle operation;
- a containerized manager would require Docker socket exposure or a separate
  privileged orchestration boundary;
- duplicating the manager in shell would weaken the existing JSON, locking,
  backup, path-validation, and redaction behavior;
- the current manager is usable in CI and offline command validation.

A future containerized runner is therefore an optional convenience, not a
freeze requirement. It must not be introduced as a privileged application
service or by mounting the Docker socket into Fastify or Next.js.

The manager command surface is frozen as:

```text
help, version, install, setup, config check,
start, stop, restart, status, logs, health, doctor,
db check, backup create/list/verify/status,
update check/apply, deploy, build, test, ci check
```

`update apply` remains deliberately fail-closed. No trusted update source,
schema/image compatibility proof, or automatic rollback contract is inferred
from Git or a registry.

## 6. HTTP API contract freeze

The Fastify API is frozen for frontend redesign. URLs, stable response fields,
firmware-compatible identifiers, binary bytes, media content types, and stable
error envelopes must not change without a separately reviewed compatibility
decision.

| Contract family | Source location | Consumers | Evidence | Compatibility requirement/limitation |
| --- | --- | --- | --- | --- |
| API index/discovery | `backend/src/catalog/routes.ts` (`GET /api`, `/api/`) | PRG32 host tooling and firmware documentation | M5.5.3 adversarial regression; backend contract tests | Keep both spellings and the existing `{ok,...}` envelope |
| Store discovery | `backend/src/catalog/routes.ts` (`/.well-known/prg32-store.json`) | PRG32 host tooling and frontend | Discovery, dual-origin, firmware runtime tests | Preserve ABI, service URLs, architectures, and configurable origin behavior |
| Catalog listing/detail | `backend/src/catalog/routes.ts` (`/api/games*`) | PRG32 firmware, host tools, Next.js | M5.2d differential; M5.2g.1 runtime acceptance; backend catalog tests | Preserve list/detail fields, version and architecture selection, limits, and IDs |
| Media and binary downloads | `backend/src/catalog/routes.ts` (`icon`, `screenshot`, `colophon`, `download`) | PRG32 firmware and frontend | Byte-for-byte differential and actual host-client test | Preserve bytes, content types, range/conditional behavior, architecture and version query semantics |
| Local auth/session | `backend/src/auth/routes.ts`, `backend/src/auth/service.ts` | Next.js auth UI and browser clients | Auth, compatibility, CSRF, adversarial and setup tests | Fastify sessions are not Flask-cookie compatible; controlled re-login is required |
| OIDC/SAML | `backend/src/oidc/`, `backend/src/saml/`, `backend/src/federation/` | Next.js auth UI and generic providers | Synthetic signed callback, replay, nonce/state/PKCE and certificate tests | Keep provider-specific routes and guarded legacy aliases; no automatic email linking |
| WebAuthn/passkeys | `backend/src/auth/webauthn-routes.ts` | Next.js passkey UI | WebAuthn and malformed-credential tests | Disabled by default unless explicitly configured; ceremony and CSRF rules remain stable |
| Publishing/submissions | `backend/src/submission/`, `backend/src/storage-v2/draft-routes.ts` | Next.js publisher workspace and firmware/tool clients where applicable | Canonical workflow and ownership tests | Preserve submission IDs, owner boundary, staged artifact rules, and publication state |
| Review/publication | `backend/src/review/`, `backend/src/consistency/` | Next.js reviewer/admin UI | Review, publication recovery, admin catalog tests | Review decisions and publication journal state remain canonical; exact Flask HTML is not required |
| Admin/settings/setup | `backend/src/admin/`, `backend/src/settings/`, `backend/src/setup/` | Next.js administration/setup UI | Admin, settings, setup, RBAC and asset tests | Mutations require session, CSRF, permission and, where required, recent reauthentication |
| Scores/statistics | `backend/src/scores/`, `backend/src/stats/` | PRG32 ScoreServer-compatible clients and Next.js | Score/statistics parity and backend tests | Preserve public aggregate semantics and score identifiers |
| Metrics/runs | `backend/src/metrics/` | PRG32 MetricsServer-compatible firmware and Next.js | Firmware-shaped ingestion, limits, ownership and export tests | Preserve request/response contracts, bounded samples, ownership checks and export formats |
| Health/readiness | `backend/src/app.ts` (`/health`, `/ready`) | Compose health checks and operators | Candidate/runtime and CI checks | Health is liveness; readiness includes canonical database/writer/storage state |

Intentional legacy dispositions are explicit rather than accidental: Next.js
replaces legacy browser HTML for catalog, publishing, setup, administration,
scores, statistics, profiles, and authentication pages; Fastify compatibility
routes remain where required for APIs or safe legacy navigation; unsafe or
obsolete form mutations are intentionally deprecated. Exact historical Flask
HTML, redirects, cookies and every side effect are not promised as byte-level
parity.

## 7. WebSocket contract freeze

The frozen endpoint is `WS /api/multiplayer` on the same Fastify HTTP port.
The route is registered by `backend/src/multiplayer/routes.ts` and the relay
state/control implementation is in `backend/src/multiplayer/hub.ts`.

Frozen behavior:

- compatible `join`, `state`, and `leave` client messages;
- `welcome`, peer-state, leave, and stable error responses;
- room signature and peer admission semantics;
- maximum frame size of 64 KiB;
- bounded global, source, identity, and unjoined connection admission;
- bounded join, state, message, source, and identity rates;
- standard ping/pong liveness, unjoined timeout, and cleanup on close/error;
- bounded outbound buffering and slow-consumer eviction;
- no separate relay service and no protocol-specific firmware heartbeat.

Evidence includes M5.5.1 adversarial controls, real WebSocket integration,
Flask/Fastify differential behavior, isolated TLS-edge forwarding, invalid
token rejection, and the M5.5.3 regression suite. The controls are
process-local; a multi-replica deployment would need an explicitly reviewed
shared admission/rate-control strategy. That is an operational scaling gate,
not a reason to change the wire protocol during UI redesign.

## 8. Firmware ABI freeze

The sibling `../PRG32` source was inspected read-only. Current values match:

| ABI/constant | Frozen value | Source evidence |
| --- | --- | --- |
| Discovery ABI | `prg32-store-discovery-1.0` | `../PRG32/prg32/store/utils.py` |
| Metadata ABI | `prg32-metadata-1.0` | `../PRG32/prg32/store/utils.py`, cartridge-format code |
| Colophon ABI | `prg32-colophon-1.0` | `../PRG32/prg32/store/cartridge_format.py` |
| mDNS service | `_prg32store._tcp.local.` | `../PRG32/prg32/store/store_api.py`, `main/prg32_config.h` |
| Default port | `5080` | `../PRG32/main/prg32_config.h` |
| Physical architecture | `esp32c6` | `../PRG32/prg32/store/cartridge_format.py` |
| QEMU architecture | `qemu` | `../PRG32/prg32/store/cartridge_format.py` |
| Download route | `/api/games/<id>/download` | `../PRG32/prg32/store/store_api.py` and server route |
| Metrics routes | `/api/runs`, `/api/metrics/batch` | PRG32 metrics component and backend routes |
| Multiplayer route | `/api/multiplayer` | PRG32 client and backend WebSocket route |

Disposition by verification level:

- **Source verified:** all constants, route names, architecture identifiers,
  metadata and download semantics.
- **Integration verified:** disposable Fastify HTTP, WebSocket, metrics,
  discovery, catalog and binary tests.
- **Real host client verified:** `../PRG32` Python store client exercised
  against disposable Fastify discovery/catalog/download routes.
- **QEMU verified:** not run in this milestone.
- **Physical hardware verified:** not run in this milestone.

Physical board and QEMU execution are not required for Backend Freeze, but
remain release/operational evidence if the deployment requires those targets.
The ABI must not be renamed during frontend redesign.

## 9. Authentication/security freeze

Application security controls are frozen at the current tested boundary:

- local authentication uses canonical Fastify session records and controlled
  session rotation/revocation;
- API bearer tokens are scoped, hashed at rest, revocable, and not exposed by
  administrative listings;
- CSRF protects browser mutations and federation administration;
- authorization is centralized through permission/RBAC checks;
- OIDC validates state, nonce, PKCE, issuer, audience, signatures, and
  identity mapping;
- SAML validates signatures, issuer, audience, destination, recipient,
  temporal conditions, correlation and replay boundaries;
- explicit identity linking is required; email equality does not auto-link;
- WebAuthn ceremonies are bounded, CSRF-protected, and disabled by default;
- error responses use stable codes and do not expose raw exception strings;
- forwarded-header trust is disabled unless an explicit trusted proxy policy
  is configured;
- catalog/download quotas, multipart limits, metrics limits and WebSocket
  controls remain bounded.

Flask signed cookies are intentionally not portable. The approved continuity
policy is controlled re-login after cutover; no Flask-cookie compatibility
layer was added.

Security evidence is separated as follows:

| Security area | Status | Boundary |
| --- | --- | --- |
| Application security | **FROZEN/GO** | Covered by Fastify tests and source audit |
| Deployment security | **DISPOSABLE GO; OPERATIONAL OPEN** | Compose isolation and secret-path contracts pass; real edge/provider configuration remains external |
| Operational security | **OPEN GATE** | Writer ownership, backup custody, monitoring, observation and rollback decisions are not authorized here |

## 10. Canonical SQLite/storage freeze

Canonical storage-v2 is the only future application authority. The source
boundary is `backend/src/storage-v2/`, opened by `openTargetStorage` and
audited by the existing integrity functions and CLI.

Frozen requirements:

- SQLite remains authoritative; no schema migration was introduced.
- Foreign keys, integrity checks, required indexes and schema/storage metadata
  remain enforced.
- Canonical catalog, releases, architectures, artifacts, media, settings,
  submissions, review decisions, scores, runs, samples, audit events and
  publication state use the canonical database.
- Immutable binary objects are referenced by generated storage keys and
  verified by size and SHA-256.
- The single-writer boundary is explicit in canonical runtime configuration.
- Pending private staging remains private and is not promoted by read/restore
  operations.
- Publication consistency and recovery evidence remain journaled through the
  existing storage-v2 boundary.
- Legacy inventory/migration tooling is disposable and read-only unless a
  separately authorized migration command is used.

The current canonical tuple remains the previously approved storage-v2
contract. No schema or storage-layout change was needed for freeze. Future
schema changes require a new compatibility and backup/restore review; the
frontend redesign must consume this contract rather than duplicate business
logic.

## 11. Backup/restore/scheduler freeze

Encrypted authenticated backup-v4 remains the approved backup format. The
implementation and operational wrapper are:

- `backend/src/storage-v2/backup-v4.ts`;
- `backend/src/storage-v2/backup-v4-cli.ts`;
- `deploy/operations/backup/prg32-backup.mjs`;
- `deploy/operations/backup/scheduler.mjs`;
- `deploy/operations/backup/Dockerfile.scheduler`.

Frozen guarantees from M5.2e, M5.2g.8 and M5.4.x evidence:

- transactional/online SQLite snapshot support;
- object inventory and hash/size verification;
- independent archive verification and safe extraction;
- external protected key registry, with no key embedded in an archive;
- wrong-key and tampered-ciphertext rejection;
- fresh-root restore and non-ready interrupted targets;
- archive locking and completion/verification markers;
- no overwrite of completed archives or valid restore roots;
- scheduler isolation from application writes;
- retention remains explicit and operator-controlled;
- no automatic off-device transfer claim;
- no host-level systemd, launchd, or cron scheduler.

The backup scheduler is optional and network-isolated. It reads the canonical
root, writes only to the configured backup destination, and receives its
registry through a protected secret mount. Operational retention and custody
remain administrator responsibilities; no new retention behavior was added.

## 12. Docker Compose topology

The frozen service topology is:

| Compose contract | Services | Purpose | Status |
| --- | --- | --- | --- |
| `deploy/standalone/compose.yaml` | `fastify`, `next`, optional `backup-scheduler` profile | Infrastructure-independent self-hosted runtime | Ready for explicit configured use |
| `deploy/candidate/compose.yaml` | `fastify`, `next` | Disposable pre-cutover acceptance | Verified with disposable Docker resources |
| `deploy/operational/compose.yaml` | `fastify`, `next` | Operator-controlled future template with external edge/mail networks | Configuration-ready; deployment blocked |
| root `docker-compose.yml` | transitional Flask/dev, auth-writer and Next/dev profiles | Existing development/compatibility environment | Preserved; not the final runtime |

The final application responsibility count is two application containers:
Fastify and Next.js. The backup scheduler is optional support, not a third
application service. Flask, `auth-writer-init`, `auth-writer`, and
`auth-writer-edge-proxy` remain transitional/root-development components and
must not be removed before separately authorized operational cutover and
rollback closure.

Compose contracts preserve:

- canonical data as an explicit bind mount at `/data/canonical`;
- external protected key registry mounts;
- read-only application filesystems and tmpfs `/tmp`;
- internal application networking;
- health checks for backend health/readiness and frontend health;
- slim multi-stage Node 24 runtime images;
- public host rules only in the operational template;
- no required Dream network in standalone mode.

## 13. Management CLI readiness

The current management implementation was audited for fixed profiles,
argument safety, stable exit codes, JSON output, redaction, locks,
noninteractive behavior and fail-closed mutations.

| Capability | Result |
| --- | --- |
| Help/version and command parsing | GO; `help` alias fixed in M5.5.5 |
| Profile isolation | GO; fixed allow-list for standalone/candidate/operational |
| Lifecycle/status/health/doctor | GO within configured Compose profile |
| Canonical DB check | GO; delegates to the existing read-only storage audit |
| Backup create/list/verify/status | GO; delegates to existing backup-v4 wrapper |
| Update check | GO; read-only and reports no source when unconfigured |
| Update apply | Safely blocked; no trusted update/rollback contract |
| Disposable deploy | GO with explicit authorization |
| Operational deploy | Safely blocked |
| JSON/redaction/locks | GO; covered by manager tests and prior disposable evidence |
| CI check | GO; fresh execution passed |

The CLI does not start services for `ci check`, does not use production
secrets, does not alter operational containers, and does not perform Docker
global cleanup. Backup operations still require explicit paths, authorization,
and a protected external key registry.

## 14. Frontend integration contract

The next phase may redesign UI components without changing backend
architecture. Existing frontend API boundaries are in `frontend/src/lib/api/`
and the workflow components consume those clients rather than Flask routes.

The redesign must preserve:

- public catalog/discovery/download clients;
- same-origin Next.js proxy behavior and configured API upstream;
- browser session cookies and CSRF token acquisition/rotation;
- local login/register/reset/logout flows;
- generic provider OIDC/SAML redirects and callbacks;
- passkey option/verification flows when explicitly enabled;
- publisher draft, staging, submit and ownership workflows;
- reviewer approval/rejection and publication state;
- admin users, groups, roles, settings/assets and federation management;
- scores, statistics, runs, samples, CSV/Markdown exports;
- WebSocket URL `wss://api.prg32.dream.test/api/multiplayer`;
- stable error-code handling and download links.

No missing backend capability was found that requires a new backend
architecture. Exact legacy Flask HTML parity, Flask-cookie continuity, live
external IdP sessions and production edge behavior are explicit operational or
legacy disposition boundaries, not frontend redesign blockers.

## 15. Functional parity disposition

All relevant capabilities have an explicit disposition:

| Capability | Disposition |
| --- | --- |
| Catalog, detail, media, colophon, binary download | Preserved Fastify contract; Next.js UI replacement |
| Discovery and `/api` index | Preserved compatibility contract |
| Version/architecture selection | Preserved; `esp32c6` and `qemu` remain stable |
| Publishing and private staging | Canonical Fastify/storage-v2 replacement |
| Review and publication | Canonical Fastify/storage-v2 replacement |
| Scores, metrics, telemetry, statistics | Preserved compatible APIs with canonical storage owner |
| Multiplayer | Preserved WebSocket protocol on Fastify |
| Local authentication and authorization | Fastify canonical replacement |
| OIDC/SAML | Generic provider-specific Fastify implementation with safe aliases |
| WebAuthn/passkeys | Fastify implementation, disabled by default |
| Administration and setup | Fastify API plus Next.js UI replacement |
| Legacy HTML pages | Replaced, redirected, compatibility-rendered, or intentionally deprecated per route matrix |
| Flask sessions | Intentional deprecation; controlled re-login required |
| Legacy SQLite/index/object authority | Transitional reference only; not final owner |
| Physical/QEMU runtime evidence | Not required for freeze; remains release evidence where applicable |

No required firmware or host-client contract was accidentally deprecated.

## 16. Security findings closure

M5.5.0 findings were reconciled against current code:

| Historical finding | Current disposition |
| --- | --- |
| WebSocket admission/flood/liveness/resource gap | Closed at application level by M5.5.1 controls and tests |
| Authentication limiter high-cardinality state | Closed with bounded limiter capacity and tests |
| Forwarded-IP attribution | Application policy closed; real trusted edge remains operational gate |
| Selected HTTP quota/timeout gaps | Route-specific controls and explicit limits are accepted; not a universal future cost-budget proof |
| Providerless federation aliases | Explicit compatibility aliases/modern provider-specific routes tested |
| Legacy HTML/admin/info parity | Explicit replacement/deprecation disposition; exact byte parity intentionally not required |
| Deployment secrets/paths | Explicit Compose contracts and fail-closed validation; real operator values remain external |

No open critical or high-severity application defect was reproduced in the
current source or fresh regression suites. Process-local rate limiting,
real-edge trust, multi-replica coordination, and provider configuration remain
deployment-security/operational gates.

## 17. Regression validation

Node 24 was selected with `nvm use 24` and reported Node `v24.20.0`; pnpm
reported `12.5.1`. The following checks were executed in this milestone:

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 59 test files, 295 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 test files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0, 38 generated routes |
| `pnpm --dir cli run typecheck` | PASS |
| `pnpm --dir cli run lint` | PASS |
| `pnpm --dir cli run test` | PASS — 5 test files, 9 tests |
| `pnpm --dir cli run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `node --test scripts/manage.test.mjs` | PASS — 7 tests |
| `./manage.sh help` | PASS after M5.5.5 alias fix |
| `./manage.sh --json update check` | PASS, read-only |
| `./manage.sh --json update apply --dry-run` | Expected safe block, exit 8 |
| `./manage.sh --json deploy --dry-run` without operator config | Expected config block, exit 4 |
| `./manage.sh --json --timeout 600 ci check` | PASS; all checks reported PASS |
| Synthetic candidate/standalone/operational Compose config | PASS through `ci check` |
| Root `docker compose --profile dev config --quiet` | PASS through `ci check` with synthetic CI configuration |
| Direct unconfigured deployment Compose validation | FAIL-CLOSED as expected on required secret/path variables |
| `docker compose` engine availability | Available; Docker Engine 29.8.0, Compose 5.5.1 |
| `git diff --check` | PASS |

One initial frontend suite invocation was run concurrently with the other
long-running suites and showed one timing-sensitive `DeveloperWorkspace` test
failure while the component remained in its loading state. The component test
passed when isolated, and a fresh complete frontend run passed all 22 files
and 65 tests. It is recorded as a transient parallel-run observation, not a
suppressed failure.

The managerized CI did not start operational services and reported
`production_secrets_used: false` and `operational_services_started: false`.
Existing containers visible in Docker were pre-existing workspace state; this
milestone did not start, stop, restart, remove, prune, or reconfigure them.

## 18. Remaining issues classification

Every remaining issue has one primary category:

| Issue | Category | Disposition |
| --- | --- | --- |
| Real public ingress/TLS/WSS and trusted-proxy verification | `OPERATIONAL_CUTOVER_GATE` | Requires operator-controlled edge acceptance; not run here |
| Real generic OIDC/SAML provider session continuity | `OPERATIONAL_CUTOVER_GATE` | Requires provider/operator acceptance; no real login was initiated |
| Canonical data migration and live writer ownership | `OPERATIONAL_CUTOVER_GATE` | Requires quiescence, reconciliation and explicit handover |
| Backup off-device custody and real restore rehearsal | `OPERATIONAL_CUTOVER_GATE` | Local encrypted backup/restore is verified; custody is external |
| Telemetry, scores, publication/review, multiplayer and download write ownership | `OPERATIONAL_CUTOVER_GATE` | Must be verified at the selected live edge |
| mDNS operational ownership | `OPERATIONAL_CUTOVER_GATE` | Optional and disabled in operational Compose; no public deployment dependency |
| Flask shutdown/removal and legacy data deletion | `FLASK_RETIREMENT_GATE` | Requires successful cutover, observation and reconciliation |
| Exact historical Flask HTML/cookie parity | `ACCEPTED_LIMITATION` | Modern UI/API replacement and controlled re-login are intentional |
| QEMU/physical firmware runtime evidence | `ACCEPTED_LIMITATION` | Source, integration and real host-client evidence pass; hardware was unavailable/not required |
| Process-local rate limiter distribution across replicas | `FUTURE_ENHANCEMENT` | Single-service/single-writer target is the frozen scope |
| Containerized management runner | `FUTURE_ENHANCEMENT` | Host Node 24 requirement is explicit and accepted |

No `BACKEND_FREEZE_BLOCKER` remains.

## 19. Operational cutover gates

The following are deliberately outside this freeze and remain NO-GO:

1. Confirm the approved Linux/Docker operational host and persistent bind
   paths.
2. Snapshot and independently verify the legacy source without mutation.
3. Quiesce all legacy writers and establish one canonical Fastify writer.
4. Migrate/reconcile canonical SQLite and immutable objects under an approved
   change window.
5. Verify real `store.prg32.dream.test` and `api.prg32.dream.test` ingress,
   TLS, trusted proxy headers, WSS forwarding and health/readiness.
6. Decide controlled re-login communication; do not attempt Flask-cookie
   conversion.
7. Verify generic OIDC/SAML provider callbacks through the real configured
   provider without hard-coding Authentik behavior.
8. Confirm publication/review, telemetry, score, metrics and multiplayer
   ownership at the edge.
9. Confirm backup key custody, backup destination, restore operator and
   observation/rollback window.
10. Define the post-cutover write reconciliation and accepted data-loss policy
    before any rollback is considered.

No public routing, Dream Traefik, Authentik, DNS, operational Compose, or
operational database was changed in M5.5.5.

## 20. Flask retirement gates

Flask remains transitional and authoritative for the existing deployment until
a later authorized cutover. Retirement requires, at minimum:

- successful operational cutover to Fastify/Next.js;
- an observation window with no unresolved API/firmware regressions;
- reconciled canonical database, immutable objects and telemetry;
- verified backup and restore custody;
- explicit rollback decision and accepted data-loss policy;
- communication of controlled re-login;
- confirmation that no legacy writer, route, backup or rollback artifact is
  still needed;
- separate authorization to stop services and delete legacy data.

M5.5.5 performed none of these destructive or operational actions.

## 21. Documentation changes

Created exactly one new modernization report:

```text
docs/modernization/158-final-backend-freeze-readiness-m5-5-5.md
```

No historical modernization report was rewritten. No roadmap update was
required because M5.5.5 is documented here and the existing roadmap remains
the historical milestone index. No JSON, CSV, separate inventory, or separate
acceptance-matrix evidence file was created.

## 22. Files changed

M5.5.5 implementation changes:

- `scripts/manage.mjs` — recognize the documented `help` command as the same
  safe help path as `--help`.
- `scripts/manage.test.mjs` — regression coverage for `./manage.sh help`.
- `docs/modernization/158-final-backend-freeze-readiness-m5-5-5.md` — this
  consolidated freeze report.

All other modified and untracked files shown by the initial worktree status
belonged to previously accumulated milestones or disposable ignored fixtures;
they were preserved. No commit or push was performed.

## 23. Final freeze decision

### Backend Freeze

**GO.** The current Fastify backend has stable tested HTTP/WebSocket/firmware
contracts, explicit authentication/security boundaries, unambiguous canonical
storage ownership, verified backup/restore boundaries, stable Docker-only
deployment contracts, and a usable management interface. Frontend redesign
may proceed without another backend architecture phase.

### Operational deployment

**NO-GO.** Public edge, real identity provider, writer ownership, live data
reconciliation, backup custody, monitoring, observation, and rollback gates
remain intentionally open.

### Flask retirement

**NO-GO.** Flask, legacy data, legacy objects and rollback material remain
protected until a separately authorized operational cutover and observation
period complete successfully.

The next authorized milestone is **frontend UI redesign**. It must consume the
frozen contracts in this report and must not introduce new backend routes,
storage authorities, authentication protocols, or firmware ABI changes unless
a new compatibility review is separately authorized.
