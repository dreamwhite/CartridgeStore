# PRG32 Cartridge Store — UI.3 Homepage & Explore Separation

## 1. Executive summary

UI.3 implements the public information architecture split requested for the Next.js frontend:

- `/` is now a dedicated PRG32 landing page.
- `/explore` is the canonical public cartridge catalog.
- `/games/[gameId]` remains the detail route, including version selection and architecture-specific downloads.
- Existing catalog query parameters remain `q`, `architecture`, `sort`, and `page`.
- Legacy catalog links using those parameters on `/` redirect to `/explore` without dropping the values.

The implementation is frontend-only. No Flask, Fastify, database, authentication, Docker, Traefik, Authentik, or production routing behavior was changed.

Decision markers:

`UI3_HOMEPAGE_SEPARATION_GO`  
`UI3_EXPLORE_CANONICAL_GO`  
`UI3_LEGACY_URL_COMPATIBILITY_GO`  
`UI3_CATALOG_FUNCTIONALITY_GO`  
`UI3_PROJECT_CONTENT_ACCURACY_GO`  
`UI3_ZERO_CATALOG_GO`  
`UI3_DARK_LIGHT_GO`  
`UI3_RESPONSIVE_GO`  
`UI3_ACCESSIBILITY_GO`  
`UI3_FRONTEND_REGRESSION_GO`

Overall UI.3 decision: `UI3_HOMEPAGE_EXPLORE_GO` for the local frontend implementation. The shared live runtime still requires a frontend refresh/rebuild before the new root page is observable there; this is recorded as an operational follow-up, not hidden as a passing result.

## 2. Scope and safety boundary

The authorized scope was public Homepage/Explore separation. The changes are limited to the Next.js frontend source and one modernization report. Existing dirty worktree changes from earlier milestones were preserved.

The following were not changed by UI.3:

- Flask or Fastify implementation.
- API response structures or identifiers.
- SQLite schema, data, or migrations.
- Authentik, OIDC/SAML behavior, sessions, or credentials.
- Docker Compose, Dockerfiles, Traefik, public deployment, or volumes.
- Jinja templates and legacy server routes.
- Production data and routing.

No commit or push was performed.

## 3. Starting route inventory

Before this milestone, the catalog was rendered from `/`. There was no Next.js `/explore`, `/catalog`, or `/search` page in the checked-out frontend. The existing public navigation exposed:

- Explore: `/`.
- Search: `/#catalog-search`.
- Documentation: `/docs`.

The existing catalog behavior was implemented by `CatalogBrowser`, with query-driven search, architecture filtering, sorting, pagination, TanStack Query loading/error handling, cartridge detail links, and download links.

The existing detail route was `/games/[gameId]` with `?version=<version>` for version selection. Its API paths and architecture selection were retained.

## 4. Coupling analysis

`CatalogBrowser` is a client component and uses `usePathname()` when constructing navigation URLs. That made it reusable on `/explore` without moving catalog business behavior into the new landing page.

The landing page is intentionally static and does not call the catalog API. This keeps the Homepage independent from catalog availability and avoids duplicating Flask/Fastify behavior in React.

The root route is a server component. It only inspects the four historical catalog query keys and redirects when at least one is present. Unrelated root query parameters do not become catalog state.

## 5. Canonical route decisions

| Purpose | Canonical route | Result |
| --- | --- | --- |
| Project landing page | `/` | Dedicated PRG32 introduction and entry points |
| Public catalog | `/explore` | `CatalogBrowser` mounted here |
| Catalog search | `/explore?q=...` | Existing query name preserved |
| Architecture filter | `/explore?architecture=...` | Existing query name preserved |
| Sorting | `/explore?sort=...` | Existing query name preserved |
| Pagination | `/explore?page=...` | Existing query name preserved |
| Cartridge detail | `/games/[gameId]` | Existing route preserved |
| Version selection | `/games/[gameId]?version=...` | Existing query preserved |
| Documentation | `/docs` and existing documentation slugs | Existing route family preserved |

## 6. Legacy URL compatibility

`frontend/src/lib/navigation/catalog-compat.ts` defines the small compatibility boundary. It accepts Next.js `searchParams`, copies only `q`, `architecture`, `sort`, and `page`, and serializes them through `URLSearchParams`.

Examples:

```text
/?q=space%20opera&architecture=qemu&sort=updated&page=2
→ /explore?q=space+opera&architecture=qemu&sort=updated&page=2
```

```text
/
→ Homepage, without a redirect
```

Array-valued search parameters use the first value, matching the bounded route compatibility requirement. The original names and values are not renamed or discarded.

## 7. Project source audit

The Homepage copy was constrained to facts present in the adjacent read-only `../PRG32` repository and its documentation. It describes:

- PRG32 as an open-source educational runtime.
- RISC-V assembly and C learning.
- A compact retro-gaming environment.
- The init/update/draw runtime loop.
- `.prg32` cartridge packaging and Store distribution.
- ESP32-C6 hardware and the QEMU execution path.

No external images, invented cartridges, fabricated metrics, or unsupported product claims were added.

## 8. Homepage information architecture

The new `Homepage` contains six compact sections:

1. Hero: “Build cartridges. Learn the machine.” with Explore and getting-started entry points.
2. Project introduction: what PRG32 is and how the Store fits into it.
3. Capabilities: play cartridges, build/package bundles, and learn the system.
4. Cartridge loop: Write, Package, Run.
5. Technical signal panel: RV32, `.PRG32`, and QEMU/C6 markers.
6. Participation CTA: Explore and documentation links.

The page does not contain catalog results, search controls, or catalog loading states.

## 9. Homepage visual implementation

The visual direction follows the existing PRG32 technical language: semantic surface/border tokens, purple primary accents, restrained borders, monospace technical labels, grid signal treatment, and responsive layout changes at the existing Tailwind breakpoints.

The signal panel is CSS/HTML decoration only. It is not presented as live hardware telemetry.

## 10. Explore implementation

`frontend/src/app/explore/page.tsx` mounts the existing `CatalogBrowser`. The catalog hero now identifies the page as `PRG32 / Explore` and describes browsing published cartridges. The former catalog Explore CTA was removed because the user is already on the canonical Explore route; documentation remains available.

No API client or server contract was changed.

## 11. Search, filter, sort, and pagination

The existing `CatalogBrowser` behavior remains the source of truth:

- Search uses `q`.
- Architecture selection uses `architecture`.
- Sort uses `sort`.
- Pagination uses `page`.
- API requests still use the existing catalog client and response validation.
- Detail links still use `/games/<id>`.
- Download links still include selected version and architecture.

The test fixture uses synthetic cartridges with both `qemu` and `esp32c6` variants and verifies the exact download URL shape.

## 12. Detail compatibility

`GameDetail` remains at `/games/[gameId]`. Version selection continues to use `?version=...`; architecture selection and download URL generation are untouched. The only UI.3 adjustment is the return link, which now points to `/explore` and is labelled “Back to Explore”.

No backend detail or download contract was modified.

## 13. Navigation updates

Public navigation is now:

```text
Explore       /explore
Search        /explore#catalog-search
Documentation /docs
```

The brand remains `/`. Active-route tests now treat `/explore` as the catalog surface, while hash links remain non-active navigation targets.

## 14. Zero-catalog state

`CatalogBrowser.test.tsx` retains explicit coverage for an empty API response and verifies the user-visible “The catalog is empty.” state. The existing `CatalogState` error path remains covered by the same component test with a rejected catalog request.

The Homepage has no dependency on catalog population and therefore remains usable when the catalog is empty or unavailable.

Marker: `UI3_ZERO_CATALOG_GO`.

## 15. Populated synthetic catalog checks

The component test uses synthetic, non-production cartridges and verifies:

- Two catalog cards render.
- Detail navigation points to the correct cartridge ID.
- The download link contains the expected version and architecture.
- Search writes `/explore?q=pong`.
- Architecture filtering writes `/explore?architecture=esp32c6`.
- The mobile filter dialog can apply its selection.

This is isolated test data; no production or real user data was used.

## 16. Dark-mode verification

The local production server browser check set `data-theme="dark"` and verified Homepage and Explore at 375, 768, 1024, 1440, and 1920 pixels. Both route headings were present and no horizontal overflow was detected.

Marker: `UI3_DARK_LIGHT_GO`.

## 17. Light-mode verification

The same local browser check set `data-theme="light"` and verified the same five widths. Both route headings were present and no horizontal overflow was detected.

The existing hydration-safe theme initialization remains in place: server and initial client render start from dark, and persisted theme preference is applied after hydration. UI.3 did not reintroduce a server/client theme branch.

## 18. Responsive matrix

| Viewport width | Homepage | Explore | Horizontal overflow |
| ---: | :---: | :---: | :---: |
| 375 | PASS | PASS | None |
| 768 | PASS | PASS | None |
| 1024 | PASS | PASS | None |
| 1440 | PASS | PASS | None |
| 1920 | PASS | PASS | None |

The matrix was exercised in both light and dark themes against the local built Next.js runtime.

Marker: `UI3_RESPONSIVE_GO`.

## 19. Accessibility

The landing page uses one `h1`, labelled sections, normal link/button semantics, visible text labels, and `aria-hidden` on decorative icons and signal cells. Existing catalog controls retain their labelled search input, filter dialog, radio controls, retry alert, and detail/download links.

The existing component tests validate accessible names for the search field, filter dialog, buttons, links, and alert. No automated axe audit was added in this milestone.

Marker: `UI3_ACCESSIBILITY_GO`.

## 20. Performance

The Homepage is static from the application perspective: it performs no catalog query and adds no image or external-font request. Explore continues to fetch catalog data only where the catalog is needed. The production build completed successfully with the new page and route.

No performance budget or production load test was authorized for UI.3.

## 21. Tests and validation commands

Executed with Node.js 24.20.0 selected through `nvm use 24`:

| Command | Result |
| --- | --- |
| `pnpm --dir frontend run typecheck` | PASS; serial rerun after `.next` generation |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS; 33 test files, 82 tests |
| `pnpm --dir frontend run build` | PASS; Next.js 16.4.0, `/` and `/explore` present in route output |
| Local Playwright browser smoke | PASS against disposable local Next runtime; both themes and five widths |
| `git diff --check` | PASS |

An initial parallel invocation of typecheck and build produced a transient typecheck failure because the build was concurrently recreating `.next/types/*`. The required serial typecheck was rerun after the build and passed. This was not an application type error.

Backend, Python, Docker, and production checks were not run because UI.3 explicitly authorizes frontend-only changes and prohibits operational infrastructure changes.

## 22. Files changed

New UI.3 files:

- `frontend/src/app/explore/page.tsx`
- `frontend/src/components/homepage/Homepage.tsx`
- `frontend/src/components/homepage/Homepage.test.tsx`
- `frontend/src/lib/navigation/catalog-compat.ts`
- `frontend/src/lib/navigation/catalog-compat.test.ts`
- `docs/modernization/166-homepage-explore-separation-ui-3.md` (this report)

Modified for the route split:

- `frontend/src/app/page.tsx`
- `frontend/src/components/layout/navigation.ts`
- `frontend/src/components/layout/AppShell.test.tsx`
- `frontend/src/components/layout/navigation.test.ts`
- `frontend/src/components/storefront/CatalogBrowser.tsx`
- `frontend/src/components/storefront/CatalogBrowser.test.tsx`
- `frontend/src/components/storefront/GameDetail.tsx`
- `frontend/src/styles/index.css`

The worktree also contains unrelated pre-existing modernization changes. They were not reset, cleaned, or folded into this UI.3 report.

## 23. Limitations and unresolved issues

The browser observation of `https://store.prg32.dream.test` did not fully reflect the local source at the time of verification:

- `/explore` was reachable and showed the new Explore surface.
- `/` still served the previous catalog-oriented runtime.
- The live root query URL did not redirect to `/explore`.

This indicates a stale or partially refreshed shared Next.js runtime/container. No rebuild, restart, Docker change, or deployment action was performed because those actions are outside UI.3 scope. The local built runtime did verify the intended Homepage and redirect behavior.

The standalone Next server was not used for the final browser evidence because this checkout’s standalone output requires the deployment packaging step to copy static assets; the ordinary local `next start` process served the generated build for the disposable browser check. No production packaging was changed.

Catalog data was not populated in the live environment. Populated behavior is therefore evidenced by isolated synthetic component fixtures, not by production catalog records.

## 24. Future tokens and refactoring

No new backend or API token was introduced. Existing authentication and API behavior remain outside this milestone.

Future work may extract a shared catalog query-state helper if additional catalog surfaces are added. That was deliberately deferred because `/explore` is the only canonical catalog route in UI.3.

## 25. Next milestone readiness

Before the next public visual milestone:

1. Rebuild/reload the Next.js development runtime so `/` serves the new Homepage.
2. Re-run the dual-origin browser smoke on `store.prg32.dream.test`.
3. Confirm the legacy root query redirect through the actual edge path.
4. Confirm the existing container/proxy API target is available for populated Explore verification.
5. Keep backend and infrastructure changes in their own authorized milestone.

The code is ready for that runtime refresh, but the live edge observation is not a reason to claim the shared runtime has already been updated.

Preserved project status markers:

`M555_BACKEND_FREEZE_GO`  
`OPERATIONAL_CUTOVER_NO_GO`  
`FLASK_RETIREMENT_NO_GO`

## 26. Final decision

`UI3_HOMEPAGE_EXPLORE_GO`

The authorized frontend implementation is complete and locally verified. Homepage/Explore separation, legacy query compatibility, catalog functionality, project-content accuracy, responsive light/dark behavior, and frontend regression checks are satisfied in the source and local build.

Operational live-runtime acceptance remains pending the existing Next.js container/runtime refresh. No production behavior was changed, no deployment was performed, and no later milestone was started.
