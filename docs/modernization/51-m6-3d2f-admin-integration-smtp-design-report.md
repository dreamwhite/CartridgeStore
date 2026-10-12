# PRG32 Cartridge Store — M6.3d.2f Administrative API Integration & SMTP Contract Design

Status: complete for the explicitly enabled disposable Fastify/Next.js path.
Production remains Flask-authoritative. No deployment, production routing
change, database migration, SMTP delivery, secret persistence, or encryption
was implemented.

## 1. Executive summary

The existing Fastify administrative API is now consumable by the existing
Next.js 16 application through a typed client and a same-origin rewrite named
`/__admin-fastify`. The integration is disabled unless
`PRG32_ADMIN_FASTIFY_TARGET` is explicitly set, and production builds reject
that variable. The default Next.js proxy remains the Flask compatibility proxy.

The administrative workspace covers settings/assets, users, groups, roles,
token metadata/revocation, catalog metadata/architecture deletion, and
backup/restore. Navigation is derived from effective permissions returned by
Fastify. SMTP work is design-only: the legacy Flask behavior was inspected and
future contracts and security dependencies are documented below.

## 2. Existing frontend architecture

The actual frontend is a Next.js App Router application under `frontend/src`.
It already used React, TypeScript strict mode, TanStack Query, Zustand, Zod,
Tailwind CSS, a shared `AppShell`, a provider composition, an API request
helper, a theme store, and a small reusable `Button`. There were no existing
administrative pages, admin hooks, or admin API consumer.

The new workspace is `src/app/admin/page.tsx` plus
`src/components/admin/AdminWorkspace.tsx`. It extends the existing App Router
and provider architecture; it does not introduce a second frontend, router,
state library, or networking library.

## 3. Administrative API inventory

The inventory below reflects the existing Fastify routes. Flask paths and
Jinja routes were not removed or redirected.

| Area | Method/path | Auth and permission | Request/response contract |
|---|---|---|---|
| Settings | `GET /api/admin/settings` | browser session; `settings:read`; no CSRF | No body. Returns `{ok:true,settings,read_only}`. Writable settings are returned as typed setting views; read-only metadata includes safe SMTP status only. |
| Settings | `PATCH /api/admin/settings` | browser session + CSRF; `settings:write` | JSON allow-list patch. Returns the same settings envelope. Unknown keys are rejected. |
| Assets | `POST /api/admin/settings/assets/logo` and `/favicon` | browser session + CSRF; `settings:assets:write` | Multipart field `asset`; bounded validated image. Returns `{ok:true,asset}`. |
| Users | `GET /api/admin/users` | session; `users:read` | Query `page`, `limit`, `q`, `role`, `group_id`. Returns `{ok:true,users,page,limit,total}`. |
| Users | `POST /api/admin/users` | session + CSRF; `users:create` | JSON `username`, `email`, `password`, optional `password_confirm`, `role`, `group_ids`. Returns `{ok:true,user}` with 201. |
| Users | `GET /api/admin/users/:userId` | session; `users:read` | No body. Returns `{ok:true,user}`. |
| Users | `PATCH /api/admin/users/:userId` | session + CSRF; `users:update` | JSON allow-list `username`, `email`, `password`, `password_confirm`. Returns `{ok:true,user}`. |
| Users | `PATCH /api/admin/users/:userId/role` | session + CSRF; `users:roles:manage` | JSON `{role}`. Returns `{ok:true,user}`. |
| Users | `PUT /api/admin/users/:userId/groups` | session + CSRF; `users:groups:manage` | JSON `{group_ids}`. Returns `{ok:true,user}`. |
| Users | `DELETE /api/admin/users/:userId` | session + CSRF; `users:delete` | No body. Returns `{ok:true,user_id}`. |
| Groups | `GET /api/admin/groups` | session; `groups:read` | Query `limit`. Returns `{ok:true,groups,limit}`. |
| Groups | `POST /api/admin/groups` | session + CSRF; `groups:manage` | JSON `{name}`. Returns `{ok:true,group}` with 201. |
| Groups | `PATCH /api/admin/groups/:groupId` | session + CSRF; `groups:manage` | JSON `{name}`. Returns `{ok:true,group}`. |
| Groups | `DELETE /api/admin/groups/:groupId` | session + CSRF; `groups:manage` | No body. Returns `{ok:true,group_id}`. |
| Roles | `GET /api/admin/roles` | session; `roles:read` | No query/body. Returns `{ok:true,roles}`. Roles are static. |
| Tokens | `GET /api/admin/tokens` | session; `tokens:read:any` | Query `page`, `limit`, optional `user_id`. Returns `{ok:true,tokens,page,limit,total}`; metadata only. |
| Tokens | `DELETE /api/admin/tokens/:tokenId` | session + CSRF; `tokens:revoke:any` | No body. Returns `{ok:true,token_id}`. |
| Catalog | `GET /api/admin/cartridges` | session; `catalog:metadata:write` | Query `page`, `limit`, `q`, `version`, `architecture`. Returns `{ok:true,cartridges,page,limit,total}`. |
| Catalog | `GET /api/admin/cartridges/:cartridgeId` | session; `catalog:metadata:write` | Optional query `version`. Returns `{ok:true,cartridge}`. |
| Catalog | `PATCH /api/admin/cartridges/:cartridgeId` | session + CSRF; `catalog:metadata:write` | Query `version`; JSON `{metadata:{title,summary,description,tags,license,homepage,repository}}`. Returns `{ok:true,cartridge}`. |
| Catalog | `DELETE /api/admin/cartridges/:cartridgeId` | session + CSRF; `catalog:metadata:write` | Query `version`, optional `architecture`. Returns `{ok:true,id,version,architecture,deleted}`. |
| Backup | `GET /admin/backup/download` | session; `backup:export` | Optional transient `X-PRG32-Backup-Password`; binary attachment. |
| Backup | `POST /admin/backup/restore` | browser session + CSRF; `backup:restore` | Multipart `backup`; optional transient password header/form field. Returns `{ok:true,...}` and invalidates Fastify sessions after restore. |

Administrative failures use stable `code` values such as `auth_required`,
`admin_required`, `csrf_failed`, `admin_browser_session_required`,
`settings_unavailable`, `identity_conflict`, `protected_group`,
`catalog_recovery_required`, `catalog_inconsistent`, and
`admin_operation_failed`. The client keeps these codes and does not expose raw
exception strings.

## 4. Frontend integration strategy

All administrative requests use the fixed same-origin prefix
`/__admin-fastify`. Next rewrites that prefix only when
`PRG32_ADMIN_FASTIFY_TARGET` is configured. The normal `/api`, `/auth`,
`/admin`, `/editor`, `/publish`, `/scores`, `/stats`, `/static`, discovery,
and manifest rewrites still point to `FLASK_PROXY_TARGET`.

There is no fallback from a failed Fastify admin request to Flask. A missing or
HTML 404 response becomes `AdminIntegrationUnavailableError`, with a safe UI
message. This prevents a failed mutation from being retried against a second
writer.

## 5. Environment isolation

`PRG32_ADMIN_FASTIFY_TARGET` is server-only and is intentionally absent from
the default `.env.example` value. It is documented as disposable
development/test-only. `next.config.ts` rejects it when `NODE_ENV=production`
and rejects credentials or non-HTTP(S) targets. The production build still
requires a non-loopback `FLASK_PROXY_TARGET`.

Compose remains a single root `docker-compose.yml` with profiles. The `dev`
Next service passes the optional variable without enabling it by default.
Traefik labels, `store.prg32.dream.test`, `api.prg32.dream.test`, Flask routes,
and WebSocket access remain unchanged.

## 6. Typed API client

`frontend/src/lib/api/admin.ts` centralizes endpoint construction, request
types, response types, pagination shapes, safe projections, error mapping,
asset multipart handling, and backup download/restore. Paths are internal
allow-listed relative paths; callers cannot provide a backend origin or an
arbitrary URL.

The client uses the existing `fetch`/Zod request helper. It does not add Axios,
an RPC layer, or a second HTTP abstraction. Destructive requests have no
automatic retry. Passwords are used only for the single request and never
stored in localStorage or emitted in logs.

## 7. Authentication and CSRF

The client uses `credentials: "same-origin"`, so the browser keeps the
Fastify session cookie on the Next origin while Next performs the server-side
rewrite. Mutations obtain `/auth/csrf` through the same isolated prefix and
keep the token only in a module-local memory variable. No session or CSRF value
is persisted in localStorage.

The backend remains authoritative for browser-session-only mutation rules,
CSRF binding, bearer-only rejection, session expiry, revocation, and writer
availability. A restore clears the client CSRF state, invalidates relevant
TanStack Query state through the mutation lifecycle, and tells the operator to
authenticate again. The UI never changes cookie `Secure`/`SameSite` policy and
does not enable credentialed CORS.

## 8. RBAC-aware navigation

Fastify identity responses now include the optional compatible `permissions`
array, computed from `PERMISSIONS` and `AuthorizationService`. Existing fields
and identifiers are preserved. The workspace derives visible sections from
that array, including separate checks for settings, users, groups, roles,
tokens, catalog, and backup.

This is presentation logic only. Backend guards still enforce every operation.
An administrator without `editors` does not gain review permissions, an editor
does not gain user-management permissions, and a publisher/ordinary user gets
no administrative navigation.

## 9. Settings integration

The settings panel loads and edits only the backend writable setting views,
uses an explicit save action, displays server failure/success feedback, and
invalidates the settings query after mutations. Managed logo/favicon uploads
use the existing multipart routes and backend size/type validation.

Read-only values are not made editable. SMTP credentials, password hashes,
revocation markers, and internal storage details are not exposed. The existing
settings PATCH allow-list remains unchanged.

## 10. User administration

The workspace provides bounded listing, selection/detail, creation, email
update, role update, group replacement, and deletion. User rows expose only
the existing safe projection. Passwords are accepted only in create/update
forms and are never read back.

Destructive actions require confirmation. Success is shown only after the
server mutation completes, and list/detail queries are invalidated afterward.
Backend responses remain responsible for self-demotion, self-deletion,
last-administrator, role, conflict, and revoked-session behavior.

## 11. Group administration

Groups can be listed, created, renamed, and deleted through the existing
routes. The `editors` group is visibly protected in the UI and remains
protected by the backend. The UI does not infer administrator privileges from
group membership and does not duplicate group semantics.

## 12. Role administration

Roles are displayed as the static backend role list with level and user count.
There is no dynamic role creation or client-side role registry. Role assignment
uses the user role endpoint and backend validation.

## 13. Token administration

The token panel uses bounded pagination parameters and supports the backend
owner filter at the client boundary. It displays only token ID, owner, label,
creation timestamp, and last-used timestamp. Raw token values, hashes,
password hashes, CSRF secrets, and session secrets are never rendered.

Revocation is selective, confirmed, server-committed, and followed by query
invalidation. Administrator token minting was not added.

## 14. Catalog administration

The catalog panel lists and selects published cartridges, versions, and
architectures, displays `artifact_state`, edits only the documented metadata
allow-list, and deletes a selected architecture with explicit confirmation.
Immutable IDs, versions, authors, architecture identity, binary digest/size,
payload, signature, and filename are not editable.

The UI preserves `catalog_not_found`, `catalog_inconsistent`,
`catalog_metadata_invalid`, and `catalog_recovery_required` as stable backend
errors. Recovery-required mutations are not retried and current state remains
inspectable.

## 15. Backup/restore integration

The client reuses `/admin/backup/download` and `/admin/backup/restore`. Backup
passwords are transient headers and are not persisted or logged. Restore is
explicitly confirmed, browser-session-only, CSRF-protected, and never retried.

The successful restore path clears the in-memory CSRF state and presents a
reauthentication message because Fastify invalidates process-local sessions.
No second backup format or encryption behavior was introduced.

## 16. Error handling and mutation feedback

`ApiRequestError` preserves HTTP status and parsed stable error bodies. A
non-JSON proxy failure is classified as isolated-integration unavailable;
normal Fastify JSON failures retain their safe `error` and `code`. The UI
shows stable messages only and does not render response bodies, exception
traces, paths, credentials, or secret values.

Mutation buttons expose pending state, destructive operations require browser
confirmation, and no optimistic deletion or automatic retry is used.

## 17. Frontend security tests

Added deterministic tests cover:

- Fastify prefix selection rather than Flask `/api/admin` fallback;
- same-origin credentials and in-memory CSRF header behavior;
- no localStorage session/CSRF persistence;
- fail-closed missing isolated proxy;
- no retry after `catalog_recovery_required`;
- permission-derived navigation for a restricted administrator and a principal
  without administrative capabilities.

The frontend suite passed: 4 test files, 10 tests.

## 18. Backend regression tests

The Fastify suite passed unchanged in scope except for one auth assertion that
verifies the new optional effective-permissions response field:

`19 test files, 105 tests, typecheck, lint, and build: PASS`.

Existing auth, CSRF, bearer-only, writer-isolation, authorization, settings,
backup, catalog consistency, audit, and publication tests remained green.

## 19. Docker E2E evidence

Disposable named-volume runs passed and were cleaned up. The administrative
run verified writer initialization, bootstrap, browser session, CSRF, settings
read/write, user listing/create/group replacement/delete, group CRUD, role
visibility, token create/list/revoke, encrypted backup download/restore, and
post-restore session invalidation.

A separate real publication run uploaded one disposable cartridge bundle,
approved it through the review endpoint, listed it through admin catalog,
updated metadata, deleted only `qemu`, and verified `qemu` returned 400 while
`esp32c6` remained downloadable with 200. The audit/publication boundary was
therefore exercised without operational cartridges or production mounts.

A disposable Next.js container also served `/admin` and successfully proxied
`/__admin-fastify/health`. The dev image command was corrected to invoke Next
16 as `pnpm exec next dev --hostname 0.0.0.0`.

## 20. Flask compatibility

Flask remains the production backend, sole production writer, and default Next
proxy target. Existing Jinja admin pages, public storefront routes, auth
routes, firmware APIs, and WebSocket routes were not removed or redirected.

The isolated Fastify workspace replaces no Flask behavior. It provides a
separate consumer for Fastify administrative APIs during migration. Flask
administrative UI parity, SMTP delivery, OAuth/OIDC, SAML, and production
cutover remain future work or explicitly deferred scope.

## 21. SMTP legacy behavior

The Flask implementation is in `cartridge_store/auth/__init__.py`:

- host precedence: `PRG32_SMTP_HOST`, then stored `smtp_host`;
- port precedence: `PRG32_SMTP_PORT`, then stored `smtp_port`, default `587`;
- sender precedence: `PRG32_SMTP_FROM`, then stored `smtp_from`, default
  `noreply@localhost`;
- username/password precedence: matching environment variables, then stored
  `smtp_user`/`smtp_password`;
- STARTTLS precedence: `PRG32_SMTP_TLS`, then stored `smtp_tls`, default true;
- authentication is attempted only when a username is configured;
- `smtplib.SMTP(..., timeout=10)` is used, with `starttls()` when enabled;
- the sender has no separate configurable display-name contract and the
  registration subject/body are fixed in Python;
- in tests, the link is captured in `app.extensions` instead of sent;
- when no host is configured, Flask logs the full registration link, which is
  a compatibility behavior and a security risk;
- token creation is committed before delivery, so delivery failure is not
  transactionally coupled to SQLite and can leave a valid pending token.

The legacy settings page includes SMTP fields, but Fastify settings deliberately
does not expose them. Fastify currently reports SMTP as not configured and
delivery unavailable in its safe read-only settings projection.

## 22. Proposed SMTP API contracts

These are design contracts only and are not implemented in M6.3d.2f.

| Method/path | Proposed boundary |
|---|---|
| `GET /api/admin/smtp` | Browser session, `settings:smtp:read`; no CSRF. Return provider, host, port, TLS mode, sender address/name, enabled state, and `authentication_configured`; never return secrets. |
| `PATCH /api/admin/smtp` | Browser session + CSRF, `settings:smtp:write`; strict allow-list for provider/host/port/TLS/sender/name and explicit secret replacement sentinel; never treat empty secret fields as deletion. |
| `POST /api/admin/smtp/test` | Browser session + CSRF, `settings:smtp:test`; bounded recipient selected by policy, rate-limited, timeout-bounded, no arbitrary relay. Return a correlation ID and stable delivery result/error code. |
| `DELETE /api/admin/smtp/credentials` | Browser session + CSRF, `settings:smtp:credentials:delete`; explicit credential deletion, audit event, and deterministic disabled/authentication state. |

Future permission identifiers require a separate authorization review and must
not be simulated by the current settings permission.

## 23. SMTP provider architecture

Fastify should define a small provider interface with validated configuration,
transient message input, bounded connect/delivery timeouts, STARTTLS or
implicit TLS selection, optional authentication, sender identity, and
structured redacted diagnostics. The first provider should be SMTP only; a
queue, Redis, cloud provider, or external IAM is not justified by this
milestone.

Connection and delivery failures should return stable categories such as
`smtp_not_configured`, `smtp_configuration_invalid`, `smtp_connection_timeout`,
`smtp_authentication_failed`, and `smtp_delivery_failed`, with details kept in
server logs under secret-redaction rules. Retries must be explicit and bounded;
the administrative test operation must not silently duplicate delivery.

## 24. SMTP registration-delivery design

Registration creates and persists only a hash of a one-time token. A future
registration service should create the absolute link in memory, pass it to the
provider for one synchronous bounded send attempt, and never include the raw
token in logs, audit records, API responses, or persisted provider state.

If token creation succeeds and delivery fails, the API must return a stable
non-secret delivery failure and preserve the pending token semantics or mark it
for an explicit resend policy. It must not claim SQLite/SMTP atomicity. A
future resend operation should invalidate the previous pending token before
issuing a new one, matching Flask’s current replacement behavior.

## 25. SMTP credential-security requirements

Credential persistence is deferred to M6.3d.2g. It must require authenticated
encryption with a standard library, secure nonce generation, key separation,
key versioning, rotation/replacement, explicit deletion, tamper detection,
missing-key and wrong-key behavior, and redacted operational diagnostics.

Keys must not be stored in SQLite or application backups. Backups must either
exclude ciphertext credentials with an explicit restore state or define a
versioned portable rekey process; plaintext fallback is forbidden. SQLCipher
and custom cryptography require separate architecture decisions.

## 26. Dependencies on M6.3d.2g

M6.3d.2g must decide database/secret encryption, key custody, backup/restore
semantics, credential rotation, and failure behavior before any SMTP secret
field or SMTP write route is implemented. No new SQLite object, migration,
encryption dependency, plaintext setting, or credential persistence was added
here.

## 27. Files changed

Created:

- `frontend/src/app/admin/page.tsx`
- `frontend/src/components/admin/AdminWorkspace.tsx`
- `frontend/src/components/admin/AdminWorkspace.test.tsx`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/lib/api/admin.test.ts`
- `frontend/src/stores/admin-store.ts`
- this report.

Modified:

- `backend/src/auth/routes.ts` — optional effective permissions in compatible
  identity responses;
- `backend/tests/auth.test.ts` — response contract regression assertion;
- `frontend/next.config.ts` — explicit isolated Fastify rewrite gate;
- `frontend/.env.example` — documented server-only test variable;
- `frontend/src/lib/api/contracts.ts` and `schemas.ts` — optional permissions;
- `frontend/Dockerfile.dev` — correct Next 16 dev command;
- `docker-compose.yml` — optional dev-only Fastify target variable;
- `docs/modernization/19-revised-migration-roadmap.md` — M6.3d.2f evidence.

No Flask application file, Jinja template, production Docker route, database
schema, firmware repository file, or production data was modified by this
milestone.

## 28. Remaining risks and GO/NO-GO recommendation

Remaining risks are the known Flask legacy behavior of logging registration
links when SMTP is absent, lack of transactional coupling between registration
tokens and email delivery, the absence of SMTP credential encryption, and the
fact that the Fastify admin client is intentionally not production-routable.
Frontend test coverage is deterministic but does not replace browser-level
authentication testing against a real cookie jar; the disposable Docker E2E
covers the real HTTP proxy and writer contracts.

Recommendation: **GO for the next separately authorized migration milestone
only after review of this isolated integration. NO-GO for production Fastify
administration, SMTP implementation, credential persistence, database
encryption, Flask removal, deployment, or M6.3d.2g work in this milestone.**
