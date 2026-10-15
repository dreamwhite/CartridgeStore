# PRG32 Cartridge Store — M5.3.8 WebAuthn, Passkeys & First-Installation Closure

## 1. Executive result

M5.3.8 is **GO for disposable local implementation and acceptance** and
**NO-GO for operational cutover, Flask retirement, and real-provider
validation**.

The Fastify backend now has an opt-in WebAuthn/passkey boundary backed by the
canonical user database. The Next.js application exposes password-assisted
passkey enrollment, credential management, username-assisted login, and
discoverable login. The first-installation wizard now exposes explicit SMTP
connection/test-send, OIDC discovery validation, and SAML metadata
import/preview actions.

No Flask code, production data, operational Compose service, Traefik,
Authentik, DNS, TLS certificate, or real identity provider was modified.

## 2. Scope and safety boundary

Implemented:

- Additive WebAuthn persistence and Fastify routes.
- Explicit WebAuthn RP ID and trusted-origin configuration.
- Session-bound, single-use registration and authentication challenges.
- Password re-authentication before enrollment and credential changes.
- Credential listing, naming, revocation, administrator revocation, and
  recovery protection.
- Generic setup-time SMTP, OIDC, and SAML validation actions.
- Synthetic browser acceptance using a Playwright virtual authenticator.
- Compatibility updates for application backup table validation.

Not implemented:

- Operational cutover.
- Removal of Flask.
- Changes to production Docker Compose, Traefik, Authentik, Mailpit, or
  persistent volumes.
- Real OIDC/SAML provider login or provider administration.
- Deployment, commit, or push.

The WebAuthn feature is disabled unless explicitly enabled and fully
configured. This preserves the existing behavior in environments that have
not opted into passkeys.

## 3. WebAuthn architecture

The implementation uses:

- `@simplewebauthn/server` `14.0.3` in Fastify.
- `@simplewebauthn/browser` `14.0.0` in Next.js.
- The canonical `users` table as the identity authority.
- `webauthn_credentials` for credential public keys and safe metadata.
- `webauthn_challenges` for short-lived ceremony state.

The credential table stores the credential ID, public key, signature counter,
device type, backup state, transports, display name, creation time, last-use
time, and revocation time. Private keys never enter the application or
database.

The challenge table stores only a random challenge and a SHA-256 hash of the
canonical session ID. Challenges expire after five minutes and are atomically
consumed. Registration and authentication are therefore bound to the browser
session that initiated the ceremony.

## 4. RP, origin, and ceremony policy

When enabled, configuration requires all of:

- `PRG32_BACKEND_WEBAUTHN_RP_ID`.
- `PRG32_BACKEND_WEBAUTHN_ORIGINS`.
- `PRG32_BACKEND_WEBAUTHN_ENABLED=true`.
- Canonical auth-writer configuration.

The RP ID must be a valid host. Origins must be origin-only values without
paths, credentials, queries, or fragments. In non-test environments origins
must use HTTPS and must match the RP host or one of its subdomains. The
configuration fails closed when the RP or origin allowlist is missing or
invalid.

Registration requests require:

- An authenticated canonical session.
- Account enabled state.
- CSRF validation.
- Recent password re-authentication.
- User verification by the authenticator.

Registration uses resident-key preference, user verification required, no
attestation trust decision, and exclusion of the user’s active credentials.

Authentication supports both a username/email-assisted ceremony and a
discoverable credential ceremony. Verification checks the stored public key,
challenge, expected origin, RP ID, user verification, account state, and
signature counter. The implementation accepts zero-counter synced credentials
and rejects meaningful non-zero counter rollback.

Successful passkey authentication rotates the canonical session and issues a
new signed session cookie. Password login also records recent
re-authentication so a user can enroll a passkey immediately after signing in.

## 5. Credential management and recovery

User routes support:

- Listing safe credential metadata.
- Registering a credential.
- Renaming an active credential.
- Revoking an active credential.

Management mutations require the canonical session, CSRF, account-state
checks, and recent re-authentication. The last active credential cannot be
removed when the account has neither a password recovery method nor an active
external identity. This prevents accidental lockout of passwordless or
federated users.

Administrator revocation requires an administrator principal, the centralized
`users:update` permission, CSRF, and recent re-authentication. Credential IDs
are hashed in audit targets; public responses never contain public keys,
challenge values, session identifiers, or secret material.

Stable error codes include `webauthn_challenge_invalid`,
`webauthn_challenge_replayed`, `webauthn_registration_invalid`,
`webauthn_authentication_invalid`, `webauthn_counter_rollback`,
`webauthn_recent_auth_required`, and `webauthn_last_credential`.

## 6. First-installation closure

The setup wizard now provides explicit actions for:

- SMTP connection testing.
- SMTP test-message delivery to a validated recipient.
- OIDC discovery validation and JWKS retrieval.
- SAML metadata URL loading or XML import and safe preview.

The validation actions are not implicit writes. They require the authorized
setup session, same-origin checks, and CSRF. Provider validation is bounded by
timeouts, redirect limits, metadata size limits, HTTPS requirements, and
private-address rejection unless a disposable explicit allowlist is supplied.
SAML metadata rejects `DOCTYPE` and `ENTITY`, requires one IdP descriptor,
one supported SSO endpoint, and one syntactically validated signing key.

Validation results expose only safe metadata fields. Client secrets, SMTP
passwords, private XML payloads, and connection diagnostics are not returned
or logged.

## 7. API surface

The following route families are registered only when WebAuthn is enabled:

- `GET /auth/passkeys` and `/api/auth/passkeys`.
- `POST /auth/passkeys/register/options` and `/api/...`.
- `POST /auth/passkeys/register` and `/api/...`.
- `POST /auth/passkeys/login/options` and `/api/...`.
- `POST /auth/passkeys/login` and `/api/...`.
- `PATCH` and `DELETE /auth/passkeys/:credential_id` and `/api/...`.
- `DELETE /api/admin/users/:userId/passkeys/:credential_id`.

The existing password route remains authoritative and unchanged in response
semantics. New responses use the existing JSON/error style and do not replace
legacy authentication identifiers.

## 8. Files changed

Backend:

- `backend/package.json`
- `backend/pnpm-lock.yaml`
- `backend/src/app.ts`
- `backend/src/auth/routes.ts`
- `backend/src/auth/service.ts`
- `backend/src/auth/webauthn.ts`
- `backend/src/auth/webauthn-routes.ts`
- `backend/src/backup/service.ts`
- `backend/src/config/env.ts`
- `backend/src/db/application-migrations.ts`
- `backend/src/setup/provider-validation.ts`
- `backend/src/setup/routes.ts`
- `backend/src/setup/service.ts`
- `backend/tests/webauthn.test.ts`

Frontend:

- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `frontend/e2e/global-setup.mjs`
- `frontend/e2e/m52g14.spec.mjs`
- `frontend/e2e/m52g25.spec.mjs`
- `frontend/e2e/m52g29.spec.mjs`
- `frontend/e2e/m52g30.spec.mjs`
- `frontend/e2e/m537.spec.mjs`
- `frontend/e2e/m538.spec.mjs`
- `frontend/src/app/setup/page.tsx`
- `frontend/src/components/account/AccountWorkspace.tsx`
- `frontend/src/components/auth/LoginPanel.tsx`
- `frontend/src/components/setup/SetupValidationTools.tsx`
- `frontend/src/lib/api/auth.ts`
- `frontend/src/lib/api/schemas.ts`
- `frontend/src/lib/api/setup.ts`

The root `node_modules/`, root `pnpm-lock.yaml`, and
`frontend/test-results/` remain untracked workspace artifacts and were not
cleaned or included in the implementation. They were present as local
workspace state and are intentionally preserved.

## 9. Backup and compatibility

The application backup expected-table allowlist now includes
`webauthn_credentials` and `webauthn_challenges`. Existing canonical backup
and restore code remains the source of backup behavior; no second backup
system was introduced.

The WebAuthn schema is additive and uses `CREATE TABLE IF NOT EXISTS` and
indexes. No existing authentication table, password hash, external identity,
session identifier, or firmware-facing contract was renamed or removed.

## 10. Verification evidence

Node.js 24 was selected with `nvm use 24` for all Node and pnpm checks.

Passed:

- `pnpm --dir backend run typecheck`.
- `pnpm --dir backend run lint`.
- `pnpm --dir backend run test` — 54 test files, 273 tests passed.
- `pnpm --dir backend run build`.
- `pnpm --dir frontend run typecheck`.
- `pnpm --dir frontend run lint`.
- `pnpm --dir frontend run test` — 22 test files, 65 tests passed.
- `pnpm --dir frontend run build`.
- `docker compose --profile dev config --quiet`.
- `git diff --check`.
- Focused WebAuthn backend suite — 3 tests passed.
- Disposable first-installation browser test — 1/1 passed.
- Disposable resident-passkey browser test — 1/1 passed, including
  registration, listing, and discoverable login.
- Isolated existing administrative browser acceptance — 1/1 passed.

The normal browser suite was also executed. The first run exposed 12 stale
strict locators because the new `Sign in with a passkey` label matched the
existing `Sign in` locator. Those locators were corrected to use exact button
names. A subsequent non-setup suite run reached 15/16: the only failure was
the existing `m52g29` administrative acceptance timing out while waiting for a
second login response after changing the session lifetime to 60 seconds. The
same test passed when isolated, 1/1. This remains a suite-order/flakiness
issue and is not reported as a full-suite pass.

The first-installation Playwright path uses the existing disposable Compose
file and synthetic data. It does not authenticate against `sso.dream.test`,
Authentik, or any real provider.

## 11. Security and operational limitations

- WebAuthn is opt-in and requires explicit RP/origin configuration.
- No passkey recovery secret is generated or stored. Recovery relies on an
  existing password or active external identity, with administrator recovery
  as a separately authorized action.
- The current setup SMTP network guard rejects local/private literal targets;
  it does not constitute a general outbound egress policy. Production
  deployment should add network-level egress controls and, if arbitrary host
  names are permitted, DNS-rebinding-aware resolution before exposing setup
  validation to untrusted operators.
- SAML metadata preview accepts a public-key PEM fallback for synthetic
  fixtures as well as X.509 certificates. Production provider onboarding
  should retain the canonical certificate requirement when the upstream
  provider supplies a certificate.
- No real Authentik/generic OIDC/SAML session continuity was tested in this
  milestone.
- No WebAuthn backup, passkey sync, enterprise attestation, device inventory,
  or account-recovery ceremony was introduced.
- The full serial browser matrix still has one order-sensitive timeout and
  needs a separate stability fix before being used as an operational gate.
- Operational Docker, Traefik routing, TLS, provider configuration, and
  persistent data remain outside this milestone.

## 12. TypeScript migration invariants

The future backend must preserve these rules:

1. The canonical user identity remains authoritative.
2. RP ID and expected origins are explicit configuration, never inferred from
   an arbitrary request host.
3. Challenges are random, short-lived, session-bound, and single-use.
4. Registration and authentication require expected challenge, origin, RP ID,
   and user-verification checks.
5. Credential public keys are stored; private keys and secret ceremony values
   are not.
6. Successful authentication rotates the canonical session.
7. Signature counters are updated atomically and meaningful rollback fails
   closed.
8. Account state and centralized RBAC apply to every management operation.
9. The last recovery path cannot be removed accidentally.
10. Error responses expose stable codes, never raw verification exceptions or
    secret-bearing diagnostics.
11. Setup provider validation remains bounded, HTTPS-constrained, and safe
    against unsafe XML and private-network access.
12. Backup and restore retain both WebAuthn tables as compatible application
    data without exposing their sensitive contents in manifests.

## 13. Rollback considerations

The code change is additive. To disable the feature, keep
`PRG32_BACKEND_WEBAUTHN_ENABLED=false` or omit the WebAuthn configuration;
the routes are not registered and the existing password/federation paths
remain available.

The additive tables can remain unused during rollback. Removing them would be
a separate destructive data operation and was not attempted. No operational
database was changed by this milestone.

## 14. Remaining work before M5.3.9 / operational acceptance

- Decide and document the production WebAuthn RP ID and exact origins for
  `store.prg32.dream.test` and any approved alternate origin.
- Validate provider and SMTP behavior against disposable infrastructure using
  the deployment’s explicit network allowlist and egress policy.
- Fix the serial Playwright `m52g29` timeout so the full browser matrix is
  deterministic, then rerun the complete suite.
- Add a deliberate operator recovery procedure for passwordless accounts and
  lost authenticators.
- Complete real-provider federation acceptance only when explicitly
  authorized, without storing provider credentials in the repository.
- Keep operational cutover, Flask retirement, and infrastructure changes as
  separate authorized milestones.

## 15. Final decisions

| Decision | Result |
|---|---|
| WebAuthn implementation in Fastify | GO for disposable/local use |
| Next.js passkey UI and setup validation UI | GO for local implementation |
| Backend/frontend static checks and unit tests | GO |
| Disposable first-installation verification | GO |
| Disposable passkey registration/login verification | GO |
| Full serial browser matrix | NO-GO pending one order-sensitive timeout fix |
| Real provider/Authentik acceptance | NOT RUN / NO-GO |
| Operational cutover | NO-GO |
| Flask retirement | NO-GO |
| Deployment or infrastructure modification | NOT AUTHORIZED / NOT RUN |

M5.3.8 stops here. No later milestone, operational cutover, Flask removal,
commit, or push was started.
