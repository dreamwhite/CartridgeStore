# PRG32 Cartridge Store — UI.9.1 Public Experience Acceptance

Date: 2026-10-16

## 1. Executive result

UI.9.1 is complete for the authorized frontend-only scope. The public Next.js
experience was exercised in Chromium against a locally staged standalone
runtime, with the required route, viewport, theme, navigation, error-state and
public-data coverage.

The acceptance suite passed 9/9 tests: five new UI.9.1 acceptance tests and
the four existing public smoke tests. The production build, TypeScript
check, ESLint and Vitest suite also passed.

`UI91_PUBLIC_ACCEPTANCE_GO`

This is not an operational cutover decision. `M555_BACKEND_FREEZE_GO`,
`OPERATIONAL_CUTOVER_NO_GO` and `FLASK_RETIREMENT_NO_GO` remain unchanged.

## 2. Scope and safety boundaries

Only frontend test infrastructure, a disposable standalone runner and the new
UI.9.1 acceptance suite were changed. No backend, Flask, Fastify, SQLite,
Dockerfile, Compose, authentication provider, Traefik, Mailpit, DNS, TLS,
operational account, real session, `../PRG32` file or deployment was changed.

No credentials, tokens, real users, real authentication flows, publishing
mutations or administrative mutations were used. No dependency or lockfile
change was made. No commit or push was performed.

## 3. Baseline and environment

The checks used Node 24 selected with:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
```

Observed frontend versions remain those established by UI.8: Next.js 16.4.0,
React 19.3.0, Playwright 1.64.0, Vitest 5.0.3 and pnpm 12.5.1. The package
engine remains Node `>=24.0.0 <25`.

## 4. Public route inventory

The tested public route set was:

- `/`
- `/explore`
- `/login`
- `/register`
- `/register/complete`
- `/forgot-password`
- `/password-reset`
- `/docs`
- `/docs/getting-started`
- `/scores`
- `/stats`

Dynamic public surfaces were additionally exercised through synthetic
read-only fixtures at `/games/[gameId]` and `/users/[username]`. A missing
documentation slug was checked as a bounded not-found state.

Private and operational surfaces such as `/account`, `/admin`, `/publish`,
`/review`, `/workspace`, `/runs`, `/setup` and auth route handlers were not
treated as public acceptance targets.

`UI91_PUBLIC_ROUTES_GO`

## 5. Rendering and public route matrix

The primary browser matrix covered 11 routes × five viewport widths × two
themes:

| Viewport | Theme |
| ---: | --- |
| 375px | light, dark |
| 768px | light, dark |
| 1024px | light, dark |
| 1440px | light, dark |
| 1920px | light, dark |

That represents 110 route visits. Each visit verified an HTTP response below
500, the expected accessible heading, the requested `data-theme` value and no
horizontal document overflow. The matrix collected browser `pageerror`
events and completed with none.

`UI91_RESPONSIVE_MATRIX_GO`

## 6. Homepage acceptance

The homepage was verified through the browser route matrix and by visual
inspection after the standalone runtime settled. The inspected page presents:

- PRG32 Cartridge Store identity and primary navigation.
- “Build cartridges. Learn the machine.” hero content.
- Explore and documentation calls to action.
- The system-map visual panel.
- The project introduction section.

The required public entry point is usable at desktop and mobile widths, and
the standalone runtime serves its static assets correctly.

`UI91_HOMEPAGE_GO`

## 7. Explore acceptance

Explore was verified with the live standalone page and isolated Playwright
fixtures. The fixture path checks:

- catalog card rendering;
- search-capable Explore surface;
- architecture filtering for `esp32c6`;
- removal of the non-matching QEMU card;
- pagination URL preservation and the empty second page state.

The fixture data is synthetic and is intercepted only inside the browser test.
It is not written to the application, database or shared infrastructure.

`UI91_EXPLORE_GO`

## 8. Game detail acceptance

The dynamic game detail route was exercised with a synthetic read-only catalog
response. The test verified the cartridge title and the architecture-specific
download link, including its `architecture=qemu` selection.

No binary was downloaded and no download telemetry was generated.

`UI91_GAME_DETAIL_GO`

## 9. Authentication entry acceptance

The public authentication entry routes `/login`, `/register`,
`/register/complete`, `/forgot-password` and `/password-reset` were included
in the route matrix. The test also verified the forgot-password identifier
field's accessible label, `autocomplete="username"` contract and keyboard
focus behavior.

No login, registration, password reset, passkey or federation flow was
started. Authentication provider behavior is therefore outside this
milestone's evidence.

`UI91_AUTH_ENTRY_GO`

## 10. Documentation acceptance

`/docs` and `/docs/getting-started` were verified in the route matrix. A
synthetic missing documentation slug was also checked and rendered the bounded
`Cartridge not found` fallback rather than an exception or raw error.

`UI91_DOCUMENTATION_GO`

## 11. Public data acceptance

The positive fixture test intercepted only documented read-only public API
requests for:

- `/api/games` and a game detail response;
- `/api/scores`;
- `/api/stats/downloads`;
- `/api/stats/scores`;
- `/api/stats/runs`;
- `/api/users/ui91-public-profile`.

The browser verified catalog, detail, scoreboard, statistics and public
profile content. The fixture payloads contain no production identities or
credentials.

`UI91_PUBLIC_DATA_ROUTES_GO`

## 12. Missing and error-state acceptance

The browser exercised missing/error states for a game, a public profile and a
documentation slug. Each rendered a bounded user-facing message. No raw
exception text was asserted or exposed by the frontend acceptance test.

The standalone runtime was intentionally started without Fastify. As a
result, Next's configured rewrite target `fastify:5090` logged expected
`ENOTFOUND` proxy diagnostics for un-intercepted API requests. These are an
environment limitation, not a failed frontend assertion; the public route
matrix and smoke suite passed against that condition.

## 13. Navigation acceptance

The navigation test verified:

- desktop primary navigation visibility at 1280px;
- keyboard focus on the Explore CTA;
- Explore navigation by keyboard/click;
- mobile menu opening at 375px;
- mobile Search navigation to `/explore#catalog-search`;
- menu closure after navigation;
- keyboard focus on the forgot-password identifier field.

`UI91_NAVIGATION_GO`

## 14. Theme acceptance

The route matrix selected both light and dark themes and checked the resulting
root `data-theme` value on every route visit. The existing smoke suite also
verified persistence of the selected theme and the theme toggle behavior.

`UI91_THEME_GO`

## 15. Responsive acceptance

The required widths 375, 768, 1024, 1440 and 1920 were tested in Chromium.
The mobile navigation path was separately exercised at 375px, and the smoke
suite verified the absence of mobile horizontal overflow.

No claim is made about every device/browser combination; this is the defined
Chromium acceptance baseline.

## 16. Accessibility baseline

The acceptance baseline covered semantic headings, named navigation regions,
accessible link/button names, labelled form input, keyboard focus and mobile
navigation controls. The test suite did not install or run a full WCAG/axe
auditor, so this is a functional accessibility baseline rather than a WCAG
conformance certification.

`UI91_ACCESSIBILITY_BASELINE_GO`

## 17. Visual acceptance method

Visual inspection was performed on screenshots produced from the staged
standalone runtime after a 2.5-second settling period:

- desktop homepage at 1280×900 in the default dark theme;
- mobile Explore at 375×900 in the default dark theme.

The inspected views showed the intended navigation, typography, contrast,
purple accent system, system-map/card treatment and responsive mobile header.
The visual result is recorded as an inspected baseline, not as a pixel-perfect
snapshot comparison.

`UI91_VISUAL_ACCEPTANCE_GO`

## 18. Standalone packaging

The new `frontend/scripts/serve-standalone.mjs` runner performs a disposable
packaging parity check. It:

1. requires `.next/standalone` and `.next/static` from a successful build;
2. copies the standalone server into a temporary directory;
3. copies `.next/static` beside the server;
4. copies `public` if the project contains it;
5. binds only to `127.0.0.1`;
6. preflights the homepage, a CSS asset, a JavaScript asset,
   `/manifest.webmanifest` and `/static/icon-192.svg`;
7. removes only its own temporary staging directory on shutdown.

The manual preflight completed successfully at
`http://127.0.0.1:3101`. The repository currently has no `frontend/public`
directory, so the conditional public copy was not exercised. The inspected
`frontend/Dockerfile` uses the same Node 24 standalone/static layout; it was
not modified.

`UI91_STANDALONE_PACKAGING_GO`

## 19. Playwright suite

The public Playwright project remains portable and does not automatically
start Docker or the historical disposable environment. It accepts an explicit
`PRG32_E2E_BASE_URL` and optional `PRG32_E2E_WEB_SERVER` command. The default
project now includes both `public-smoke.spec.mjs` and
`public-acceptance.spec.mjs`.

The full public suite passed:

```text
9 passed (24.2s)
```

This is composed of five UI.9.1 acceptance tests and four pre-existing public
smoke tests.

`UI91_PLAYWRIGHT_REGRESSION_GO`

## 20. Live versus synthetic evidence

The evidence is intentionally split:

| Evidence class | Runtime/data | Result |
| --- | --- | --- |
| Live browser | Local staged Next standalone runtime, no Fastify | Public routes and UI shell pass; expected API proxy `ENOTFOUND` logs |
| Synthetic browser | Playwright route interception with disposable JSON fixtures | Positive catalog/detail/scores/stats/profile workflows pass |
| Real authentication | Not started | Not part of UI.9.1 authorization |
| Operational infrastructure | Not changed or contacted | Not part of UI.9.1 authorization |

Synthetic fixtures validate frontend rendering and interaction contracts; they
do not prove production backend availability or data correctness.

## 21. Error and console observation

The route matrix observed no uncaught browser `pageerror` events. Static asset
delivery succeeded in the standalone preflight. Server-side logs contained
only the expected failed rewrites to the intentionally absent `fastify:5090`
target during un-intercepted data requests.

The absence of browser `pageerror` events does not replace backend health or
production observability checks.

## 22. API fixture isolation

Fixture interception is scoped to individual Playwright pages and uses stable
synthetic IDs such as `org.example.ui91` and `ui91-public-profile`. No fixture
is persisted, uploaded, published, or sent to the backend. The tests do not
modify a database, filesystem store, browser account or shared service.

## 23. Frontend implementation changes

Files added:

- `frontend/e2e/public-acceptance.spec.mjs`
- `frontend/scripts/serve-standalone.mjs`
- this report

File modified:

- `frontend/playwright.config.mjs`: portable public project matching and
  explicit standalone web-server configuration, while retaining the legacy
  disposable project as an opt-in path.

No application source component was changed for UI.9.1. No dependency,
lockfile, Dockerfile or Compose file was changed.

## 24. Validation commands

Commands executed with Node 24 selected:

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
PRG32_E2E_BASE_URL=http://127.0.0.1:3101 \
PRG32_E2E_WEB_SERVER='PRG32_STANDALONE_PORT=3101 node scripts/serve-standalone.mjs' \
pnpm run test:e2e
git diff --check
```

The standalone runner was also started manually and its HTTP/static preflight
was observed successfully. Screenshots were generated and visually inspected
from that runtime.

## 25. Validation results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `tsc --noEmit` |
| ESLint | PASS | `eslint .` |
| Vitest | PASS | 49 files, 107 tests |
| Next production build | PASS | 40 generated pages |
| Standalone packaging preflight | PASS | loopback runtime, HTML/CSS/JS/PWA assets |
| UI.9.1 Playwright acceptance | PASS | 5/5 tests |
| Existing public smoke tests | PASS | 4/4 tests |
| Full public Playwright suite | PASS | 9/9 tests, 24.2s |
| `git diff --check` | PASS | no whitespace errors |

## 26. Known limitations

- Fastify was not started for this frontend-only acceptance; live production
  API availability is not proven here.
- Real Authentik OIDC/SAML, login, registration, passkeys and session
  continuity were intentionally not exercised.
- The public positive data workflows use isolated browser fixtures rather than
  production data.
- Visual inspection is manual and does not provide pixel-diff regression
  thresholds.
- Accessibility coverage is a semantic/keyboard baseline, not a WCAG audit.
- The standalone runner conditionally copies `public`, but this repository has
  no `frontend/public` directory at present.
- The Playwright run emits expected noisy rewrite diagnostics while the
  Fastify target is absent; this should be reduced or captured explicitly when
  a disposable two-service runtime is used.

## 27. Remaining risks

The principal remaining public-experience risks are integration risks:

- backend payload drift between the synthetic fixtures and deployed Fastify;
- public API latency, availability and error-envelope behavior;
- external reverse-proxy and TLS behavior;
- real identity-provider redirects and session lifecycle;
- browser coverage beyond Chromium;
- production data volume and image/media edge cases.

These risks are not silently converted into frontend acceptance passes.

## 28. Deviations from the brief

The acceptance test was run against a loopback standalone runtime rather than
the operational `store.prg32.dream.test` origin. This was required to remain
within the no-deployment/no-real-auth/no-shared-infrastructure boundary. The
backend-dependent positive cases therefore use explicitly labelled synthetic
fixtures.

No extra dependency, visual regression service, accessibility package or
production configuration was introduced.

## 29. Previous milestone relationship

UI.9.1 builds on UI.8's portable Playwright baseline and uses the same
frontend package/runtime assumptions. It does not retroactively change UI.8
results and does not claim that UI.8 tested standalone packaging; UI.9.1 adds
the staging runner and verifies the packaged runtime.

## 30. Acceptance markers

| Marker | Status |
| --- | --- |
| `UI91_PUBLIC_ROUTES_GO` | GO |
| `UI91_HOMEPAGE_GO` | GO |
| `UI91_EXPLORE_GO` | GO |
| `UI91_GAME_DETAIL_GO` | GO |
| `UI91_AUTH_ENTRY_GO` | GO for public entry rendering only |
| `UI91_DOCUMENTATION_GO` | GO |
| `UI91_PUBLIC_DATA_ROUTES_GO` | GO with synthetic fixtures |
| `UI91_NAVIGATION_GO` | GO |
| `UI91_THEME_GO` | GO |
| `UI91_RESPONSIVE_MATRIX_GO` | GO |
| `UI91_VISUAL_ACCEPTANCE_GO` | GO |
| `UI91_ACCESSIBILITY_BASELINE_GO` | GO |
| `UI91_STANDALONE_PACKAGING_GO` | GO |
| `UI91_PLAYWRIGHT_REGRESSION_GO` | GO |
| `UI91_FRONTEND_VALIDATION_GO` | GO |

## 31. Next milestone recommendation

The next milestone should be a controlled integration acceptance against a
disposable two-service runtime: Next.js standalone plus Fastify, with no real
identity provider or operational data. It should replace the synthetic public
API interceptions with disposable backend fixtures, measure response/error
contracts, and retain the same public browser matrix. Real Authentik and
operational cutover remain separate authorization gates.

## 32. Final decision

`UI91_PUBLIC_ACCEPTANCE_GO`

The authorized UI.9.1 public acceptance criteria are satisfied. This report
does not authorize deployment, public routing changes, authentication changes,
operational data migration, Flask retirement or any later milestone.

