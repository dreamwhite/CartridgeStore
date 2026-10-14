# PRG32 Cartridge Store — M5.2g.14 Browser E2E & Full Cutover Dry Run

## 1. Executive result

M5.2g.14 is **GO for the disposable browser and cutover rehearsal scope** and
**NO-GO for operational cutover and Flask retirement**.

The milestone produced a real Chromium test against two distinct HTTPS
origins, exercised the Next.js proxy, Fastify APIs, local authentication,
synthetic OIDC/SAML callbacks and authenticated WSS, and completed a
disposable migration/ownership/backup/restore/rollback dry run. The isolated
candidate Compose deployment also built and reached readiness with exactly two
services.

The operational boundary remains closed. No real login was performed, no
Traefik, Authentik, DNS, operational Compose project, operational database or
production storage was modified, and Flask remains the observed operational
API authority. M5.2g.15 and M6.3d.2h.12 were not started.

Decision summary:

| Scope | Result | Evidence |
|---|---|---|
| Real-browser disposable dual-origin HTTPS | **GO** | 5 Playwright tests passed |
| Disposable full cutover dry run | **GO** | 1 Vitest integration test passed |
| Candidate two-service Docker runtime | **GO** | Fastify and Next healthy; both `/ready` returned 200 |
| Local repository verification | **GO** | Backend 48/238, frontend 22/65, Python 64 passed |
| Public Dream infrastructure observation | **PARTIAL / NOT_VERIFIED** | Safe GET/HEAD observations only; DNS and TLS chain validation not established |
| Operational cutover | **NO-GO** | Real edge, federation, writer handover and data migration not authorized or verified |
| Flask retirement | **NO-GO** | Public API observation still identified Flask/Werkzeug and rollback authority remains required |

## 2. Scope and safety boundary

The work was limited to disposable fixtures, local application processes, a
temporary HTTPS edge and an isolated candidate Compose project. The browser
used synthetic hostnames:

- `store.m52g14.test` for the storefront origin;
- `api.m52g14.test` for the API origin;
- `evil.m52g14.test` for the negative CORS origin.

The test harness generated a temporary certificate with `mkcert`, configured
Chromium with explicit resolver mappings for the synthetic names, and used
the generated certificate trust configuration. It did not edit `/etc/hosts`,
system DNS, public DNS, Traefik or Authentik. Browser diagnostics and
temporary roots were removed after the run. No permanent screenshots, traces
or recordings were generated.

The public observations used only low-volume `dig`, `curl -k -I` and
`openssl s_client` probes. They did not submit forms, authenticate, follow a
real provider login, send mutating requests, open a production WebSocket or
read private resources.

## 3. Browser E2E implementation

The browser path is:

```text
Chromium
  -> temporary HTTPS edge
       -> store.m52g14.test -> Next.js development server
       -> api.m52g14.test   -> Fastify development server
```

The edge forwards HTTP, HTTPS and WebSocket traffic while preserving the
original `Host` header. The API and storefront are therefore distinct from
the browser's perspective, while the same-origin Next.js `/api` proxy is also
exercised.

The disposable fixture contains a canonical SQLite catalog, one published
cartridge, valid PNG media, a local admin account, and synthetic OIDC and SAML
provider records. Provider servers run locally and issue synthetic identities
only.

The five browser tests cover:

1. Canonical catalog listing, search, detail, icon, screenshot, architecture
   selection and binary download.
2. Local login, secure HttpOnly session cookie properties, CSRF rejection,
   legacy-cookie non-authentication and logout.
3. Exact direct API CORS, same-origin Next.js proxying and rejection of the
   negative CORS origin.
4. Complete synthetic OIDC and SAML browser callback journeys.
5. Authenticated WSS join, peer relay, invalid-token rejection and room-limit
   enforcement.

The browser run found and fixed three integration defects rather than masking
them:

- `/api/auth/login` was being consumed by the Next.js compatibility page
  instead of reaching Fastify; the candidate rewrite now routes the local auth
  endpoint correctly.
- The frontend auth client now selects the `/api/auth` proxy when the
  candidate or federation integration is enabled, including when the
  compatibility page exists at `/auth/*`.
- SAML ACS form navigation is exempted from script CORS processing while
  regular API requests retain the exact CORS policy.

Vitest was also configured to exclude `e2e/**`, preventing Playwright files
from being collected as frontend unit tests.

## 4. Full disposable cutover dry run

`backend/tests/m52g14-cutover.test.ts` performs the following sequence using
synthetic data:

1. Create a legacy snapshot with catalog, SQLite, cartridge bytes and a
   prepared marker.
2. Inventory and independently verify the legacy manifest.
3. Inject a migration failure before finalization and confirm it fails.
4. Run the migration successfully into a new canonical target.
5. Verify the migrated target and compare a source tree fingerprint before and
   after migration.
6. Start Fastify against the canonical target and verify `/ready` and the
   canonical catalog endpoint.
7. Attempt a second canonical writer lease and confirm it is rejected.
8. Create and independently verify an encrypted backup-v4 archive.
9. Restore it into a fresh target and compare the restored storage tree byte
   for byte with the canonical target storage tree.
10. Reject a simultaneous-writer state.
11. Run the rollback rehearsal state machine and verify that it completes only
    after failure detection and single-writer enforcement.

The source fingerprint remained unchanged. The failed migration target was
never treated as ready. The restore target was new and disposable; it did not
merge into or overwrite an existing root.

## 5. Candidate Docker verification

The candidate Compose file remains a two-service disposable topology:

| Service | Role | Result |
|---|---|---|
| `fastify` | canonical API, auth, telemetry and WSS candidate | healthy; `/ready` 200 |
| `next` | production Next.js standalone candidate | healthy; `/ready` 200 |

The run initialized a new temporary canonical root with the explicit
candidate authorization, built both Node 24 slim multi-stage images, started
the Compose project with loopback-only ports, checked service status and
queried both readiness endpoints. The project containers and network were
removed on exit. No operational Compose project was addressed, and no Docker
prune operation was used. Candidate images were not deleted because this
milestone prohibits broad image cleanup.

The candidate runtime remains independent of Flask and Python. Its build
stages may use native build tooling, but the runtime images are the existing
Node 24 slim multi-stage images.

## 6. Public Dream infrastructure observation

Only non-mutating observations were made:

| Host | Observation | Result |
|---|---|---|
| `store.prg32.dream.test` | HTTPS `HEAD /` with short timeout | `HTTP/2 200`, HTML content type |
| `api.prg32.dream.test` | HTTPS `HEAD /` with short timeout | `HTTP/2 200`, HTML content type, `Werkzeug/3.1.9 Python/3.13.16` server header |
| `sso.dream.test` | HTTPS `HEAD /` with short timeout | `HTTP/2 302`, redirect to the default Authentik authentication flow, `uvicorn` server header |

The probes used `curl -k` only to observe endpoint behavior. Certificate
chain validation with `openssl s_client -verify_return_error` was
**NOT_VERIFIED**, and the captured `dig` output did not establish a separate
public DNS acceptance result. These observations are not a substitute for an
authorized edge/federation acceptance run.

The API response identifying Werkzeug is direct evidence that Flask remains
operationally observable at the API origin. It is therefore not safe to claim
Flask retirement from local candidate results.

## 7. Exact verification results

Environment used for the local runs:

- Node.js `v24.20.0`, selected with `nvm use 24`;
- pnpm `12.5.1`;
- Docker `29.8.0`;
- Playwright Chromium `1.64.0`;
- Python virtual environment `./.venv313`.

Commands and results:

| Command/check | Result |
|---|---|
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run test:e2e` from `frontend` | **PASS — 5 tests** |
| `pnpm exec vitest run tests/m52g14-cutover.test.ts` from `backend` | **PASS — 1 test** |
| `pnpm run typecheck` from `backend` | **PASS** |
| `pnpm run lint` from `backend` | **PASS** |
| `pnpm run test` from `backend` | **PASS — 48 files, 238 tests** |
| `pnpm run build` from `backend` | **PASS** |
| `pnpm run typecheck` from `frontend` | **PASS** |
| `pnpm run lint` from `frontend` | **PASS** |
| `pnpm run test` from `frontend` | **PASS — 22 files, 65 tests** |
| `pnpm run build` from `frontend` | **PASS** |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | **PASS — 64 tests** |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | **PASS** |
| `docker compose --profile dev config --quiet` | **PASS** |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | **PASS** |
| disposable candidate initialization, build, health and readiness smoke | **PASS — 2 healthy services; 2 readiness responses 200** |
| `git diff --check` | **PASS** |
| post-run process check | **PASS — no M5.2g.14 app/browser processes left** |

The combined backend run produced 48 passing test files and 238 passing tests.
The frontend run produced 22 passing files and 65 passing tests. The Python
suite remained at 64 passing tests. These are actual current results, not the
historical M5.2g.13 baseline.

## 8. Files changed for M5.2g.14

M5.2g.14-specific source, test and configuration changes are:

- `backend/src/app.ts` — SAML ACS browser form navigation handling.
- `backend/tests/m52g14-cutover.test.ts` — disposable cutover and rollback
  rehearsal.
- `frontend/next.config.ts` — candidate local-auth proxy rewrite ordering.
- `frontend/src/lib/api/auth.ts` — candidate/federation auth proxy selection.
- `frontend/vitest.config.ts` — Playwright exclusion from Vitest collection.
- `frontend/package.json` and `frontend/pnpm-lock.yaml` — Playwright test
  command and test-only dependency.
- `frontend/playwright.config.mjs` — isolated Playwright configuration.
- `frontend/e2e/edge.mjs` — disposable HTTPS/HTTP/WebSocket edge.
- `frontend/e2e/global-setup.mjs` — synthetic fixture, providers, TLS and
  process lifecycle.
- `frontend/e2e/global-teardown.mjs` — disposable process cleanup.
- `frontend/e2e/m52g14.spec.mjs` — five browser acceptance tests.
- this report.

The worktree also contains pre-existing changes and files from M5.2e through
M5.2g.13. They were preserved and not reset, cleaned, stashed or discarded.
No prior milestone file was rewritten for this milestone, and the roadmap was
not updated.

## 9. Remaining blockers and risks

The following gates remain open and prevent operational acceptance:

- Real Traefik routing for both production origins was not changed or
  authorized for cutover verification.
- Real Authentik OIDC/SAML login and callback behavior was not exercised.
- Public DNS and TLS chain acceptance was not independently verified.
- The operational API still exposes Flask/Werkzeug behavior.
- No operational writer quiescence, database snapshot or data migration was
  performed.
- Session continuity, provider account mapping and token invalidation across
  a real handover remain an operational decision.
- Publication/review, downloads, telemetry, scores, metrics and multiplayer
  write ownership still require a controlled production handover.
- mDNS ownership and LAN behavior remain outside this disposable browser
  scope.
- Post-cutover rollback must reconcile writes accepted after the legacy
  snapshot; restarting Flask alone cannot guarantee data preservation.
- Candidate images and local build caches are intentionally not removed by
  this milestone; broad Docker cleanup is prohibited here.

## 10. Acceptance matrix

| Acceptance area | Disposable result | Operational result |
|---|---|---|
| Two distinct HTTPS origins | GO | NOT_VERIFIED |
| Browser TLS trust in the disposable environment | GO | NOT_VERIFIED |
| Next.js same-origin API proxy | GO | NOT_VERIFIED at real edge |
| Direct API CORS policy | GO | NOT_VERIFIED at real edge |
| Local auth, CSRF and cookie boundaries | GO | Handover/session continuity open |
| OIDC callback | GO with synthetic provider | Real Authentik login not authorized |
| SAML callback | GO with synthetic provider | Real provider acceptance open |
| Authenticated WSS | GO | Operational edge upgrade not verified |
| Legacy inventory and migration | GO on synthetic snapshot | Real data migration not authorized |
| Single-writer lease | GO in disposable target | Operational quiescence not performed |
| Encrypted backup and restore | GO in disposable target | Operational backup policy open |
| Rollback rehearsal | GO in disposable target | Post-cutover reconciliation policy open |
| Candidate Docker runtime | GO | Deployment not authorized |
| Flask retirement | NO-GO | NO-GO |

## 11. Final decisions

- **M5.2g.14 disposable browser verification:** GO.
- **M5.2g.14 disposable full cutover dry run:** GO.
- **Local candidate runtime readiness:** GO for the isolated two-service
  candidate.
- **Public infrastructure acceptance:** PARTIAL / NOT_VERIFIED.
- **Operational cutover:** NO-GO.
- **Flask retirement:** NO-GO.

The next authorized step must address the still-open operational gates with
explicit access and change authorization. This milestone does not authorize
that work and does not begin M5.2g.15 or M6.3d.2h.12.
