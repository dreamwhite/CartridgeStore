# PRG32 Cartridge Store — M5.5.2 Functional Parity & Firmware Compatibility Closure

Date: 2026-10-16  
Execution: targeted Fastify/Next.js parity implementation, disposable
acceptance and read-only companion-repository inspection  
Operational deployment: **not performed**

## 1. Executive summary

M5.5.2 closed the proven providerless federation compatibility gap and made the
OIDC/SAML request limiters use the bounded primitive introduced in M5.5.1.
Legacy Flask federation URLs now work only when exactly one enabled provider of
the requested protocol exists. Zero providers return a stable unavailable
error; multiple providers return a stable ambiguity error. No provider is
guessed, and callback processing remains bound to the provider's configured
redirect URI/ACS URL.

The actual PRG32 Python host client from `../PRG32` was run against a
disposable Fastify instance. Discovery, catalog listing, version/architecture
selection, binary download and byte-for-byte SHA-256 verification passed.
Existing disposable tests also pass for metrics, scores, multiplayer,
publishing, review, authentication, canonical storage and authorization.

Complete Flask-to-Fastify functional parity is **not** claimed. Several
legacy browser/admin URLs are represented by modern Next.js/API surfaces but do
not have exact legacy URL ownership, and no physical ESP32-C6 or QEMU network
runtime was available. The session compatibility model remains controlled
re-login. Operational cutover and Flask retirement remain prohibited.

Final decisions:

```text
M552_FUNCTIONAL_PARITY_INCOMPLETE
M552_FIRMWARE_RUNTIME_COMPATIBILITY_INCOMPLETE
M552_LEGACY_ROUTE_OWNERSHIP_INCOMPLETE
M552_SESSION_CONTINUITY_DOCUMENTED
M552_HTTP_HARDENING_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Scope and constraints

In scope:

- source-backed Flask/Fastify/Next.js/CLI/firmware parity review;
- safe providerless OIDC/SAML aliases;
- bounded OIDC/SAML limiter state;
- disposable host-client runtime acceptance;
- regression, contract and side-effect evidence;
- one consolidated report.

Out of scope and unchanged:

- Flask source and templates;
- `../PRG32` source;
- SQLite schema and operational databases;
- Docker operational services and Compose routing;
- Traefik, Authentik, Mailpit, Gatus and backup scheduler;
- public routing, cutover, deployment and Flask retirement;
- `manage.sh`, UI redesign and later milestones;
- commits and pushes.

The worktree was already substantially dirty before this milestone. Existing
changes were preserved; the file list in section 21 identifies only the files
touched for M5.5.2 or the immediately required lint regression correction.

## 3. Source inventory

| Surface | Source reviewed | Result |
| --- | --- | --- |
| Flask | `app.py`, `cartridge_store/`, `templates/`, `static/` | Complete decorator inventory and behavior review; unchanged |
| Fastify | `backend/src/app.ts`, `auth/`, `catalog/`, `metrics/`, `scores/`, `multiplayer/`, `submission/`, `review/`, `admin/`, `settings/`, `setup/`, `oidc/`, `saml/`, `federation/` | Candidate owner and compatibility API reviewed |
| Next.js | `frontend/src/app/`, `frontend/src/lib/api/`, `frontend/src/lib/compatibility/`, `next.config.mjs` | Browser replacement and proxy boundaries reviewed |
| CLI | `cli/src/`, `cli/tests/` | Administrative and disposable backup consumers reviewed |
| Firmware/host | `../PRG32/prg32/store/store_api.py`, `store/utils.py`, `store/metadata.py`, `store/cartridge_format.py`, `components/prg32/prg32_metrics.c`, `components/prg32/prg32_multiplayer.c` | Read-only source review plus actual Python host-client run |
| Historical evidence | `docs/modernization/153-final-backend-parity-security-audit-m5-5-0.md`, `154-websocket-http-security-hardening-m5-5-1.md` | Prior findings and limits preserved |

The Flask inventory was re-derived from the route decorators. It contains 90
method/path registrations and 77 normalized path values, including the
WebSocket registration. No Flask route was removed or edited.

## 4. Complete route ownership matrix

The matrix uses these abbreviations:

- `P`: public/anonymous; `S`: local session; `B`: bearer/API token; `CSRF`:
  browser mutation protection; `A`: administrator; `E`: editor/publisher;
  `F`: firmware/host client.
- `R`: read-only; `W`: database/filesystem side effect; `WS`: WebSocket side
  effect; `N`: no replacement claim.
- `EXACT_PARITY`: same public capability and compatible contract;
  `INTENTIONAL_SECURE_CHANGE`: contract remains but rejection/control behavior
  is safer; `REPLACED_BY_NEXT`: browser owner moved to Next.js;
  `MISSING_IMPLEMENTATION`: no verified owner for the exact capability;
  `LEGACY_ONLY_DEPRECATED`: checked non-firmware legacy surface with an
  explicitly non-operational replacement decision; `UNVERIFIED`: evidence is
  not sufficient for a stronger claim.

### Browser, setup, administration and static routes

| Flask method/path | Auth/RBAC | Input/output and effects | Current owner or replacement | Classification / evidence / risk |
| --- | --- | --- | --- | --- |
| `GET /` | P | HTML catalog / R | Next `app/page.tsx` | `REPLACED_BY_NEXT`; frontend build and catalog tests; exact legacy HTML differs |
| `GET /games/:game_id` | P | HTML detail / R | Next `app/games/[gameId]` | `REPLACED_BY_NEXT`; browser page and API tests; legacy HTML not byte-equivalent |
| `GET /publish` | P | HTML publishing page / R | Next `app/publish` | `REPLACED_BY_NEXT`; page build; legacy HTML differs |
| `POST /publish` | S+CSRF | Multipart cartridge submission / W | Fastify `submission/routes.ts` | `EXACT_PARITY` at business-contract level; submission tests; redirect/HTML semantics differ intentionally |
| `GET /setup` | A | HTML settings/setup / R | Next `app/setup`, Fastify `/api/setup/*` | `REPLACED_BY_NEXT`; setup tests; exact legacy POST URL is not owned |
| `POST /setup` | A+CSRF | Settings mutation / W | Fastify setup/settings APIs | `MISSING_IMPLEMENTATION` for exact legacy URL; modern API exists; legacy form clients would fail |
| `POST /setup/logo` | A+CSRF | Asset upload / W | Fastify settings asset API | `REPLACED_BY_NEXT` at product level; exact legacy URL not verified |
| `POST /setup/favicon` | A+CSRF | Asset upload / W | Fastify settings asset API | `REPLACED_BY_NEXT` at product level; exact legacy URL not verified |
| `GET /static/custom/:filename` | P | Custom static asset / R | Fastify application asset API; Next static surface | `MISSING_IMPLEMENTATION` for exact path; path traversal remains rejected by Flask; no firmware dependency |
| `GET /admin/users` | A | HTML user list / R | Next admin workspace + Fastify admin API | `MISSING_IMPLEMENTATION` for exact HTML URL; API/RBAC tests pass |
| `POST /admin/users` | A+CSRF | User creation / W | Fastify admin API | `REPLACED_BY_NEXT` at product level; exact legacy form URL not owned |
| `POST /admin/users/:user_id` | A+CSRF | User update / W | Fastify admin API | `REPLACED_BY_NEXT` at product level; admin tests pass |
| `POST /admin/users/:user_id/role` | A+CSRF | Role mutation / W | Fastify centralized RBAC API | `REPLACED_BY_NEXT`; authorization tests pass |
| `POST /admin/users/:user_id/groups` | A+CSRF | Group membership / W | Fastify centralized RBAC API | `REPLACED_BY_NEXT`; authorization/admin tests pass |
| `DELETE /admin/users/:user_id` | A+CSRF | User deletion / W | Fastify admin API | `REPLACED_BY_NEXT`; self/final-admin guards tested |
| `POST /admin/users/:user_id/delete` | A+CSRF | Legacy delete form / W | Fastify admin API | `REPLACED_BY_NEXT`; exact form URL not owned |
| `GET /admin/groups` | A | HTML groups / R | Next admin workspace + Fastify admin API | `MISSING_IMPLEMENTATION` for exact HTML URL; group API tested |
| `POST /admin/groups` | A+CSRF | Group creation / W | Fastify admin API | `REPLACED_BY_NEXT`; exact form URL not owned |
| `POST /admin/groups/:group_id` | A+CSRF | Group update / W | Fastify admin API | `REPLACED_BY_NEXT`; group tests pass |
| `DELETE /admin/groups/:group_id/delete` | A+CSRF | Group deletion / W | Fastify admin API | `REPLACED_BY_NEXT`; exact legacy path not owned |
| `POST /admin/groups/:group_id/delete` | A+CSRF | Legacy group delete / W | Fastify admin API | `REPLACED_BY_NEXT`; exact legacy form path not owned |
| `GET /admin/roles` | A | HTML role list / R | Fastify role API + Next admin workspace | `MISSING_IMPLEMENTATION` for exact HTML URL; role API tested |
| `GET /admin/cartridges` | A/E | HTML moderation catalog / R | Fastify catalog administration + Next admin | `MISSING_IMPLEMENTATION` for exact HTML URL; publication tests pass |
| `POST /admin/cartridges/:game_id/:version` | A/E+CSRF | Metadata mutation / W | Fastify catalog admin/publication pipeline | `REPLACED_BY_NEXT`; canonical side effects tested |
| `DELETE /admin/cartridges/:game_id/:version/delete` | A/E+CSRF | Variant removal / W | Fastify catalog admin/publication pipeline | `REPLACED_BY_NEXT`; exact legacy URL not owned |
| `POST /admin/cartridges/:game_id/:version/delete` | A/E+CSRF | Legacy variant removal / W | Fastify catalog admin/publication pipeline | `REPLACED_BY_NEXT`; exact legacy form URL not owned |
| `GET /admin/backup` | A+reauth | Offline backup page / R | Fastify offline backup route, disabled operationally | `INTENTIONAL_SECURE_CHANGE`; backup tests; no public backup exposure |
| `GET /admin/backup/download` | A+reauth | Sensitive backup archive / R | Fastify offline backup route | `INTENTIONAL_SECURE_CHANGE`; encrypted backup/authorization tests; operational route remains disabled |
| `POST /admin/backup/restore` | A+reauth+CSRF | Sensitive restore / W | Fastify offline backup route | `INTENTIONAL_SECURE_CHANGE`; restore tests; never over operational root |
| `GET /manifest.webmanifest` | P | Manifest / R | Next `app/manifest.webmanifest/route.ts` | `REPLACED_BY_NEXT`; build/static checks |
| `GET /static/custom/:filename` | P | Custom asset / R | Fastify asset API / Next public surface | `MISSING_IMPLEMENTATION`; exact URL and cache semantics remain open |
| `GET /scores` | P | Scoreboard HTML / R | Next `app/scores` | `REPLACED_BY_NEXT`; frontend tests/build |
| `GET /stats` | P | Statistics HTML / R | Next `app/stats` | `REPLACED_BY_NEXT`; stats tests/build |
| `GET /users/:username` | P | User profile HTML / R | Next `app/users/[username]` | `REPLACED_BY_NEXT`; profile tests/build |
| `GET /users/:username/runs` | P/S policy | User runs HTML / R | Next user-runs page + Fastify stats | `REPLACED_BY_NEXT`; API tests; complete browser parity open |
| `GET /users/:username/runs/:run_id` | P/S policy | Run detail HTML / R | Next user-run page + Fastify metrics | `REPLACED_BY_NEXT`; metrics tests; complete browser parity open |

### Discovery and catalog API routes

| Flask method/path | Auth/RBAC | Input/output and effects | Current owner or replacement | Classification / evidence / risk |
| --- | --- | --- | --- | --- |
| `GET /.well-known/prg32-store.json` | P | Discovery JSON / R | Fastify catalog/discovery | `EXACT_PARITY`; ABI and runtime host-client test; public routing still unverified |
| `GET /api` | P | Endpoint index JSON / R | No registered Fastify equivalent | `MISSING_IMPLEMENTATION`; not used by inspected firmware; host tools do not require it |
| `GET /api/me` | P/S | Principal JSON / R | Fastify auth route | `EXACT_PARITY` contract-level; auth tests |
| `GET /api/games` | P/F | Query/search/pagination/catalog JSON / R | Fastify catalog | `EXACT_PARITY`; differential tests and actual host client |
| `GET /api/games/:game_id` | P/F | Version-selected detail JSON / R | Fastify catalog | `EXACT_PARITY`; differential and runtime tests |
| `GET /api/games/:game_id/icon` | P/F | Media bytes / R | Fastify catalog | `EXACT_PARITY`; byte/media tests |
| `GET /api/games/:game_id/screenshot` | P/F | Media bytes / R | Fastify catalog | `EXACT_PARITY`; byte/media tests |
| `GET /api/games/:game_id/colophon` | P/F | Colophon JSON / R | Fastify catalog | `EXACT_PARITY`; ABI test and runtime acceptance |
| `GET /api/games/:game_id/download` | P/F | Version/architecture binary / download telemetry W | Fastify canonical catalog | `EXACT_PARITY` plus intentional canonical telemetry behavior; SHA-256/runtime/differential tests |
| `POST /api/publish` | S/B+CSRF where browser | Multipart submission / W | Fastify submission | `EXACT_PARITY` business outcome; submission tests; canonical storage differs internally |
| `POST /api/publish/bundle` | S/B+CSRF where browser | Multipart bundle / W | Fastify submission | `EXACT_PARITY`; firmware/host publishing contract tests |

### Authentication and federation routes

| Flask method/path | Auth/RBAC | Input/output and effects | Current owner or replacement | Classification / evidence / risk |
| --- | --- | --- | --- | --- |
| `GET /auth/csrf` | P/S | CSRF token JSON / session state W | Fastify auth | `EXACT_PARITY`; auth regression tests |
| `POST /auth/bootstrap` | P+bootstrap secret | Initial admin / W | Fastify auth/setup | `INTENTIONAL_SECURE_CHANGE`; disposable setup/auth tests |
| `GET /auth/register` | P | Registration page/data / R | Next register page + Fastify API | `REPLACED_BY_NEXT`; frontend/auth tests |
| `POST /auth/register` | P+CSRF policy | Registration / W | Fastify auth | `EXACT_PARITY` contract-level; auth tests |
| `GET /auth/register/complete` | P+one-time token | Completion page / R | Next completion page + Fastify API | `REPLACED_BY_NEXT`; auth tests |
| `POST /auth/register/complete` | P+one-time token | Account activation / W | Fastify auth | `EXACT_PARITY`; one-time/replay tests |
| `GET /auth/login` | P | Login page/data / R | Next login page + Fastify API | `REPLACED_BY_NEXT`; frontend/auth tests |
| `POST /auth/login` | P+CSRF | Session creation / W | Fastify auth | `INTENTIONAL_SECURE_CHANGE`; signed/encrypted Fastify session tests |
| `POST /auth/logout` | S+CSRF | Session revocation / W | Fastify auth | `EXACT_PARITY` with controlled session model; auth tests |
| `GET /auth/me` | P/S | Current principal JSON / R | Fastify auth | `EXACT_PARITY`; auth tests |
| `GET /auth/tokens` | S | Token metadata / R | Fastify token API | `EXACT_PARITY`; credential-redaction tests |
| `POST /auth/tokens` | S+CSRF | Token creation / W | Fastify token API | `EXACT_PARITY`; token tests |
| `PATCH /auth/tokens/:token_id` | S+CSRF | Token metadata / W | Fastify token API | `EXACT_PARITY`; token tests |
| `POST /auth/tokens/:token_id/update` | S+CSRF | Legacy token update / W | Fastify token API | `EXACT_PARITY` business outcome; exact legacy body semantics open |
| `DELETE /auth/tokens/:token_id` | S+CSRF | Token revoke / W | Fastify token API | `EXACT_PARITY`; revocation tests |
| `POST /auth/tokens/:token_id/revoke` | S+CSRF | Legacy token revoke / W | Fastify token API | `EXACT_PARITY`; revocation tests |
| `GET /auth/oidc/login` | P | Provider redirect / federation transaction W | Fastify providerless alias | `EXACT_PARITY` only for one enabled provider; new alias tests; ambiguity fails closed |
| `GET /auth/oidc/callback` | P+correlation | OIDC callback/session W | Fastify providerless alias | `INTENTIONAL_SECURE_CHANGE`; canonical redirect URI, state/nonce/PKCE/issuer/audience validation tested |
| `GET /auth/saml/login` | P | Provider redirect / federation transaction W | Fastify providerless alias | `EXACT_PARITY` only for one enabled provider; alias tests; ambiguity fails closed |
| `POST /auth/saml/acs` | P+correlation | Signed assertion/session W | Fastify providerless alias | `INTENTIONAL_SECURE_CHANGE`; signature/destination/InResponseTo/replay tests |
| `GET /auth/saml/metadata` | P | SP metadata / R | Fastify providerless alias | `EXACT_PARITY` only for one enabled provider; metadata and alias tests |

### Metrics, scores, review and multiplayer routes

| Flask method/path | Auth/RBAC | Input/output and effects | Current owner or replacement | Classification / evidence / risk |
| --- | --- | --- | --- | --- |
| `GET /api/metrics` | P/S policy | Metrics capability/aggregate JSON / R | Fastify metrics | `EXACT_PARITY` contract-level; metrics tests |
| `POST /api/runs` | F/B or S policy | Run creation / W | Fastify metrics | `EXACT_PARITY`; firmware-compatible canonical telemetry tests |
| `POST /api/metrics/batch` | F/B or S policy | Bounded samples / W | Fastify metrics | `INTENTIONAL_SECURE_CHANGE`; firmware batch limit and resource tests |
| `POST /api/runs/:run_id/finish` | F/B or S policy | Run completion / W | Fastify metrics | `EXACT_PARITY`; telemetry tests |
| `GET /api/runs` | S/owner/admin | Run listing / R | Fastify metrics | `EXACT_PARITY`; authorization tests |
| `GET /api/runs/:run_id` | S/owner/admin | Run detail / R | Fastify metrics | `EXACT_PARITY`; owner/admin tests |
| `GET /api/runs/:run_id/samples.csv` | S/owner/admin | CSV export / R | Fastify metrics | `EXACT_PARITY` with bounded export policy; export tests |
| `GET /api/runs/:run_id/report.md` | S/owner/admin | Markdown export / R | Fastify metrics | `EXACT_PARITY` with bounded export policy; export tests |
| `GET /api/submissions` | S/E/A | Submission list / R | Fastify review/submission | `EXACT_PARITY` business outcome; review tests |
| `GET /api/submissions/:submission_id` | S/owner/E/A | Submission detail / R | Fastify review/submission | `EXACT_PARITY`; ownership tests |
| `POST /api/submissions/:submission_id/verify` | E/A+CSRF | Validation/review state / W | Fastify review | `EXACT_PARITY` business outcome; review tests |
| `POST /api/submissions/:submission_id/reject` | E/A+CSRF | Rejection/note / W | Fastify review | `EXACT_PARITY`; rejection/idempotence tests |
| `GET /editor/submissions` | E/A | Legacy editor HTML / R | Next review page + Fastify review API | `REPLACED_BY_NEXT`; exact legacy URL not owned |
| `GET /editor/submissions/:submission_id` | E/A | Legacy editor detail / R | Next review page + Fastify review API | `REPLACED_BY_NEXT`; exact legacy URL not owned |
| `POST /editor/submissions/:submission_id/verify` | E/A+CSRF | Legacy approval / W | Fastify review API | `REPLACED_BY_NEXT`; state/audit tests |
| `POST /editor/submissions/:submission_id/reject` | E/A+CSRF | Legacy rejection / W | Fastify review API | `REPLACED_BY_NEXT`; state/audit tests |
| `GET /api/scores` | P/F | Score list / R | Fastify scores | `EXACT_PARITY`; score validation/list tests |
| `POST /api/scores` | F/B or anonymous policy | Score insertion / W | Fastify scores | `INTENTIONAL_SECURE_CHANGE`; anonymous/auth policy tests |
| `GET /scores` | P | Scoreboard HTML / R | Next scores page | `REPLACED_BY_NEXT`; frontend/build tests |
| `GET /api/stats/downloads` | P | Aggregate downloads / R | Fastify stats | `EXACT_PARITY` when non-identifying; stats tests |
| `GET /api/stats/downloads/:game_id` | P | Per-game aggregate / R | Fastify stats | `EXACT_PARITY` when non-identifying; stats tests |
| `GET /api/stats/scores` | P | Aggregate scores / R | Fastify stats | `EXACT_PARITY`; public aggregate tests |
| `GET /api/stats/runs` | P/auth policy | Aggregate runs / R | Fastify stats | `EXACT_PARITY` where non-identifying; authorization tests |
| `GET /api/multiplayer/status` | P | Relay status / R | Fastify multiplayer | `INTENTIONAL_SECURE_CHANGE`; status/limits tests |
| `GET /api/multiplayer` | P | Compatibility info / R | Fastify multiplayer | `EXACT_PARITY`; multiplayer differential tests |
| `WS /api/multiplayer` | P/S/B join policy | Join/state/leave relay / WS | Fastify multiplayer hub | `INTENTIONAL_SECURE_CHANGE`;  M5.5.1 admission/rate/backpressure/liveness tests |

### Matrix conclusion

Every inventoried Flask path now has an explicit disposition. The matrix does
not hide exact legacy HTML gaps behind a broad `/admin` or `/api` row. Browser
replacement and business-contract ownership are substantially present, but
exact legacy URL ownership for setup/admin/editor/static surfaces is not yet
complete. That is the reason for `M552_LEGACY_ROUTE_OWNERSHIP_INCOMPLETE`.

## 5. Legacy HTML replacement decisions

The browser-facing replacement is Next.js, not a second Flask-template
implementation in Fastify. The following decisions are intentional:

1. Storefront pages (`/`, game detail, publish, scores, stats, profiles, runs,
   login, registration, account and setup) are Next-owned.
2. Fastify owns JSON/API behavior and canonical data side effects.
3. Review and administration are Next workspaces backed by Fastify APIs; exact
   Flask form URLs are not silently redirected for unsafe POST operations.
4. Offline backup operations remain Fastify/CLI/operator operations and are
   not exposed as a public Next page that could imply operational restore
   availability.
5. No redirect was added for an unsafe legacy POST. Existing compatibility
   URL helpers only redirect browser-safe GET navigation.
6. `/api`, `/setup` form POST, exact legacy admin/editor HTML paths and
   `/static/custom/:filename` remain documented gaps rather than fabricated
   handlers.

## 6. Federation alias decisions

The old Flask adapter registered providerless paths only when its single
configuration was enabled. Fastify stores multiple generic OIDC/SAML
providers, so blindly choosing a provider would create an authentication
confusion risk.

Implemented behavior:

- one enabled OIDC provider: `/auth/oidc/login` and `/auth/oidc/callback`
  resolve to it;
- one enabled SAML provider: `/auth/saml/login`, `/auth/saml/acs` and
  `/auth/saml/metadata` resolve to it;
- zero enabled providers: `404` with stable `*_provider_alias_unavailable`;
- more than one enabled provider: `409` with stable
  `*_provider_alias_ambiguous`;
- provider-specific routes remain canonical;
- OIDC alias callbacks reconstruct the configured provider redirect URI and
  copy only the callback query string before token exchange;
- OIDC state, nonce, PKCE, issuer, audience and browser binding continue to be
  checked;
- SAML signature, issuer, destination, recipient, `InResponseTo`, replay and
  browser binding continue to be checked;
- no email-only automatic identity linking was introduced.

Evidence: `backend/tests/oidc.test.ts` and `backend/tests/saml.test.ts` cover
successful one-provider aliases and ambiguous-provider fail-closed behavior.

## 7. Session continuity

Flask and Fastify session cookies are intentionally not interoperable. Fastify
does not parse or import Flask cookies or Flask session secrets. The approved
compatibility model is **controlled re-login**:

- old Flask sessions are rejected by Fastify;
- users authenticate again after a future routing cutover;
- Fastify issues its own protected session;
- canonical accounts and explicit federation mappings remain intact;
- no account is merged by email;
- logout revokes the Fastify session;
- malformed/legacy cookies do not bypass authentication;
- anonymous catalog, discovery and download behavior remains available.

Operator communication must announce the re-login window and explain that an
old browser session is not evidence of an account loss. This milestone does
not perform the cutover or invalidate live operational sessions.

## 8. Firmware/host ABI compatibility

Read-only inspection confirmed the following unchanged contracts:

| Contract | Required value/behavior | Evidence |
| --- | --- | --- |
| mDNS service | `_prg32store._tcp.local.` | `../PRG32/prg32/store/store_api.py`, `backend/tests/firmware-contract.test.ts` |
| Default port | `5080` | `../PRG32/main/prg32_config.h`, discovery tests |
| Discovery ABI | `prg32-store-discovery-1.0` | source test and runtime GET |
| Metadata ABI | `prg32-metadata-1.0` | runtime detail and cartridge fixture |
| Colophon ABI | `prg32-colophon-1.0` | runtime colophon test |
| Architectures | `esp32c6`, `qemu` | firmware source and catalog fixture |
| Catalog | `/api/games?limit=100`, list/games/items/cartridges compatibility | actual Python host client |
| Download | `/api/games/<id>/download?architecture=&version=` | actual Python host client and SHA-256 comparison |
| Metrics | `/api/runs`, `/api/metrics/batch`, `/api/runs/<id>/finish`, max firmware batch 64 | C source and Fastify/Python regression tests |
| Multiplayer | join/state/leave JSON, peer/welcome/leave behavior | C source and differential/WebSocket tests |

No firmware constants were changed. `../PRG32` remained read-only.

## 9. Runtime client acceptance

`backend/tests/firmware-runtime-acceptance.test.ts` starts Fastify on an
ephemeral loopback port using a disposable canonical fixture, then invokes the
real Python functions from `../PRG32/prg32/store/store_api.py` in a separate
process. It verifies:

1. discovery JSON and ABI;
2. `store_list` catalog listing with `qemu` selection;
3. `store_download` version/architecture selection;
4. exact downloaded bytes and SHA-256 against a direct HTTP download;
5. metadata and colophon ABI responses.

Result: **1 test passed**. This is Level 3 host-client evidence for the
catalog/discovery/download surface. It is not physical firmware evidence.

Not executed:

- ESP32-C6 hardware;
- QEMU network runtime;
- actual C firmware metrics task;
- actual C firmware WebSocket task;
- real multicast mDNS discovery.

Therefore firmware runtime closure remains incomplete even though source and
host-client compatibility passed.

## 10. mDNS and discovery

Discovery JSON compatibility is verified. The Fastify discovery service remains
optional and disabled unless explicitly enabled. No multicast traffic was sent
to a real LAN and no operational mDNS configuration was changed.

The claims are intentionally separated:

- discovery JSON: **PASS** in disposable HTTP and host-client tests;
- mDNS service advertisement: source/unit evidence only;
- host client multicast discovery: **UNVERIFIED**;
- operational mDNS ownership: **NO-GO**.

## 11. Multiplayer compatibility

The PRG32 C client sends `join`, periodic `state` and `leave`; it does not send
an application heartbeat. M5.5.1's standard WebSocket ping/pong liveness does
not alter that wire format.

Evidence passed:

- Flask/Fastify differential join/state/leave/malformed-input test;
- Fastify welcome, peer notification, leave and reconnect coverage;
- idle joined connection kept alive by transport pong;
- unjoined timeout;
- global/source/identity admission limits;
- per-connection/source/identity message quotas;
- backpressure and slow-consumer eviction.

No firmware WebSocket binary was run. The protocol remains source-compatible,
but runtime firmware compatibility is not claimed complete.

## 12. Scores, metrics and telemetry

Fastify tests cover score submission/listing/validation, anonymous versus
authenticated policy, run creation, bounded metric batches, finish, detail,
CSV/Markdown exports, aggregate statistics and authorization. Existing
canonical telemetry tests verify writes land in the canonical database and
preserve historical data.

The sibling firmware source sends run-start, bounded metric batches and finish
requests. The server accepts the documented fields and preserves predictable
error behavior. No new idempotency promise was invented; duplicate behavior
remains the existing contract.

Runtime level:

- source: **PASS**;
- Fastify disposable HTTP: **PASS**;
- actual firmware task: **UNVERIFIED**.

## 13. Publishing and review workflows

Disposable tests cover:

- bundle intake and ZIP/resource validation;
- authenticated ownership and CSRF;
- private staging;
- review queue/detail;
- validation, approval, rejection and notes;
- resubmission and idempotence;
- publication journal and interruption recovery;
- canonical object/media side effects;
- download availability after publication.

The Fastify outcome is equivalent at the business/data boundary. HTML form
redirects and internal Flask tables are not claimed identical. The canonical
single-writer operational handover remains a later gate.

## 14. Administration and setup coverage

Fastify/Next coverage exists for users, groups, roles, tokens, catalog
moderation, settings, SMTP contract, generic OIDC/SAML configuration,
federation identity linking, setup wizard and audit events. Tests enforce
centralized RBAC, recent reauthentication where required, CSRF and secret
redaction.

The following are deliberately not declared exact legacy parity:

- Flask HTML admin URL shapes;
- Flask `/setup` form POST;
- Flask custom-static URL;
- public HTTP backup/restore availability in operational mode.

No offline backup operation was turned into an unrestricted HTTP endpoint.

## 15. HTTP hardening follow-up

The existing controls were rechecked rather than replaced with a speculative
global limiter:

- multipart file/part/field limits bound upload initiation;
- ZIP validation bounds archive entries, sizes, ratios and paths;
- catalog listing and download initiation use source quotas;
- metrics ingestion has sample/payload/work limits;
- exports and private run routes enforce authorization and bounded queries;
- setup, auth, federation and admin mutations retain route-specific CSRF,
  reauthentication and limiter controls;
- WebSocket controls are covered by M5.5.1;
- request/keep-alive timeouts are explicit;
- trusted-proxy behavior remains explicit and tested.

Remaining limitation: there is no single global cost budget for every
administrator query/export or every possible future HTTP mutation. Ordinary
firmware telemetry was not globally rate-limited. This remains
`M552_HTTP_HARDENING_PARTIAL`, not a claim of universal HTTP hardening.

## 16. Proxy trust regression

The M5.5.1 behavior remains intact and was included in the full backend
regression:

- direct mode ignores untrusted forwarded headers;
- explicit trusted CIDRs are accepted only when configured;
- hop-count mode is bounded and explicit;
- source quotas use Fastify's verified `request.ip`;
- application trust configuration does not replace the edge network boundary.

Dream Traefik was not modified or used for this milestone's acceptance.

## 17. Side-effect parity

Disposable evidence compares business outcomes, not private schema layouts:

| Workflow | Observable side effects checked |
| --- | --- |
| Catalog/download | release/version/architecture identity, bytes, media, telemetry policy |
| Publishing/review | submission ownership, staging, review state, notes, publication state, object references |
| Authentication | accounts, sessions, CSRF, token revocation, federation mapping |
| Scores | validation, ordering, anonymous/authenticated persistence |
| Metrics | runs, samples, finish state, exports, owner/admin authorization |
| Multiplayer | room membership and peer-visible events |
| Administration | RBAC, user/group/role changes, audit events and last-admin protections |

The existing canonical workflow, telemetry, review, differential, backup and
security tests passed. No operational source or volume was mutated.

## 18. Legacy deprecation decisions

| Capability | Decision | Reason |
| --- | --- | --- |
| Flask HTML storefront | `REPLACED_BY_NEXT` | Next pages and API consumers exist; no firmware dependency |
| Flask HTML scores/stats/profile | `REPLACED_BY_NEXT` | Next pages plus Fastify read APIs |
| Providerless federation aliases | `EXACT_PARITY` with safe ambiguity behavior | Legacy routes are known consumers; aliases now tested |
| Flask LDAP adapter | `LEGACY_ONLY_DEPRECATED` | Existing audit found no active public contract or client use |
| Exact Flask admin/editor HTML URLs | `UNVERIFIED` / incomplete | Business APIs exist, exact URL consumers are not fully proven |
| Flask backup page/restore | `INTENTIONAL_SECURE_CHANGE` | Offline encrypted backup/restore and CLI are authoritative; public operational restore is prohibited |
| Flask session cookie continuity | `INTENTIONAL_SECURE_CHANGE` | Controlled re-login is the approved secure model |

No Flask route or historical test was deleted.

## 19. Test evidence by level

### Level 1 — source and contract

- Flask decorators and route implementations inspected.
- Fastify route modules and schemas inspected.
- Next proxy/page ownership inspected.
- `../PRG32` host and firmware source inspected read-only.
- Discovery, metadata, colophon and architecture constants matched.

### Level 2 — disposable integration

- backend full suite: 58 test files, 290 tests passed;
- OIDC/SAML suite: 13 tests passed, including aliases and ambiguity;
- canonical catalog/media/download and differential tests passed;
- metrics/scores/multiplayer/publishing/review/auth/admin tests passed;
- CLI Fastify integration and Docker private-network acceptance passed;
- source snapshot and canonical storage fixtures remained disposable.

### Level 3 — runtime client

- actual Python host client: 1 test passed;
- discovery, catalog, version/architecture download and SHA-256 passed;
- physical firmware, QEMU and multicast mDNS: unavailable/unverified.

## 20. Validation results

All commands below were actually executed with Node.js `v24.20.0` and pnpm
`12.5.1` unless noted.

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 58 files, 290 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next 16.4.0, 38 routes generated |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests; Docker network test passed |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| standalone Compose config with synthetic disposable variables | PASS |
| operational Compose config with synthetic disposable variables | PASS |
| `git diff --check` | PASS |
| actual `../PRG32` host-client runtime test | PASS — 1 test |
| public Dream/authentication observation | NOT RUN — prohibited/out of scope |
| physical ESP32-C6/QEMU runtime | NOT AVAILABLE |

The first parallel CLI invocation was not used as evidence because two local
test invocations contended for the same disposable root. The serial rerun
passed, including the real Docker network test. No operational Docker service
was started, stopped or changed by this milestone.

## 21. Files changed

M5.5.2-specific implementation and evidence files:

- `backend/src/oidc/routes.ts`
- `backend/src/oidc/service.ts`
- `backend/src/saml/routes.ts`
- `backend/src/saml/service.ts`
- `backend/tests/oidc.test.ts`
- `backend/tests/saml.test.ts`
- `backend/tests/firmware-runtime-acceptance.test.ts`
- `backend/tests/security-hardening.test.ts` — lint-safe decoding of WebSocket
  raw payloads; behavior unchanged
- `docs/modernization/155-functional-parity-firmware-closure-m5-5-2.md`

No frontend source, Flask source, firmware source, operational Compose file,
database schema, deployment routing or infrastructure configuration was
changed for M5.5.2. Other dirty files shown by `git status` predate or belong
to earlier milestones and were preserved.

## 22. Remaining discrepancies

1. Exact legacy HTML ownership is incomplete for setup/admin/editor/static
   paths. Modern API and Next workspace ownership exists, but exact legacy URL
   behavior is not uniformly available.
2. `/api` endpoint-index compatibility is not registered in Fastify.
3. Legacy Flask and Fastify session cookies are intentionally incompatible;
   operator/user re-login communication remains required.
4. No actual ESP32-C6, QEMU network or C firmware runtime evidence exists.
5. Actual multicast mDNS discovery was not exercised.
6. Public Dream edge, TLS, Authentik and dual-origin routing were not touched
   or reverified in this milestone.
7. HTTP hardening is route-specific and bounded, not a universal cost-budget
   proof for every future administrative operation.

## 23. Backend Freeze blockers

Backend Freeze must remain blocked until at least:

- the exact legacy route ownership decision is accepted or remaining aliases/
  redirects are separately implemented and tested;
- operational canonical writer ownership and reconciliation are authorized;
- session re-login communication and cutover procedure are approved;
- telemetry, scores, publication/review, multiplayer and download write
  ownership are validated at the operational edge;
- physical/QEMU firmware evidence is obtained where required by the release;
- the remaining HTTP resource-cost decisions are accepted.

M5.5.3 is the next authorized adversarial regression and final compatibility
verification milestone. M5.5.4, M5.5.5, UI redesign, operational cutover and
Flask retirement were not started.

## 24. Final decision

```text
M552_FUNCTIONAL_PARITY_INCOMPLETE
M552_FIRMWARE_RUNTIME_COMPATIBILITY_INCOMPLETE
M552_LEGACY_ROUTE_OWNERSHIP_INCOMPLETE
M552_SESSION_CONTINUITY_DOCUMENTED
M552_HTTP_HARDENING_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

M5.5.2 is complete as a targeted closure milestone, but it is not a backend
freeze, deployment approval or Flask retirement authorization.
