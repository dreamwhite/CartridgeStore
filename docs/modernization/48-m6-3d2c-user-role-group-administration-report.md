# PRG32 Cartridge Store — M6.3d.2c User, Role & Group Administration

**Status:** implemented and verified in the isolated Fastify/TypeScript writer
profile only.
**Date:** 2026-10-12

Flask remains the authoritative production backend and sole production writer.
This milestone does not deploy Fastify, modify Flask, add schema objects, alter
firmware contracts, add a Next.js interface, or start M6.3d.2d.

## 1. Executive summary

The Fastify backend now exposes strict JSON administration APIs for users,
predefined roles, groups, and complete user-group membership replacement. The
implementation reuses M6.3d.2a permissions and applies the security decision
inside SQLite `BEGIN IMMEDIATE` transactions rather than treating RBAC as a
frontend concern.

Security-sensitive changes revoke the target user's API tokens and write a
durable per-user session-revocation marker into the existing `store_settings`
key/value table. No new table, index, migration, role, permission, or ID model
was introduced. Existing opaque sessions are rejected when their creation time
is older than the marker; new login sessions are issued after the marker.

A bounded append-only JSONL audit file records attempted, committed, failed,
and rejected administrative mutations. Its directory and file are controlled
by the disposable writer boundary, use mode `0600`, reject symlinks, and have a
10 MiB cap.

## 2. Existing identity model

The implementation preserves:

- users, api_tokens, groups, user_groups, and registration_tokens;
- role vocabulary `reader`, `user`, `player`, `publisher`, `admin`;
- existing numeric user, group, and token identifiers;
- the exact `editors` group identity;
- existing foreign-key behavior, including token/group cascade and the
  existing restriction behavior for historical references such as runs;
- Werkzeug-compatible password hashes and SHA-256 API-token hashes;
- public registration's fixed `user` role and the existing
  `auth_allow_registration` setting behavior.

Passwords, password hashes, token hashes, registration-token hashes, external
IDs, session secrets, and bootstrap secrets are never returned by the new APIs.

## 3. Implemented API inventory

Users:

- `GET /api/admin/users` — bounded page/limit listing with deterministic
  `created_at ASC, id ASC` ordering and optional bounded `q`, `role`, and
  `group_id` filters.
- `GET /api/admin/users/:userId` — safe user projection.
- `POST /api/admin/users` — explicit local account creation; password required.
- `PATCH /api/admin/users/:userId` — username, email, and optional password
  only.
- `PATCH /api/admin/users/:userId/role` — predefined role assignment only.
- `PUT /api/admin/users/:userId/groups` — complete replacement of group IDs.
- `DELETE /api/admin/users/:userId` — protected account deletion.

Groups:

- `GET /api/admin/groups` — bounded deterministic listing with user counts.
- `POST /api/admin/groups` — validated unique group creation.
- `PATCH /api/admin/groups/:groupId` — validated rename.
- `DELETE /api/admin/groups/:groupId` — membership cleanup plus deletion.

Roles:

- `GET /api/admin/roles` — read-only predefined roles, levels, and counts.

There are deliberately no role create/update/delete routes and no administrative
token-management routes.

## 4. RBAC integration

Routes use the centralized `AuthorizationService` and `permissionGuard`:

- `users:read`
- `users:create`
- `users:update`
- `users:delete`
- `users:roles:manage`
- `users:groups:manage`
- `groups:read`
- `groups:manage`
- `roles:read`

All mutations require an authenticated browser session and valid CSRF token;
bearer-only mutations are rejected. Anonymous users, ordinary users, readers,
publishers, and editors do not receive user/group administration permissions.
The `editors` group does not inherit administrator permissions. No individual
administrative route performs a direct role comparison.

## 5. User creation, update, and deletion semantics

Creation requires username, email, and password. Usernames are bounded and
restricted to a safe ASCII identifier form; emails are normalized to lowercase;
the existing 10-character password policy and scrypt hash implementation are
reused. The default role is `user`. An administrator may explicitly request a
predefined role, including `admin`, but arbitrary roles are rejected and role
assignment permission is required for non-default roles.

Generic PATCH accepts only username, email, password, and confirmation. Role
and groups have separate endpoints. Empty password changes, unknown fields,
invalid identifiers, malformed groups, duplicate group IDs, and invalid roles
are rejected before mutation.

Deletion removes associated API tokens and relies on the existing foreign-key
semantics for historical data. If existing protected references prevent the
delete, the transaction rolls back and returns a stable conflict error; no
historical metrics or submission records are rewritten.

Legacy externally provisioned users with nullable `password_hash` remain
readable as existing accounts but cannot be given an empty password through
this API. No external identity provider was added.

## 6. Role administration

Roles are a fixed projection of the existing `ROLE_LEVELS`. The API cannot
create roles, edit permission definitions, or change role levels. Role changes
are audited, revoke target credentials, and are immediately reflected in fresh
principal resolution.

## 7. Group administration and protected editors

Group names are normalized lowercase and must match the bounded identifier
allow-list. Uniqueness conflicts become stable `identity_conflict` responses.
The `editors` group is verified rather than repaired automatically. If it is
missing, administration returns `admin_identity_inconsistent` and does not
silently create a replacement.

The exact `editors` group cannot be renamed or deleted. Its membership may be
replaced by an administrator; membership changes revoke the affected user's
credentials and are audited. Other groups can be created, renamed, assigned,
and deleted transactionally. Deleting a group explicitly removes its
memberships before deleting the group, without orphan rows.

## 8. Final-administrator invariant

Role demotion and user deletion acquire `BEGIN IMMEDIATE`, resolve the target
inside the transaction, and count current administrators before applying the
mutation. If the target is the final administrator, the operation returns
`final_administrator_required` and rolls back. Concurrent role changes cannot
both observe the same final-administrator state because the second writer waits
for and then re-reads after the first transaction.

Administrators may create additional administrators. The invariant is not a
frontend count and is not based on cached state.

## 9. Self-demotion and self-deletion

The actor ID comes from the trusted authenticated principal, never the request
body. An administrator cannot demote or delete their own account, even when
other administrators exist. The checks are inside the same transaction as the
target lookup and mutation, so generic PATCH, dedicated role routes, DELETE,
and group membership routes cannot provide an alternative self-demotion path.

Rejected self and final-administrator operations generate failed/rejected audit
records when the audit boundary is available.

## 10. Session and API-token invalidation

For password changes, role changes, group replacement, and account deletion:

1. the mutation transaction deletes all target-user API tokens;
2. the same transaction updates `store_settings` key
   `auth_revoked_before:<user_id>`;
3. `AuthService.context` rejects an older browser session against that marker;
4. bearer lookup immediately fails because the token row was deleted;
5. new login sessions use a timestamp strictly after the marker.

The marker is durable across restart and visible to separate SQLite writer
connections. This is intentionally not an in-memory revocation list. The
existing process-local session map still means ordinary session cookies are
not portable across a process restart; the durable marker provides the
additional invalidation guarantee required for live multi-process writer
instances without a schema migration.

## 11. Registration-policy compatibility

`auth_allow_registration` continues to be read on every registration request.
The new tests verify that disabling the setting rejects new registration
requests and re-enabling it restores the existing request flow. Public
registration continues to create role `user`; no admin role or SMTP workflow
was added. Existing pending registration tokens retain the current
`completeRegistration` behavior and are not silently invalidated by this
milestone.

## 12. SQLite transaction boundaries

All logical mutations use one existing writer connection and `BEGIN IMMEDIATE`:

- user insert plus initial memberships;
- profile/password update plus token deletion and session marker;
- role update plus final-admin check, token deletion, and marker;
- complete membership replacement plus token deletion and marker;
- user deletion plus credential invalidation;
- group creation, rename, membership cleanup, and deletion.

Foreign keys remain enabled. No DDL, hidden index creation, schema migration,
or filesystem work occurs inside the SQLite transaction.

## 13. Audit-trail architecture and limitations

Audit path: `<auth disposable root>/admin-audit.jsonl`.

Each record contains only `event_id`, timestamp, actor user ID, target type/ID,
action, outcome, and request ID. Records are bounded to 4 KiB; the file is
bounded to 10 MiB; file and directory symlinks are rejected; writes use
append, `fsync`, and mode `0600`.

Mutation preflight is fail-closed: if the audit directory/file cannot be made
ready, SQLite is not changed. An `attempted` event is written before the
transaction, then `committed` or `failed` after the SQLite outcome. A
post-commit filesystem failure cannot roll back SQLite, so the two persistence
systems are not claimed to have an atomic shared commit. In that rare case the
mutation remains committed and the committed audit line may be absent; this
limitation is explicit and is preferable to fabricating a success record.

## 14. Authorization and concurrency test matrix

`backend/tests/admin.test.ts` covers:

- anonymous and ordinary bearer denial;
- admin session reads and CSRF/bearer mutation boundaries;
- strict unknown-field, duplicate, invalid-role, invalid-group, and invalid
  password handling;
- user creation, listing, duplicate conflict, profile update, password change,
  role assignment, group replacement, and deletion;
- all five predefined roles and no role mutation endpoints;
- group create, duplicate, rename, delete, membership replacement, and
  protected editors rename/delete rejection;
- editor membership effect and immediate revocation;
- self-demotion/self-delete rejection;
- password, role, group, and deletion credential invalidation;
- registration setting enabled/disabled behavior;
- audit record content, secret non-disclosure, restart-persistent file, and
  broken-audit fail-closed behavior;
- two separate SQLite connections attempting opposing administrator demotions;
  exactly one succeeds and the final database still has one administrator.

The concurrency test uses separate writer connections and the same
`BEGIN IMMEDIATE` path. The database assertion is the final authority, not the
order in which promises resolve.

## 15. Verification results

- `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run check` in
  `backend/`: **passed** — typecheck, ESLint, 18 test files / 100 tests, and
  TypeScript build.
- Frontend implementation was not changed; the prior shared foundation check
  remains typecheck/lint/tests passed and production build passed with
  `FLASK_PROXY_TARGET=http://flask:5080`.
- `docker compose config` and all relevant profile configuration: **passed**.
- Backend multistage image build: **passed**.
- Disposable Docker E2E: **passed** for health, bootstrap, user listing and
  creation, role/group operations, editor authorization and revocation,
  password/session/token invalidation, self-protection, protected editors,
  audit persistence across restart, disabled writer 503, and named-volume-only
  writer mounts. Disposable containers and volumes were removed.
- Flask differential regression in a temporary Python 3.13 environment:
  **63 passed, 1 failed**. The single failure is the pre-existing
  `test_mdns_registers_prg32_service`: it invokes `create_app` with
  `TESTING=False` and no `SECRET_KEY`, so the current Flask startup guard
  raises before the mDNS assertion. No Flask code was changed.
- `git diff --check` and Python compilation checks: **passed**.

## 16. Files changed

Added:

- `backend/src/admin/audit.ts`
- `backend/src/admin/routes.ts`
- `backend/src/admin/service.ts`
- `backend/src/auth/revocation.ts`
- `backend/tests/admin.test.ts`
- this report

Modified:

- `backend/src/app.ts` — registration of identity administration routes/service.
- `backend/src/auth/routes.ts` — use durable-aware session rotation.
- `backend/src/auth/service.ts` — session revocation checks and password-hash
  helper reuse.
- `backend/src/auth/session.ts` — preserved opaque session contract.
- `docs/modernization/19-revised-migration-roadmap.md`.

No frontend, Flask, Jinja, Docker routing, firmware, companion-repository,
production database, schema, table, index, or dependency was modified.

## 17. Known risks and remaining administration

- Flask remains production authority; these APIs are disposable/test-writer
  only and are not a production cutover.
- Sessions remain process-local for ordinary lifecycle behavior. Durable user
  revocation is implemented through SQLite markers, but a distributed session
  store is still a future deployment concern.
- Audit JSONL and SQLite cannot share an atomic commit; post-commit audit I/O
  failure is documented rather than hidden.
- Existing `runs.user_id` foreign-key restrictions can make deletion conflict;
  historical data is preserved rather than rewritten.
- Registration, token self-management, SMTP/federation, catalog moderation,
  dynamic RBAC, and Next.js administration remain outside this milestone.
- The existing Flask Python test environment issue remains: 63 pass and one
  mDNS setup test fails because its test configuration omits `SECRET_KEY`.

## 18. GO/NO-GO recommendation

**GO** for the isolated disposable Fastify administration foundation and
further review of the API contracts.

**NO-GO** for production Fastify writes, Flask removal, deployment, or public
administrative UI. M6.3d.2d (registration and token policy integration) is the
next separately authorized milestone and was not started.
