# PRG32 Cartridge Store — Next.js Storefront M1

Date: 2026-10-14
Status: **GO for the isolated Storefront M1 implementation; NO-GO for Flask retirement or public backend cutover**

## Executive result

The Next.js storefront foundation has been replaced with the first real
read-only storefront slice:

- the home page loads the published catalog from the existing API;
- users can search by the Flask-supported `q` parameter;
- users can filter by architecture and sort by title or update time within the
  bounded catalog page returned by the API;
- query, filter, sort, and page state remain shareable in the URL;
- each cartridge has a detail route with metadata, authors, tags, versions,
  architectures, media, and an exact download link;
- loading, empty, filtered-empty, API-error, validation-error, and missing
  cartridge states are explicit and do not expose raw exception details;
- downloads remain direct links to the existing Flask endpoint, preserving its
  binary response and download accounting behavior.

This milestone does not add publishing, reviews, authentication UI changes,
metrics, scores, multiplayer UI, a Fastify public route, a database adapter, or
any storefront mock data.

## Backend contract boundary

The frontend uses the following public Flask-owned routes through the existing
Next proxy or configured dual-origin API origin:

| Storefront action | Existing route | Ownership preserved |
| --- | --- | --- |
| Catalog listing and search | `GET /api/games?q=&page=&per_page=` | Flask |
| Cartridge detail/version | `GET /api/games/<id>?version=` | Flask |
| Icon | `GET /api/games/<id>/icon?version=` | Flask |
| Screenshot | `GET /api/games/<id>/screenshot?version=&architecture=` | Flask |
| Binary download | `GET /api/games/<id>/download?version=&architecture=` | Flask |

The response envelopes and identifiers are validated with the existing
TypeScript/Zod API boundary. The frontend does not access SQLite, inspect the
filesystem store, duplicate publication rules, or proxy download bytes through
a Next.js server action/BFF. The download anchor points directly at Flask so
the existing `record_download` path remains authoritative.

The backend already supports server-side text search and pagination, but does
not expose catalog architecture/category/tag/sort query parameters. Therefore
the implementation sends only documented listing parameters and applies
architecture filtering and title/update sorting to the bounded `per_page=100`
response. When the server reports more results than the bounded page, the UI
states this limitation and provides pagination/search rather than pretending
that the client has a complete global result set.

## Frontend implementation

Added or changed files:

- `frontend/src/app/page.tsx`: storefront home page entry point;
- `frontend/src/app/games/[gameId]/page.tsx`: dynamic cartridge detail route;
- `frontend/src/app/loading.tsx` and `frontend/src/app/not-found.tsx`:
  route-level loading and missing-resource states;
- `frontend/src/lib/api/catalog.ts`: typed catalog/detail/media/download URL
  helpers using the existing API client and origin policy;
- `frontend/src/lib/api/schemas.ts`: exported catalog/detail response schemas;
- `frontend/src/components/storefront/CatalogBrowser.tsx`: discovery,
  search, bounded filter/sort, pagination, and URL state;
- `frontend/src/components/storefront/GameCard.tsx`: responsive catalog cards;
- `frontend/src/components/storefront/GameDetail.tsx`: detail, metadata,
  version and architecture selection, media, and download action;
- `frontend/src/components/storefront/CartridgeArtwork.tsx` and
  `CatalogState.tsx`: media fallback and shared state components;
- `frontend/src/components/layout/AppShell.tsx` and
  `frontend/src/app/layout.tsx`: Store navigation and storefront metadata;
- `frontend/src/components/storefront/CatalogBrowser.test.tsx` and
  `GameDetail.test.tsx`: representative API fixture tests.

The UI uses semantic headings, labeled search and select controls, explicit
button states (`aria-pressed`), live result counts, keyboard-visible focus
styles, descriptive link/button names, responsive grids, and image fallbacks.
No Playwright or browser E2E suite was introduced.

## Verification evidence

Node checks used `nvm use 24`, Node `24.20.0`, and pnpm `12.5.1`.

| Check | Result |
| --- | --- |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 12 files, 34 tests |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm --dir frontend run build` | PASS — Next route `ƒ /games/[gameId]` |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 27 files, 138 tests |
| `pnpm --dir backend run build` | PASS |
| `.local/python3.13-venv/bin/python -m pytest -q` with synthetic test secret | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

The repository's existing `.venv` uses Python 3.9 without `hashlib.scrypt`;
that interpreter produced environment-only failures before application logic
could run. The final Flask result used an isolated Python 3.13 virtualenv
created under `.local/` from the existing `requirements.txt`. The no-secret
Python 3.13 run exposed the existing test precondition for the non-test mDNS
case; rerunning with `SECRET_KEY=prg32-test-only-secret` passed all 64 tests.
No real credentials were used.

Public integration checks were read-only:

- `https://store.prg32.dream.test/` returned HTTP 200 and rendered the Next.js
  storefront shell with the catalog loading state;
- `https://api.prg32.dream.test/api/games` returned HTTP 200 with the current
  valid empty catalog (`total: 0`), so no real binary download could be
  exercised without creating production catalog data;
- running development containers showed Flask healthy and Next running;
- the pre-existing disposable `auth-writer` and edge-proxy health probes were
  unhealthy (`ECONNREFUSED 127.0.0.1:5090` / proxy 502). This is outside the
  read-only catalog scope and was not changed.

## Acceptance decision and remaining risks

**GO for Storefront M1 code and contract integration.** The implementation is
covered by focused tests, builds under Node 24, and targets the existing
Flask-compatible API without changing backend behavior. Live binary evidence
remains pending because the public catalog is currently empty; this is an
environment/data availability limitation, not a fabricated success.

**NO-GO for Flask retirement or public Fastify cutover.** Flask remains the
authoritative catalog, media, download, publication, legacy-route, and
telemetry owner. A later cutover still needs operational ownership, data
rehearsal, rollback, and session/route evidence.

Remaining Storefront work includes publishing/review/admin surfaces,
authenticated account flows, scores/metrics views, multiplayer UI, richer
catalog facets once backend contracts exist, and production traffic/canary
validation. Those are separate milestones and were not started here.

No production data, schema, firmware repository, authentication behavior,
Traefik routing, deployment, Playwright suite, commit, or push was changed.
