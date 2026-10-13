# PRG32 Cartridge Store — M5 operational ownership, data convergence and incremental cutover preparation

Date: 2026-10-14
Status: preparation complete; operational cutover **not authorized**.

## Executive result

**GO for preparation artifacts and disposable validation. NO-GO for public
Fastify cutover, Flask retirement, shared production writes, schema migration,
deployment, or M6.3d.2h.12.**

The current architecture is intentionally transitional:

```text
browser
  ├─ store.prg32.dream.test -> Next.js dev/HMR
  │    └─ public same-origin rewrites -> Flask compatibility API
  └─ api.prg32.dream.test -> Traefik
       ├─ auth/federation paths -> isolated Fastify auth writer bridge
       └─ legacy API/WS paths -> Flask

Fastify read/shadow and writer fixtures remain isolated below .local/writer.
Flask remains the only operational public writer and mDNS advertiser.
```

The topology uses one repository-local Compose file with profiles. Dev starts
Next.js, Flask, and the isolated Fastify auth writer/edge bridge; the shared
Traefik and generic OIDC/SAML provider infrastructure are external. There is
no provider container in this repository and no assumption that the provider
is Authentik-specific. Node checks use Node 24 through `nvm use 24`.

Supporting evidence:

- [route ownership matrix](78-route-ownership-matrix.md)
- [machine-readable route inventory](78-route-inventory.json)
- [database/filesystem convergence assessment](78-database-filesystem-convergence.md)
- [incremental cutover plan](78-incremental-cutover-plan.md)
- [M4 visual and CORS boundary audit](77-nextjs-storefront-m4-visual-functional-audit.md)

## Scope and safeguards

This milestone inspected source, tests, route registration, disposable
runtime state, Docker topology and the sibling firmware repository. It did not
modify production data, the sibling `../PRG32` repository, Authentik/provider
state, operational SQLite, live cartridge files, or deployment routing. No
commit or push was made. No second operational writer was started.

The `.local/` bind-mounted state is explicitly disposable and separate from
the production `data/` bind mount. The backend shadow database is read-only;
auth/submission writes are permitted only inside the test-mode writer root.

## Route and behavioral parity

The current Flask runtime inventory contains catalog, download, scores,
metrics/runs, statistics, multiplayer, local auth, optional federation,
publishing/review, administration, backup, discovery and legacy Jinja routes.
Fastify contains implementations for many of the same paths, plus newer JSON
admin/federation routes, but route existence is not parity.

The material differences found are:

- Fastify catalog reads an isolated index/filesystem and does not currently
  reproduce Flask download-event persistence.
- Score and metrics write handlers are isolated and require firmware contract,
  anonymous request, limit, error, auth and transaction comparison.
- Flask and Fastify session cookies/formats differ. A Flask signed `session`
  cookie cannot be consumed by Fastify's database-backed
  `prg32_ts_session`; a public auth cutover would need an explicit continuity
  policy.
- Flask and Fastify have different admin verbs/paths and permission mapping.
- Fastify publication/review journals are stronger but isolated; they have not
  reconciled the legacy index/pending/filesystem semantics.
- Fastify backup/federation routes are feature-gated and are not evidence of
  operational readiness when disabled.
- Flask registers the `_prg32store._tcp` mDNS advertisement and Fastify does
  not. There must be one advertiser, not two.
- Multiplayer protocol behavior is closely aligned in source/tests, but state
  is process-local and WebSocket upgrade ownership/routing is still a gate.

The complete route-by-route classification is in the linked matrix. The first
candidate is `GET /api/stats/runs` plus `GET /api/stats/scores`, after
differential comparison on a deterministic disposable snapshot. This is a
read-only group with no filesystem, session, firmware-ingestion, WebSocket or
mDNS side effect.

## Data and filesystem ownership

Flask is the authority for the eleven legacy SQLite tables and the public
filesystem store. The existing Flask startup DDL/helpers remain the effective
schema authority. Fastify Drizzle types do not change that decision; Fastify's
federation migrations apply only to its isolated writer objects.

The public filesystem consists of the ABI-tagged `index.json`, published
`cartridges/<game>/<version>/<architecture>.prg32`, `pending/<submission_id>`
staging, and assets. Flask's publication path has ordinary-error
compensation but no durable crash journal. Fastify's journaled publication
and review paths are not yet compatible enough to share these roots.

Dual writers and continuous dual-write are rejected. The recommended future
convergence is: Fastify adopts the legacy schema and paths, observes them
read-only, proves differential parity, then receives a stop-the-world,
single-writer handover with verified backup and rollback. A schema rewrite is
not the first handover step.

## Publication state machine and recovery ownership

Fastify has isolated publication states `PREPARED`, `STAGED`, `VERIFIED`,
`FILES_REPLACED`, `INDEX_REPLACED`, `DATABASE_UPDATED`, `COMPLETED`,
`COMPENSATING`, `COMPENSATED`, `RECOVERY_REQUIRED`, and `FAILED`; review has a
smaller journal. These are useful acceptance criteria but are not currently a
license to point Fastify at Flask's live root. Flask's existing compensation
behavior must be captured as a compatibility contract or deliberately replaced
under a later gate.

During any future handover, only the selected owner may mutate pending files,
published files, index, submission rows or recovery journals. Restore and
rollback require both application writers stopped and a verified backup.

## Authentication, CSRF and authorization continuity

The current browser flow remains Flask-compatible for public operational
routes through Next same-origin rewrites. Direct API-origin browser requests
are reserved for exact-origin auth/federation integration.

Fastify has explicit permissions and database-backed sessions; Flask has
signed sessions, session-bound CSRF and role levels `reader`, `user/player`,
`publisher`, and `admin`, with editor-group review behavior. These models need
route-specific comparison. A shared cookie name or blind proxy would not
provide continuity. The cutover plan therefore treats auth/federation as a
late stage with an explicit login/session transition, CSRF, bearer-token,
provider callback and logout plan.

## Capability-specific decisions

| Capability | Current owner | M5 decision |
| --- | --- | --- |
| Catalog/download | Flask | no cutover until index, media, range/ETag/error and download telemetry parity |
| Scores | Flask | keep firmware POST on Flask until anonymous compatibility and single-writer handover are proven |
| Metrics/runs | Flask | keep ingestion on Flask; compare bounded exports and owner/admin authorization first |
| Statistics | Flask | first candidate is read-only stats after differential evidence |
| Publishing/review | Flask | Fastify journal remains disposable; no shared pending/publication root |
| Multiplayer | Flask | no switch until one relay owner, WebSocket upgrade and cleanup evidence |
| mDNS/discovery | Flask | maintain one advertiser and canonical `_prg32store._tcp`/5080 contract |
| Backup/recovery | Flask operationally | rehearse on disposable copies; never run competing restore implementations |
| Auth/federation | Flask public, Fastify isolated writer | generic OIDC/SAML only; defer live provider/session transition |

Firmware constants remain aligned with `../PRG32`: `_prg32store._tcp`, port
5080, `prg32-store-discovery-1.0`, `prg32-metadata-1.0`,
`prg32-colophon-1.0`, `esp32c6`, and `qemu`. The sibling repository was
inspected read-only and was not modified.

## Risk register

| ID | Risk | Impact | Mitigation / gate | Status |
| --- | --- | --- | --- | --- |
| R1 | Two writers mutate SQLite/filesystem | corruption or divergence | single-owner invariant; stop-the-world handover | open, controlled |
| R2 | Fastify session cookie cannot read Flask session | logout/account confusion | explicit session transition; auth late stage | open |
| R3 | Fastify catalog misses download telemetry | statistics and firmware-visible behavior drift | implement/verify event parity before catalog cutover | open |
| R4 | Legacy schema lacks centralized migration version | unsafe implicit DDL drift | fingerprint legacy schema; retain Flask authority until adopted | open |
| R5 | Publication crash leaves index/files/DB inconsistent | broken catalog or lost submission | reconcile journal against legacy semantics; disposable crash drill | open |
| R6 | Admin route/RBAC mismatch | privilege escalation or blocked operators | route/action authorization matrix and negative tests | open |
| R7 | Firmware score/metrics clients break | device regressions | exact payload/error/anonymous regression suite | open |
| R8 | WebSocket or mDNS split ownership | discovery/relay failure | one process/advertiser and direct upgrade test | open |
| R9 | Backup copied without WAL/journal or files | unrecoverable restore | SQLite backup API/integrity/foreign-key and full tree inventory | open |
| R10 | Dev fixtures mistaken for production | data loss or contamination | bind-separated roots and explicit environment gates | mitigated |
| R11 | Provider assumptions become Authentik-specific | federation portability loss | generic OIDC/SAML contract; external `sso.dream.test` only in local infra | mitigated |

## Decision gates and next milestone

The next authorized milestone should be a disposable read-only differential gate
for the statistics candidate. It should create deterministic fixture data in a
temporary copy, call Flask and Fastify with identical query parameters, compare
status/body/headers and prove no write timestamp or file changed. It should
not enable operational Fastify writes, move auth sessions, test live provider
state, or begin M6.3d.2h.12.

After that gate, the next decision is whether to authorize catalog read parity
or a bounded authenticated read surface. Scores, metrics ingestion, publishing,
auth/federation, multiplayer and Flask retirement remain later gates.

## Verification record

The following checks were executed for this milestone using Node 24 via
`nvm use 24` and the working Python 3.13 environment:

| Check | Result |
| --- | --- |
| Frontend TypeScript typecheck | PASS |
| Frontend ESLint | PASS |
| Frontend Vitest | PASS — 20 files / 55 tests |
| Frontend production build with `FLASK_PROXY_TARGET=http://flask:5080` | PASS |
| Fastify TypeScript typecheck | PASS |
| Fastify ESLint | PASS |
| Fastify Vitest | PASS — 28 files / 142 tests |
| Fastify production build | PASS |
| Python pytest on Python 3.13 | PASS — 64 tests |
| Python byte compilation | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

These results are repository checks, not evidence of an operational cutover.
The earlier incompatible Python 3.9 environment is not used as a code result.
No Playwright/browser integration suite was added or run.
