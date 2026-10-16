# PRG32 Cartridge Store — UI.4 Frontend Runtime Alignment & Architecture Audit

## 1. Executive summary

UI.4 had two bounded objectives: refresh only the local Next.js development service and audit the actual frontend architecture without implementing a refactor.

The runtime refresh is complete. The diagnosed service was the expected Compose `next` service in development mode, with the repository `frontend/` bind-mounted into `/app`. The source was current; the stale observation came from the long-lived Next development process and its persisted `.next` cache/compilation state, not from a wrong image, wrong Compose project, wrong source mount, or a production server. Only that service was restarted:

```text
docker compose --profile dev restart next
```

After the targeted restart, live browser checks passed for the new Homepage, canonical Explore route, legacy root-query navigation, detail route, login entry, documentation, navigation links, and theme switching. No unrelated service, shared volume, backend, database, Authentik, Traefik, or deployment configuration was changed.

The architecture audit found a usable and mostly explicit foundation: App Router, strict TypeScript, TanStack Query for server state, small Zustand stores for shared client state, Zod response validation, a shared request client, colocated component/API tests, and Radix/Lucide primitives. The main debt is orchestration concentration in admin/auth/workflow components, partially duplicated query-key/error patterns, incomplete semantic status tokens, and a hand-maintained type/schema boundary.

Final UI.4 result: `UI4_ARCHITECTURE_AUDIT_GO`.

Markers:

`UI4_RUNTIME_DIAGNOSIS_GO`  
`UI4_RUNTIME_ALIGNMENT_GO`  
`UI4_LIVE_HOMEPAGE_GO`  
`UI4_LEGACY_REDIRECT_GO`  
`UI4_ARCHITECTURE_INVENTORY_GO`  
`UI4_COMPONENT_AUDIT_GO`  
`UI4_STATE_OWNERSHIP_AUDIT_GO`  
`UI4_DESIGN_TOKEN_AUDIT_GO`  
`UI4_TEST_ARCHITECTURE_AUDIT_GO`  
`UI4_REFACTORING_ROADMAP_GO`

Preserved status markers:

`M555_BACKEND_FREEZE_GO`  
`OPERATIONAL_CUTOVER_NO_GO`  
`FLASK_RETIREMENT_NO_GO`

## 2. Scope and safety boundaries

The source audit was read-only. No architectural refactoring was implemented. The only authorized state mutation was a restart of the already-running local Next.js development service.

Not changed:

- Fastify or Flask source and API contracts.
- Authentication, CSRF, RBAC, sessions, or federation implementation.
- SQLite, cartridge storage, firmware contracts, WebSocket contracts, or backups.
- Authentik, Traefik, Mailpit, DNS, TLS, or shared Dream services.
- Docker Compose files, Dockerfiles, ports, labels, networks, or environment configuration.
- `/docs` routing or documentation infrastructure.
- `../PRG32`.
- Production or university deployment.

The worktree was already heavily modified by previous milestones. Those changes were preserved; no reset, clean, volume deletion, image deletion, or cache prune was performed. No commit or push was performed.

## 3. UI.3 handoff state

UI.3 delivered the source-level split:

- `frontend/src/app/page.tsx`: Homepage with compatibility redirect for catalog query parameters.
- `frontend/src/app/explore/page.tsx`: canonical catalog route.
- `frontend/src/components/homepage/Homepage.tsx`: static PRG32 landing page.
- `frontend/src/lib/navigation/catalog-compat.ts`: bounded legacy query conversion.

The UI.3 local build already contained the correct routes. The remaining question was whether the shared local Dream runtime was serving that current source consistently.

## 4. Local Next.js runtime diagnosis

The exact running service was inspected before mutation.

| Property | Observed value |
| --- | --- |
| Compose project | `prg32-cartridge-store` |
| Service/container | `next` / `prg32-cartridge-store-next-1` |
| Image | `riscv-prg32/cartridge-store-frontend:dev` |
| Process | `pnpm exec next dev --webpack --hostname 0.0.0.0` |
| Working directory | `/app` |
| Node inside container | 24.22.0 |
| Source mount | repository `frontend/` → `/app` |
| Node modules mount | `.local/frontend/node_modules` → `/app/node_modules` |
| Next cache mount | `.local/frontend/next-cache` → `/app/.next` |
| Networks | `dream_edge`, `prg32_cartridge_store_dev` |
| Public router | `store.prg32.dream.test` → service port 3000 |

The container contained the current `frontend/src/app/page.tsx`, including the `Homepage` import and legacy redirect. Therefore the source bind mount and Compose project were correct.

The process logs showed the relevant cause:

- Fast Refresh had performed full reloads after dependency/module changes.
- `/explore/page` was compiled lazily after the runtime had already served other routes.
- The long-lived dev process had accumulated a persisted `.next` development cache.
- The root and Explore pages eventually reflected the source after compilation, but the first public observation was inconsistent.

There was no evidence of a production `next start` process, a second Next container, an incorrect image, or a wrong source directory. The diagnosis is `dev-server compilation/cache state`, not an application route defect.

## 5. Runtime refresh authorization audit

The inspected configuration made a service-only refresh safe:

- `next` was a distinct Compose service.
- It had no `depends_on` restart cascade.
- Flask, auth-writer, and auth-writer-edge-proxy were separate running services.
- Its source, node_modules, and Next cache mounts were local development resources.
- No operational database or cartridge storage was mounted into `next`.
- No shared persistent service was being recreated.

The allowed mutation boundary was therefore satisfied. A full stack restart was unnecessary and was not performed.

## 6. Exact runtime actions performed

Read-only actions before the mutation:

```text
docker compose --profile dev ps
docker compose config --services
docker compose config --profiles
docker inspect prg32-cartridge-store-next-1
docker exec ... inspect /app/src/app/page.tsx and /app/.next
docker logs --tail 120 prg32-cartridge-store-next-1
```

The single mutation was:

```text
docker compose --profile dev restart next
```

The result was:

```text
Container prg32-cartridge-store-next-1 Restarting
Container prg32-cartridge-store-next-1 Started
```

Post-refresh inspection confirmed the same image, same command, same mounts, and a new container start time. No other service was restarted.

## 7. Live Homepage/Explore verification

Browser checks used Chromium with certificate verification disabled only for the local Dream test certificate. No authentication was performed and no mutating request was sent.

Observed after the targeted refresh:

- `GET https://store.prg32.dream.test/`: Homepage content includes `Build cartridges. Learn the machine.`.
- `GET https://store.prg32.dream.test/explore`: catalog content includes `Browse the cartridge shelf.`.
- The Homepage brand links to `/`.
- Explore navigation links to `/explore`.
- Search links to `/explore#catalog-search`.
- Documentation entry links to `/docs/getting-started`; the public nav links to `/docs`.
- `/games/org.example.missing` remains a valid dynamic detail route and stays on the `/games/...` path.
- `/login` remains available and renders the existing Sign in entry, including the configured local/provider presentation.
- `/docs` remains available and renders the public documentation index.

No page errors or failed browser requests were observed in the final browser harness. An anonymous `/auth/me` 401 was observed in console traffic; this is the expected unauthenticated session probe, not a frontend routing failure.

The catalog was not populated or seeded. Explore behavior was verified at route and shell level; empty/error/populated data states remain covered by the synthetic component tests described below.

Marker: `UI4_LIVE_HOMEPAGE_GO`.

## 8. Legacy URL redirect verification

The browser navigated:

```text
https://store.prg32.dream.test/?q=pong&architecture=qemu&sort=updated&page=2
```

and ended at:

```text
https://store.prg32.dream.test/explore?q=pong&architecture=qemu&sort=updated&page=2
```

The values and names were preserved. In this Next development path the compatibility redirect is observable as the final browser URL after the App Router navigation; this check does not claim that the raw initial HTTP response is a 3xx response.

Marker: `UI4_LEGACY_REDIRECT_GO`.

## 9. Frontend dependency inventory

Versions from `frontend/package.json`:

| Category | Dependencies |
| --- | --- |
| Runtime | Next 16.4.0, React 19.3.0, React DOM 19.3.0 |
| API/server state | TanStack Query 5.104.1 |
| Client state | Zustand 5.0.15 |
| Runtime validation | Zod 4.6.6 |
| Authentication UI | SimpleWebAuthn browser 14.0.0 |
| UI primitives | Radix Dialog 1.3.1, Dropdown Menu 2.2.1, Select 2.4.1, Slot 1.5.0 |
| Icons/utilities | Lucide React 1.57.0, clsx 2.1.1, tailwind-merge 3.7.0 |
| Styling/build | Tailwind CSS 4.3.3, `@tailwindcss/postcss` 4.3.3 |
| Test/runtime | Vitest 5.0.3, Testing Library React 16.3.3, user-event 14.6.7, jsdom 30.1.2, Playwright 1.64.0 |
| Tooling | TypeScript 6.0.3, ESLint 9.39.1, Next ESLint config 16.4.0 |

The package declares Node `>=24.0.0 <25` and pnpm `12.5.1`. No dependency was upgraded, removed, or added by UI.4.

The dependency set has clear roles. There is no evidence in this audit that a replacement UI, state, validation, or test library is needed.

## 10. Current architecture overview

The frontend uses Next App Router with a single root layout and a small federation nested layout. Most route pages are thin wrappers around client components. `frontend/src/app/layout.tsx` owns metadata, global styles, `Providers`, `PwaRegistration`, and `AppShell`.

Current layers:

- `src/app`: route composition, redirects, metadata, route handlers, loading/error/not-found boundaries.
- `src/components`: feature/workspace components and shared UI primitives.
- `src/lib/api`: transport, origin selection, contracts, Zod schemas, and domain clients.
- `src/lib/auth`: current-user hook, return-path safety, auth configuration.
- `src/providers`: theme provider.
- `src/stores`: theme, admin section, and federation transient selection state.
- `src/styles`: Tailwind import plus semantic CSS variables and layout primitives.
- colocated tests plus `frontend/e2e` Playwright suites.

The architecture is explicit enough to continue incremental work. It is not yet fully feature-oriented: domain API modules and UI feature folders coexist with broad workspace components.

## 11. Component responsibility audit

### Homepage and storefront

- `frontend/src/components/homepage/Homepage.tsx:8-96` is a static composition and is appropriately isolated from data fetching.
- `frontend/src/components/storefront/CatalogBrowser.tsx:44-112` owns URL parsing, query construction, TanStack Query orchestration, local filter state, sorting, pagination, and rendering. This is still cohesive for the catalog surface, but the bottom render expression is dense and the URL synchronization helper is local to the component. A focused catalog query-state hook would improve testability if additional catalog surfaces appear.
- `frontend/src/components/storefront/GameDetail.tsx:33-63` combines detail query state, version/architecture selection, formatting helpers, and rendering. It is currently manageable; the first extraction should be a query hook or view model only if detail variants grow.
- `frontend/src/components/storefront/CartridgeCard.tsx:13-...` is a focused presentation component. `GameCard.tsx` is a compatibility alias, which is useful while route/API terminology remains stable.

### Authentication and account

- `frontend/src/components/auth/LoginPanel.tsx:27-159` owns password form state, passkey ceremony, provider query, current-user query, return-path handling, mutation invalidation, error presentation, and the entire responsive login view. The passkey cast at line 64 crosses an opaque WebAuthn boundary. This is a significant responsibility concentration, but it must be split carefully because authentication, CSRF, and safe return paths are security-sensitive.
- `frontend/src/components/auth/RegisterPanel.tsx:22-...` owns both registration request and completion flows. The two mutations are related but should eventually have a feature-owned registration model rather than more inline handlers.
- `frontend/src/components/account/AccountWorkspace.tsx:32-132` combines password change, API token lifecycle, passkey enrollment, token row editing, session reauthentication, and query invalidation. It is the clearest candidate for cohesive subsections or hooks: `useAccountTokens`, `usePasskeys`, and a password mutation boundary, without moving form state into Zustand.
- `frontend/src/components/auth/ProtectedRoute.tsx:10-31` and `frontend/src/components/workflow/WorkflowGuard.tsx:21-42` both implement session/permission presentation. They are not duplicates: ProtectedRoute guards route access while WorkflowGuard guards workflow ownership/permission. Their error/loading vocabulary can be aligned later without merging authorization concerns.

### Creator, review, admin, and federation

- `frontend/src/components/workflow/DeveloperWorkspace.tsx:12-78` owns submission listing, drafts, page state, file attachment, resubmission, and draft mutations. The nested `SubmissionList` and `DraftsPanel` are meaningful boundaries already; query-key constants and mutation error presentation remain inline.
- `frontend/src/components/workflow/PublishingWizard.tsx:16-79` owns a four-step local workflow and one upload mutation. It is reasonably cohesive and should not be split merely by line count.
- `frontend/src/components/workflow/ReviewWorkspace.tsx:10-67` owns list/detail selection, metadata/note form state, approval/rejection mutations, and permission checks. It is small but mixes workflow state and review presentation; a future `useReviewSelection`/`useReviewActions` boundary would be justified only when review features expand.
- `frontend/src/components/admin/AdminWorkspace.tsx:32-203` is the largest concentration: section navigation, settings, users, groups, roles, tokens, catalog moderation, backup/audit views, queries, mutations, and inline forms. The existing `useAdminStore` only owns the selected section; it does not reduce the workspace's feature orchestration. This is a P1 maintainability risk.
- `frontend/src/components/federation/FederationWorkspace.tsx` contains several large feature branches and inline provider form/state transitions. `use-sensitive-actions.tsx:12-45` is a good existing boundary for reauthentication; provider form state, provider detail, identities, and certificate operations should remain feature-owned rather than moved into a generic form framework.

## 12. Custom hook opportunities

Recommended hooks are limited to meaningful ownership boundaries:

| Proposed hook | Current owner | Contract | Benefit | Risk |
| --- | --- | --- | --- | --- |
| `useCatalogQueryState` | `CatalogBrowser.tsx:44-78` | `{ pathname, searchParams }` → parsed `q`, architecture, sort, page plus URL writers | Makes URL compatibility testable without rendering the entire catalog | Medium; must preserve query names and `/explore` paths |
| `useAccountTokens` | `AccountWorkspace.tsx:42-55` | Query data plus create/rename/revoke mutations and invalidation | Removes repeated token mutation wiring from security UI | Medium; preserve one-time token display |
| `usePasskeyActions` | `LoginPanel.tsx:60-70`, `AccountWorkspace.tsx:61-74` | begin/finish operations with busy/error state | Isolates WebAuthn casts and error policy | High; must preserve CSRF and backend ceremony order |
| `useAdminResource` family | `AdminWorkspace.tsx:60-151` | Explicit per-resource query/mutation contracts | Makes settings/users/catalog ownership reviewable | High; avoid one generic admin hook that hides permissions |
| `useReviewActions` | `ReviewWorkspace.tsx:21-28` | selected submission + approve/reject actions | Separates mutation lifecycle from review layout | Medium; preserve rejection-note and permission behavior |

No hook is recommended for a one-line `useState` wrapper. Local form state remains local.

## 13. TanStack Query audit

TanStack Query is correctly the server-state owner. Catalog, auth, workflow, admin, federation, metrics, profile, scores, and statistics data are queried with `useQuery`; mutations use `useMutation` and invalidate relevant queries.

Strengths:

- Current user has a named `CURRENT_USER_QUERY_KEY` in `frontend/src/lib/api/auth.ts:20` and a shared `useCurrentUser` hook.
- Workflow principal has a named key in `WorkflowGuard.tsx:9`.
- Federation has a centralized `federationQueryKeys` object in `frontend/src/lib/api/federation-admin.ts`.
- Sensitive/account queries use `retry: false`; session-sensitive queries have bounded `staleTime`.
- Mutations explicitly invalidate affected lists/details rather than putting server data in Zustand.

Inconsistencies:

- Most keys remain inline arrays, for example admin keys in `AdminWorkspace.tsx:60-151`, auth token/passkey keys in `AccountWorkspace.tsx:42-71`, and review/workflow keys in their workspace components.
- Query key naming is not a single documented domain convention. `admin`, `workflow`, `auth`, `profile`, `metrics`, and `federation` are compatible but not centrally typed.
- Mutation invalidation is repeated in inline `onSuccess` closures, increasing drift risk as features grow.
- The default `QueryClient` in `frontend/src/app/providers.tsx:9-15` does not declare application-wide retry/error defaults; each feature makes its own choices.

Recommendation: introduce domain key factories incrementally, starting with admin/auth/workflow. Do not change existing keys in bulk; migrate each domain with tests that assert invalidation and cache behavior.

## 14. Zustand audit

The Zustand footprint is appropriately small:

- `theme-store.ts`: persisted user preference, hydrated after client mount to avoid hydration mismatch.
- `admin-store.ts`: selected admin section, shared across admin workspace navigation.
- `federation-store.ts`: transient selected provider ID; the file explicitly keeps server data and confidential form values out of Zustand.

Classification:

- Server state: TanStack Query.
- Shared client state: admin section and federation selection.
- Local component state: forms, wizard steps, filters, mutation feedback, selected rows.
- URL state: catalog query parameters and safe return paths.
- Persisted preference: theme localStorage value.

No new store is justified. The current stores are not being used as server caches. A future improvement is to add selector conventions and tests for the admin/federation stores only if rerender profiling demonstrates a need.

Marker: `UI4_STATE_OWNERSHIP_AUDIT_GO`.

## 15. Zod audit

`frontend/src/lib/api/schemas.ts` provides runtime validation for authentication, catalog, workflow, metrics, statistics, profile, discovery, and compatible response shapes. Domain API modules call the shared client with schemas. `federation-admin.ts` also keeps sensitive provider schemas close to its API boundary.

Validated boundaries include:

- `requestJson` responses when a schema is supplied (`client.ts:28-60`).
- Catalog responses (`catalog.ts:21-26`).
- Auth and CSRF responses (`auth.ts:36-171`).
- Workflow, metrics, profile, statistics, and federation responses.

Unvalidated or weakly typed boundaries:

- `requestJson` intentionally returns `body as T` when no schema is passed (`client.ts:48-50`); setup APIs and some compatibility calls use this path.
- `passkeyOptionsResponseSchema` uses `z.record(z.string(), z.unknown())`, then UI code casts to the WebAuthn library input (`LoginPanel.tsx:64`, `AccountWorkspace.tsx:69`). This is an explicit opaque protocol boundary, but the adapter is not centralized.
- `contracts.ts` maintains hand-written response types while schemas independently describe the same payloads. Federation types partially use `z.infer`; most domains do not.

Recommendation: consolidate schemas/types domain by domain, beginning with the unvalidated setup boundary and WebAuthn adapter. Do not regenerate all contracts or normalize backend payloads in this milestone.

## 16. TypeScript audit

`frontend/tsconfig.json` uses `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, bundler resolution, and Next type generation. The codebase contains no actual TypeScript `any` usage in `src`; matches for “any” are manifest/policy strings.

Positive patterns:

- `unknown` is used at external boundaries and error handlers.
- Zod inference is used for federation provider and identity types.
- Route and API identifiers are explicitly typed.
- Query keys use `as const` where centralized.

Risks:

- WebAuthn `as unknown as` assertions in `LoginPanel.tsx:64` and `AccountWorkspace.tsx:69` bypass structural validation at a security-sensitive browser boundary.
- `selectedId as number` and similar assertions occur in enabled queries (`ReviewWorkspace.tsx:22`, `AdminWorkspace.tsx:98-104`); the runtime guard makes them safe today, but typed query helpers would reduce repeated assertions.
- Federation form conversion uses `Object.fromEntries(...) as ...` and several inline `event.target.value as` assertions (`FederationWorkspace.tsx:95-105`).
- Hand-written `contracts.ts` and Zod schemas can drift without a compile-time relationship.

The correct response is small boundary adapters and discriminated input types, not type gymnastics or a wholesale generated-domain rewrite.

## 17. API client audit

`frontend/src/lib/api/client.ts:28-110` centralizes fetch headers, credentials, JSON parsing, API error normalization, response validation, same-origin requests, dual-origin requests, CSRF headers, and discovery/catalog compatibility helpers.

Strengths:

- `requestSameOriginJson` preserves the existing Flask-owned public API boundary.
- `requestApiJson` selects the explicit API origin only when dual-origin is enabled.
- `withCsrfToken` centralizes the header name.
- Domain clients encode path parameters with `encodeURIComponent`.
- Zod validation prevents silently fabricating malformed responses.
- Auth paths and federation paths reject unsafe path forms.

Debt:

- `requestJson`, `requestApiJson`, and `requestSameOriginJson` are intentionally distinct but their selection rules are distributed across domain clients.
- `auth.ts`, `workflow.ts`, `admin.ts`, `setup.ts`, and `federation-admin.ts` repeat CSRF-fetch/mutation wrapper patterns and domain error mapping.
- `client.ts` still exports `getGames`, `getDiscoveryDocument`, and `getCsrfToken` compatibility helpers while the active catalog client owns `getCatalog`; usage is sparse or test/compatibility-oriented and should be confirmed before removal.
- `setup.ts` contains broad untyped response paths that should receive schemas before any setup UI expansion.

Do not change API clients as part of this audit. A future domain transport cleanup must preserve same-origin routing, dual-origin credentials, CSRF, and firmware-facing contracts.

## 18. Authentication and RBAC audit

The frontend correctly treats backend authorization as authoritative:

- `useCurrentUser` (`frontend/src/lib/auth/use-current-user.ts:18-30`) owns session query state and converts only 401 to anonymous.
- `ProtectedRoute` (`frontend/src/components/auth/ProtectedRoute.tsx:10-31`) handles route redirect and session expiry presentation.
- `WorkflowGuard` (`frontend/src/components/workflow/WorkflowGuard.tsx:21-42`) handles workflow principal and permission presentation.
- `navigation.ts:35-77` filters contextual navigation by permission, but only changes visibility; it is not an authorization boundary.
- `use-sensitive-actions.tsx:12-45` requires backend reauthentication before federation mutations.
- API mutations fetch CSRF and send `X-CSRFToken` through the shared client.
- `safeReturnPath` is used by login/federated login construction.

Duplication exists in session/error presentation across `AuthNavigation`, `LoginPanel`, `ProtectedRoute`, and `FederationAdminGuard`. It is an opportunity for shared status components, not a reason to merge guards or move RBAC client-side.

Real authenticated acceptance remains an operational/open gate; UI.4 did not authenticate against external providers.

## 19. Design-token audit

`frontend/src/styles/index.css:3-44` already defines semantic base tokens for background, surfaces, text, muted text, borders, primary colors, focus, shadows, radius, gutter, and reading width, with a dark-theme override.

Existing strengths:

- Components generally use `var(--color-...)` for core surfaces, text, borders, focus, and brand colors.
- Theme switching changes the root token set rather than branching every component.
- Radius and layout tokens exist and are reused.

Missing semantic layers:

- No semantic `--color-success`, `--color-warning`, `--color-danger`, `--color-input`, `--color-ring`, or foreground pair tokens.
- Status UI uses raw Tailwind colors in many files: `LoginPanel.tsx`, `WorkflowGuard.tsx`, `AccountWorkspace.tsx`, `Scoreboard.tsx`, `StatisticsPage.tsx`, `CatalogState.tsx`, `Badge.tsx`, and workflow/admin components.
- Some dark variants are written ad hoc (`dark:bg-...`) while other components depend on tokens, creating uneven theme behavior.
- `CatalogBrowser.tsx` contains a raw `bg-[#171222]` utility alongside semantic classes.

This is a P2 design-system debt item. The correct migration is to define status tokens and update primitives first, then feature surfaces, with light/dark visual checks after every group. Do not add all target tokens speculatively.

Marker: `UI4_DESIGN_TOKEN_AUDIT_GO`.

## 20. Shared UI primitives audit

Current primitives are in `frontend/src/components/ui` and use Radix where interaction semantics require it.

- `button.tsx` centralizes variants, sizes, disabled state, loading state, Slot composition, and focus styling.
- `input.tsx` centralizes input/textarea field styling and `Field` label/help/error association.
- `select.tsx`, `dialog.tsx`, and `dropdown-menu.tsx` wrap Radix primitives.
- `card.tsx`, `badge.tsx`, `filter.tsx`, and `search-input.tsx` cover common layout/control patterns.
- `CartridgeCard.tsx` is a domain presentation component, not a generic primitive.

Findings:

- Focus, disabled, and spacing patterns are strong in the base primitives but are bypassed by direct `<input>`, `<select>`, and `<button>` markup in pages/workspaces.
- Status variants are duplicated between `Badge.tsx`, `WorkflowGuard.tsx`, statistics/scoreboard, and feature workspaces.
- `Field` supports input fields but not a unified textarea/select/error contract, so federation and setup forms carry their own labels and hints.
- The shared primitives expose reasonable props; a new component library is not justified.

Recommendation: normalize semantic status and field variants incrementally, retaining Radix and Lucide. Do not redesign Store surfaces in UI.4.

## 21. App Router audit

The route tree is broad but explicit. Dynamic routes cover games, runs, profiles, and federation providers. Route handlers expose health, manifest, icons, service worker, and the compatibility auth catch-all. `frontend/src/app/error.tsx`, `loading.tsx`, and `not-found.tsx` provide global boundaries.

Positive boundaries:

- `page.tsx` is server-rendered and owns the UI.3 compatibility redirect.
- `explore/page.tsx` is a thin route-to-feature adapter.
- `layout.tsx` owns metadata and global providers.
- The federation subtree has a nested layout and guard.
- Client components are explicit with `use client`.

Opportunities:

- Root `Providers` wraps the entire app because QueryClient, theme, PWA registration, shell navigation, and auth navigation are mounted at the root. This is operationally simple but makes every route part of the client shell.
- `AppShell.tsx` is necessarily client-side for pathname/mobile/theme/auth behavior; static route content can remain server-rendered beneath it.
- Several pages are thin wrappers around a fully client component, which is appropriate for browser workflows but should be measured before further splitting.
- The root redirect is a server/client-compatible App Router redirect, but direct HTTP status semantics should not be assumed from dev-mode observations.
- No route-level Suspense boundary exists around high-latency client queries; existing loading states are component-local.

Do not blanket-convert client components to server components. The next optimization should target only static shells and data boundaries proven by build/runtime measurement.

## 22. Performance audit

Measured evidence:

- `next build` completed successfully with 40 static page-generation units and the expected route table, including `/` and `/explore`.
- Local browser checks at 375, 768, 1024, 1440, and 1920 pixels found no horizontal overflow on Homepage or Explore.
- The dev runtime logs show lazy compilation and full reloads, explaining development latency but not proving a production performance issue.

Architectural risks, not measured regressions:

- Root client providers/shell increase client JavaScript reach.
- Large admin/auth/federation client components can create broad feature chunks and rerender surfaces.
- Inline derived arrays and large JSX expressions make future rerender profiling harder.
- Catalog and authenticated pages rely on client queries and do not prefetch server snapshots.

No bundle-size, Core Web Vitals, or production load number was fabricated. Any performance milestone should start with a build analyzer/profile before changing boundaries.

## 23. Test architecture audit

Current baseline after UI.4 validation:

- 33 Vitest files.
- 82 passing tests.
- Colocated tests for API clients, contracts/boundaries, UI primitives, auth, catalog, workflows, navigation, theme, and selected workspaces.
- Playwright configuration and historical disposable suites exist under `frontend/e2e`.

Strengths:

- `CatalogBrowser.test.tsx` covers synthetic populated, empty, error, query URL, architecture filter, mobile dialog, detail, and download behavior.
- `catalog-compat.test.ts` tests the legacy root query conversion directly.
- `client.test.ts` covers credentials, response validation, and error normalization.
- `ThemeProvider.test.tsx`, `ThemeToggle.test.tsx`, navigation tests, and Homepage tests cover the UI.3 route/theme boundary.
- Workflow and admin tests use explicit synthetic responses and permission fixtures.

Risks:

- Component tests mock Next navigation and API modules heavily; this is efficient but can miss integration errors between the App Router and client components.
- Fixtures are distributed across test files rather than organized by domain.
- The Playwright config targets disposable `m52g14` hostnames and global setup/teardown; it is not the live Dream smoke harness used in UI.4.
- Authenticated and federation E2E suites are operationally expensive and remain separate from the lightweight frontend check.
- Accessibility assertions are mostly role/name assertions; no complete axe audit is part of the current test command.

Recommendation: retain Vitest as the default, add focused domain fixtures and a small route smoke suite, and keep full disposable E2E behind an explicit environment gate. Do not migrate frameworks.

Marker: `UI4_TEST_ARCHITECTURE_AUDIT_GO`.

## 24. Directory structure assessment

The current tree is understandable but mixed:

- `components/storefront` contains catalog, detail, scores, statistics, and cartridge presentation.
- `components/workflow` contains creator and review workflows.
- `components/auth`, `account`, `profile`, `admin`, `federation`, and `metrics` are domain-oriented.
- `lib/api` is domain-separated by client module but contracts/schemas are broad central files.
- `components/ui` is a coherent shared layer.

The smallest maintainable improvement is not a full directory rewrite. Keep routes in `app`, keep `components/ui`, and introduce feature-owned hooks/query-key files beside the existing domain component/API module. Consider a `catalog` split from `storefront` only if the number of catalog surfaces grows beyond Explore/detail/card.

Do not move all files into a speculative `features/` tree in one change; import churn would obscure behavior-preserving review.

## 25. Prioritized technical debt register

| ID | Priority | Evidence | Why it matters | Proposed improvement | Benefit | Risk/dependencies | Milestone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI4-TD-001 | P1 | `AdminWorkspace.tsx:32-203` handles many admin domains and mutations | High change coupling and difficult focused testing | Split by existing admin sections, keep `AdminSection` store and API contracts | Smaller reviews and domain tests | High; preserve permission checks and invalidation | UI.5 |
| UI4-TD-002 | P1 | `LoginPanel.tsx:27-159`, `AccountWorkspace.tsx:32-132` mix forms, WebAuthn, queries, mutations, and presentation | Security-sensitive flows are hard to reason about and test in isolation | Extract feature-owned auth/passkey/token action hooks and adapters | Clearer ceremony boundaries | High; preserve CSRF, safe return paths, one-time secrets | UI.5 |
| UI4-TD-003 | P1 | Inline query keys/invalidation in `AdminWorkspace.tsx`, `AccountWorkspace.tsx`, workflow components | Cache invalidation can drift during feature changes | Add domain key factories incrementally, starting with admin/auth/workflow | Consistent cache ownership | Medium; key migration must be staged | UI.6 |
| UI4-TD-004 | P2 | `contracts.ts` and `schemas.ts` duplicate many wire shapes; `client.ts:48-50` permits unvalidated `T` | Backend/API drift can be discovered late | Tie types to schemas per domain; add schemas at setup boundary | Stronger external boundary | Medium; preserve nullable/legacy fields | UI.6 |
| UI4-TD-005 | P2 | Raw status utilities across `Badge.tsx`, `CatalogState.tsx`, `LoginPanel.tsx`, workflow, scores, statistics | Light/dark status appearance is inconsistent | Add success/warning/danger semantic tokens and primitive variants | Consistent theme system | Medium; visual regression risk | UI.5 |
| UI4-TD-006 | P2 | `client.ts`, `auth.ts`, `workflow.ts`, `admin.ts`, `setup.ts`, and federation client repeat transport/error patterns | Transport policy is distributed | Consolidate only shared CSRF/error helpers after domain tests exist | Less repetition without API change | Medium; preserve dual-origin/same-origin split | UI.6 |
| UI4-TD-007 | P2 | Root `Providers`/`AppShell` client boundary in `layout.tsx:21-29` | Broad client reach can increase JS and hydration cost | Measure first, then isolate static shell/route groups where safe | Potential bundle/hydration reduction | High; theme/auth/navigation behavior | UI.7 |
| UI4-TD-008 | P3 | `frontend/e2e` config targets disposable `m52g14` origins; colocated fixtures are distributed | Runtime verification paths are harder to reuse | Add a small environment-driven smoke config, without replacing Playwright | Faster repeatable acceptance | Low/medium; no real auth by default | UI.7 |

No P0 security or correctness defect was found in this frontend-only audit. Backend authorization remains authoritative.

## 26. Proposed incremental refactoring roadmap

### UI.5 — Semantic status and shared primitive consistency

Goal: make the existing design system coherent without redesigning the Store.

Scope:

- Add only the demonstrated status tokens: success, warning, danger, input/ring as needed.
- Update `Badge`, `WorkflowMessage`, `CatalogState`, `Button`, and `Field` variants first.
- Replace repeated raw status utilities in one feature group at a time.

Target files: `styles/index.css`, `components/ui/*`, `components/workflow/WorkflowGuard.tsx`, `components/storefront/CatalogState.tsx`, then auth/account/workflow surfaces.

Exclude: route changes, API changes, new component library, Homepage redesign.

Prerequisite: current light/dark browser baseline. Acceptance: no visual regressions in both themes, existing 82 tests pass, status primitives cover error/warning/success/focus states.

Risk: medium; visual and contrast regression.

### UI.6 — Domain query, API, and schema boundaries

Goal: reduce server-state and external-boundary drift.

Scope:

- Add query-key factories for auth, admin, workflow, and metrics incrementally.
- Move repeated invalidation definitions beside each domain client/hook.
- Add Zod schemas to currently broad setup responses.
- Introduce a typed WebAuthn options adapter and remove only the duplicated casts it replaces.
- Confirm whether unused compatibility exports in `client.ts` are still public before removal.

Target files: `lib/api/client.ts`, `lib/api/{auth,admin,workflow,setup}.ts`, `lib/api/contracts.ts`, `lib/api/schemas.ts`, `lib/auth`, and matching tests.

Exclude: backend response changes, public route changes, global query-key rewrite, moving server state into Zustand.

Prerequisite: UI.5 status baseline and API contract fixtures. Acceptance: all existing response fields remain accepted, CSRF/credentials tests pass, key invalidation tests cover each migrated domain.

Risk: medium/high; cache identity and compatibility risk.

### UI.7 — Authenticated/workflow responsibility extraction

Goal: make security-sensitive and administrative UI modules cohesive.

Scope:

- Extract passkey/token/password action hooks from account/auth components.
- Split `AdminWorkspace` by its existing sections without changing the `AdminSection` store contract.
- Extract review selection/action orchestration only where tests identify value.
- Preserve backend permission checks, safe return paths, CSRF, and one-time token display.

Target files: `components/auth/LoginPanel.tsx`, `components/account/AccountWorkspace.tsx`, `components/admin/AdminWorkspace.tsx`, `components/workflow/ReviewWorkspace.tsx`, related tests.

Exclude: client-side RBAC replacement, provider behavior, auth backend changes, new global stores.

Prerequisite: UI.6 query/schema boundaries. Acceptance: unit tests cover success/error/loading/permission paths; no query key or API URL changes; authenticated acceptance remains separately verified.

Risk: high; security-flow regression risk.

### UI.8 — Runtime/client boundary and test architecture hardening

Goal: reduce unnecessary client reach and make repeatable browser smoke checks cheap.

Scope:

- Profile build chunks and hydration before changing `layout.tsx`/`Providers`.
- Isolate only proven-static route content from client shell behavior.
- Add a small environment-driven public smoke suite for `/`, `/explore`, legacy redirect, `/login`, `/docs`, and detail routing.
- Keep full disposable auth/federation E2E explicit and gated.

Target files: `app/layout.tsx`, `app/providers.tsx`, `components/layout/AppShell.tsx`, `playwright.config.mjs`, new smoke test only after authorization.

Exclude: deployment changes, browser-provider credentials, broad E2E migration, route redesign.

Prerequisite: UI.7 and measured build/runtime baseline. Acceptance: no hydration warnings, route behavior preserved, build output and smoke checks documented.

Risk: high; App Router and hydration behavior.

## 27. Validation commands and results

Commands executed with Node 24 selected through `nvm use 24`:

| Command | Result |
| --- | --- |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS; 33 files, 82 tests |
| `pnpm --dir frontend run build` | PASS; Next 16.4.0, 40 static generation units, `/` and `/explore` present |
| `git diff --check` | PASS |
| Targeted `next` service restart | PASS; only `prg32-cartridge-store-next-1` restarted |
| Live Chromium smoke | PASS after refresh; Homepage, Explore, redirect, detail, login, docs, links, theme |

The browser smoke recorded the expected anonymous session probe response `401` from `/auth/me`; it did not produce a page error or failed request. No backend or Python checks were run because UI.4 freezes the backend and scopes validation to the frontend/runtime audit.

## 28. Files changed

UI.4 source changes: none.

New documentation file:

- `docs/modernization/167-frontend-runtime-architecture-audit-ui-4.md`

Runtime-only state change:

- Restarted the existing `next` development container.

No Compose file, Dockerfile, source code, API client, lockfile, database, or production artifact was modified by UI.4.

## 29. Remaining limitations

- The local development runtime uses a bind-mounted `.next` cache and may require the same service-only restart after large dependency or route-boundary changes. A future workflow can make this refresh more explicit, but no Docker workflow was changed here.
- The raw HTTP response observed for the legacy query was status 200 in Next dev while the browser URL correctly navigated to `/explore`; the acceptance claim is URL behavior, not a 3xx wire-contract claim.
- The live catalog was intentionally not seeded. Populated catalog behavior is covered by synthetic component fixtures.
- The browser smoke did not perform authenticated mutations, external OIDC/SAML login, passkey enrollment, or provider administration. Those remain separate acceptance gates.
- No bundle analyzer, Core Web Vitals run, or production load test was authorized or claimed.
- The audit does not prove that every historical Playwright suite is currently runnable against the Dream host; its config still references disposable `m52g14` origins and environment setup.

## 30. Final decision

`UI4_ARCHITECTURE_AUDIT_GO`

The local Next.js runtime was diagnosed and refreshed within the authorized service boundary. The live Homepage, Explore route, legacy URL behavior, navigation, detail route, login entry, documentation, and theme interaction were verified after refresh. The frontend architecture was audited against actual source, dependencies, tests, routing, state, API, validation, design-token, and component boundaries. A behavior-preserving incremental roadmap is documented without implementing the proposed refactoring.

No backend or operational cutover was started. No Fumadocs work, deployment change, commit, or push was performed.
