# PRG32 Cartridge Store — UI.9.2 Disposable Full-Stack Integration Acceptance

Date: 2026-10-16  
Status: `UI92_FULLSTACK_INTEGRATION_GO` for the disposable frontend acceptance scope.  
Operational status remains `OPERATIONAL_CUTOVER_NO_GO` and `FLASK_RETIREMENT_NO_GO`.

## 1. Executive summary

UI.9.2 was implemented as a disposable, read-only integration gate for the existing Next.js frontend and frozen Fastify backend. The acceptance runtime used the existing canonical disposable fixture helper, a real compiled Fastify process, a real Next.js production build, the standalone server, and a real same-origin Next proxy. No browser API routes were mocked in the new full-stack suite.

The full-stack browser suite passed 3/3 tests. Direct HTTP and Zod compatibility verification passed 19 endpoint checks, including an exact SHA-256 and byte-count check for a real `.prg32` download. The pre-existing UI.9.1 public regression suite passed 9/9, although its unchanged public smoke configuration emitted expected `fastify:5090` DNS warnings because no external Compose service was started.

The implementation does not change backend source, backend routes, persistence, Docker, Traefik, Authentik, DNS, TLS, operational data, or production routing.

Required evidence markers:

`M555_BACKEND_FREEZE_GO`  
`UI92_ISOLATION_GO`  
`UI92_RUNTIME_GO`  
`UI92_PROXY_ROUTING_GO`  
`UI92_PUBLIC_CONTRACTS_GO`  
`UI92_EMPTY_CATALOG_GO`  
`UI92_POSITIVE_CATALOG_GO`  
`UI92_GAME_DETAIL_GO`  
`UI92_DOWNLOAD_CONTRACT_GO`  
`UI92_PUBLIC_DATA_GO`  
`UI92_ERROR_ENVELOPES_GO`  
`UI92_ZOD_COMPATIBILITY_GO`  
`UI92_ANONYMOUS_AUTH_GO`  
`UI92_BROWSER_INTEGRATION_GO`  
`UI92_PUBLIC_REGRESSION_GO`  
`UI92_CLEANUP_GO`  
`UI92_FRONTEND_VALIDATION_GO`

## 2. Scope and safety boundaries

The authorized scope was limited to disposable frontend/full-stack acceptance. The backend implementation remained frozen. No real login, OIDC, SAML, session, write, publish, upload, administrative, WebSocket-authenticated, or operational database flow was exercised.

No Docker service was started, stopped, rebuilt, or reconfigured. No shared Dream infrastructure was contacted or modified. The existing dirty worktree was preserved; no reset, cleanup of unrelated files, commit, or push was performed.

## 3. Starting frontend baseline

The UI.9.1 baseline was retained: 49 Vitest files, 107 Vitest tests, 9 public Playwright tests, and 40 generated Next routes/pages. UI.9.2 adds only the disposable full-stack harness, direct contract runner, dedicated browser suite, and the isolated standalone-build path needed for the acceptance.

## 4. Existing harness inventory

The harness reuses `backend/src/storage-v2/differential/harness.ts` through its compiled output. `createDisposableCanonicalReadFixture()` supplies synthetic canonical SQLite/storage-v2 data with:

- `org.example.alpha` / `Alpha Cartridge`.
- `org.example.beta` / `Beta Media`.
- Published version `2.0.0` for the alpha fixture.
- `esp32c6` and `qemu` architecture variants.
- Synthetic score, run/statistics, download-event, account, and profile data.
- Real filesystem cartridge/media objects and a canonical SQLite database.

The helper is not replaced or duplicated. The fixture is disposable and is never pointed at the operational store.

## 5. Runtime architecture

The full-stack process is `frontend/scripts/serve-fullstack-disposable.mjs`. It:

1. Creates a harness-owned temporary runtime root.
2. Sets `TMPDIR` before importing the compiled fixture helper.
3. Builds the frozen Fastify backend before the acceptance run.
4. Starts Fastify on loopback `127.0.0.1:5092`.
5. Verifies `/ready` before continuing.
6. Runs direct HTTP/Zod contract checks against Fastify.
7. Builds Next into isolated `.next-ui92` with `PRG32_API_UPSTREAM=http://127.0.0.1:5092`.
8. Starts the existing standalone server on `127.0.0.1:3103`.
9. Runs browser tests against the Next origin only.
10. Terminates only the owned child processes and removes owned temporary output.

## 6. Disposable isolation proof

The harness rejects an occupied explicitly requested port instead of attaching to an existing service. It validates that both fixture roots are descendants of the harness temporary root. The evidence run recorded a disposable canonical snapshot and no host absolute path in the generated evidence.

The expected alpha/qemu download was verified as 936 bytes with SHA-256 `86f9d74b89aad947b2bddf0d3594e39c23ebdc766d11132ed5a6d928078f336e`. This is synthetic fixture evidence, not a production artifact.

`UI92_ISOLATION_GO`

## 7. Temporary filesystem layout

The runtime uses a process-created temporary root under the host temporary directory. Relative fixture evidence identified:

- `prg32-m52d-source-6lxPZi` — disposable source/canonical-read database and source storage.
- `prg32-m52g1-http-SyVqiy/canonical` — disposable canonical storage-v2 target.

The isolated Next output `.next-ui92` is created only by the harness and removed after the run. The standalone runner stages its server, static assets, and public assets into its own temporary directory. No operational volume or repository storage root is used.

## 8. Runtime configuration

The disposable backend was configured with loopback binding, `NODE_ENV=test`, canonical disposable read mode, `PRG32_BACKEND_MDNS_ENABLED=false`, non-secure disposable sessions, and the fixture-specific database/storage paths. No frontend public-origin override was supplied because the frozen backend correctly rejects non-HTTPS trusted origins; this avoided weakening its configuration rules.

The Next build received only the loopback upstream URL. Runtime browser requests remained same-origin requests to the Next process.

## 9. Build-time/runtime proxy analysis

The Next build-time proxy target was `http://127.0.0.1:5092`. The browser never received that upstream origin. The browser suite collected API request URLs and asserted that every observed `/api/` request had the same origin as the page (`http://127.0.0.1:3103`).

This proves the disposable local pattern: browser → Next same-origin API path → Fastify loopback upstream. No public Dream hostname or external proxy was involved.

`UI92_RUNTIME_GO`  
`UI92_PROXY_ROUTING_GO`

## 10. Process lifecycle and cleanup

The harness owns the Fastify and standalone child processes. It fails when either requested loopback port is occupied. On normal completion or failure it sends termination only to those children, removes the generated `.next-ui92` tree, and removes the harness runtime root. Temporary evidence was written with mode `0600`, read for the report, and removed afterward.

Post-run checks found no listener on ports 5092 or 3103. The standalone runner also stages files into a temporary root rather than serving directly from the repository build directory.

`UI92_CLEANUP_GO`

## 11. API contract inventory

The direct contract runner `frontend/scripts/ui92-contract.mjs` exercised 19 request cases and parsed ten response families using the frontend’s actual Zod schemas:

| Area | Evidence |
| --- | --- |
| Readiness | `GET /ready` → 200, `{ ok: true }` |
| Catalog | Full list, search, pagination, and empty search |
| Detail | Alpha version `2.0.0`, both architectures |
| Score data | `/api/scores?limit=20` and score statistics |
| Download data | Download statistics and exact binary response |
| Metrics data | Run statistics and public profile |
| Error envelopes | Unknown game/version/architecture, unknown profile/run |
| Anonymous boundary | `/api/auth/me` → 401; private profile runs → 403 |

`UI92_PUBLIC_CONTRACTS_GO`  
`UI92_ZOD_COMPATIBILITY_GO`

## 12. Empty catalog acceptance

The acceptance uses the real query `GET /api/games?q=does-not-exist`, which returned a valid empty list, `total: 0`, and `pages: 1`. The browser rendered `No cartridges match this search.` and `0 cartridges found`.

This is an empty filtered result, not an independently seeded zero-row whole-catalog database. The distinction is intentional and recorded rather than overstated.

`UI92_EMPTY_CATALOG_GO`

## 13. Positive catalog acceptance

The browser rendered both real fixture cartridges from the canonical Fastify response. Search for `alpha` retained Alpha and excluded Beta. The architecture filter retained Alpha for `esp32c6` and excluded Beta. The direct contract runner verified the canonical identifiers and pagination values.

`UI92_POSITIVE_CATALOG_GO`

## 14. Game detail acceptance

The browser loaded `/games/org.example.alpha?version=2.0.0`, displayed `Alpha Cartridge`, displayed both available targets, and changed the real Radix-style architecture control to `qemu`. The test then observed the qemu-specific download link generated by the frontend.

An unknown game follows the frozen backend’s current 400 error contract and therefore renders the bounded catalog error state. The frontend’s separate `DetailMissing` component remains covered by existing component tests; UI.9.2 does not reinterpret the backend’s 400 as a 404.

`UI92_GAME_DETAIL_GO`

## 15. Download contract acceptance

The direct Fastify request to `/api/games/org.example.alpha/download?version=2.0.0&architecture=qemu` returned:

- HTTP 200.
- `content-type: application/vnd.prg32.cartridge`.
- Attachment filename `org.example.alpha-2.0.0-qemu.prg32`.
- 936 bytes.
- PRG2 signature.
- SHA-256 matching the independently read canonical SQLite object metadata and the downloaded bytes.

The browser test also verified the exact qemu link after selecting qemu in the UI. It did not trigger a write or count mutation through the browser.

`UI92_DOWNLOAD_CONTRACT_GO`

## 16. Scores/statistics acceptance

The direct contract runner verified the real fixture score, download total `3`, score-statistics length `1`, and run-statistics total `1`. The browser rendered the score page and statistics page, including the Alpha download data and metrics-run summary.

`UI92_PUBLIC_DATA_GO`

## 17. Public profile/run acceptance

The public fixture profile `/api/users/fixture-user` returned successfully and rendered in Next. The canonical migrated fixture reports `run_count: 0` for this profile because its synthetic run is intentionally not associated with a user ID. Anonymous access to `/api/users/fixture-user/runs` returned 403, while an unknown run returned 404.

This preserves the actual compatibility behavior rather than inventing an owner association in the acceptance fixture.

## 18. Error envelope acceptance

The direct suite verified stable `{ ok: false, error, code }`-compatible responses for:

- Unknown game → 400.
- Unknown version → 400.
- Unsupported download architecture → 400.
- Anonymous authentication → 401.
- Anonymous private profile runs → 403.
- Unknown run → 404.
- Unknown profile → 404.

The serialized error bodies did not contain `sqlite` or filesystem diagnostics. The browser asserted bounded user-facing states for missing/error paths.

`UI92_ERROR_ENVELOPES_GO`

## 19. Anonymous auth boundary

No login, registration, OIDC, SAML, WebAuthn, cookie creation, or authenticated browser session was started. The only authentication observation was the real anonymous `GET /api/auth/me` 401 response and the anonymous private-run 403 response.

`UI92_ANONYMOUS_AUTH_GO`

## 20. CSRF/cookie observations

No state-changing method was sent. Consequently, this milestone does not re-verify CSRF enforcement or authenticated cookie continuity. The backend’s frozen security contract remains outside this read-only acceptance gate.

## 21. Zod contract compatibility

The direct runner imported the frontend’s actual TypeScript schema module using Node 24’s type stripping and parsed live Fastify responses. This avoided maintaining a second schema copy. Ten schema families were exercised, including success and error envelopes.

The only Node warning was the existing package metadata warning produced when importing a TypeScript schema directly as an executable test dependency; it did not alter the result and no dependency was added to suppress it.

`UI92_ZOD_COMPATIBILITY_GO`

## 22. Browser integration tests

`frontend/e2e/fullstack-disposable.spec.mjs` contains three browser tests:

1. Real catalog, search, architecture selection, detail, qemu download link, scores, statistics, profile, and page-error checks.
2. Real empty search, unknown-game error, invalid-version error, and unknown-profile error states.
3. Same-origin proxy inspection plus 375px and 1440px responsive overflow checks.

Result: **3 passed, 0 failed**. The suite contains no `page.route`, response interception, fixture API mocking, external login, or write operation.

`UI92_BROWSER_INTEGRATION_GO`

## 23. Public UI.9.1 regression

Command:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
PRG32_E2E_BASE_URL=http://127.0.0.1:3101 \
PRG32_E2E_WEB_SERVER='PRG32_STANDALONE_PORT=3101 node scripts/serve-standalone.mjs' \
pnpm run test:e2e
```

Result: **9 passed, 0 failed**. The unchanged UI.9.1 public tests include their own route-level fixture/mocking behavior for positive public cases. Outside Compose, the standalone server logged `getaddrinfo ENOTFOUND fastify` for the configured default upstream; the tests intentionally accept bounded API-error states where applicable. This run is a regression result, not evidence that the unavailable `fastify` hostname is a valid local upstream.

`UI92_PUBLIC_REGRESSION_GO`

## 24. Responsive regression

The new full-stack suite checked 375px and 1440px viewports on real data and asserted that document width did not exceed viewport width. Both checks passed. The UI.9.1 public suite also completed without failures.

## 25. Console/network findings

The full-stack positive browser test collected page errors and finished with an empty page-error list. Network inspection confirmed that browser API requests remained on the Next origin. No request was made to `api.prg32.dream.test`, `store.prg32.dream.test`, `sso.dream.test`, or any external provider.

The only observed logs were non-failing Node package metadata warnings during the direct TypeScript schema import and the expected unavailable-`fastify` proxy warnings in the separate UI.9.1 regression run.

## 26. Frontend defects found/fixed

The disposable standalone runner exposed one real harness defect: with an isolated Next `distDir` of `.next-ui92`, Next’s standalone server expects static assets under the same custom dist directory. The runner had copied them to a hard-coded `.next/static` path, causing CSS preflight failure. `serve-standalone.mjs` now stages static assets to `runtimeRoot/<distDir>/static`, preserving the default `.next` behavior and supporting isolated builds.

The new browser assertions were aligned with the existing UI controls and frozen API contract: architecture selection uses the existing Radix-style combobox, and unknown games are accepted as the backend’s documented 400 bounded catalog error.

## 27. Backend discrepancies deferred

No backend discrepancies were changed. The following are recorded for future work only:

- A fresh whole-catalog zero-row database was not needed because the real empty filtered-result contract is covered.
- The fixture profile’s `run_count: 0` is preserved because the synthetic run has no owner association.
- Unknown game currently returns 400 in this canonical read mode, so the frontend renders the bounded catalog error instead of the 404 missing component.
- The separate UI.9.1 public regression assumes the existing `fastify:5090` development topology when its route-level fixtures are not intercepting the request.

## 28. Validation commands/results

All commands below used Node.js 24 via `nvm use 24` unless noted.

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run build` | PASS — frozen backend compiled |
| Disposable direct HTTP/Zod contracts | PASS — 19 endpoint cases, 10 schema families, 7 error cases |
| Disposable full-stack Playwright | PASS — 3/3 tests |
| UI.9.1 public Playwright regression | PASS — 9/9 tests, with documented unavailable-upstream warnings |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run test` | PASS — 49 files, 107 tests |
| `pnpm run build` | PASS — Next.js 16.4.0, 40 routes/pages generated |
| `git diff --check` | PASS |
| Port/process cleanup check | PASS — no owned listener remained on 5092/3103 |
| Docker/Compose | NOT RUN — explicitly outside this frontend acceptance scope |
| Real Dream/AuthentiK/public-domain checks | NOT RUN — prohibited by this scope |

## 29. Files changed

UI.9.2 added or modified only the following relevant files:

- `frontend/scripts/serve-standalone.mjs` — isolated dist-directory asset staging fix.
- `frontend/scripts/serve-fullstack-disposable.mjs` — disposable Fastify + Next lifecycle harness.
- `frontend/scripts/ui92-contract.mjs` — direct HTTP/Zod contract runner.
- `frontend/e2e/fullstack-disposable.spec.mjs` — no-mock browser integration suite.
- `frontend/playwright.config.mjs` — opt-in `fullstack-disposable` project.
- `docs/modernization/176-disposable-fullstack-integration-ui-9-2.md` — this report.

The repository already contained extensive unrelated dirty/untracked work from earlier milestones. It was not reset, cleaned, staged, committed, or pushed.

## 30. Blocked/unverified checks

The following remain intentionally unverified:

- Operational Docker Compose and external Traefik behavior.
- `store.prg32.dream.test` and `api.prg32.dream.test` public routing.
- `sso.dream.test` Authentik federation and real credentials.
- TLS/DNS/certificate behavior.
- Real authenticated browser workflows.
- WebSocket connectivity through external infrastructure.
- Production image/deployment behavior.
- Writes, publishing, review, metrics ingestion, administration, and backup operations.

These are not failures of the disposable UI.9.2 gate; they are outside its authorization and remain cutover blockers.

## 31. UI.9.3 prerequisites

Before the next frontend milestone, keep the following gates explicit:

1. Decide whether the public E2E suite should continue using route-level fixtures or gain a dedicated disposable backend fixture path.
2. Provide a disposable Compose or process topology that resolves the configured `fastify` upstream without touching shared infrastructure.
3. Keep real authentication acceptance separate from the read-only anonymous gate.
4. Preserve the Next same-origin proxy and the custom standalone asset staging behavior.
5. Add any authenticated/write workflow only with separate disposable credentials and isolated databases.
6. Re-run the frozen backend compatibility suite when changing frontend API adapters or route handling.

## 32. Final decision

`UI92_FULLSTACK_INTEGRATION_GO`: the authorized disposable Next.js + Fastify read-only integration acceptance is complete and evidenced by direct contracts, exact binary verification, a real proxy path, and 3/3 browser tests.

`OPERATIONAL_CUTOVER_NO_GO`: no operational routing, infrastructure, authentication, deployment, or data acceptance was performed.

`FLASK_RETIREMENT_NO_GO`: this milestone does not authorize Flask retirement or backend ownership changes.

No commit or push was performed.
