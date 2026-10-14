# PRG32 Cartridge Store — M5.2g.30 Final Disposable Application Closure

## 1. Executive decision

`FINAL_DISPOSABLE_APPLICATION_GO`

The four M5.2g.29 application gaps are closed on disposable fixtures:

- registration verification and password reset now have browser acceptance through a synthetic SMTP server;
- SMTP plain, AUTH PLAIN, STARTTLS, implicit TLS, certificate rejection, refusal, timeout and missing-capability paths are covered;
- the administrator catalog UI reads a moderation inventory that remains searchable when a release is hidden or unpublished;
- the administrator user search is visible, server-backed, deterministic and paginated.

`OPERATIONAL_CUTOVER_NO_GO`

`FLASK_RETIREMENT_NO_GO`

This milestone did not authorize or perform cutover, migration of real data, Flask removal, deployment, Dream Traefik changes, Authentik changes, Mailpit delivery, DNS changes or TLS certificate changes.

## 2. Scope and safety boundary

All implementation and verification used source-controlled code plus disposable roots, disposable SQLite data, synthetic users and loopback SMTP/TLS fixtures. No operational database, Docker volume, Traefik network, Authentik resource or production mailbox was accessed or modified.

The real Dream hostnames remain configuration and observation targets only:

- `store.prg32.dream.test`
- `api.prg32.dream.test`
- `sso.dream.test`

No credentials, cookies, tokens, private provider configuration or SMTP secrets are present in this report.

## 3. Findings addressed

M5.2g.29 identified four remaining disposable gaps. Their closure evidence is:

| Gap | Result | Evidence |
| --- | --- | --- |
| SMTP registration verification | Complete through synthetic SMTP capture, browser link consumption and replay rejection | `BROWSER_VERIFIED`, `UNIT_VERIFIED` |
| SMTP password reset | Complete through synthetic SMTP capture, browser reset, replay protection and subsequent login | `BROWSER_VERIFIED`, `UNIT_VERIFIED` |
| SMTP protocol/security matrix | Plain, AUTH PLAIN, STARTTLS, implicit TLS, refusal, timeout and missing STARTTLS capability covered | `UNIT_VERIFIED` |
| Hidden/unpublished catalog administration | Dedicated admin moderation inventory and detail routes keep records searchable and restorable | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Administrator user search | Visible search field, server-side query, stable ordering, empty state and pagination controls | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |

## 4. Files changed for M5.2g.30

Implementation and test changes made for this milestone:

- `backend/src/email/service.ts`
- `backend/src/admin/catalog-service.ts`
- `backend/src/admin/routes.ts`
- `backend/src/storage-v2/catalog.ts`
- `backend/tests/email.test.ts`
- `frontend/src/components/admin/AdminWorkspace.tsx`
- `frontend/src/components/auth/RegisterPanel.tsx`
- `frontend/src/lib/api/admin.ts`
- `frontend/e2e/global-setup.mjs`
- `frontend/e2e/m52g30.spec.mjs`
- `docs/modernization/116-final-disposable-application-m5-2g-30.md`

The worktree contains extensive earlier modernization changes from previous milestones. They were preserved and were not reset or cleaned.

## 5. SMTP registration and password-reset acceptance

The browser fixture now writes accepted synthetic SMTP messages to a permission-restricted temporary JSONL file outside the repository. The test reads only that disposable capture, extracts the one-time URL, and drives the real Next.js pages.

The verified journey is:

1. Administrator enables registration and SMTP against a loopback disposable SMTP server.
2. A synthetic user requests registration.
3. The backend sends the real registration message through the SMTP transport.
4. The browser opens the captured `/register/complete?token=…` URL.
5. The user supplies the password and completes registration.
6. Reusing the same link is rejected.
7. The user requests a password reset through `/forgot-password`.
8. The captured `/password-reset?token=…` URL is opened.
9. The password is changed and the new password authenticates successfully.

The completion page was corrected to collect the password and confirmation required by the backend contract. No token is returned in a public API response.

Malformed, expired, consumed and generic non-eligible reset behavior remains covered by the existing authentication tests. Delivery failure consumes the pending token and returns the existing stable error contract.

## 6. SMTP transport matrix

`SmtpEmailTransport` remains dependency-free and uses Node.js 24 TLS primitives. SMTP errors are normalized to `EmailDeliveryError`; connection refusal is no longer allowed to escape as a raw socket error.

The SMTP response parser now consumes multiline responses correctly. This is required for the standard `250-…` capability response preceding STARTTLS.

Verified disposable matrix:

| Mode | Scenario | Result |
| --- | --- | --- |
| `none` | message delivery | `UNIT_VERIFIED` |
| `none` + AUTH PLAIN | credential submission and delivery | `UNIT_VERIFIED` |
| `starttls` | negotiated TLS with trusted disposable CA | `UNIT_VERIFIED` |
| `implicit_tls` | TLS from connection start with trusted disposable CA | `UNIT_VERIFIED` |
| any | certificate verification failure | `UNIT_VERIFIED` |
| any | connection refusal | `UNIT_VERIFIED` |
| any | response timeout | `UNIT_VERIFIED` |
| `starttls` | server does not accept STARTTLS | `UNIT_VERIFIED` |
| configured SMTP settings | admin connection and message test | `BROWSER_VERIFIED` |

An optional explicit CA is available only to the transport configuration object for private/disposable SMTP endpoints. Default TLS verification remains enabled. No silent plaintext downgrade exists.

## 7. Administrative moderation inventory

The public catalog projection continues to exclude active moderation actions. The admin surface now has separate read-only inventory routes:

- `GET /api/admin/catalog/moderation`
- `GET /api/admin/catalog/moderation/:cartridgeId`

Both use the existing centralized catalog-admin permission boundary. The canonical catalog supplies an admin-only projection that bypasses public moderation filtering while still requiring active cartridges, published release relationships and verified immutable objects.

The UI now uses this inventory for the Catalog section. A hidden or unpublished item remains selectable, displays its moderation state, and can be restored. Public listing and download behavior remains unchanged and continues to reject hidden/unpublished releases.

The browser acceptance performs both hide/restore and unpublish/restore cycles on the synthetic cartridge. Unauthorized access and mutation CSRF coverage remains in the existing backend suite.

## 8. Administrator user search

The Users panel now contains a real `Search users` field connected to the existing `q` API parameter. Results are server-filtered by username or email, ordered deterministically by creation time and ID, and displayed with explicit empty/loading states.

The UI uses a bounded page size and Previous/Next controls derived from the server-reported total. No decorative client-only filters were introduced. The browser acceptance verifies a matching result, a no-match result and stable first-page pagination behavior.

## 9. API, authentication and error compatibility

No public firmware route or response identifier was renamed. The new admin routes are additive. Existing registration, completion, password reset, session invalidation, CSRF and generic reset response contracts remain in place.

The SMTP changes preserve stable administrative error envelopes and keep diagnostic details in server-side error handling. Credentials, password hashes, reset tokens and SMTP passwords are not included in response bodies, capture fixtures or this report.

## 10. Candidate Docker verification

The candidate topology was built and run only as a disposable Compose project with an explicit temporary canonical root:

- one `fastify` backend container;
- one `next` frontend container;
- one disposable Compose bridge network;
- no Dream Traefik network attachment;
- no Authentik or Mailpit service started by this project.

Both candidate Dockerfiles completed their multi-stage builds on Node 24 Bookworm slim images. The candidate runtime verified:

- canonical storage initialization with schema `2`, layout `2`, journal `1`, backup format `3`;
- Fastify `/ready`;
- Fastify `/api/games`;
- Next `/health`;
- Next same-origin `/api/games` proxy;
- both services healthy and running simultaneously.

The disposable Compose project and its temporary bind-mounted root were removed after verification. No Docker prune operation was used.

`docker compose --profile dev config --quiet` and candidate Compose config validation both passed. Operational Compose was not changed.

## 11. Mailpit and Dream infrastructure status

The existing M5.2g.29 read-only observation remains the boundary for Dream infrastructure:

- local DNS resolves the configured Dream test hostnames to the local development endpoint;
- store, API and SSO public GET/HEAD observations were recorded without authentication or mutation;
- the existing Mailpit container was observed as healthy with its disposable SMTP/web ports;
- no SMTP connection was made to Mailpit;
- no message was sent to Mailpit;
- no Authentik login, provider change or administration request was performed.

Required delivery labels:

- `SYNTHETIC_SMTP_E2E_VERIFIED`
- `MAILPIT_SMTP_NOT_EXECUTED`
- `PRODUCTION_EMAIL_DELIVERY_NOT_VERIFIED`

## 12. Verification labels and evidence

- `SOURCE_VERIFIED`: source, route wiring, storage projection and Compose definitions inspected.
- `UNIT_VERIFIED`: backend Vitest and frontend Vitest checks passed.
- `HTTP_VERIFIED`: disposable Fastify route and proxy checks passed.
- `BROWSER_VERIFIED`: Playwright browser checks passed.
- `DOCKER_VERIFIED`: disposable candidate Compose build/runtime checks passed.
- `NOT_VERIFIED`: real production delivery, operational cutover, real Authentik sessions and production routing.

No label is used to imply production readiness.

## 13. Commands executed and results

All Node commands used `source "$HOME/.nvm/nvm.sh" && nvm use 24`.

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | passed |
| `pnpm --dir backend run lint` | passed |
| `pnpm --dir backend run build` | passed |
| `pnpm --dir backend run test` | passed — 51 files, 264 tests |
| `pnpm --dir frontend run typecheck` | passed |
| `pnpm --dir frontend run lint` | passed |
| `pnpm --dir frontend run test` | passed — 22 files, 65 tests |
| `pnpm --dir frontend run build` | passed |
| `pnpm --dir frontend run test:e2e -- --workers=1` | passed — 16/16 |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | passed |
| `./.venv313/bin/python -m pytest -q` | passed — 64 tests |
| `docker compose --profile dev config --quiet` | passed |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | passed |
| disposable candidate multi-stage build and runtime | passed — 2 services |
| `git diff --check` | passed |

The first full Playwright run was `15/16` because an existing provider-link assertion timed out during frontend startup. The affected test passed in isolation, and the subsequent full run passed `16/16`.

## 14. Compatibility evidence

The full backend suite includes the existing catalog, binary/media, firmware, authentication, publication, review, metrics, scores, statistics, multiplayer, federation, backup and readiness regression suites. No existing test was removed or weakened.

The full frontend unit suite remains green. The four existing E2E files now execute 16 scenarios, including the three focused M5.2g.30 scenarios. Existing Jinja/Flask source and routes were not removed.

## 15. Remaining risks

1. Real SMTP delivery through Mailpit and any external SMTP provider is intentionally not verified.
2. Production certificate chains, SMTP provider policy, DNS, Traefik routing and Authentik sessions remain outside this disposable milestone.
3. SMTP AUTH is covered for AUTH PLAIN only because that is the implemented transport contract; LOGIN/OAuth mechanisms are not silently claimed.
4. The admin moderation inventory is canonical-target aware; legacy Flask remains transitional and authoritative outside the disposable candidate mode.
5. The operational database and object store have not been migrated or dual-written.
6. Existing worktree changes from prior milestones remain uncommitted and were not independently re-audited in this milestone.

## 16. Explicit non-actions

This milestone did not:

- remove Flask;
- change operational Docker Compose;
- attach candidate services to Dream Traefik or Authentik networks;
- change `store.prg32.dream.test` or `api.prg32.dream.test` routing;
- change `sso.dream.test` or any provider configuration;
- write production data;
- start a real OIDC/SAML session;
- send mail to Mailpit or a real mailbox;
- deploy, commit or push;
- start M5.2g.31 or M6.3d.2h.12.

## 17. Next milestone recommendation

The next authorized milestone should be a separately approved operational cutover plan review. Before any cutover authorization, keep the following gates explicit:

- production backup and restore rehearsal with approved secret/key custody;
- source writer quiescence and immutable object inventory;
- authentication/session continuity decision;
- publication/review, telemetry, scores, metrics and multiplayer writer ownership;
- Traefik, DNS, TLS and generic OIDC/SAML callback confirmation;
- rollback data-loss policy and post-cutover reconciliation procedure;
- explicit approval to alter operational Compose and retire Flask.

No operational readiness is inferred from this disposable GO.

## 18. Final decision matrix

| Decision | Status |
| --- | --- |
| M5.2g.30 disposable application closure | `FINAL_DISPOSABLE_APPLICATION_GO` |
| SMTP through synthetic fixture | `SYNTHETIC_SMTP_E2E_VERIFIED` |
| Dream Mailpit delivery | `MAILPIT_SMTP_NOT_EXECUTED` |
| Production email delivery | `PRODUCTION_EMAIL_DELIVERY_NOT_VERIFIED` |
| Operational cutover | `OPERATIONAL_CUTOVER_NO_GO` |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` |
