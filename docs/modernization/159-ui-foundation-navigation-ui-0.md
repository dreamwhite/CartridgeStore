# PRG32 Cartridge Store — UI.0 Frontend Architecture, Navigation Simplification & Design System Foundation

Date: 2026-10-16  
Milestone: UI.0  
Frontend: Next.js 16.4.0, React 19.3.0, Node.js 24.20.0  
Backend status preserved: `M555_BACKEND_FREEZE_GO`

## 1. Executive result

UI.0 is implemented for the Next.js frontend only. The public navigation is now intentionally small, authenticated destinations are exposed through a capability-aware account menu, and Account, Creator Studio, and Review have reusable contextual navigation. A semantic purple-first token layer and shared focus treatment establish the next UI milestones without redesigning application pages.

No Flask, Fastify, API route, storage, authentication protocol, Docker, deployment, or operational routing code was changed for UI.0.

## 2. Scope

Completed:

- Audited the current App Router routes and frontend layout boundaries.
- Simplified public navigation to Explore, Search, and Documentation.
- Added active-link semantics and a responsive mobile navigation disclosure.
- Added permission-aware account navigation for creator, review, administration, and federation destinations.
- Added contextual navigation for Account, Creator Studio, and Review.
- Extended the existing theme variables with semantic color, focus, elevation, and dark-theme tokens.
- Added targeted navigation and shell tests.
- Preserved existing page routes, direct links, API clients, and backend-owned authorization.

Deferred by design:

- Full page redesigns for the catalog, detail pages, publishing forms, admin tables, statistics, scores, and documentation content.
- Fumadocs integration and content migration.
- Any backend or operational cutover work.

## 3. Route inventory

The existing App Router route set remains intact:

| Area | Routes | UI.0 treatment |
| --- | --- | --- |
| Public catalog | `/`, `/games/[gameId]`, `/scores`, `/stats`, `/health`, `/.well-known` through existing clients | Public header now prioritizes Explore and Search; direct routes preserved |
| Documentation | `/docs`, `/docs/[slug]` | Documentation remains a public primary destination |
| Authentication | `/login`, `/register`, `/register/complete`, `/forgot-password`, `/password-reset`, `/setup`, compatibility `/auth/*` | Direct routes and existing flows unchanged |
| Account | `/account`, `/users/[username]`, `/users/[username]/runs`, `/users/[username]/runs/[runId]` | Account gets a contextual shell; profile deep links unchanged |
| Creator | `/workspace`, `/publish` | Creator workspace navigation added; routes unchanged |
| Review | `/review` | Review contextual navigation added; route and guard unchanged |
| Metrics | `/runs`, `/runs/[runId]` | Not promoted to public primary navigation; direct links preserved |
| Administration | `/admin`, `/admin/federation/**` | Existing permission-filtered admin/federation areas preserved; account menu exposes access contextually |
| Infrastructure | `/manifest.webmanifest`, `/static/*`, frontend API proxy routes | Not changed |

## 4. Navigation problems identified

Before UI.0, the header presented Store, Statistics, Scores, Docs, Workspace, Publish, and Review as one flat navigation level. This mixed public discovery, authenticated workflows, and operational administration. It also created no mobile disclosure, no active route state, and no clear permission boundary in the header.

The implementation corrected the information architecture without removing a safe URL:

- public discovery is the global layer;
- account and capability-specific work is contextual;
- administration remains a protected destination;
- deep links remain direct and stable.

## 5. Persona mapping

| Persona | Primary entry point | Contextual destinations |
| --- | --- | --- |
| Anonymous visitor | Explore, Search, Documentation | Sign in |
| Authenticated user | Account | Profile and account security |
| Creator | Account or Creator Studio | Publish cartridge, submission history, account |
| Reviewer | Account or Review | Review queue, optional Creator Studio, account |
| Administrator | Account or Administration | Admin sections filtered by backend permissions |
| Federation administrator | Administration | Federation administration appears only when `federation:read` is present |

The frontend does not infer roles or duplicate authorization rules. It filters navigation using the permissions supplied by the existing principal contract; route guards and backend authorization remain authoritative.

## 6. Information architecture

```text
Public
├── Explore /
├── Search /#catalog-search
└── Documentation /docs

Authenticated context
├── Account /account
├── Creator Studio /workspace
│   └── Publish /publish
├── Review /review
└── Administration /admin
    └── Federation /admin/federation
```

Statistics, scores, metrics, profiles, and compatibility routes remain available through existing URLs and page-level links. They are no longer competing with the store discovery path in the global header.

## 7. Public navigation

`PUBLIC_NAVIGATION` in `frontend/src/components/layout/navigation.ts` defines the stable public set:

- Explore: `/`
- Search: `/#catalog-search`
- Documentation: `/docs`

The Search link uses the existing catalog search anchor and does not introduce a new query or API contract. The browser verification reached `http://127.0.0.1:3400/#catalog-search` successfully.

## 8. Account and creator navigation

`ContextualNavigation` provides a reusable side rail that collapses naturally into a compact grid on smaller viewports. Account navigation exposes only the capabilities present in the current principal:

- `catalog:submit` → Creator Studio;
- `submissions:read`, `submissions:review`, or `submissions:reject` → Review queue;
- existing administration capabilities → Administration.

Creator Studio links to `/workspace`, `/publish`, and `/account`. The implementation is navigation-only; submission and publishing behavior remain in existing components and API clients.

## 9. Review navigation

The Review shell keeps `/review` as the queue entry point and exposes Creator Studio only when `catalog:submit` is present. The existing review workspace and backend permission checks are unchanged.

## 10. Administration navigation

The existing `AdminWorkspace` continues to filter its section buttons against backend permissions. UI.0 does not replace its admin panel model or modify admin APIs. The global header no longer presents administration as a public-level link; authenticated users see the destination through the account menu only when they have an administrative capability.

The existing Federation shell and `FederationAdminGuard` remain intact. Federation is linked from the account menu only when `federation:read` is supplied.

## 11. Design tokens

`frontend/src/styles/index.css` now provides semantic tokens for:

- background, surface, muted surface, and raised surface;
- text, muted text, and border;
- primary purple, strong primary, soft primary, and focus color;
- card, header, popover, and brand elevation.

The default palette remains light for compatibility with the existing theme preference. The dark palette is first-class and uses deeper plum surfaces with accessible lavender accents. No external font or runtime network dependency was introduced.

The existing Zustand theme state and `data-theme` mechanism remain the source of truth. UI.0 improves the token layer rather than introducing another theme provider.

## 12. Reusable components

Added:

- `navigation.ts`: pure navigation model, permission predicates, active-route matching, and public/contextual definitions.
- `ContextualNavigation.tsx`: reusable Account, Creator, and Review shell navigation.

Updated:

- `AppShell.tsx`: public header, active links, mobile disclosure, and stable brand treatment.
- `AuthNavigation.tsx`: account menu with capability-aware destinations and existing sign-out behavior.
- `button.tsx`: shared primary action now consumes semantic design tokens.

The implementation intentionally does not add a second component library or duplicate shadcn primitives already absent from the current application.

## 13. Application shell

The application shell remains mounted from `frontend/src/app/layout.tsx` and still wraps the existing providers, PWA registration, and page content. UI.0 only changes the visual/navigation layer inside `AppShell`; it does not alter provider order, query setup, theme state, or page ownership.

The shell now provides:

- a stable PRG32 brand link;
- a public navigation region on desktop;
- a keyboard-readable mobile disclosure on narrow screens;
- existing theme control;
- existing authentication state and sign-out control;
- active route state using `aria-current="page"`.

## 14. Responsive behavior

The public desktop navigation uses the existing Tailwind `md` breakpoint. Below it, the navigation is replaced by an explicit button with `aria-expanded`, `aria-controls`, and an accessible label. The mobile links use a full-width touch-friendly layout and close after navigation.

The contextual shells use a single-column layout on small screens and a sticky side rail from the large breakpoint upward. No fixed-width content was added to the shell.

Actual browser observation on the local Next dev server showed the narrow layout with the mobile navigation button, the three public links, and the catalog content fitting without horizontal header overflow. A wider desktop screenshot matrix at 768, 1024, and 1440 pixels was not captured in this run; those widths remain a follow-up visual QA item.

## 15. Accessibility

Implemented and verified:

- semantic `nav` regions with distinct accessible names;
- `aria-current` for active route links;
- mobile disclosure state with `aria-expanded` and `aria-controls`;
- keyboard-visible focus styling using semantic focus tokens;
- touch-friendly minimum control sizes;
- no color-only navigation state;
- reduced-motion behavior retained from the existing global stylesheet;
- native `details` account disclosure for a progressively enhanced account menu.

The browser accessibility tree exposed the mobile navigation and its three links, and the new shell test asserts the disclosure state transitions and deep-link href.

## 16. Deep-link compatibility

The following compatibility points were preserved:

- `/#catalog-search` remains the existing catalog search anchor;
- `/workspace`, `/publish`, `/review`, `/account`, and `/admin` remain unchanged;
- all existing dynamic game, profile, metrics, documentation, authentication, and federation paths remain unchanged;
- no rewrite, proxy, API, or public routing configuration changed;
- the header does not gate direct URLs; backend and existing route guards remain authoritative.

## 17. Authentication and RBAC navigation

The account menu consumes `Principal.permissions` from `useCurrentUser`. It does not use the username, role label, or client-only assumptions to grant access. Visibility is a convenience layer only:

- no authenticated principal: Sign in remains available;
- authenticated principal: Account is available;
- capability-specific links appear only for matching permissions;
- federation appears only for `federation:read`;
- existing logout mutation and session invalidation behavior are unchanged.

No authentication behavior, OIDC/SAML/WebAuthn flow, session cookie, CSRF path, or backend RBAC registry was modified.

## 18. API regression assessment

No API client or API contract file was modified. No API contract test was required for this milestone. The existing browser smoke against the local dev server observed the expected development limitation: the configured `fastify:5090` proxy target was unavailable when the server was run outside the Compose network. The Next.js page and shell still rendered, and the catalog showed its existing API-unavailable state.

This is not treated as an API regression; it is recorded as an environment prerequisite for integrated browser runs.

## 19. Fumadocs preparation

No Fumadocs dependency, content migration, build-time fetch, or docs route replacement was introduced. The existing `/docs` and `/docs/[slug]` routes remain the documentation boundary. UI.1 can evaluate Fumadocs after the navigation foundation is accepted, without requiring network access during the frontend build.

## 20. Visual acceptance evidence

Evidence captured from the local Next dev server at `http://127.0.0.1:3400/`:

1. The narrow browser screenshot showed the PRG32 header, theme control, mobile menu button, expanded public navigation, search card, and catalog surface without header overflow.
2. The accessibility tree exposed `Explore`, `Search`, and `Documentation` under `Mobile primary navigation`.
3. Clicking Search navigated to `/#catalog-search`.
4. Navigating directly to `/workspace` rendered the `Creator workspace` / `Studio` contextual shell.

The visual evidence was local-only and used no credentials or operational services. Desktop width observations remain to be repeated in a future dedicated visual QA pass.

## 21. Validation

Executed with Node.js 24:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm --dir frontend run typecheck    PASS
pnpm --dir frontend run lint         PASS
pnpm --dir frontend run test         PASS — 24 files, 69 tests
pnpm --dir frontend run build        PASS — Next.js 16.4.0, 38 generated routes
git diff --check                    PASS
```

The first full test invocation had three transient timing failures in existing async workspace/score/federation tests. A subsequent unmodified full invocation passed all 24 test files and 69 tests. The targeted new shell/navigation tests passed as part of that successful run.

Backend tests were not run because UI.0 did not touch backend code, API clients, or contracts. No Playwright E2E suite was launched because the existing suite provisions a disposable integrated environment and is outside this frontend-only foundation scope; the local browser observation above was performed directly against the Next dev server.

## 22. Files changed for UI.0

New:

- `frontend/src/components/layout/navigation.ts`
- `frontend/src/components/layout/navigation.test.ts`
- `frontend/src/components/layout/ContextualNavigation.tsx`
- `frontend/src/components/layout/AppShell.test.tsx`
- `docs/modernization/159-ui-foundation-navigation-ui-0.md`

Modified:

- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/auth/AuthNavigation.tsx`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/styles/index.css`
- `frontend/src/app/account/page.tsx`
- `frontend/src/app/workspace/page.tsx`
- `frontend/src/app/review/page.tsx`

The repository had unrelated pre-existing changes from earlier milestones; they were preserved and are not attributed to UI.0.

## 23. Remaining work

- Perform a dedicated visual matrix at 375, 768, 1024, and 1440 pixels with the Fastify service available through the normal development proxy.
- Decide whether `/scores`, `/stats`, and `/runs` should receive a secondary public footer or discovery treatment in UI.1, without expanding the global header.
- Continue the page-level redesign in UI.1/UI.2/UI.3.
- Evaluate Fumadocs only when documentation information architecture is in scope.
- Add a full authenticated role matrix to browser acceptance when the disposable auth fixture is intentionally started.

## 24. Final decision

UI.0 is ready for the next frontend implementation milestone. The design system foundation and application shell are sufficient for page-level work, while the known visual-width and integrated-proxy follow-ups are explicitly recorded rather than hidden.

The backend freeze and operational safety decisions remain unchanged:

```text
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 25. Required milestone markers

```text
UI0_NAVIGATION_SIMPLIFIED
UI0_DESIGN_SYSTEM_READY
UI0_APPLICATION_SHELL_READY
UI0_RBAC_NAVIGATION_GO
UI0_RESPONSIVE_ACCESSIBILITY_GO
UI0_FRONTEND_REGRESSION_GO
UI0_NEXT_PHASE_READY

M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
