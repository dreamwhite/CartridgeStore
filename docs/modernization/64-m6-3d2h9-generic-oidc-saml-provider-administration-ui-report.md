# M6.3d.2h.9 — Generic OIDC/SAML Provider Administration UI

## Executive summary

M6.3d.2h.9 adds the provider-neutral federation administration UI to the
existing Next.js frontend. It uses the native Fastify federation administration
contracts from M6.3d.2h.8 and keeps Flask/Jinja routes unchanged. The UI is
development/test-only, opt-in, and remains disabled for production builds.

The milestone is **GO for isolated manual UI testing** and **NO-GO for
production federation or real-provider interoperability**.

## Initial repository state

The repository already contained the Next.js authentication UI, the isolated
Fastify writer, the native provider administration API, and the canonical auth
rewrites from M6.3d.2h.8. No provider administration UI existed. Existing
uncommitted work was preserved; no sibling `../PRG32` files were modified.

## Frontend architecture

- Next.js App Router, React, and TypeScript remain the frontend stack.
- Tailwind CSS uses the existing PRG32 theme variables and component style.
- TanStack Query owns provider, status, and identity-link server state.
- Zustand owns only transient selected-provider navigation state in
  `stores/federation-store.ts`.
- Passwords, client secrets, certificates, session data, CSRF tokens, and
  provider lists are not stored in Zustand or browser storage.
- The API client uses Zod response validation and same-origin credentials.

## Routes and navigation

The new App Router pages are:

- `/admin/federation` — overview and actual provider counts;
- `/admin/federation/providers` — provider listing;
- `/admin/federation/providers/new` — OIDC/SAML selection and creation;
- `/admin/federation/providers/[providerId]` — safe detail, edit, lifecycle,
  secret rotation, certificate replacement, and transaction revocation;
- `/admin/federation/identities` — explicit identity-link listing, linking, and
  retirement.

Navigation is shown only when the current authenticated principal has
`federation:read`. Direct access still goes through the session and permission
guards; the backend remains authoritative.

## Provider administration

The UI supports the verified backend operations:

- safe OIDC and SAML provider listing and detail views;
- generic OIDC creation with issuer, client, auth method, scopes, redirect URI,
  and one-time client-secret submission;
- generic SAML creation with entity IDs, SSO endpoint, ACS URL, persistent
  NameID, signed-response requirements, and PEM trust material;
- editing of mutable provider configuration;
- enable/disable with explicit confirmation;
- OIDC secret rotation through
  `POST /api/admin/federation/providers/:providerId/rotate-secret`;
- safe provider status and generation display;
- pending transaction revocation;
- SAML trust-set replacement within the backend’s two-certificate limit.

The backend safe provider response was extended additively with non-secret
configuration fields needed to rehydrate an edit form: discovery issuer,
redirect URI, scopes, SAML entry point/options, and certificate capacity/count.
PEM values, secrets, private keys, assertions, and tokens remain excluded.
Lifecycle mutation responses are validated separately as the backend’s safe
camelCase status envelope.

Redirect, ACS, and metadata URLs are displayed with copy actions. The UI uses
the configured provider value when the backend exposes it and otherwise shows
the current same-origin canonical path as a configuration aid; it does not
claim that a browser-origin preview overrides the backend public-origin
validation.

## Identity-link administration

Identity links are displayed using the safe backend fields: local user ID,
provider, protocol, issuer, subject, timestamps, and active/retired status.
Creation requires an existing local user ID and the exact protocol/provider/
issuer/subject tuple. There is no email or username matching, automatic user
creation, IdP-group role mapping, or reuse of retired identities.

Retirement is soft retirement through the existing backend endpoint and keeps
the backend’s last-authentication-method protection.

## Reauthentication, RBAC, and CSRF

Every sensitive UI action opens the reusable local administrator step-up dialog
and calls `POST /api/admin/federation/reauthenticate`. The password is cleared
before submission completes and is never persisted. The backend still decides
whether the session is recent enough, and every mutation separately acquires a
same-origin CSRF token and sends `X-CSRFToken`.

Read-only users can inspect permitted safe data but receive no usable mutation
controls. Manage actions remain protected by backend `federation:manage`,
browser-session, CSRF, recent-reauthentication, audit, and account checks.

Stable backend error codes are mapped to safe user-facing messages. Raw stack
traces, database errors, secrets, internal addresses, and protocol artifacts
are not rendered.

## Canonical routing and Flask isolation

The single `frontend/next.config.ts` now supports an explicit isolated mode:

- `PRG32_FEDERATION_ADMIN_INTEGRATION_ENABLED=true`;
- `PRG32_FEDERATION_ADMIN_FASTIFY_TARGET=http://...`;
- `PRG32_AUTH_INTEGRATION_ENABLED=true` and its Fastify target are required with
  federation administration;
- `/api/admin/federation/*` is narrowly rewritten to Fastify;
- the Flask `/api` catch-all excludes only `admin/federation` in that mode;
- unrelated Flask `/api/admin/*`, Jinja routes, and legacy admin integration
  paths remain unchanged;
- production builds reject the federation administration variables.

The root `docker-compose.yml` remains the only Compose file. The existing dev
profile can be used with the isolated writer by setting the two federation
target variables to the writer service origin, for example
`http://auth-writer:5090`, alongside the canonical auth integration variables.

## Verification evidence

Executed with Node.js 24 selected through `nvm use 24`:

- backend `pnpm run check`: **PASS** — 25 Vitest files, 130 tests;
- backend `pnpm audit --prod`: **PASS** — no known vulnerabilities;
- frontend `FLASK_PROXY_TARGET=http://backend:5080 pnpm run check`: **PASS** —
  TypeScript, ESLint, 10 Vitest files / 29 tests, and Next production build;
- focused backend federation administration test: **PASS** — 3 tests;
- focused frontend federation API/guard tests: **PASS** — 2 files / 5 tests;
- production federation activation guard: **PASS** — build rejected the
  development/test-only variables;
- `docker compose --profile dev --profile backend --profile writer-init
  --profile writer --profile prod --profile authentik-e2e config`: **PASS**;
- `git diff --check`: executed for final handoff;
- no deployment, production database access, commit, or push.

The Fastify app-injection administration regression suite verified local
session, CSRF, recent password reauthentication, provider creation, safe
redaction, lifecycle operations, identity linking, and retirement against
isolated temporary data. A full browser Next-to-Fastify administration run was
not claimed: no real provider was used and the complete Playwright lifecycle
matrix remains intentionally deferred.

## Remaining limitations and risks

- Real generic OIDC and SAML browser interoperability, HTTPS cookie behavior,
  and real certificate rollover are not verified here.
- There is no local-user lookup endpoint in the verified contract, so linking
  intentionally uses a validated existing numeric local-user ID.
- The UI supports safe trust-set replacement, not client-side certificate
  parsing or protocol validation; validation remains backend-only.
- Upstream OIDC/SAML logout and Flask/Fastify cutover remain out of scope.
- Existing backend safe status and provider response contracts are different;
  the client now validates each shape explicitly.

## Files changed

- `frontend/next.config.ts`
- `docker-compose.yml`
- `backend/src/federation/admin-routes.ts`
- `backend/tests/federation-admin.test.ts`
- `frontend/src/lib/api/federation-admin.ts`
- `frontend/src/lib/api/federation-admin.test.ts`
- `frontend/src/components/federation/FederationAdminGuard.tsx`
- `frontend/src/components/federation/FederationAdminGuard.test.tsx`
- `frontend/src/components/federation/FederationAdminShell.tsx`
- `frontend/src/components/federation/FederationWorkspace.tsx`
- `frontend/src/components/federation/ReauthenticationDialog.tsx`
- `frontend/src/stores/federation-store.ts`
- `frontend/src/app/admin/federation/**`
- `frontend/src/components/auth/AuthNavigation.tsx`

## Acceptance and decision

The provider-neutral isolated UI foundation is complete for the implemented
contracts. GO for a controlled manual isolated UI check. NO-GO for production
federation, deployment, Flask retirement, and real-provider interoperability.

## Next milestone

Recommend **M6.3d.2h.10 — Manual Generic OIDC/SAML Interoperability & Browser
Login Verification**. It may use Authentik only as a disposable generic
OIDC/SAML provider and must record actual callback, cookie, logout, unknown
identity, disabled-provider, replay, and certificate limitations. Do not start
that milestone automatically.
