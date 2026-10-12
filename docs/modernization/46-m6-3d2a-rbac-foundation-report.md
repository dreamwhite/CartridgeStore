# PRG32 Cartridge Store — M6.3d.2a Centralized RBAC Foundation

Status: **implemented in the isolated Fastify backend only**. This milestone
does not authorize Settings, User Management, Group Management, deployment,
Fastify production writes, Flask removal, or frontend changes.

## 1. Executive summary

The Fastify backend now has a static, typed authorization layer with the
following decision boundary:

`Principal -> persisted role/groups -> code-defined permissions -> resource ownership -> route security`

The implementation preserves the existing SQLite identity model and does not
add tables, migrations, role names, permission records, or a second identity
model. Existing session and bearer principals are still reconstructed from
SQLite on every request, so current persisted roles and group memberships are
used by every authorization decision.

## 2. Existing authorization model reconstructed

- Persisted roles remain `reader`, `user`, `player`, `publisher`, and `admin`.
- `editors` remains a group, not a role.
- Browser sessions resolve the current user from SQLite on each request.
- Bearer tokens resolve the token owner and current group memberships from
  SQLite on each request.
- Review listing, detail, verify, and reject require `editors`; an admin
  without that group remains denied.
- Backup export requires an authenticated administrator. Restore additionally
  requires a browser session and valid CSRF token.
- Metrics ingestion remains firmware-compatible and does not gain an
  authorization requirement. Metrics detail and exports preserve owner/admin
  authorization, including nullable anonymous ownership.
- Public catalog, discovery, score, and aggregate statistics routes remain
  public according to their existing contracts.

## 3. RBAC architecture

Added under `backend/src/authorization/`:

- `permissions.ts`: typed registry and explicit role/group mappings.
- `policies.ts`: deny-by-default evaluation, resource constraints, and the
  explicit catalog-admin policy.
- `service.ts`: reusable `AuthorizationService` facade and stable
  `AuthorizationError`.
- `guards.ts`: route adapter for permission checks; authentication, CSRF,
  writer gates, and feature gates remain outside RBAC.

Unknown permission identifiers, unknown groups, unknown roles, anonymous
principals, malformed principals, and invalid self-owned resources fail closed.
There is no wildcard permission or configurable hierarchy.

## 4. Final permission registry

The registry contains:

```text
settings:read                 settings:write
settings:assets:write         users:read
users:create                  users:update
users:delete                  users:roles:manage
users:groups:manage           groups:read
groups:manage                 roles:read
tokens:read:self              tokens:create:self
tokens:update:self            tokens:revoke:self
tokens:revoke:any             catalog:read
catalog:submit                catalog:publish
catalog:metadata:write       catalog:delete
submissions:read              submissions:review
submissions:reject            stats:read
runs:read:self                runs:read:any
runs:export:self              runs:export:any
backup:export                 backup:restore
```

Some identifiers are reserved for approved future administrative APIs. Their
presence does not create an endpoint or a database capability in this
milestone.

## 5. Role and group mapping

All authenticated persisted roles retain the current authenticated capabilities
for catalog submission, token self-management, and own-run reads/exports.
`admin` additionally receives settings, user/group/role, any-token revocation,
catalog administrative, any-run/export, and backup permissions.

Compatibility deviation recorded: the current Fastify and Flask publish/token
routes are authentication-only after login; they do not reject a persisted
`reader` role. The static mapping therefore preserves those existing
capabilities rather than silently tightening the contract. The reader role is
still denied all administrative, editorial, backup, and any-owner
permissions. A future explicit product decision can separate a truly
read-only role without changing this milestone's parity behavior.

The `editors` group grants only:

- `catalog:publish`
- `catalog:metadata:write`
- `catalog:delete`
- `submissions:read`
- `submissions:review`
- `submissions:reject`

It grants no user administration, settings, backup restore, or administrative
token-revocation capability. Submission review is therefore group-only, while
catalog administration is explicitly admin-or-editors. An administrator
without `editors` cannot review submissions; an editor without `admin` can use
the future catalog-administration policy but cannot manage users or restore
backups.

## 6. Resource authorization

The `:self` suffix is enforced as an ownership constraint, not as a global
permission:

- token self permissions require the authenticated principal ID to match the
  token owner used by the existing owner-scoped service calls;
- run self permissions require the run `user_id` to match the principal;
- nullable `runs.user_id` values are not treated as owned by a normal user;
  only `runs:read:any` can access them;
- `:any` permissions are explicit and currently mapped only where approved.

The existing metrics service now uses `AuthorizationService` for list/detail,
JSON, CSV, and Markdown export decisions. Token service methods remain
owner-scoped; no admin token-any endpoint was introduced.

## 7. Session, bearer, and CSRF integration

The existing `AuthService.context()` remains authoritative. It reloads the
principal from the current SQLite role and group rows for both valid browser
sessions and bearer tokens. No authorization claims are cached in the new
layer.

The following route behavior is unchanged:

- browser-session mutations still require the existing CSRF token;
- bearer token mutations retain bearer behavior and do not require browser
  CSRF where the existing route permitted bearer access;
- backup export accepts the existing supported authenticated mechanisms;
- backup restore rejects bearer-only requests before the permission decision
  and still requires a browser session plus CSRF;
- invalid or missing credentials retain their existing response envelopes.

Future user/group mutation work must add explicit invalidation/revocation
rules for existing sessions and tokens. M6.3d.2a does not introduce those
mutations and does not attempt to solve final-administrator protection.

## 8. Route integration inventory

Centralized permissions are now consumed by:

- authentication token list/create/update/revoke routes (`tokens:*:self`);
- submission upload routes (`catalog:submit`, preserving authentication-only
  behavior for all current persisted roles);
- review API and HTML list/detail/verify/reject routes (`submissions:*`);
- backup export/restore routes (`backup:*`);
- metrics list/detail and all export formats (`runs:*` through the service).

No new endpoint, method, path, response shape, firmware contract, writer
flag, or production route was added.

Remaining intentional exceptions:

- `auth/principal.ts` retains `roleAtLeast`, `authorizedForRole`, and
  `authorizedForGroup` as compatibility helpers for the existing principal
  API; active protected routes migrated by this milestone no longer call the
  role/group helpers directly.
- metrics, score, and firmware ingestion remain contract-driven rather than
  permission-gated; this preserves anonymous firmware compatibility.
- public catalog, discovery, scores, and aggregate statistics are not forced
  through authenticated permission checks.
- settings, users/groups/roles, direct catalog admin, and admin token-any APIs
  remain unimplemented and are intentionally not enabled by the registry.

## 9. Security invariants

The implementation and tests enforce anonymous denial, unknown role/group/
permission denial, no regular-user or editor user-management access, no
publisher review privilege, admin-without-editors review denial, catalog
admin-or-editors policy, ownership matching for self resources, nullable-run
protection, stable authorization errors, browser CSRF preservation, bearer
restore denial, and no permission grant based on frontend visibility.

The final-administrator invariant is documented for M6.3d.2c because this
milestone introduces no user-management mutation.

## 9.1 Docker E2E evidence

The following disposable commands were executed with a unique Compose project
and volume prefix:

```text
docker compose config                                  PASS
docker compose --profile dev config                    PASS
docker compose --profile writer-init run --rm auth-writer-init  PASS
docker compose --profile writer up -d auth-writer      PASS
curl http://127.0.0.1:5091/health                     200
curl http://127.0.0.1:5091/auth/me                    401, login required
curl http://127.0.0.1:5091/admin/backup/download       404, backup disabled
docker compose --profile writer down -v                PASS, disposable resources removed
```

The complete backup authorization matrix, including admin export, CSRF
failure, and bearer-only restore rejection, passed in the seven existing
`backup.test.ts` tests under `pnpm run check`. No production profile, bind
mount, operational database, or Traefik network was used by the E2E run.

## 10. Verification

Executed with Node 24.20.0 selected through `nvm use 24`:

```text
cd backend
pnpm run typecheck   PASS
pnpm run lint        PASS
pnpm run test        PASS — 16 files, 91 tests
```

The new `authorization.test.ts` covers registry uniqueness, all persisted
roles, anonymous/unknown/malformed principals, unknown permissions, editor
review boundaries, admin-or-editor catalog policy, self/any ownership, and
stable errors. Existing auth, backup, metrics, review, submission, score,
stats, compatibility, consistency, readonly, write-isolation, and application
tests passed in the same run.

`pnpm run check` passed after implementation, including the production build.
Docker Compose configuration and a disposable Fastify container smoke/E2E check
also passed. Frontend checks were not required by the boundary because this
milestone did not modify frontend code or response shapes; the existing
frontend verification was nevertheless executed: typecheck, lint, 5 tests,
and the production build passed when supplied with the required
`FLASK_PROXY_TARGET=http://flask:5080`. The initial build without that
environment variable failed as designed by `next.config.ts`.

The Flask regression command was attempted both as `python3 -m pytest -q` and
through the existing `.venv`. The system interpreter has no pytest. The
repository virtualenv ran 64 tests with 16 passed, 32 failed, and 16 errors;
the failures are environment/toolchain failures before application assertions:
the existing Python 3.9 virtualenv's `hashlib` module has no `scrypt`, while
Werkzeug authentication bootstrap requires it. No Flask code or application
behavior was changed to work around this unrelated baseline failure.

## 11. Compatibility and operational evidence

- No SQLite schema or index files were changed.
- No Flask file or companion `../PRG32` file was changed.
- No production data, operational database, production mount, or deployment
  route was accessed for mutation.
- Fastify writer and backup feature gates remain unchanged.
- No frontend changes were required.
- Docker validation used `docker compose config` and
  `docker compose --profile dev config`; the disposable writer profile used a
  unique project/volume prefix and was removed after the smoke test. No
  production bind mount was used.

## 11.1 Files created and modified

Created:

- `backend/src/authorization/permissions.ts`
- `backend/src/authorization/policies.ts`
- `backend/src/authorization/service.ts`
- `backend/src/authorization/guards.ts`
- `backend/tests/authorization.test.ts`
- `docs/modernization/46-m6-3d2a-rbac-foundation-report.md`

Modified:

- `backend/src/app.ts`
- `backend/src/auth/routes.ts`
- `backend/src/backup/routes.ts`
- `backend/src/review/routes.ts`
- `backend/src/submission/routes.ts`
- `backend/src/metrics/service.ts`
- `docs/modernization/19-revised-migration-roadmap.md`

## 12. Future frontend contract

Next.js should treat the backend as authoritative. A future authenticated
principal response may expose a stable, optional effective-permissions array
such as `{ permissions: string[] }`, but no public endpoint is introduced now.
The frontend should use it only to hide unavailable navigation/actions, handle
HTTP 403 consistently, and refresh after role/group changes; it must never be
the enforcement point.

## 13. Remaining risks and rollback

- Future user/group mutation APIs need session/token invalidation and final
  administrator safeguards.
- The registry includes approved future capability names that have no route;
  route implementation must continue to require explicit approval.
- Legacy helper functions remain exported for compatibility and need removal
  only after all consumers are migrated.
- Rollback is limited to reverting the isolated Fastify authorization files and
  route wiring; no schema or production-data rollback is required.

## 14. GO/NO-GO

**GO for the next isolated RBAC sub-milestone only:** the centralized
foundation and parity checks are complete for M6.3d.2a. **NO-GO** for
Settings API, User Management, Group Management, production Fastify writes,
Flask removal, deployment, or frontend administration until separately
authorized.
