# PRG32 Cartridge Store — M5.2g.17 Operational Infrastructure & Federation Acceptance

Date: 2026-10-14  
Node.js: 24 selected with `source "$HOME/.nvm/nvm.sh" && nvm use 24`  
Decision: **`READ_ONLY_OPERATIONAL_PREFLIGHT_PARTIAL`**  
Operational cutover: **`OPERATIONAL_CUTOVER_NO_GO`**  
Flask retirement: **`FLASK_RETIREMENT_NO_GO`**

## 1. Executive result

The repository configuration is compatible with a future two-service
Fastify + Next.js application boundary in disposable mode. The candidate
Compose file builds Node.js 24 multi-stage images, runs exactly `fastify` and
`next`, reaches readiness, serves the configured discovery contract, and uses
one canonical SQLite/storage root with a writer lease.

The currently observable Dream names are a local development environment, not
public infrastructure evidence:

- `store.prg32.dream.test` resolves through the local resolver to `127.0.0.1`
  and returned HTTP 200 from the local Next.js-facing edge.
- `api.prg32.dream.test` resolves to `127.0.0.1` and returned HTTP 200 with
  `Werkzeug/3.1.9 Python/3.13.16`; Flask is therefore still the observable API
  owner in the current environment.
- `sso.dream.test` resolves to `127.0.0.1` and returned HTTP 302 from
  `uvicorn`, redirecting to the Authentik authentication flow.
- Direct DNS queries to the external resolver returned `NXDOMAIN` for all
  three names. This does not prove public DNS is wrong; it proves only that
  this workstation's external DNS view does not contain these local `.test`
  records.
- The presented certificates are mkcert development certificates. Local curl
  accepted them using the workstation trust configuration, but they are not
  evidence of production certificate issuance or public chain validation.

The read-only acceptance gate is therefore partial. The source contracts,
generic federation implementation, candidate topology and disposable
compatibility evidence are verified. Real Traefik ownership, public DNS/TLS,
provider registrations, browser acceptance at the actual origins, operational
writer handover, key custody, monitoring and rollback execution remain open or
unauthorized.

No operational resource was modified. No real authentication was performed.
No operational Compose project, database, object root, backup, provider,
Traefik configuration or DNS/TLS configuration was accessed or changed.

## 2. Scope and authorization boundary

This milestone was limited to repository inspection, non-secret configuration
audit, bounded unauthenticated observations, disposable tests and a disposable
two-service Docker smoke run.

The following were not performed:

- no login to Authentik or any real OIDC/SAML provider;
- no credentials, tokens, cookies, private provider configuration or
  operational identity records were read;
- no POST, PUT, PATCH or DELETE request was sent to the three expected origins;
- no public WebSocket authentication token was sent;
- no real OIDC or SAML callback was initiated;
- no Traefik, DNS, TLS, operational Compose, container, network, database,
  object root or backup was changed;
- no writer ownership was transferred and no writers were frozen;
- Flask and Python were not removed;
- no deployment, commit or push was performed;
- M5.2g.18 and M6.3d.2h.12 were not started.

The existing worktree was already substantially dirty before this milestone.
Those changes were preserved. The companion `../PRG32` repository was not
modified.

Evidence classifications used below are:

- `SOURCE_VERIFIED`: established from current repository source/configuration;
- `PUBLICLY_OBSERVED`: observed through an allowed unauthenticated request,
  with the observation boundary stated explicitly;
- `DISPOSABLE_VERIFIED`: exercised against synthetic roots or isolated
  candidate services;
- `NOT_VERIFIED`: no safe evidence is available;
- `REQUIRES_OPERATOR_ACCESS`: requires information or action outside this
  repository and outside the authorized read-only boundary;
- `REQUIRES_CHANGE_AUTHORIZATION`: requires an explicit future infrastructure
  or ownership change.

## 3. Repository configuration inventory

### 3.1 Current tracked Compose topology

The current root `docker-compose.yml` is a single profile-based file. It has
the following services:

| Service | Profiles | Current responsibility | Classification |
|---|---|---|---|
| `cartridge-store` | `prod` | Legacy Flask production image, port 5080, `/data` persistent bind | `REMOVE_AFTER_CUTOVER` only after an approved handover |
| `backend` | `backend` | Development Fastify process using fixture storage | `DEV_ONLY` |
| `auth-writer-init` | `writer-init`, `writer`, `dev` | Disposable SQLite/key-registry initialization | `DEV_ONLY`, future `MERGE` candidate |
| `auth-writer` | `writer`, `dev` | Disposable Fastify authentication/submission writer on host port 5091 | `DEV_ONLY`, future `MERGE` candidate |
| `auth-writer-edge-proxy` | `dual-origin`, `dev` | Disposable Nginx bridge for selected auth/federation paths | `DEV_ONLY`, future `REMOVE_AFTER_CUTOVER` candidate |
| `flask` | `dev` | Legacy Flask API on port 5080 with hot reload | `LEGACY`, current local API owner |
| `next` | `dev` | Next.js development server on port 3000 with hot reload | `KEEP`, future frontend service |

The profile names currently present are `backend`, `dev`, `dual-origin`,
`prod`, `writer` and `writer-init`. Activating `dev` renders five services:
`auth-writer-init`, `flask`, `auth-writer`, `auth-writer-edge-proxy` and
`next`.

The current dev network layout is:

- `prg32_cartridge_store_dev`: internal application network;
- `${DREAM_EDGE_NETWORK:-dream_edge}`: external edge network shared with the
  user's Dream reverse proxy;
- `auth-writer-edge-proxy`, `flask` and `next` attach to the external edge
  network;
- the writer additionally uses the internal application network.

The current persistent or bind-mounted state is deliberately split across
legacy Flask data, disposable writer data/shadow/store directories, source
trees, host `node_modules` directories and the Next cache. The root Compose
file does not yet represent the final canonical storage layout.

### 3.2 Candidate topology

`deploy/candidate/compose.yaml` contains exactly two runtime services:

| Service | Internal port | Storage/network | Healthcheck |
|---|---:|---|---|
| `fastify` | 5090 | explicit bind-mounted disposable `/data/canonical`, private `candidate` network | `GET /ready` |
| `next` | 3000 | no application data mount, private `candidate` network | `GET /ready` |

The candidate has no Traefik labels, no external network, no anonymous
volumes, no operational backup activation and mDNS disabled. It is therefore a
disposable runtime proof, not a production deployment definition.

The candidate version tuple verified by source and initialization is:

```text
schema version:              2
storage layout version:      2
publication journal version: 1
backup payload version:       3
encrypted backup envelope:   v4
```

The candidate needs an explicit `candidate-init-cli` run before first startup
because the Fastify auth writer intentionally refuses to create an
uninitialized operational database. This is a safe fail-closed requirement,
not an implicit production initialization mechanism.

### 3.3 Dockerfiles and Node boundary

`backend/Dockerfile.candidate` and `frontend/Dockerfile.candidate` use
`node:24-bookworm-slim` multi-stage builds. Dependency/build stages contain
the compilation toolchain; runtime stages contain only the production
dependency tree and built output and run as the unprivileged `node` user.

The package engines require Node `>=24.0.0 <25`. Local verification selected
Node 24 through nvm. No Python or Flask executable is part of the candidate
runtime images.

### 3.4 Storage and writer assumptions

The current Flask profile owns the legacy database and filesystem store. The
current disposable Fastify writer uses separate auth/shadow/store mounts, with
optional metrics, scores, submission and backup capabilities controlled by
explicit environment flags. The candidate consolidates these into one
canonical SQLite/storage-v2 root and acquires `CanonicalWriterLease`.

The source does not permit this milestone to infer that the operational Flask
database and the canonical root are already the same data set. They remain
separate ownership domains until a future snapshot, migration, differential
verification and handover are explicitly authorized.

## 4. Public origin observations

The observations below were low-volume, strict-timeout, unauthenticated
`curl` HEAD/GET and DNS/TLS observations. Redirects were not followed into
authentication. No cookies or sensitive headers were persisted.

### 4.1 DNS and address class

The local system resolver returned loopback for all names:

| Origin | Local resolver result | Address class | Public DNS observation |
|---|---|---|---|
| `store.prg32.dream.test` | `127.0.0.1` | loopback/local | `NOT_VERIFIED`; direct external resolver query returned `NXDOMAIN` |
| `api.prg32.dream.test` | `127.0.0.1` | loopback/local | `NOT_VERIFIED`; direct external resolver query returned `NXDOMAIN` |
| `sso.dream.test` | `127.0.0.1` | loopback/local | `NOT_VERIFIED`; direct external resolver query returned `NXDOMAIN` |

These results explicitly describe the local Dream development environment.
They are not evidence of Internet reachability or of the DNS state on the
deployment network.

### 4.2 TLS certificate observations

The presented certificates were inspected without disabling TLS validation in
curl. The local endpoint presented mkcert development certificates:

| Origin | Observed SAN coverage | Observed validity | Result |
|---|---|---|---|
| Store/API names | `prg32.dream.test`, `*.prg32.dream.test` | 2026-10-13 through 2029-01-13 | `PUBLICLY_OBSERVED` locally; not production evidence |
| SSO name | `dream.test`, `*.dream.test`, `localhost`, `127.0.0.1` | 2026-09-12 through 2028-12-12 | `PUBLICLY_OBSERVED` locally; not production evidence |

Local curl exited successfully with strict verification using the workstation
trust configuration. The generic command-line OpenSSL CA path did not trust
the local mkcert issuer. This is consistent with a local development CA and
does not establish a publicly trusted certificate chain.

### 4.3 HTTP observations

| Origin | Request | Status | Safe headers/ownership signal | Classification |
|---|---|---:|---|---|
| Store | `HEAD /` | 200 | `content-type: text/html`, `cache-control: no-store`, `x-frame-options: DENY`, strict-origin referrer policy | `PUBLICLY_OBSERVED` locally; source labels identify Next.js as the intended storefront service |
| API | `HEAD /` | 200 | `content-type: text/html`, `server: Werkzeug/3.1.9 Python/3.13.16`, `x-frame-options: DENY` | `PUBLICLY_OBSERVED` locally; Flask is still the current API owner |
| SSO | `HEAD /` | 302 | `location: /flows/-/default/authentication/?next=/`, `server: uvicorn`, `x-frame-options: DENY` | `PUBLICLY_OBSERVED` locally; external provider appears Authentik-compatible but private configuration was not inspected |
| SSO | `GET /.well-known/openid-configuration` | 404 | `server: uvicorn`, `content-type: text/html`, no redirect | `NOT_VERIFIED`; root issuer/discovery path is not established |

The 404 at the SSO root well-known path must not be interpreted as proof that
OIDC is unavailable. The provider issuer may be a tenant/application path,
and discovering that path requires operator-supplied provider metadata or
authorized provider configuration.

SAML metadata was not requested because no provider-specific metadata URL was
available in non-secret repository configuration and the brief prohibits
guessing private provider paths.

## 5. Current routing ownership

### 5.1 Current local/observed ownership

The current edge labels in root Compose route:

- `api.prg32.dream.test` to the `flask` service on port 5080;
- `store.prg32.dream.test` to `next` on port 3000;
- selected `/auth`, `/api/auth` and `/api/admin/federation` paths to the
  `auth-writer-edge-proxy`, which forwards to `auth-writer:5090`;
- `auth-writer-edge-proxy` preserves the host and forwarded protocol and
  forwards WebSocket headers.

The local API observation confirms that the API route currently terminates in
Flask, not Fastify. The current Next configuration preserves the migration
escape hatch `FLASK_PROXY_TARGET`, but the backend-neutral
`PRG32_API_UPSTREAM`/Fastify path is available and candidate mode uses it.

### 5.2 Intended future ownership

The intended future mapping is:

| Public path | Future owner | Required proof |
|---|---|---|
| Store pages/assets | Next.js | Real Traefik router and browser observation |
| Store `/api/*` proxy | Next.js to Fastify | Real proxy path, cookies, streams and error behavior |
| API `/api/*` | Fastify | Real API router, firmware smoke and response compatibility |
| API `/auth/*` and `/api/auth/*` | Fastify | Provider registration and callback acceptance |
| API `/api/multiplayer` | Fastify | Real WSS upgrade and reconnect behavior |
| SSO origin | External generic OIDC/SAML provider | Operator metadata and provider registration |

The candidate verifies the application-level routes, but its private bridge
does not prove that Dream Traefik forwards the same routes or WebSocket
upgrades.

## 6. Traefik compatibility

### 6.1 Source-verified requirements

The tracked Compose labels use:

- external network `${DREAM_EDGE_NETWORK:-dream_edge}`;
- `websecure` entrypoint;
- TLS enabled at the edge;
- `dream-security-headers@file` middleware;
- host rules for `store.prg32.dream.test` and `api.prg32.dream.test`;
- load-balancer ports 3000 for Next and 5080 for Flask;
- priority 100 for the selected auth edge bridge;
- application-level WebSocket Upgrade/Connection forwarding in the Nginx
  bridge.

These labels prove repository intent only. No tracked artifact contains the
live Dream Traefik dynamic configuration or the deployed router state.

### 6.2 Required future change, not applied here

Before handover, an authorized deployment change must replace the API router's
Flask target with Fastify port 5090 and route the auth/federation paths to the
same Fastify owner. The storefront router remains Next port 3000. The change
must preserve:

- host and scheme forwarding;
- trusted proxy configuration;
- request-body limits and timeout behavior;
- `Set-Cookie`, CSRF, ETag, Range and streaming behavior;
- WebSocket Upgrade/Connection headers;
- health/readiness checks;
- exact origin/CORS boundaries.

No label, router or proxy change was applied. The candidate has intentionally
no operational Traefik labels.

## 7. Generic OIDC operational contract

### 7.1 Source-verified Fastify contract

The Fastify OIDC service requires a provider-specific configuration and does
not assume Authentik-specific behavior. The operator must supply:

- stable canonical `providerId`;
- explicit legacy provider ID mapping;
- issuer URL and discovery/JWKS metadata;
- client ID;
- either public PKCE client authentication or a secret reference for the
  selected client authentication method;
- API-origin callback:
  `/api/auth/oidc/<providerId>/callback`;
- optional logout URI;
- scopes and subject identifier semantics;
- permitted signing algorithms and issuer/audience expectations.

The provisioning implementation rejects inline secrets, requires explicit
secret references where needed, keeps providers disabled by default and
requires the API and storefront origins to be distinct. It also requires the
callback origin to be the API origin.

### 7.2 External provider result

The expected external provider host is `https://sso.dream.test`, but the
actual issuer is not established. The root standard discovery URL returned
404, and no provider-specific issuer or client registration was inferred.

Result: generic protocol implementation is `DISPOSABLE_VERIFIED`; the real
provider contract is `REQUIRES_OPERATOR_ACCESS`.

## 8. Generic SAML operational contract

### 8.1 Source-verified Fastify contract

The canonical SAML service requires an explicit provider document containing:

- stable provider ID;
- SP entity ID;
- API-origin ACS URL;
- IdP entity ID;
- IdP SSO endpoint;
- signing certificate reference and certificate overlap policy;
- assertion/response signing requirements;
- audience, destination and recipient;
- NameID stability/format decision;
- bounded clock skew and replay protection;
- explicit SLO decision.

The Fastify metadata route is provider-specific:
`/api/auth/saml/<providerId>/metadata`. No provider ID or public IdP metadata
URL is available in safe repository configuration.

### 8.2 External provider result

No SAML metadata was fetched, no SAML response was submitted and no Authentik
provider configuration was queried. The generic signed callback and metadata
implementation is `DISPOSABLE_VERIFIED`; real entity IDs, ACS registration,
certificates and SLO requirements are `REQUIRES_OPERATOR_ACCESS`.

SLO is not assumed to be available merely because the legacy configuration had
SLO fields. Functional parity requires an explicit operator decision and
registration if SLO is required.

## 9. Federation provisioning compatibility

M5.2g.16 introduced the offline, provider-neutral provisioning boundary in
`backend/src/federation/provisioning.ts`. Current source and disposable tests
verify:

- stable canonical provider IDs;
- explicit legacy provider ID mappings;
- provider-disabled-by-default behavior;
- secret references instead of inline client secrets/private keys;
- idempotent provider provisioning;
- canonical writer-lease acquisition before apply;
- unique identity mapping;
- disabled-account preservation;
- rejection of ambiguous provider mappings;
- rejection of email-based auto-linking;
- no implicit provider activation;
- compatibility with the encrypted backup-v4/key-provider boundary.

The mechanism can represent the operational configuration once the operator
provides the issuer/metadata, client IDs, secret references, certificates,
callback registrations and legacy mapping. It does not invent these values
and it was not used against real identities or providers.

Result: `DISPOSABLE_VERIFIED` for the migration mechanism;
`REQUIRES_OPERATOR_ACCESS` for real provider values and identity data;
`REQUIRES_CHANGE_AUTHORIZATION` for activation.

## 10. Session transition

The accepted transition remains:

```text
Flask signed session
        |
        | controlled re-login; no cookie translation
        v
Fastify canonical session (prg32_ts_session)
```

Source and disposable tests verify that Fastify rotates a distinct session,
enforces CSRF, invalidates logout and rejects legacy-cookie reuse. The
candidate intentionally uses disposable non-secure local settings; an
operational deployment must use an explicit secret, `Secure`, `HttpOnly`, the
approved SameSite policy and a host/domain policy reviewed for the split
store/API origins.

API tokens are durable records and require an explicit migration/reconciliation
decision; their secret values must not be exported into this report or into
provider configuration. Disabled users must remain disabled after identity
reconciliation.

The future maintenance notice must state that existing Flask browser sessions
will expire at handover and that users must authenticate again. The notice
must identify the support/rollback window without promising cookie continuity.

## 11. Canonical writer ownership

| Domain | Current observable owner | Candidate owner | Handover gate |
|---|---|---|---|
| Catalog reads/downloads | Flask/API origin | Fastify canonical storage-v2 | final snapshot and differential verification |
| Publication/submissions | Flask/legacy plus disposable writer paths | Fastify canonical workflow | pending/recovery reconciliation and single-writer lease |
| Review/approval | Flask legacy workflow | Fastify canonical workflow | review-history and in-flight operation reconciliation |
| Authentication/users/tokens | Flask legacy plus isolated auth writer | Fastify canonical auth writer | account/token mapping and maintenance re-login |
| Scores | Flask firmware-compatible endpoint | Fastify canonical score service | freeze and reconcile score delta |
| Runs/metrics/samples | Flask firmware-compatible endpoint | Fastify canonical telemetry | freeze and reconcile telemetry delta |
| Download telemetry | Flask legacy endpoint | Fastify canonical telemetry | event reconciliation and duplicate policy |
| Sessions | Flask signed cookies | Fastify sessions | controlled re-login; no simultaneous session authority |
| Multiplayer | Flask current public API observation | Fastify WebSocket hub | real edge WSS upgrade and ownership window |
| mDNS | legacy/host decision not operationally accepted | Fastify optional mDNS | one advertiser/interface decision |
| Backup/restore | existing legacy/admin and disposable v4 tooling | Fastify/storage-v2 operator tooling | key custody, schedule, restore authorization |

The source contains a canonical writer lease and rejects simultaneous canonical
writers in disposable tests. No operational freeze or transfer was performed.

## 12. Backup and recovery readiness

The canonical encrypted backup implementation uses a versioned v4 envelope
around the v3 storage-v2 payload. It uses AES-256-GCM with a provider-neutral
key boundary; key material is not embedded in the archive. Historical keys may
remain decrypt-only and active-key rotation is explicit.

Disposable verification covers creation, verification, wrong-key rejection,
tampering, truncation, retention dry-run and fresh-root restore. Operational
readiness is still open until the operator decides and documents:

- external encryption key provider and custody;
- active/decrypt-only/retired key rotation policy;
- backup schedule and retention;
- archive access and restore authorization;
- RPO and RTO;
- restore validation and quarantine procedure;
- monitoring and alerting for failed backup, key and restore operations;
- maintenance window and writer quiescence policy.

No operational backup or key was read. Result: `DISPOSABLE_VERIFIED`, not
operational GO.

## 13. Two-service target architecture

The intended application topology is:

```text
                         external Dream infrastructure
             DNS + TLS + Traefik + generic OIDC/SAML provider
                         /                    \
                        /                      \
        store.prg32.dream.test            api.prg32.dream.test
                  |                                |
              Next.js:3000                    Fastify:5090
                  |                                |
                  +---------- private network --+
                                   |
                       canonical SQLite + object root
                         (single Fastify writer)
```

Properties required for the future handover:

- Traefik owns external TLS and routes the storefront to Next and API/auth/WS
  paths to Fastify;
- Next performs the same-origin browser proxy where that mode is retained;
- Fastify is the public API and firmware contract owner;
- Fastify owns canonical SQLite, immutable objects, publication journal,
  private staging and writer lease;
- federation callbacks terminate on the API origin;
- the Fastify HTTP port also owns WebSocket upgrade;
- mDNS is a separately approved LAN responsibility, not a Traefik substitute;
- encrypted backup-v4 is invoked only through authorized operator tooling;
- Authentik/generic OIDC/SAML, DNS, TLS and Traefik remain external services.

The root Compose topology is not changed by this milestone. The `flask`,
`auth-writer-init`, `auth-writer` and `auth-writer-edge-proxy` services remain
needed until their ownership responsibilities have been migrated and the
cutover has been authorized.

## 14. Operational acceptance matrix

| Gate | Current evidence | Classification | Remaining dependency | Routing change? | Maintenance? |
|---|---|---|---|---|---|
| A. Public DNS | Local resolver maps all names to loopback; external query NXDOMAIN | `PUBLICLY_OBSERVED` local / `NOT_VERIFIED` public | Deployment-network DNS evidence | No for observation | No |
| B. TLS certificate validity | Local mkcert certs cover expected names; public chain unverified | `PUBLICLY_OBSERVED` local | Public certificate and chain validation | No for observation | No |
| C. Storefront routing | Local store HEAD 200; Compose label targets Next:3000 | `SOURCE_VERIFIED` + `PUBLICLY_OBSERVED` local | Real Traefik router | Yes at cutover only | Maybe |
| D. API routing | API HEAD 200 identifies Werkzeug/Flask | `PUBLICLY_OBSERVED` local | Authorized Fastify router switch | Yes | Yes |
| E. WebSocket routing | Synthetic TLS/WSS and candidate route tests pass | `DISPOSABLE_VERIFIED` | Real Traefik WSS upgrade/reconnect | Yes | Yes |
| F. OIDC discovery/issuer | Root SSO well-known returns 404; issuer path unknown | `NOT_VERIFIED` | Operator-supplied issuer/discovery | No, unless provider route differs | No |
| G. OIDC client registration | Source contract only; no real client registration | `REQUIRES_OPERATOR_ACCESS` | Client ID, secret reference and redirect registration | No | Maybe |
| H. OIDC callback | Synthetic callback, PKCE, nonce and session rotation pass | `DISPOSABLE_VERIFIED` | Real provider and edge callback | Yes at cutover | Yes |
| I. SAML metadata/entity ID | Generic provider model and SP metadata route exist; real metadata absent | `NOT_VERIFIED` | Provider-specific metadata/entity IDs | No, unless registration changes | No |
| J. SAML ACS registration | Source requires API-origin ACS; no provider registration read | `REQUIRES_OPERATOR_ACCESS` | ACS/entity/audience registration | No | Maybe |
| K. SAML signed callback | Synthetic signed callback and validation pass | `DISPOSABLE_VERIFIED` | Real IdP signing cert and response | Yes at cutover | Yes |
| L. Identity reconciliation | Explicit mappings, uniqueness and no email auto-link pass disposable tests | `DISPOSABLE_VERIFIED` | Authorized real identity inventory | No | Yes |
| M. Disabled-account reconciliation | Disabled state preserved in synthetic provisioning | `DISPOSABLE_VERIFIED` | Real account-state reconciliation | No | Yes |
| N. Controlled re-login | Cookie translation is rejected; new Fastify session policy is documented | `DISPOSABLE_VERIFIED` | User notice and approved session window | No | Yes |
| O. Legacy writer freeze | No operational freeze performed | `REQUIRES_CHANGE_AUTHORIZATION` | Freeze schedule and owner approval | No | Yes |
| P. Canonical writer ownership | Writer lease and single-writer rejection pass disposable tests | `DISPOSABLE_VERIFIED` | Live lease acquisition/relinquishment | Yes | Yes |
| Q. Complete legacy snapshot | M5.2b tooling exists; no operational snapshot authorized here | `DISPOSABLE_VERIFIED` synthetic / `REQUIRES_OPERATOR_ACCESS` operational | Final immutable source snapshot | No | Yes |
| R. Canonical migration verification | M5.2c/M5.2d differential evidence and current backend suite pass | `DISPOSABLE_VERIFIED` | Final source-to-target manifest | No | Yes |
| S. Encrypted backup verification | v4 wrong-key/tamper/restore tests pass | `DISPOSABLE_VERIFIED` | Operational backup archive and schedule | No | Maybe |
| T. Backup key custody | Provider-neutral key boundary exists; real custody absent | `REQUIRES_OPERATOR_ACCESS` | Key provider, rotation and retention decision | No | No |
| U. Restore authorization | Disposable explicit authorization exists; operational approval absent | `REQUIRES_OPERATOR_ACCESS` | Named approver and restore procedure | No | Maybe |
| V. Monitoring and alerting | Readiness/logging contracts exist; production alert wiring absent | `REQUIRES_OPERATOR_ACCESS` | Metrics, alerts and on-call ownership | No | No |
| W. Firmware write compatibility | Scores/runs/metrics contract and differential tests pass disposablely | `DISPOSABLE_VERIFIED` | Freeze/reconcile live firmware writes | No | Yes |
| X. Post-cutover rollback policy | Single-writer rollback state machine and data-loss limits documented | `SOURCE_VERIFIED` policy / `REQUIRES_CHANGE_AUTHORIZATION` execution | Approved data-loss/reconciliation decision | No | Yes |
| Y. Observation period | No real cutover or observation period exists | `REQUIRES_CHANGE_AUTHORIZATION` | Approved window and success criteria | No | Yes |
| Z. Flask retirement gate | API still observes Flask; legacy routes and data remain required | `REQUIRES_CHANGE_AUTHORIZATION` | All ownership, rollback and compatibility gates | Yes | Yes |

## 15. Security and redaction

The report contains no passwords, client secrets, API tokens, session cookies,
private keys, backup key material, user records or identity mappings. Provider
configuration was handled only as field names and presence/contract
requirements.

The mkcert certificate's local machine identity was intentionally omitted from
the report. The public probes did not persist response bodies, cookies or
authentication headers. No TLS-validation bypass was used.

The candidate runtime keeps operational backup and mDNS disabled, uses
explicit disposable authorization markers, binds disposable ports to loopback,
runs as the `node` user and uses read-only containers with a temporary `/tmp`
filesystem. These properties do not automatically transfer to an operational
deployment; production values require a separately reviewed configuration.

## 16. Implementation changes

No application, Compose, Dockerfile, routing, federation, database or
operational configuration change was made for M5.2g.17.

Exactly one new file was created:

- `docs/modernization/103-operational-infrastructure-m5-2g-17.md`

The existing dirty worktree was preserved. Disposable Docker containers and
their candidate network were removed after the smoke test. Candidate images
were retained by Docker; no image/volume/system prune was executed.

## 17. Verification results

All commands below were executed with Node.js 24 selected through nvm where
applicable.

| Command/check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 49 test files, 242 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 test files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir frontend run test:e2e` | PASS — 5 Playwright tests |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |
| Candidate configuration preflight with canonical disposable variables | PASS — all 11 checks |
| Candidate Node 24 multi-stage Docker build | PASS |
| Candidate Fastify/Next readiness after explicit disposable initialization | PASS — both `/ready` returned 200 |
| Candidate discovery through Next proxy | PASS — API/store/WS URLs used configured origins |
| Candidate containers/network cleanup | PASS — no `prg32-m52g17*` containers or networks remained |

The first disposable candidate start was intentionally diagnosed rather than
ignored: it failed closed because the explicit canonical SQLite file had not
yet been initialized. The retry ran `candidate-init-cli` against a fresh
temporary root, started the candidate successfully and then removed only that
disposable project. This confirms the required initialization boundary and is
not a failure of operational infrastructure.

Public observation result summary:

| Observation | Result |
|---|---|
| Local DNS resolution | `127.0.0.1` for all three expected names |
| External DNS resolver | `NXDOMAIN` for all three `.test` names |
| Local TLS hostname coverage | Expected wildcard coverage observed; mkcert development issuer |
| Store HEAD | HTTP/2 200 |
| API HEAD | HTTP/2 200, Werkzeug/Flask |
| SSO HEAD | HTTP/2 302 to Authentik login flow |
| SSO root OIDC well-known | HTTP/2 404; issuer path not inferred |
| Real authenticated browser flow | NOT EXECUTED by authorization |
| Real WSS upgrade | NOT EXECUTED by authorization |
| SAML metadata/callback | NOT EXECUTED; provider path/config unavailable |

## 18. Remaining P0/P1/P2 blockers

### P0 — cutover blockers

- Real deployment-network DNS and TLS chain evidence is absent.
- API public ownership is still Flask/Werkzeug.
- Fastify public Traefik router and WebSocket upgrade are not verified.
- No live single-writer handover or legacy freeze has been authorized.
- No final operational legacy snapshot or source-to-canonical acceptance
  manifest exists.
- Real OIDC/SAML issuer, client registration, ACS registration, certificates,
  secret references and identity mappings are not verified.

### P1 — acceptance blockers

- Backup key custody, schedule, retention, RPO/RTO, restore authorization and
  monitoring are undecided.
- Firmware scores, metrics, download telemetry, publication and review writes
  need a final freeze/reconciliation window.
- Controlled re-login communication, cookie policy and observation window need
  owner approval.
- mDNS advertiser/interface ownership is not accepted operationally.
- Production health, alerting and rollback evidence is not available.

### P2 — cleanup after ownership transfer

- Consolidate `auth-writer-init` into the Fastify startup/operational
  initialization procedure only after a safe replacement exists.
- Remove the selected auth edge proxy after Fastify directly owns those paths.
- Remove Flask and legacy Python images only after the Flask retirement gate.
- Remove duplicated dev-only mounts and legacy fallback environment variables
  only after compatibility and rollback windows close.

## 19. Required future authorizations

The next operationally meaningful action requires explicit approval for a
controlled pre-cutover window, including:

1. production-network DNS/TLS/Traefik observation or change;
2. operator-provided generic OIDC/SAML metadata and secret references;
3. final legacy snapshot and immutable object inventory;
4. canonical migration and differential acceptance;
5. backup key custody, retention and restore authorization;
6. writer freeze, lease transfer and maintenance communication;
7. real browser/API/WebSocket smoke checks;
8. rollback data-loss/reconciliation policy and observation period.

None of these authorizations is granted by M5.2g.17.

## 20. Recommended next milestone

The next milestone should be a separately authorized operational pre-cutover
window that closes the P0/P1 gates above without changing ownership in the
same step. It should begin with operator-supplied deployment-network evidence
for Traefik, DNS, TLS and generic provider registration, then produce a final
legacy snapshot and canonical acceptance manifest. It must retain an explicit
abort path that leaves Flask authoritative.

Do not remove Flask, activate the candidate publicly, provision real
providers, or change Docker/Traefik as part of this report.

## 21. GO/NO-GO decisions

| Decision | Result |
|---|---|
| Repository configuration audit | **GO** — current source and candidate topology are mapped |
| Disposable Fastify + Next compatibility | **GO** — candidate builds, initializes and reaches readiness |
| Generic OIDC/SAML implementation readiness | **GO disposable / NO-GO live** — real provider values and registration are absent |
| Public Dream infrastructure acceptance | **PARTIAL** — only local loopback observations are available |
| Read-only operational preflight | **`READ_ONLY_OPERATIONAL_PREFLIGHT_PARTIAL`** |
| Operational cutover | **`OPERATIONAL_CUTOVER_NO_GO`** |
| Flask retirement | **`FLASK_RETIREMENT_NO_GO`** |
| M5.2g.18 | **NOT STARTED** |
| M6.3d.2h.12 | **NOT STARTED** |

