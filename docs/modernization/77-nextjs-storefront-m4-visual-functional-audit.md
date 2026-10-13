# PRG32 Cartridge Store — Next.js Storefront M4 Visual, Functional & CORS Audit

Date: 2026-10-14
Status: **GO for the isolated M4 storefront boundary; NO-GO for Flask
retirement, public Fastify cutover, production routing, deployment, or
Playwright/E2E expansion**

## 1. Scope and constraints

This milestone audited the existing Next.js storefront against the supplied
PRG32 visual reference, repaired the browser catalog integration boundary, and
made small accessibility and responsive improvements. Flask remains the public
owner of catalog, statistics, scores, metrics, downloads, and WebSocket
compatibility routes. Fastify remains an isolated writer/authentication
integration and was not promoted to public catalog ownership.

No database schema, Flask behavior, authentication policy, Traefik,
Authentik, production configuration, deployment, sibling repository, or
Playwright test was changed. No credentials, production records, or synthetic
catalog records were created.

## 2. Evidence labels

- **BROWSER_VERIFIED** means observed in the existing Chrome tab through the
  browser automation surface, using accessibility state, screenshots, and
  read-only navigation. No Playwright test suite was used.
- **HTTP_VERIFIED** means observed with read-only `curl` requests against the
  configured development origins.
- **SOURCE_VERIFIED** means established by reading the current source and
  tests.
- **UNVERIFIED** means that the evidence was not available in this milestone;
  it is not presented as a pass.

## 3. Reference and current UI audit

The supplied reference shows a compact PRG32 product shell with a purple brand
mark, dense navigation, first-class light and dark themes, a short hero, and
bounded card/table surfaces. It also shows populated examples for catalog,
detail, publishing, statistics, profile, documentation, and authentication.

The development catalog is currently empty. The audit therefore preserves the
real empty state instead of inventing cartridge art, ratings, download counts,
authors, or history. Populated-card parity remains **UNVERIFIED** until real
published data exists.

### Page-by-page result

| Surface | Result | Evidence and limitation |
| --- | --- | --- |
| Store/catalog | Improved | **BROWSER_VERIFIED** compact header, purple `P` mark, short `Play. Code. Learn.` hero, search, architecture/sort controls, and explicit empty state. Real Flask catalog response is still authoritative. |
| Cartridge detail | Preserved | **SOURCE_VERIFIED** dynamic route, metadata, media, version/architecture selection, and download links remain contract-driven. Populated visual comparison is **UNVERIFIED** because the public catalog is empty. |
| Publish | Preserved | **SOURCE_VERIFIED** existing four-step ZIP workflow uses the isolated Fastify contract, CSRF, bounded upload handling, and explicit unavailable/error states. No new publish behavior was introduced. |
| Review | Preserved | **SOURCE_VERIFIED** permission-gated isolated workflow, metadata editing, approval/rejection confirmation, and query invalidation remain unchanged. |
| Developer workspace | Improved | **SOURCE_VERIFIED** authenticated owner list now consumes the real pagination envelope with Previous/Next controls; no editor-wide list is used as an ownership substitute. |
| Statistics | Preserved | **BROWSER_VERIFIED** `/stats` renders documented empty aggregates and makes the owner/admin metrics boundary explicit. |
| Scoreboard | Preserved | **BROWSER_VERIFIED** `/scores` renders accessible filters and a truthful empty state without fabricated ranking data. |
| Documentation | Preserved | **BROWSER_VERIFIED** `/docs` exposes the eight curated public articles with readable link cards. Internal reports and infrastructure details remain excluded. |
| Authentication | Preserved | **HTTP_VERIFIED** anonymous `/auth/me` remains `401 login required`; exact CORS headers are present on the Fastify auth origin. `useCurrentUser` maps 401 to anonymous UI. |

## 4. Visual and accessibility changes

The M4 changes are intentionally small and token-based:

- `AppShell` now has a compact branded header, a visible PRG32 mark, an
  overflow-safe navigation row, and a theme control beside authentication.
- `ThemeToggle` uses an accessible button name, a title, visible focus styling,
  and the existing Zustand theme store. The test verifies the light/dark
  transition and `prg32-theme` persistence.
- The catalog hero is shorter, bounded by the existing light/dark surface and
  border tokens, and has real navigation CTAs rather than decorative actions.
- The existing CSS custom properties remain the single visual source for
  light/dark background, surface, text, muted text, and border colors.
- The owner workspace pagination controls use native buttons, disabled states,
  and an `aria-label` for the page navigation region.
- Existing responsive grid, wrapping, horizontal navigation overflow, reduced
  motion, and focus-visible rules are retained.

No mockup-only media, ratings, counts, or profile data was fabricated.

## 5. CORS defect diagnosis

### 5.1 Root cause

In the active dual-origin development profile, the browser origin is
`https://store.prg32.dream.test` and the explicit API origin is
`https://api.prg32.dream.test`. Before M4, the catalog, statistics, scores,
and metrics adapters used the direct API-origin helper for public Flask-owned
routes.

The public API hostname routes `/api/games` and the other operational public
paths to Flask. Flask does not emit `Access-Control-Allow-Origin` for those
responses. The Fastify writer/auth edge emits an exact-origin CORS policy, but
it is not the owner of the public catalog and must not become one implicitly.

This was verified with an `Origin: https://store.prg32.dream.test` request:

- direct `GET https://api.prg32.dream.test/api/games?...`: `200`, Werkzeug,
  no `Access-Control-Allow-Origin`;
- direct `OPTIONS` for that path: `200`, `Allow: OPTIONS, GET, HEAD`, no CORS
  headers;
- direct `GET https://api.prg32.dream.test/auth/me`: `401`, exact
  `Access-Control-Allow-Origin: https://store.prg32.dream.test`, credentials
  enabled, and `Vary: Origin`;
- direct auth `OPTIONS`: `204` with the same exact-origin policy.

### 5.2 Repair decision

The repair keeps public operational APIs on the existing Next.js same-origin
compatibility rewrites. `requestSameOriginJson` was added to the shared client
and is used by catalog, statistics, scores, and metrics adapters. Catalog
media and binary-download paths are also relative, preserving the Flask route,
identifier, response, and download telemetry contracts.

Authentication and federation remain on the explicit API origin and continue
to use the exact allowlist policy. The `401` anonymous `/auth/me` response is
expected and is not weakened or converted into a successful anonymous session.

This avoids expanding Flask CORS while preserving a future migration seam:
the public API owner can change behind the same Next path without changing
browser code.

## 6. Compatibility and browser verification

The same-origin compatibility request returned the existing Flask envelope:

```json
{
  "ok": true,
  "games": [],
  "pagination": {
    "page": 1,
    "per_page": 100,
    "total": 0,
    "pages": 1,
    "has_next": false,
    "has_prev": false,
    "next_page": null,
    "prev_page": null
  }
}
```

The existing Chrome tab was reloaded after the change. **BROWSER_VERIFIED**:
the Store page loaded its real empty catalog state without browser console
errors; `/stats`, `/scores`, and `/docs` loaded through the same shell; and the
light/dark toggle rendered both token sets before the original light preference
was restored. The browser smoke was read-only and did not visit login,
publishing mutations, review mutations, or administrative actions.

## 7. Files changed for M4

- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/ThemeToggle.tsx`
- `frontend/src/components/layout/ThemeToggle.test.tsx`
- `frontend/src/components/storefront/CatalogBrowser.tsx`
- `frontend/src/components/workflow/DeveloperWorkspace.tsx`
- `frontend/src/components/workflow/DeveloperWorkspace.test.tsx`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/client.test.ts`
- `frontend/src/lib/api/catalog.ts`
- `frontend/src/lib/api/catalog.test.ts`
- `frontend/src/lib/api/statistics.ts`
- `frontend/src/lib/api/scores.ts`
- `frontend/src/lib/api/metrics.ts`
- `docs/configuration.md`
- `docs/modernization/19-revised-migration-roadmap.md`
- `docs/modernization/77-nextjs-storefront-m4-visual-functional-audit.md`

The repository also contains pre-existing dirty files from M0–M3 and earlier
milestones. They were not reset, committed, or pushed.

## 8. Verification matrix

| Command | Result |
| --- | --- |
| `source /Users/ivan/.nvm/nvm.sh && nvm use 24 && pnpm run typecheck` in `frontend/` | PASS; Node `v24.20.0` |
| `source /Users/ivan/.nvm/nvm.sh && nvm use 24 && pnpm run lint` in `frontend/` | PASS |
| `source /Users/ivan/.nvm/nvm.sh && nvm use 24 && pnpm run test` in `frontend/` | PASS; 20 files, 55 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 pnpm run build` in `frontend/` | PASS; Next production build |
| `pnpm run build` in `frontend/` without `FLASK_PROXY_TARGET` | EXPECTED CONFIGURATION FAILURE; production guard requires the target |
| `source /Users/ivan/.nvm/nvm.sh && nvm use 24 && pnpm run typecheck` in `backend/` | PASS |
| same backend `pnpm run lint` | PASS |
| same backend `pnpm run test` | PASS; 28 files, 142 tests |
| same backend `pnpm run build` | PASS |
| `SECRET_KEY='m4-ephemeral-test-only' ./.venv313/bin/python -m pytest -q` | PASS; 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `python3 -m pytest -q` using the pre-existing Python 3.9 `.venv` | BLOCKED by environment; Python lacks `hashlib.scrypt` and produced 32 failures/errors before application assertions |
| `docker compose config` and `docker compose --profile dev config` | PASS |
| `docker build -t prg32-cartridge-store:local .` | PASS |
| `docker build -t prg32-cartridge-store-frontend:local ./frontend` | PASS; existing Node 24 multi-stage production image |
| `git diff --check` | PASS |
| read-only browser smoke | PASS for Store, Stats, Scores, Docs, theme toggle; no console errors observed |

The `.venv313` environment is isolated and ignored by Git. No production
container, database, or data directory was used for test fixtures.

## 9. Remaining risks and explicit non-goals

- The public Flask API still has no general CORS policy. This is intentional;
  public browser calls now avoid cross-origin requests through Next rewrites.
- Direct API consumers other than the Next storefront still need their own
  compatibility strategy; this milestone does not change Flask headers.
- Populated catalog visual parity, binary download behavior against a real
  published cartridge, and authenticated publishing/review browser flows are
  not claimed because the available public data is empty and mutations were
  out of scope.
- The compatibility rewrite still depends on a reachable `FLASK_PROXY_TARGET`.
- WebSocket upgrades continue to use the existing direct Flask/Traefik path;
  Next API rewrites do not proxy WebSocket upgrades.
- Flask remains the authoritative public operational owner. No Fastify cutover
  or retirement readiness decision is implied.

## 10. Rollback considerations

The M4 application changes are localized. To roll back the repair, restore the
public adapters to `requestApiJson` and restore absolute catalog media/download
paths, but that would intentionally reintroduce the observed browser CORS
failure. The safer operational rollback is to keep the same-origin adapters and
disable/stop the new storefront deployment at the deployment layer; no
database or Flask rollback is required. No rollback was performed here.

## 11. Milestone decision and next step

**GO** for the isolated visual/functional M4 storefront boundary and the
same-origin public API compatibility repair.

**NO-GO** for Flask retirement, Fastify public ownership, production routing,
deployment, schema changes, or additional E2E infrastructure.

Recommended next milestone: a separately authorized populated-data visual
acceptance pass (using disposable fixtures only) plus explicit operational
ownership/cutover planning for one public Flask route group. Keep the current
same-origin boundary and do not start `M6.3d.2h.12` automatically.
