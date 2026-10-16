# PRG32 Cartridge Store — UI.9.3.2 Public Responsive Regression Closure

## 1. Executive summary

UI.9.3.2 is complete with `UI932_PUBLIC_RESPONSIVE_CLOSURE_GO`.

The previously reproducible public `/stats` overflow at `375px/light` was
confirmed in Chromium, traced to grid-item min-content sizing caused by the
existing locally scrollable `min-w-[30rem]` download table, and fixed with the
smallest local correction: `min-w-0` on the two affected statistics grid
items. No backend, database, Docker, infrastructure, authentication, or
routing behavior was changed.

The complete public Playwright project passed `9/9`, including the ten `/stats`
viewport/theme cells, the disposable full-stack project passed `3/3`, the
existing authenticated project passed `6/6`, Vitest passed `49` files and
`108` tests, and the production build passed.

## 2. Scope and safety boundaries

Authorized scope was limited to the public responsive regression and its
frontend verification. The implementation did not modify Fastify, Flask,
SQLite, storage-v2, Dockerfiles, Compose, Traefik, Authentik, DNS/TLS,
operational data, or deployment configuration. No external federation or
cutover activity was performed. No commit or push was performed.

The existing disposable Playwright harness was reused. No shared service,
operational database, real account, or real credential was used.

## 3. Starting baseline

The UI.9.3.1 baseline reported one remaining public failure: the public route
acceptance assertion failed for `/stats` at `375px/light`. The assertion was
the existing document-overflow check in
`frontend/e2e/public-acceptance.spec.mjs`; it was not removed or weakened.

The existing test projects were preserved:

- `public-smoke`
- `fullstack-disposable`
- `authenticated-disposable`

## 4. Original failure reproduction

Node.js 24 was selected with `nvm use 24`. The failure was reproduced in the
existing disposable full-stack runtime with Chromium:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
PRG32_E2E_FULLSTACK=1 \
PRG32_E2E_BASE_URL=http://127.0.0.1:3127 \
PRG32_UI92_BACKEND_PORT=5117 \
PRG32_UI92_FRONTEND_PORT=3127 \
PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' \
pnpm exec playwright test --project=public-smoke \
  -c playwright.config.mjs --grep 'covers primary public routes'
```

Observed before the fix:

| Measurement | Value |
|---|---:|
| Viewport width | `375px` |
| Theme | `light` |
| `document.documentElement.scrollWidth` | `546px` |
| `document.documentElement.clientWidth` | `375px` |
| Result | FAIL |

## 5. Browser environment

The checks used the repository's Playwright Chromium project, Node.js 24,
viewport height `900px`, the existing Next.js standalone harness, and the
existing disposable Fastify fixture. The public route acceptance matrix used
the required widths `375`, `768`, `1024`, `1440`, and `1920` pixels.

## 6. Overflow DOM diagnostics

The pre-fix diagnostic identified these relevant bounds at `375px/light`:

- The score preview table was `544px` wide, but it was already contained by
  its own `overflow-x-auto` wrapper.
- The download activity grid item measured `530px` wide and extended from
  `left=16px` to `right=546px`.
- Its sibling “Most downloaded” grid item received the same propagated width.
- The relevant download table had an intentional `min-width` of `30rem`.
- The browser reported no page-level JavaScript error for this case.

## 7. Root-cause analysis

The mobile grid has one column below the `lg` breakpoint. Its grid items kept
the default automatic minimum size, so the download table's min-content width
was allowed to size the parent grid item beyond the available page gutter.
The local table overflow wrapper therefore could not contain the width at the
grid-item boundary.

This was a CSS layout containment issue, not an API response issue, a theme
issue, or a need to hide document overflow globally.

Decision: `UI932_REPRODUCTION_GO` and `UI932_ROOT_CAUSE_GO`.

## 8. Minimal frontend correction

Modified:

`frontend/src/components/storefront/StatisticsPage.tsx`

Added `min-w-0` to the “Download activity” and “Most downloaded” sections.
The existing table-local `overflow-x-auto` behavior and meaningful table
columns were preserved. No global `html`/`body` clipping was added, and no
dependency was introduced.

Decision: `UI932_STATS_FIX_GO`.

## 9. Light/dark verification

Both themes were exercised by the existing public acceptance test. The page
heading, statistics content, controls, table structure, and semantic color
tokens remained available in both themes. No theme-specific CSS or arbitrary
color was added.

## 10. `/stats` responsive matrix

The targeted public route test executed all ten required cells. Post-fix
measurements were captured from the real browser:

| Width | Light | Dark |
|---:|---|---|
| `375px` | `375/375` | `375/375` |
| `768px` | `768/768` | `768/768` |
| `1024px` | `1024/1024` | `1024/1024` |
| `1440px` | `1440/1440` | `1440/1440` |
| `1920px` | `1920/1920` | `1920/1920` |

Each cell is shown as `scrollWidth/clientWidth`. All ten cells rendered the
Statistics heading and passed the no-horizontal-overflow assertion. The
existing public route check also verified the selected `data-theme` value.

Decision: `UI932_STATS_RESPONSIVE_GO`.

## 11. Public Playwright regression

Command:

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
PRG32_E2E_FULLSTACK=1 \
PRG32_E2E_BASE_URL=http://127.0.0.1:3128 \
PRG32_UI92_BACKEND_PORT=5118 \
PRG32_UI92_FRONTEND_PORT=3128 \
PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' \
pnpm exec playwright test --project=public-smoke -c playwright.config.mjs
```

Result: `9 passed (39.2s)`. This includes the complete public acceptance and
public smoke tests. Decision: `UI932_PUBLIC_REGRESSION_GO`.

## 12. Disposable full-stack regression

Command used the existing disposable Next.js + Fastify harness:

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
PRG32_E2E_FULLSTACK=1 \
PRG32_E2E_BASE_URL=http://127.0.0.1:3129 \
PRG32_UI92_BACKEND_PORT=5119 \
PRG32_UI92_FRONTEND_PORT=3129 \
PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' \
pnpm exec playwright test --project=fullstack-disposable -c playwright.config.mjs
```

Result: `3 passed (30.7s)`. The real Fastify responses and same-origin proxy
path were retained. Decision: `UI932_FULLSTACK_REGRESSION_GO`.

## 13. Authenticated regression

Because the change is confined to the public `StatisticsPage` grid item
layout and does not touch shared authenticated layout primitives, the existing
authenticated regression suite was run without repeating the prior
authenticated 50-cell responsive matrix.

Command:

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
PRG32_E2E_AUTH_DISPOSABLE=1 \
PRG32_UI93_AUTHENTICATED=1 \
PRG32_UI93_BACKEND_URL=http://127.0.0.1:5120 \
PRG32_UI93_TEST_BOOTSTRAP_TOKEN=ui93-disposable-bootstrap-token-2026 \
PRG32_E2E_BASE_URL=http://127.0.0.1:3130 \
PRG32_UI92_BACKEND_PORT=5120 \
PRG32_UI92_FRONTEND_PORT=3130 \
PRG32_E2E_WEB_SERVER='node scripts/serve-fullstack-disposable.mjs' \
pnpm exec playwright test --project=authenticated-disposable \
  -c playwright.config.mjs --grep-invert 'UI.9.3.1'
```

Result: `6 passed (20.9s)`. Decision: `UI932_AUTH_REGRESSION_GO`.

## 14. Accessibility observations

The corrected statistics page retains semantic `h1`/`h2` headings, table
captions, row headers, status messaging, keyboard-focusable links, and local
table scrolling. The existing public keyboard-navigation test passed as part
of the `9/9` public run. No new accessibility defect directly related to this
regression was reproduced. This is not a WCAG certification.

Decision: `UI932_ACCESSIBILITY_GO`.

## 15. Console/network observations

The public acceptance test collected page errors and completed with an empty
page-error list. The full-stack suite exercised real disposable Fastify
responses for catalog, scores, statistics, and profile routes; it passed
`3/3`. No browser mock was introduced for the responsive check and no
authentication or external provider was contacted.

The disposable harness emitted Node build warnings about the existing module
type configuration while starting Next.js. These were harness/process
warnings, not browser page errors, and did not affect the result.

## 16. Test stability considerations

The existing bounded readiness and accessible-selector flow was preserved.
No fixed sleep, tolerance increase, skipped viewport, skipped theme, or
test-only workaround was added. The overflowing table remains scrollable
locally where its tabular width is meaningful.

## 17. Frontend validation

All required frontend checks were run serially with Node.js 24:

| Command | Result |
|---|---|
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS after disposable build cleanup |
| `pnpm run test` | PASS — 49 files, 108 tests |
| `pnpm run build` | PASS — Next.js 16.4.0, 40 generated routes |
| `git diff --check` | PASS |

The first lint invocation scanned harness-generated `.next-ui92` and
`.next-ui93` directories and failed on generated chunks. Those exact
disposable build directories were moved outside the worktree, and lint was
rerun successfully. No source lint issue was found.

Decision: `UI932_FRONTEND_VALIDATION_GO`.

## 18. Files changed

Milestone implementation change:

- `frontend/src/components/storefront/StatisticsPage.tsx` — added `min-w-0`
  to the two statistics grid items.

One temporary diagnostic log was applied to the existing untracked public
acceptance test solely to collect DOM and post-fix measurements, then removed.
No maintained test source was changed by this milestone.

New report:

- `docs/modernization/179-public-responsive-regression-closure-ui-9-3-2.md`

No backend, Docker, Compose, infrastructure, or operational files were
modified for UI.9.3.2.

## 19. Cleanup evidence

The disposable harness terminated its owned Fastify/Next.js processes and
temporary runtime roots after each Playwright run. Harness-generated
`.next-ui92` and `.next-ui93` directories were moved out of the repository
after test execution; neither directory remained in the frontend worktree at
final verification. Existing unrelated worktree artifacts were preserved.

Decision: `UI932_CLEANUP_GO`.

## 20. Remaining frontend acceptance debt

No UI.9.3.2-specific responsive debt remains. The milestone does not claim
hardware WebAuthn compatibility, external federation acceptance, WCAG
certification, operational cutover readiness, or Flask retirement. Those
decisions remain governed by the earlier milestone gates:

- `UI931_AUTH_SECURITY_COMPLETION_GO`
- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 21. Final decision

Decision markers:

- `UI932_REPRODUCTION_GO`
- `UI932_ROOT_CAUSE_GO`
- `UI932_STATS_FIX_GO`
- `UI932_STATS_RESPONSIVE_GO`
- `UI932_PUBLIC_REGRESSION_GO`
- `UI932_FULLSTACK_REGRESSION_GO`
- `UI932_AUTH_REGRESSION_GO`
- `UI932_ACCESSIBILITY_GO`
- `UI932_FRONTEND_VALIDATION_GO`
- `UI932_CLEANUP_GO`

Final: `UI932_PUBLIC_RESPONSIVE_CLOSURE_GO`

The public responsive regression is closed with a minimal frontend-only fix.
Operational cutover and Flask retirement remain explicitly `NO_GO`.
