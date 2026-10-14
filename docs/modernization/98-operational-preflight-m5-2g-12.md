# PRG32 Cartridge Store — M5.2g.12 Operational Preflight & Cutover Readiness

Status: **LOCAL_PREFLIGHT_PARTIAL**  
Operational cutover: **NO-GO**  
Flask retirement: **NO-GO**  
Execution date: 2026-10-14  
Node.js local runtime: 24.20.0 via `nvm use 24`

This report is the single M5.2g.12 documentation artifact. It records the
source-backed checks, disposable rehearsals, implementation changes, and
remaining gates. No live Dream Traefik, `sso.dream.test`, DNS, TLS endpoint,
operational container, database, object root, backup, or secret was contacted
or modified.

## 1. Executive result

The milestone produced a safe, reusable configuration preflight and closed a
local two-origin discovery defect. The isolated candidate now verifies the
intended split:

| Responsibility | Origin |
|---|---|
| Next.js pages, assets and browser-facing web URL | `https://store.prg32.dream.test` |
| Fastify API, firmware services and WebSocket URL | `https://api.prg32.dream.test` |
| Generic external identity provider contract | `https://sso.dream.test` (not contacted) |

The disposable candidate was built with Node 24 multi-stage images and run as
exactly two application containers. Fastify and Next readiness passed, the
Next proxy reached Fastify, and the discovery response contained the API and
WSS origin rather than an internal hostname or the storefront origin.

The result is not an operational GO. The repository still contains Flask-owned
operational routes and Compose services. The real external edge/provider,
production secret/key custody, final source freeze, reconciliation, and
writer handover remain unverified and unauthorized.

## 2. Scope and safety

Authorized work was limited to local source inspection, disposable fixtures,
safe static configuration validation, candidate image builds, candidate
containers, automated tests, and this report.

The preflight utility:

- consumes environment structure only;
- does not open SQLite;
- does not enumerate or hash storage;
- does not contact a network endpoint;
- does not initialize storage or acquire a writer lease;
- does not print secret values;
- does not start containers; and
- reports sensitive values only as `PRESENT`, `MISSING`, or
  `INVALID_REFERENCE`.

The candidate smoke test used a new `/tmp` canonical fixture, the explicit
candidate authorization, loopback ports, and a private Compose bridge. The
candidate containers and network were removed after the test. Candidate images
were not deleted, because image deletion was outside this milestone.

The final `docker ps` observation showed four pre-existing application
containers from the user's environment (`flask`, `next`, `auth-writer`, and
`auth-writer-edge-proxy`). They were observed only; this work did not start,
stop, restart, remove, or reconfigure them.

## 3. Source review

Read-only review covered:

- `deploy/candidate/compose.yaml`;
- `backend/Dockerfile.candidate` and `frontend/Dockerfile.candidate`;
- `frontend/next.config.candidate.mjs`;
- `backend/src/app.ts`, `backend/src/auth/`, `backend/src/storage-v2/`,
  `backend/src/catalog/`, and `backend/src/multiplayer/`;
- `frontend/src/app/` and `frontend/src/lib/`;
- modernization reports 19, 79–97, including the M5.2e backup/restore,
  M5.2f handover, M5.2g.1–g.11, migration and differential evidence;
- the current `docker-compose.yml`, Dockerfiles, and tracked edge proxy
  configuration; and
- `../PRG32`, read-only, for discovery ABI and architecture constants.

The companion repository still contains the expected discovery ABI,
`_prg32store._tcp`, `esp32c6`, and `qemu` values. Its pre-existing untracked
`docs/quickstart-qemu.md` and `run-qemu` were not modified.

The canonical version tuple verified from source is:

```text
schema version:              2
storage layout version:      2
publication journal version: 1
backup payload version:      3
encrypted backup envelope:   v4
```

## 4. Tracked operational configuration

### Actual tracked configuration

`docker-compose.yml` defines seven services:

| Service | Current role | Profiles | M5.2g.12 classification |
|---|---|---|---|
| `cartridge-store` | Flask production service | `prod` | `REQUIRED_UNTIL_CUTOVER` |
| `backend` | development Fastify hot-reload service | `backend` | `DEV_ONLY` |
| `auth-writer-init` | disposable SQLite/key-registry initializer | `writer-init`, `writer`, `dev` | `DEV_ONLY` / future `MERGE` candidate |
| `auth-writer` | disposable Fastify writer | `writer`, `dev` | `DEV_ONLY` / future `MERGE` candidate |
| `auth-writer-edge-proxy` | disposable Nginx dual-origin bridge | `dual-origin`, `dev` | `DEV_ONLY` / future `REMOVE_AFTER_CUTOVER` |
| `flask` | development Flask runtime | `dev` | `REQUIRED_DURING_ROLLBACK` |
| `next` | development Next.js runtime | `dev` | `DEV_ONLY` until final frontend ownership |

The tracked profile names are `backend`, `dev`, `dual-origin`, `prod`,
`writer`, and `writer-init`. Activating `dev` renders five services:
`auth-writer-init`, `flask`, `auth-writer`, `auth-writer-edge-proxy`, and
`next`. The operational file uses bind mounts rather than anonymous or named
Docker volumes. The `dev` topology uses the named application network
`prg32_cartridge_store_dev` plus the external `dream_edge` network.

The development edge labels currently route:

- `api.prg32.dream.test` to Flask on port 5080;
- `store.prg32.dream.test` to Next on port 3000; and
- selected API/auth paths through the disposable Nginx bridge to
  `auth-writer`.

This is not the final two-service public ownership arrangement. The current
Compose file still contains Flask, the writer initializer, the writer, and the
compatibility bridge.

### Documented intent

The intended permanent application topology is two services:

1. Next.js frontend;
2. Fastify backend owning canonical SQLite and immutable objects.

Traefik, Authentik/generic OIDC-SAML provider, DNS, TLS certificate management,
monitoring, and backup key custody are external responsibilities.

### Not verified operational state

No tracked repository artifact contains the live Dream Traefik dynamic
configuration, live certificate chain, DNS records, Authentik provider
registration, provider metadata, or production secret/key injection. These
remain **NOT_VERIFIED**, not inferred from the local Compose labels.

## 5. Final two-service contract

`deploy/candidate/compose.yaml` contains exactly `fastify` and `next`, one
private bridge network, explicit bind-mounted disposable storage, no external
network, no anonymous volumes, and no Traefik labels. Both candidate images
use `node:24-bookworm-slim` multi-stage builds. Runtime processes run as the
non-root `node` user, use read-only roots with a `/tmp` tmpfs, drop all Linux
capabilities, and use `no-new-privileges`.

The local candidate contract passed:

- canonical DB path `/data/canonical/store.sqlite`;
- canonical object root `/data/canonical`;
- canonical schema/layout/journal/backup tuple `2/2/1/3`;
- one Fastify writer lease;
- Fastify `/ready` response;
- Next `/ready` proxy response;
- Next-to-Fastify discovery proxy;
- API discovery URLs on `api.prg32.dream.test`;
- web discovery URL on `store.prg32.dream.test`; and
- `wss://api.prg32.dream.test/api/multiplayer` metadata.

The candidate is intentionally not an operational deployment. It has
development-only session settings, disposable authorization markers, mDNS
disabled, and public backup activation disabled. It also requires a prepared
canonical fixture; the Compose file does not silently initialize an
operational database.

The following production gates remain open:

- production-specific runtime configuration and secret injection;
- persistent bind-mount ownership and permission acceptance;
- canonical writer handover and startup ordering;
- graceful shutdown and restart policy acceptance;
- backup maintenance mode and scheduling;
- real edge trusted-proxy boundary;
- real OIDC/SAML provider registration;
- real WebSocket upgrade; and
- mDNS ownership/interface decision.

## 6. Preflight utility

Added:

- `backend/src/preflight/config.ts`;
- `backend/src/preflight/cli.ts`;
- package script `preflight:config`.

The utility has ABI `prg32-operational-preflight-1.0` and two explicit modes:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend run preflight:config -- --profile candidate
pnpm --dir backend run preflight:config -- --profile operational
```

Candidate checks cover candidate mode, non-production mode, canonical path
agreement, disposable writer agreement, legacy fallback absence, mDNS/backup
disablement, HTTPS public origins, distinct store/API origins, and API
federation-origin alignment.

Operational checks cover an explicit production profile, `NODE_ENV=production`,
the sole `fastify` writer declaration, canonical DB/root relationship, secure
cookie/SameSite coherence, HTTPS origins, and the current Flask ownership
boundary. The runtime-support check is deliberately `NOT_VERIFIED` while Flask
still owns operational routes.

The utility does not validate a value by printing it. Secret environment
variables are represented only by status. OIDC and SAML contract functions
validate issuer/endpoint binding, callback/ACS origin and path, openid/PKCE/
state/nonce, signed response/assertion requirements, explicit binding, and
replay protection using caller-supplied synthetic objects.

The preflight tests cover seven tests, including invalid roots, legacy fallback
variables, insecure/path-bearing origins, missing session-secret rejection,
secret redaction, generic OIDC, and generic SAML.

## 7. Traefik routing readiness

The intended routing matrix is:

| Public route | Intended owner | Required behavior | Local result |
|---|---|---|---|
| `store.prg32.dream.test` pages/assets | Next.js | HTML, assets, redirects, browser session | Candidate proxy works; real edge **NOT_VERIFIED** |
| `store.prg32.dream.test/api/*` | Next.js proxy → Fastify | cookies, CSRF, auth headers, JSON/streaming | Candidate HTTP path works; real edge **NOT_VERIFIED** |
| `api.prg32.dream.test/api/*` | Fastify | firmware/API contract, bodies, range/ETag | Fastify candidate works; real edge **NOT_VERIFIED** |
| `api.prg32.dream.test/auth/*` | Fastify | callback redirects, `Set-Cookie`, state | Synthetic edge tests pass; live edge **NOT_VERIFIED** |
| `api.prg32.dream.test/api/multiplayer` | Fastify | WebSocket Upgrade/Connection, WSS | Synthetic TLS upgrade passes; real Traefik **NOT_VERIFIED** |

No live Traefik request was made. The tracked development labels prove only
local intent and currently route API traffic to Flask. The candidate has no
Traefik labels by design. Forwarded-header trust, request-body limits,
`Set-Cookie`, CSRF, ETag, Range, streaming, redirects, and WebSocket upgrade
must be accepted against the real edge in a separately authorized window.

## 8. OIDC configuration readiness

The Fastify implementation is generic and consumes provider records rather than
Authentik-specific code. Synthetic tests cover discovery, authorization code,
PKCE, nonce, state/correlation, JWKS/signature validation, identity mapping,
session rotation, replay rejection, and stable error responses.

The new preflight accepts a generic provider only when:

- issuer, discovery, and JWKS are HTTPS and endpoint-bound to the issuer;
- client ID and authentication method are structurally valid;
- the callback is on the API origin at
  `/api/auth/oidc/<providerId>/callback`; and
- `openid`, PKCE, state, and nonce are required.

The expected operational provider origin is `https://sso.dream.test`, but no
discovery document, JWKS, client registration, redirect registration, logout
registration, or credential was retrieved. Live OIDC readiness is therefore
**NOT_VERIFIED**.

## 9. SAML configuration readiness

The generic SAML implementation and synthetic signed-provider tests cover SP
metadata, HTTP-Redirect/POST initiation, signed response and assertion
validation, issuer/audience, destination/recipient, temporal bounds, identity
mapping, certificate overlap, and replay protection.

The new preflight requires HTTPS SSO/ACS endpoints, API-origin ACS at
`/api/auth/saml/<providerId>/acs`, explicit SP/IdP entities and audience,
certificate reference, signed assertions, signed responses, an allowed binding,
and replay protection.

The real IdP signing certificate, metadata, entity IDs, ACS registration, and
logout behavior at `sso.dream.test` were not accessed. Live SAML readiness is
**NOT_VERIFIED**.

## 10. Two-origin browser verification

The repository has isolated HTTPS-edge and WebSocket tests using synthetic
origins and synthetic generic OIDC/SAML providers. The final post-fix test also
asserts that hostile `Host`/`X-Forwarded-*` headers cannot replace the
configured public origins.

No browser automation runner was used for this milestone. The following browser
properties are consequently **NOT_VERIFIED** at the actual two public origins:

- cookie host/domain behavior;
- Secure and HttpOnly behavior in a real browser;
- SameSite behavior across the store/API origin boundary;
- browser redirect return to the storefront;
- browser session refresh and logout;
- browser CSRF behavior; and
- live provider traversal through `sso.dream.test`.

The synthetic HTTP/TLS checks are not presented as browser evidence.

## 11. Session cutover policy

The accepted policy remains controlled re-login. Opaque Flask session cookies
are not migrated to Fastify. Fastify issues a new session backed by canonical
SQLite after login or generic federation callback.

Local evidence covers session rotation, CSRF regeneration, logout invalidation,
one-time OIDC/SAML correlation, legacy-cookie rejection, disabled-account
handling, and bearer-token compatibility. The user-visible consequence is that
users must sign in again at handover. This policy requires an operator notice
and an explicit session cutover decision before traffic changes.

## 12. Canonical storage readiness

Disposable storage-v2 tests pass the tuple `2/2/1/3`, SQLite integrity and
foreign-key checks, object SHA-256 verification, private staging audit,
publication journal recovery, writer leases, migration exception preservation,
and immutable object boundaries.

Backup-v4 wraps the existing version-3 payload with AES-256-GCM authenticated
encryption and an external key-provider boundary. Key material is not embedded
in an archive or emitted in logs. Wrong-key, tampering, truncation, incomplete
marker, interrupted encryption, and interrupted restore tests pass.

These are disposable guarantees. No operational SQLite file, object root,
staging root, or production key registry was opened.

## 13. Legacy migration rehearsal

The existing disposable M5.2c/M5.2d evidence was re-executed through the
backend suite:

1. Synthetic legacy source creation.
2. Legacy inventory and source verification.
3. Source immutability check.
4. Full re-import into a fresh canonical root.
5. Canonical audit and relationship checks.
6. Object-byte SHA-256 reconciliation.
7. Differential HTTP verification.
8. Migration interruption/resume coverage.

The final backend run includes the migration, differential, backup, restore,
rollback, auth, federation, and edge suites. The synthetic source is small and
does not establish a production downtime guarantee. The approved production
strategy remains **FULL RE-IMPORT AFTER WRITER FREEZE**; incremental delta
migration is not assumed.

## 14. Final data acceptance manifest

No operational acceptance manifest was generated. The future manifest must be
produced only after the Flask writer freeze and must include this structure:

| Domain | Source authority | Canonical target/evidence | Acceptance rule |
|---|---|---|---|
| Cartridges/releases | Flask catalog/index | canonical `cartridges`, `releases` | IDs, states, versions and relationships match |
| Artifacts/media/assets | Flask filesystem | immutable object store | size, kind and SHA-256 match |
| Users/groups/roles | Flask auth DB | canonical auth tables | IDs, disabled state, role/group membership match |
| API tokens | Flask auth DB | canonical token metadata | token compatibility verified; secret values never exported |
| External identities | Flask federation records | canonical identity mappings | provider/subject mapping and disabled-account behavior match |
| Sessions | none | controlled re-login | opaque Flask cookies rejected; no cookie migration |
| Submissions/staging | Flask submission records/files | canonical submissions/private staging | ownership, review state and staged hashes match |
| Review/publication | Flask records/journal | canonical decisions/events/journal | incomplete work remains recovery-required, never auto-published |
| Downloads | Flask telemetry | canonical download events | counts and event fields reconcile after freeze |
| Scores | Flask score store | canonical scores | identifiers, policy and ordering reconcile |
| Runs/samples/metrics | Flask metrics store | canonical telemetry tables | run/sample IDs, ownership and values reconcile |
| Settings/site assets | Flask settings/files | canonical settings/object store | non-secret settings and asset hashes match |
| Migration exceptions | migration evidence | canonical exception inventory | every exception accepted or blocks handover |
| Firmware metadata | source/index and `../PRG32` ABI | discovery/catalog responses | ABI, architecture and compatible fields preserved |

Blocking discrepancy conditions are missing IDs, changed immutable bytes,
unexplained relationship differences, lost private staging, unfinished
publication without recovery evidence, unaccounted telemetry writes,
unresolved disabled-account changes, or any simultaneous writer state.

## 15. Single-writer cutover phases

The following is a future procedure, not an execution log. No phase was run
against operational infrastructure.

| Phase | Preconditions/operator action | Evidence and abort gate | Rollback implication/authorization |
|---|---|---|---|
| PREPARE | Approve window, owner, session policy, key custody, monitoring and edge plan | Signed checklist; abort on missing approval or secret reference | Flask remains authoritative |
| QUIESCE | Stop/disable all Flask writes, including publication, review, telemetry, scores and multiplayer state mutations | Writer/process/route evidence; abort on any accepted write | No target ownership yet |
| SNAPSHOT | Capture SQLite-supported snapshot and filesystem inventory while quiesced | Inventory, hashes, integrity/FK checks; abort on mutation/missing object | Discard disposable target |
| IMPORT | Full import into a new canonical root | Migration checkpoints, exception inventory, object hashes | Never merge into existing target |
| VERIFY | Run canonical audit, differential API/firmware checks, backup-v4 verify and fresh-root restore | All reports pass; abort on any discrepancy | Flask remains owner |
| AUTHORIZE | Independent reviewer accepts data manifest, edge/provider, session and rollback gates | Recorded approval and target readiness | No traffic change without approval |
| HANDOVER | Acquire one Fastify writer lease and relinquish Flask writer | Lease evidence and zero simultaneous writers | Relinquish Fastify before any legacy restore |
| SMOKE | Exercise health, discovery, login/re-login, API, binary/media, telemetry, score, metrics and WSS paths | Public-origin smoke evidence; abort on callback/upgrade/write mismatch | Freeze target; do not restart Flask as a second writer |
| OBSERVE | Monitor readiness, errors, downloads, federation, WSS, backup and storage integrity | Agreed observation window and alerts | Rollback decision uses accepted-write inventory |
| ROLLBACK-CLOSE | Close window only after evidence and approval | Archive evidence and declare owner | After close, rollback requires a new approved change |

Every phase must re-check the prior phase evidence. No phase permits concurrent
authoritative Flask and Fastify writers.

## 16. Backup and key custody

The verified backup-v4 design provides:

- AES-256-GCM authenticated encryption;
- external key-provider lookup;
- active/decrypt-only/retired key states;
- historical-key restore tests;
- authenticated tamper and wrong-key rejection;
- fresh-root restore; and
- explicit writer-quiescence requirements.

Operational prerequisites remain open: external key custody, injection without
logging, rotation approval, historical-key retention, recovery authorization,
retention policy, backup schedule, verification monitoring, RPO, and RTO. No
production KMS integration, key, archive, or schedule was created or activated.

## 17. Rollback readiness

The disposable rollback state machine and `assertNoSimultaneousWriters` tests
pass. It explicitly transitions from legacy authority to an unowned verified
target, to test-only canonical authority, then relinquishes canonical ownership
before restoring legacy authority.

| Scenario | Safe policy | Status |
|---|---|---|
| Before writer handover | Discard disposable target; Flask remains authoritative | Disposable GO |
| After handover, before public traffic | Relinquish Fastify, verify target/legacy, then abort | Policy ready; operational unverified |
| After traffic with no accepted writes | Freeze writer, verify, restore owner only after lease release | Requires live approval |
| After traffic with accepted writes | Export/reconcile writes or accept explicit data loss; restart-only rollback is unsafe | Operational NO-GO |
| Partial publication | Preserve journal/staging, mark recovery-required, recover explicitly | Disposable evidence pass |
| Score/metrics ingestion | Freeze and reconcile accepted writes before owner reversal | Operational reconciliation open |
| Session/auth change | Controlled re-login; do not copy opaque cookies | Policy ready; browser open |
| Backup/restore failure | Quarantine incomplete output/target; never mark ready | Disposable evidence pass |

Post-cutover writes may not exist in the pre-cutover Flask snapshot. A rollback
decision must choose explicit accepted data loss, reconciliation/export, or a
forward fix. Reverse migration is not implemented.

## 18. Observability

Existing local readiness/logging provides signals for process health, canonical
SQLite/storage availability, writer lease, publication recovery, structured
federation errors, API failures, downloads, score/metrics paths, and WebSocket
routes. Backup-v4 and storage-v2 use structured error codes and keep secrets
out of diagnostics.

The operational monitoring plan must add alerts for:

- Fastify readiness loss and writer-lease contention;
- recovery-required publication/storage state;
- OIDC/SAML callback failure rate and replay rejection;
- API, download, score and metrics error rates;
- WebSocket upgrade/reconnect failures;
- backup verification/key availability failure; and
- integrity or filesystem permission failure.

No permanent monitoring service, external alert, or operational schedule was
changed.

## 19. Security findings

### Closed locally

- Preflight does not print secrets or access operational storage.
- Candidate public origins are now split and validated.
- Discovery no longer builds firmware API/WebSocket URLs from the storefront
  origin when a distinct federation/API origin is configured.
- Hostile forwarded headers do not replace configured public origins.
- Candidate mDNS and backup activation remain disabled.
- Candidate writer/database/root relationships are fail-closed.
- Generic OIDC/SAML structural checks reject unsafe callback/ACS contracts.
- No local P0 remains in the implemented scope.

### Remaining operational findings

| Priority | Finding | State |
|---|---|---|
| P1 | Real Dream Traefik routing, TLS, trusted proxy and WSS upgrade are not verified | Open / NOT_VERIFIED |
| P1 | Real generic provider callbacks and registrations at `sso.dream.test` are not verified | Open / NOT_VERIFIED |
| P1 | Final Flask freeze, full import, reconciliation and acceptance manifest are not executed | Open |
| P1 | Production Fastify writer ownership and rollback window are not authorized | Open |
| P1 | Production backup key custody, retention, RPO/RTO and restore authorization are not approved | Open |
| P1 | mDNS ownership after Flask retirement is unresolved | Open |
| P2 | Legacy Jinja/static/Flask dependencies and transitional Compose services remain | Expected until cutover |
| P2 | Real browser cookie/CSRF/session behavior across both public origins is unverified | Open |

## 20. Retirement readiness

No retirement action was taken.

| Component | Classification | Reason |
|---|---|---|
| Flask application/Python dependencies | `REQUIRED_UNTIL_CUTOVER`, then `REQUIRED_DURING_ROLLBACK` | still owns operational routes and data |
| Jinja templates/static assets | `REQUIRED_UNTIL_CUTOVER` | Next parity and route ownership must be accepted |
| Legacy SQLite adapters/index readers | `REQUIRED_UNTIL_CUTOVER` | final inventory/reconciliation source |
| Legacy publication/telemetry writers | `REQUIRED_UNTIL_CUTOVER` | must be frozen and reconciled, not concurrently run |
| Flask service/container | `REQUIRED_DURING_ROLLBACK` | preserve rollback source until window closes |
| `auth-writer-init` | `DEV_ONLY`, future `MERGE` candidate | initialization must be replaced by an approved single-writer startup contract |
| `auth-writer` | `DEV_ONLY`, future `MERGE` candidate | disposable writer boundary, not operational ownership |
| `auth-writer-edge-proxy` | `REMOVE_AFTER_CUTOVER` candidate | external Traefik should route directly after acceptance |
| Transitional env fallbacks | `REQUIRED_UNTIL_CUTOVER` | remove only after migration and rollback gates close |
| Migration/backup evidence | `PERMANENT_MIGRATION_EVIDENCE` | retain for audit and recovery |

Flask retirement is **NO-GO**.

## 21. Files changed

Changes attributable to M5.2g.12:

- `backend/src/preflight/config.ts` — pure, redacted candidate/operational and
  generic OIDC/SAML configuration validation.
- `backend/src/preflight/cli.ts` — non-starting preflight CLI.
- `backend/package.json` — `preflight:config` script.
- `backend/tests/preflight.test.ts` — six configuration and federation tests.
- `backend/src/catalog/routes.ts` — split web/API discovery URL construction.
- `backend/tests/dual-origin.test.ts` — regression for API/web discovery split.
- `deploy/candidate/compose.yaml` — candidate defaults for separate store/API
  origins.
- `docs/modernization/98-operational-preflight-m5-2g-12.md` — this report.

The worktree contains many earlier uncommitted modernization changes. They were
preserved and not reset, cleaned, stashed, committed, or pushed.

## 22. Tests added

The new preflight suite contains seven tests:

1. valid disposable canonical candidate;
2. legacy fallback, root mismatch and unsafe-origin rejection;
3. missing session-secret rejection;
4. secret-value redaction;
5. generic OIDC endpoint/callback/security contract;
6. OIDC callback-origin rejection; and
7. generic SAML signing/replay contract and rejection.

The dual-origin regression adds one HTTP discovery test for separate web/API
origins and hostile forwarded headers.

## 23. Full verification results

All final commands below were executed with Node.js 24 selected through nvm.

| Command/check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 47 files, 237 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 21 files, 59 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |
| preflight unit tests | PASS — 7 tests |
| final dual-origin/edge/preflight targeted suite | PASS — 3 files, 14 tests |
| disposable M5.2c migration and M5.2d differential suites | PASS |
| backup-v3 and encrypted backup-v4 suites | PASS |
| candidate image build | PASS — Node 24 slim multi-stage images |
| candidate container smoke | PASS — exactly `fastify` + `next`, both healthy |
| candidate readiness proxy | PASS — Next `/ready` reached Fastify |
| candidate discovery | PASS — API/WSS use `api.prg32.dream.test`, web uses `store.prg32.dream.test` |
| real two-origin browser test | NOT_VERIFIED — no browser runner used |
| real Dream Traefik/Auth provider test | NOT_VERIFIED — explicitly not contacted |

One initial frontend build without `FLASK_PROXY_TARGET` failed as designed with
the explicit error that the Flask proxy target is required. The final build
with the required target passed. This fail-closed behavior is retained and is
not counted as a final verification failure.

## 24. Remaining P0/P1/P2 blockers

Local implementation has no unresolved P0. The operational gate remains
blocked by the following P1 items:

1. No source-backed live Traefik/TLS/DNS evidence.
2. No live `sso.dream.test` OIDC/SAML registration or callback evidence.
3. No final quiesced Flask snapshot, full acceptance manifest, or
   post-freeze reconciliation.
4. No approved Fastify writer handover or public route ownership switch.
5. No operational backup key custody, retention, RPO/RTO, or restore drill.
6. No accepted mDNS owner/interface after Flask retirement.
7. No real-browser two-origin cookie/CSRF/session evidence.

P2 work remains for legacy page/static retirement and removal of transitional
Compose services after the rollback window. These are not reasons to weaken
the current safety gates.

## 25. Required future authorizations

Before any operational action, obtain separate approval for:

- a maintenance window and complete writer freeze;
- access to the controlled Dream Traefik edge and DNS/TLS evidence;
- controlled verification of generic OIDC/SAML at `sso.dream.test`;
- production secret and backup-key custody;
- final legacy inventory/import/reconciliation;
- public route ownership transfer;
- session re-login communication;
- backup/restore acceptance, retention, RPO/RTO and monitoring; and
- rollback data-loss policy.

This milestone did not authorize or perform any of those actions.

## 26. Recommended next milestone

Do not start another implementation milestone automatically. The next useful
milestone should be a separately authorized **operational acceptance window**
that verifies the real Dream Traefik and generic provider contracts, executes a
read-only pre-cutover source snapshot and acceptance manifest, and closes the
writer/backup/rollback gates. It must still stop before public cutover until
the independent acceptance decision is recorded.

## 27. GO/NO-GO decisions

| Decision | Result |
|---|---|
| Safe local configuration preflight | **GO** |
| Disposable two-service candidate | **GO** |
| Local preflight readiness (complete milestone) | **PARTIAL** |
| Real Traefik/public routing | **NO-GO / NOT_VERIFIED** |
| Real OIDC provider at `sso.dream.test` | **NO-GO / NOT_VERIFIED** |
| Real SAML provider at `sso.dream.test` | **NO-GO / NOT_VERIFIED** |
| Operational Fastify cutover | **NO-GO** |
| Flask retirement | **NO-GO** |
| M5.2g.13 or M6.3d.2h.12 | **NOT STARTED** |
| Commit, push, deployment | **NOT PERFORMED** |
