# PRG32 Cartridge Store — UI.9.3 Authenticated Experience Acceptance

Date: 2026-10-16  
Milestone: UI.9.3  
Scope: disposable authenticated frontend acceptance only

## 1. Executive summary

The disposable authenticated browser acceptance suite is implemented and passed. It exercises real Next.js pages, real browser cookies, real CSRF protection, and real Fastify API calls without Playwright route or API mocks.

Status: `UI93_AUTHENTICATED_ACCEPTANCE_INCOMPLETE`

The disposable scope is accepted for the flows verified below. The milestone remains incomplete because deterministic session-expiry behavior, a live WebAuthn ceremony, and live external federation were not verified. No claim is made for those unverified areas.

Preserved gates: `M555_BACKEND_FREEZE_GO`, `OPERATIONAL_CUTOVER_NO_GO`, `FLASK_RETIREMENT_NO_GO`.

## 2. Scope and safety boundaries

Only frontend acceptance harnesses, frontend test wiring, and one frontend cache correction were changed. No Fastify route, backend authentication behavior, Flask code, database schema, Docker/Compose service, Traefik configuration, Authentik configuration, DNS, TLS, production data, or operational account was changed.

All identities, credentials, cartridge bytes, database roots, and email messages used by the acceptance run were synthetic and disposable. Secrets are intentionally omitted from this report.

## 3. Baseline and repository state

The worktree was already substantially modified by preceding modernization milestones. Those changes were preserved; no reset, cleanup, commit, or push was performed. `git diff --check` passed after the UI.9.3 changes.

The backend freeze was treated as an explicit boundary. The existing backend and frontend milestone artifacts were reused rather than re-implementing backend behavior in React/Next.js.

## 4. Harness reuse and isolation

`frontend/scripts/serve-fullstack-disposable.mjs` now supports an opt-in authenticated disposable mode. The default UI.9.2 full-stack mode remains unchanged. Authenticated mode creates a fresh temporary canonical root, starts Fastify and Next.js, seeds identities through the public test bootstrap APIs, and removes the disposable runtime on exit.

The authenticated Playwright project is opt-in through `PRG32_E2E_AUTH_DISPOSABLE=1`; it does not alter `public-smoke` or `fullstack-disposable` project selection.

Status: `UI93_ISOLATION_GO`

## 5. Isolation proof

The harness uses a generated disposable root and synthetic bootstrap token. It does not use the operational SQLite database, cartridge store, shared Docker volumes, real Authentik, real users, or production routes. Browser assertions use same-origin Next.js requests and the real Fastify target configured by the harness.

Status: `UI93_RUNTIME_GO`

## 6. Runtime topology

The acceptance topology is a temporary two-process runtime: Next.js frontend with the normal development proxy and Fastify backend on disposable ports. The frontend owns browser rendering and navigation; Fastify remains authoritative for authentication, CSRF, RBAC, publishing, review, and storage APIs.

No public routing or operational service was started or changed.

## 7. Fixture identities and RBAC

The harness creates synthetic administrator, creator, reviewer, ordinary-user, second-user, and RBAC-probe identities. Reviewer permissions are assigned through the disposable bootstrap path. Passwords and tokens are never printed or stored in this report.

Status: `UI93_FIXTURE_IDENTITIES_GO`

## 8. Registration

The browser registered a synthetic user through the real registration UI, observed the disposable in-memory email message, completed the registration flow, and reached the authenticated account experience with the real session cookie.

Status: `UI93_REGISTRATION_GO`

## 9. Local login

The suite verified the real local login path through the UI and confirmed authenticated `/auth/me` state after navigation. No login endpoint was mocked.

Status: `UI93_LOCAL_LOGIN_GO`

## 10. Logout

The suite logged out through the authenticated UI, confirmed the session was no longer authenticated, and verified that protected navigation redirected to login.

Status: `UI93_LOGOUT_GO`

## 11. Session expiry

No deterministic expiry test was run. Reducing session lifetime or mutating runtime security configuration would have changed the acceptance environment beyond the requested disposable browser verification. A real expiry scenario remains open.

Status: `UI93_SESSION_EXPIRY_INCOMPLETE`

## 12. Identity switching and isolation

Two synthetic users were exercised in separate browser contexts. A token created by one user was not visible to the other user. Logout and context separation were verified through real API-backed UI state.

Status: `UI93_IDENTITY_ISOLATION_GO`

## 13. CSRF protection

The direct disposable contract check verified that a missing CSRF header is rejected, while the browser flows successfully use the real CSRF issuance and submission path for registration, token operations, password change, and publishing mutations.

Status: `UI93_CSRF_GO`

## 14. RBAC

An ordinary synthetic user received no administrative UI permissions and a direct browser request to the administrative API returned `403`. The administrator saw the administration entry point, and the reviewer saw the review queue.

Status: `UI93_RBAC_GO`

## 15. AccountWorkspace

The authenticated account workspace rendered with real current-user data. Account navigation, protected loading, and the passkey section were checked in the browser.

Status: `UI93_ACCOUNT_GO`

## 16. Password change

The password-change UI completed a real CSRF-protected mutation against disposable Fastify state. The test intentionally leaves password-change verification as the final authenticated mutation, avoiding a further login cycle that could obscure the result with rate-limit or cache state.

Status: `UI93_PASSWORD_GO`

## 17. API token management

The authenticated user created and dismissed a token through the account UI. Token visibility was then checked from a separate synthetic identity to verify ownership isolation.

Status: `UI93_API_TOKENS_GO`

## 18. Passkeys

The AccountWorkspace passkey panel and empty-state rendering were verified. A live WebAuthn ceremony was not run because no virtual authenticator was introduced for this milestone.

Status: `UI93_PASSKEY_INCOMPLETE`

## 19. External federation

No real OIDC or SAML login was initiated. This run did not access Authentik or any external provider, and it did not collect provider credentials, cookies, assertions, or tokens. Federation remains outside this disposable authenticated acceptance result.

Status: `UI93_FEDERATION_INCOMPLETE`

## 20. Administrative experience

The administrator account rendered the administration entry point and the disposable contract check read administrative users. An ordinary user was denied the corresponding API read. No operational administrative mutation was executed.

Status: `UI93_ADMIN_GO`

## 21. Creator workspace

The creator authenticated, created a draft, attached a valid synthetic cartridge bundle, and submitted it through the real creator workspace. The bundle generator uses the existing PRG32 cartridge header format and bounded synthetic bytes.

Status: `UI93_CREATOR_GO`

## 22. Publishing wizard

The publishing wizard was exercised with a distinct synthetic bundle identity. Attachment, submission, and progression through the wizard were verified against Fastify. An initial duplicate-bundle attempt exposed the expected duplicate conflict; the test was corrected to use a distinct fixture before the final run.

Status: `UI93_PUBLISHING_GO`

## 23. Review workspace

The reviewer authenticated, located the submitted synthetic item by manifest title, and approved it through the real review UI with the confirmation dialog.

Status: `UI93_REVIEW_GO`

## 24. Submission lifecycle

The disposable run covered creator draft creation, file attachment, submission, reviewer visibility, and approval. It did not publish or alter operational catalog data.

Status: `UI93_SUBMISSION_LIFECYCLE_GO`

## 25. Authenticated API contract matrix

The real disposable contract script and browser suite covered:

- anonymous `/auth/me` rejection;
- CSRF issuance and missing-CSRF rejection;
- local login, current-user state, and logout;
- administrator user listing and ordinary-user denial;
- creator draft listing, creation, and deletion;
- registration completion and authenticated session establishment;
- token creation and ownership isolation;
- password mutation;
- submission and review operations exercised by the UI.

No response contract was changed by this milestone.

Status: `UI93_AUTH_CONTRACTS_GO`

## 26. Responsive viewport matrix

Authenticated account rendering and theme interaction were checked at 375, 768, 1024, 1440, and 1920 CSS pixels. The suite asserted absence of horizontal overflow.

Status: `UI93_RESPONSIVE_GO`

## 27. Accessibility smoke coverage

The browser suite exercised accessible labels, named controls, button roles, dialog confirmation, keyboard-relevant focusable controls, and protected navigation semantics. No new axe dependency was introduced, so this is not a full automated WCAG audit.

Status: `UI93_ACCESSIBILITY_GO`

## 28. Console and network observations

The six authenticated tests completed without surfaced browser test failures. Requests used the same-origin Next.js proxy for frontend operations. The only direct backend request is the disposable in-memory email inspector used to complete registration. No authentication or API route was mocked with Playwright interception.

## 29. Frontend defects found and fixed

Registration completion returned a valid authenticated session, but the anonymous TanStack Query current-user cache could remain stale and redirect the new user back to login. `use-registration.ts` now clears sensitive query data and updates the current-user cache with the authenticated result before navigating to `/account`.

The creator workspace also had a test-environment condition that hid the draft list. The disposable authenticated mode explicitly enables that required authenticated surface without enabling it globally for unrelated tests.

## 30. Backend discrepancies

No backend discrepancy was found or changed in this milestone. The disposable auth harness initially consumed the backend test rate limit during contract and browser setup. The harness now supplies a high disposable-only authentication limit; production defaults are untouched.

## 31. Security regression result

The acceptance retained real CSRF, session-cookie, authentication, ownership, and RBAC enforcement. Synthetic bootstrap credentials are passed only to the disposable process. No credentials, cookies, API token values, password hashes, or federation artifacts were written to the report.

Status: `UI93_SECURITY_REGRESSION_GO`

## 32. Lifecycle and cleanup

The harness cleans disposable runtime roots after exit. Generated `.next-ui92` and `.next-ui93` disposable outputs were removed after verification. No temporary JSON, CSV, Markdown evidence, production database, operational volume, or shared infrastructure artifact was created.

Status: `UI93_CLEANUP_GO`

## 33. Commands and exact results

All Node commands were run after `nvm use 24`.

- `node --check` for the disposable server, contract script, and authenticated spec: passed.
- `pnpm --dir backend run build`: passed.
- `pnpm --dir backend run typecheck`: passed.
- `pnpm --dir backend run lint`: passed.
- `pnpm --dir backend run test`: `59` files passed, `295` tests passed.
- `pnpm run typecheck` in `frontend`: passed.
- `pnpm run lint` in `frontend`: passed after removing generated disposable Next output; the first lint invocation correctly exposed generated harness output and was not treated as a source pass.
- `pnpm run test` in `frontend`: `49` files passed, `107` tests passed.
- `pnpm run build` in `frontend`: passed; Next.js generated the production build and 40 static pages.
- Authenticated Playwright command with `--project=authenticated-disposable`: `6 passed`.
- Existing UI.9.2 disposable full-stack Playwright command with `--project=fullstack-disposable`: `3 passed`.
- `.venv313/bin/python -m pytest -q` without `SECRET_KEY`: `63 passed, 1 failed`; the mDNS test requires the existing startup secret guard when `TESTING` is false.
- `SECRET_KEY=prg32-ui93-test-only-secret .venv313/bin/python -m pytest -q`: `64 passed`.
- `git diff --check`: passed.

The Python failure was environmental invocation behavior, not a code change made by UI.9.3. The complete suite passed with an explicitly synthetic test-only secret.

Status: `UI93_FRONTEND_VALIDATION_GO`

## 34. Files changed for UI.9.3

Implementation and test files for this milestone:

- `frontend/scripts/serve-fullstack-disposable.mjs`
- `frontend/scripts/ui93-auth-contract.mjs`
- `frontend/playwright.config.mjs`
- `frontend/e2e/authenticated-disposable.spec.mjs`
- `frontend/next.config.ts`
- `frontend/src/components/workflow/creator/CreatorWorkspace.tsx`
- `frontend/src/components/auth/registration/use-registration.ts`
- this report

No Flask, Fastify, Python, Docker, Compose, deployment, or operational infrastructure file was changed for UI.9.3.

## 35. Blocked and unverified items

The following are deliberately not reported as passed:

- deterministic session expiry and post-expiry recovery;
- live WebAuthn registration/authentication ceremony;
- live OIDC federation against `sso.dream.test`;
- live SAML federation against `sso.dream.test`;
- production or cutover behavior;
- cross-browser coverage beyond the Chromium disposable project.

## 36. Remaining frontend debt

The next acceptance should add a controlled virtual-authenticator test if passkey ceremony coverage is required, and a disposable short-TTL session profile if expiry coverage is required. Those additions must remain isolated and must not alter production security defaults. External federation should continue to be verified only in the separately authorized federation milestone.

## 37. Next milestone recommendation

Proceed to the next explicitly authorized frontend acceptance or integration milestone only after deciding whether UI.9.3 should require live passkey and session-expiry evidence. Keep the backend freeze intact and retain the opt-in disposable authenticated project as the regression gate for future UI changes.

## 38. Final decision

`UI93_AUTHENTICATED_ACCEPTANCE_INCOMPLETE`

The verified disposable authenticated scope is GO, with six of six authenticated browser tests and all final backend/frontend/Python validation suites passing under the documented disposable invocation. The milestone as a whole is incomplete because session expiry, live WebAuthn, and live federation remain unverified.

`M555_BACKEND_FREEZE_GO` remains preserved.  
`OPERATIONAL_CUTOVER_NO_GO` remains preserved.  
`FLASK_RETIREMENT_NO_GO` remains preserved.

No commit or push was performed.
