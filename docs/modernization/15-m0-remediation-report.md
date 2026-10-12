# PRG32 Cartridge Store — M0 remediation report

Date: 2026-10-12
Scope: remediation of `13-m0-implementation-audit.md`
Mode: implementation and verification; no deployment, database migration, or commit

## Final readiness assessment

**M0 is complete for the compatibility-freeze acceptance criteria, with a
documented development-toolchain security exception carried into M1.**

The Flask backend remains the authoritative compatibility service. No Flask
route, response contract, authentication behavior, database schema, production
secret, or production deployment was changed. The approved frontend remains
Next.js 16 App Router; Vite and React Router were not introduced.

The five high-severity npm audit findings cannot be safely auto-fixed with the
approved Next.js 16 stack. npm's only automatic fix downgrades
`eslint-config-next` to 14.2.35. That breaking remediation was intentionally
not applied. Production dependencies have no reported vulnerabilities; the
residual findings are in the development ESLint chain and are recorded as an
M1 supply-chain task.

## Findings addressed

### API contract coverage

Expanded isolated contract tests now cover representative successful and
unsuccessful responses for:

- discovery and ABI identifiers;
- catalog listing, details, version selection, and architecture selection;
- icon, screenshot, colophon, and binary downloads, including MIME type,
  attachment filename, PRG2/metadata markers, and architecture-specific
  SHA-256 values;
- anonymous/session authentication, registration completion, API token create,
  list, update, Bearer use, and revoke;
- bundle publishing, invalid bundle input, pending submissions, verify and
  reject transitions;
- score writes and reads, metrics ingestion/error responses/exports, and
  statistics summaries;
- administrative pages and backup download behavior.

All fixture data uses temporary directories and synthetic cartridge, PNG, user,
token, and score values. No production data or credentials are serialized.

### WebSocket compatibility

Added `tests/test_multiplayer_integration.py`, which starts the actual Flask
application on an isolated local Werkzeug server and connects with the
installed `simple-websocket` client. It verifies handshake, player-role
authentication, room join, state relay, invalid JSON, unknown message type,
explicit leave, socket close, and room status cleanup.

This is backend protocol evidence. The Traefik-routed WebSocket path was not
claimed as verified in this remediation run.

### Frontend API boundary

- `requestJson` now merges `RequestInit.headers` without dropping the default
  JSON `Accept` header.
- Known API error, discovery, and catalog envelopes have Zod runtime schemas.
- Callers can opt into runtime validation by passing a schema to `requestJson`.
- Validation failures use a dedicated `ApiResponseValidationError` and do not
  alter Flask response shapes.
- Frontend tests cover header merging and invalid known responses.

### Secret handling

The unified `docker-compose.yml` contains no fixed session-secret fallback for
the dev service. It passes `PRG32_DEV_SECRET_KEY`, and Flask emits an
actionable startup error when the variable is missing. Documentation provides a
local random-generation command and warns against committing or reusing the
value. The production service is isolated behind the `prod` profile.

### Proxy configuration

`frontend/next.config.ts` now requires `FLASK_PROXY_TARGET` for production
builds, validates the scheme, and rejects loopback hosts in production. The
development default remains `http://127.0.0.1:5080`. A production-like build
with `FLASK_PROXY_TARGET=http://flask:5080` passed; missing and loopback values
failed with explicit configuration errors.

### HMR verification

Added the development-only `npm run test:hmr` probe. It starts Next.js,
connects to the actual `/_next/hmr` endpoint using the page request id,
changes a temporary marker in an existing component, waits for a Turbopack
`built` event, and restores the source file. The probe passed.

## Files modified or added during remediation

- `tests/test_api_contracts.py`
- `tests/test_multiplayer_integration.py`
- `tests/fixtures/api_contracts.json`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/client.test.ts`
- `frontend/src/lib/api/schemas.ts`
- `frontend/src/lib/api/` dependency metadata in `frontend/package.json` and `frontend/package-lock.json` (`zod`)
- `frontend/next.config.ts`
- `frontend/scripts/verify-hmr.mjs`
- `docker-compose.yml`
- `docs/docker.md`
- `docs/modernization/00-executive-summary.md`
- `docs/modernization/08-migration-strategy.md`
- `docs/modernization/09-testing-strategy.md`
- `docs/modernization/11-implementation-roadmap.md`
- `docs/modernization/13-api-contracts.md`
- `docs/modernization/14-phase1-implementation-report.md`
- this report

No files under `app.py`, `cartridge_store/`, `templates/`, or the SQLite data
store were modified by the remediation.

## Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| Backend regression and contracts | `PATH="$PWD/.venv313/bin:$PATH" SECRET_KEY=m0-remediation-test pytest -q` | **53 passed**, exit 0 |
| Python syntax | `python3 -m py_compile app.py cartridge_store/*.py` | Passed, exit 0 |
| TypeScript | `npm run typecheck` in `frontend/` | Passed, exit 0 |
| ESLint | `npm run lint` in `frontend/` | Passed, exit 0 |
| Frontend unit tests | `npm run test` in `frontend/` | **2 files, 5 tests passed**, exit 0; existing non-failing Vitest config warning remains |
| HMR | `npm run test:hmr` in `frontend/` | Passed; real Turbopack `built` event received |
| Production build | `FLASK_PROXY_TARGET=http://flask:5080 npm run build` in `frontend/` | Passed, exit 0; `/` and `/_not-found` generated |
| Proxy validation — missing target | `NODE_ENV=production env -u FLASK_PROXY_TARGET npm run build` | Failed as intended with explicit required-variable error |
| Proxy validation — loopback target | `FLASK_PROXY_TARGET=http://127.0.0.1:5080 NODE_ENV=production npm run build` | Failed as intended with explicit loopback error |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` in `frontend/` | **0 vulnerabilities**, exit 0 |
| Full dependency audit | `npm audit --audit-level=high` in `frontend/` | Exit 1; 5 high findings in dev ESLint chain; no force fix applied |
| Patch whitespace | `git diff --check` | Passed, exit 0 |
| Clean frontend install | `npm ci --no-audit --no-fund` in `frontend/` | Passed, exit 0; lockfile is reproducible |
| Compose validation | `PRG32_DEV_SECRET_KEY=remediation-local-only docker compose --profile dev config` | Passed, exit 0; both Traefik routers and the dev secret rendered |
| Flask secret guard | `env -u PRG32_DEV_SECRET_KEY docker compose --profile dev up` | Flask refuses startup with the existing actionable missing-secret error |
| Flask image build | `docker build -t prg32-cartridge-store:m0-remediation .` | Passed, exit 0 |
| Next.js image build | `docker build --build-arg FLASK_PROXY_TARGET=http://flask:5080 --build-arg NEXT_PUBLIC_FLASK_WS_URL=wss://api.prg32.dream.test/api/multiplayer -f frontend/Dockerfile -t prg32-cartridge-store-frontend:m0-remediation frontend` | Passed, exit 0 |

No container was started or deployed by this remediation run.

## Remaining findings and risks

1. **High, development-only dependency risk:** `braces` → `micromatch` →
   `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`. No safe
   compatible fix was available in the current registry metadata. Mitigation:
   production installs exclude dev dependencies, the production audit is
   clean, and the dependency should be rechecked before M1 release work.
2. **Medium, pre-existing security work:** CSRF controls, deterministic
   bootstrap-admin behavior, session-cookie policy, upload/resource limits,
   metrics authorization, and backup hardening remain in the security roadmap.
   They were not changed in M0 remediation to avoid altering backend behavior.
3. **Medium, proxy scope:** HTTP rewrites are covered by the existing local
   smoke evidence and target validation. A live Traefik WebSocket handshake
   through `api.prg32.dream.test` remains a deployment-rehearsal task.
4. **Low, test tooling:** Vitest reports its existing ESM/CommonJS config-loader
   warning. It is non-failing and does not affect the test result.
5. **Future parity:** storefront features, browser E2E, and the TypeScript
   backend migration remain out of scope. Flask is intentionally retained as
   the rollback and compatibility authority.

## Compatibility and security implications

- Firmware-facing route names, response fields, identifiers, ABIs, architecture
  values, binary bytes, and Flask authentication behavior were preserved.
- The only runtime frontend dependency addition is Zod for opt-in response
  validation; it does not modify backend behavior.
- Development Compose now fails closed when its session secret is missing.
- Production frontend builds can no longer silently bake a loopback Flask
  target.
- No production database, filesystem store, credentials, deployment, commit,
  or push was touched.

## Next milestone

Proceed to M1: security prerequisites and explicit acceptance/remediation of
the remaining backend security findings. Do not begin storefront feature work
or the TypeScript backend migration as part of this remediation.
