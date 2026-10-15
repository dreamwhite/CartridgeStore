# PRG32 Cartridge Store — M5.3.9 Final Security & E2E Stabilization

Date: 2026-10-15
Decision: `M539_FINAL_STABILIZATION_GO` for the disposable application gate
Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`
Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive result

M5.3.9 is complete for its authorized scope. The order-sensitive browser failure was reproduced, traced to the disposable suite configuration, and corrected without changing the production authentication policy. The disposable operational browser regression then passed three consecutive times with retries disabled: 18/18, 18/18, and 18/18.

The first-installation journey was also run separately against a fresh disposable root and passed 1/1. In the populated regression fixture the same test verifies the already-complete installation state, so the complete suite has no skipped tests.

The SMTP, OIDC, and SAML setup paths now share a bounded outbound resolver that validates all DNS answers and pins subsequent connections to the validated address. Internal endpoints are accepted only through an exact configured hostname allowlist. No operational service, database, Traefik configuration, Authentik configuration, or production data was changed.

This is application and disposable-runtime readiness, not authorization to cut over traffic. Real Authentik login was not initiated, as required by the safety boundary. The public `sso.dream.test` observation was limited to DNS/TLS/GET behavior.

## 2. Scope and safety

Implemented in this milestone:

- Root-cause correction for the serial browser timeout.
- DNS-rebinding-resistant outbound validation for SMTP setup tests and generic OIDC/SAML metadata validation.
- Exact internal-host allowlists in disposable and inactive operational templates.
- WebAuthn RP/origin negative configuration coverage.
- Backup-v4 preservation coverage for WebAuthn credential and challenge rows.
- Disposable operational WebAuthn configuration for the passkey browser journey.
- One new outbound security test file and focused backup-v4 assertions.
- This report only as the new Markdown evidence artifact.

Not performed:

- No operational cutover, deployment, migration, or public routing change.
- No changes to Dream Traefik, Authentik, Mailpit, DNS, certificates, or operational SQLite.
- No Flask removal or Flask behavior rewrite.
- No production WebAuthn enablement.
- No real OIDC/SAML authentication session, credentials, tokens, or administration interface access.
- No commits or pushes.

The existing M5.3.8 uncommitted implementation remains in the worktree and is not retroactively attributed to M5.3.9.

## 3. Playwright root-cause analysis

The historical `m52g29` timeout occurred at the second local login after the test changed the persisted session lifetime. The browser waited for a POST login response, but the login ceremony never reached the POST.

The disposable browser backend was shared by the serial journeys and used `PRG32_BACKEND_AUTH_RATE_LIMIT_MAX=20`. Earlier tests had already consumed the shared synthetic client budget. The later login first requested the CSRF token and was rejected by the authentication rate limiter; consequently no matching POST `/auth/login` response could exist for Playwright to observe. Running `m52g29` alone reset the backend and therefore passed, which explains the order sensitivity.

This was not caused by cookie expiration, the session lifetime value, Playwright response matching, or a missing arbitrary wait. The relevant evidence was the isolated pass versus the serial failure and the shared backend/client fixture configuration.

## 4. Playwright fix

The test-only disposable browser environment now uses an explicit rate-limit budget of 200 requests per 60 seconds. The application default and production-shaped rate-limit behavior were not changed.

The first-installation test branches on the fixture state rather than skipping. `PRG32_M537_SETUP_E2E=1` executes the wizard against a new root; the populated operational fixture verifies the completed-installation/replay boundary. Both paths are exercised by real tests and the complete suite contains no skipped tests.

The disposable operational Compose fixture now explicitly enables WebAuthn with:

- RP ID: `store.m52g14.test`.
- Origin: the exact synthetic HTTPS store origin including its port.
- Node.js 24 operational images.

The inactive operational template remains WebAuthn-disabled by default and requires an operator-provided RP ID and origin decision before production enablement.

## 5. Repeated browser acceptance

Command used for each repeated run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
PRG32_M535_OPERATIONAL_E2E=1 \
  pnpm --dir frontend run test:e2e -- --retries=0
```

Results:

| Run | Tests | Result | Duration | Retries |
|---|---:|---|---:|---:|
| 1 | 18/18 | PASS | 39.1s | disabled |
| 2 | 18/18 | PASS | 35.8s | disabled |
| 3 | 18/18 | PASS | 33.2s | disabled |

Dedicated first-installation command:

```bash
PRG32_M537_SETUP_E2E=1 \
  pnpm --dir frontend exec playwright test -c playwright.config.mjs \
  e2e/m537.spec.mjs -- --retries=0
```

Result: 1/1 passed in 37.9s against a freshly initialized disposable operational root.

An earlier exploratory local-process run exposed a separate fixture warm-up/provider-loading failure and is not counted as acceptance evidence. The required repeated acceptance uses the actual disposable operational images and was stable across all three runs.

## 6. SMTP outbound security

SMTP test connection and test-send now resolve the configured hostname before opening a socket. The validated lookup function is passed to `net.connect` and `tls.connect`, including STARTTLS upgrade, so the connection cannot silently perform a second DNS lookup and land on a different address.

The resolver rejects loopback, private, link-local, metadata, documentation, reserved, multicast, and invalid address classes. A hostname resolving to any forbidden address is rejected unless the hostname is present in the exact, case-insensitive `PRG32_BACKEND_SETUP_NETWORK_TEST_ALLOWLIST`.

The allowlist is not a network range and does not allow arbitrary private IPs. Disposable Mailpit uses the explicit `mailpit` exception; the host-based browser SMTP capture uses explicit disposable exceptions. The operational template defaults to the approved `mailpit` hostname and can be overridden by the operator.

Port range, DNS failure, timeout, response-size and connection errors fail closed. SMTP setup routes preserve stable public error envelopes while request logs retain structured error context.

## 7. OIDC outbound security

OIDC discovery and JWKS retrieval now use the shared bounded HTTPS fetcher. The fetcher:

- permits HTTPS by default;
- rejects credentials and fragments in remote URLs;
- validates every redirect target independently;
- limits redirects, body bytes, and request time;
- rejects private or forbidden DNS answers unless explicitly allowlisted;
- pins the request lookup to the address validated immediately before the request;
- returns stable provider error codes without exposing transport exception text.

OIDC discovery issuer matching, endpoint validation, and JWKS retrieval remain compatible with the previous contract. The generic provider remains generic; no Authentik-specific assumptions were introduced.

## 8. SAML metadata security

Remote SAML metadata retrieval uses the same bounded resolver and manual redirect policy. Parsed SAML metadata still rejects XML `DOCTYPE` and `ENTITY`, requires exactly one identity-provider descriptor, requires one supported HTTPS SSO endpoint and one valid signing certificate, and limits metadata size.

Inline XML now receives the same post-parse outbound endpoint validation as downloaded metadata. Thus a syntactically valid SAML document cannot introduce a private SSO endpoint without the exact internal allowlist.

## 9. Shared outbound policy

`backend/src/setup/outbound.ts` is deliberately small and Flask-independent. It owns:

- hostname and port validation;
- DNS answer classification;
- exact allowlist handling;
- address pinning;
- bounded HTTP/HTTPS retrieval;
- redirect validation;
- stable outbound error codes.

Future Fastify/TypeScript provider and SMTP code can reuse this policy without reproducing Python-specific logic. No additional networking dependency was added.

## 10. WebAuthn RP/origin contract

The configuration validator requires WebAuthn to have an explicit RP ID and at least one explicit origin. Every configured origin must be a trusted HTTPS origin outside test mode, must have no path/query/fragment/credentials, and must be the RP ID or a subdomain of it.

For the future Dream browser deployment, the compatible shape is an RP ID at or above `prg32.dream.test` with the exact browser origin `https://store.prg32.dream.test`. `https://api.prg32.dream.test` is an API origin and is not the browser origin for the Store passkey ceremony. This production choice remains operator input and is intentionally not enabled by the operational template.

The disposable browser uses a synthetic host-specific RP ID and exact origin including the ephemeral HTTPS edge port. The passkey enrollment, resident credential listing, sign-out, discoverable passkey login, and authenticated `/api/auth/me` check passed in all three repeated runs.

## 11. WebAuthn security review

The existing M5.3.8 WebAuthn implementation was reviewed and regression-tested for:

- CSRF and authenticated-session requirements;
- recent reauthentication for enrollment, rename, and revoke;
- persistent challenge rows, expiry, session binding, and one-time consumption;
- RP ID and origin verification through SimpleWebAuthn;
- user verification and signature-counter checks;
- disabled, suspended, and banned account handling;
- credential revocation and administrator authorization;
- last-recovery-method protection;
- session rotation after passwordless login;
- stable public error envelopes.

M5.3.9 adds negative configuration tests for incompatible RP IDs and invalid origins. Backup-v4 tests now preserve a synthetic WebAuthn public key, counter, transport metadata, and an expired challenge row across encrypted restore. No credential secret or private key is written to a report.

## 12. Passwordless recovery

No bypass or recovery token was added. Recovery remains operator-controlled and uses existing account administration, password reset, federation identity management, and credential revoke safeguards.

The safe procedure is:

1. Confirm the account and operator identity out of band.
2. Prefer the existing password or federated identity path to reauthenticate.
3. Use an administrator recent-reauthenticated session to revoke a lost credential only when another recovery method remains.
4. If the account has no usable recovery method, stop and use the existing maintenance/operator recovery process; do not create a public endpoint or bypass the last-recovery guard.
5. Require the user to enroll a new passkey after recovery and audit the action.

This procedure does not alter authentication behavior and does not authorize access to operational account data.

## 13. First-installation regression

The fresh setup journey passed 1/1 using the disposable operational images. It covered bootstrap authorization, admin creation, store settings, registration settings, security step, SMTP configuration, generic OIDC configuration, generic SAML configuration, completion, replay rejection, and final local password login. The populated suite independently covered the already-complete setup state.

The setup path uses generic OIDC/SAML configuration. It does not assume Authentik-specific endpoints, labels, credentials, or administration APIs.

## 14. Operational Compose review

Read-only Compose inventory results:

| Definition | Runtime shape | Result |
|---|---|---|
| Root Compose `--profile dev` | Transitional Flask/writer/bridge development topology | config PASS; not changed in M5.3.9 |
| `deploy/candidate/compose.yaml` | Candidate Fastify + Next services | config PASS |
| `deploy/disposable/operational-compose.yaml` | Disposable Fastify + Next + synthetic Mailpit | config PASS; used for browser acceptance |
| `deploy/operational/compose.yaml` | Future Fastify + Next, external edge/mail networks | config PASS; not started |

The future operational target remains two application runtime services:

- Fastify on port 5080, owning canonical SQLite and filesystem data through the explicit bind mount.
- Next.js on port 3000, proxying to Fastify and serving the Store UI.

Traefik, Authentik, Mailpit/SMTP infrastructure, and the external Docker networks remain outside the application service ownership boundary. The legacy Flask service, `auth-writer-init`, `auth-writer`, and `auth-writer-edge-proxy` cannot be removed until the separately authorized ownership cutover is completed and rollback evidence is accepted.

Required public names remain `store.prg32.dream.test` and `api.prg32.dream.test`; the identity provider hostname remains `sso.dream.test`.

Operational image builds:

```bash
docker build -f backend/Dockerfile.operational \
  -t prg32-cartridge-store-fastify:m539-validation backend

docker build -f frontend/Dockerfile.operational \
  -t prg32-cartridge-store-next:m539-validation frontend
```

Both completed successfully from Node 24 slim multistage Dockerfiles. The Next build emitted Docker’s non-blocking `SecretsUsedInArgOrEnv` warning for non-secret integration target environment names already present in the image build configuration; no secret value was embedded.

## 15. Authentik continuity

The application continues to implement generic OIDC/SAML provider contracts and does not depend on Authentik-specific APIs. The permitted public observations were:

| Host | Observation | Result |
|---|---|---|
| `store.prg32.dream.test` | TLS-verified HEAD `/` | HTTP 200, `ssl_verify_result=0` |
| `api.prg32.dream.test` | TLS-verified HEAD `/health` | HTTP 404, `ssl_verify_result=0` |
| `sso.dream.test` | TLS-verified HEAD `/` | HTTP 302, `ssl_verify_result=0` |

Certificate subjects were development certificates. No login, credential submission, session creation, token capture, provider administration, or private Authentik access was attempted. Therefore real Authentik end-to-end continuity is `OPERATIONAL_VERIFICATION_REQUIRED`, not a passed application test.

## 16. Backup-v4 restore

The existing encrypted backup-v4 implementation was exercised by the full backend suite and the focused backup-v4 suite. The focused suite passed 5/5, including wrong-key, tampering, truncation, incomplete-marker, key rotation, retention, writer lease, and interrupted restore behavior.

M5.3.9 additionally verifies that a synthetic WebAuthn credential public key and an expired WebAuthn challenge row survive encrypted backup-v4 restore exactly. Backup-v4 does not expose credential material in its report manifest, and encryption keys remain external to the archive.

Result: disposable backup-v4 restore `DISPOSABLE_VALIDATED`; operational backup restore `OPERATOR_INPUT_REQUIRED` until the operational key registry, source quiescence, and authorized restore window are provided.

## 17. Negative security tests

New outbound tests passed 3/3 and cover:

- mixed public/private DNS answers rejected without exact allowlist;
- explicitly allowlisted internal hostname accepted and connection lookup pinned;
- bounded local metadata retrieval through the pinned address;
- default HTTP provider metadata rejection.

Existing and updated tests passed for:

- SAML XML entity rejection and malformed certificate handling;
- OIDC discovery and signing-key validation;
- WebAuthn missing configuration, invalid RP/origin, CSRF, anonymous, and malformed ceremonies;
- session/challenge persistence and account state safeguards;
- SMTP TLS and refusal/timeout behavior;
- backup wrong-key, tampering, truncation, and interrupted restore rejection.

## 18. Full regression results

All commands were executed with Node.js 24 selected through nvm where applicable.

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
```

| Check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir backend run test` | PASS — 55 files, 276 tests |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — 38 routes generated |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `docker compose -f deploy/operational/compose.yaml config --quiet` | PASS |
| disposable operational Compose config | PASS |
| operational Fastify image build | PASS |
| operational Next image build | PASS |
| `git diff --check` | PASS |

The backend test count increased from the M5.3.8 baseline of 273 to 276 through the three outbound tests; the 55th test file is the new outbound security suite. Python remains 64 tests and frontend remains 65 tests.

## 19. Operational readiness matrix

| Area | Classification | Evidence / blocker |
|---|---|---|
| First installation | `DISPOSABLE_VALIDATED` | Fresh browser journey 1/1 |
| Local authentication | `DISPOSABLE_VALIDATED` | Browser and backend regression |
| Passkeys | `DISPOSABLE_VALIDATED` | 3 × 18/18 operational runs |
| OIDC | `DISPOSABLE_VALIDATED` | Synthetic browser and protocol tests |
| SAML | `DISPOSABLE_VALIDATED` | Synthetic browser and metadata tests |
| Sessions / CSRF / RBAC | `DISPOSABLE_VALIDATED` | Backend and browser tests |
| SMTP | `DISPOSABLE_VALIDATED` | Synthetic SMTP plus pinned resolver tests |
| mDNS | `APPLICATION_READY` | Disabled by default; no operational ownership change |
| Catalog / publishing / review / downloads | `DISPOSABLE_VALIDATED` | Combined browser and backend parity |
| Firmware API | `DISPOSABLE_VALIDATED` | Compatibility and metrics tests |
| Scores / metrics / WebSocket | `DISPOSABLE_VALIDATED` | Backend and browser tests |
| Canonical SQLite | `DISPOSABLE_VALIDATED` | Canonical runtime and integrity suites |
| Backup-v4 / restore | `DISPOSABLE_VALIDATED` | Encrypted restore and interruption tests |
| Docker | `DISPOSABLE_VALIDATED` | Four Compose configs and two image builds |
| Next.js | `DISPOSABLE_VALIDATED` | Typecheck, unit tests, build, browser |
| Reverse proxy | `OPERATIONAL_VERIFICATION_REQUIRED` | Public TLS/GET observed; no mutation |
| Operational secrets | `OPERATOR_INPUT_REQUIRED` | External session/bootstrap/key registry values |
| Monitoring | `OPERATOR_INPUT_REQUIRED` | Production alerting and log retention not exercised |
| Rollback | `OPERATOR_INPUT_REQUIRED` | Requires approved writer/traffic/data-loss policy |
| Authentik continuity | `OPERATIONAL_VERIFICATION_REQUIRED` | No real login allowed in this milestone |
| Flask retirement | `BLOCKED` | Requires separately authorized ownership cutover |

## 20. Files changed

M5.3.9 implementation changes:

- `backend/src/setup/outbound.ts`
- `backend/src/setup/provider-validation.ts`
- `backend/src/email/service.ts`
- `backend/src/settings/service.ts`
- `backend/src/setup/service.ts`
- `backend/tests/outbound-security.test.ts`
- `backend/tests/admin-runtime-config.test.ts`
- `backend/tests/storage-v2-backup-v4.test.ts`
- `frontend/e2e/global-setup.mjs`
- `frontend/e2e/m537.spec.mjs`
- `deploy/disposable/operational-compose.yaml`
- `deploy/operational/compose.yaml`
- this report

The worktree also contains pre-existing M5.3.8 implementation files and generated/untracked developer artifacts. They were preserved and not reclassified as M5.3.9 work.

## 21. Remaining blockers

No unresolved P0/P1 application defect remains in the authorized disposable scope.

Operational blockers remain intentionally open:

- production canonical data snapshot, writer quiescence, and ownership handover;
- external operational secret/key-registry injection and rotation procedure;
- final WebAuthn RP ID/origin decision and authenticator policy;
- real Authentik OIDC/SAML browser acceptance under an explicitly authorized test account;
- Dream Traefik route and TLS verification during the approved maintenance window;
- production SMTP endpoint and certificate policy;
- monitoring, alerting, backup retention, and restore operator sign-off;
- rollback traffic control and post-cutover write reconciliation policy;
- explicit Flask retirement authorization.

## 22. Final decisions

`M539_FINAL_STABILIZATION_GO`

The final stabilization gate is GO for the disposable application and operational-image acceptance scope. The gate is not a deployment authorization.

`OPERATIONAL_CUTOVER_NO_GO`

Public observations and disposable tests do not authorize routing, authentication-provider, database, or data-ownership changes.

`FLASK_RETIREMENT_NO_GO`

Flask remains in place until a separately authorized cutover proves ownership, rollback, and production operational controls.

## 23. Recommended next phase

The next milestone should be a controlled operational handover preparation review, not an automatic cutover: obtain operator decisions for production WebAuthn origins, external secrets, SMTP, monitoring, and rollback data-loss policy; then run a separately authorized real Authentik acceptance window. Only after those gates are approved should a cutover milestone be opened.
