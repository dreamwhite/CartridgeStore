# PRG32 Cartridge Store — UI.8 Frontend Runtime, Performance & Regression Hardening

Date: 2026-10-16

## 1. Executive summary

UI.8 was completed as a frontend-only hardening milestone. The work stayed
inside the Next.js application and did not change Fastify, Flask, SQLite,
Docker, authentication providers, routing infrastructure, or deployment.

The implementation made three bounded changes:

1. Playwright now has a safe public-smoke project with an explicit local or
   externally supplied base URL. The historical disposable setup, Docker
   startup, credentials and destructive teardown are opt-in only.
2. Private TanStack Query cache removal now covers the complete authenticated
   query-key prefixes, including current-user, federation, metrics and profile
   data. A real `QueryClient` regression test verifies that an in-flight private
   response is cancelled and cannot repopulate the cache after removal.
3. The proven `DeveloperWorkspace` façade was removed. The route and test now
   import `CreatorWorkspace` directly.

The frontend validation suite passed with 49 Vitest files and 107 tests. The
four new public Playwright smoke tests passed against a locally started Next
server. A direct launch of the raw `.next/standalone/server.js` directory was
also attempted and failed because Next standalone output requires its static
assets and public files to be packaged beside the server; this is recorded as
an unverified packaging-specific check, not as a passing result.

Final decision: `UI8_FRONTEND_HARDENING_GO` for the authorized frontend scope.
This is not an operational deployment, cutover, or Flask-retirement decision.

## 2. Scope and safety boundaries

Allowed changes were limited to Next.js source, frontend tests, frontend test
configuration, and this single report. No backend, database, Dockerfile,
Compose, Authentik, Traefik, Mailpit, DNS/TLS, shared infrastructure,
operational account, real session, or `../PRG32` file was changed.

No dependency was added or upgraded. No lockfile was changed. No production
route or API contract was changed. No commit or push was performed.

The following prior decisions remain unchanged:

- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 3. Baseline versions and test counts

The baseline was collected before editing the UI.8 files.

| Item | Observed value |
| --- | --- |
| Node.js | Node 24 selected with `source "$HOME/.nvm/nvm.sh" && nvm use 24` |
| pnpm | 12.5.1 from `frontend/package.json` |
| Next.js | 16.4.0 |
| React | 19.3.0 |
| TanStack Query | 5.104.1 |
| Zustand | 5.0.15 |
| Zod | 4.6.6 |
| Vitest | 5.0.3 |
| Playwright | 1.64.0 |
| Baseline Vitest | 49 files, 106 tests passed |
| Post-change Vitest | 49 files, 107 tests passed |
| Baseline production build | Passed; 40 generated pages |

The package engine remains `>=24.0.0 <25`. The dependency graph and lockfile
were not modified by UI.8.

## 4. Route and rendering inventory

The inspected App Router contains public, authenticated, administrative,
workflow, dynamic and route-handler surfaces, including:

- Static or statically generated public routes: `/`, `/explore`, `/docs`,
  `/login`, `/register`, `/scores`, `/stats`, `/dev/ui`, `/manifest.webmanifest`
  and the documentation slugs.
- Dynamic routes: `/games/[gameId]`, `/runs/[runId]`, `/users/[username]`,
  `/users/[username]/runs`, `/users/[username]/runs/[runId]`, and the dynamic
  administration provider route.
- Authenticated/private routes: `/account`, `/admin`, `/publish`, `/review`,
  `/runs`, `/setup`, and `/workspace`.
- Route handlers: `/api/auth/[...path]` and the static/PWA asset handlers.
- Boundary files: root layout, providers, loading, error and not-found
  handling are present and were inspected.

The production build reported 40 generated pages and completed successfully.

## 5. Server/Client boundary findings

The current boundaries are appropriate for the inspected behavior:

- The homepage remains a Server Component. Its content is static and it does
  not need browser state.
- Documentation index and documentation routes remain server-rendered.
- `CatalogBrowser` and `GameDetail` are Client Components because they use
  router/search-parameter state and TanStack Query.
- `AppShell` is client-side because it uses pathname and mobile-navigation
  state.
- `Providers`, `ThemeProvider` and `ThemeToggle` are client-side because they
  own QueryClient, browser persistence and Zustand interaction.
- Authenticated workspaces remain client-side where they use queries,
  mutations, forms and permission-aware interaction.

No demonstrably unnecessary client boundary was found. No speculative
Server/Client rewrite was made.

Marker: `UI8_RUNTIME_BOUNDARIES_GO`

## 6. Static/dynamic rendering findings

Public static content is kept server-rendered where possible. Private and
identity-dependent routes are not converted to static output. Client queries
remain responsible for data that depends on the current session, URL state or
browser interaction.

No shared server cache was introduced for private data. No route semantics were
changed.

Marker: `UI8_RENDERING_POLICY_GO`

## 7. Bundle measurement methodology

Measurement used the existing Next.js 16 production build and local filesystem
metadata. No bundle analyzer or new dependency was installed.

The following were measured from `frontend/.next/static` after the validated
build:

- Non-source-map static assets: 39 files.
- Aggregate bytes: 1,264,111 bytes.
- Largest emitted asset: `static/chunks/07mbxjm0qxlra.js`, 229,590 bytes.
- Other large assets included 159,007, 121,902, 112,594 and 67,872 byte
  chunks.

The aggregate `.next` directory size was not treated as a browser payload
metric because it includes server output, manifests and cache-heavy build
artifacts. Next.js 16/Turbopack did not expose a trustworthy route-by-route
First Load JS table in the inspected build output, so no route-specific First
Load JS values are reported.

Marker: `UI8_BUNDLE_BASELINE_GO`

## 8. Bundle baseline observations

The emitted client assets are split into multiple chunks and the production
build completed without a new bundle analyzer. The current evidence is useful
for a repeatable asset-level baseline, but it is not a route-level dependency
graph.

No dependency upgrade, dynamic import, provider relocation or manual memoization
was justified by the available evidence. No before/after bundle reduction is
claimed.

## 9. Performance issues identified

No high-confidence runtime performance defect was reproduced in the inspected
frontend. The following were identified as correctness/maintainability risks
and addressed narrowly:

- The Playwright default configuration always started a destructive historical
  disposable environment and was tied to obsolete hostnames.
- Private cache cleanup listed individual query families and omitted complete
  authenticated prefixes, leaving identity-dependent federation, metric,
  profile and current-user data outside the common cleanup helper.
- `DeveloperWorkspace.tsx` was an import-only façade with no remaining need
  after UI.7.4.

No speculative `memo`, `useMemo`, `useCallback`, `dynamic` or `Suspense`
optimization was introduced.

Marker: `UI8_PERFORMANCE_EVIDENCE_GO`

## 10. Performance changes implemented

There was no measured performance optimization to claim. The changes are
bounded runtime-safety and maintenance improvements:

### Private cache prefix cleanup

- Original problem: logout/session transitions removed selected private keys,
  but not every query below the authenticated domains.
- Evidence: the key factories contained current-user, federation provider/
  status/identity, metrics run/detail and profile families, while the cleanup
  helper only listed some of them.
- Files: `frontend/src/lib/api/query-keys.ts`,
  `frontend/src/lib/auth/query-cache.ts`.
- Change: added `metricsQueryKeys.all` and `federationQueryKeys.all`, then
  removed authenticated data using the auth, workflow, admin, federation,
  metrics and profile root prefixes.
- Verification: real QueryClient tests pass; the in-flight response test
  confirms TanStack Query cancellation prevents cache repopulation.

### Dead façade removal

- Original problem: `DeveloperWorkspace.tsx` only re-exported
  `CreatorWorkspace`.
- Evidence: repository search found one route import and one test import; no
  other consumer remained.
- Files: workspace route, workspace test, and deleted façade.
- Change: direct imports of `CreatorWorkspace` and removal of the façade.
- Verification: typecheck, lint, build and the full Vitest suite pass.

## 11. Before/after evidence

| Evidence | Before | After | Result |
| --- | --- | --- | --- |
| Vitest | 49 files / 106 tests | 49 files / 107 tests | One meaningful cache regression test added and passed |
| TypeScript | Passed | Passed | No type regression |
| ESLint | Passed | Passed | No lint regression |
| Production build | Passed, 40 pages | Passed, 40 pages | No route/build regression |
| Private cache domains | Partial explicit list | Root-prefix coverage | Federation/metrics/profile/current-user coverage added |
| Client bundle | Route-level values unavailable | Route-level values still unavailable | Asset-level baseline measured; no gain claimed |

## 12. TanStack Query audit

Query-key factories were checked for root prefixes and request-affecting
parameters. Catalog keys retain query, page and page-size values. Game keys
retain game ID and selected version. Workflow, admin, federation, metrics and
profile keys retain their relevant IDs, filters and pagination values.

The observed policy remains deliberately domain-specific:

- Public catalog and game reads use a short stale time where appropriate.
- Private reads generally use `retry: false` at the feature boundary.
- Sensitive mutations are not given automatic mutation retries.
- Public catalog data is not removed during session changes.

No QueryClient-wide invalidation was added.

Marker: `UI8_QUERY_CACHE_GO`

## 13. Query invalidation findings

The cleanup helper now operates on root prefixes rather than a partial list of
leaf keys. This preserves public catalog data while covering authenticated
responses from account, workflow, admin, federation, metrics and profile
features.

Existing feature-level invalidation remains responsible for draft, review,
publication and admin mutations. UI.8 did not rewrite those hooks.

## 14. Private-cache isolation findings

`removeSensitiveQueryData` now removes:

- The `auth` prefix, including current user, tokens and passkeys.
- The `workflow` prefix.
- The `admin` prefix.
- The `federation` prefix.
- The `metrics` prefix.
- The `profile` prefix.

The real QueryClient tests verify that private values disappear while public
catalog values remain. A second test starts a real in-flight metrics query,
removes sensitive data, resolves the underlying promise and verifies that no
private value is present afterward. TanStack Query cancels the removed query;
the test catches that expected cancellation and verifies the cache boundary.

Marker: `UI8_PRIVATE_CACHE_ISOLATION_GO`

## 15. Zustand ownership audit

The inspected stores have bounded UI responsibilities:

- Theme preference and browser persistence.
- Admin selected section.
- Federation selected provider.

No server response data, password, API token, session cookie, passkey secret or
other sensitive identity payload is persisted in Zustand. No new store was
introduced.

Marker: `UI8_ZUSTAND_OWNERSHIP_GO`

## 16. Zod validation audit

The API boundary continues to parse responses through the existing schemas and
client helpers. Coverage includes CSRF, auth, passkey options, setup status and
progress, catalog, metrics, profile, federation, workflow and admin responses.
Opaque WebAuthn option payloads remain intentionally opaque at the adapter
boundary rather than being incorrectly re-modeled by the UI.

Manual local React state remains separate from wire validation. No duplicated
schema system or weakened validation was introduced.

Marker: `UI8_ZOD_BOUNDARIES_GO`

## 17. API transport boundary audit

The existing separation was preserved:

- Same-origin public and operational requests use the existing request helper.
- Auth mutations continue to acquire CSRF and send credentials.
- Admin and workflow calls retain their explicit Fastify proxy paths.
- Dual-origin handling remains in `origin.ts`.
- Existing error parsing and response validation remain in the shared client.

No backend contract, cookie policy, CSRF behavior, proxy path or public API
origin was changed.

Marker: `UI8_API_TRANSPORT_GO`

## 18. Frontend security findings

The inspected frontend continues to use bounded return-path handling, CSRF
helpers for sensitive mutations, credentials-aware fetches, WebAuthn adapter
boundaries and permission-aware workspace rendering. Sensitive secrets are
held in transient form state and are not placed into URLs by the audited
federation mutations.

The concrete UI.8 finding was incomplete private-cache cleanup; it is now
covered by root-prefix removal and regression tests. No unsafe error rendering
or sensitive logging issue was reproduced.

Marker: `UI8_FRONTEND_SECURITY_GO`

## 19. Playwright starting configuration

Before UI.8, Playwright always loaded the historical global setup and teardown,
which created disposable services and removed Docker volumes during teardown.
The default project also contained historical `store.m52g14.test`,
`api.m52g14.test`, `evil.m52g14.test` and `host.docker.internal` resolver rules.

That behavior was unsafe as a default for a portable frontend smoke suite.

## 20. Playwright portability changes

`frontend/playwright.config.mjs` now supports:

- `PRG32_E2E_BASE_URL`, defaulting to `http://127.0.0.1:3100`.
- `PRG32_E2E_WEB_SERVER`, an explicit local server command.
- A default `public-smoke` project that has no global setup, no global teardown,
  no Docker startup and no credentials.
- An opt-in `PRG32_E2E_LEGACY_DISPOSABLE=1` project for the existing historical
  fixture suite. Only that opt-in enables the old global setup/teardown and
  historical host resolver rules.

The default configuration has no mandatory Dream hostname, historical
hostname, personal path or credential. If no server is available, tests fail
clearly against the explicit local base URL; they do not start external
infrastructure.

Marker: `UI8_PLAYWRIGHT_PORTABILITY_GO`

## 21. Public smoke test coverage

Added `frontend/e2e/public-smoke.spec.mjs` with four read-only tests covering:

1. Homepage rendering, primary Explore link, documentation and login page.
2. Explore query parameter preservation without catalog seed data.
3. Missing game behavior or bounded catalog API error presentation.
4. Theme persistence and mobile horizontal-overflow protection.

The suite uses accessible roles and stable visible labels. It does not create
users, log in, submit forms, mutate data or depend on catalog seed records.

Marker: `UI8_PUBLIC_SMOKE_GO`

## 22. Responsive verification

The public smoke suite exercised the desktop project viewport at 1280×900 and
explicitly checked the homepage at 375×800 for horizontal overflow. Theme
persistence was verified across a reload.

The full 768, 1024, 1440 and 1920 width matrix was not executed. No claim is
made for live authenticated responsive acceptance.

Marker: `UI8_RESPONSIVE_GO`

## 23. Critical regression tests

The existing 49 Vitest files passed after the change. The focused cache test
adds coverage for identity cleanup and an in-flight private query. Existing
tests for auth, WebAuthn, return paths, API transports, catalog URL state,
workflow, admin and workspace behavior remained green.

Marker: `UI8_CRITICAL_REGRESSION_GO`

## 24. Legacy frontend cleanup

`frontend/src/components/workflow/DeveloperWorkspace.tsx` was confirmed to be
an unused re-export façade. The workspace route and its ownership test now
import `CreatorWorkspace` directly, and the façade was deleted.

No external interface was removed and no operational rollback artifact was
deleted.

Marker: `UI8_LEGACY_CLEANUP_GO`

## 25. Files changed

Frontend source and test changes:

- `frontend/playwright.config.mjs` — portable default smoke project and opt-in
  legacy disposable project.
- `frontend/e2e/public-smoke.spec.mjs` — four public read-only smoke tests.
- `frontend/src/lib/api/query-keys.ts` — federation and metrics root keys.
- `frontend/src/lib/auth/query-cache.ts` — complete private-prefix cleanup.
- `frontend/src/lib/auth/query-cache.test.ts` — identity and in-flight cache
  regression coverage.
- `frontend/src/app/workspace/page.tsx` — direct `CreatorWorkspace` import.
- `frontend/src/components/workflow/DeveloperWorkspace.test.tsx` — direct
  `CreatorWorkspace` test import.
- `frontend/src/components/workflow/DeveloperWorkspace.tsx` — deleted dead
  façade.
- `docs/modernization/174-frontend-runtime-performance-regression-ui-8.md` —
  this report.

No package manifest or lockfile was changed. The worktree contained unrelated
pre-existing changes from earlier milestones; they were preserved.

## 26. Validation commands/results

All commands below used Node 24 selected through nvm and were run from
`frontend/` unless stated otherwise.

| Command | Result |
| --- | --- |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24` | PASS; selected Node 24 for every frontend command |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run test` | PASS — 49 files, 107 tests |
| `pnpm run build` | PASS — Next.js 16.4.0, 40 generated pages |
| `git diff --check` | PASS after final edits |
| `PRG32_E2E_WEB_SERVER='pnpm exec next start --hostname 127.0.0.1 --port 3100' pnpm run test:e2e` | PASS — 4/4 public smoke tests, Chromium; local server only |
| `PRG32_E2E_WEB_SERVER='HOSTNAME=127.0.0.1 PORT=3100 node .next/standalone/server.js' pnpm run test:e2e` | FAIL — 0/4; raw standalone output lacked copied static/public assets for this direct invocation |

The first Playwright command produced a Next warning that `next start` is not
the preferred launcher for `output: standalone`, but the local full build was
served and all four smoke tests passed. The second command tested the direct
standalone server and failed; its result is retained as a limitation rather
than hidden.

Marker: `UI8_FRONTEND_VALIDATION_GO`

## 27. Blocked or unverified checks

- Route-level First Load JS and per-route bundle attribution were unavailable
  from the current Next.js 16/Turbopack output. Asset-level measurement is
  recorded; no route-size claim is made.
- The full responsive width matrix was not run.
- Live authenticated browser acceptance was not run and was not authorized by
  UI.8.
- The raw `.next/standalone/server.js` smoke launch was not a valid packaged
  runtime because the generated standalone directory did not itself contain
  `.next/static` or `public`. The existing frontend Dockerfiles copy
  `.next/static`; packaging parity for local standalone smoke remains an
  operational follow-up and was not changed in this frontend-only milestone.
- The opt-in historical disposable Playwright suite was not run. Its global
  setup and teardown remain intentionally outside the default path.

## 28. Remaining technical debt

1. Add a non-destructive local standalone smoke harness that stages the exact
   production runtime assets before launching `server.js`.
2. Capture route-level bundle attribution if a supported Next.js output or
   existing build tool exposes it without adding a dependency.
3. Expand public smoke viewport coverage when a stable visual/runtime test
   environment is available.
4. Keep the historical disposable Playwright project isolated until it can be
   retired or replaced by an explicitly authorized synthetic fixture suite.

## 29. Frontend readiness assessment

The Next.js frontend is ready for the next frontend implementation milestone
within the existing backend-freeze boundary. It has a passing typecheck, lint,
unit suite and production build, plus a portable public smoke suite that does
not mutate shared infrastructure.

This assessment does not authorize production deployment, operational
cutover, authenticated live acceptance, Flask retirement or infrastructure
changes.

## 30. Next milestone recommendation

Proceed with the next scoped UI milestone only after deciding whether the
standalone smoke packaging harness should be addressed. Keep public smoke
tests and private-cache regression coverage as mandatory gates. Do not reopen
backend or operational work under UI.8.

## 31. Final decision

- `UI8_RUNTIME_BOUNDARIES_GO`
- `UI8_RENDERING_POLICY_GO`
- `UI8_BUNDLE_BASELINE_GO`
- `UI8_PERFORMANCE_EVIDENCE_GO`
- `UI8_QUERY_CACHE_GO`
- `UI8_PRIVATE_CACHE_ISOLATION_GO`
- `UI8_ZUSTAND_OWNERSHIP_GO`
- `UI8_ZOD_BOUNDARIES_GO`
- `UI8_API_TRANSPORT_GO`
- `UI8_FRONTEND_SECURITY_GO`
- `UI8_PLAYWRIGHT_PORTABILITY_GO`
- `UI8_PUBLIC_SMOKE_GO`
- `UI8_RESPONSIVE_GO`
- `UI8_CRITICAL_REGRESSION_GO`
- `UI8_LEGACY_CLEANUP_GO`
- `UI8_FRONTEND_VALIDATION_GO`
- `UI8_FRONTEND_HARDENING_GO`

The GO applies only to the authorized frontend UI.8 scope. The following remain
unchanged and explicitly not authorized by this milestone:

- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`
