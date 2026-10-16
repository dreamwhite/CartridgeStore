# PRG32 Cartridge Store — UI.0.1 Visual Foundation, Full-Width Layout & Accessible Components

Date: 2026-10-16  
Milestone: UI.0.1  
Frontend: Next.js 16.4.0, React 19.3.0, Node.js 24.20.0  
Backend status preserved: `M555_BACKEND_FREEZE_GO`  
Operational status preserved: `OPERATIONAL_CUTOVER_NO_GO`, `FLASK_RETIREMENT_NO_GO`

## 1. Executive summary

UI.0.1 is implemented in the Next.js frontend. It establishes the shared visual foundation, full-width page geometry, accessible Radix Select and Dropdown primitives, Lucide icon usage, reusable form/status/surface components, a development-only component showcase, and representative migrations in the catalog, scoreboard, account navigation, and shell.

No Flask, Fastify, API contract, storage, authentication behavior, Docker, deployment, Traefik, Authentik, or operational routing code was changed.

The technical implementation and regression gates are GO. Formal visual comparison against an approved design mockup is not verified because no mockup was available in the execution context. UI.1 is therefore technically unblocked but formally blocked on visual reference/acceptance evidence.

## 2. Scope and constraints

Implemented within this milestone:

- semantic design tokens and responsive full-width gutters;
- dark-first new-visitor behavior with persisted light/dark preference;
- Lucide React icon standardization for the migrated UI surfaces;
- reusable inputs, textarea, field, badges, cards, metadata rows, buttons, select, dropdown, search, and filter primitives;
- cartridge card foundation preserving existing game IDs and download URL generation;
- representative migration of catalog filters, scoreboard rows, account menu, theme control, and shared page surfaces;
- a local development-only showcase at `/dev/ui` with no API dependency;
- focused tests for the new primitives and migrated interactions.

Explicitly not included:

- storefront feature work or new business workflows;
- backend/API changes;
- authentication or authorization changes;
- production routing or deployment changes;
- Fumadocs migration;
- a production component showcase;
- UI.1 or later milestone work.

## 3. Existing component inventory

The audit found an existing Next.js App Router application with a shared `AppShell`, Zustand theme state, React Query providers, a tokenized global stylesheet, a basic Button primitive, and feature components for catalog, detail, scores, statistics, authentication, documentation, workflow, administration, and federation.

Before UI.0.1, most feature pages used local Tailwind class strings and native controls. Radix Select, Radix Dropdown Menu, Lucide React, shared input/card/badge/filter primitives, and a cartridge-specific card boundary were not present as reusable components.

## 4. Visual problems addressed

The implementation addresses the following concrete issues:

- inconsistent page widths and repeated `max-w-*` wrappers;
- native select controls with inconsistent browser presentation;
- account disclosure implemented as an unstandardized details pattern;
- emoji theme icons and mixed icon treatment;
- repeated local input, card, badge, and status styles;
- no consistent loading/disabled Button state;
- no shared filter/search composition;
- no safe local surface for inspecting the foundation without backend data;
- no explicit dark default for a first-time visitor.

Existing routes and API-facing behavior remain the source of truth.

## 5. Mockup reference availability

No approved UI mockup or visual reference was available in the repository or execution context for this milestone. The report therefore records implementation and browser measurements, not pixel-level comparison or sign-off against a design file.

## 6. Design philosophy

The foundation uses a restrained purple-first PRG32 visual language:

- full-width application surfaces with bounded reading measure only where text readability benefits;
- dark plum surfaces and lavender/purple accents as the default new-visitor experience;
- semantic CSS variables instead of page-specific color systems;
- compact but touch-friendly controls;
- clear borders and focus rings rather than color-only state;
- cartridge artwork separated from metadata and action controls;
- API response identifiers and established URLs preserved exactly.

## 7. Full-width layout strategy

`frontend/src/styles/index.css` now provides the shared `.page-gutter` utility with responsive horizontal gutters:

| Viewport | Gutter |
| --- | ---: |
| Mobile | 16px |
| Tablet | 24px |
| Desktop | 32px |
| Large desktop | 40px |

`.page-reading` is reserved for long-form reading content. Catalog, statistics, detail, documentation index, admin, federation, and showcase surfaces use the full-width gutter strategy rather than indiscriminate `max-w-5xl`, `max-w-6xl`, or `max-w-7xl` wrappers. Responsive grids use flexible `minmax()` tracks and the shared `.card-grid` pattern where appropriate.

## 8. Dark and light themes

`frontend/src/stores/theme-store.ts` now resolves theme state as follows:

1. a stored valid `light` or `dark` preference wins;
2. a first-time client visitor defaults to `dark`;
3. server rendering uses `dark` as the deterministic fallback.

`frontend/src/app/layout.tsx` sets the deterministic server attribute `data-theme="dark"` and uses `suppressHydrationWarning` at the document boundary. The existing client theme switch persists to `localStorage` under `prg32-theme`. Existing light and dark semantic tokens were consolidated rather than replaced by a second color system.

Browser checks at all requested widths observed both `dark` and `light` states without horizontal overflow. The theme toggle test verifies the persisted selection.

## 9. Typography and density

The implementation keeps the existing application font stack and avoids a runtime font dependency. Technical labels, muted descriptions, compact metadata, tabular values, and heading hierarchy use shared semantic classes and existing Tailwind utilities. Touch controls retain at least a 40px minimum height in the shared Button/Input/Select patterns.

## 10. Lucide icon standard

Added `lucide-react` and replaced the migrated emoji/theme and account-navigation icon treatment with Lucide components. Icons used as decoration are marked `aria-hidden`; icon-only buttons have explicit accessible labels. The new showcase demonstrates icon-bearing primary, destructive, and icon-only actions.

## 11. Component architecture

The new shared components are intentionally local and composable:

- `ui/button.tsx` — action variants, sizes, loading, disabled, focus treatment;
- `ui/input.tsx` — Input, Textarea, and Field composition;
- `ui/badge.tsx` — game, demo, utility, verified, draft, published, pending, rejected, version, and architecture states;
- `ui/card.tsx` — Card, CardHeader, CardContent, and MetadataRow;
- `ui/select.tsx` — Radix Select wrappers and SelectField;
- `ui/dropdown-menu.tsx` — Radix Dropdown Menu wrappers;
- `ui/search-input.tsx` — search icon, input, and clear affordance;
- `ui/filter.tsx` — FilterGroup, ActiveFilter, and FilterBar;
- `storefront/CartridgeCard.tsx` — catalog identity, artwork, metadata, architecture badges, and compatible download path;
- `foundation/UIShowcase.tsx` — development-only inspection surface.

The local primitives follow the shadcn/ui composition model without adding a generator runtime or duplicating business logic. Radix owns keyboard and popup behavior for Select and Dropdown Menu.

## 12. Accessible Select

Select was implemented with `@radix-ui/react-select`, not a hand-rolled popup. `SelectField` provides:

- visible label and accessible `aria-label` on the combobox trigger;
- keyboard and pointer interaction through Radix;
- portal content with option semantics;
- disabled options;
- visible focus treatment;
- hidden native form representation where Radix provides it;
- reusable description support.

Catalog architecture, catalog sorting, and scoreboard row selection now use the shared SelectField while preserving their existing URL/query semantics.

## 13. Account and contextual dropdown

The authenticated account control in `AuthNavigation.tsx` now uses `@radix-ui/react-dropdown-menu` and Lucide `UserRound`/`ChevronDown` icons. Existing permission-aware links and logout behavior remain unchanged. The account menu remains a convenience surface; backend route guards and server permissions stay authoritative.

## 14. Button and input system

Button now supports:

- variants: primary, secondary, outline, ghost, danger, destructive, icon;
- sizes: small, default, large, and icon;
- loading state with `aria-busy`, spinner, and disabled interaction;
- consistent disabled opacity and focus-visible outline.

The existing `danger` name remains compatible and `destructive` is available as the canonical semantic alias. Input, Textarea, and Field provide consistent labels, help text, error description hooks, focus styling, and disabled treatment.

## 15. Badge, card, and surface system

Badges encode the existing catalog/workflow vocabulary without changing API status values. Cards use shared border, surface, radius, and shadow tokens. MetadataRow provides consistent label/value alignment for compact technical information. The `surface-card` token is used by the shared Card primitive and keeps surfaces consistent in both themes.

## 16. Cartridge card

`CartridgeCard` is the reusable catalog card boundary. It preserves:

- game ID-based detail link `/games/<encoded-id>`;
- selected version;
- first available architecture selection behavior;
- existing `/api/games/<id>/download?version=...&architecture=...` path generation;
- artwork loading through the existing `CartridgeArtwork` component;
- explicit fallback text when artwork fails;
- author, summary, version, architecture, and tag presentation.

No new catalog data shape or API response field was introduced.

## 17. Search and filter foundation

`SearchInput` provides a leading Lucide search icon and an accessible clear button when a value is present. `FilterBar`, `FilterGroup`, and `ActiveFilter` provide shared layout and removal affordances without imposing a new filtering model. Catalog search/filter navigation and scoreboard query construction remain unchanged apart from the control implementation.

## 18. Theme preference and hydration

The server-side dark fallback, document-level `data-theme`, and persisted client preference minimize first-render divergence and theme flash. The browser verification confirmed a new local context rendered `dark`, toggled to `light`, and retained the corresponding semantic layout without horizontal overflow. The existing client-side theme store remains the only preference owner.

## 19. Application shell

The shell continues to own providers, PWA setup, route layout, authentication navigation, and theme control. UI.0.1 changes only the visual/control layer. Existing Jinja/Flask routes are outside this Next.js milestone and were not modified.

## 20. Development-only showcase

`/dev/ui` renders `UIShowcase` in development and calls `notFound()` when `NODE_ENV === "production"`. It has no API dependency and demonstrates:

- Button variants and loading-ready surface;
- badges/statuses;
- inputs, textarea, and search;
- Select and Dropdown Menu;
- filters and active filter removal;
- cartridge-like card composition;
- metadata rows;
- dark/light shell behavior.

The initial `_dev/ui` directory was intentionally changed to `/dev/ui`: Next.js treats a route segment beginning with `_` as a private filesystem segment and returns 404 even in development. The corrected route was observed with HTTP 200 in the dev server and HTTP 404 in the standalone production server.

## 21. Responsive visual matrix

The local Next dev server was checked with Playwright at each required viewport. The page was loaded in dark mode, toggled to light mode, and measured for horizontal overflow:

| Width | Dark response | Light response | Horizontal overflow | Header present |
| ---: | ---: | ---: | --- | --- |
| 375 | 200 | verified | none | yes |
| 768 | 200 | verified | none | yes |
| 1024 | 200 | verified | none | yes |
| 1440 | 200 | verified | none | yes |
| 1920 | 200 | verified | none | yes |

A full dark showcase screenshot at 1024px was inspected locally. The showcase itself returned 200, exposed its `Component foundation` heading and ten accessible buttons, and had no horizontal overflow. An approved mockup was unavailable, so visual comparison against a reference remains unverified.

## 22. Accessibility

Implemented and tested:

- semantic combobox and option roles through Radix Select;
- semantic menu/menuitem roles through Radix Dropdown Menu;
- visible labels and accessible names for custom controls;
- keyboard-capable popup primitives;
- explicit labels for icon-only buttons;
- `aria-busy` during Button loading;
- `aria-hidden` for decorative Lucide icons;
- focus-visible outlines using shared focus tokens;
- preserved native checkbox semantics in the showcase filter example;
- minimum touch-friendly control heights.

The test environment required jsdom-only no-op implementations for `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, and `scrollIntoView`, which Radix uses during interaction. These are test-environment shims only and do not ship to the browser.

## 23. Tests and verification

Executed with Node.js 24.20.0 after `nvm use 24`:

```text
pnpm --dir frontend run typecheck    PASS
pnpm --dir frontend run lint         PASS
pnpm --dir frontend run test         PASS — 27 files, 72 tests
pnpm --dir frontend run build        PASS — Next.js 16.4.0, 39 generated routes
git diff --check                    PASS
```

Focused coverage added for:

- Radix SelectField interaction;
- Radix Dropdown Menu interaction;
- cartridge detail/download identity preservation;
- migrated catalog architecture selection;
- migrated scoreboard row selection;
- theme toggle persistence.

The development browser check also recorded the expected local-only environment limitation: when Next was run outside the Compose network, its configured `fastify:5090` API proxy target was not resolvable. The frontend rendered its existing API-unavailable state; no API fallback or frontend business-logic duplication was introduced.

## 24. Files created and modified

Created for UI.0.1:

- `frontend/src/app/dev/ui/page.tsx`
- `frontend/src/components/foundation/UIShowcase.tsx`
- `frontend/src/components/storefront/CartridgeCard.tsx`
- `frontend/src/components/storefront/CartridgeCard.test.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/ui/dropdown-menu.tsx`
- `frontend/src/components/ui/dropdown-menu.test.tsx`
- `frontend/src/components/ui/filter.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/search-input.tsx`
- `frontend/src/components/ui/select.tsx`
- `frontend/src/components/ui/select.test.tsx`
- `docs/modernization/160-visual-foundation-components-ui-0-1.md`

Modified for UI.0.1:

- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/auth/AuthNavigation.tsx`
- `frontend/src/components/docs/DocumentationArticle.tsx`
- `frontend/src/components/docs/DocumentationIndex.tsx`
- `frontend/src/components/federation/FederationAdminShell.tsx`
- `frontend/src/components/layout/ThemeToggle.test.tsx`
- `frontend/src/components/layout/ThemeToggle.tsx`
- `frontend/src/components/storefront/CatalogBrowser.test.tsx`
- `frontend/src/components/storefront/CatalogBrowser.tsx`
- `frontend/src/components/storefront/CatalogState.tsx`
- `frontend/src/components/storefront/GameCard.tsx`
- `frontend/src/components/storefront/GameDetail.tsx`
- `frontend/src/components/storefront/Scoreboard.test.tsx`
- `frontend/src/components/storefront/Scoreboard.tsx`
- `frontend/src/components/storefront/StatisticsPage.tsx`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/stores/theme-store.ts`
- `frontend/src/styles/index.css`
- `frontend/src/test/setup.ts`

No backend, Docker, deployment, or operational files were intentionally modified for UI.0.1. The worktree already contained unrelated changes from prior milestones; those were preserved and are not attributed to this report.

## 25. Remaining work and risks

- No approved design mockup was available, so pixel-level visual acceptance is still pending.
- UI.1 must decide whether the existing documentation implementation should migrate to Fumadocs.
- Integrated browser validation still requires a running Fastify service or Compose network name resolution.
- The development showcase is intentionally not a production route; it must not become a public feature.
- The shared primitives do not yet cover every legacy feature page; remaining pages should migrate incrementally with contract-focused tests.
- The existing Next standalone build warning from `next start` remains an operational concern; the supported runtime is the generated standalone server, which was used for the production route-protection check.

## 26. UI.1 readiness

Technical readiness is GO for incremental UI.1 work: the token, shell, control, theme, full-width, and regression foundations are present. Formal UI.1 visual acceptance is BLOCKED until an approved mockup/reference is available and reviewed against the browser matrix.

Required markers:

```text
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
UI001_FULL_WIDTH_READY
UI001_DESIGN_TOKENS_READY
UI001_DARK_LIGHT_READY
UI001_COMPONENT_SYSTEM_READY
UI001_ACCESSIBLE_CONTROLS_GO
UI001_VISUAL_ACCEPTANCE_INCOMPLETE
UI001_FRONTEND_REGRESSION_GO
UI001_UI1_READY|BLOCKED
```

## 27. Final decision

`UI001_FULL_WIDTH_READY`

`UI001_DESIGN_TOKENS_READY`

`UI001_DARK_LIGHT_READY`

`UI001_COMPONENT_SYSTEM_READY`

`UI001_ACCESSIBLE_CONTROLS_GO`

`UI001_FRONTEND_REGRESSION_GO`

`UI001_VISUAL_ACCEPTANCE_INCOMPLETE`

`UI001_UI1_READY|BLOCKED`

UI.0.1 implementation is complete within the authorized frontend scope. The component foundation is safe to use for the next implementation phase, but the milestone does not claim design-reference sign-off. No backend freeze, operational cutover, Flask retirement, deployment, commit, or push was performed.
