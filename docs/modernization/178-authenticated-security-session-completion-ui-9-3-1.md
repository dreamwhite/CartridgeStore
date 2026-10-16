# PRG32 Cartridge Store — UI.9.3.1 Authenticated Security & Session Completion

Date: 2026-10-17

## 1. Executive summary

The targeted UI.9.3.1 acceptance checks were implemented against the existing disposable Next.js + Fastify harness. Real browser evidence now covers server-side session expiry and recovery, private cache clearing, bearer-token revocation, identity isolation, password-change rejection, Chromium virtual-authenticator WebAuthn, passkey management and the 50-cell authenticated responsive matrix.

Targeted result: `UI931_AUTH_SECURITY_COMPLETION_GO`.

The public regression project still has one unrelated pre-existing failure on `/stats` at 375px/light. Therefore global frontend validation remains `UI931_FRONTEND_VALIDATION_INCOMPLETE`; this does not invalidate the targeted authenticated completion decision.

Preserved: `M555_BACKEND_FREEZE_GO`, `OPERATIONAL_CUTOVER_NO_GO`, `FLASK_RETIREMENT_NO_GO`.

## 2. Scope and safety boundaries

Only frontend code, frontend tests and the disposable browser harness were changed. No Fastify, Flask, SQLite schema, Dockerfile, Compose, Authentik, Traefik, DNS, TLS, operational data or external federation configuration was modified.

The harness creates temporary SQLite, canonical storage, staging, session, token, passkey and email-transport state under a harness-owned temporary root. It starts its own Fastify and Next.js processes, uses a disposable bootstrap token and removes the runtime root on completion. No shared service or real account was used.

## 3. Starting baseline

UI.9.3 had already established the disposable authenticated environment but left expiry, live WebAuthn, cache/token regressions and a complete authenticated responsive matrix open. The repository was already dirty from prior modernization milestones; those changes were preserved.

The frontend baseline before this milestone was 49 Vitest files and 107 tests. After the cache regression test, it is 49 files and 108 tests.

## 4. Existing harness reuse

The existing `frontend/scripts/serve-fullstack-disposable.mjs` and `authenticated-disposable` Playwright project were reused. No second orchestration framework or default-on authenticated project was introduced. `public-smoke`, `fullstack-disposable` and `authenticated-disposable` remain separate opt-in/runtime paths.

The completion mode is opt-in through `PRG32_UI931_COMPLETION=1`. It enables WebAuthn only in the disposable Fastify process and sets the existing runtime setting `application_settings.session.lifetime_seconds` to 60 through the existing admin API after fixture seeding.

## 5. Disposable isolation proof

PASS. The harness-owned runtime root was created with `mkdtemp`, used as the canonical target/database root and checked for containment before startup. Fastify and Next.js were spawned by the harness on local disposable ports. The completion tests used `localhost` only for the WebAuthn origin and `127.0.0.1` for the direct disposable backend bearer check. No Docker volume, Dream service or operational process was attached.

## 6. Session model inventory

The backend session model uses a signed cookie plus server-side `auth_sessions` state. The cookie `Max-Age` is supplied from `auth.sessionLifetimeSeconds()`. The server-side record contains `expires_at`; an expired record is rejected and deleted when read. The runtime policy defaults to 86400 seconds but is dynamically read from `session.lifetime_seconds`. Recent reauthentication is separately tracked by `reauthenticated_at` and is required by sensitive passkey management operations.

The disposable completion runtime used the existing policy API to set a 60-second lifetime. This was necessary because the persisted runtime policy takes precedence over the environment fallback. No production default was changed.

## 7. Session expiry feasibility

`UI931_SESSION_MODEL_GO`. A supported deterministic mechanism exists: an isolated runtime policy setting, exposed by the existing admin API, changes the server session lifetime for the disposable database only.

`UI931_SESSION_EXPIRY_GO`. The test did not delete cookies, fake browser time or monkey-patch middleware. It authenticated through the UI, polled the real browser `/api/auth/me`, and observed the actual server transition from HTTP 200 to HTTP 401 after the 60-second policy elapsed.

## 8. Real expiry execution

PASS: disposable user `ui93-user-b` logged in through the real UI; `/api/auth/me` returned 200; the bounded poll waited for the server-side expiry; the same request then returned 401. The test used real cookies and real Fastify responses.

## 9. Post-expiry recovery

`UI931_SESSION_RECOVERY_GO`. Navigating to `/account` after the 401 redirected to the login entry point with the expected required/expired reason. Stale private content was not displayed. The public homepage remained accessible. A second real password login rebuilt the authenticated state and `/api/auth/me` returned 200.

## 10. Identity-switch regressions

`UI931_IDENTITY_ISOLATION_GO`. The token test created a token as `ui93-user-a`, logged out, logged in as `ui93-user-b`, and verified that the old token label/secret did not appear in the second identity's account. A direct backend bearer request was used only to verify the actual token contract without a browser session cookie masking the result.

The test also covers logout and reauthentication transitions without introducing a second auth store.

## 11. Private query-cache isolation

`UI931_PRIVATE_CACHE_GO`. `useCurrentUser` now clears sensitive query domains when a fetched current-user request normalizes an expired/unauthorized session to anonymous. The regression test asserts observable TanStack Query state: auth/workflow private entries are removed while a public catalog entry remains. The browser expiry test additionally verifies that protected navigation does not render stale account content.

The existing sensitive-query cleanup remains centralized and covers authentication, workflow, admin, federation, metrics, profile, token and passkey domains.

## 12. API token lifecycle

`UI931_API_TOKEN_SECURITY_GO`. Through the real account UI, a disposable token was created and its one-time secret was captured only in process memory. A direct request using that bearer secret returned 200 before revocation. Dismissal removed the visible one-time secret. Revoke performed the real CSRF-protected mutation; the same bearer request then returned 401. After logout and login as another disposable user, neither the label nor the secret was visible.

No secret, cookie, CSRF token or authorization header was printed or persisted.

## 13. Password/reauthentication behavior

`UI931_PASSWORD_REAUTH_GO`. A real account password-change attempt with an incorrect current password produced the stable failure message and preserved the authenticated session (`/api/auth/me` remained 200).

Passkey rename and revoke were found to require the existing backend recent-reauthentication contract. The smallest frontend correction adds a current-password prompt before those mutations and reuses the existing `/auth/reauthenticate` API. Fastify behavior was not changed.

## 14. WebAuthn feasibility

`UI931_WEBAUTHN_REGISTRATION_GO` and `UI931_WEBAUTHN_AUTHENTICATION_GO`. The disposable runtime already supports WebAuthn, challenge persistence, origin/RP ID verification and the SimpleWebAuthn browser adapter. The completion harness enables it only in the isolated runtime.

The first attempt with an IP-based RP candidate was rejected by WebAuthn origin/RP checks. The harness was corrected to use the existing supported browser secure-context-compatible `localhost` origin and matching RP ID. No backend validation was weakened.

## 15. Virtual authenticator setup

Chromium CDP `WebAuthn.enable` and `WebAuthn.addVirtualAuthenticator` were used with CTAP2, internal transport, resident-key support, user verification and automatic presence simulation. The authenticator was removed in a `finally` block. No third-party mock server, fabricated assertion or injected credential was used.

## 16. Passkey registration ceremony

PASS. The real account page prompted for the disposable current password and display name, obtained registration options from Fastify, executed `navigator.credentials.create()` through Chromium's virtual authenticator, and submitted the real response. Fastify returned the successful registration response and the credential appeared in the account passkey list.

## 17. Passkey authentication ceremony

PASS. The existing session was ended normally. The login page started the real passkey flow for `ui93-user-a`; Chromium executed `navigator.credentials.get()` against the virtual authenticator; Fastify verified the assertion and issued a new session. The browser reached `/account` as the correct disposable identity.

## 18. Passkey management

`UI931_PASSKEY_MANAGEMENT_GO`. Rename and revoke were exercised through the real account UI after the newly added frontend reauthentication prompt. Rename produced the new display name. Remove followed the backend's actual revocation semantics: the credential remained listed with `Revoked` status and its destructive control became disabled. No personal hardware passkey was used.

## 19. WebAuthn limitations

`UI931_WEBAUTHN_LIMITATION`: virtual-authenticator evidence proves the browser/Fastify ceremony for the disposable Chromium configuration only. It does not prove physical authenticator compatibility, mobile behavior, production TLS, external federation or production RP ID/domain configuration. Those remain outside UI.9.3.1.

## 20. Authenticated workspace inventory

The matrix used real disposable identities and guarded routes:

| Workspace | Route | Identity | Representative state |
|---|---|---|---|
| Account | `/account` | `ui93-admin` | Account/security controls |
| Admin | `/admin` | `ui93-admin` | Administrative panel |
| Creator | `/workspace` | `ui93-creator` | Creator Studio |
| Publishing | `/publish` | `ui93-creator` | Submission controls |
| Review | `/review` | `ui93-reviewer` | Review queue |

No route guard or permission check was bypassed.

## 21. Responsive viewport/theme matrix

`UI931_RESPONSIVE_MATRIX_GO`. The browser test executed all 50 combinations, not a sample:

| Workspace | 375 light | 375 dark | 768 light | 768 dark | 1024 light | 1024 dark | 1440 light | 1440 dark | 1920 light | 1920 dark |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Account | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Admin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Creator | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Publishing | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Review | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Viewport height was 900px. Each cell navigated to the actual route, asserted its heading, selected the requested theme through the real toggle and checked document overflow and visible controls.

## 22. Responsive usability findings

The matrix initially reproduced admin overflow at 375px. The cause was the administrative navigation and panel min-content sizing. The smallest correction makes admin panels/grid items width-constrained and wraps administrative navigation on narrow screens. The corrected matrix passed without horizontal document overflow. Tables retain their existing local overflow containers.

## 23. Accessibility findings

`UI931_ACCESSIBILITY_GO` for the targeted smoke scope. Real authenticated controls expose stable accessible labels for password and token fields; passkey and mutation controls are addressable by role; the new browser check confirms keyboard focus can reach the token field and Add passkey control. Dialog-based password/confirmation actions were exercised by Playwright's real browser dialog handling.

This is a regression smoke check, not WCAG certification or a full assistive-technology audit.

## 24. Browser console/network findings

The disposable runs showed only expected Node/Next warnings about experimental Web Crypto and module type/build tooling. No application failure was emitted by the passing UI.9.3.1 runs. The tests intentionally inspect only status codes and sanitized UI state; no cookies, secrets, CSRF values, private keys or Authorization headers are recorded.

## 25. Frontend defects found/fixed

1. `useCurrentUser` did not clear private query data after an expired session normalized to anonymous. Added observable sensitive-cache cleanup and a unit regression.
2. Passkey rename/revoke did not satisfy the existing recent-reauthentication contract. Added frontend password reauthentication before those mutations.
3. Admin narrow viewport layout propagated min-content overflow. Constrained admin panels and wrapped the admin navigation.
4. The test harness needed to apply the existing persisted 60-second session policy in completion mode; no backend or production setting was changed.

## 26. Backend discrepancies deferred

No backend discrepancy blocked UI.9.3.1. The backend's 403 for passkey management without recent reauthentication was an existing contract and is now honored by the frontend. The persisted runtime policy precedence over the environment lifetime fallback was documented and handled through the disposable admin API.

## 27. Security regression evidence

| Scenario | Expected | Observed | Result |
|---|---|---|---|
| Expired session `/api/auth/me` | 401 | 401 after server expiry | PASS |
| Expired protected navigation | Safe login entry, no stale private UI | Redirect and recovery message | PASS |
| Re-login after expiry | Correct identity/session | 200 and account restored | PASS |
| Token before revoke | Bearer accepted | 200 | PASS |
| Token after revoke | Bearer rejected | 401 | PASS |
| Token after identity switch | No cross-user visibility | No old label/secret | PASS |
| Wrong current password | Mutation rejected, session retained | Stable error and 200 `/auth/me` | PASS |
| WebAuthn registration | Fastify verifies browser ceremony | Credential listed | PASS |
| WebAuthn authentication | Fastify verifies assertion | Correct account session | PASS |
| Passkey revoke | Existing contract marks revoked | `Revoked`, control disabled | PASS |

## 28. Test harness lifecycle/cleanup

`UI931_CLEANUP_GO`. The harness stops its owned Fastify/Next processes, removes its temporary runtime root and removes its temporary build output on normal completion. Test commands used unique ports and no process-name killing. Generated `.next-ui92`/`.next-ui93` outputs were removed explicitly after interrupted diagnostic runs; no operational or shared directory was cleaned.

## 29. Validation commands/results

Node selection for all frontend checks: `source "$HOME/.nvm/nvm.sh" && nvm use 24`.

| Command/check | Result |
|---|---|
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS after removing harness-generated `.next-ui92` output |
| `pnpm --dir frontend run test` | PASS — 49 files, 108 tests |
| `pnpm --dir frontend run build` | PASS — Next 16.4.0, 40 static pages generated |
| UI.9.3.1 targeted Playwright suite | PASS — 5/5, plus accessibility check PASS separately (6/6 checks executed) |
| Existing authenticated disposable suite | PASS — 6 passed, 5 UI.9.3.1 tests skipped in non-completion mode |
| Existing full-stack disposable suite | PASS — 3/3 |
| Existing public-smoke project | 8/9 passed; one failure on `/stats` at 375px/light |
| `git diff --check` | PASS |

The public `/stats` failure is outside the authenticated scope and was not changed or masked. It is recorded as remaining acceptance debt.

## 30. Files changed

Milestone-owned changes:

- `frontend/scripts/serve-fullstack-disposable.mjs`
- `frontend/playwright.config.mjs`
- `frontend/e2e/authenticated-security-completion.spec.mjs`
- `frontend/src/lib/auth/use-current-user.ts`
- `frontend/src/lib/auth/use-current-user.test.tsx`
- `frontend/src/components/account/passkeys/PasskeysPanel.tsx`
- `frontend/src/components/account/passkeys/use-passkeys.ts`
- `frontend/src/components/admin/AdminWorkspace.tsx`
- `frontend/src/components/admin/AdminNavigation.tsx`
- `frontend/src/components/admin/admin-ui.tsx`
- `frontend/src/styles/index.css`
- `docs/modernization/178-authenticated-security-session-completion-ui-9-3-1.md`

The worktree contains many unrelated pre-existing modernization changes; they were not reset, cleaned, committed or pushed.

## 31. Blocked/unverified checks

- External OIDC/SAML federation: not tested by design.
- Authentik, Traefik, DNS, TLS and operational routing: not contacted.
- Hardware passkey and mobile authenticator compatibility: unverified.
- Full WCAG/assistive-technology audit: unverified.
- Public `/stats` 375px/light acceptance: failed and remains open.

## 32. Remaining acceptance debt

The next frontend task should isolate and correct the public `/stats` overflow at 375px/light, then rerun the public acceptance project. UI.9.3.1 itself has no remaining targeted auth/session/WebAuthn/responsive blocker. Operational cutover, federation and Flask retirement remain separately prohibited and are not implied by this report.

## 33. Final decision

Decision markers:

- `UI931_ISOLATION_GO`
- `UI931_SESSION_MODEL_GO`
- `UI931_SESSION_EXPIRY_GO`
- `UI931_SESSION_RECOVERY_GO`
- `UI931_IDENTITY_ISOLATION_GO`
- `UI931_PRIVATE_CACHE_GO`
- `UI931_API_TOKEN_SECURITY_GO`
- `UI931_PASSWORD_REAUTH_GO`
- `UI931_WEBAUTHN_REGISTRATION_GO`
- `UI931_WEBAUTHN_AUTHENTICATION_GO`
- `UI931_PASSKEY_MANAGEMENT_GO`
- `UI931_RESPONSIVE_MATRIX_GO`
- `UI931_ACCESSIBILITY_GO`
- `UI931_SECURITY_REGRESSION_GO`
- `UI931_CLEANUP_GO`
- `UI931_FRONTEND_VALIDATION_INCOMPLETE` — public `/stats` regression remains.
- `UI931_AUTH_SECURITY_COMPLETION_GO`

This is a disposable authenticated frontend acceptance result only. It does not authorize production cutover, external federation, Fastify changes, Flask retirement, deployment, commit or push.
