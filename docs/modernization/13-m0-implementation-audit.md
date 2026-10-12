# PRG32 Cartridge Store — M0 implementation audit

Audit date: 2026-10-12

Audit mode: read-only verification. No application code, database, Git history,
dependency manifest, or deployment state was modified by this audit. The only
filesystem change authorized by the audit request is this report.

## 1. Executive summary

The implementation establishes a working Next.js foundation and preserves the
current Flask backend in the repository. The isolated backend suite passes 48
tests, the frontend typecheck/lint/unit-test/build checks pass, and the local
HTTP proxy smoke test reaches Flask successfully. No tracked backend source or
database schema change was found.

The implementation does not fully prove the requested milestone, however. The
contract tests are representative rather than comprehensive, WebSocket
protocol compatibility and Vite/HMR behavior were not independently verified,
and the actual frontend is Next.js App Router rather than the Vite/React Router
stack named in the audit context. This last item is a documented architectural
deviation following the later project-owner direction toward Next.js; it is not
silently treated as Vite compliance.

The frontend dependency audit reports five high-severity findings in the
development ESLint dependency chain, while the production dependency set
reports no findings. The dev Compose profile also contains a fixed fallback
session secret, explicitly intended for local use but unsafe if exposed beyond
that boundary.

Final verdict: **CHANGES REQUIRED**.

This is not a rejection of the foundation. It means the milestone should not
be treated as fully verified or as a production-readiness gate until the
contract, security, dependency, HMR, and WebSocket gaps below are closed.

## 2. Scope and change inventory

### Repository state

- Current branch: `main`.
- `HEAD`: `212e060 Add developer publication token management`.
- No implementation commit range exists to audit; the implementation is
  present as uncommitted tracked changes and untracked files.
- No tracked files are deleted.

### Tracked modified files

- `.dockerignore`
- `.gitignore`
- `Dockerfile`
- `docs/docker.md`

### Untracked implementation files and directories

- `docker-compose.yml` profiles
- `requirements.runtime.txt`
- `frontend/`, including `package.json`, `package-lock.json`, Next.js
  configuration, Dockerfiles, TypeScript source, tests, and generated
  `AGENTS.md`
- `tests/test_api_contracts.py`
- `tests/fixtures/api_contracts.json`
- `docs/modernization/`, including the audit/planning and Phase 1 documents
- `ROUTES_REFERENCE.txt`

`frontend/tsconfig.tsbuildinfo` exists locally but is ignored by Git. No
production data directory or SQLite database is tracked by these changes.

### Configuration and dependency observations

- The frontend manifest uses Next.js 16, React 19, TypeScript 6, Zustand,
  TanStack Query, Tailwind CSS, Vitest, React Testing Library, and ESLint.
- There is no `vite.config.*`, React Router dependency, or Vite script.
- `frontend/next.config.ts` enables standalone output and rewrites HTTP API
  paths to `FLASK_PROXY_TARGET`.
- The Python production image is multi-stage and uses
  `requirements.runtime.txt`; the dev/test requirements remain in
  `requirements.txt`.
- The unified `docker-compose.yml` adds a Traefik-facing `dev` profile with
  `store.prg32.dream.test` and `api.prg32.dream.test`.

The Docker/Traefik and multi-stage image work is additional deployment
infrastructure beyond the original M0 task list. It was requested later in the
conversation, but if the audit boundary is strictly the original M0 approval it
must be tracked as scope expansion rather than counted as M0 evidence.

## 3. Milestone compliance matrix

| Authorized task | Status | Evidence and limitation |
| --- | --- | --- |
| Backend baseline | **PASS** | Isolated Python 3.13 environment; full suite 48 passed; no production data used. |
| API contract freeze | **PARTIAL** | Route inventory, documentation, synthetic fixtures, and representative tests exist. Several required success/error/protocol shapes are not asserted; see Section 4. |
| Frontend infrastructure | **PARTIAL / DEVIATION** | React/TypeScript, Next.js, Zustand, TanStack Query, Tailwind, tests, lint, lockfile, and build exist. Vite and React Router do not. This follows the later Next.js direction but does not satisfy the literal Vite checklist. |
| Frontend boundaries | **PASS for foundation** | App Router bootstrap, providers, API client, error boundary, theme store, styles, and one UI primitive exist. No Flask business logic is duplicated and no storefront feature was added. |
| Local development integration | **PARTIAL** | Flask and Next start; HTTP proxy and API/discovery requests work. HMR was not independently verified, and WebSockets are available only through the direct Flask/API hostname rather than a same-origin Next proxy. |
| Verification checks | **PASS for executed checks** | Pytest, typecheck, ESLint, Vitest, build, syntax compilation, and diff check all passed. HMR and a real WebSocket handshake remain unverified. |
| Documentation | **PARTIAL** | Roadmap, API contract, Docker, and Phase 1 documents exist. Earlier documents still contain stale Vite/“planning only” claims and do not consistently reflect the Next.js decision. |
| Scope control | **PARTIAL** | No application feature or schema rewrite was added. Docker/Traefik and production image work expanded the original M0 surface, though it was later user-requested. |

## 4. Backend regression and contract audit

### Executed results

Command:

```bash
PATH="$PWD/.venv313/bin:$PATH" SECRET_KEY=post-audit-test pytest -q
```

Result: exit status 0, **48 passed in 6.19s**.

Additional checks:

```bash
python3 -m py_compile app.py cartridge_store/*.py
git diff --check
```

Both returned exit status 0.

The tests ran with temporary test data and an ephemeral test secret. No
production database, cartridge store, or deployment process was used.

### Regression assessment

- **Routes:** the Flask route map still contains the catalog, download,
  authentication, publishing, review, statistics, scoreboard, metrics,
  multiplayer, profile, PWA, and admin routes listed in
  `ROUTES_REFERENCE.txt`.
- **Response compatibility:** existing tests and the new representative
  contract tests pass. No backend source or schema migration was introduced.
  This is evidence of no observed regression, not proof of byte-for-byte
  equivalence for every route.
- **Authentication:** existing authentication tests pass and the new tests
  preserve anonymous/protected boundaries. The pre-existing deterministic
  bootstrap admin behavior remains; it was not introduced by this milestone.
- **Publishing and downloads:** isolated publish → verify → catalog →
  architecture download passes for synthetic `esp32c6` and `qemu` bundles.
  The new test checks PRG2 and `PRG32META` markers and attachment disposition,
  but does not compare a canonical SHA-256 fixture.
- **Scores and metrics:** list/anonymous-boundary and metrics
  create/batch/finish/detail/CSV/Markdown route checks pass. The new contract
  test does not verify the successful authenticated score-write response or
  all authorization permutations for exports.
- **WebSocket:** the HTTP multiplayer information/status routes pass and the
  existing suite covers relay service behavior. A real WebSocket handshake and
  join/state/leave exchange through the configured Traefik route were not run.

### Contract coverage gaps

The file `tests/fixtures/api_contracts.json` contains a `required_abis` field,
but `tests/test_api_contracts.py` never asserts that field. The tests also do
not fully assert:

- screenshot response behavior;
- canonical download hashes and all MIME/filename variants;
- successful score submission and its complete response shape;
- token creation/update/revoke and registration flows;
- successful submission listing/detail/reject transitions;
- successful admin user/group/cartridge/backup operations;
- authenticated owner/other-user/admin metrics export matrix;
- WebSocket protocol messages and close/error behavior;
- representative error envelopes for every listed API family.

Finding: **MEDIUM — incomplete contract freeze evidence**. The documentation
is broader than the executable assertions and should not be used as proof of
full compatibility by itself.

## 5. Frontend architecture audit

### Positive findings

- Next.js App Router bootstrap is small and feature-free.
- `QueryClientProvider` owns server-state infrastructure; Zustand owns only
  the theme state.
- The API client defaults to same-origin credentials and normalizes non-2xx
  JSON errors.
- The app has a root layout, provider boundary, error boundary, shared styles,
  and an accessible button test.
- No API persistence, Flask parser, authorization rule, SQLite access, or
  cartridge business logic is duplicated in TypeScript.
- Strict TypeScript, `noUncheckedIndexedAccess`, and `noImplicitOverride` are
  enabled.

### Findings

**MEDIUM — contract types are compile-time only.**

`frontend/src/lib/api/client.ts` casts every successful response to `T` and
every error body to `ApiError` without runtime validation. The current
`contracts.ts` types therefore cannot detect response drift from Flask. This
contradicts the migration documentation’s stated goal of typed contract
boundaries once real feature adapters are added.

**LOW — request header merge order is fragile.**

In `frontend/src/lib/api/client.ts:15-21`, `...init` is spread after the
constructed headers. A caller supplying `init.headers` replaces the default
`Accept: application/json` header rather than merging with it. No current
feature depends on this, but it is an API-client correctness trap.

**MEDIUM — production proxy target is build-sensitive.**

`frontend/next.config.ts:3` defaults to `http://127.0.0.1:5080`. Next rewrites
are materialized during the production build. The production Dockerfile has a
build argument defaulting to `http://flask:5080`, but a manually built image or
different deployment can silently target its own loopback. The build target
must be made a required deployment input or covered by a production-like
integration check.

**INFORMATIONAL — routing choice differs from the audited plan.**

There is no React Router because the implementation uses Next.js App Router.
This is coherent with the later Next.js decision, but the earlier planning
documents and the audit context still describe Vite/React Router.

**INFORMATIONAL — feature surface is intentionally minimal.**

Only `/` and `/_not-found` are generated. This is correct for the authorized
foundation scope and must not be represented as storefront parity.

## 6. Security review

### Positive findings

- No credentials, production tokens, or real user data were found in the new
  frontend fixtures or environment example.
- The production Compose service still requires `SECRET_KEY`; the weak default
  is limited to the dev profile.
- Dev data uses named Docker volumes separate from the existing production
  `data/` bind mount.
- Same-origin credentials are explicit in the API client, and Flask remains the
  authorization authority.
- `npm audit --omit=dev --audit-level=high` returned exit status 0 with
  `found 0 vulnerabilities` for production dependencies.

### Findings

**MEDIUM — fixed development session secret.**

The unified Compose file passes `PRG32_DEV_SECRET_KEY` to the dev Flask
service. The application refuses to start when it is absent. The docs warn
against production reuse, and the value must be generated outside the Compose
file before any shared environment use.

**HIGH — five high npm audit findings in the development toolchain.**

`npm audit --audit-level=high` returned exit status 0 but reported five high
severity `braces`/`micromatch` findings through the `eslint-config-next` chain.
The suggested `npm audit fix --force` would install a breaking older
`eslint-config-next` version and was not run. Production-only dependencies
reported zero findings, but the build/lint supply chain still requires a
deliberate compatible remediation.

**MEDIUM — CSRF strategy is not yet represented in the client boundary.**

The API client sends same-origin cookies but has no CSRF token abstraction. No
frontend mutation feature currently uses it, and Flask remains authoritative,
so this is not evidence of a newly exploitable endpoint. It is a release
blocker before cookie-authenticated publish, review, admin, or token mutations
are implemented in Next.js.

**INFORMATIONAL — broad HTTP rewrite surface.**

The Next config rewrites `/admin`, `/setup`, `/editor`, `/users`, `/static`, and
other backend paths in addition to `/api`. Backend authorization remains in
Flask, so this does not remove protection, but the public store hostname now
forwards the entire listed surface and should be included in proxy/security
tests.

### Pre-existing findings not introduced here

The repository’s deterministic bootstrap administrator credential and the
backend’s previously documented CSRF/security gaps predate this implementation
and remain open risks. This audit does not reclassify them as new frontend
vulnerabilities, but they remain relevant to the next protected workflow
milestone.

## 7. Development environment verification

### Executed

The following local smoke checks ran with temporary Flask data and no
production configuration:

- Flask development server on `127.0.0.1:5080`: started successfully.
- Next.js development server on `127.0.0.1:3000`: started successfully.
- `GET /` through Next: HTTP 200.
- proxied `GET /api/games`: HTTP 200 JSON.
- proxied `GET /.well-known/prg32-store.json`: HTTP 200 JSON.
- direct Flask `GET /api/multiplayer`: HTTP 200 JSON.

### Not verified

- Hot module replacement was not verified because doing so would require
  modifying a source file, which is outside this read-only audit.
- A real WebSocket handshake and message exchange were not verified. The
  current design intentionally uses `wss://api.prg32.dream.test/api/multiplayer`
  rather than a Next same-origin WebSocket proxy.
- No production deployment or live external service was contacted.

### Frontend quality commands

| Command | Exit status | Result |
| --- | ---: | --- |
| `PATH="$PWD/.venv313/bin:$PATH" SECRET_KEY=post-audit-test pytest -q` | 0 | 48 passed in 6.19s |
| `python3 -m py_compile app.py cartridge_store/*.py` | 0 | Passed |
| `git diff --check` | 0 | Passed |
| `npm run typecheck` | 0 | Passed |
| `npm run lint` | 0 | Passed |
| `npm run test` | 0 | 2 files, 3 tests passed; non-failing Vitest ESM warning |
| `npm run build` | 0 | Passed; Next routes `/` and `/_not-found` generated |
| `npm audit --omit=dev --audit-level=high` | 0 | 0 production findings |
| `npm audit --audit-level=high` | 0 | 5 high findings reported in dev chain |

## 8. Documentation verification

### Consistent/current documents

- `docs/modernization/13-api-contracts.md` correctly describes Flask as the
  temporary authority and records Next.js migration rules.
- `docs/modernization/11-implementation-roadmap.md` records the Next.js
  deviation, Docker profile, test evidence, and remaining backend migration.
- `docs/modernization/14-phase1-implementation-report.md` records the actual
  48-test and frontend results and the WebSocket limitation.
- `docs/docker.md` documents the Traefik dev profile and multi-stage images.

### Inconsistencies requiring documentation follow-up

- `docs/modernization/00-executive-summary.md` still describes the document set
  as “planning only” and says no implementation was performed.
- `docs/modernization/00-executive-summary.md` and
  `docs/modernization/08-migration-strategy.md` still present Flask/Python and
  Vite/React Router as the preferred/current plan without clearly linking the
  superseding Next.js decision.
- `docs/modernization/09-testing-strategy.md` still says there is no frontend
  test runner or typecheck, which is false after this implementation.
- The report claims M0 complete, while the contract evidence is representative
  and does not cover all public success/error/protocol shapes listed in the
  contract matrix. That completion claim should be narrowed or backed by the
  missing tests.

Finding: **MEDIUM — documentation status drift**. These contradictions can
mislead the next implementer about the selected framework and the actual test
baseline.

## 9. Required corrective actions

No corrective action was performed during this audit.

### Required before calling M0 fully verified

1. Expand contract tests to cover successful and error envelopes for every
   listed API domain, including token/auth flows, review reject, admin success
   operations, canonical binary hashes, screenshot behavior, export
   authorization, and the required ABI assertions.
2. Add an isolated WebSocket compatibility test covering handshake, join, state,
   leave, authentication, and failure behavior.
3. Resolve the Next.js-versus-Vite decision in the canonical planning documents;
   do not retain contradictory “Vite required” and “Next.js selected” guidance.
4. Replace the dev Compose fallback secret with an explicit or generated
   secret mechanism.
5. Investigate the five high dev dependency findings and upgrade or replace the
   affected lint chain without applying the suggested breaking downgrade blindly.

### Required before protected Next.js workflows

6. Define and test CSRF behavior for cookie-authenticated mutations.
7. Add runtime response validation or equivalent guarded adapters at the API
   boundary.
8. Add production-like verification that the Next rewrite target is correct
   for the deployed service topology.
9. Verify HMR and the actual Traefik WebSocket path in an automated or manual
   repeatable check.

## 10. Final milestone verdict

**CHANGES REQUIRED**

The implementation is healthy enough to continue as a development foundation:
the existing backend suite is green, the Next.js checks are green, and the
HTTP compatibility boundary works locally. It is not yet acceptable to mark the
full milestone as completely verified because contract coverage is incomplete,
WebSocket/HMR requirements are unverified, the literal Vite checklist was
replaced rather than fulfilled, documentation has stale status claims, and the
development toolchain contains five high audit findings. These are concrete,
bounded follow-ups; no production behavior was changed and no rollback action
is required.
