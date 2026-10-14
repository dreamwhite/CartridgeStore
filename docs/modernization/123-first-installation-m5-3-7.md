# PRG32 Cartridge Store — M5.3.7 First Installation & Setup Wizard

## 1. Executive result

Decision: **M537_FIRST_INSTALLATION_PARTIAL**.

The canonical first-installation flow is implemented and verified against a fresh disposable operational stack. The core security and persistence gates pass. The milestone remains partial because the wizard currently persists and structurally validates SMTP/OIDC/SAML configuration, but does not yet expose dedicated SMTP connection testing or remote OIDC metadata/SAML metadata validation in the setup UI.

The following decisions remain explicit:

- **OPERATIONAL_CUTOVER_NO_GO**
- **FLASK_RETIREMENT_NO_GO**
- No Dream infrastructure, operational database, legacy database, university content, Traefik or Authentik configuration was changed.

## 2. Scope and safety

Implemented only the first-installation boundary for Fastify, canonical SQLite and Next.js. Legacy Flask data and transitional auth-writer data remain untouched. No deployment, migration, commit or push was performed.

Validation used synthetic disposable roots, a synthetic key registry, synthetic federation configuration, disposable SMTP/edge processes and a disposable Compose project.

## 3. Installation architecture

The wizard uses one durable `setup_state` singleton in canonical SQLite and the existing users, settings, federation, audit and secret services. It does not create a parallel account or settings store.

Steps are persisted server-side: `admin`, `store`, `registration`, `security`, `smtp`, `oidc`, `saml`, `mdns`, and `review`. Browser refresh therefore does not reset completed work.

## 4. Infrastructure boundary

The browser cannot configure storage paths, SQLite location, filesystem permissions, secret registry, session secret, bootstrap authorization, public origins, TLS, proxy routing, Docker networks/capabilities or mDNS socket permissions. Status exposes only safe readiness booleans and validated public origins.

Missing canonical storage or writer infrastructure produces `INFRASTRUCTURE_NOT_READY`; the application does not silently create an operational database.

## 5. Setup authorization

`POST /api/setup/authorize` requires the externally supplied bootstrap token. Comparison is length-checked and constant-time. A short-lived server-side HttpOnly setup cookie and separate CSRF token are issued only after authorization.

The token is not returned, logged, embedded in HTML/bundles/URLs, or stored in localStorage. Authorization is protected by exact-origin checks and the existing rate-limit configuration. Concurrent setup sessions are rejected.

## 6. Installation state machine

Implemented states:

`INFRASTRUCTURE_NOT_READY`, `INSTALLATION_REQUIRED`, `INSTALLATION_IN_PROGRESS`, `INSTALLATION_COMPLETE`, and `INSTALLATION_RECOVERY_REQUIRED`.

State transitions and first-admin creation use SQLite transactions. Completion requires every step and a canonical admin. Completion invalidates the setup session and rejects replay. Existing canonical databases with an admin are reconciled to `INSTALLATION_COMPLETE`; populated databases without an admin become recovery-required rather than becoming a new installation.

## 7. Canonical schema changes

Added the idempotent `setup_state` table to the additive application migrations. It stores state, completed steps, admin identity, recovery reason and timestamps. No legacy compatibility table or production data was rewritten.

The backup schema allow-list was updated to recognize `setup_state` as an expected application table.

## 8. Fastify setup API

Implemented:

- `GET /api/setup/status`
- `POST /api/setup/authorize`
- `GET /api/setup/progress`
- `POST /api/setup/progress`
- `POST /api/setup/complete`

Errors use stable `{ ok: false, error, code }` envelopes. Unexpected failures return a generic error and retain diagnostics only in server logs.

## 9. Next.js setup wizard

Added `/setup` with readiness, authorization, administrator, store, policy, SMTP, OIDC, SAML, mDNS, review and completion steps. Secrets are held only in component memory and cleared after submission. Optional steps can be skipped; infrastructure and administrator requirements cannot.

The completion flow now persists the `review` step before calling the atomic completion endpoint.

## 10. First administrator

The first administrator is created through `AuthService.bootstrapWithinTransaction`, using existing validation and password hashing. SMTP is not required. Duplicate/concurrent administrator creation is rejected, and later setup authorization is disabled after completion.

## 11. Store settings

Store name, description and contact email use canonical typed application settings. Public origin values remain deployment configuration and are displayed but cannot be changed by the wizard.

## 12. Registration/security policies

The wizard writes existing registration, email-verification, session lifetime, publishing/review and account-notification settings. No setting was added without an existing runtime consumer.

## 13. SMTP

The wizard writes enabled state, host, port, encryption mode, authentication, sender fields and password. SMTP passwords use the existing external key-registry envelope encryption and are never returned in progress responses.

SMTP may remain disabled and does not block first-admin creation. A dedicated setup-page connection-test action is not yet exposed; existing authenticated administration remains the supported SMTP test surface.

## 14. Generic OIDC

The wizard provisions generic OIDC provider records through the existing federation service, stores client secrets through the existing encrypted secret store, and enables only structurally valid providers. Callback URLs are generated from the configured API origin and cannot be overridden by browser input.

PKCE, state, nonce, JWKS and identity-linking behavior remain in the existing OIDC runtime. Remote discovery is still performed by the normal OIDC login path rather than by a setup-page network probe.

## 15. Generic SAML

The wizard provisions generic SAML providers with generated SP entity/ACS URLs, IdP entity ID, SSO endpoint and PEM certificate. Certificate parsing and existing signed-response/audience/destination/replay checks remain in the canonical SAML service.

Metadata URL/XML import and a dedicated setup-page metadata validation action remain future work; Authentik-specific assumptions were not introduced.

## 16. mDNS infrastructure gating

The wizard exposes the application preference separately from infrastructure permission. With the current operational configuration (`PRG32_BACKEND_MDNS_ENABLED=false`), enabling mDNS is rejected with `mdns_infrastructure_denied`; no multicast socket is opened. The firmware ABI remains `prg32-store-discovery-1.0`, service `_prg32store._tcp.local.`, with the configured discovery port (5080 in the operational configuration).

## 17. Installation completion

Completion runs under `BEGIN IMMEDIATE`, verifies the complete step set, admin identity and current state, writes `INSTALLATION_COMPLETE`, records audit evidence best-effort, clears the setup session and returns `/auth/login`. Completion retry/replay is rejected, and `/setup` displays the already-complete state.

## 18. Administration continuity

The wizard delegates to existing canonical administration services. Values are therefore visible to the existing settings/federation/admin surfaces instead of creating a second configuration model. Normal post-installation changes continue to use RBAC, CSRF and ordinary sessions.

## 19. Failure recovery

Durable progress survives restart and browser refresh. An expired or missing session fails closed. An interrupted setup with no completed installation remains recoverable; a populated ambiguous database is explicitly recovery-required. No public reset endpoint exists.

## 20. Security tests

The setup test suite covers fresh authorization, invalid token, CSRF failure, concurrent sessions, cross-origin mutation rejection, durable completion/restart, replay rejection, existing populated installation protection, encrypted SMTP/OIDC secrets, generic OIDC/SAML callbacks, callback derivation, secret redaction and mDNS infrastructure denial.

Four setup tests passed. No setup P0/P1 defect was observed.

## 21. Browser E2E

Added a dedicated Playwright journey using the disposable operational images, fresh canonical SQLite, synthetic key registry and HTTPS edge. It covers first authorization, admin creation, refresh recovery, store settings, SMTP, OIDC, SAML, mDNS preference, review, completion, setup replay rejection and normal login.

Result: **1/1 M5.3.7 setup journey passed**.

The existing disposable browser regression also passed: **16/16**.

## 22. Operational Docker validation

The M5.3.7 browser stack used `deploy/disposable/operational-compose.yaml` only, with a disposable project and bind-mounted temporary canonical root. Images were rebuilt without cache for the setup run. The stack was removed by its disposable teardown.

The root operational Compose template was not started or changed. `docker compose --profile dev config --quiet`, candidate Compose config and operational Compose config passed when supplied with synthetic non-production interpolation values. The bare operational config command correctly fails closed when required external secret/data variables are absent.

## 23. WebAuthn/passkey roadmap

No WebAuthn, FIDO2 or fake passkey controls were added. The next authorized milestone remains **M5.3.8 — WebAuthn & Passkey Authentication**, covering credential lifecycle, RP/origin validation, challenges, replay protection, recovery, notifications, RBAC and browser tests.

## 24. Regression results

Executed with Node.js 24 via `nvm use 24`:

| Check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 53 files, 270 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| M5.3.7 Playwright | PASS — 1/1 |
| Existing Playwright regression | PASS — 16/16 |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| Compose config checks | PASS with synthetic interpolation values |
| `git diff --check` | PASS |

## 25. Files changed

M5.3.7 implementation scope:

- `backend/src/db/application-migrations.ts`
- `backend/src/settings/service.ts`
- `backend/src/auth/service.ts`
- `backend/src/auth/routes.ts`
- `backend/src/app.ts`
- `backend/src/backup/service.ts`
- `backend/src/setup/service.ts`
- `backend/src/setup/routes.ts`
- `backend/tests/setup.test.ts`
- `frontend/src/lib/api/setup.ts`
- `frontend/src/app/setup/page.tsx`
- `frontend/e2e/global-setup.mjs`
- `frontend/e2e/m537.spec.mjs`

The worktree contained extensive pre-existing modernization changes; they were preserved and not reset, cleaned, staged, committed or pushed.

## 26. Remaining limitations

1. SMTP connection-test UI/API is not part of the setup session yet.
2. OIDC remote discovery validation is deferred to the normal provider login path.
3. SAML metadata URL/XML ingestion is not included; PEM/entity/SSO configuration is supported.
4. mDNS remains restart-gated and disabled by current operational policy.
5. The wizard does not migrate Flask accounts, legacy databases or university cartridges by design.

## 27. Final decisions

- **M537_FIRST_INSTALLATION_PARTIAL**
- Fresh canonical installation: **GO**
- Setup authorization and replay protection: **GO**
- Canonical first-admin and settings persistence: **GO**
- Secret handling and mDNS gating: **GO**
- Operational cutover: **NO-GO**
- Flask retirement: **NO-GO**
- Real Dream infrastructure mutation/deployment: **NOT AUTHORIZED / NOT RUN**

## 28. Recommended next milestone

Complete the remaining setup integration gates as a focused follow-up or explicitly accept them as post-install administration work. The next roadmap milestone remains **M5.3.8 — WebAuthn & Passkey Authentication**; it must not be started implicitly by this report.
