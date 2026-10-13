# PRG32 Cartridge Store — M6.3d.2h.7 Next.js Authentication UI & Isolated Fastify Integration

Status: **complete for isolated local authentication UI and routing; GO for isolated manual UI testing; NO-GO for production federation**.

This milestone adds a real Next.js authentication surface connected to the isolated Fastify writer. Flask remains authoritative for the storefront and existing public rewrites. No provider administration, federation cutover, deployment, production database access, real IdP login, commit, or push was performed.

## 1. Executive summary

Implemented a responsive `/login` page, local username/email login, CSRF handling, dynamic OIDC/SAML provider listing, browser-based provider initiation, TanStack Query session awareness, isolated `/account` protected navigation, local logout, and an explicit development/test-only Next-to-Fastify proxy.

The browser-visible auth calls use `/__auth-fastify/*`. Fastify validates federation callbacks on canonical `/api/auth/...` paths, so the opt-in proxy also forwards only the canonical OIDC callback and SAML ACS paths. General Flask `/api`, `/auth`, and `/admin` rewrites remain unchanged and auth integration is disabled by default.

## 2. Scope

In scope: local login, current-user awareness, protected navigation, local logout, provider-neutral OIDC/SAML initiation, safe local return paths, same-origin cookie/CSRF handling, focused frontend tests, and disposable local integration.

Out of scope: browser token/assertion parsing, Authentik dependencies, real OIDC/SAML interoperability, upstream logout, provider or identity-link administration, Flask changes, firmware changes, production routing, deployment, production federation, commit, and push.

## 3. Files inspected

Reviewed modernization reports 19 and 54–61, then inspected the existing Next app, API clients, schemas, `frontend/next.config.ts`, Fastify auth/OIDC/SAML routes and services, federation provider validation, and `docker-compose.yml`.

Existing uncommitted work was preserved. The sibling `../PRG32` repository was read-only and not modified.

## 4. Frontend architecture changes

The existing Next.js, React, TypeScript, TanStack Query, theme, and API-helper architecture is reused. No Auth.js/NextAuth, Authentik SDK, token store, or client-side role database was introduced.

New layers:

- `frontend/src/lib/auth/config.ts` — build-time enabled flag and proxy prefix;
- `frontend/src/lib/auth/return-path.ts` — local return-path validator;
- `frontend/src/lib/auth/use-current-user.ts` — TanStack Query session hook;
- `frontend/src/lib/api/auth.ts` — typed auth API client and navigation URL builder;
- `frontend/src/components/auth/LoginPanel.tsx` — login UI;
- `frontend/src/components/auth/AuthNavigation.tsx` — session-aware controls;
- `frontend/src/components/auth/ProtectedRoute.tsx` — isolated navigation guard;
- `frontend/src/app/login/page.tsx` and `frontend/src/app/account/page.tsx`.

`AppShell` includes sign-in/account/sign-out controls when the integration is enabled. It does not protect or change legacy storefront pages.

## 5. Isolated routing design

`frontend/next.config.ts` adds the explicit opt-in namespace:

```text
/__auth-fastify/* -> configured Fastify target
```

Examples:

```text
/__auth-fastify/auth/csrf -> Fastify /auth/csrf
/__auth-fastify/api/auth/providers -> Fastify /api/auth/providers
/__auth-fastify/api/auth/oidc/<provider>/login -> Fastify OIDC start
```

Fastify validates OIDC and SAML callbacks against `/api/auth/oidc/:providerId/callback` and `/api/auth/saml/:providerId/acs`. The opt-in Next configuration forwards only those canonical callback paths to Fastify. It does not rewrite protocol payloads, XML, assertions, RelayState, or tokens.

All other existing Flask rewrites remain in place. The auth rewrite is not registered unless explicit development/test configuration is enabled.

## 6. Configuration variables

| Variable | Default | Purpose |
|---|---|---|
| `PRG32_AUTH_INTEGRATION_ENABLED` | `false` | Enables isolated auth only in development/test |
| `PRG32_AUTH_FASTIFY_TARGET` | unset | Required Fastify origin when enabled; credentials/paths rejected |
| `FLASK_PROXY_TARGET` | existing | Existing Flask target, unchanged |
| `PRG32_AUTH_PUBLIC_ORIGIN` | unset | Public origin supplied to the isolated writer |
| `PRG32_BACKEND_OIDC_PUBLIC_ORIGIN` | unset | Writer OIDC origin, sourced from auth public origin in Compose |
| `PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN` | unset | Writer SAML origin, sourced from auth public origin in Compose |

In Compose dev, the intended Fastify target is normally `http://auth-writer:5090`. The writer joins the private `app` network. The default Compose configuration keeps auth integration disabled.

Production builds fail if either auth integration variable is configured. The Fastify target is never embedded in browser code; only the boolean enabled flag is exposed.

## 7. Login page implementation

`/login` provides accessible labels, keyboard/focus behavior, responsive layout, existing theme variables, loading/disabled submit state, invalid-credential/session/network messages, safe return feedback, and dynamic provider buttons.

Local login remains usable if provider discovery fails. The password is held only in component state for submission, never put in a URL or storage, and cleared after successful login.

## 8. Local authentication integration

`frontend/src/lib/api/auth.ts` uses verified contracts:

1. `GET /__auth-fastify/auth/csrf` → Fastify `/auth/csrf`;
2. `POST /__auth-fastify/auth/login` → Fastify `/auth/login` with `X-CSRFToken` and JSON `{ username, password }`;
3. `GET /__auth-fastify/auth/me` → Fastify `/auth/me`;
4. `POST /__auth-fastify/auth/logout` → Fastify `/auth/logout` with CSRF.

The existing `requestJson` helper uses `credentials: "same-origin"`, validates known responses with Zod, and preserves stable backend codes without rendering raw details.

## 9. OIDC initiation

Enabled providers come from `GET /api/auth/providers`; IDs are not hardcoded. OIDC buttons navigate to:

```text
/__auth-fastify/api/auth/oidc/<encoded-provider-id>/login?return_to=<encoded-local-path>
```

Fastify performs discovery, PKCE, state, nonce, token, and callback validation. The frontend does not parse authorization codes or ID tokens. Real IdP login was not executed in this milestone.

## 10. SAML initiation

Enabled SAML providers navigate to:

```text
/__auth-fastify/api/auth/saml/<encoded-provider-id>/login?return_to=<encoded-local-path>
```

The frontend does not parse SAML XML, `SAMLResponse`, assertions, signatures, or RelayState. The canonical ACS path is forwarded only when the explicit integration is enabled. Real IdP POST login was not executed.

## 11. Session query architecture

`useCurrentUser()` uses TanStack Query key `['auth', 'current-user']`:

- successful `/auth/me` is the identity source;
- verified 401 becomes anonymous;
- network, 5xx, malformed, and other failures remain errors;
- retries are disabled;
- login invalidates the query;
- logout replaces cached user state with `null`;
- no cookie parsing, token decoding, localStorage, or sessionStorage is used.

The frontend never infers authentication from cookie presence or client-side role data.

## 12. Protected navigation

`ProtectedRoute` is used only by `/account`. It waits for session resolution, redirects anonymous users to `/login?reason=required&return_to=...`, preserves a validated local return path, displays backend/network errors, and never changes Flask route guards or claims cross-backend SSO.

Home, admin, Flask-backed routes, Jinja routes, and existing public navigation are not globally protected by the Fastify session.

## 13. Logout policy

The UI calls only local `POST /auth/logout`, obtains CSRF first, updates TanStack Query state, and navigates to `/login` after success. An already expired session clears local state and navigates to `/login?reason=expired` without falsely claiming a successful server mutation.

OIDC RP-initiated logout, SAML Single Logout, and upstream IdP termination are intentionally not implemented. PRG32 logout is local-only.

## 14. Error handling

Stable status/code classes map to concise messages for invalid credentials, disabled accounts, missing/expired CSRF, expired sessions, provider discovery failure, backend/network failure, and malformed responses.

The UI does not expose stack traces, SQL errors, JWTs, SAML XML, private keys, client secrets, or internal network addresses.

## 15. Cookie and callback origin analysis

The browser remains on the Next origin, so host-only session and correlation cookies are returned to the same host while Next forwards requests internally. No cookie values or protocol payloads are rewritten.

Enabled providers and writer origins must use the same public origin and canonical paths:

```text
<public-origin>/api/auth/oidc/<providerId>/callback
<public-origin>/api/auth/saml/<providerId>/acs
```

SAML correlation uses `SameSite=None; Secure`, so browser SAML testing requires an HTTPS public origin, such as the existing Traefik dev TLS setup. The local writer remains test-mode and disposable.

## 16. Provider-neutrality assessment

The frontend consumes only `provider_id`, `protocol`, `display_name`, and `enabled`. It contains no Authentik SDK, endpoint, claim, branding, management API, or provider-specific assumption.

## 17. Frontend tests added

Added tests for provider listing, no/mixed OIDC/SAML providers, disabled-provider omission, provider failure with local fallback, CSRF acquisition/header forwarding, local login and password non-persistence, logout method/CSRF, anonymous/authenticated/error session states, safe return paths and encoded bypasses, provider ID encoding, disabled integration, login refresh/navigation, and sanitized invalid-credential messages.

Files:

- `frontend/src/lib/api/auth.test.ts`
- `frontend/src/lib/auth/return-path.test.ts`
- `frontend/src/lib/auth/use-current-user.test.tsx`
- `frontend/src/components/auth/LoginPanel.test.tsx`

## 18. Integration verification

A disposable local integration used a temporary auth writer root and shadow database, Node 24 Fastify, and Next dev with explicit auth integration. No production data, credentials, Authentik, or sibling repository was accessed.

Verified through Next:

1. `/login` served by Next;
2. `/__auth-fastify/auth/csrf` reached Fastify;
3. session cookie preservation;
4. disposable bootstrap authentication;
5. authenticated `/__auth-fastify/auth/me`;
6. local logout success;
7. subsequent `/auth/me` returned 401.

Result: **Next-to-Fastify disposable integration PASS**. This proves local session routing, not real OIDC/SAML interoperability. Callback paths were verified by configuration and backend contract inspection; no provider callback was executed.

## 19. Backend regression results

Executed with Node 24 via `nvm use 24`:

```text
backend: pnpm run check                 PASS — 24 files / 126 tests
backend: pnpm audit --prod              PASS — no known vulnerabilities
frontend: pnpm run check                PASS — 8 files / 24 tests and Next build
production auth guard                   PASS — unsafe activation rejected
Compose dev/writer config               PASS
git diff --check                        PASS
```

The existing Vitest native-config ESM warning remains non-fatal. The full lifecycle Playwright matrix was not executed and is not counted as passed.

## 20. Security findings carried forward

M6.3d.2h.6 findings remain open:

- FND-01: lifecycle test routes rely on operational isolation;
- FND-02: recent administrator reauthentication is missing;
- FND-03: concurrent SAML duplicate-response testing is incomplete;
- FND-04: logout is local-only and does not terminate the upstream IdP session.

The new frontend does not expose lifecycle routes, provider administration, or identity-link administration, and does not resolve those findings.

## 21. Known limitations

- OIDC/SAML provider authentication was not manually executed.
- Provider records must contain the public canonical callback paths.
- SAML browser testing needs HTTPS because its correlation cookie is `Secure`.
- The Fastify session does not authenticate legacy Flask routes.
- Production federation remains disabled.
- Upstream federated logout is deferred.

## 22. Files changed

Application/configuration:

- `frontend/next.config.ts`
- `frontend/src/lib/api/schemas.ts`
- `frontend/src/lib/api/contracts.ts`
- `frontend/src/lib/api/auth.ts`
- `frontend/src/lib/auth/config.ts`
- `frontend/src/lib/auth/return-path.ts`
- `frontend/src/lib/auth/use-current-user.ts`
- `frontend/src/components/auth/LoginPanel.tsx`
- `frontend/src/components/auth/AuthNavigation.tsx`
- `frontend/src/components/auth/ProtectedRoute.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/account/page.tsx`
- `docker-compose.yml`

Tests:

- `frontend/src/lib/api/auth.test.ts`
- `frontend/src/lib/auth/return-path.test.ts`
- `frontend/src/lib/auth/use-current-user.test.tsx`
- `frontend/src/components/auth/LoginPanel.test.tsx`

Documentation:

- this report;
- `docs/modernization/19-revised-migration-roadmap.md`.

No Flask/Python, firmware, production database, or sibling-repository file was modified.

## 23. Acceptance criteria

| Criterion | Status |
|---|---|
| Functional Next.js login page | PASS |
| Local login connected to Fastify | PASS |
| CSRF correctly handled | PASS |
| Dynamic OIDC/SAML listing | PASS |
| Browser navigation for both protocols | PASS |
| Provider-neutral frontend | PASS |
| TanStack Query current-user state | PASS |
| Session expiration handling | PASS |
| Local logout | PASS |
| Isolated protected navigation | PASS |
| Flask public routing unchanged by default | PASS |
| Auth integration disabled by default | PASS |
| Production accidental activation rejected | PASS |
| Cookie/callback behavior documented | PASS |
| Safe return-path tests | PASS |
| Frontend tests/typecheck/lint/build | PASS |
| Backend regression suite | PASS |
| No production credentials/databases | PASS |
| No production federation/provider administration | PASS |
| No Flask/firmware changes | PASS |
| No commit or push | PASS |

Real OIDC/SAML interoperability and provider lifecycle remain intentionally unverified, not passed.

## 24. Next milestone recommendation

Next: **M6.3d.2h.8 — isolated manual federation interoperability and callback verification** using a disposable generic OIDC/SAML provider, HTTPS browser origin, and canonical callback URLs. It should verify provider-neutral login, cookies, callback POST routing, unknown identity, replay, and logout messaging without enabling production federation.

Provider administration, Fastify cutover, Flask retirement, and deployment remain separate milestones.
