# PRG32 Cartridge Store — M5.2g.22 Final Functional Parity & Pre-Cutover Acceptance Audit

Date: 2026-10-14

## 1. Executive decision

Decision: **FUNCTIONAL_PARITY_PARTIAL**.

The Fastify/TypeScript and Next.js implementation has broad disposable
functional coverage and no new P0 application correctness defect was found in
the audited source. Canonical catalog, publication/review, telemetry,
authentication, synthetic OIDC/SAML, WebSocket, migration, backup-v4 and
restore flows are exercised by real HTTP, SQLite, filesystem, Docker or
browser tests.

Complete functional parity is not accepted because several required behaviors
remain either legacy-only, only partially represented in Next.js, or not
verified against the real external edge/provider and operational data. In
particular, Flask still owns public application traffic and the operational
single-writer handover has not occurred.

Separate decisions:

- **DISPOSABLE_CANDIDATE_GO** — the isolated two-service candidate builds,
  starts, serves health/readiness, and keeps canonical storage ownership.
- **OPERATIONAL_CUTOVER_NO_GO** — no production routing, data migration,
  writer handover, or real edge acceptance was performed.
- **FLASK_RETIREMENT_NO_GO** — Flask remains the public owner and is not
  removable yet.

Evidence labels:

- `SOURCE_VERIFIED` — established directly from source/configuration.
- `UNIT_VERIFIED` — isolated unit or component test passed.
- `INTEGRATION_VERIFIED` — real disposable HTTP/SQLite/filesystem integration
  passed.
- `BROWSER_VERIFIED` — disposable Playwright browser flow passed.
- `DOCKER_VERIFIED` — disposable image/container/configuration check passed.
- `DIFFERENTIAL_VERIFIED` — source-backed legacy/canonical comparison passed.
- `NOT_VERIFIED` — intentionally not exercised or not available in scope.
- `INTENTIONALLY_RETIRED` — no longer a required target surface by design;
  legacy compatibility remains documented where applicable.

## 2. Scope and safety boundary

Inspected:

- Flask route registration, blueprints/adapters, templates, storage and
  authentication modules;
- Fastify route registration, canonical storage, authentication, federation,
  telemetry, WebSocket and backup-v4 code;
- Next.js pages, API clients, rewrites and browser acceptance harness;
- candidate Dockerfiles and Compose configuration;
- historical modernization reports and the read-only `../PRG32` repository.

Changed in this milestone:

- `frontend/e2e/global-setup.mjs` now waits for storefront and API responses
  through the synthetic HTTPS edge before Playwright starts;
- this report.

The existing dirty worktree was preserved. No operational Compose file,
container, network, volume, database, object store, environment file, Traefik
configuration, Authentik configuration, DNS record, TLS certificate, Flask
process, Next.js operational process, or `../PRG32` file was modified. The
existing transitional auth-writer and Nginx bridge were not restarted.

Disposable candidate containers used a distinct Compose project and private
bridge network, not `dream_edge`. Their containers, network and temporary
canonical root were removed after verification. No commit, push, deployment,
real authentication, real data migration, or public routing change occurred.

## 3. Reconstructed Flask inventory

The route count was rebuilt rather than copied from the previous report.

| Metric | Current result | Interpretation |
|---|---:|---|
| Explicit Flask decorator path templates in the audited source | **77** | Includes the five conditional generic OIDC/SAML adapter paths; excludes Flask’s framework-generated static rule. |
| Default synthetic `app.url_map` unique path templates | **73** | Five conditional federation paths are disabled by default; the framework static rule is present. |
| Default synthetic Flask URL rules including method/alias rules | **86** | Counts separately registered rule/method combinations and aliases. |

The 77 explicit path templates are the stable source inventory used by the
existing parity audit. The 86 URL-rule figure is useful runtime evidence but
must not be presented as 86 distinct route paths. This resolves the ambiguity
in earlier reports that referred to 77 without distinguishing decorators,
conditional routes, aliases and framework-generated static serving.

The inventory was separated into these families:

| Family | Legacy source | Candidate disposition |
|---|---|---|
| Firmware/API contracts | `cartridge_store/app.py`, `scores.py`, `metrics.py`, `multiplayer.py` | Fastify canonical routes exist and are disposable-tested; operational ownership remains open. |
| User-facing HTML workflows | `templates/`, `cartridge_store/app.py`, `users.py`, `review.py` | Next.js equivalents cover the modern storefront/workspaces, but exact legacy HTML/URL parity is partial. |
| Administration | admin routes in `app.py`, auth, settings | Fastify API and Next admin surfaces exist; complete legacy HTML parity and operational ownership remain open. |
| Storage/data contracts | Flask SQLite, `index.json`, cartridge/media directories | Canonical SQLite/object storage is disposable-verified; production migration is not authorized. |
| Runtime/background behavior | `multiplayer.py`, `mdns.py`, backup and startup code | Fastify WebSocket/discovery and candidate runtime are isolated-tested; real edge/LAN behavior is not accepted. |
| Legacy aliases/surfaces | form aliases, `/api` informational index, setup/static compatibility | Retained or mapped where useful; not silently claimed as complete parity. |

### Compact parity matrix

| Required behavior | Legacy source | Candidate source | Verification | Evidence | Result | Limitation |
|---|---|---|---|---|---|---|
| Catalog listing/search/pagination | `cartridge_store/app.py` | `backend/src/catalog/`, Next catalog browser | HTTP, browser, differential | `INTEGRATION_VERIFIED`, `BROWSER_VERIFIED`, `DIFFERENTIAL_VERIFIED` | FULL in disposable scope | Public owner remains Flask. |
| Details, versions, architectures, media | `cartridge_store/app.py` | `backend/src/catalog/`, `/games/[gameId]` | HTTP and browser | `INTEGRATION_VERIFIED`, `BROWSER_VERIFIED` | FULL in disposable scope | Live firmware path not exercised. |
| Binary download and telemetry | `app.py`, `stats.py` | canonical catalog/workflow/telemetry | differential and canonical HTTP | `DIFFERENTIAL_VERIFIED`, `INTEGRATION_VERIFIED` | FULL in disposable scope | Operational write reconciliation open. |
| Local login/session/CSRF/tokens | `auth/__init__.py` | `backend/src/auth/`, account UI | auth tests and browser | `INTEGRATION_VERIFIED`, `BROWSER_VERIFIED` | FUNCTIONAL | Flask cookie/session continuity is intentionally not automatic. |
| Generic OIDC | `auth/oidc_adapter.py` | `backend/src/oidc/`, federation model | synthetic provider/browser | `INTEGRATION_VERIFIED`, `BROWSER_VERIFIED` | FUNCTIONAL synthetic | Real `sso.dream.test` acceptance not performed. |
| Generic SAML | `auth/saml_adapter.py` | `backend/src/saml/`, federation model | signed synthetic provider/browser | `INTEGRATION_VERIFIED`, `BROWSER_VERIFIED` | FUNCTIONAL synthetic | Real metadata/certificate/provider acceptance not performed. |
| Publish/staging/review/approval | `app.py`, `review.py` | `submission/`, `review/`, storage-v2 workflow | real disposable HTTP workflow | `INTEGRATION_VERIFIED` | FULL in disposable scope | Legacy history and operational writer transfer remain open. |
| Scores/leaderboard | `scores.py` | `backend/src/scores/` | canonical telemetry integration | `INTEGRATION_VERIFIED`, `DIFFERENTIAL_VERIFIED` | FUNCTIONAL | Live firmware write owner remains Flask. |
| Runs/samples/exports | `metrics.py` | `backend/src/metrics/`, metrics UI | canonical telemetry integration | `INTEGRATION_VERIFIED` | FUNCTIONAL | Complete browser export journey not separately E2E-tested. |
| Statistics | `stats.py` | `backend/src/stats/`, `/stats` | API/RTL/integration | `UNIT_VERIFIED`, `INTEGRATION_VERIFIED` | FUNCTIONAL | Exact legacy HTML visual parity is not claimed. |
| Users/groups/RBAC/settings/assets | `app.py`, `settings.py`, auth | `admin/`, `settings/`, Next admin | API/security tests | `INTEGRATION_VERIFIED` | PARTIAL | Full legacy admin HTML and operational writes remain open. |
| Backup-v4/restore | Flask backup plus storage-v2 target | `storage-v2/backup-v4.ts` | encrypted disposable archives | `INTEGRATION_VERIFIED` | FULL disposable | Production key custody, retention and monitoring not verified. |
| WebSocket relay | `multiplayer.py` | `backend/src/multiplayer/` | synthetic WSS browser/edge | `BROWSER_VERIFIED`, `INTEGRATION_VERIFIED` | FUNCTIONAL synthetic | Real Traefik upgrade and public ownership not verified. |
| mDNS/discovery | `mdns.py`, discovery document | `backend/src/discovery/` | source, unit, candidate image | `SOURCE_VERIFIED`, `DOCKER_VERIFIED` | OPTIONAL functional | Real LAN advertisement not verified. |
| Legacy Jinja/static/setup surfaces | templates and Flask routes | Next pages/compatibility mappings | source and page inventory | `SOURCE_VERIFIED`, `NOT_VERIFIED` | PARTIAL | `/setup`, exact legacy HTML and some aliases remain transitional. |

## 4. Firmware and host contracts

The companion `../PRG32` repository was inspected read-only. The following
contracts remain source-compatible:

- `GET /api/games?limit=100`;
- `GET /api/games/:id/download?architecture=...&version=...`;
- `prg32-store-discovery-1.0`;
- `prg32-metadata-1.0`;
- `prg32-colophon-1.0`;
- architectures `esp32c6` and `qemu`;
- mDNS service `_prg32store._tcp`, default port `5080`;
- configured remote Store URL and `CONFIG_PRG32_STORE_URL` fallback behavior.

The firmware contract tests verify discovery constants, API paths and
architecture identifiers. Differential catalog/download tests verify fields,
selected version/architecture, exact binary bytes, and compatibility behavior
against populated disposable Flask handlers.

The browser and API tests also exercise download response behavior including
content type, filename handling, ETag/conditional behavior and range-related
canonical telemetry paths where covered by the backend suite. Hardware, QEMU,
real DNS, live mDNS multicast, configured production Store URL, and firmware
runtime behavior are `NOT_VERIFIED`.

mDNS remains optional. The candidate image is built without `multicast-dns`,
and the disabled candidate started successfully. No firmware change was made.

## 5. Canonical SQLite and data parity

The canonical storage-v2 schema contains users, disabled-account state,
groups/memberships, tokens, registration records, settings, scores, runs,
samples, cartridges, releases, artifacts, media, site assets, submissions,
submission artifacts, review decisions, publication operations/items/events,
download events, migration exceptions and storage metadata. Federation
migrations add providers, identities, transactions, replay records and
sessions.

The migration and backup fixtures verify primary/foreign-key relationships,
unique constraints, Unicode values, disabled users, historical identities,
object hashes/sizes, private staging, journal state and migration exceptions.
The canonical workflow uses the filesystem writer lease and rejects
simultaneous writers.

The candidate runtime is configured with one canonical root and
`<root>/store.sqlite`. Candidate preflight rejects legacy fallback variables
and configured users. The candidate container has no dependency on a Flask
database, `index.json`, or legacy object directory for application authority.

Legacy inventory and migration tools still read legacy SQLite and `index.json`
in explicitly disposable workflows. That is intentional migration tooling,
not a candidate dual-write path. The repository retains legacy code for
rollback/compatibility and therefore cannot yet claim that all source-level
legacy references have been removed.

Evidence: `SOURCE_VERIFIED`, `INTEGRATION_VERIFIED`,
`DIFFERENTIAL_VERIFIED`, and `DOCKER_VERIFIED` in disposable scope.

## 6. Publication and review parity

The real disposable HTTP workflow covers:

1. synthetic bootstrap authentication;
2. multipart cartridge upload with CSRF;
3. anonymous and missing-CSRF rejection;
4. pending submission creation and owner listing;
5. reviewer queue and detail;
6. verification/approval;
7. duplicate approval rejection;
8. duplicate submission rejection;
9. rejection with private staging preserved;
10. canonical catalog visibility after publication;
11. exact download and media reads;
12. publication journal completion;
13. interruption before promotion and recovery;
14. canonical operation without a legacy shadow database.

Invalid ZIPs, path traversal, symlink and resource-limit cases are covered by
submission tests. Writer lease conflicts and idempotent migration/publication
retries are covered by storage-v2 tests.

The main limitation is ownership, not the disposable workflow: legacy review
history and real operational publication data have not been migrated or
reconciled, and Flask remains the public writer.

## 7. Scores, runs, metrics and telemetry

Canonical telemetry integration verifies download events, anonymous scores,
authenticated context, run creation, duplicate and conflicting retries,
metric batches, run completion, duplicate/conflicting finish requests,
statistics, persistence after application close, and legacy source
immutability. Resource limits and firmware-compatible payloads remain covered
by the Python regression suite and Fastify metrics tests.

The implementation distinguishes public aggregate statistics from private run
detail and export authorization. CSV and Markdown routes use the same
authorization boundary as run detail. Invalid download requests do not create
successful telemetry events; canonical download outcomes are persisted for
the covered 200/partial/conditional paths.

The required operational gap remains firmware write ownership and historical
telemetry reconciliation at cutover. No real firmware endpoint or production
telemetry database was used.

## 8. Local authentication and RBAC

Local auth coverage includes registration/bootstrap, password verification,
disabled-account rejection, session creation, CSRF issuance/validation,
logout, token creation/list/rename/revoke, session/token invalidation after
security changes, groups, roles, protected editor/admin operations, and
single-administrator protections.

The browser suite verifies local login, CSRF failure, secure session cookie
attributes in the synthetic HTTPS edge, logout, and rejection of a Flask-style
legacy `session` cookie as a Fastify session.

The candidate uses canonical SQLite and a Fastify session cookie. It does not
silently accept Flask cookies or merge identities by email. A controlled
re-login/session continuity decision is still required before a real handover.

## 9. OIDC and SAML parity

Generic provider support remains provider-ID based and is not Authentik-specific.
Synthetic OIDC coverage verifies discovery, state, nonce, PKCE, JWKS, issuer,
audience, signature and callback validation. Synthetic SAML coverage verifies
metadata, signed response/assertion processing, issuer/audience, destination,
recipient, time windows, replay handling, NameID mapping and identity
linking.

The browser suite completed synthetic OIDC and SAML callbacks and verified
separate federated identities. Provisioning tests verify that providers are
not implicitly activated by migration; explicit activation is required.

This is not live Authentik acceptance. No credentials were read and no real
provider was modified. For a future authorized live acceptance, the operator
must provide the approved `sso.dream.test` metadata/endpoints, client ID and
secret reference, redirect/ACS registrations, signing certificate/trust
material, enabled-state decision, test identity, and rollback/re-login plan.

Result: `BROWSER_VERIFIED` for synthetic providers; `NOT_VERIFIED` for the
real external provider.

## 10. Next.js frontend parity

Next.js pages and components cover the modern storefront, catalog detail,
login, registration/completion, account/token workspace, publish/workspace,
review, scores, statistics, runs/detail, public profiles, administration,
federation administration, PWA manifest/service worker, and documentation
pages. The app uses the existing backend contracts and does not duplicate
Flask business logic or SQLite access.

Browser-verified paths:

- catalog, detail, media, architecture selection and download;
- local auth, CSRF, secure cookie boundary and logout;
- same-origin Next proxy and exact direct API CORS;
- synthetic OIDC/SAML login callbacks;
- authenticated WSS join, relay, invalid token rejection and room limit.

The parity is not complete for every legacy Jinja surface. The exact HTML
rendering of setup/admin/editor pages, framework static aliases, the
informational `/api` page, and all legacy form aliases is not claimed. The
modern `/docs` content exists, but the future Fumadocs integration remains
deferred.

During this audit the first E2E run exposed a startup race in the disposable
HTTPS edge: the edge was accepting browser traffic before a final upstream
probe. The harness was corrected with exact store/API readiness probes in
`frontend/e2e/global-setup.mjs`. Two consecutive reruns then passed all five
browser tests. This was a disposable test-harness correction, not an
application or operational routing change.

## 11. Backup-v4 and restore

The encrypted backup ABI is `prg32-cartridge-store-backup-4.0`. Source and
tests verify AES-256-GCM for the payload, authenticated metadata, AES-256-GCM
key wrapping, active/decrypt-only/retired key states, historical-key restore,
writer-quiescence enforcement, fresh-root restore, object/database integrity,
wrong-key rejection, tamper/truncation rejection, incomplete marker
rejection, partial restore non-readiness, and retention dry-run behavior.

Synthetic backup fixtures preserve compatible accounts, disabled users,
federation providers and identity mappings, settings, catalog relationships,
objects, scores, runs, samples, downloads and migration exceptions.

The evidence proves:

- algorithm implemented: `SOURCE_VERIFIED`;
- disposable encrypted backup and restore: `INTEGRATION_VERIFIED`;
- operational key custody: `NOT_VERIFIED`;
- operational retention policy: `NOT_VERIFIED`;
- operational monitoring/alerting: `NOT_VERIFIED`;
- operational restore rehearsal: `NOT_VERIFIED`.

No production key material, backup, database or object root was used.

## 12. Rollback and writer ownership

The disposable cutover rehearsal verifies source snapshot immutability,
inventory, migration, canonical ownership, backup-v4, restore and rejection of
simultaneous writers. Interrupted migration and publication leave durable
recovery state and support deterministic retry in disposable fixtures.

The safe boundary remains:

- before Fastify accepts writes: discard the disposable target and retain Flask
  authority;
- after Fastify accepts writes: stop the new writer, control traffic,
  reconcile post-cutover writes, and then either restore a consistent legacy
  state with explicitly accepted data loss or perform a forward fix.

Restarting Flask alone is not a post-cutover rollback strategy. No reverse
migration was invented or implemented. Operational writer ownership is still
Flask; the candidate writer lease was exercised only in a disposable root.

## 13. Operational routing architecture

Current topology remains:

```text
Traefik / Authentik (external)
        |
        +-- store.prg32.dream.test -> Next.js storefront path
        +-- api.prg32.dream.test   -> Flask public API, with transitional auth bridge paths
        +-- sso.dream.test          -> external generic OIDC/SAML provider
```

The target candidate topology remains two application services:

```text
external Traefik + external Authentik
        |
        +-- Next.js frontend
        +-- Fastify backend + canonical SQLite/object storage + WebSocket
```

The synthetic edge tests terminate TLS, route both origins, exercise CORS,
cookies, OIDC/SAML and WSS. The real Dream Traefik route priorities,
forwarded-header boundary, cookie behavior, WSS upgrade and public ownership
were not changed or verified in this milestone. No Flask fallback behavior is
being declared safe after cutover until all writers and routes are frozen.

## 14. WebSocket and discovery

The disposable browser suite verifies authenticated WSS join, room isolation,
relay, invalid token rejection, peer limits and disconnect cleanup through the
synthetic HTTPS edge. Backend tests also cover query, bearer and legacy token
forms and the multiplayer protocol differential.

mDNS remains disabled by default, has no eager runtime import in the normal
path, and is absent from the candidate image. Explicit enablement without its
optional dependency fails startup with a stable error. The firmware discovery
ABI remains unchanged.

Evidence: `BROWSER_VERIFIED`/`INTEGRATION_VERIFIED` for synthetic WSS and
`SOURCE_VERIFIED`/`DOCKER_VERIFIED` for optional mDNS. Real Traefik WSS and
real LAN multicast are `NOT_VERIFIED`.

## 15. Integrated acceptance results

No single browser test was allowed to imply the entire migration. The
acceptance was composed from the following real disposable scenarios:

| Scenario | Result | Evidence |
|---|---|---|
| Canonical initialization and candidate startup | PASS | `INTEGRATION_VERIFIED`, `DOCKER_VERIFIED` |
| Fastify health/readiness and canonical writer lease | PASS | `INTEGRATION_VERIFIED`, `DOCKER_VERIFIED` |
| Next.js startup and same-origin API proxy | PASS | `BROWSER_VERIFIED`, `DOCKER_VERIFIED` |
| Registration/bootstrap/authentication/CSRF | PASS in disposable scope | `INTEGRATION_VERIFIED`, `BROWSER_VERIFIED` |
| Upload, staging, review, approval/rejection, publication | PASS | `INTEGRATION_VERIFIED` |
| Next.js catalog/detail/download | PASS | `BROWSER_VERIFIED` |
| Scores, runs, samples, finish and statistics | PASS | `INTEGRATION_VERIFIED` |
| Service close/reopen persistence | PASS in storage/API suites | `INTEGRATION_VERIFIED` |
| Encrypted backup-v4, independent verification and fresh restore | PASS | `INTEGRATION_VERIFIED` |
| Identity/provider/publication continuity after restore | PASS synthetically | `INTEGRATION_VERIFIED` |
| Real external edge/provider and production data | NOT RUN | `NOT_VERIFIED` by authorization boundary |

The full preferred sequence is therefore covered across disposable suites,
but not as a claim about operational ownership or real production data.

## 16. Migration failure-injection results

Covered and passing in disposable tests:

- source mutation after inventory is detected;
- missing referenced artifact, corrupt/malformed source artifact, invalid
  paths, symlink escape and unmappable telemetry are classified;
- unsupported legacy schema fails closed;
- interrupted migration leaves a durable resume checkpoint;
- migration retry is idempotent and verifies target/differential content;
- missing authorization and changed source prevent target initialization;
- interrupted publication/journal transitions recover;
- writer lease conflicts reject concurrent ownership;
- backup creation/verification and restore failures fail closed;
- aborted pre-finalization cutover leaves no accepted canonical target;
- rollback rehearsal rejects simultaneous writers.

Not fully covered as one exhaustive matrix:

- a live legacy source changing concurrently during every inventory phase;
- every possible ambiguous federation mapping branch;
- post-cutover reconciliation of real writes;
- real external routing failure during handover.

Result: `FUNCTIONAL_PARITY_PARTIAL`; the tests provide strong disposable
failure evidence but do not authorize production migration.

## 17. Defects discovered and corrected

### Corrected

The disposable browser setup lacked an explicit readiness probe through the
synthetic HTTPS edge. Under one serial run, two catalog/proxy tests observed a
non-ready storefront; the other three passed. A manual probe confirmed the
backend, Next.js and catalog were healthy. `global-setup.mjs` now waits for:

- `https://store.m52g14.test/`;
- `https://store.m52g14.test/api/games`;
- `https://api.m52g14.test/health`;

before exposing runtime environment variables to Playwright. Lint passed and
two consecutive complete E2E reruns passed 5/5.

### Not corrected because not authorized or not safe to infer

- Real Flask/Fastify route ownership and writer handover.
- Live Authentik provider registration or identity continuity.
- Legacy cookie conversion.
- Exact legacy HTML parity for every Jinja route.
- Production key custody, retention, monitoring or restore procedure.
- Real Traefik/TLS/DNS/WSS behavior.

## 18. Files changed

M5.2g.22 changed:

- `frontend/e2e/global-setup.mjs` — synthetic edge readiness probes.
- `docs/modernization/108-final-functional-parity-m5-2g-22.md` — this single
  milestone report.

Earlier dirty changes in backend, frontend, Docker, deployment and
modernization files were preserved and are not reattributed to this milestone.
No prior report or roadmap was rewritten.

## 19. Verification results

Node environment:

```text
Node v24.20.0
pnpm 12.5.1
```

Current commands and results:

| Command | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 49 files, 244 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `pnpm --dir frontend run test:e2e` | PASS — 5 tests on each of two final reruns |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |

Additional disposable checks:

- both candidate images rebuilt successfully with Node 24 slim bases;
- candidate Fastify `/health`: HTTP 200;
- candidate Fastify `/ready`: HTTP 200 with database, canonical storage and
  writer lease available;
- candidate Next.js `/health`: HTTP 200;
- candidate Next.js `/api/games` proxy: HTTP 200;
- candidate image `multicast-dns` resolution: absent as intended;
- candidate containers used only a private candidate network and read-only
  root filesystems.

The frontend Vitest run emitted the existing non-blocking Vite
`configLoader: native` warning. It did not fail the suite.

## 20. Unresolved P0 blockers

These are operational/data-safety blockers, even though disposable source
tests pass:

1. No authorized frozen production source snapshot and independent complete
   inventory exists for this milestone.
2. Flask remains the write owner; no approved single-writer handover exists
   for publication, telemetry, scores, metrics, authentication or downloads.
3. Post-cutover write reconciliation and accepted-data-loss policy are not
   operationally approved.
4. Production backup key custody, restore authority, RTO/RPO, monitoring and
   retention are not verified.
5. Flask retirement would be unsafe while required legacy routes, data
   ownership and rollback continuity remain open.

## 21. Unresolved P1/P2 blockers

### P1

- Real Traefik ownership for `store.prg32.dream.test` and
  `api.prg32.dream.test` is not verified.
- Real `sso.dream.test` OIDC/SAML provider acceptance is not verified.
- Session continuity/re-login policy between Flask and Fastify is not
  approved.
- Complete legacy Jinja/admin/setup/editor URL and behavioral parity is not
  accepted.
- Firmware write ownership, download telemetry reconciliation and live
  WebSocket upgrade behavior are not verified.
- Complete migration failure coverage for concurrent source mutation,
  ambiguous identity mappings and post-cutover writes remains open.

### P2

- Decide whether legacy informational and form-alias routes remain supported
  until cutover or are explicitly retired.
- Decide whether `/setup` receives a Next.js equivalent or remains a
  transitional Flask administration surface.
- Perform the deployment-specific mDNS policy/network decision; mDNS should
  remain disabled unless separately approved.
- Review the existing Vite warning and final production cache headers.

## 22. Required operator inputs

Before any operational cutover acceptance, an operator must provide:

- an approved maintenance window and source-write freeze;
- the exact production canonical root/database/object-store mapping;
- source inventory and snapshot verification authorization;
- the single-writer ownership decision for every write domain;
- session continuity or forced controlled re-login policy;
- approved generic OIDC/SAML provider metadata and secret/certificate
  references for `sso.dream.test`;
- Traefik route/priority/TLS/WebSocket configuration acceptance;
- backup key custody, rotation, retention, monitoring, RPO/RTO and restore
  authority;
- telemetry reconciliation and post-cutover rollback data-loss policy;
- firmware Store URL/mDNS decision and a hardware/QEMU acceptance plan.

No real credentials, tokens, provider secrets or production artifacts were
requested or read.

## 23. Recommended next milestone

Authorize a narrowly scoped operational handover readiness gate that first
closes the P0 data/writer/key-custody decisions, then performs read-only edge
and federation acceptance with operator-provided inputs. It must preserve the
two-origin model, external Traefik/Authentik ownership, Node 24, canonical
SQLite and exactly two application services.

Do not begin the handover, remove Flask, change public routing, or start
M5.2g.23 automatically from this report.

## 24. GO/NO-GO decisions

| Gate | Decision | Basis |
|---|---|---|
| Source-backed route inventory | **GO** | 77 explicit decorator path templates rebuilt; runtime 86-rule/73-default-path distinction recorded. |
| Disposable Fastify/Next candidate | **GO** | Images build; health/readiness/proxy pass; canonical storage and lease are isolated. |
| Disposable functional parity | **FUNCTIONAL_PARITY_PARTIAL** | Broad real integration/browser coverage passes, but legacy HTML and operational ownership gaps remain. |
| Firmware/API compatibility | **GO in disposable/source scope** | Contracts and differential tests pass; hardware/live endpoint not verified. |
| Synthetic OIDC/SAML | **GO** | Protocol and browser callback tests pass with generic disposable providers. |
| Real Authentik acceptance | **NO-GO / NOT_VERIFIED** | No real provider access or credentials used. |
| Backup-v4/restore disposable scope | **GO** | Encryption, key rotation, tamper/wrong-key/restore tests pass. |
| Operational backup/restore | **NO-GO / NOT_VERIFIED** | Key custody, retention, monitoring and production rehearsal remain open. |
| Operational cutover | **OPERATIONAL_CUTOVER_NO_GO** | Flask remains public owner; no freeze, migration, routing or writer handover. |
| Flask retirement | **FLASK_RETIREMENT_NO_GO** | Required legacy compatibility and rollback/ownership gates remain open. |

