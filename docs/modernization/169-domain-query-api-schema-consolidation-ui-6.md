# PRG32 Cartridge Store — UI.6 Domain Query, API & Schema Consolidation

Date: 2026-10-16  
Scope: Next.js frontend query ownership, cache safety, runtime response
validation, schema/type ownership, shared transport boundaries, WebAuthn
options adaptation, and confirmed legacy-helper removal.  
Backend/API implementation: unchanged. Operational cutover: **NO-GO**.
Flask retirement: **NO-GO**.

## 1. Executive summary

UI.6 is **GO** for the authorized frontend boundary-consolidation scope.

The frontend now has domain-owned TanStack Query key factories for
authentication, account data, administration, workflow/review, federation,
catalog, metrics, profiles, scores, statistics, and setup. Readers and
invalidators use the same identities, with response-affecting parameters
represented in the key.

The authenticated cache boundary is explicit. Login removes private data
left by a previous identity before refreshing the current user. Logout and
expired-session handling remove private domain caches and replace the current
user with the anonymous value. Reauthentication removes the same private
cache families before redirecting.

Setup responses, which were previously trusted without a schema, are now
validated at the HTTP boundary. Existing schema-owned contracts were made the
source of several TypeScript response types. Administrative calls retain their
manual domain models but now validate the common successful response envelope
when a more specific schema is not supplied.

The WebAuthn browser options cast is centralized in one focused adapter. No
ceremony order, credential transport, RP configuration, CSRF behavior, or
backend contract changed.

Final decision markers:

```text
UI6_QUERY_KEYS_GO
UI6_INVALIDATION_GO
UI6_AUTH_CACHE_SAFETY_GO
UI6_ZOD_BOUNDARIES_GO
UI6_SCHEMA_TYPE_OWNERSHIP_GO
UI6_HTTP_CLIENT_GO
UI6_CSRF_CREDENTIALS_GO
UI6_WEBAUTHN_ADAPTER_GO
UI6_LEGACY_CLEANUP_GO
UI6_FRONTEND_REGRESSION_GO
UI6_DOMAIN_BOUNDARIES_GO

M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The GO decision is limited to the local source, tests, and disposable/public
read-only observations described below. It is not an authenticated browser
acceptance or operational deployment approval.

## 2. Scope and compatibility policy

Only UI.6 was implemented. The following were not changed:

- Fastify, Flask, Python code, backend packages, and backend tests.
- HTTP response structures, identifiers, firmware routes, or WebSocket
  behavior.
- SQLite, cartridge data, storage roots, Docker Compose, Dockerfiles, or
  deployment configuration.
- Traefik, Authentik, Mailpit, DNS, TLS, or shared infrastructure.
- Next.js routing, API-origin environment semantics, cookie behavior, or
  authentication ceremony ordering.
- `../PRG32`.

The worktree was already substantially dirty from earlier milestones. Those
changes were preserved. No reset, clean, database operation, deployment,
commit, or push was performed.

Internal frontend helpers that had no active consumers were eligible for
removal. External PRG32, firmware, Fastify, Flask, authentication, and
metadata contracts remained authoritative.

## 3. Starting architecture inventory

The UI.5 baseline reported 35 Vitest files and 87 passing tests. The source
audit found:

| Area | Starting condition | UI.6 action |
| --- | --- | --- |
| Current user | One exported tuple used by auth components | Moved to `authQueryKeys.currentUser()` |
| Auth/account | Inline tokens, passkeys, and provider keys | Moved to `authQueryKeys` |
| Workflow/review | Inline list/detail/mine keys plus one principal constant | Moved to `workflowQueryKeys` and `reviewQueryKeys` |
| Administration | Inline settings/users/groups/roles/tokens/catalog/audit keys | Moved to `adminQueryKeys` with root invalidation keys |
| Federation | Existing factory was colocated with the API module | Moved to the shared query-key ownership module |
| Public domains | Inline catalog, game, score, statistics, metrics, and profile keys | Added domain factories with response parameters |
| Setup | Client returned unvalidated values | Added state, progress, completion, and operation schemas |
| Contracts | Several hand-maintained types duplicated Zod shapes | Derived core wire types from schemas |
| WebAuthn | Two component-local opaque assertions | Centralized in one adapter |
| HTTP client | Three transport functions plus unused compatibility exports | Preserved transport distinction and removed confirmed-unused helpers |

The audit searched source imports, tests, route code, and package-level
frontend consumers before removing helpers. No generated or external package
entry point referenced the removed helpers.

## 4. Query key ownership before/after

The canonical source is:

`frontend/src/lib/api/query-keys.ts`

Representative factories now used by active consumers:

```ts
authQueryKeys.currentUser()
authQueryKeys.tokens()
authQueryKeys.passkeys()
adminQueryKeys.users({ page, search })
adminQueryKeys.user(id)
workflowQueryKeys.mine(page)
workflowQueryKeys.drafts()
reviewQueryKeys.queue(status)
reviewQueryKeys.submission(id)
catalogQueryKeys.list({ query, page, perPage })
catalogQueryKeys.game(gameId, version)
scoresQueryKeys.list({ game, player, limit })
statisticsQueryKeys.downloads({ granularity, limit })
```

Root keys are intentionally separate from concrete keys where invalidation
must cover all pages or filters:

- `adminQueryKeys.usersRoot()` covers every admin user list page/filter.
- `adminQueryKeys.catalogRoot()` covers published and moderation inventories.
- `adminQueryKeys.tokensRoot()` covers every admin token listing.
- `workflowQueryKeys.submissionsRoot()` covers all review queue filters.
- `workflowQueryKeys.mineRoot()` covers all creator submission pages/statuses.

The factories use readonly tuples and do not serialize objects into strings.
Tests prove that page, search, status, and other response-affecting values do
not collide.

## 5. Mutation invalidation changes

Invalidation was migrated together with the readers:

| Mutation | Invalidation behavior |
| --- | --- |
| Auth token create, rename, revoke | `authQueryKeys.tokens()` only |
| Passkey enrollment, rename, revoke | `authQueryKeys.passkeys()` only |
| Password login/passkey login | Remove private cache families, then invalidate current user |
| Logout or expired 401 | Remove private cache families, set current user to `null` |
| Admin settings/assets | `adminQueryKeys.settings()` |
| Admin user create/update/status/role/groups/delete | `adminQueryKeys.usersRoot()` and selected `adminQueryKeys.user(id)` where applicable |
| Admin group operations | `adminQueryKeys.groups()` |
| Admin token revoke | `adminQueryKeys.tokensRoot()` |
| Admin catalog metadata/moderation/delete | `adminQueryKeys.catalogRoot()` and selected `adminQueryKeys.cartridge(id, version)` |
| Creator draft operations | `workflowQueryKeys.drafts()` |
| Creator resubmission | `workflowQueryKeys.mineRoot()` plus drafts |
| Review approval/rejection | `workflowQueryKeys.submissionsRoot()` and selected submission detail |
| Federation provider/identity operations | Existing provider/status/identity factories |

No global “invalidate everything” mutation handler was introduced. Public
catalog, scores, statistics, and public content are not invalidated by
authenticated mutations without a data dependency.

## 6. Authentication cache safety

`frontend/src/lib/auth/query-cache.ts` now owns removal of sensitive response
data. It removes:

- Auth tokens and passkeys.
- Workflow and review data.
- Administrative data.
- Federation administrative data.
- Private metrics and profile query families.

It does not clear public catalog data. This distinction is tested with a real
`QueryClient`, not a mocked cache.

Session transitions intentionally use different operations:

- `invalidateQueries`: refresh current-user data after a successful login.
- `removeQueries`: discard user-bound data at logout, session expiry, user
  change, and reauthentication.
- `setQueryData`: represent the known anonymous current-user state after
  logout/expiry.
- `clear`: not used; unrelated public cache is retained.

No query persistence was added. Token values remain local component state and
are not written to Zustand, localStorage, or sessionStorage.

## 7. QueryClient policy assessment

The existing `QueryClient` remains intentionally small and has no new global
retry policy. Feature-level `retry: false` behavior remains in authentication,
workflow, administration, federation, metrics, and other sensitive areas.

This avoids retrying login, CSRF, permission-denied, or mutation requests. No
global cache clear or mutation registry was added.

## 8. Zod schema inventory

`frontend/src/lib/api/schemas.ts` remains the runtime schema source. Existing
validated boundaries include auth, catalog, workflow, federation, metrics,
profile, scores, statistics, and discovery responses.

UI.6 added:

- `setupStateSchema` and `setupStepSchema`.
- `setupStatusResponseSchema`.
- `setupProgressResponseSchema`.
- `setupAuthorizedResponseSchema`.
- `setupCompleteResponseSchema`.
- `setupResultResponseSchema`.
- `adminResponseSchema` for the common administrative success envelope.

The setup schemas preserve the backend enum values, nullable fields, CSRF
token requirement, public-origin shape, mDNS ABI, and installation state
values. Malformed state and incomplete progress fixtures are rejected.

## 9. Schema/type consolidation

`frontend/src/lib/api/contracts.ts` now derives the overlapping wire types
from Zod schemas for:

- Principal and API errors.
- CSRF and authentication responses.
- Authentication provider/token responses.
- Workflow submissions, drafts, and pagination.
- Catalog games and game lists.
- Discovery, statistics, scores, metrics, and profile responses.

This keeps the intentional distinction between wire responses and UI-specific
view models. It does not force admin-specific form input models or federation
write inputs into response types.

The administrative module still retains explicit domain models for its large
resource payloads. Its generic request path now at least validates the
success envelope; detailed nested admin schemas remain a bounded follow-up
because they require a full backend field-by-field contract inventory.

## 10. Setup response validation

`frontend/src/lib/api/setup.ts` now passes a schema to every JSON response
method:

- `getSetupStatus` validates installation state, infrastructure flags,
  origins, and mDNS metadata.
- `authorizeSetup` validates progress plus `authorized: true`.
- `getSetupProgress` validates completed steps, admin id, timestamps, CSRF,
  settings, and provider collection.
- `saveSetupStep` uses the same progress contract.
- `completeSetup` validates the terminal state and relative redirect.
- SMTP, OIDC, and SAML validation helpers validate their documented success
  envelope without fabricating nested provider data.

Invalid JSON still fails through the shared response-validation error path.
Setup endpoints and behavior were not modified.

## 11. Shared HTTP client changes

The shared client remains explicit:

- `requestJson`: base transport and response/error parsing.
- `requestApiJson`: explicit public API origin with dual-origin credentials.
- `requestSameOriginJson`: same-origin compatibility path for legacy public
  catalog, score, metrics, and statistics routes.
- `withCsrfToken`: shared header construction after each domain obtains its
  correct token.

The distinction was not collapsed. No Dream hostname was hardcoded and no
environment variable semantics changed.

Administrative responses now use `adminResponseSchema` when no more specific
schema is supplied. Binary backup download handling remains a raw `Response`
path because it is not JSON.

## 12. CSRF and credentials preservation

The migration preserves:

- `credentials: "include"` for dual-origin API requests and
  `"same-origin"` for same-origin compatibility requests.
- Existing `/auth/csrf` acquisition before protected auth mutations.
- Separate workflow and admin CSRF session caches because they target distinct
  proxy boundaries.
- Federation CSRF acquisition on the explicit API origin.
- Existing `X-CSRFToken` spelling, request methods, JSON bodies, and multipart
  body behavior.

Existing auth, client, federation, and workflow tests continue to assert
  request ordering, credentials, headers, and body construction.

## 13. Error handling consolidation

The shared client continues to distinguish:

- HTTP/API errors as `ApiRequestError` with stable status and parsed public
  error envelope.
- Invalid successful responses as `ApiResponseValidationError`.
- Network failures as native `TypeError` behavior for existing domain
  presentation helpers.

Domain-specific messages remain in auth, workflow, federation, admin, and
metrics modules. No raw response internals were exposed or logged by UI.6.

## 14. WebAuthn options adapter

`frontend/src/lib/auth/webauthn-adapter.ts` is the only component-facing
boundary that narrows the backend's opaque WebAuthn options object to the
SimpleWebAuthn browser JSON types.

Active consumers:

- `LoginPanel` uses `toAuthenticationOptions`.
- `AccountWorkspace` uses `toRegistrationOptions`.

The options response is first validated by
`passkeyOptionsResponseSchema`. The adapter does not invent fields, decode
challenges, alter RP IDs/origins, reorder ceremonies, log payloads, or enable
passkeys. The test is synthetic and does not claim a real authenticator
ceremony.

## 15. Legacy API helpers removed

Confirmed-unused exports removed from `frontend/src/lib/api/client.ts`:

- `getGames`.
- `getDiscoveryDocument`.
- `getCsrfToken`.

Active consumers use domain modules and the explicit `getAuthCsrf` helper.
`withCsrfToken` remains because auth, workflow, setup, admin, and federation
still consume it.

No external firmware or host-client helper was removed; these were internal
frontend exports with no active imports in source, tests, routes, or tooling.

## 16. Active consumer migration

The following active consumers now use canonical factories:

- `LoginPanel`, `AuthNavigation`, `AccountWorkspace`, and current-user hook.
- `AdminWorkspace` settings, users, groups, roles, tokens, catalog, audit,
  and principal panels.
- `DeveloperWorkspace`, `ReviewWorkspace`, and `WorkflowGuard`.
- `FederationWorkspace` provider, status, and identity views.
- `CatalogBrowser`, `GameDetail`, `Scoreboard`, and `StatisticsPage`.
- `MetricsWorkspace` and `ProfileWorkspace`.

No duplicate active inline query-key definitions remain in the frontend
source search.

## 17. Functional regression checks

Source and test coverage retained existing behavior for:

- Homepage, Explore, catalog search/filter/pagination, and cartridge details.
- Download URL construction and legacy same-origin catalog routing.
- Login presentation, logout client state, account security, and passkey
  entry points.
- Creator submissions, publishing workflow, review workflow, admin resource
  panels, and federation management.
- Metrics/profile authorization presentation.
- Theme switching and documentation component navigation.

No authenticated real-user acceptance was attempted. No credentials or
provider sessions were used.

## 18. Tests added or updated

New focused tests:

- `frontend/src/lib/api/query-keys.test.ts` — key parameter isolation and
  stable prefixes.
- `frontend/src/lib/api/setup.test.ts` — valid setup response acceptance and
  malformed state/progress rejection.
- `frontend/src/lib/auth/query-cache.test.ts` — private cache removal without
  public catalog removal.
- `frontend/src/lib/auth/webauthn-adapter.test.ts` — synthetic opaque-options
  adapter behavior.

Updated tests include auth navigation compatibility and existing frontend
component/API tests affected by the removed key/helper exports.

## 19. Validation commands and results

All commands below used Node.js 24.20.0 through `nvm use 24`.

| Command | Result |
| --- | --- |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test -- --run` | PASS — 39 files, 93 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0, 40 static generation units |
| `git diff --check` | PASS |
| Read-only Playwright smoke: `/`, `/explore`, `/login`; 375/1440px; light/dark toggle | PASS — no horizontal overflow |
| Read-only Playwright `/docs` navigation against live edge | NOT VERIFIED — repeated 15/30 second navigation timeout |

The initial browser attempt was not counted as a pass. The successful reduced
smoke is reported separately from the `/docs` live-edge limitation.

## 20. Files changed

UI.6 implementation files:

- `frontend/src/lib/api/query-keys.ts`
- `frontend/src/lib/api/query-keys.test.ts`
- `frontend/src/lib/api/schemas.ts`
- `frontend/src/lib/api/contracts.ts`
- `frontend/src/lib/api/setup.ts`
- `frontend/src/lib/api/setup.test.ts`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/lib/api/auth.ts`
- `frontend/src/lib/api/federation-admin.ts`
- `frontend/src/lib/auth/query-cache.ts`
- `frontend/src/lib/auth/query-cache.test.ts`
- `frontend/src/lib/auth/webauthn-adapter.ts`
- `frontend/src/lib/auth/webauthn-adapter.test.ts`
- active auth, account, admin, workflow, federation, catalog, metrics,
  profile, and statistics consumers listed in section 16.

One new Markdown document was created by this milestone:

`docs/modernization/169-domain-query-api-schema-consolidation-ui-6.md`

No backend file was modified for UI.6.

## 21. Remaining architecture debt

- Administrative nested payloads still use explicit TypeScript resource
  models. The common success envelope is validated, but a full admin schema
  family would require a separate field-by-field contract pass.
- Several large orchestration components remain intentionally monolithic;
  this is UI.7 scope.
- Real authenticated browser acceptance remains dependent on a validated
  disposable identity/runtime and was not attempted.
- Live `/docs` edge navigation timed out during this read-only smoke. Local
  component tests and production build passed, but this observation is not
  treated as a live-route pass.
- UI.5 raw-token cleanup and the existing `--color-focus` compatibility alias
  remain documented debt outside UI.6.

## 22. Deferred UI.7 work

UI.7 may address component responsibility splitting, especially:

- `AdminWorkspace` panel extraction.
- `LoginPanel` orchestration and auth presentation separation.
- `AccountWorkspace` feature separation.
- `ReviewWorkspace` and publishing workflow decomposition.

UI.6 deliberately did not move form state to Zustand, restructure the App
Router, redesign layouts, add Fumadocs, or introduce a generic application
framework.

## 23. Next milestone readiness

UI.7 can start for frontend SRP/component orchestration work. It should reuse
the query factories, schema-derived wire types, cache safety helper, and
WebAuthn adapter established here.

Before real authenticated browser acceptance or operational cutover, the
runtime/identity gates from previous reports still need to be resolved. The
`/docs` timeout also merits a separate edge/runtime diagnosis if live
documentation navigation is required.

## 24. Final decision

```text
UI6_DOMAIN_BOUNDARIES_GO
UI6_QUERY_KEYS_GO
UI6_INVALIDATION_GO
UI6_AUTH_CACHE_SAFETY_GO
UI6_ZOD_BOUNDARIES_GO
UI6_SCHEMA_TYPE_OWNERSHIP_GO
UI6_HTTP_CLIENT_GO
UI6_CSRF_CREDENTIALS_GO
UI6_WEBAUTHN_ADAPTER_GO
UI6_LEGACY_CLEANUP_GO
UI6_FRONTEND_REGRESSION_GO

M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

UI.6 is complete for its authorized implementation scope. No commit or push
was performed.
