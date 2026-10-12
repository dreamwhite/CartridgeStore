# Implementation roadmap

This roadmap is intentionally actionable and dependency-aware. It is a plan, not an authorization to implement.

## Goal model

### G1 — Preserve compatibility

**Outcome:** every existing firmware/tool/browser contract remains available.

**Evidence:** route/response fixture inventory, binary hash tests, discovery ABI tests, and green backend suite.

**Dependencies:** none.

**Completion:** no legacy route is removed; changed responses retain old fields; firmware-facing constants remain unchanged.

**Verification:** contract tests and existing `tests/` suite.

### G2 — Establish a safe baseline

**Outcome:** authentication, uploads, exports, backups, and session behavior have explicit security controls.

**Evidence:** security test matrix and reviewed deployment policy.

**Dependencies:** G1.

**Completion:** SEC-01 through SEC-06 have accepted remediations or documented exceptions.

**Verification:** isolated adversarial tests and backup/restore rehearsal.

### G3 — Deliver a typed frontend foundation

**Outcome:** React/TypeScript can be developed and shipped without altering backend behavior.

**Evidence:** reproducible install, build, typecheck, unit test, accessibility smoke test.

**Dependencies:** G1.

**Completion:** shell, tokens, router, API client, query provider, client store, and CI checks exist.

**Verification:** clean checkout build and browser preview.

### G4 — Reach read-only parity

**Outcome:** catalog/detail/search/version/architecture/download experiences are modernized.

**Evidence:** fixture equivalence and download byte/hash checks.

**Dependencies:** G3.

**Completion:** anonymous storefront/detail flows pass on mobile and desktop; unsupported product concepts are absent.

**Verification:** Playwright and contract suite.

### G5 — Reach protected workflow parity

**Outcome:** auth, tokens, publishing, review, and admin flows are usable in React while Flask remains authoritative.

**Evidence:** role/auth matrix, upload/review fixture, CSRF and token secrecy tests.

**Dependencies:** G2, G4.

**Completion:** local auth, Bearer auth, editor/admin boundaries, pending/verified/rejected states, and rollback fallback pass.

**Verification:** E2E and backend integration tests.

### G6 — Operational readiness

**Outcome:** stats, scores, metrics, docs, deployment, monitoring, and rollback are ready for cutover.

**Evidence:** performance/accessibility/security results and deployment rehearsal.

**Dependencies:** G5.

**Completion:** P0 journeys pass in a production-like environment; Docker/port/data/WebSocket contracts remain intact.

**Verification:** CI, Docker checks, E2E, backup restore, and manual review.

## Milestones

| Milestone | Objective | Affected components | Dependencies | Acceptance criteria | Required tests | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| M0 | Freeze behavior | `docs/`, `tests/` | None | Complete route/schema/fixture inventory | Backend suite, contract fixture generation | Documentation revert |
| M1 | Close security blockers | `auth`, `app`, `metrics`, `review`, deployment docs | M0 | SEC-01–06 resolved or explicitly accepted | Auth/CSRF/upload/export/backup tests | Prior backend release |
| M2 | Add Next.js toolchain | New `frontend/` package | M0 | Reproducible Next.js TypeScript build, lint, typecheck, Vitest | Clean install/build | Do not route traffic |
| M3 | Build shared UI system | Frontend components/styles | M2 | Tokens, themes, responsive shell, keyboard flow | RTL/a11y component tests | Keep shell unmounted |
| M4 | Implement catalog/detail | `catalog` feature + API adapter | M2–M3 | Search/pagination/detail/download parity | Contract + Playwright | Route to Jinja |
| M5 | Implement auth/tokens | `auth` feature | M1, M4 | Login/register/logout/token flows and safe errors | E2E role/session/CSRF | Keep `/auth/*` pages |
| M6 | Implement publish/review | `publishing`, `review` features | M1, M5 | Upload/validation/status/verify/reject parity | ZIP fixtures, E2E | Keep existing publish/editor pages |
| M7 | Implement operational screens | `stats`, `scores`, `metrics`, `admin` features | M5–M6 | Real data only; protected exports/admin actions | Role and data-access matrix | Keep sensitive admin screens server-rendered |
| M8 | Harden and cut over | Docker/proxy/CI/ops | M1–M7 | Performance, a11y, security, backup, WebSocket, rollback pass | Full suite and rehearsal | Previous image + route flags |
| M9 | TypeScript backend migration | Next.js route/service boundaries and SQLite compatibility work | M8 and explicit approval | Written parity, data migration, auth, binary, and WebSocket proof | Shadow read/schema diff and full contract suite | Keep Flask as rollback |

## Review unit guidance

Each milestone should be split into small changes: one contract/fixture change, one feature slice, one test slice, and one documentation/update slice. Do not combine a UI rewrite with a database migration or deployment change in one review.

## Phase 1 implementation update — 2026-10-12

### Decision correction

The project target is now Next.js with TypeScript, including a future TypeScript backend. The earlier Vite/React Router recommendation is superseded. This implementation phase therefore creates a Next.js App Router foundation. Flask is not deleted in M0: it remains the compatibility authority while contract parity is measured and the backend is migrated incrementally. Removing Flask before that evidence would violate G1 and remove the rollback path.

### Completed or in progress

- Created an isolated `frontend/` Next.js application with strict TypeScript, App Router bootstrap, error boundary, shared styles, theme state via Zustand, server-state provider via TanStack Query, Tailwind CSS, and a small shadcn/ui-style button primitive.
- Added npm scripts for development, typecheck, lint, Vitest, and production build, plus a lockfile generated by `npm install` when the frontend dependency installation is run.
- Added HTTP development rewrites from Next.js to `FLASK_PROXY_TARGET`. Existing Flask/Jinja routes and port 5080 remain untouched. WebSocket proxying is explicitly still outstanding because Next.js development rewrites are HTTP-only.
- Added the `dev` profile to the unified `docker-compose.yml` with the shared `dream_edge` Traefik network: Next.js is routed at `store.prg32.dream.test`, Flask/API and the WebSocket relay at `api.prg32.dream.test`, with isolated named dev volumes.
- Added the API contract inventory and isolated synthetic fixture tests described in `13-api-contracts.md`.

### Evidence to record

The final Phase 1 report must include the exact output and exit status for `.venv313/bin/python -m pytest -q`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `python3 -m py_compile app.py cartridge_store/*.py`, and `git diff --check`. No check is considered complete from configuration alone.

### Deviations and remaining work

- Deviation: Next.js App Router replaces the originally documented Vite/React Router frontend choice, following the project owner’s direction.
- Remaining: migrate backend routes and services to TypeScript, preserve SQLite/file-store semantics, reproduce authentication providers and session/token behavior, port PRG32 parsing and binary responses, port exports/backups, and provide a WebSocket-compatible relay before Flask can be retired.
- M0 acceptance criteria are satisfied for this phase: the route/shape inventory is recorded, isolated compatibility fixtures are present, and the backend suite passes. M2's toolchain checks are also green, although M2's original label should be read as Next.js rather than Vite. Read-only feature parity and backend replacement remain future work.

### Executed verification evidence

| Check | Command | Result |
| --- | --- | --- |
| Python dependency installation | `python3.13 -m venv .venv313 && .venv313/bin/python -m pip install -r requirements.txt` | Passed in isolated environment |
| Backend suite and contract fixtures | `SECRET_KEY=phase1-test-secret .venv313/bin/python -m pytest -q` | **48 passed** before remediation; **53 passed** after M0 remediation |
| Python syntax | `python3 -m py_compile app.py cartridge_store/*.py` | Passed |
| Frontend reproducible install | `npm ci --no-audit --no-fund` in `frontend/` | Passed; lockfile used |
| TypeScript | `npm run typecheck` in `frontend/` | Passed |
| ESLint | `npm run lint` in `frontend/` | Passed |
| Frontend unit tests | `npm run test` in `frontend/` | **2 files, 3 tests passed**; non-failing Vitest ESM warning remains |
| Production build | `npm run build` in `frontend/` | Passed; Next.js static routes `/` and `/_not-found` generated |
| Patch whitespace | `git diff --check` | Passed |
| Development proxy smoke test | Flask on `:5080`, Next.js on `:3000`, curl `/api/games` and discovery through Next | Passed |
| Traefik dev profile | `docker compose --profile dev config`, build, up, HTTPS checks for both hosts, multiplayer status, down | Passed; Flask healthy and both host routers returned 200 |
| Production image stages | `docker build -t prg32-cartridge-store:local .` and frontend standalone image build | Passed; Flask and Next.js runtime smoke tests returned HTTP 200 |

The first isolated environment used the system Python 3.9.6 and could not initialize the application because its `hashlib` lacked `scrypt`, which Werkzeug 3.1 uses for password hashing. No application behavior was changed to hide that failure; the supported local Python 3.13 runtime was used instead. The frontend dependency install also reports an upstream deprecation warning for ESLint 9.39.5 and a non-blocking Vitest config-loader warning.

### Next implementation milestone

M1.1 is complete for administrator bootstrap, explicit session policy, and
CSRF. The parent M1 remains open because the remaining audit items are not part
of this authorization. M1.2 should address the remaining security controls
before the first TypeScript backend slice: metrics export authorization,
backup/restore secret handling, ZIP expansion limits, rate limiting, and
security headers. The first TypeScript backend slice after M1 should be a
read-only discovery/catalog shadow implementation with fixture comparison
against Flask; it must not take production traffic until parity and rollback
are demonstrated.

## M1.1 security hardening update — 2026-10-12

Completed work and evidence are recorded in
[`16-m1-1-security-report.md`](16-m1-1-security-report.md):

- removed deterministic fresh-install administrator creation;
- added an operator-secret, atomic, one-time `/auth/bootstrap` flow;
- preserved existing administrator credentials, IDs, roles, and groups;
- set explicit HttpOnly, Secure, SameSite, lifetime, refresh, and logout
  session behavior with separate development/production configuration;
- added session-bound CSRF enforcement for HTML forms and cookie-auth JSON
  mutations, with explicit Bearer-only compatibility;
- added the Next.js API helpers for obtaining and submitting CSRF tokens;
- added fresh bootstrap, existing-admin, cookie, expiration/logout, CSRF, and
  Bearer compatibility tests;
- updated operator, API, deployment, and Docker documentation.

M1.1 acceptance is satisfied by the dedicated security tests and full backend
suite. M1 is not marked complete: upload/archive bounds, metrics/backup
hardening, rate limiting, and security headers remain explicitly deferred to
M1.2.

## M0 remediation update — 2026-10-12

The independent audit in `13-m0-implementation-audit.md` identified incomplete
contract assertions, unverified WebSocket/HMR behavior, a fragile API-client
header merge, an unsafe development-secret fallback, an unvalidated production
proxy target, and five high-severity development-toolchain audit findings.

Remediation evidence is recorded in
[`15-m0-remediation-report.md`](15-m0-remediation-report.md):

- Contract tests now cover successful and unsuccessful discovery, catalog,
  binary/screenshot, authentication, token, registration, publishing, review,
  scores, metrics, statistics, and administrative responses using isolated
  synthetic data.
- `tests/test_multiplayer_integration.py` verifies the real Flask WebSocket
  handshake, authentication, join/state/invalid-message/leave behavior, and
  room cleanup after close.
- The frontend client merges headers safely and validates known discovery,
  catalog, and error envelopes with Zod.
- Production builds now require a non-loopback `FLASK_PROXY_TARGET`; the dev
  Compose profile requires an explicit `PRG32_DEV_SECRET_KEY`.
- The repeatable `npm run test:hmr` probe received a real Next.js Turbopack
  build event after a temporary source change and restored the source file.
- The full npm audit remains a documented residual risk: the only available
  automatic fix downgrades `eslint-config-next` to 14.2.35, incompatible with
  the approved Next.js 16 stack. Production dependencies have zero findings.

**Current status: M0 complete for compatibility-freeze acceptance, with the
development ESLint supply-chain risk and pre-existing security findings carried
forward to M1.** M1 remains the next implementation milestone; M1 work has not
started automatically.
