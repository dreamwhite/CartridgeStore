# PRG32 Cartridge Store — M5.2g.13 Operational Acceptance & Infrastructure Verification

Date: 2026-10-14  
Node.js: 24.20.0 selected with `nvm use 24`  
Decision: **GO for local implementation and controlled observational preflight; NO-GO for operational cutover and Flask retirement**

## 1. Executive result

M5.2g.13 closed the local P0 implementation defect in the Next.js build: the
standard build no longer requires `FLASK_PROXY_TARGET`. The standard proxy now
uses the backend-neutral `PRG32_API_UPSTREAM`, defaults to the Fastify service,
and retains Flask only through an explicit legacy configuration path.

The isolated two-service candidate remains functional:

- exactly two application services: `fastify` and `next`;
- both candidate containers reached `healthy`;
- `/ready` returned 200 through Next.js;
- discovery returned the API origin
  `https://api.prg32.dream.test/api`;
- discovery returned the storefront origin
  `https://store.prg32.dream.test/`;
- the multiplayer URL was
  `wss://api.prg32.dream.test/api/multiplayer`;
- final runtime images contained neither Python nor Flask executables.

The real Dream endpoints were observed only with the permitted low-volume DNS,
TLS, HTTP GET/HEAD and public metadata probes. They still expose the
transitional Flask owner for the public API, and the real Traefik routing,
provider registrations, browser cookie behavior, writer handover and
production key custody remain unverified. No operational cutover is
authorized by this milestone.

## 2. Safety and authorization

The complete M5.2g.13 brief was read before implementation. The work stayed
within its controlled read-only boundary:

- no real Traefik or Authentik configuration was changed;
- no operational Compose file, environment file, container, SQLite database,
  object root, backup, bind mount, DNS record or certificate was changed;
- no real login, OIDC flow, SAML flow, token request or administration
  interface was used;
- no POST, PUT, PATCH or DELETE request was sent to the public hostnames;
- no WebSocket authentication token was sent to a public service;
- no production data or production secret was read;
- `../PRG32` was inspected read-only and was not modified;
- no commit, push or deployment was performed;
- the modernization roadmap and previous reports were not rewritten;
- M5.2g.14 and M6.3d.2h.12 were not started.

The repository was already heavily dirty before this milestone. Existing
changes were preserved. The sibling repository already had the unrelated
untracked files `docs/quickstart-qemu.md` and `run-qemu`; they were not
modified.

## 3. Source review

The following current source and configuration was reviewed:

- `frontend/next.config.ts`;
- `frontend/next.config.candidate.mjs`;
- `frontend/Dockerfile`, `frontend/Dockerfile.candidate` and
  `frontend/Dockerfile.dev`;
- `deploy/candidate/compose.yaml` and the root `docker-compose.yml`;
- `backend/src/app.ts`, `backend/src/auth/`, `backend/src/preflight/`,
  `backend/src/storage-v2/`, `backend/src/catalog/`,
  `backend/src/multiplayer/`, `backend/src/discovery/` and federation code;
- `frontend/src/app/`, `frontend/src/lib/` and the API/origin clients;
- modernization reports 19, 79–98, with particular attention to reports 96,
  97 and 98;
- the actual canonical SQLite/storage-v2 implementation and backup-v4 tests;
- `../PRG32` firmware documentation and tests for the discovery ABI,
  metadata ABI, colophon ABI, mDNS service and architecture identifiers.

The current canonical tuple remains:

```text
schema version:              2
storage layout version:      2
publication journal version: 1
backup payload version:       3
encrypted backup envelope:   v4
```

The root operational Compose file was checked with `git diff --quiet` and was
unchanged by this milestone.

## 4. Frontend proxy modernization

### Previous defect

The normal `frontend/next.config.ts` rejected every production build that did
not define `FLASK_PROXY_TARGET`. That made a future Fastify-only production
build impossible without retaining a Flask-specific build dependency.

### Implemented behavior

`frontend/src/lib/next-proxy.ts` now resolves the target with this explicit
precedence:

| Configuration | Meaning |
|---|---|
| `PRG32_API_UPSTREAM` | Standard backend-neutral upstream; intended for Fastify |
| `FLASK_PROXY_TARGET` with the first variable absent | Explicit transitional Flask compatibility path |
| neither variable | Safe Fastify default `http://fastify:5090` |
| both variables | Build fails closed due to ambiguous ownership |

The resolver validates HTTP(S), rejects credentials/query/fragment values, and
retains the production loopback rejection for the explicit Flask path. It does
not silently choose Flask. Existing rewrite paths, cookie forwarding,
`Set-Cookie`, CSRF, ETag, Range, binary streaming and API response handling
remain Next.js rewrite behavior; this change only changes how the upstream is
selected.

The standard multi-stage `frontend/Dockerfile` now carries
`PRG32_API_UPSTREAM` instead of a Flask build argument. The candidate
configuration and candidate Compose file use the same neutral variable. The
root operational Compose file still explicitly sets its existing Flask target
for the transitional development profile and was not changed.

The standard Dockerfile still declares an empty optional
`FLASK_PROXY_TARGET` build argument so an existing Flask image build can opt in
to the legacy path explicitly. It is not populated by default and is rejected
when combined with `PRG32_API_UPSTREAM`.

The legacy path remains documented in `frontend/README.md` and
`frontend/.env.example`. A direct Flask development process must explicitly
run:

```bash
FLASK_PROXY_TARGET=http://127.0.0.1:5080 pnpm run dev
```

A Fastify process uses:

```bash
PRG32_API_UPSTREAM=http://127.0.0.1:5090 pnpm run dev
```

The two variables must not be set together.

### Compatibility result

The following all passed:

- production build with neither target variable, using the Fastify default;
- production build with `PRG32_API_UPSTREAM=http://fastify:5090`;
- production build with an explicit non-loopback
  `FLASK_PROXY_TARGET=https://flask.internal:5080`;
- unit tests for default selection, Fastify selection, legacy selection,
  ambiguity rejection, unsafe URL rejection and production loopback rejection;
- existing frontend typecheck, lint and test suites.

This proves build/configuration compatibility. It does not prove that the
real production Fastify service is reachable through the real edge.

## 5. Two-service runtime dependency audit

### Candidate runtime classification

| Component | Classification | Evidence and remaining role |
|---|---|---|
| Fastify Node process | `ACTIVE_RUNTIME` | Candidate image runs `node dist/server.js`, owns the canonical disposable SQLite writer lease and storage-v2 routes. |
| Next.js Node process | `ACTIVE_RUNTIME` | Candidate image runs the standalone Next server and proxies to `PRG32_API_UPSTREAM`. |
| Node 24, pnpm and TypeScript compiler | `BUILD_ONLY` | Multi-stage build dependencies; not required as development toolchains in the final runtime image. |
| Python and Flask | absent from candidate runtime | The final candidate runtime image probes found neither `python3` nor `flask`. Flask remains in the repository only as a transitional/rollback authority. |
| Legacy SQLite fallback variables | disabled in candidate | Candidate preflight rejects legacy `PRG32_*` database/store fallback variables. |
| `index.json`/`ReadonlyCatalog` legacy authority | not selected in candidate | Candidate uses canonical storage-v2 mode and explicit canonical paths. Legacy source code remains for compatibility and rollback. |
| `auth-writer` | not present in candidate | Its responsibilities are consolidated into the Fastify candidate service. |
| `auth-writer-init` | not present in candidate | Candidate storage is initialized explicitly against a disposable root before startup. |
| `auth-writer-edge-proxy` | not present in candidate | Candidate has no second proxy; external edge ownership remains a future operational gate. |
| Migration and rollback CLIs | `MIGRATION_ONLY` / `ROLLBACK_ONLY` | Developer tooling remains available but is not imported as a runtime service dependency. |

The candidate Dockerfile has build-stage native dependencies (`python3`,
`make`, `g++`) to compile Node modules. The final runtime stage is a fresh
`node:24-bookworm-slim` stage and does not include those tools.

The transitional dependencies that remain are intentional: Flask route
ownership, Flask data compatibility, controlled session re-login, and the
external Traefik/provider boundary. They are not silently removed by this
milestone.

## 6. Public DNS observations

Observation time: 2026-10-14, low-volume local infrastructure probes.

The macOS resolver returned `127.0.0.1` for each configured development
hostname:

| Hostname | Resolver observation | Interpretation |
|---|---|---|
| `store.prg32.dream.test` | `127.0.0.1` | Local/private Dream development mapping observed; public DNS delegation not proven. |
| `api.prg32.dream.test` | `127.0.0.1` | Local/private Dream development mapping observed; public DNS delegation not proven. |
| `sso.dream.test` | `127.0.0.1` | Local/private Dream development mapping observed; public DNS delegation not proven. |

Decision: **NOT_VERIFIED for public DNS**. No resolver boundary was bypassed
and no alternative credentials or network path was attempted.

## 7. Public TLS observations

Only HTTPS HEAD requests and TLS metadata were collected. No cookies or
authorization headers were stored.

| Hostname | TLS observation | Result |
|---|---|---|
| `store.prg32.dream.test` | TLS 1.3; local mkcert development certificate; hostname verification succeeded; validity observed from 2026-10-13 to 2029-01-13 UTC. | `OBSERVED` locally, not production proof |
| `api.prg32.dream.test` | TLS 1.3; local mkcert development certificate; hostname verification succeeded; same observed validity window. | `OBSERVED` locally, not production proof |
| `sso.dream.test` | TLS 1.3; local mkcert development certificate; hostname verification succeeded; validity observed from 2026-09-12 to 2028-12-12 UTC. | `OBSERVED` locally, not production proof |

The certificate subject/issuer names were intentionally omitted from this
report because they identify the local workstation and add no acceptance
value. The chain was trusted by the local mkcert trust store; this does not
prove public CA trust or deployment certificate ownership. HSTS was not
present in the filtered response headers during these probes.

Decision: **NOT_VERIFIED for production TLS and certificate-chain ownership**.

## 8. Public routing observations

The following non-mutating HEAD/GET observations were performed without
following an authentication redirect:

| Request | Observation |
|---|---|
| `HEAD https://store.prg32.dream.test/` | `200`, `text/html`, `Cache-Control: no-store` |
| `HEAD https://store.prg32.dream.test/api/games` | `200`, `application/json`, `Server: Werkzeug/3.1.9 Python/3.13.16` |
| `HEAD https://api.prg32.dream.test/api/games` | `200`, `application/json`, `Server: Werkzeug/3.1.9 Python/3.13.16` |
| `HEAD https://api.prg32.dream.test/.well-known/prg32-store.json` | `200`, `application/json`, `Server: Werkzeug/3.1.9 Python/3.13.16` |
| `HEAD https://sso.dream.test/` | `302`, relative redirect to `/flows/-/default/authentication/?next=/`, `Server: uvicorn`; redirect was not followed |

These observations are valuable evidence that the current live API surface is
still Flask-owned. They are not evidence of Fastify public ownership.

Decision: **NO-GO for operational public routing**. The real Traefik route
ownership, forwarded-header trust boundary, `Set-Cookie`, CSRF, ETag, Range,
binary streaming and WebSocket upgrade remain a separately authorized gate.

## 9. Public OIDC/SAML metadata observations

The tracked repository documents the generic provider origin as
`https://sso.dream.test` and the generic OIDC discovery convention as
`/.well-known/openid-configuration`. The permitted read-only probe returned:

- `GET https://sso.dream.test/.well-known/openid-configuration`: `404`, HTML;
- `HEAD https://api.prg32.dream.test/auth/saml/metadata`: `404`, HTML;
- `HEAD https://api.prg32.dream.test/api/auth/saml/metadata`: `404`, HTML.

No provider-specific SAML path was guessed or enumerated. No provider admin
interface, client registration, credential, token, callback or login was
accessed.

Decision: **NOT_VERIFIED** for live OIDC registration/discovery/JWKS and live
SAML registration/metadata/certificate configuration. The `302` from the SSO
root is only a public redirect observation and does not establish provider
registration correctness.

## 10. Browser acceptance results

No real browser session was created against the Dream infrastructure. No
Playwright dependency was reintroduced: the repository had intentionally
removed the heavyweight real-provider E2E path, and the current authorization
forbids real authentication. The existing synthetic edge suite uses real
TCP/TLS/HTTP/WebSocket protocol paths but is not browser evidence.

Local preparation for a future disposable browser run is present:

- explicit `store.prg32.dream.test` and `api.prg32.dream.test` origin
  contracts;
- backend-neutral Next rewrite selection;
- exact-origin CORS and credentialed API client behavior;
- secure/HttpOnly/SameSite session contract in Fastify;
- CSRF, session rotation, logout and federation correlation tests;
- disposable TLS edge and WSS test infrastructure in
  `backend/tests/edge-federation.test.ts`.

The following browser-only items remain **NOT_VERIFIED**:

- browser navigation across the two real origins;
- browser cookie host scoping and SameSite enforcement;
- real local login/logout in a browser;
- return-to-storefront behavior through a real provider;
- real OIDC and SAML browser callbacks;
- real WSS upgrade in the Dream edge.

No browser result is claimed from HTTP-client or Fastify injection tests.

## 11. Authentication configuration

The implementation remains provider-neutral. It does not contain Authentik-
specific runtime assumptions. Synthetic contracts verify:

- OIDC issuer/discovery/JWKS origin binding;
- API-origin callback path;
- `openid`, PKCE, state and nonce requirements;
- signed token/JWKS validation, identity mapping and disabled-user handling;
- session rotation and replay rejection;
- SAML SP entity, ACS, IdP entity, SSO endpoint, audience, destination and
  recipient validation;
- signed response/assertion requirements and replay protection;
- generic secret references rather than secret values.

The API origin owns callbacks and the storefront origin owns browser pages in
the intended two-origin model. No email-only identity auto-linking is used.
The real provider-side redirect/ACS registration and external subject mapping
remain unverified.

## 12. Discovery and firmware compatibility

Read-only inspection of `../PRG32` confirmed the companion expectations:

- discovery ABI: `prg32-store-discovery-1.0`;
- metadata ABI: `prg32-metadata-1.0`;
- colophon ABI: `prg32-colophon-1.0`;
- mDNS service: `_prg32store._tcp.local.`;
- architectures: `esp32c6` and `qemu`.

The candidate HTTP discovery response was observed as:

```text
abi:          prg32-store-discovery-1.0
api:          https://api.prg32.dream.test/api
web:          https://store.prg32.dream.test/
cartridges:   https://api.prg32.dream.test/api/games
multiplayer:  wss://api.prg32.dream.test/api/multiplayer
```

The backend contract tests preserve the documented firmware endpoints and
architecture identifiers. No real mDNS announcement was made; the candidate
has mDNS disabled. Decision: **GO for local contract compatibility; NO-GO for
operational firmware routing and mDNS ownership until the edge/network gate is
authorized and verified**.

## 13. Writer ownership

The canonical write boundary was tested with disposable storage only. The
candidate preflight and runtime tests verify:

- one canonical SQLite path;
- one Fastify writer lease;
- fail-closed startup for missing/unsafe candidate authorization;
- no legacy database fallback in candidate mode;
- no `auth-writer`, `auth-writer-init` or edge-proxy dependency in the
  two-service candidate;
- publication, review, authentication, telemetry, scores, runs, metrics and
  settings use the tested canonical/write isolation boundaries.

The operational preflight intentionally failed:

- `single_writer_owner`: `FAIL` because the supplied operational declaration
  still named `flask`;
- `runtime_support_boundary`: `NOT_VERIFIED` because Flask still owns
  operational routes.

This is the expected safe result. No operational writer lease was acquired,
and Flask was not frozen. Decision: **GO for disposable writer isolation;
NO-GO for operational ownership transfer**.

## 14. Reconciliation readiness

The existing full-reimport strategy remains the safe future sequence:

1. freeze all Flask writes;
2. capture a final consistent source snapshot;
3. inventory all legacy data;
4. create a fresh canonical target;
5. perform the full import;
6. verify counts, relationships and object hashes;
7. verify private staging and publication journal state;
8. verify identities, disabled accounts, scores, metrics and telemetry;
9. run differential HTTP and firmware checks;
10. accept or reject the final manifest.

Synthetic evidence is positive:

- migration and resume tests passed;
- differential Flask/canonical tests passed;
- source immutability and exact-object checks passed;
- backup-v4 and restore tests passed;
- canonical writer/lease tests passed.

No operational snapshot, real-data import, write freeze, manifest acceptance or
reverse migration was performed. Decision: **GO for disposable rehearsal;
NO-GO for operational reconciliation**.

## 15. Backup and rollback

M5.2g.13 reused the existing M5.2e/M5.2g.8 backup-v4 implementation rather
than adding another backup framework. Disposable tests cover authenticated
encryption, historical key handling, wrong-key/tampered-ciphertext rejection,
interrupted backup/restore states, fresh-root restore, canonical integrity and
single-writer rollback state.

Operational decisions remain open:

- external key custody and rotation ownership;
- retention policy;
- RPO and RTO;
- restore authorization and maintenance mode;
- monitoring/alerting for backup and writer failures;
- accepted post-cutover data-loss policy;
- reconciliation of writes made after a possible cutover.

The rollback model remains:

- **pre-cutover abort:** discard the disposable target and keep Flask
  authoritative;
- **post-cutover rollback:** stop the new writer, control traffic, reconcile
  post-cutover writes, and restore a consistent legacy-compatible state;
- restarting Flask alone is not sufficient if Fastify accepted writes after
  the source snapshot;
- the choice between accepted data loss, export/reconciliation and forward fix
  requires an explicit operational decision.

Decision: **GO for disposable backup/restore evidence; NO-GO for operational
backup key custody and rollback authorization**.

## 16. Operational acceptance matrix

`GO (local)` means that the repository-level or disposable evidence passed. It
does not authorize production ownership. `NOT_VERIFIED` means that the
required real infrastructure evidence was not collected. `NO-GO` means the
gate must block cutover.

| Gate | Current evidence | Observed result | Remaining blocker | Severity | Required authorization | Decision |
|---|---|---|---|---|---|---|
| 1. Public DNS | Local resolver maps all three hosts to loopback | Local only | Public DNS/delegation not proven | P1 | Read-only external DNS acceptance | NOT_VERIFIED |
| 2. Public TLS | TLS 1.3 and local mkcert verification succeeded | Local only | Production certificate trust/ownership not proven | P1 | Real edge TLS observation | NOT_VERIFIED |
| 3. Traefik route ownership | Candidate has no edge labels; tracked dev labels are transitional | Not verified | Real routers and priorities | P1 | Edge read-only acceptance | NO-GO |
| 4. Next.js storefront | Candidate Next container healthy and `/ready` passed | Disposable pass | Real storefront route ownership | P1 | Edge acceptance | GO (local) / NO-GO (operational) |
| 5. Fastify API routing | Candidate proxy and direct Fastify tests pass | Disposable pass | Real API hostname still returns Flask | P1 | Ownership cutover | GO (local) / NO-GO (operational) |
| 6. Firmware HTTP contracts | Full backend contract/compatibility tests pass | Local pass | Live API owner remains Flask | P1 | Final route acceptance | GO (local) / NO-GO (operational) |
| 7. WebSocket WSS | Synthetic TLS edge WSS test passes | Synthetic pass | Real Traefik upgrade and auth boundary | P1 | Edge WSS verification | GO (synthetic) / NO-GO (operational) |
| 8. OIDC registration | Generic synthetic provider contracts pass | Synthetic pass | Provider-side client/redirect registration | P1 | Provider administrator authorization | NOT_VERIFIED |
| 9. OIDC callback | Synthetic signed callback and session rotation pass | Synthetic pass | Real provider callback | P1 | Controlled browser/provider test | NOT_VERIFIED |
| 10. SAML registration | Generic SAML validation passes | Synthetic pass | Provider metadata/certificate registration | P1 | Provider administrator authorization | NOT_VERIFIED |
| 11. SAML callback | Synthetic signed HTTP-POST callback passes | Synthetic pass | Real provider/browser callback | P1 | Controlled browser/provider test | NOT_VERIFIED |
| 12. Browser cookies | Protocol tests assert cookie flags and rotation | No real browser | Actual two-origin browser behavior | P1 | Disposable browser acceptance | NOT_VERIFIED |
| 13. CSRF | Backend and client regression tests pass | Local pass | Real edge cookie/header forwarding | P1 | Edge acceptance | GO (local) / NO-GO (operational) |
| 14. Local authentication | Fastify auth/session tests pass | Disposable pass | Production session boundary and re-login decision | P1 | Operational auth handover | GO (local) / NO-GO (operational) |
| 15. Canonical SQLite | Schema, integrity, lease and canonical tests pass | Disposable pass | Final production snapshot | P0 | Source freeze and migration authorization | GO (local) / NO-GO (operational) |
| 16. Immutable objects | Exact bytes/hashes and storage-v2 tests pass | Disposable pass | Production object inventory | P0 | Final source inventory | GO (local) / NO-GO (operational) |
| 17. Writer ownership | Candidate lease passes; operational preflight rejects Flask owner | Safe fail-closed | Flask still owns writes | P0 | Explicit writer handover | GO (local) / NO-GO (operational) |
| 18. Publication/review | Canonical workflow and recovery tests pass | Disposable pass | Operational publication ownership | P1 | Workflow handover | GO (local) / NO-GO (operational) |
| 19. Scores | Canonical scores/rate-limit tests pass | Disposable pass | Operational write ownership | P1 | Telemetry ownership decision | GO (local) / NO-GO (operational) |
| 20. Runs/metrics | Canonical runs/metrics tests pass | Disposable pass | Operational ingestion ownership | P1 | Telemetry ownership decision | GO (local) / NO-GO (operational) |
| 21. Download telemetry | Canonical download telemetry test passes | Disposable pass | Real API route still Flask | P1 | Route/writer handover | GO (local) / NO-GO (operational) |
| 22. Backup encryption | Backup-v4 encryption tests pass | Disposable pass | Production key and maintenance policy | P0 | Key custody authorization | GO (local) / NO-GO (operational) |
| 23. Key custody | Preflight accepts references only; no production key inspected | Not verified | Custodian, rotation and recovery process | P0 | Security/key-owner decision | NOT_VERIFIED |
| 24. Restore | Fresh-root, integrity and interruption tests pass | Disposable pass | Operational restore authorization/RTO | P0 | Restore rehearsal authorization | GO (local) / NO-GO (operational) |
| 25. Monitoring | No live monitoring integration inspected | Not verified | Alerts, dashboards, on-call owner | P1 | Operations authorization | NOT_VERIFIED |
| 26. Rollback | Disposable state machine and tests pass | Synthetic pass | Post-cutover write reconciliation policy | P0 | Cutover/rollback decision | GO (local) / NO-GO (operational) |
| 27. mDNS | ABI/service contract tests pass; candidate disabled | Local pass | LAN interface and ownership | P2 | Explicit LAN announcement decision | GO (contract) / NO-GO (operational) |
| 28. Legacy reconciliation | Migration, differential and backup evidence pass synthetically | Disposable pass | Real source snapshot and manifest acceptance | P0 | Data migration authorization | GO (local) / NO-GO (operational) |
| 29. Flask retirement | Public API still reports Werkzeug; Flask boundary remains | Not ready | Full route/write/edge handover | P0 | Separate retirement authorization | NO-GO |

## 17. Implementation changes

Changes attributable to M5.2g.13:

- `frontend/src/lib/next-proxy.ts` — backend-neutral upstream resolver;
- `frontend/src/lib/next-proxy.test.ts` — resolver regression tests;
- `frontend/next.config.ts` — use the neutral upstream for all existing
  rewrites and keep explicit Flask compatibility;
- `frontend/Dockerfile` — standard multi-stage build now uses
  `PRG32_API_UPSTREAM` and has no Flask WebSocket build default;
- `frontend/next.config.candidate.mjs` — candidate variable aligned to
  `PRG32_API_UPSTREAM`;
- `frontend/Dockerfile.candidate` — candidate build/runtime variable aligned;
- `deploy/candidate/compose.yaml` — candidate proxy variable aligned;
- `frontend/.env.example` — standard and explicit legacy paths documented;
- `frontend/README.md` — direct development/build instructions corrected;
- `docs/modernization/99-operational-acceptance-m5-2g-13.md` — this report.

No backend production behavior, database schema, root operational Compose
service, public route or authentication behavior was changed in this
milestone. Existing modified/untracked files from prior milestones were not
cleaned or reset.

## 18. Test additions

The only new test file for this milestone is:

- `frontend/src/lib/next-proxy.test.ts` — six tests covering default Fastify,
  configured Fastify, explicit Flask compatibility, ambiguity rejection,
  unsafe target rejection and loopback rejection.

Existing M5.2g tests were rerun rather than duplicated. The targeted evidence
sets were:

- OIDC/SAML/edge/preflight/dual-origin: 5 files, 25 tests, all passed;
- migration/backup-v4/backup/differential/candidate: 5 files, 24 tests, all
  passed.

No Playwright package or real-provider browser suite was added.

## 19. Full verification results

All commands below were executed with Node 24 selected where applicable.

| Command/check | Result |
|---|---|
| `source "$HOME/.nvm/nvm.sh"; nvm use 24` | PASS — Node 24.20.0 |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 47 files, 237 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run test:hmr` | PASS — built HMR message received |
| `env -u PRG32_API_UPSTREAM -u FLASK_PROXY_TARGET pnpm --dir frontend run build` | PASS — default Fastify target, no Flask variable |
| `PRG32_API_UPSTREAM=http://fastify:5090 pnpm --dir frontend run build` | PASS — explicit Fastify build |
| `FLASK_PROXY_TARGET=https://flask.internal:5080 pnpm --dir frontend run build` | PASS — explicit legacy Flask build |
| `docker build --file frontend/Dockerfile --tag prg32-cartridge-store-next:standard-m52g13 frontend` | PASS — standard Node 24 multi-stage image with Fastify default |
| `docker build --file frontend/Dockerfile --build-arg FLASK_PROXY_TARGET=https://flask.internal:5080 --tag prg32-cartridge-store-next:legacy-m52g13 frontend` | PASS — explicit legacy Flask image build |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |
| operational Compose unchanged check | PASS — no diff in `docker-compose.yml` |
| candidate initialization with explicit disposable authorization | PASS — schema/layout/journal/backup `2/2/1/3`, state `ready` |
| candidate Docker build | PASS — Fastify and Next Node 24 slim multi-stage images |
| candidate Docker health/readiness/discovery smoke | PASS — two healthy services; readiness 200; dual-origin discovery correct |
| candidate runtime dependency probe | PASS — Python and Flask absent from both runtime images |
| candidate configuration preflight | PASS |
| operational configuration preflight | Expected FAIL/NOT_VERIFIED — Flask writer and transitional boundary remain |
| public DNS/TLS/GET/HEAD probes | Observed locally; public/production status remains NOT_VERIFIED |

The first candidate smoke invocation sent its HTTP probe before Next had
finished becoming healthy. That probe was not counted as a pass; the
candidate was rerun with `docker compose up -d --wait`, after which both
services were healthy and all HTTP/discovery checks passed. Candidate cleanup
was scoped to the disposable Compose project; operational containers were not
touched.

The frontend test runner emitted a non-fatal Vitest/Vite native-config warning.
It did not alter the exit status or test result.

## 20. Remaining blockers

The critical blockers before an operational cutover are:

1. real Traefik ownership and route priority for both origins;
2. production DNS and certificate-chain acceptance;
3. real Fastify API ownership while preserving all firmware routes;
4. real WSS upgrade and trusted-proxy behavior;
5. provider-side generic OIDC/SAML registration at the external provider;
6. real two-origin browser acceptance, including cookie/CORS/CSRF behavior;
7. final source freeze and full-reimport manifest acceptance;
8. explicit Fastify writer lease and no simultaneous Flask writer;
9. production backup key custody, retention, RPO/RTO and restore authorization;
10. monitoring, alerting and operational ownership;
11. post-cutover rollback data-loss/reconciliation policy;
12. final decision on mDNS interface ownership;
13. only after all above: Flask route retirement and removal.

There is no unresolved local P0 or P1 implementation defect in the authorized
scope. The open P0/P1 items are operational gates, not silently waived code
defects.

## 21. Required future authorizations

Before collecting the missing live evidence, obtain explicit authorization for
each bounded action:

- read-only Dream edge/DNS/TLS acceptance;
- controlled synthetic-browser acceptance against disposable HTTPS origins;
- provider administrator registration verification without exposing secrets;
- final migration source freeze and real-data inventory;
- production key-custody and backup/restore rehearsal;
- writer ownership handover and rollback window;
- public routing change and eventual Flask retirement.

The current brief did not authorize any of these state-changing operations.

## 22. Recommended next milestone

The next milestone should be a separately authorized operational acceptance
window that closes the real edge, provider-registration, browser, monitoring,
key-custody and writer-ownership gates in that order. It should not begin with
Flask removal or a live migration. M5.2g.14 remains not started.

## 23. GO/NO-GO decisions

| Decision | Result |
|---|---|
| M5.2g.13 local implementation | **GO** |
| M5.2g.13 controlled observational preflight | **GO/PARTIAL** — observations are clearly separated from synthetic evidence |
| Backend-neutral Next.js build | **GO** |
| Flask compatibility path | **GO** — explicit legacy variable only |
| Two-service disposable runtime | **GO** |
| Real public operational acceptance | **NO-GO / NOT_VERIFIED** |
| Operational data migration | **NO-GO** |
| Fastify public ownership | **NO-GO** |
| Flask retirement | **NO-GO** |

This report is the only new Markdown artifact created for M5.2g.13. No
operational cutover, deployment, commit, push or later milestone was started.
