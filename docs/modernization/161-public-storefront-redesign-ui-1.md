# PRG32 Cartridge Store — UI.1 Public Storefront Redesign

## 1. Executive summary

UI.1 is implemented as a public storefront redesign for the existing Next.js frontend. The homepage, catalog/search/filter experience, cartridge detail page, responsive behavior, theme behavior, and download navigation were updated without changing backend contracts, routes, authentication, authorization, Docker architecture, or operational ownership.

The implementation is a GO for UI.1. Operational cutover remains blocked exactly as required by the existing backend freeze and readiness decisions.

## 2. Scope and constraints

This milestone was limited to the public storefront surfaces:

- `/`
- `/games/[gameId]`
- Existing catalog, media, and download API calls.

No Flask, Fastify, SQLite, authentication, RBAC, Compose, Traefik, Authentik, or production behavior was changed. No commit or push was performed. The worktree already contained unrelated changes from previous milestones; those changes were preserved.

## 3. Approved mockup availability and analysis

The approved visual reference was available at:

`/Users/ivan/.codex/attachments/03757b30-4d43-4edc-a3af-2ed7caa84c57/image-1.png`

It is a 1536×1024 contact sheet covering dark/light homepage, catalog, detail, publishing, statistics, profile, documentation, and authentication states. The relevant direction is a compact full-width shell, purple accent system, thin borders, dense cards, a technical hero, a left filter rail, and a clear download panel.

## 4. Source-derived route inventory

The implementation preserves the existing route inventory and adds no new public API route:

- `/` — public catalog/storefront.
- `/games/[gameId]` — cartridge detail.
- `/docs` and `/docs/[slug]` — existing documentation links.
- `/api/games`, `/api/games/<id>`, `/api/games/<id>/icon`, `/api/games/<id>/screenshot`, `/api/games/<id>/download` — existing API/media/download contracts.

## 5. Existing storefront problems addressed

The previous public surface did not provide a sufficiently strong visual hierarchy for discovery, had weak separation between homepage discovery and catalog browsing, and did not give mobile users an explicit filter interaction. The detail page also lacked a dense technical presentation and a clearly prioritized download panel.

## 6. Final visual direction

The storefront now uses the UI.0/UI.0.1 foundation: full-width page gutters, compact bordered surfaces, muted neutral backgrounds, violet primary actions, Lucide icons, shared Card/Badge/Button/Select primitives, and explicit dark/light theme tokens.

## 7. Full-width geometry

Homepage, catalog, and detail layouts use the shared `.page-gutter` geometry. Content expands across the viewport while maintaining stable horizontal gutters. Desktop catalog uses a compact `14rem` filter rail and a flexible card area. Detail uses a flexible media column and a compact `19rem` download/information rail.

## 8. Checkpoint A — Homepage

The homepage now contains:

- PRG32 / Cartridge Store identity.
- “Play. Code. Learn.” value proposition.
- Explore and Documentation actions.
- Live result and architecture counts derived from the catalog response.
- API status indicator.
- Recently updated section derived deterministically from `updated_at`.
- Catalog search entry point.

No fictitious editorial ranking or hard-coded cartridge metadata was introduced.

## 9. Hero composition

The hero follows the approved technical direction: a compact two-column desktop composition, dense headline block, bordered technical preview, and search control. The preview is deliberately restrained CSS/HTML technical composition because no approved console/device asset existed in the repository or attachment set.

## 10. Featured cartridge semantics

The homepage section is labelled “Recently updated”, not “Featured”. It is derived from real catalog data sorted by `updated_at`, with title tie-breaking. This avoids presenting arbitrary local ordering as editorial curation.

## 11. Checkpoint A visual verification

The homepage was verified with synthetic disposable API responses at 375, 768, 1024, 1440, and 1920px. The 1440px dark-mode render was inspected visually. The live `store.prg32.dream.test` page was also refreshed after the container rebuild and returned HTTP 200.

## 12. Checkpoint B — Catalog

The catalog now has a compact browse header, result count, desktop filter rail, responsive card grid, active filter chips, shared sorting controls, and explicit empty/error/loading states.

## 13. Search UX

Search remains backed by the existing `GET /api/games?q=...` contract. The search draft is local to the form and is committed to the URL only on submit. Search can be cleared from the input or active-filter chip. The search control has an accessible label and icon button.

## 14. Filter architecture

Architecture options are derived from real returned games. Desktop uses a persistent rail. Mobile uses a Radix Dialog with draft state, Clear, Apply filters, and Close controls. Desktop and mobile radio groups use distinct native names so their controls cannot interfere with each other.

## 15. URL/query state

The existing URL state remains shareable and backward-compatible:

- `q` — catalog search.
- `architecture` — architecture filter.
- `sort` — title or updated ordering.
- `page` — pagination.
- `version` — detail-page version selection.

No existing URL was removed or renamed.

## 16. Sorting

Sorting uses the existing visible catalog response. The supported options are Title and Recently updated. The selected value is represented by the existing `sort` query parameter.

## 17. Responsive catalog grid

The shared card grid collapses naturally from desktop columns to narrow mobile cards. The tested widths showed no document overflow. The desktop rail is hidden below the large breakpoint and replaced by the mobile filter action.

## 18. Mobile filter interaction

At 375px and 768px, the desktop rail is hidden and the Filters button is visible. The browser verification opened the dialog, selected `esp32c6`, applied the filter, and observed `/?architecture=esp32c6`.

## 19. Checkpoint B verification

Catalog tests cover real result rendering, URL search/filter behavior, accessible mobile filters, empty state, and API failure state. Browser verification covered the responsive rail/drawer breakpoint behavior and no-overflow condition.

## 20. Checkpoint C — Cartridge detail

The detail page now presents breadcrumb navigation, title/status/version badges, large media, target badges, About content, technical metadata, published information, and a sticky download panel.

## 21. Artwork and media

Existing media endpoints remain authoritative. Screenshot media is used only when the selected variant advertises `has_screenshot === true`; otherwise the existing icon endpoint is used. A failed media request produces an explicit “Artwork unavailable” or “Screenshot unavailable” fallback. No fake cartridge artwork was added.

## 22. Version and architecture selection

Version selection preserves the existing `?version=...` navigation contract. Architecture selection is local to the detail page and is restricted to architectures returned by the API. Both controls are accessible Radix Select controls.

## 23. Download experience

The download action preserves `/api/games/<id>/download?version=<version>&architecture=<architecture>`. The selected architecture is visible in the button label. Existing server-side binary delivery and accounting remain unchanged.

## 24. Checkpoint C verification

The detail test covers metadata, version selection, architecture selection, compatible download URL generation, and protected/missing detail behavior. Browser verification selected `qemu` and observed `/api/games/org.example.pong/download?version=1.2.0&architecture=qemu`.

## 25. Dark/light validation

The browser matrix started in deterministic dark mode, switched to light mode with the existing theme control, and returned to dark mode. The observed theme values were `dark → light → dark`. Existing theme persistence and hydration work from UI.0.1 were preserved.

## 26. Accessibility

The implementation uses semantic headings, labelled search, native radio groups, Radix Dialog/Select primitives, accessible button/link names, live result counts, explicit alert/error states, and non-text icon decorations marked `aria-hidden`.

## 27. API integration

The storefront continues to use `getCatalog`, `getGame`, `catalogMediaPath`, and `catalogDownloadPath`. Response structures and identifiers are unchanged. No Flask business logic was duplicated in the frontend.

## 28. Regression tests

Frontend verification completed successfully:

- TypeScript strict typecheck: PASS.
- ESLint: PASS.
- Vitest: PASS — 29 test files, 75 tests.
- Next.js production build: PASS.
- `git diff --check`: PASS.

New/updated focused coverage includes catalog mobile filters, detail Select interactions, shared Button `asChild` behavior, and artwork failure fallback.

## 29. Browser matrix

Disposable local browser verification used a Next.js dev server on Node.js 24 and synthetic API responses intercepted in Playwright. Results:

| Width | Overflow | Desktop rail | Mobile filter |
| ---: | :---: | :---: | :---: |
| 375 | No | Hidden | Visible |
| 768 | No | Hidden | Visible |
| 1024 | No | Visible | Hidden |
| 1440 | No | Visible | Hidden |
| 1920 | No | Visible | Hidden |

The actual dev container was then rebuilt with the existing Compose profile and `https://store.prg32.dream.test/` returned HTTP 200. Live browser diagnostics reported no console errors. The live environment currently reports an unreachable authentication service and an empty real catalog; both are environmental observations, not UI regressions.

## 30. Mockup comparison

The result matches the approved direction in shell density, full-width layout, purple accent treatment, compact bordered cards, technical hero, filter rail, detail media surface, and download panel. The only intentional visual deviation is the hero/media preview: a CSS technical preview and explicit media fallback are used because no approved hardware/device asset was available.

## 31. Files changed for UI.1

- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/storefront/CatalogBrowser.tsx`
- `frontend/src/components/storefront/CatalogBrowser.test.tsx`
- `frontend/src/components/storefront/CartridgeCard.tsx`
- `frontend/src/components/storefront/CartridgeArtwork.test.tsx`
- `frontend/src/components/storefront/GameDetail.tsx`
- `frontend/src/components/storefront/GameDetail.test.tsx`
- `docs/modernization/161-public-storefront-redesign-ui-1.md`

No backend, Docker Compose, Flask, Fastify, database, authentication, or operational infrastructure files were modified by UI.1.

## 32. Known limitations

- The real local catalog currently returns zero published cartridges, so live card/download content was verified with synthetic disposable API data and existing component tests.
- The live browser showed “The authentication service could not be reached”; this was not caused by UI.1 and was not changed.
- No approved device/console image was available, so the hero uses a technical preview rather than an invented product image.
- The Next.js dev output can emit a non-blocking LCP advisory for above-the-fold media; it does not affect correctness or the production build.

## 33. Remaining UI.2/UI.3 work

UI.2 can build on the stable public shell for authenticated account/workspace flows, publishing, review, and administration. UI.3 can then refine statistics, runs, scores, multiplayer, documentation depth, and final responsive/accessibility polish. Those milestones must continue to preserve the backend freeze and existing route/API compatibility.

## 34. Final decision

`UI1_HOMEPAGE_GO`

`UI1_CATALOG_GO`

`UI1_SEARCH_FILTERS_GO`

`UI1_CARTRIDGE_DETAIL_GO`

`UI1_DOWNLOAD_EXPERIENCE_GO`

`UI1_RESPONSIVE_GO`

`UI1_DARK_LIGHT_GO`

`UI1_VISUAL_REFERENCE_GO`

`UI1_FRONTEND_REGRESSION_GO`

`UI1_UI2_READY|GO`

`M555_BACKEND_FREEZE_GO`

`OPERATIONAL_CUTOVER_NO_GO`

`FLASK_RETIREMENT_NO_GO`

UI.1 is complete within the authorized scope. No operational cutover, Flask retirement, deployment, commit, or push was performed.
