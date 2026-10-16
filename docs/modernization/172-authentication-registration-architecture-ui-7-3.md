# PRG32 Cartridge Store — Authentication & Registration Architecture
## UI.7.3 Implementation Report

Date: 2026-10-16

## 1. Executive result

UI.7.3 is complete for the authorized frontend scope. The authentication and
registration UI is now split into feature-owned modules while the existing
Next.js routes, Flask/Fastify-compatible API calls, CSRF handling, cookies,
WebAuthn adapter boundary, provider discovery and safe return-path behavior
remain unchanged.

No backend, database, Docker, deployment, authentication-provider, protected
route, `AuthNavigation`, `AccountWorkspace`, `AdminWorkspace` or
`FederationWorkspace` behavior was changed.

## 2. Scope and boundaries

Implemented:

- Thin `LoginPanel` composition shell.
- Feature-owned local login form and mutation/session transition hook.
- Feature-owned OIDC/SAML provider discovery and login-link module.
- Feature-owned passkey login ceremony and session transition hook.
- Thin `RegisterPanel` composition shell.
- Feature-owned registration request/completion form and mutation hook.
- Focused regression coverage for passkey and registration flows.

Preserved:

- Existing `/login`, `/register` and `/register/complete` pages.
- Existing legacy `/auth/*` compatibility routes.
- Existing API paths and response parsing.
- Existing CSRF-before-write behavior and browser credentials behavior in the
  API client.
- Existing `safeReturnPath()` implementation and provider URL construction.
- Existing WebAuthn `toAuthenticationOptions()` adapter boundary.
- Existing protected-route and navigation behavior.

Not implemented by design:

- Backend changes.
- Auth provider or federation changes.
- New authentication methods.
- Database or storage changes.
- Docker or deployment changes.
- Roadmap changes.
- Live credentials, tokens, passkeys or external identity-provider sessions.

## 3. Module ownership

### Login

`LoginPanel.tsx` now owns only page-level composition, the disabled-integration
state, return-path derivation, session notice and the shared username value
needed to preserve targeted passkey login.

The feature modules are:

- `auth/local/LocalLoginForm.tsx`
- `auth/local/use-local-login.ts`
- `auth/federation/FederatedLoginOptions.tsx`
- `auth/federation/use-auth-providers.ts`
- `auth/passkeys/PasskeyLogin.tsx`
- `auth/passkeys/use-passkey-login.ts`

Local login owns username/password input, submission guards, the existing
`loginWithPassword()` contract, sensitive-query cleanup, current-user cache
invalidation and safe post-login navigation.

Federation owns provider discovery, enabled-provider filtering, loading/error
states and the existing OIDC/SAML initiation URLs. Provider discovery failure
continues to leave local sign-in available.

Passkey login owns the browser ceremony, the existing WebAuthn adapter call,
the finish request, session cache transition and navigation. Browser
cancellation is reported as a stable user-facing message without exposing
exception details.

### Registration

`RegisterPanel.tsx` now only bridges Next.js search parameters to the feature
module. Registration is implemented in:

- `auth/registration/RegistrationForm.tsx`
- `auth/registration/use-registration.ts`

The request and completion contracts remain separate and unchanged. The
completion flow preserves the token from the one-time link and navigates to
`/account` only after a successful completion response. Registration controls
use the shared accessible `Field`, `Button` and `StatusMessage` primitives.

## 4. Security and compatibility invariants

- Return paths continue to be normalized exclusively through
  `safeReturnPath()`; no feature module constructs an untrusted destination.
- Provider links continue to be built by `federatedLoginUrl()`.
- Password, registration and passkey writes continue to use the existing API
  functions, which obtain CSRF tokens before mutating requests.
- The API client remains responsible for browser credentials and cookie
  handling.
- Sensitive query-cache entries are cleared after successful local or passkey
  authentication before current-user cache refresh.
- Raw backend exception text is not rendered by the new passkey UI.
- The WebAuthn browser library remains behind the existing adapter boundary.
- Synthetic tests use no credentials, tokens, real passkeys or provider
  sessions.

## 5. Verification evidence

All commands below were executed from the repository worktree with Node.js 24
selected through nvm:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
```

Results:

| Check | Result |
| --- | --- |
| `pnpm run typecheck` in `frontend/` | PASS |
| `pnpm run lint` in `frontend/` | PASS |
| `pnpm run test` in `frontend/` | PASS — 47 files, 104 tests |
| `pnpm run build` in `frontend/` | PASS — Next.js 16.4.0 production build |
| `git diff --check` | PASS |
| Focused `pnpm exec vitest run src/components/auth` | PASS — 4 files, 10 tests |

The pre-UI.7.3 baseline was 45 Vitest files and 100 tests. This milestone
adds two feature-focused test files and four tests, resulting in 47 files and
104 passing tests.

Focused coverage includes:

- Local login session refresh/navigation and safe error rendering through the
  existing `LoginPanel` tests.
- Provider discovery success, disabled-provider filtering and discovery
  failure fallback through the existing `LoginPanel` tests.
- Safe return-path and provider URL behavior through the existing auth utility
  tests.
- Targeted passkey ceremony, adapter invocation, finish request, cache/session
  transition and navigation.
- Passkey browser cancellation with stable error text.
- Registration request payload and confirmation state.
- Registration completion token/password payload and `/account` navigation.
- Accessible labels, roles and shared form primitives.

No backend or Python test command was run because UI.7.3 authorizes only the
frontend authentication/registration architecture scope and makes no backend
change.

## 6. Required acceptance markers

```text
UI73_LOGIN_SHELL_GO
UI73_LOCAL_LOGIN_GO
UI73_REGISTRATION_GO
UI73_FEDERATION_GO
UI73_PASSKEY_LOGIN_GO
UI73_WEBAUTHN_PRESERVATION_GO
UI73_SESSION_TRANSITIONS_GO
UI73_ASYNC_RACE_SAFETY_GO
UI73_REDIRECT_SAFETY_GO
UI73_QUERY_OWNERSHIP_GO
UI73_CSRF_CREDENTIALS_GO
UI73_ACCESSIBILITY_GO
UI73_LEGACY_CLEANUP_GO
UI73_FRONTEND_REGRESSION_GO
```

The final UI.7.3 marker is:

```text
UI73_AUTH_ARCHITECTURE_GO
```

These markers apply to the disposable/local frontend architecture checks only.
They do not authorize deployment or operational federation verification.

## 7. Overall modernization status

Preserved status markers:

```text
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

UI.7.3 does not change the backend freeze, operational cutover or Flask
retirement decisions. The next frontend milestone may build on this auth
feature boundary, but should continue to consume the existing API contracts
and should not move provider/session ownership into presentation components.

## 8. Files changed by UI.7.3

Modified:

- `frontend/src/components/auth/LoginPanel.tsx`
- `frontend/src/components/auth/RegisterPanel.tsx`

Added:

- `frontend/src/components/auth/local/LocalLoginForm.tsx`
- `frontend/src/components/auth/local/use-local-login.ts`
- `frontend/src/components/auth/federation/FederatedLoginOptions.tsx`
- `frontend/src/components/auth/federation/use-auth-providers.ts`
- `frontend/src/components/auth/passkeys/PasskeyLogin.tsx`
- `frontend/src/components/auth/passkeys/PasskeyLogin.test.tsx`
- `frontend/src/components/auth/passkeys/use-passkey-login.ts`
- `frontend/src/components/auth/registration/RegistrationForm.tsx`
- `frontend/src/components/auth/registration/RegistrationForm.test.tsx`
- `frontend/src/components/auth/registration/use-registration.ts`
- `docs/modernization/172-authentication-registration-architecture-ui-7-3.md`

The worktree contained unrelated pre-existing changes from earlier
modernization milestones. They were preserved and not cleaned, reset or
committed.

## 9. Remaining risks

- This milestone verifies synthetic/local frontend behavior only; it does not
  replace a live provider acceptance test.
- Browser WebAuthn hardware/platform behavior remains dependent on the target
  browser and authenticator.
- Operational cutover, Flask retirement and external federation ownership
  remain explicitly out of scope.
- Existing backend and deployment risks are unchanged.

## 10. Decision

```text
UI73_AUTH_ARCHITECTURE_GO
```

UI.7.3 is complete within its authorized frontend scope. No commit or push was
performed.
