# PRG32 Cartridge Store — UI.1.1 Storefront Visual Refinement

## 1. Executive summary

UI.1.1 is complete as a visual-only refinement of the public Next.js storefront. The result is less rounded, less card-heavy, more neutral in light mode, more continuous between hero and catalog, and more technically distinctive while preserving the UI.1 hero composition and all existing catalog behavior.

The desktop filter sidebar is now an integrated rail, empty/error states are compact, cartridge cards are more geometric, and the authentication outage is still visible but no longer dominates the header.

## 2. Scope and safety constraints

Only the frontend presentation and focused frontend tests were changed. No API, backend, database, authentication logic, session behavior, OIDC/SAML flow, Docker architecture, routing, Traefik, Authentik, Flask, Fastify, or `../PRG32` files were changed. No real data was seeded. No commit or push was performed.

## 3. Visual references available

The approved mockup was available and inspected at:

`/Users/ivan/.codex/attachments/03757b30-4d43-4edc-a3af-2ed7caa84c57/image-1.png`

It is a 1536×1024 dark/light contact sheet. It establishes the modern-retro direction: compact shell, strong typography, purple accents, dense artwork-first cards, integrated category/filter navigation, and restrained borders.

The user’s UI.1 screenshot was not available as a separate filesystem image in this turn. The current live storefront was inspected directly in Chrome before and after the refinement, and the available approved mockup was used for formal visual comparison.

## 4. UI.1 screenshot critique

The UI.1 result had several visible issues identified in the brief: large rounded panels, repeated tinted surfaces, a floating filter card, a dashboard-like catalog area, a tall empty state, and a long authentication error competing with primary navigation. The refinement targets those problems without replacing the page structure.

## 5. Existing CSS/component audit

The audit covered:

- `frontend/src/styles/index.css`
- `AppShell`, `ThemeToggle`, and `AuthNavigation`.
- `CatalogBrowser`, `CartridgeCard`, `CatalogState`, and `GameDetail`.
- Button, Input, Select, Badge, Dialog, FilterBar, and Card primitives.

The main causes were high-radius utility classes, card-like defaults in `FilterBar`, a surface wrapper around the hero/catalog transition, a bordered surface around the filter rail, and large padded state components.

## 6. Art-direction decisions

The final direction is modern retro, technical, minimal, compact, precise, game-centric, purple-accented, and full-width. The implementation favors page background plus dividers over stacked tinted panels. Surfaces remain only where they communicate an actual boundary: hero panel, technical preview, product card, dialog, and detail information surfaces.

## 7. Border-radius strategy

The shared radius tokens were tightened:

- `--radius-sm`: `5px`.
- `--radius-md`: `6px`.
- `--radius-lg`: `8px`.
- `--radius-xl`: `10px`.

Storefront-specific choices are now:

- Hero and technical preview: `rounded-lg` / 8px.
- Cartridge cards: `rounded-md` / 6px.
- Inputs, Select triggers, and buttons: `rounded-md` / 6px.
- Badges: `rounded-sm` / 5px.
- Dialog: `rounded-lg` / 8px.
- Intentional circular icon shapes remain circular where applicable.

## 8. Surface and color strategy

Light mode now uses a more neutral page background (`#f6f5f7`), neutral muted surface (`#efedef`), and subtler border (`#d8d5dc`). Purple remains reserved for actions, selected states, technical labels, and emphasis. Card shadows were reduced from broad elevation to restrained low-opacity shadows. Dark mode retains deep neutral backgrounds, controlled surface elevation, lavender accents, and reduced shadow intensity.

## 9. Hero refinement

The two-column hero, “Play. Code. Learn.” headline, CTAs, real catalog indicators, search entry point, and technical preview were preserved. The outer section now shares the page background rather than introducing a second tinted band. The inner hero panel uses a restrained 8px radius, subtle border, neutral surface, and no heavy card shadow. The technical preview uses 8px outer geometry and 6px inner geometry without the previous heavy shadow.

## 10. Homepage/catalog continuity

The hero, Recently updated section, and catalog now read as one page. The large surface-colored section treatment was removed from the hero wrapper. Sections use spacing and thin dividers rather than separate pastel blocks. The catalog remains full-width and does not sit inside a dashboard-style outer card.

## 11. Catalog heading and toolbar

The catalog heading retains the Browse / Catalog eyebrow, All cartridges heading, and real result count. A restrained divider now connects the heading to the toolbar. The toolbar is transparent and compact; active filters, Clear filters, and sort remain aligned without a surrounding panel. No duplicate search input or new filter was introduced.

## 12. Integrated filter rail

The desktop filter card was replaced with an integrated rail:

- Compact Filters heading.
- Thin divider before Architecture.
- Native accessible architecture radios.
- Conditional Clear filters action.
- Explanatory note separated by a thin divider.
- Vertical divider between rail and results.

The rail has no floating card background, no heavy shadow, and no large enclosing radius. Mobile continues to use the existing Radix Dialog with Apply and Clear actions.

## 13. Cartridge card refinement

Cartridge cards now use a 6px radius, thin border, no default shadow, compact spacing, consistent 4:3 artwork, concise metadata, and restrained hover border emphasis. Existing titles, summaries, authors, architectures, tags, detail links, and download URLs remain API-derived. The card remains artwork-first and does not add statistics or decorative ranking content.

## 14. Empty/loading/error states

Loading skeletons use smaller geometry and 6px corners. The empty catalog and no-results states use a compact dashed divider composition with a Lucide package/search icon, short copy, and no oversized blank panel. API errors use a compact horizontal warning row with an icon, explanatory copy, and retry button. The three states remain distinct:

- Genuine empty catalog: “The catalog is empty.”
- Search/filter no match: “No cartridges match this search.”
- API failure: “The catalog could not be loaded.” with retry.

## 15. Authentication warning treatment

Authentication behavior was not changed. When the current-user request fails, the header now shows a compact amber warning icon, “Auth unavailable”, and a keyboard-accessible “Retry” link. The original detailed message remains available through a screen-reader-only announcement and the element title. The warning remains `role="alert"`; authenticated workflows remain governed by the existing session state.

## 16. Light-theme validation

The light render was checked at all required widths. The page background is neutral rather than lavender, white surfaces are limited to intentional panels/cards, borders are subtle, and purple is used for actions and emphasis. The live local container screenshot showed the compact empty state and reduced auth warning in light mode.

## 17. Dark-theme validation

The dark render retains the deep neutral base and technical purple preview while reducing broad shadows and surface nesting. The hero/catalog transition is now separated by restrained dividers rather than a purple section block. The approved mockup’s dark technical character remains recognizable without adding invented hardware imagery.

## 18. Responsive width matrix

Disposable browser validation used synthetic API data at both themes and all requested widths:

| Theme | Width | Horizontal overflow | Filter behavior |
| --- | ---: | :---: | --- |
| Dark | 375px | No | Mobile Dialog |
| Dark | 768px | No | Mobile Dialog |
| Dark | 1024px | No | Integrated desktop rail |
| Dark | 1440px | No | Integrated desktop rail |
| Dark | 1920px | No | Integrated desktop rail |
| Light | 375px | No | Mobile Dialog |
| Light | 768px | No | Mobile Dialog |
| Light | 1024px | No | Integrated desktop rail |
| Light | 1440px | No | Integrated desktop rail |
| Light | 1920px | No | Integrated desktop rail |

The live `store.prg32.dream.test` page was refreshed after the Next container rebuild and returned HTTP 200. Chrome showed no browser console errors. The external authentication service remained unavailable, as expected from the environment, and was displayed compactly rather than hidden.

## 19. Synthetic populated catalog validation

Playwright route interception used disposable responses containing:

- Several cartridges.
- A deliberately long cartridge title.
- Multiple architectures.
- Missing artwork for one cartridge.
- Detail/version/architecture selection.
- Existing download URL generation.

The long title remained contained, missing artwork rendered the explicit fallback, and detail selection produced `/api/games/org.example.pong/download?version=1.2.0&architecture=qemu`.

## 20. Functional regression verification

The following commands passed under Node.js 24.20.0:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint
pnpm --dir frontend run test
pnpm --dir frontend run build
git diff --check
```

Final frontend test result: 30 test files, 76 tests passed. The build generated all existing Next.js routes successfully. Focused coverage includes mobile filters, empty/error catalog states, artwork fallback, detail download compatibility, and compact authentication warning presentation.

## 21. Accessibility verification

The refinement preserves semantic headings, labelled search, native radio controls, Radix Dialog focus management, Radix Select controls, accessible button/link names, visible focus outlines, live result counts, and alert semantics. The authentication warning exposes the detailed failure to assistive technology while keeping the visible header compact.

## 22. Files changed

- `frontend/src/styles/index.css`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/select.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/filter.tsx`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/ThemeToggle.tsx`
- `frontend/src/components/auth/AuthNavigation.tsx`
- `frontend/src/components/auth/AuthNavigation.test.tsx`
- `frontend/src/components/storefront/CatalogBrowser.tsx`
- `frontend/src/components/storefront/CartridgeCard.tsx`
- `frontend/src/components/storefront/CatalogState.tsx`
- `docs/modernization/162-storefront-visual-refinement-ui-1-1.md`

No backend or infrastructure files were changed by UI.1.1.

## 23. Remaining visual issues

- The real local catalog is empty, so populated card comparison uses disposable browser fixtures and never writes to the canonical database.
- No approved PRG32 hardware/device image was available; the existing technical preview is intentionally retained instead of inventing product imagery.
- The live environment still reports authentication-service unavailability. The UI now presents that condition compactly, but service health is outside this milestone.
- Next.js may emit a non-blocking LCP advisory for above-the-fold media in development; it does not fail tests or the production build.

## 24. UI.2 readiness

The public storefront is visually stable enough for UI.2. UI.2 may proceed with authenticated account, creator, publishing, review, or administration surfaces while preserving the same frontend tokens and accessibility rules. UI.1.1 did not expand those feature areas.

## 25. Final decision

`UI11_VISUAL_REFINEMENT_GO`

`UI11_CATALOG_INTEGRATION_GO`

`UI11_FILTER_RAIL_GO`

`UI11_EMPTY_STATES_GO`

`UI11_AUTH_WARNING_GO`

`UI11_DARK_LIGHT_GO`

`UI11_RESPONSIVE_GO`

`UI11_FRONTEND_REGRESSION_GO`

`UI11_UI2_READY`

`M555_BACKEND_FREEZE_GO`

`OPERATIONAL_CUTOVER_NO_GO`

`FLASK_RETIREMENT_NO_GO`

UI.1.1 is complete within the authorized visual-polish scope. No feature expansion, backend change, operational change, commit, or push was performed.
