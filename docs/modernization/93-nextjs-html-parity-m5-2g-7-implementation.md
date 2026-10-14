# PRG32 Cartridge Store — M5.2g.7 Next.js HTML and URL Parity

Date: 2026-10-14  
Decision: **isolated implementation GO; operational cutover NO-GO; Flask retirement NO-GO**

## 1. Executive result

M5.2g.7 implemented the missing browser-facing foundations needed to remove
the Flask-rendered UI as a future functional dependency:

- local registration request and one-time registration completion;
- account API-token list/create/rename/revoke with CSRF and one-shot secret
  display;
- public user profiles and owner/administrator-protected run list/detail
  pages;
- private metrics run list/detail pages with CSV and Markdown export links;
- Next-owned PWA manifest, icons, service worker and registration;
- explicit legacy URL compatibility mapping with query preservation and
  open-redirect rejection;
- machine-readable route, URL and frontend API parity evidence.

This is not an operational cutover. Existing Next rewrites, Compose, Traefik,
Flask, Authentik/generic providers, operational databases, bind mounts and
public ownership were not changed. The current repository can therefore
prove isolated Next/Fastify parity without claiming that production traffic
already reaches those surfaces.

## 2. Scope and evidence

The Flask inventory was derived from the actual decorators in:

- `cartridge_store/app.py`;
- `cartridge_store/auth/`;
- `cartridge_store/review.py`;
- `cartridge_store/metrics.py`;
- `cartridge_store/scores.py`;
- `cartridge_store/stats.py`;
- `cartridge_store/users.py`;
- `cartridge_store/multiplayer.py`.

The inventory contains all 77 explicit route paths already audited in
M5.2g.6. The machine-readable disposition is in
`docs/modernization/evidence/m5-2g-7-html-route-parity.json`.

The frontend API audit is in
`docs/modernization/evidence/m5-2g-7-frontend-api-parity.json`; URL mappings
and negative redirect cases are in
`docs/modernization/evidence/m5-2g-7-url-compatibility.json`.

## 3. Route and workflow coverage

| Area | Next/Fastify result | Evidence boundary |
| --- | --- | --- |
| Catalog listing, search, filter, sort and pagination | Implemented in Next and consumed through `/api/games` | HTTP/RTL and existing canonical API tests; no browser E2E claim |
| Cartridge detail, versions and architectures | Implemented in `/games/[gameId]` | Preserves `esp32c6` and `qemu`, version query and architecture selection |
| Media and binary downloads | Implemented through canonical API paths | Exact bytes and content contracts remain backend-owned |
| Scores and statistics | Implemented in `/scores` and `/stats` | Query parameters and empty/error states covered by existing frontend tests |
| Local auth and generic OIDC/SAML | Login plus registration pages use backend-supplied provider descriptors | No Authentik-specific code, credential, provider or cookie conversion |
| Account and tokens | Implemented in `/account` | Token secret is never returned by list; creation displays it once |
| Publishing and review | `/publish`, `/workspace`, `/review` use isolated Fastify workflow contracts | CSRF, permissions and review state remain backend-owned |
| Admin/settings/catalog/federation | Existing Next workspaces remain the isolated consumers | Backup actions remain explicitly gated by Fastify policy |
| Public profiles and private runs | `/users/[username]`, `/users/[username]/runs`, `/users/[username]/runs/[runId]` plus `/api/users/...` | Profile summary is public; run data is owner/admin only |
| PWA/static | Next route handlers own manifest, icons and service worker | Legacy static files were not removed |
| Multiplayer | Existing Fastify WebSocket/status contract remains canonical | No external proxy or live WebSocket claim |

The explicit legacy-only items in the route evidence are the Flask HTML
`/api` index, which has no required browser workflow, and the two legacy
form-post token aliases. The Next account UI uses the canonical JSON
PATCH/DELETE contract instead. API namespaces are never redirected to HTML.

## 4. Implemented frontend boundaries

New frontend boundaries are intentionally small:

- `RegisterPanel` owns only registration form state and delegates validation
  and eligibility to Fastify;
- `AccountWorkspace` owns token metadata interactions and does not persist or
  print token secrets beyond the create response;
- `MetricsWorkspace` and `ProfileWorkspace` render backend-owned metrics;
- `PwaRegistration` registers the Next-owned service worker;
- `lib/compatibility/urls.ts` and `lib/compatibility/server.ts` constrain
  same-origin application redirects;
- all new API calls use existing `requestSameOriginJson`/`requestApiJson`,
  Zod response validation, cookies and CSRF helpers.

No Flask business logic, SQLite query, legacy `index.json` lookup or object
storage rule was copied into React.

## 5. URL compatibility and security

Application redirects cover `/auth/login`, `/auth/register`, registration
completion, `/auth/tokens`, `/setup` and `/editor/submissions`. Dynamic
catalog, profile and run URLs are represented by App Router pages. Query
parameters are preserved, except that the canonical settings/review workflow
owns its destination path. `return_to` is validated with the existing
same-origin policy and rejects absolute, protocol-relative, encoded and
backslash redirects.

The Next client does not contain a deployment origin. The existing explicit
dual-origin configuration remains the only way to call a separate API origin.
No API route is redirected to a page, and externally returned error text is
not used as an HTML destination.

## 6. Fastify profile contract

`backend/src/profile/routes.ts` adds read-only endpoints:

- `GET /api/users/:username` — public username, role, creation time, run
  count and whether the current principal may view runs;
- `GET /api/users/:username/runs` — owner/admin list with bounded pagination;
- `GET /api/users/:username/runs/:run_id` — owner/admin detail and the same
  metrics summary fields used by existing run APIs.

The route uses the configured canonical read database when canonical mode is
enabled, otherwise the existing read-only database manager. It does not write
telemetry, update last-used token metadata, or expose password hashes,
session material or private staging paths.

## 7. PWA and static compatibility

Next route handlers now serve:

- `/manifest.webmanifest`;
- `/static/icon-192.svg`;
- `/static/icon-512.svg`;
- `/static/service-worker.js`.

The service worker uses a versioned cache, network-first requests and a
same-origin shell. The legacy `/static/` files remain in place for Flask and
were not deleted or modified.

## 8. Tests and verification

New/updated focused coverage:

- frontend URL compatibility: 4 tests;
- frontend suite after implementation: 21 files, 59 tests;
- Fastify profile ownership and response contract: 1 test;
- backend full suite after implementation: 43 files, 214 tests;
- Python suite: 64 tests.

The frontend tests are Vitest/React Testing Library tests. No Playwright or
browser E2E result is claimed in this milestone.

Final verification commands and results:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24                         PASS (Node v24.20.0)
pnpm --dir backend run typecheck                                  PASS
pnpm --dir backend run lint                                       PASS
pnpm --dir backend run test                                       PASS (43 files, 214 tests)
pnpm --dir backend run build                                      PASS
pnpm --dir frontend run typecheck                                 PASS
pnpm --dir frontend run lint                                      PASS
pnpm --dir frontend run test                                      PASS (21 files, 59 tests)
FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build PASS
SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q PASS (64 tests)
python3 -m py_compile app.py cartridge_store/*.py                     PASS
docker compose --profile dev config --quiet                          PASS
git diff --check                                                       PASS
jq empty docs/modernization/evidence/m5-2g-7-*.json                   PASS
```

The frontend test runner emits the existing non-blocking Vite
`configLoader: native` warning. The first deliberately concurrent verification
attempt also caused timing-sensitive pre-existing tests to exceed their 5s
individual limit; the serial rerun above passed fully. No source change was
made in response to that runner contention.

## 9. Files created or modified

Created:

- `backend/src/profile/routes.ts`;
- `backend/tests/profile.test.ts`;
- `frontend/src/components/account/AccountWorkspace.tsx`;
- `frontend/src/components/auth/RegisterPanel.tsx`;
- `frontend/src/components/metrics/MetricsWorkspace.tsx`;
- `frontend/src/components/profile/ProfileWorkspace.tsx`;
- `frontend/src/components/pwa/PwaRegistration.tsx`;
- `frontend/src/app/auth/login/page.tsx`;
- `frontend/src/app/auth/register/page.tsx`;
- `frontend/src/app/auth/register/complete/page.tsx`;
- `frontend/src/app/register/page.tsx`;
- `frontend/src/app/register/complete/page.tsx`;
- `frontend/src/app/runs/page.tsx`;
- `frontend/src/app/runs/[runId]/page.tsx`;
- `frontend/src/app/users/[username]/page.tsx`;
- `frontend/src/app/users/[username]/runs/page.tsx`;
- `frontend/src/app/users/[username]/runs/[runId]/page.tsx`;
- `frontend/src/app/manifest.webmanifest/route.ts`;
- `frontend/src/app/static/icon-192.svg/route.ts`;
- `frontend/src/app/static/icon-512.svg/route.ts`;
- `frontend/src/app/static/service-worker.js/route.ts`;
- `frontend/src/lib/api/profile.ts`;
- `frontend/src/lib/compatibility/urls.ts`;
- `frontend/src/lib/compatibility/urls.test.ts`;
- `frontend/src/lib/compatibility/server.ts`;
- the three JSON evidence files under `docs/modernization/evidence/`.

Modified:

- `backend/src/app.ts`;
- `frontend/src/app/account/page.tsx`;
- `frontend/src/app/layout.tsx`;
- `frontend/src/lib/api/auth.ts`;
- `frontend/src/lib/api/contracts.ts`;
- `frontend/src/lib/api/schemas.ts`.

No Docker, Compose, Traefik, provider, Flask template/static, operational
data, `../PRG32` or deployment file was modified.

## 10. Findings and remaining risks

### P0

None found in the isolated source-backed parity scope.

### P1

None in the newly implemented isolated browser/API contracts. Operational
P1 gates remain open: public Next/Fastify ownership, session continuity,
single-writer handover, external OIDC/SAML callback acceptance, WebSocket
proxy acceptance, telemetry reconciliation and rollback authorization.

### P2

- Existing Next rewrite configuration still describes transitional Flask
  ownership in development; it was intentionally not changed by this
  milestone.
- Static legacy assets remain for Flask compatibility until public ownership
  is cut over.
- No browser E2E or real Traefik/provider test was run.
- The `/api` informational index remains legacy-only because it is not a
  required browser workflow; legacy token form aliases remain transitional
  until public routing cutover.

### P3

- PWA cache policy should be reviewed with the final deployment cache headers.
- Profile/run visual parity is functional and accessible but not a pixel-level
  reproduction of the Jinja templates.

## 11. Safety and operational decision

No operational database, cartridge object, account, session, volume,
container, route, provider or reverse-proxy state was touched. Flask remains
authoritative. Fastify remains isolated/disposable. This milestone does not
authorize Compose changes, public routing changes, Flask removal or cutover.

M5.2g.7 result: **GO for the isolated Next.js/Fastify HTML and URL parity
implementation.**  
Operational migration: **NO-GO.**  
Flask retirement: **NO-GO.**

Next milestone recommendation: perform a separately authorized operational
readiness review for route ownership and session/data handover, using this
route and API evidence as the acceptance baseline. Do not start M5.2g.8 or
M6.3d.2h.12 automatically.
