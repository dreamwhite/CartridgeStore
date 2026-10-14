# PRG32 Cartridge Store — M5.2g.6 Functional Parity Audit & Canonical Runtime Consolidation

Date: 2026-10-14  
Decision: disposable audit GO; operational cutover NO-GO; Flask retirement NO-GO

## 1. Executive result

The audit is source-backed and covers all 77 explicitly registered Flask
route paths. The Fastify canonical runtime was corrected in two places where
the composition root could still consult legacy state:

- discovery `name` now comes from the canonical `store_settings` table when a
  canonical catalog is configured;
- administrative catalog reads use `CanonicalCatalog` in canonical mode rather
  than constructing a legacy `ReadonlyCatalog`.

Canonical settings assets and secret-storage path validation also use the
canonical root when it is configured. These changes are disposable-only and
do not alter the operational Flask owner.

The result is not a claim of complete application parity. Publication/review,
firmware writes, score writes, metrics writes, external federation acceptance,
WebSocket routing, mDNS on a real LAN, legacy HTML, backup operations and
cutover controls remain explicitly gated.

The attached M5.2g.6 request ended during the required-documentation list;
this report therefore uses the complete, visible scope and does not invent
acceptance criteria that were not present in the supplied text.

## 2. Scope and safety boundary

Inspected:

- Flask route decorators and supporting modules.
- Fastify composition, route modules and storage-v2 modules.
- Next.js app routes and API clients.
- `../PRG32` read-only for firmware constants and store-client paths.
- `docker-compose.yml`, Dockerfiles, profiles, networks, mounts, labels and
  health checks in read-only mode.
- Modernization reports M5.0 through M5.2g.5.

Not changed:

- operational SQLite databases, cartridge storage or bind mounts;
- Flask ownership, public routing, Next.js rewrites, Compose, Traefik or
  Authentik/generic provider configuration;
- `../PRG32`;
- operational containers or LAN mDNS;
- commits, pushes or deployment.

## 3. Source-backed capability disposition

The machine-readable audit is implemented in
`backend/src/readiness/functional-parity.ts`. It uses the following
dispositions:

- `migrated_verified`: isolated contract evidence is complete for the scoped
  behavior;
- `migrated_not_fully_verified`: implementation and isolated tests exist, but
  an external or operational gate remains;
- `partially_migrated`: Fastify behavior exists but operational ownership or a
  substantial contract family remains open;
- `legacy_only`: the Flask implementation is still required and no silent
  retirement is assumed.

The audit test parses Flask decorators from the actual modules and fails if a
new explicit route is not classified. It currently accounts for 77 paths,
including catalog, authentication, federation, publishing, review, metrics,
scores, statistics, administration, backup, multiplayer and legacy HTML
routes. Flask framework-generated `/static/<path:filename>` behavior is
covered by the separate legacy HTML/static capability rather than being
misrepresented as an explicit decorator.

Highlights:

| Capability | Disposition | Evidence | Remaining gate |
| --- | --- | --- | --- |
| Catalog, versions, architectures, media, downloads | migrated_verified | M5.2d differential and M5.2g.1 HTTP tests | public ownership and telemetry reconciliation |
| Discovery and mDNS | migrated_verified / migrated_not_fully_verified | M5.2g.1 and M5.2g.4 tests | real LAN and public runtime acceptance |
| Local authentication and tokens | migrated_not_fully_verified | auth, CSRF and M5.2g.5 tests | cookie/session continuity and operational writer |
| Generic OIDC/SAML | migrated_not_fully_verified | protocol, identity and admin tests | external provider/browser acceptance |
| Publishing and review | partially_migrated | M5.2g.2 workflow and recovery tests | operational single writer and history reconciliation |
| Metrics/runs/samples | partially_migrated | M5.2g.3 and firmware compatibility tests | operational firmware write ownership |
| Scores/leaderboard | partially_migrated | M5.2g.3 and firmware compatibility tests | rate-limit continuity and write reconciliation |
| Statistics | migrated_not_fully_verified | canonical statistics and authorization tests | telemetry ownership and legacy HTML user pages |
| Administration/settings/assets | partially_migrated | Fastify admin/settings tests and canonical catalog test | full operational write and HTML parity |
| Backup/restore | partially_migrated | M5.2e v3 disposable suite | operational encryption, authenticity and retention |
| Legacy Jinja/PWA/static/user pages | legacy_only | Flask route inventory and Next page inventory | explicit Next.js URL/HTML parity acceptance |
| Optional LDAP adapter | legacy_only | source shows configuration warning only; no interactive login | explicit decision if a deployment enables it |

## 4. Canonical runtime consolidation

The canonical runtime audit now asserts these invariants:

1. Catalog reads are owned by `CanonicalCatalog` and its target SQLite/object
   root; an unreferenced legacy file cannot become a published cartridge.
2. Discovery settings are read from the same canonical catalog source, not the
   legacy shadow database.
3. Canonical administrative catalog list/detail operations use the canonical
   source. They do not return stale legacy catalog data after a canonical
   publication.
4. Canonical site-asset storage is rooted under the canonical storage root.
5. Secret key-registry boundary checks use the canonical application root when
   canonical mode is selected; keys remain outside the archive/root as
   required by the existing secret implementation.
6. Canonical read-only mode routes settings, statistics, scores and metrics
   reads to a read-only target SQLite resource; canonical workflow mode routes
   them to the single canonical writer resource.
7. Canonical workflow startup and readiness use the canonical SQLite database.
8. No public `/api/storage-v2/*` route is registered.
9. Canonical mode remains explicitly disposable and authorization-gated.

The regression tests prove that the legacy shadow database can be made
temporarily unavailable while canonical discovery, authentication/readiness
statistics and administrative catalog reads continue to work. This is not an
online cutover test.

## 5. Firmware contract evidence

`backend/tests/firmware-contract.test.ts` reads, without modifying,
`../PRG32` and verifies:

- `_prg32store._tcp` and default port `5080`;
- discovery ABI `prg32-store-discovery-1.0`;
- discovery document and `/api/games`/download client paths;
- `esp32c6` and `qemu` architecture constants.

Result: 2/2 tests passed. No firmware build, device, QEMU or network
verification was started in this milestone.

## 6. Docker Compose read-only inventory

Current single-file Compose topology contains seven services:

| Service | Profiles | Classification | Notes |
| --- | --- | --- | --- |
| `cartridge-store` | `prod` | REMOVE_AFTER_CUTOVER | legacy Flask production image on port 5080 and `/data` |
| `backend` | `backend` | DEV_ONLY / MERGE | standalone Fastify hot-reload fixture service on port 5090 |
| `auth-writer-init` | `writer-init`, `writer`, `dev` | MERGE / REMOVE_AFTER_CUTOVER | disposable SQLite/key-registry initialization |
| `auth-writer` | `writer`, `dev` | KEEP temporarily / MERGE | Fastify disposable writer with hot reload |
| `auth-writer-edge-proxy` | `dual-origin`, `dev` | REMOVE_AFTER_CUTOVER or EXTERNAL | Nginx bridge for isolated dual-origin testing |
| `flask` | `dev` | DEV_ONLY / REMOVE_AFTER_CUTOVER | current operational compatibility owner |
| `next` | `dev` | DEV_ONLY now, KEEP as production runtime | Next.js hot-reload frontend and Traefik labels |

Compose currently has the internal `app` network plus the external Dream
Traefik network (`DREAM_EDGE_NETWORK`, default `dream_edge`). Persistent state
is bind-mounted rather than anonymous: Flask data, backend fixtures,
writer/auth data, writer shadow DB, writer store, source trees, node modules
and Next cache are all explicit paths. The edge proxy and Next service expose
the existing `api.prg32.dream.test` and `store.prg32.dream.test` labels.

The final topology hypothesis remains:

- one Fastify runtime owning canonical SQLite, immutable objects, HTTP,
  firmware contracts, WebSocket and (when separately approved) mDNS;
- one Next.js runtime;
- existing external Dream Traefik;
- existing external generic OIDC/SAML provider.

This is a future plan, not a Compose change. `auth-writer-init` and the edge
proxy cannot be deleted before canonical authentication, secret/key custody,
public routing and operational ownership are approved. Flask and the legacy
production service cannot be removed before the route, write, rollback and
firmware gates close.

## 7. Verification performed

Commands and results for this milestone:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
Node v24.20.0

pnpm --dir backend run typecheck                         PASS
pnpm --dir backend run test                             PASS (42 files, 213 tests)
pnpm --dir backend exec vitest run ...                  focused audit/canonical tests PASS (12/12)
pnpm --dir backend exec vitest run tests/firmware...     PASS (5/5)
pnpm --dir backend exec vitest run storage/migration...  PASS (6 files, 26 tests)
pnpm --dir backend run lint                             PASS
pnpm --dir backend run build                            PASS
pnpm --dir frontend run typecheck                       PASS
pnpm --dir frontend run lint                            PASS
pnpm --dir frontend run test                            PASS (20 files, 55 tests)
FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build PASS
SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q PASS (64 tests)
python3 -m py_compile app.py cartridge_store/*.py  PASS
docker compose --profile dev config --quiet        PASS
git diff --check                                   PASS
```

The first full backend run exposed a false positive in the pre-existing
readiness scanner: a source-path string in the new audit matched its broad
`route...storage-v2` heuristic. The audit source was reformatted to remove
that ambiguity; no production behavior was involved. The rerun passed with
42 files and 213 tests.

Previous verified baseline retained from M5.2g.5 was:

- backend: 40 files, 206 tests;
- frontend: 20 files, 55 tests;
- Python: 64 tests.

## 8. Operational decision

M5.2g.6 disposable audit/consolidation: GO. Operational cutover: NO-GO.
Flask retirement: NO-GO.

Open blockers:

- complete legacy HTML/Next.js URL and behavior parity;
- operational canonical snapshot migration and one-writer ownership;
- score/metrics/telemetry reconciliation and firmware write gate;
- publication/review ownership and recovery against the final source data;
- external Traefik/WebSocket and generic-provider acceptance;
- real LAN mDNS validation;
- operational backup encryption, authenticity, key custody, retention and
  restore runbook;
- authentication/session continuity and controlled re-login plan.

No M5.2g.7 or M6.3d.2h.12 work was started.
