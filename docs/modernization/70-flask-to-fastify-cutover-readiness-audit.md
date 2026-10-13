# PRG32 Cartridge Store — Autonomous Flask-to-Fastify Cutover Readiness Audit

Date: 2026-10-13
Status: **NO-GO — Flask retirement is not authorized**
Scope: read-only architecture, contract, runtime, firmware, deployment, and test audit

## Executive decision

The repository is not ready for an autonomous Flask-to-Fastify cutover. Fastify
and Next.js are substantial, tested foundations, but Flask remains the public
owner of several firmware-facing write and real-time contracts, the catalog
HTML surface, mDNS registration, and the operational database/filesystem.

The following are hard blockers for removing Flask without changing existing
clients:

1. Fastify does not register `POST /api/scores`.
2. Fastify does not register the firmware metrics writes:
   `POST /api/runs`, `POST /api/metrics/batch`, and
   `POST /api/runs/<run_id>/finish`.
3. Fastify does not implement `WS /api/multiplayer`.
4. The public catalog, binary download side effects, publication/review owner,
   and legacy Jinja routes still run through Flask.
5. Flask-only non-HTTP behavior, especially mDNS registration, has no Fastify
   replacement or retirement decision.
6. A production database/filesystem ownership transfer and rollback procedure
   has not been proven. The Fastify write profiles are intentionally disposable.
7. Authentication protocol tests pass in isolation, but browser acceptance was
   explicitly removed from scope and Flask/Fastify cookie/session cutover has
   not been proven.

The correct current state is therefore:

| Boundary | Current result |
| --- | --- |
| TypeScript/Fastify foundation | Implemented and tested in isolated profiles |
| Next.js foundation | Implemented and tested; not a complete storefront |
| Development dual-origin stack | Operational through the existing Dream Traefik network |
| Flask public compatibility service | Still required |
| Flask retirement | **NO-GO** |
| M6.3d.2h.12 | Not defined or started by this audit |

This report is evidence for planning. It is not a cutover authorization and
does not change application behavior, schemas, routing, production data, or
the sibling firmware repository.

## Method and evidence boundary

Inspected:

- the current Flask application factory, route modules, storage, database,
  authentication, metrics, scores, multiplayer, publication/review, backup,
  settings, statistics, and mDNS code;
- the Fastify composition root, route modules, services, database adapters,
  write-isolation profiles, and tests;
- the Next.js route tree, API clients, rewrites, origin handling, and tests;
- `docker-compose.yml`, Dockerfiles, the Nginx edge bridge, and
  `docs/docker.md`;
- the modernization roadmap and reports 66–69;
- the sibling repository `../PRG32`, read-only, including firmware HTTP/WebSocket
  clients, host store tooling, and API documentation.

No production database or production filesystem was opened. Flask runtime route
inspection used a temporary directory and a synthetic test secret. The
companion repository was not modified. The pre-existing dirty files remain
untouched:

- this repository: untracked `package.json`;
- `../PRG32`: untracked `docs/quickstart-qemu.md` and `run-qemu`.

The historical reports contain contradictory statements. For example, an
earlier M4 section says OIDC/SAML were retired from the TypeScript target,
while later M6.3d.2h reports document their Fastify implementation. This audit
does not rewrite that history; source code, current Compose behavior, and
executed checks are treated as current evidence, and the contradiction is
recorded as a documentation risk.

## Current runtime topology

The single `docker-compose.yml` has these relevant profiles:

| Profile | Services | Role |
| --- | --- | --- |
| `dev` | `flask`, `auth-writer-init`, `auth-writer`, `auth-writer-edge-proxy`, `next` | Dual-origin local development |
| `backend` | `backend` | Isolated read-only Fastify fixture |
| `writer` / `writer-init` | Fastify writer and one-shot initializer | Disposable write tests |
| `prod` | `cartridge-store` | Transitional Flask production image |

There are four long-running application/proxy containers in `dev` plus the
one-shot writer initializer. There is no active identity-provider container or
Playwright/Authentik profile in the current Compose file; those are historical
milestone evidence only.

The active development routes are:

| Origin/path | Actual owner |
| --- | --- |
| `https://store.prg32.dream.test` | Next.js |
| `https://store.prg32.dream.test` legacy rewrites | Next.js proxying to Flask |
| `https://api.prg32.dream.test/auth/*` | Nginx edge bridge to disposable Fastify writer |
| `https://api.prg32.dream.test/api/auth/*` | Nginx edge bridge to disposable Fastify writer |
| `https://api.prg32.dream.test/api/admin/federation/*` | Nginx edge bridge to disposable Fastify writer |
| other API and legacy HTML paths | Flask |
| `https://api.prg32.dream.test/api/multiplayer` | Flask WebSocket/HTTP route |

Traefik remains external infrastructure on the `dream_edge` network. The edge
bridge forwards HTTP/1.1 upgrade headers, so the development topology can
preserve WebSocket traffic, but that does not provide a Fastify WebSocket
implementation.

The `dev` profile uses bind mounts under `.local/` for Flask data, writer data,
writer shadow data, writer store data, Node dependencies, and Next cache. It
does not rely on anonymous Docker volumes. This is portable with the Git root,
provided the external Dream Traefik network and its DNS/TLS setup exist on the
destination machine.

## Flask route inventory

### Count and inventory method

Static inspection of the current decorators found 91 HTTP method/path bindings,
excluding Flask's automatic `HEAD` and `OPTIONS`, plus one Flask-Sock WebSocket
route. A runtime `app.url_map` inspection in `.venv313`, with a temporary data
directory, produced 88 HTTP bindings across 86 rule objects. The difference is
caused by decorator aliases and the Flask-Sock GET/WebSocket registration for
`/api/multiplayer`; neither number should be confused with a count of public
API contracts.

The current Flask HTTP surface is grouped below. Dynamic path parameters are
shown in their source form.

### Public catalog, discovery, HTML, and assets

| Methods | Paths |
| --- | --- |
| GET | `/`, `/games/<game_id>`, `/manifest.webmanifest`, `/.well-known/prg32-store.json` |
| GET | `/api`, `/api/me`, `/api/games`, `/api/games/<game_id>` |
| GET | `/api/games/<game_id>/icon`, `/api/games/<game_id>/screenshot`, `/api/games/<game_id>/colophon`, `/api/games/<game_id>/download` |
| GET | `/static/custom/<filename>`, `/static/<path:filename>` |

The catalog and download routes are public firmware contracts. Successful Flask
downloads also record download telemetry in SQLite; the Fastify read-only
catalog intentionally does not write that event.

### Authentication and federation

| Methods | Paths |
| --- | --- |
| GET | `/auth/csrf`, `/auth/login`, `/auth/me`, `/auth/register`, `/auth/register/complete`, `/auth/tokens` |
| POST | `/auth/bootstrap`, `/auth/login`, `/auth/logout`, `/auth/register`, `/auth/register/complete`, `/auth/tokens`, `/auth/tokens/<int:token_id>/revoke`, `/auth/tokens/<int:token_id>/update` |
| PATCH/DELETE | `/auth/tokens/<int:token_id>` |
| GET | `/auth/oidc/login`, `/auth/oidc/callback` |
| GET | `/auth/saml/login`, `/auth/saml/metadata` |
| POST | `/auth/saml/acs` |

Flask uses its signed cookie-session format and the default Flask session cookie
name (`session` unless overridden). Fastify uses the independently designed
`prg32_ts_session` cookie and database-backed `auth_sessions`. Existing Flask
browser cookies are therefore not portable to Fastify. Password-hash and token
compatibility is tested separately; session migration/re-login is an open
cutover decision.

### Publishing, review, and administration

| Methods | Paths |
| --- | --- |
| GET/POST | `/publish`, `/api/publish`, `/api/publish/bundle` |
| GET | `/editor/submissions`, `/editor/submissions/<int:submission_id>`, `/api/submissions`, `/api/submissions/<int:submission_id>` |
| POST | `/editor/submissions/<int:submission_id>/verify`, `/editor/submissions/<int:submission_id>/reject`, `/api/submissions/<int:submission_id>/verify`, `/api/submissions/<int:submission_id>/reject` |
| GET | `/admin/users`, `/admin/groups`, `/admin/roles`, `/admin/cartridges`, `/admin/backup` |
| POST | `/admin/users`, `/admin/users/<int:user_id>`, `/admin/users/<int:user_id>/delete`, `/admin/users/<int:user_id>/role`, `/admin/users/<int:user_id>/groups` |
| DELETE/POST | `/admin/users/<int:user_id>`, `/admin/groups/<int:group_id>/delete`, `/admin/cartridges/<game_id>/<version>/delete` |
| POST | `/admin/groups`, `/admin/groups/<int:group_id>`, `/admin/cartridges/<game_id>/<version>` |
| GET | `/admin/backup/download` |
| POST | `/admin/backup/restore`, `/setup`, `/setup/logo`, `/setup/favicon` |
| GET | `/setup` |

Flask remains the operational publication/review owner. Fastify has isolated
submission/review/admin/backup implementations, but they are not a proven
replacement for the live Flask data and filesystem boundary.

### Scores, metrics, statistics, and multiplayer

| Methods | Paths |
| --- | --- |
| GET/POST | `/api/scores` |
| GET | `/scores`, `/api/metrics`, `/api/runs`, `/api/runs/<run_id>`, `/api/runs/<run_id>/samples.csv`, `/api/runs/<run_id>/report.md` |
| POST | `/api/runs`, `/api/metrics/batch`, `/api/runs/<run_id>/finish` |
| GET | `/api/stats/downloads`, `/api/stats/downloads/<game_id>`, `/api/stats/scores`, `/api/stats/runs`, `/stats` |
| GET | `/api/multiplayer/status`, `/api/multiplayer` |
| WebSocket | `/api/multiplayer` |

These routes contain the most important Flask retirement blockers. Firmware
posts score and metric data without a browser session, and the firmware
multiplayer client expects a live WebSocket relay.

## Fastify route inventory

The source inventory found 96 literal `app.<method>` registrations plus two
dynamic settings-asset registrations, for 98 potential registrations. Six
additional lifecycle routes under `/_test/federation/*` are gated test-only
routes. The effective registration set depends on configuration: auth,
federation, submissions, review, backup, and writer features are intentionally
disabled or isolated in some profiles.

Fastify currently covers these families:

| Family | Present in source | Operational meaning |
| --- | --- | --- |
| Health/readiness | `/health`, `/ready` | Fastify process health only |
| Discovery/catalog | `/.well-known/prg32-store.json`, `/api/games`, detail, icon, screenshot, colophon, download | Read-only parity implementation; public owner remains Flask |
| Local authentication | `/auth/csrf`, login/register/logout/me/token routes, `/api/me` | Disposable writer only; independent cookie/session store |
| Generic federation | `/api/auth/providers`, OIDC login/callback, SAML login/ACS/metadata | Isolated writer; API/protocol tests pass, browser acceptance intentionally not active |
| Federation administration | provider/identity CRUD, state, certificate, transaction, reauthentication paths | Isolated writer behind edge bridge |
| Settings/assets | `/api/admin/settings`, PATCH, dynamic logo/favicon asset POSTs | Isolated writer |
| Users/groups/roles/tokens/catalog admin | API admin routes | Isolated writer; not public Flask replacement |
| Publishing | `/publish`, `/api/publish`, `/api/publish/bundle` | Isolated pending submission writer; full live publication ownership not proven |
| Review | API and HTML-compatible review paths | Isolated writer; live parity/ownership not proven |
| Backup | `/admin/backup/download`, `/admin/backup/restore` | Isolated backup service; legacy operational restore cutover not proven |
| Read metrics/statistics | `/api/metrics`, `/api/runs`, run detail/CSV/report, stats | Read-only/isolated behavior |
| Read scores | `GET /api/scores` | Present; score ingestion is absent |
| WebSocket multiplayer | None | Missing |

Notably absent from Fastify are the three firmware metrics write routes, score
write, and the multiplayer WebSocket. Fastify also has no Flask/Jinja HTML
implementation for the catalog, setup, user pages, statistics pages, or the
legacy admin pages.

## API parity matrix

The matrix distinguishes route existence from operational ownership. A route
with a matching Fastify handler is not an operational cutover if it only runs
against disposable writer data or is not wired through the public route.

| Contract family | Flask | Fastify | Classification | Cutover condition |
| --- | --- | --- | --- | --- |
| Discovery document | Public | Present/read-only | **Compatible, isolated** | Route ownership plus settings/port behavior must be cut over and verified |
| Catalog listing | Public | Present/read-only | **Compatible, isolated** | Preserve index/filesystem authority and pagination/error bytes |
| Cartridge details/version selection | Public | Present/read-only | **Compatible, isolated** | Same as catalog |
| Architecture selection | Public | Present/read-only | **Compatible, isolated** | Preserve `esp32c6` and `qemu` identifiers |
| Icon/screenshot/colophon | Public | Present/read-only | **Compatible, isolated** | Verify shared filesystem root and error/header behavior |
| Binary download | Public plus download-event write | Present/read-only | **Partial** | Decide and test one download-event writer; preserve raw bytes/ranges/ETags |
| Local auth and CSRF | Public Flask | Fastify writer | **Partial** | Session-cookie strategy, database ownership, browser re-login, rollback |
| Bearer token authentication | Public Flask | Fastify services | **Partial** | Shared token rows and revocation semantics must be proven against live DB |
| Generic OIDC | Flask legacy plus Fastify implementation | Fastify isolated | **Partial** | Provider configuration, callback origin, session ownership, API/runtime evidence |
| Generic SAML | Flask legacy plus Fastify implementation | Fastify isolated | **Partial** | Same as OIDC, including certificate lifecycle and callback origin |
| Publishing upload | Flask operational | Fastify isolated pending writer | **Partial** | Live filesystem publication, review, consistency, and rollback |
| Review/approval | Flask operational | Fastify isolated | **Partial** | Same database/filesystem and crash-recovery evidence |
| Statistics | Flask operational | Fastify read routes | **Partial** | Verify current tables, visibility, download side effects, and public route |
| Scores GET | Public Flask | Fastify GET | **Compatible, isolated** | Preserve ordering, limits, and public route owner |
| Scores POST | Public Flask | **Absent** | **Missing — BLOCKER** | Implement and cross-test against firmware payloads |
| Metrics GET/export | Public Flask | Fastify read/export | **Partial** | Ownership and authorization parity; preserve CSV/Markdown contracts |
| Metrics run/batch/finish POST | Public Flask | **Absent** | **Missing — BLOCKER** | Implement firmware-compatible ingestion before Flask retirement |
| Multiplayer status/HTTP | Flask | No Fastify route | **Missing** | Preserve status contract or explicitly coordinate firmware change |
| Multiplayer WebSocket | Flask-Sock | **Absent** | **Missing — BLOCKER** | Implement relay, upgrade path, state semantics, and reconnect behavior |
| Backup export/restore | Flask v1 operational | Fastify v2/legacy isolated service | **Partial** | Prove legacy Flask archive import and live DB/filesystem ownership |
| HTML/Jinja routes | Flask | **Absent** | **Missing for full Flask removal** | Migrate to Next or explicitly retain a separate compatibility service |
| Setup/static/custom assets | Flask | Partial settings asset API only | **Missing/partial** | Migrate UI and asset serving or retain Flask |

The M3 read-only contract fixture gives strong evidence for the catalog family:
discovery, listing, detail/version, architecture selection, icon, screenshot,
colophon, binary bytes, conditional requests, ranges, and error envelopes were
compared with synthetic Flask output. That evidence does not prove public
Fastify ownership or download telemetry parity.

## Firmware and host-tool compatibility matrix

The companion repository was inspected read-only at its current checkout. No
firmware build or physical board smoke test was run during this audit.

| Consumer | Firmware/tool behavior | Fastify status | Classification |
| --- | --- | --- | --- |
| Firmware catalog browser | `GET /api/games?limit=...`; accepts `games`, `items`, or `cartridges`; filters `esp32c6`/`qemu` | Catalog handler present and M3 fixtures cover the shape | **Source-compatible, runtime not verified** |
| Firmware binary downloader | `GET /api/games/<id>/download?architecture=...&version=...`; streams and validates PRG32 bytes | Download handler present/read-only | **Source-compatible, runtime not verified** |
| Firmware score sync | `POST /api/scores` with `game`, `player`, `score`; no Authorization header; any 2xx is success | Fastify POST absent | **BLOCKER** |
| Firmware metrics run | `POST /api/runs` with run metadata and no auth header | Fastify POST absent | **BLOCKER** |
| Firmware metric batch | `POST /api/metrics/batch` with up to 64 samples and dropped count | Fastify POST absent | **BLOCKER** |
| Firmware metrics finish | `POST /api/runs/<id>/finish` with finish/drop fields | Fastify POST absent | **BLOCKER** |
| Firmware multiplayer | WebSocket join/state/leave frames; default/configured multiplayer URL | Fastify route/plugin absent | **BLOCKER** |
| Host `store-list` | `GET /api/games` and ABI discovery | Fastify read route present | **Source-compatible, runtime not verified** |
| Host `store-download` | Unauthenticated binary GET with architecture/version query | Fastify read route present | **Source-compatible, runtime not verified** |
| Host `publish` / `publish-bundle` | Multipart `bundle`; Bearer token optional/configured; pending review response | Fastify isolated submission route present | **Partial** |

The host publishing tool uses `Authorization: Bearer <token>` when configured
in `~/.prg32/config.json` or supplied as `--token`. The firmware score and
metrics clients do not send that header. This is why the missing Fastify write
routes cannot be treated as an ordinary admin/API gap.

The canonical values remain aligned in source inspection:

- mDNS service type `_prg32store._tcp`;
- default port `5080`;
- discovery ABI `prg32-store-discovery-1.0`;
- metadata ABI `prg32-metadata-1.0`;
- physical architecture `esp32c6`;
- QEMU architecture `qemu`.

## Next.js interaction and frontend boundary

The current Next application is a migration foundation, not the completed
storefront. Its route tree contains ten application routes: `/`, `/login`,
`/account`, `/admin`, and the federation administration pages. The home page
renders `FoundationShell`; it does not implement catalog browsing, cartridge
detail, publishing, review, metrics, scoreboard, multiplayer, or the Flask
HTML surface.

The API clients currently use:

- `requestJson` for same-origin Next rewrites;
- `requestApiJson` and `NEXT_PUBLIC_PRG32_API_ORIGIN` for explicit dual-origin
  browser calls;
- `/api/auth/*`, `/auth/*`, `/api/admin/federation/*`, and admin integration
  paths for Fastify writer features;
- Flask proxy rewrites for the remaining `/api`, `/auth`, `/admin`, `/editor`,
  `/users`, `/publish`, `/setup`, `/scores`, `/stats`, static, manifest, and
  discovery paths.

There is no frontend WebSocket client in the current source tree. The Compose
environment still exposes `NEXT_PUBLIC_FLASK_WS_URL` for future/legacy use, but
the Next foundation does not implement multiplayer behavior.

Consequences:

1. Next does not currently depend on a Fastify catalog API for its visible
   storefront because that storefront does not yet exist.
2. Next still depends on Flask for compatibility rewrites and legacy HTML.
3. Dual-origin auth calls are deliberately a development integration, not a
   declaration that Flask sessions can be retired.
4. Moving the browser origin alone cannot retire Flask; firmware and host-tool
   callers bypass Next entirely.

## Database, filesystem, publication, and backup ownership

### Flask authority

Flask uses the configured `PRG32_STORE_DATA`/`PRG32_STORE_DB` paths, with legacy
`PRG32_SCORE_DB` and `PRG32_METRICS_DB` fallbacks. The published catalog is
filesystem/index authoritative; SQLite stores users, tokens, settings, scores,
metrics, downloads, and submissions/reviews. Flask can write both the
operational SQLite database and published filesystem artifacts.

### Fastify boundary

Fastify opens the configured operational database read-only with
`better-sqlite3`, `query_only`, and filesystem safety checks. Disposable writer
profiles use separate bind-mounted auth/shadow/store roots and reject identity
overlap with the operational database. Submission, metrics, scores, backup,
and auth writers are configuration-gated and intended for isolated test or
controlled staging use.

The TypeScript package includes Drizzle and `backend/src/db/schema.ts`; the
read-only adapter wraps the better-sqlite3 handle with Drizzle types, while
multiple services still use raw prepared statements and migrations are raw
SQL. Drizzle is not currently the authoritative migration engine. This is a
notable implementation detail against the approved decision to defer a
Drizzle-centered persistence migration and must be resolved or explicitly
accepted before a production cutover.

### Publication and backup

Fastify has staged publication journals, recovery, review, and backup format
support, including legacy backup validation in isolated tests. The live Flask
service remains the production owner. There is no evidence here of:

- a shared live writer transition with no dual-write window;
- historical Flask backup import into the exact current production database and
  filesystem;
- a full stop/copy/start rollback procedure under the actual mounted paths;
- monitoring and reconciliation proving catalog index, binary files, and
  submission state remain consistent after a process or host failure.

The current design correctly avoids declaring two operational writers. The
remaining work is closure evidence, not another parallel writer.

## Authentication, session, and authorization ownership

Fastify authentication uses a database-backed `auth_sessions` table, signed
`prg32_ts_session` cookies, encrypted CSRF values, and its own configuration
for session secret, lifetime, Secure, and SameSite attributes. Flask uses its
signed Flask session cookie, `SECRET_KEY`, and session fields such as
`user_id`, `role`, and `_csrf_token`.

Evidence currently supports:

- Werkzeug password-hash recognition and token lookup compatibility in Fastify
  tests;
- local bootstrap, login, CSRF, registration, revocation, OIDC, SAML, and
  federation authorization behavior in isolated Fastify tests;
- exact-origin CORS and dual-origin API tests;
- centralized Fastify RBAC tests.

Evidence does not support seamless migration of active Flask browser sessions.
The final cutover needs an explicit choice: controlled re-login/session
expiration, a temporary compatibility adapter, or another reviewed boundary.
It must not silently treat `session` and `prg32_ts_session` as equivalent.

The user-specified generic OIDC/SAML provider model is respected: the audit
does not assume the infrastructure provider is Authentik. The local
development integration uses generic OIDC/SAML configuration and the existing
Dream origin; the persistent `https://sso.dream.test` instance was not
contacted.

## Non-HTTP behavior

### mDNS

Flask registers `_prg32store._tcp.local.` using `zeroconf` at startup, reads
the configured name/type/port, advertises the discovery ABI, and deregisters at
process exit. Failures are logged and do not crash startup. Fastify has no
equivalent mDNS registration in the inspected source. Removing Flask would
therefore remove discovery unless mDNS is migrated or explicitly dropped with
a coordinated firmware/tool decision.

### Multiplayer

Flask owns the in-memory multiplayer relay and Flask-Sock upgrade route. The
relay handles join, peer/state, leave, bounded peer counts, and cleanup. No
Fastify WebSocket plugin or route is registered. The Nginx/Traefik upgrade path
is infrastructure only and does not close this gap.

### Startup, cleanup, and operational side effects

Flask initializes settings/auth/service tables, closes request database
connections through app-context teardown, and registers mDNS cleanup through
`atexit`. Flask also records download events and performs filesystem/catalog
publication side effects. Fastify has startup schema/fixture initialization,
writer cleanup and recovery services, but those are isolated/profile-gated and
not yet the same operational lifecycle.

## Environment and deployment dependency matrix

| Dependency | Flask | Fastify/Next | Retirement implication |
| --- | --- | --- | --- |
| Node 24 / pnpm | Not applicable | Required; `.nvmrc`/engines and checks use Node `24.20.0`, pnpm `12.5.1` | Stable local prerequisite |
| Python/Flask runtime | Required by current public service | Not required by isolated TypeScript services | Cannot remove until route/non-HTTP parity closes |
| `./data` production bind mount | SQLite + catalog/filesystem | Must be adopted safely or remain Flask-owned | Requires ownership/rollback gate |
| `.local/flask/data` | Dev Flask state | Not used by Fastify writer | Dev-only transitional state |
| `.local/writer/*` | Not used | Disposable auth/shadow/store state | Must not be mistaken for production migration |
| Dream Traefik `dream_edge` | API/store edge | Next and Fastify edge bridge | External prerequisite on new host |
| `store.prg32.dream.test` | Legacy rewrites through Next | Next canonical browser origin | DNS/TLS must be recreated on new host |
| `api.prg32.dream.test` | Flask compatibility API/WS | Fastify auth edge paths | Public ownership remains split |
| `sso.dream.test` | Generic provider URL may be configured | Generic provider URL may be configured | Persistent provider is external and out of audit execution |
| mDNS/zeroconf | Flask only | No Fastify registration | Separate migration decision required |

The Compose/Docker organization is portable at the repository level: mounts are
explicit bind paths and production images are multi-stage/slim. Portability
still depends on supplying the external Traefik network and its file-provider
middlewares on the destination host; Compose cannot create that external
infrastructure from this repository alone.

## Test and verification map

### Test inventory

The repository currently contains 26 Fastify test files and 135 Fastify tests,
including catalog/contract compatibility, auth, authorization, OIDC, SAML,
federation, admin, settings, users/groups, publication/review, metrics, scores,
stats, backup, SQLite resilience, secrets, and write isolation.

The frontend contains 10 test files and 29 tests covering API clients, auth
components, admin/federation components, theme/UI pieces, and origin behavior.
It does not contain a full storefront, firmware client, WebSocket, or browser
acceptance suite.

The Python suite contains 64 tests and covers API contracts, PRG32 format,
services, security containment, submission compatibility, and multiplayer
integration. It remains the only executable characterization of several Flask
runtime and WebSocket behaviors.

### Exact checks executed for this audit

All Node commands below ran after `source "$HOME/.nvm/nvm.sh" && nvm use 24`.

| Command | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 26 files, 135 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 10 files, 29 tests |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm --dir frontend run build` | PASS |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS — system Python 3.9.6 |
| `python3 -m pytest -q` | NOT RUN — system Python has no pytest module |
| `.venv313/bin/python -m pytest -q` | FAIL as invoked — 63 passed, 1 failed because `SECRET_KEY` was absent for a non-testing mDNS app factory test |
| `SECRET_KEY=<synthetic test value> .venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose config` | PASS — no profile selected, therefore no active services |
| `docker compose --profile dev config --services` | PASS — five services listed |
| `docker compose --profile dev config --quiet` | PASS |

The frontend test runner emitted its existing non-fatal Vite native-config
warning. No application file was changed to make a check pass.

The Python rerun used a synthetic process environment value only; no credential
or production secret was introduced. The no-secret first run is retained as a
real reproducibility finding: the suite's mDNS test expects a non-testing app
factory to receive `SECRET_KEY`.

## Remaining gaps and risk classification

| ID | Severity | Gap | Evidence/impact |
| --- | --- | --- | --- |
| CUTOVER-001 | BLOCKER | Public route ownership remains Flask | Fastify is isolated or edge-selected only for auth/federation; Flask still owns compatibility traffic |
| CUTOVER-002 | BLOCKER | Fastify score ingestion absent | Firmware posts `POST /api/scores` without auth header |
| CUTOVER-003 | BLOCKER | Fastify metrics ingestion absent | Firmware posts run, batch, and finish routes |
| CUTOVER-004 | BLOCKER | Fastify WebSocket multiplayer absent | Firmware expects join/state/leave relay at the multiplayer URL |
| CUTOVER-005 | HIGH | Storefront and Jinja surface incomplete | Next has foundation/auth/admin pages, not catalog/publish/review/stats/multiplayer UI |
| CUTOVER-006 | HIGH | Firmware runtime/hardware evidence absent | Source contracts align for read routes, but no board/QEMU network smoke was run |
| CUTOVER-007 | HIGH | Session/cookie cutover unresolved | Flask `session` and Fastify `prg32_ts_session` are independent mechanisms |
| CUTOVER-008 | HIGH | Live DB/filesystem ownership transition unproven | Fastify writers are disposable; no shared-writer or rollback proof |
| CUTOVER-009 | HIGH | Legacy Flask backup import and restore not operationally proven | Fastify tests cover isolated formats, not the live mounted deployment |
| CUTOVER-010 | HIGH | Download telemetry writer not migrated | Fastify catalog intentionally has no Flask `download_events` side effect |
| CUTOVER-011 | MEDIUM | mDNS registration remains Flask-only | Firmware discovery can regress when Flask is removed |
| CUTOVER-012 | MEDIUM | Documentation contains historical status contradictions | M4 OIDC/SAML wording conflicts with later M6.3d.2h implementation reports |
| CUTOVER-013 | MEDIUM | Drizzle usage boundary is ambiguous | Package/schema wrapper exists although ORM-centered migration was deferred |
| CUTOVER-014 | MEDIUM | Default Python pytest invocation is not reproducible on system interpreter | `pytest` is not installed globally; isolated `.venv313` succeeds with test secret |
| CUTOVER-015 | MEDIUM | External Traefik remains a host prerequisite | Repository portability does not recreate `dream_edge`, DNS, TLS, or middleware |

## Recommended remaining milestones

These are recommendations, not started work. They do not define or silently
rename `M6.3d.2h.12`.

### A. Firmware write parity closure

Implement and contract-test Fastify score and metrics ingestion against the
actual `../PRG32` JSON payloads, including unauthenticated firmware semantics,
limits, response status/body, rate/resource controls, and SQLite ownership.
Use isolated fixtures first, then a disposable network smoke test. Keep the
Flask writer authoritative until the replacement is proven.

### B. Multiplayer parity closure

Implement the Fastify WebSocket relay with the existing join/state/leave
protocol, peer limits, reconnect behavior, status endpoint, upgrade path, and
contract tests. Verify Traefik routing without involving browser E2E.

### C. Operational data and publication cutover rehearsal

Define one writer for SQLite and filesystem publication, prove catalog/index/
submission reconciliation, verify Flask backup import and Fastify restore on a
disposable copy, document stop/copy/start/rollback, and run the same checks
against a production-shaped bind-mounted fixture. Do not enable dual writes.

### D. Auth/session and generic federation cutover decision

Choose the reviewed session transition behavior, verify bearer-token continuity,
test generic OIDC/SAML callback origins through the API boundary, and record
the required re-login or compatibility window. Browser Playwright/Authentik
verification remains out of scope unless separately authorized.

### E. Next storefront and legacy surface closure

Migrate only the required user-facing catalog, detail, download, publish/review,
statistics, and admin flows to Next.js. Preserve Flask/Jinja routes until each
route has a replacement and a rollback path. Add a frontend WebSocket client
only when the Fastify relay exists.

### F. Final canary and retirement gate

Run a controlled canary with public routing, firmware/tool smoke tests, backup
and restore, mDNS/discovery, metrics/scores, multiplayer, auth, monitoring,
and rollback. Only after that should the Flask production service be stopped
and later removed.

The roadmap should retain the existing milestone identifiers and should not
invent a definition for `M6.3d.2h.12` from this audit. A future milestone for
these closures must be explicitly authorized and named before implementation.

## Final Flask retirement gate

Flask may be retired only when every item below has current evidence:

- all Flask HTTP contract families are implemented or explicitly retired with
  a coordinated firmware/tool decision;
- `POST /api/scores`, all three metrics writes, and `WS /api/multiplayer` pass
  contract and network tests;
- catalog, binary bytes, architecture/version selection, download headers,
  telemetry, and public discovery are owned by one Fastify/filesystem boundary;
- publication, review, backup, restore, and reconciliation work on the live
  production-shaped data layout with a tested rollback;
- the database schema and filesystem authority are single-owner, with no
  uncontrolled dual-write interval;
- authentication sessions, tokens, CSRF, local accounts, and generic OIDC/SAML
  callback behavior have an explicit migration policy;
- mDNS is migrated or deliberately replaced with documented client impact;
- Next.js covers the required storefront/HTML surface, or a separately
  justified compatibility service remains;
- exact Docker/Traefik routes, health checks, logs, TLS, external networks,
  and WebSocket upgrades are verified on a clean host;
- Python and TypeScript checks are reproducible from documented isolated
  environments, and firmware/tool smoke tests are recorded;
- a canary, monitoring threshold, stop procedure, and rollback owner are
  approved;
- only after the above: stop Flask, observe the canary, and remove Flask in a
  separately authorized change.

Current gate result: **NO-GO**. The blockers are concrete and actionable, but
they are not closed by the existing isolated Fastify tests.

## Follow-up correction — firmware ingestion route inventory — 2026-10-13

The subsequent firmware-ingestion closure found that the specific findings
`CUTOVER-002` and `CUTOVER-003` were route-inventory false negatives. The
current Fastify source registers the four POST endpoints through object-form
`app.route({ method: "POST", ... })` calls, which the original audit scanner did
not count:

- `POST /api/scores` in `backend/src/scores/routes.ts`;
- `POST /api/runs`, `POST /api/metrics/batch`, and
  `POST /api/runs/:run_id/finish` in `backend/src/metrics/routes.ts`.

The route modules were already composed by `backend/src/app.ts`, and M6.1/M6.2b
HTTP tests already exercised the services. A new runtime regression test now
checks all four `hasRoute` bindings and proves that a read-only configuration
returns stable `503` availability errors without opening a writer. A disposable
HTTP smoke against the local Fastify writer accepted all four firmware-shaped
requests with the expected `200` responses; the write gates were then restored
to their default `false` values.

Therefore `CUTOVER-002` and `CUTOVER-003` are closed at the isolated route and
contract-parity level. The broader Flask retirement decision remains **NO-GO**:
the public owner is still Flask, default Compose writes remain disabled, and
catalog, publication, backup, mDNS, multiplayer, session migration, and
operational single-writer cutover remain open.
