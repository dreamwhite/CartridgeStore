# PRG32 Cartridge Store — M5.2g.18 Dream Infrastructure Configuration Audit

Date: 2026-10-14  
Node.js: 24 selected with nvm  
Decision: **`DREAM_CONFIGURATION_AUDIT_PARTIAL`**  
Operational cutover: **`OPERATIONAL_CUTOVER_NO_GO`**  
Flask retirement: **`FLASK_RETIREMENT_NO_GO`**

## 1. Executive result

The local Dream development topology is available for read-only inspection
and is source-compatible with a future Fastify + Next.js application boundary,
but the actual running Traefik router state and Authentik provider metadata are
not available through an authorized read-only interface.

The current local ownership is observable and still transitional:

- `prg32-cartridge-store-flask-1` is healthy and carries the live API label
  for `api.prg32.dream.test` on backend port 5080.
- `prg32-cartridge-store-next-1` carries the live storefront label for
  `store.prg32.dream.test` on port 3000, but has no container healthcheck.
- `prg32-cartridge-store-auth-writer-1` and
  `prg32-cartridge-store-auth-writer-edge-proxy-1` are running but both are
  currently `unhealthy`.
- `dream-traefik-traefik-1` is healthy, terminates local ports 80/443 and is
  attached to `dream_edge`.
- `dream-authentik-server-1` and `dream-authentik-worker-1` are healthy, but
  Authentik provider/application metadata is not exposed without an authorized
  administrative interface. No Authentik API or login was attempted.

The local HTTP behavior agrees with the ownership labels for the public page
and API origins: the storefront returns 200, while the API returns 200 with
`Werkzeug/3.1.9 Python/3.13.16`. The public API catalog is empty in this local
environment; a non-mutating firmware-shaped catalog request returned 200 and
the known download probe returned a bounded 400 because no matching catalog
entry exists. The multiplayer status endpoint returned 200.

The running Traefik process configuration is verified from Docker metadata,
including Docker/file providers, `websecure`, HTTP-to-HTTPS redirection and
the `dream_edge` network. Its computed router/service/middleware state is not
verified because the dashboard/API has no published host port and no other
authorized read-only interface was available. The live container labels are
secondary evidence, not proof that every router is accepted and healthy by
Traefik.

The result is therefore **partial**. The required migration delta and
pre-cutover dependency order are documented below. No infrastructure,
container, network, volume, Compose file, provider, database or secret was
modified or read.

## 2. Authorization and safety

Only the following were used:

- current repository source, tracked Compose and Docker labels;
- non-secret Docker metadata for named relevant containers and networks;
- local DNS resolution;
- local TLS/HTTPS observations with strict timeouts and no `-k`;
- unauthenticated GET/HEAD requests to public, non-mutating routes;
- existing disposable test harnesses;
- static configuration validation.

The following were deliberately not performed:

- no Authentik login, administrative API request or provider mutation;
- no credentials, client secrets, private keys, session cookies, bearer tokens,
  browser storage or user/group records were read;
- no Docker environment values were inspected;
- no Docker secret contents, volume contents, SQLite files, object stores or
  backup archives were inspected;
- no command was executed inside an operational container;
- no Traefik, Authentik, DNS, TLS, Compose, container, network or volume was
  modified, restarted, stopped or recreated;
- no candidate container was attached to `dream_edge` or any operational
  network;
- no authenticated HTTP/WebSocket request, OIDC login or SAML login was sent;
- no writer was frozen or transferred;
- Flask and Python were not removed;
- no commit, push or deployment was performed;
- M5.2g.19 and M6.3d.2h.12 were not started.

The worktree already contained extensive changes from previous milestones.
They were preserved. The companion `../PRG32` repository was not modified.

## 3. Evidence classification

Each finding uses one of the following classifications:

- `LIVE_CONFIGURATION_VERIFIED`: current Docker/container metadata or live
  non-secret runtime configuration was inspected directly;
- `LIVE_BEHAVIOR_OBSERVED`: bounded local HTTPS behavior was observed;
- `REPOSITORY_CONFIGURATION_VERIFIED`: current tracked source/configuration
  establishes the contract, without proving the running deployment;
- `DISPOSABLE_VERIFIED`: isolated synthetic or candidate evidence passed;
- `NOT_VERIFIED`: no safe evidence was available;
- `REQUIRES_OPERATOR_ACCESS`: an authorized operator interface or value is
  required and was not available;
- `REQUIRES_CHANGE_AUTHORIZATION`: the finding requires a future infrastructure
  or ownership change;
- `CONFLICTING_EVIDENCE`: source/live metadata and observed behavior do not
  establish one unambiguous result.

For every operational finding, the evidence source, inspection method,
non-sensitive fields, redaction treatment, confidence and uncertainty are
stated. Repository labels are never presented as equivalent to computed live
Traefik configuration.

## 4. Running Docker topology

### 4.1 Relevant running containers

The Docker daemon was available. The inspection selected only the PRG32,
Traefik and Authentik containers; no full inspection JSON or environment was
dumped.

| Container | Image | State/health | Relevant networks | Published ports |
|---|---|---|---|---|
| `prg32-cartridge-store-flask-1` | `riscv-prg32/cartridge-store:dev` | running/healthy | `dream_edge`, `prg32_cartridge_store_dev` | none directly; edge owns HTTPS |
| `prg32-cartridge-store-next-1` | `riscv-prg32/cartridge-store-frontend:dev` | running/no healthcheck | `dream_edge`, `prg32_cartridge_store_dev` | none directly; edge owns HTTPS |
| `prg32-cartridge-store-auth-writer-1` | `riscv-prg32/cartridge-store-backend:dev-hot` | running/unhealthy | `prg32-cartridge-store_default`, `prg32_cartridge_store_dev` | `127.0.0.1:5091 -> 5090` |
| `prg32-cartridge-store-auth-writer-edge-proxy-1` | pinned Nginx 1.29 Alpine | running/unhealthy | `dream_edge`, `prg32_cartridge_store_dev` | none directly; edge owns HTTPS |
| `dream-traefik-traefik-1` | `traefik:v3.6.17` | running/healthy | `dream_edge` | `127.0.0.1:80`, `127.0.0.1:443` |
| `dream-authentik-server-1` | `ghcr.io/goauthentik/server:2026.8.0` | running/healthy | `dream_sso`, `dream_authentik_private`, `dream_edge` | internal port 9000 only |
| `dream-authentik-worker-1` | `ghcr.io/goauthentik/server:2026.8.0` | running/healthy | `dream_authentik_private` | none |

Inspection method: `docker ps` followed by narrowly formatted `docker inspect`
fields for image, state, health, restart policy, published ports, network
names, mount destinations, command and selected non-secret labels. Host mount
source paths, environment variables and contents were deliberately omitted.
Confidence is high for the container metadata at inspection time and does not
prove configuration outside this Docker daemon.

### 4.2 Healthcheck and restart observations

- Flask has a healthcheck against the discovery document and is healthy.
- Next has no Docker healthcheck in the running container metadata.
- The auth writer healthcheck calls `/health` on port 5090 and is unhealthy.
- The Nginx auth edge healthcheck calls its local `/health` bridge and is
  unhealthy.
- Traefik uses `traefik healthcheck --ping` and is healthy.
- Authentik server uses `ak healthcheck` and is healthy.
- Traefik and Authentik use `unless-stopped`; the PRG32 development services
  use no restart policy.

The unhealthy transitional auth path is a current integration risk. It was
observed only; no restart or diagnostic command inside those containers was
performed.

### 4.3 Relevant network topology

`dream_edge` currently contains Traefik, Authentik server, Flask, Next, the
PRG32 auth bridge and unrelated Dream applications. The PRG32 writer itself is
not attached to `dream_edge`; it is reachable through the auth bridge on the
application networks.

This is compatible with the intended external-edge model, but the shared edge
network means host-rule and router-priority correctness are essential. The
future Fastify service must attach to the edge network only when its public
router is explicitly authorized and ready.

### 4.4 Source comparison

Root `docker-compose.yml` agrees with the relevant live metadata:

- Flask API label: `Host(api.prg32.dream.test)`, `websecure`, TLS, service 5080;
- Next storefront label: `Host(store.prg32.dream.test)`, `websecure`, TLS,
  service 3000;
- auth edge label: API host plus `/auth`, `/api/auth` and
  `/api/admin/federation`, priority 100, service port 5090;
- external edge network defaults to `dream_edge`.

The candidate Compose file is not running and has no external Traefik labels.
It remains a disposable two-service proof only.

## 5. Traefik configuration

### 5.1 Live process configuration

The running Traefik container metadata reports:

```text
providers.docker=true
providers.docker.exposedbydefault=false
providers.docker.network=dream_edge
providers.file.directory=/etc/traefik/dynamic
providers.file.watch=true
entrypoints.web.address=:80
entrypoints.websecure.address=:443
entrypoints.web -> websecure HTTPS redirect
entrypoints.websecure.http.tls=true
api.dashboard=true
ping=true
log.level=INFO
```

The dynamic directory and TLS directory are mounted read-only, and the Docker
socket is mounted read-only. This is `LIVE_CONFIGURATION_VERIFIED` for the
process flags and mount destinations.

The dashboard/API has no published host port in Docker metadata. No authorized
Traefik API endpoint was therefore available. It was not enabled, exposed or
queried through an improvised route. The computed router/service/middleware
configuration is `REQUIRES_OPERATOR_ACCESS`.

### 5.2 Live label ownership

The following labels were read from the running application containers, not
from a hypothetical Compose rendering:

| Router intent | Live label rule | Entry point/TLS | Middleware | Service port |
|---|---|---|---|---:|
| API | `Host(api.prg32.dream.test)` on Flask | `websecure`, TLS | `dream-security-headers@file` | 5080 |
| Storefront | `Host(store.prg32.dream.test)` on Next | `websecure`, TLS | `dream-security-headers@file` | 3000 |
| Auth/federation bridge | API host plus `/auth`, `/api/auth`, `/api/admin/federation` | `websecure`, TLS | `dream-security-headers@file` | 5090 |

The auth/federation bridge has priority 100. No separate live label was found
for `/api/multiplayer`; the current API host router is the apparent route for
that path, but actual WebSocket upgrade acceptance remains unverified.

### 5.3 Routing result

| Path/origin | Current evidence | Classification |
|---|---|---|
| `store.prg32.dream.test` | Live Next label and local HTTPS 200 | `LIVE_CONFIGURATION_VERIFIED` + `LIVE_BEHAVIOR_OBSERVED` |
| `api.prg32.dream.test` | Live Flask label and local Werkzeug response | `LIVE_CONFIGURATION_VERIFIED` + `LIVE_BEHAVIOR_OBSERVED` |
| `/api/*` | Flask API label; local catalog request returns 200 | `LIVE_BEHAVIOR_OBSERVED` |
| `/auth/*`, `/api/auth/*` | Live bridge label, but writer/bridge unhealthy and `/api/auth/providers` returns 404 | `CONFLICTING_EVIDENCE` |
| `/api/admin/federation/*` | Live bridge label only | `NOT_VERIFIED` |
| `/api/multiplayer` | API route/source contract; no authenticated WSS probe | `NOT_VERIFIED` live |

The minimum future router delta is to replace the API service target 5080 with
Fastify 5090, make Fastify the direct owner of auth/federation paths, verify
path priority, preserve host/scheme forwarding and verify WebSocket upgrades.
That change is not authorized here.

## 6. Authentik configuration

### 6.1 Runtime presence

Docker metadata verifies a healthy Authentik server and worker using image
version 2026.8.0. The server is on the SSO and edge networks and exposes only
internal port 9000 in Docker metadata; no host admin/API port is published.
The worker is private-network-only.

The public local SSO observation is:

- `sso.dream.test` resolves to `127.0.0.1`;
- HTTPS HEAD `/` returns 302;
- response server is `uvicorn`;
- redirect is the default authentication flow;
- the root `/.well-known/openid-configuration` returns 404.

This confirms local SSO service presence, not provider registration.

### 6.2 Provider/application metadata

No authorized read-only Authentik provider/application interface was
available. The inspection did not log in, query the Authentik API, inspect
database contents, read private configuration or search for credentials.

Therefore the following remain unavailable:

- OIDC application slug/provider identifier/issuer;
- OIDC client ID and registered redirect URIs;
- allowed scopes, signing algorithm, subject policy and logout settings;
- SAML application/provider IDs and entity IDs;
- ACS/SSO/SLO URLs, NameID policy and signing certificate metadata.

Result: Authentik runtime presence is `LIVE_CONFIGURATION_VERIFIED`; relevant
PRG32 provider metadata is `REQUIRES_OPERATOR_ACCESS`.

## 7. OIDC compatibility

### 7.1 Fastify contract

The generic Fastify implementation requires a provider-specific document with:

- stable canonical provider ID and explicit legacy mapping;
- issuer and discovery/JWKS endpoints;
- client ID;
- secret reference when client authentication requires it;
- API-origin callback:
  `/api/auth/oidc/<providerId>/callback`;
- explicit scopes, PKCE/state/nonce and subject semantics;
- issuer, audience and signing-algorithm validation;
- optional logout URI.

The provisioning code rejects inline secrets, does not activate providers
implicitly, requires distinct store/API origins and requires callbacks on the
API origin.

### 7.2 Current live result

The root SSO discovery path returns 404, and no provider-specific issuer path
was invented. The current public API `GET /api/auth/providers` returns 404,
consistent with the observed Flask/public transitional boundary but not
sufficient to determine the external provider registration.

| Contract item | Result | Classification |
|---|---|---|
| Generic Fastify protocol behavior | Synthetic OIDC tests pass | `DISPOSABLE_VERIFIED` |
| API callback shape | Source requires provider-specific API-origin path | `REPOSITORY_CONFIGURATION_VERIFIED` |
| Actual issuer | Not available | `REQUIRES_OPERATOR_ACCESS` |
| Client ID/redirect registration | Not available | `REQUIRES_OPERATOR_ACCESS` |
| Scopes/signing/subject policy | Not available | `REQUIRES_OPERATOR_ACCESS` |
| Live provider callback | Not attempted | `NOT_VERIFIED` |

No configuration or code change is recommended until the operator supplies
the actual issuer/provider metadata. No Authentik-specific assumption is
introduced.

## 8. SAML compatibility

The Fastify SAML contract requires explicit values for:

- provider ID;
- SP entity ID and API-origin ACS URL;
- IdP entity ID and SSO endpoint;
- NameID format/stability;
- signed assertion and signed response policy;
- audience, destination, recipient and clock skew;
- trusted public certificate and overlap/rotation policy;
- explicit SLO decision.

The canonical metadata path is:

```text
/api/auth/saml/<providerId>/metadata
```

No provider ID, public metadata URL or authorized Authentik metadata response
was available. No SAML response was submitted. Legacy source fields indicate
that SLO was represented historically, but its operational requirement is not
established by source alone.

| Contract item | Result | Classification |
|---|---|---|
| Generic Fastify SAML validation | Synthetic signed callback/metadata tests pass | `DISPOSABLE_VERIFIED` |
| Real IdP entity/SP entity | Not available | `REQUIRES_OPERATOR_ACCESS` |
| Real ACS/SSO/SLO registration | Not available | `REQUIRES_OPERATOR_ACCESS` |
| Certificate trust/rotation | Not available | `REQUIRES_OPERATOR_ACCESS` |
| SLO requirement | Must be explicitly decided | `REQUIRES_CHANGE_AUTHORIZATION` |
| Real SAML callback | Not attempted | `NOT_VERIFIED` |

## 9. Session and cookie compatibility

### 9.1 Current and target boundary

The current Flask API and Next development proxy remain the observable
browser/application path. The root Compose file still configures a
Flask-targeted `FLASK_PROXY_TARGET` for the ordinary dev profile, with
optional Fastify target variables for isolated paths.

The accepted transition remains:

```text
Flask session cookie
        |
        | controlled re-login; no cookie translation
        v
Fastify canonical session cookie: prg32_ts_session
```

Source and disposable tests verify session rotation, CSRF and logout behavior.
The candidate intentionally uses disposable local cookie settings. The
operational deployment must explicitly approve:

- a production session secret outside Compose defaults;
- host-only or domain cookie scope;
- `Secure` and `HttpOnly` flags;
- SameSite policy across the store/API origins;
- CSRF origin checks and logout invalidation;
- API-token continuity and disabled-user rejection.

No live cookies were extracted and no real authentication was performed.

### 9.2 Compatibility result

| Area | Result | Classification |
|---|---|---|
| Unsafe Flask-cookie reuse | Rejected by source/disposable tests | `DISPOSABLE_VERIFIED` |
| Fastify session rotation/CSRF/logout | Synthetic tests pass | `DISPOSABLE_VERIFIED` |
| Live proxy cookie forwarding | Not proven; auth bridge unhealthy | `CONFLICTING_EVIDENCE` |
| User communication | Controlled re-login notice required | `REQUIRES_CHANGE_AUTHORIZATION` |

## 10. WebSocket and firmware routing

### 10.1 Multiplayer

The source contract is `wss://api.prg32.dream.test/api/multiplayer` after TLS
termination. The current live API host router is the apparent path owner and
the Nginx bridge explicitly forwards `Upgrade`, `Connection`, host and
forwarded-protocol headers. However, no authenticated WSS request was sent,
and no live Traefik computed router state was available.

Result: synthetic WSS is `DISPOSABLE_VERIFIED`; live WSS routing is
`NOT_VERIFIED`. The future Fastify router must preserve HTTP/1.1 upgrade,
timeouts, host/scheme forwarding and token handling on the same API port.

### 10.2 Firmware-shaped HTTP checks

Safe unauthenticated local requests were made through the expected API origin:

| Request | Result | Interpretation |
|---|---:|---|
| `GET /api/games?limit=100` | 200 JSON, empty public catalog | API route is reachable; no catalog artifact is available for a positive download test |
| `GET /api/games/org.example.alpha/download?architecture=esp32c6&version=1.0.0` | 400 JSON | Route handled the request but no matching current catalog entry exists; not a binary compatibility pass |
| `GET /api/multiplayer/status` | 200 JSON | Public status route is reachable through current API owner |
| Store `GET /api/games?limit=100` | 200 JSON | Next same-origin proxy path is reachable locally |

No `../PRG32` file was changed. No production artifact was downloaded.
The firmware ABI/path constants remain source-verified and require a populated
canonical catalog plus final firmware smoke evidence before handover.

## 11. Canonical storage ownership

Only container metadata was inspected; no database or object content was read.
Relevant container mount destinations are:

| Container | Relevant destinations | Ownership interpretation |
|---|---|---|
| Flask | `/data` read/write | Current legacy database/filesystem writer boundary |
| Next | `/app`, `.next`, `node_modules` read/write | Development source/cache, not canonical data |
| Auth writer | `/writer-data`, `/writer-store` read/write; `/writer-shadow` read-only | Transitional disposable writer boundary |
| Auth edge proxy | Nginx config read-only | Routing bridge, not data owner |
| Traefik | dynamic/TLS directories and Docker socket read-only | External edge control plane |
| Authentik server/worker | internal application destinations only | External identity service; contents not inspected |

The candidate storage-v2 root and canonical writer lease are source- and
disposable-verified, but no candidate was started in the operational network
and no live canonical writer lease was acquired.

The future sequence must be:

1. stop accepting legacy writes in an approved maintenance window;
2. verify Flask has relinquished the legacy writer boundary;
3. create an immutable legacy snapshot and source inventory;
4. migrate to a fresh canonical root;
5. run independent reconciliation and backup verification;
6. acquire exactly one Fastify canonical writer lease;
7. switch public routing only after readiness;
8. refuse rollback while Fastify still owns the writer;
9. relinquish Fastify before restoring legacy ownership.

No step was executed in this milestone.

## 12. Backup/recovery configuration

The repository exposes two distinct backup layers:

- legacy/application backup code and administrative HTTP routes, disabled unless
  explicitly configured;
- canonical storage-v2 backup-v4 tooling with an external key-provider
  boundary, encrypted envelope, retention dry-run and explicit restore
  authorization.

Tracked development configuration exposes only non-secret feature flags and
destination keys. The candidate has backup activation disabled. No scheduler,
backup archive, encryption key, restore target or monitoring integration was
inspected or triggered.

Operational decisions still required:

- external key provider and custody owner;
- active/decrypt-only/retired key rotation;
- schedule, retention and archive access;
- restore approver and fresh-root policy;
- RPO/RTO and validation procedure;
- failure monitoring, alerting and on-call owner.

Result: backup implementation is `DISPOSABLE_VERIFIED`; operational backup
readiness is `REQUIRES_OPERATOR_ACCESS` and `REQUIRES_CHANGE_AUTHORIZATION`.

## 13. Current-to-target deployment delta

| Concern | Current owner/configuration | Target owner/configuration | Required change | Data/federation impact | Rollback condition |
|---|---|---|---|---|---|
| API HTTP | Flask on edge service port 5080 | Fastify on 5090 | Authorized Traefik service target switch | Final snapshot and API differential parity | Revert only after Fastify writer stops |
| Storefront | Next on 3000 | Next on 3000 | Preserve router; update upstream only if needed | None | Restore prior router |
| Auth/federation | Flask/bridge/writer split | Fastify direct owner | Remove path bridge after verified Fastify routes | Provider registration and identity mapping | Provider remains disabled until accepted |
| WebSocket | Flask/API host path, edge upgrade unproven | Fastify same-port upgrade | Verify router/upgrade/timeouts | Token/session policy | Freeze target and relinquish writer |
| SQLite/files | Flask `/data` | Fastify canonical root | Fresh migration and mount ownership | Catalog, telemetry, users, staging, journal | Keep legacy snapshot immutable |
| Sessions | Flask cookie | Fastify `prg32_ts_session` | Controlled re-login | No cookie migration | Do not restore cookies |
| Backup | Legacy/admin plus disposable v4 | Fastify operator tooling | Key/schedule/restore approval | Encrypted canonical archive | Restore fresh root only |
| mDNS | Legacy/host decision | Explicit Fastify advertiser or external owner | Decide one advertiser | Discovery ABI preservation | Disable candidate advertiser |
| Runtime services | Flask, Next, init, writer, bridge | Fastify, Next | Remove only after ownership closure | No dual writer | Keep Flask until final gate |

The required changes are planning outputs only. No production deployment was
generated or applied.

## 14. Pre-cutover dependency graph

| Phase | Preconditions/evidence | Responsible operator | Abort condition | Rollback boundary |
|---|---|---|---|---|
| 1. Configuration acceptance | Live Traefik router/API access, Authentik non-secret metadata, TLS/DNS evidence | Infrastructure owner | Any unknown router/provider/certificate contract | Flask remains owner |
| 2. Federation reconciliation | Issuer, client/ACS data, secret references, provider IDs and legacy mappings | Identity + application owner | Ambiguous mapping or missing secret/cert reference | Providers remain disabled |
| 3. Backup custody | Key provider, rotation, retention, RPO/RTO and restore approver | Operations/security owner | No recoverable verified backup path | No handover |
| 4. Maintenance approval | Window, notice, owner, monitoring and rollback decision | Change owner | Missing approval or support coverage | No write freeze |
| 5. Legacy quiescence | Confirm Flask write endpoints and firmware writers are stopped/frozen | Application owner | Any active legacy writer | Flask remains authoritative |
| 6. Legacy snapshot | Ready marker, immutable DB snapshot, object inventory and hashes | Migration operator | Incomplete or changing source | Discard disposable target |
| 7. Canonical migration | M5.2c migration and schema tuple validation | Migration operator | Any mismatch/exception not approved | Keep source snapshot |
| 8. Reconciliation | API/firmware differential and compatible-table checks | Independent reviewer | Any unexpected response/byte/identity delta | Do not activate writer |
| 9. Backup verification | Encrypted backup-v4 verify and fresh-root restore | Operations/security owner | Wrong key, corruption or restore mismatch | Abort handover |
| 10. Writer activation | Fastify readiness, canonical lease, no legacy writer | Application owner | Lease conflict or non-ready target | Release Fastify lease |
| 11. Routing handover | Approved Traefik target update and health checks | Infrastructure owner | Router unhealthy or wrong owner | Route back only after target writer stops |
| 12. Acceptance | Browser/API/firmware/WSS/federation smoke | QA + application owner | Any contract mismatch | Freeze target; follow rollback policy |
| 13. Observation | Agreed monitoring interval and alert thresholds | Operations owner | Error/write/latency/identity anomaly | Controlled rollback or forward fix |
| 14. Rollback closure | Reconciled post-handover writes and owner decision | Change owner | Unreconciled data-loss window | Do not claim legacy restoration |
| 15. Flask retirement | All gates closed and explicit authorization | Product/infrastructure owner | Any open compatibility or recovery gate | Keep Flask available but not dual-writer |

## 15. Operational acceptance matrix

| Gate | Evidence | Status | Required action | Authorization | Severity |
|---|---|---|---|---|---|
| A. Running Traefik configuration | Live process flags/ports/health verified; computed API unavailable | Partial | Provide read-only router/service API evidence | Operator access | P0 |
| B. Running Authentik configuration | Healthy server/worker verified; provider metadata unavailable | Not verified | Provide non-secret provider/application metadata | Operator access | P0 |
| C. OIDC provider compatibility | Generic disposable contract only; issuer/client unknown | Not verified | Reconcile issuer, client, callbacks, scopes and signing policy | Operator access | P0 |
| D. SAML provider compatibility | Generic disposable contract only; entity/ACS/cert unknown | Not verified | Reconcile metadata, ACS, certificates and SLO | Operator access | P0 |
| E. Callback origin compatibility | Source requires API-origin callbacks; live registration absent | Not verified | Register exact provider-specific API callback | Change authorization | P0 |
| F. Cookie/session compatibility | Disposable rotation/CSRF pass; live bridge unhealthy | Partial/conflicting | Approve cookie policy and controlled re-login | Change authorization | P1 |
| G. WebSocket routing | Synthetic WSS pass; live computed router/upgrade untested | Partial | Verify real edge upgrade and reconnect | Change authorization | P0 |
| H. Firmware API routing | Catalog GET 200, empty; download negative route 400 | Partial live | Populate/verify accepted canonical artifact and positive binary response | Change authorization | P0 |
| I. Docker network compatibility | `dream_edge` membership and candidate isolation verified | Partial | Verify final Fastify attachment and router selection | Change authorization | P1 |
| J. Canonical storage ownership | Mount destinations and source lease contract mapped | Partial | Approve canonical root and final snapshot/migration | Change authorization | P0 |
| K. Single-writer ownership | Disposable lease tests pass; live transfer not executed | Not ready | Freeze Flask, acquire Fastify lease, verify no dual writer | Change authorization | P0 |
| L. Backup key custody | Provider boundary exists; custody absent | Not verified | Name key owner, retention and rotation policy | Operator access | P1 |
| M. Monitoring/alerting | Healthchecks/logging exist; production alerts absent | Not verified | Configure approved monitoring and on-call alerts | Operator access | P1 |
| N. Maintenance window | No window or notice approved | Not verified | Approve window, notice and support coverage | Change authorization | P1 |
| O. Legacy snapshot | Disposable tooling exists; operational snapshot absent | Not ready | Freeze and capture immutable source snapshot | Change authorization | P0 |
| P. Canonical reconciliation | M5.2c/d disposable evidence exists | Disposable only | Run final source/target differential acceptance | Change authorization | P0 |
| Q. Rollback policy | State machine/policy source exists; live decision absent | Partial | Approve data-loss/reconciliation policy | Change authorization | P0 |
| R. Public routing handover | Current live owner Flask; target switch not applied | Not ready | Change API router to Fastify after readiness | Change authorization | P0 |
| S. Observation period | No cutover has occurred | Not started | Define interval, metrics and abort thresholds | Change authorization | P1 |
| T. Flask retirement | Flask is current API owner and rollback authority | No-go | Close every prior gate and authorize removal | Change authorization | P0 |

## 16. Verification results

Node.js 24 was selected through nvm for Node/pnpm checks.

| Check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS on standalone rerun — 49 files, 242 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir frontend run test:e2e` | PASS — 5 Playwright tests against disposable harness |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS on standalone rerun — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |
| Docker metadata inventory | PASS, read-only and field-limited |
| Local DNS resolution | PASS observation — all three names resolve to `127.0.0.1` |
| Local HTTPS HEAD checks | PASS observation — store 200, API 200, SSO 302 |
| Firmware-shaped catalog GET | 200 with empty public catalog |
| Firmware-shaped download GET | 400 for absent local artifact; no positive binary evidence |
| Live Authentik provider metadata | NOT EXECUTED — no authorized non-secret interface |
| Live Traefik computed router API | NOT EXECUTED — no published/authorized interface |

The first parallel backend run produced one timeout in the existing backup
restore test (`1 failed, 48 passed, 241 passed tests`) while other suites were
running concurrently. The same suite was rerun alone without source changes
and passed completely (`49 files, 242 tests`). The isolated rerun is the
authoritative local suite result; the contention timeout remains recorded as a
flakiness/performance observation, not silently omitted.

The parallel Python process did not return a complete status because of the
same resource contention. It was rerun alone and passed 64/64.

No candidate Docker services were started for this milestone, and no
operational network was used by a disposable test.

## 17. Remaining P0/P1/P2 blockers

### P0

- Computed live Traefik router/service/middleware state is unavailable.
- Authentik PRG32 OIDC/SAML provider metadata and registrations are unknown.
- The current public API owner is still Flask.
- The auth writer and auth edge proxy are unhealthy.
- Real callback origin, WebSocket upgrade and firmware binary acceptance are
  not proven at the final owner.
- No final legacy snapshot, canonical reconciliation or live writer handover
  has been authorized.
- Flask retirement would currently create an unverified ownership gap.

### P1

- No production key custody, backup schedule, restore approval or alerting
  integration is established.
- Next has no live Docker healthcheck.
- The current local public catalog is empty, so a positive binary download
  verification cannot be completed against the running API.
- The maintenance/re-login window and observation period have no approved
  owner or thresholds.
- mDNS ownership and interface policy remain open.

### P2

- Remove the transitional auth bridge only after Fastify directly owns its
  paths and live edge acceptance passes.
- Merge/remove `auth-writer-init` only after initialization and recovery are
  operationally replaced.
- Remove legacy Flask/Python and duplicate mounts only after rollback closure.
- Resolve the existing backup test timeout budget separately if it recurs under
  normal non-parallel execution.

## 18. Required operator decisions

The next authorized infrastructure activity must provide or approve:

1. read-only Traefik router/service/middleware evidence;
2. non-secret Authentik application/provider metadata for the generic OIDC and
   SAML registrations;
3. exact API-origin callback/ACS registrations;
4. production TLS/DNS validation evidence;
5. canonical storage root and final legacy snapshot ownership;
6. backup key custody, rotation, retention, RPO/RTO and restore approver;
7. writer freeze and handover window;
8. controlled re-login notice and cookie policy;
9. real WSS and firmware smoke acceptance;
10. observation thresholds and rollback/data-loss decision.

No provider provisioning, router update, network change or writer transfer is
authorized by this report.

## 19. Recommended next milestone

The next milestone should be a narrowly authorized operator-assisted
configuration reconciliation, not a cutover. It should obtain read-only
Traefik computed state and non-secret generic provider metadata, resolve the
unhealthy auth bridge, and compare exact callback/ACS/origin values with the
Fastify contract. It should then prepare (but not execute) the final
maintenance-window checklist and source snapshot acceptance.

Do not remove Flask, attach Fastify to the operational edge, modify Authentik,
change DNS/TLS, or transfer writer ownership as part of that discovery step.

## 20. GO/NO-GO decisions

| Scope | Decision |
|---|---|
| Repository configuration audit | **GO** — current Compose/source contracts mapped |
| Running Docker topology | **PARTIAL GO** — relevant metadata verified without contents |
| Running Traefik configuration | **PARTIAL / REQUIRES_OPERATOR_ACCESS** — process and live labels seen, computed state unavailable |
| Running Authentik provider configuration | **NO-GO / REQUIRES_OPERATOR_ACCESS** — runtime healthy, provider metadata unavailable |
| OIDC/SAML compatibility | **DISPOSABLE GO / LIVE NO-GO** |
| Session/cookie compatibility | **DISPOSABLE GO / LIVE PARTIAL** |
| WebSocket and firmware routing | **LIVE PARTIAL** — safe route observations only; no positive binary/WSS proof |
| Two-service deployment plan | **GO as plan only** — no deployment applied |
| Dream configuration audit | **`DREAM_CONFIGURATION_AUDIT_PARTIAL`** |
| Operational cutover | **`OPERATIONAL_CUTOVER_NO_GO`** |
| Flask retirement | **`FLASK_RETIREMENT_NO_GO`** |
| M5.2g.19 | **NOT STARTED** |
| M6.3d.2h.12 | **NOT STARTED** |

