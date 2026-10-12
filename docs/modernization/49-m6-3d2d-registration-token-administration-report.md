# PRG32 Cartridge Store — M6.3d.2d Registration & API Token Administration

**Status:** implemented and verified in the isolated Fastify/TypeScript writer
profile only.
**Date:** 2026-10-12

Flask remains the authoritative production backend and sole production writer.
This milestone does not deploy Fastify, modify Flask, add schema objects, add
authentication providers, expose new Traefik routes, or start M6.3d.2e.

## 1. Executive summary

M6.3d.2d completes the isolated Fastify registration-token lifecycle and adds
administrator-only API-token metadata listing and revocation.

Registration tokens continue to use 32 cryptographically random bytes encoded
as base64url and SHA-256 hashes in the existing `registration_tokens` table.
Creation and completion use the existing schema and SQLite writer boundary.
Completion now rechecks token validity inside `BEGIN IMMEDIATE` before creating
the user and marks the token used in the same transaction. Two concurrent
completion attempts therefore cannot create two accounts or consume one token
twice.

The existing self-service policy is preserved: disabling
`auth_allow_registration` blocks new initiation requests, while a token issued
before the setting change remains completable. Public completion always creates
role `user`; it cannot grant administrator privileges.

The new `GET /api/admin/tokens` endpoint returns bounded, joined metadata only.
`DELETE /api/admin/tokens/:tokenId` requires `tokens:revoke:any`, a browser
session, CSRF, the disposable writer, and an audit preflight. Raw token values,
hashes, passwords, sessions, and CSRF values are never returned or logged.

## 2. Existing registration lifecycle

| Stage | Fastify behavior | Flask reference | Classification |
| --- | --- | --- | --- |
| Initiation | `POST /auth/register`, valid normalized email, setting check, optional effective domain check | Same route and checks | Compatible; domain enforcement completed |
| Token generation | `crypto.randomBytes(32).toString("base64url")` | `secrets.token_urlsafe(32)` | Compatible entropy/format |
| Persistence | SHA-256 hash, email, UTC SQLite timestamp, 24-hour expiry | Same table/hash/expiry model | Compatible |
| Replacing pending token | Earlier unused tokens for the email are marked used | Same behavior | Compatible |
| Email delivery | No SMTP implementation in Fastify; initiation does not return the token | Flask sends through configured SMTP or test capture | Deferred boundary; no token is exposed |
| Completion lookup | Hash lookup requires `used_at IS NULL` and `expires_at > datetime('now')` inside the transaction | Same predicates before local account creation | Hardened transaction placement |
| User creation | Username and email are the normalized registration email; fixed role `user` | Flask may use valid `auth_default_role` values including `admin` | Intentional security hardening: Fastify public registration cannot escalate |
| Token consumption | `used_at` update is in the same `BEGIN IMMEDIATE` transaction as user creation | Flask uses separate pre-check/create/mark operations | Intentional concurrency hardening |
| Session | Successful completion rotates into a new session | Flask replaces the session | Compatible security outcome |

No registration token is returned in an HTTP response. The isolated tests
inspect its hash row directly rather than serializing a real credential.

## 3. Registration-policy semantics

- `auth_allow_registration=false` rejects new initiation with the existing
  stable message `registration is closed`.
- Re-enabling the setting restores initiation.
- The setting is read inside the initiation transaction.
- A pending token issued while registration was enabled remains completable
  after registration is disabled. This matches Flask's current completion
  behavior and avoids invalidating an already-issued link without an approved
  policy change.
- Expired, consumed, invalid, and replayed tokens all return the stable
  registration-link error.
- Existing users cause initiation to return the same success-shaped response
  without issuing another token, preserving the anti-enumeration behavior.
- Completion never accepts a caller-supplied role and always inserts `user`.

## 4. Email-domain restriction

`auth_require_email_domain` remains read-only/effective in the settings
registry. It is not added to the writable settings API.

When non-empty, Fastify normalizes a leading `@`, lowercases the configured
domain, and requires the normalized registration email to end with
`@<configured-domain>`. This matches the established Flask comparison and is
not a wildcard or regular-expression policy. Malformed email addresses are
rejected by the existing bounded email validator. Domain enforcement happens
at initiation; an already-issued pending token is not invalidated by a later
settings change.

## 5. Registration-token generation and persistence

- Generation: 32 random bytes from Node's cryptographic random source,
  base64url encoded.
- Stored value: SHA-256 digest only; raw token is never stored.
- Expiration: SQLite UTC expression `datetime('now', '+24 hours')`.
- Consumption: SQLite `datetime('now')` in the same transaction as account
  creation.
- Replacement: unused earlier rows for the same normalized email are marked
  used before inserting the new row.
- Expired rows are intentionally retained. No cleanup job was introduced.

The request logger now records only the path, not query strings. This prevents
a future GET registration link from placing its one-time token in routine
request logs. Application errors do not include the supplied token.

## 6. Expiration, replay, and concurrency guarantees

`completeRegistration` validates the password before opening the mutation
transaction, then performs the following under `BEGIN IMMEDIATE`:

1. Re-read the hashed token with unused and unexpired predicates.
2. Reject if the row is missing, consumed, or expired.
3. Check the normalized email/username uniqueness boundary.
4. Insert the user with role `user`.
5. Mark the exact token used with a guarded update.
6. Commit both changes.

If a duplicate account already exists, the token is consumed and the stable
`account already exists` error is returned, matching Flask's existing behavior.
If any step fails, the transaction rolls back. Tests use two independent
anonymous sessions and separate concurrent completion requests; exactly one
request succeeds and exactly one user is created.

## 7. Administrative token API contracts

### `GET /api/admin/tokens`

Requires `tokens:read:any`. It supports browser-session or bearer
authentication for an authorized administrator, consistent with administrative
read policy.

Query parameters are strict and bounded:

- `page`: positive integer, default `1`, maximum `100000`;
- `limit`: positive integer, default `50`, maximum `100`;
- `user_id`: optional positive owner filter.

Unknown query parameters and malformed pagination receive stable errors. The
response is:

```json
{
  "ok": true,
  "tokens": [
    {
      "id": 7,
      "user_id": 2,
      "username": "student",
      "label": "QEMU",
      "created_at": "2026-10-12 20:00:00",
      "last_used": ""
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 1
}
```

Ordering is deterministic: `created_at DESC, id DESC`. Owner data is fetched
with one SQL join; the endpoint does not perform N+1 user queries.

### `DELETE /api/admin/tokens/:tokenId`

Requires `tokens:revoke:any`, an authenticated browser session, a valid CSRF
token, and an enabled disposable writer. Bearer-only mutations return
`admin_browser_session_required`. The token ID must be a positive safe
integer. Successful deletion returns the token ID only; an unknown ID returns
`token_not_found` without returning any token material.

Self-scoped `/auth/tokens` routes remain unchanged and continue to enforce
owner checks for `tokens:read:self`, `tokens:create:self`,
`tokens:update:self`, and `tokens:revoke:self`.

## 8. RBAC permissions

Added narrowly scoped static permission:

- `tokens:read:any` — administrator role only.
- Existing `tokens:revoke:any` — retained and used for administrative revoke.

Readers, users, players, publishers, the `editors` group, malformed
principals, unknown roles, and anonymous requests cannot access the new admin
token APIs. The `editors` group is not required for token administration; an
administrator remains authorized even if the protected group is absent.

No custom role or dynamic permission was introduced.

## 9. Session and CSRF policy

Administrative metadata reads may use an authorized bearer token. Administrative
revocation cannot use bearer-only authentication. It requires:

1. a valid Fastify browser session;
2. an authenticated administrator principal;
3. `tokens:revoke:any`;
4. a matching session-bound CSRF header;
5. an enabled disposable writer.

The existing cookie name, signing, CSRF token, SameSite, Secure, and expiry
contracts are unchanged.

## 10. Token metadata redaction

The admin listing selects only token ID, owner ID, owner username, label,
creation timestamp, and last-used timestamp. It never selects or serializes
`token_hash`. It also never returns password hashes, external identity
secrets, session cookies, CSRF tokens, or raw bearer tokens.

The audit file contains only actor/target identifiers, action, outcome,
request ID, event ID, and timestamp. Rejected routes use the target
`unknown` or `list` rather than copying a credential value.

## 11. Administrative revocation and audit

Revocation uses the existing JSONL `AdminAuditLog` from M6.3d.2c:

1. validate the token ID;
2. verify the audit directory/file preflight;
3. append `api_token.revoke` / `attempted`;
4. delete exactly the requested `api_tokens.id` inside `BEGIN IMMEDIATE`;
5. commit;
6. append `committed`, or preserve the SQLite commit if post-commit audit I/O
   fails.

Failed deletes append `failed` when possible. Authenticated unauthorized
requests append best-effort `rejected` events without secrets. A broken audit
path fails closed before SQLite mutation. The existing unavoidable limitation
remains: JSONL and SQLite do not share one atomic commit.

Deleting one API token does not update `auth_revoked_before:<user_id>`, delete
other tokens, change roles, alter groups, or invalidate browser sessions. The
next bearer authentication attempt sees the missing row immediately.

## 12. Credential-revocation integration

The M6.3d.2c invariants remain intact:

- password changes delete the target user's tokens and advance their durable
  revocation marker;
- role changes delete the target user's tokens and advance the marker;
- group changes delete the target user's tokens and advance the marker;
- user deletion deletes tokens and advances the marker before deleting the
  user;
- single-token admin revoke deletes only that token;
- unrelated bearer tokens remain valid;
- deleted users cannot authenticate;
- durable markers are still internal `store_settings` keys and are not
  exposed by the settings API or writable through settings PATCH.

## 13. Revocation-marker lifecycle

Revocation markers remain stored as `auth_revoked_before:<user_id>` in the
existing `store_settings` table. M6.3d.2d does not add cleanup, schema
objects, or marker rotation. Markers are copied/restored as ordinary database
rows by the existing backup format and are evaluated by fresh session
resolution.

User ID reuse is not introduced; existing SQLite identifiers and AUTOINCREMENT
semantics are preserved. Marker accumulation remains an operational cleanup
concern for a separately approved lifecycle milestone.

## 14. Backup/restore compatibility

The existing application backup/restore implementation is reused and not
redesigned.

- Users, roles, groups, API tokens, registration tokens, and revocation
  markers are restored as part of the existing SQLite database payload.
- Expired and consumed registration rows retain their existing state after
  restore; no background cleanup is added.
- API tokens present in the restored database remain valid according to the
  restored identity database. This is an explicit compatibility decision, not
  an implicit claim that backup encryption rotates credentials.
- Process-local browser sessions are now cleared after a successful restore.
  A cookie from before restore cannot survive an identity-database transition.
- New sessions after restore evaluate the restored revocation markers.
- The administrative JSONL audit file is outside the SQLite database payload
  and is not presented as transactionally restored with it.
- Restore remains browser-session-only and CSRF-protected; bearer-only restore
  remains rejected.

This is the narrow mitigation that fits the existing architecture. Global
credential rotation, distributed sessions, KMS, Redis, and cloud identity
services remain out of scope.

## 15. Error contracts

Stable externally visible errors include:

- `registration is closed`;
- `registration link is invalid or expired`;
- `account already exists`;
- `invalid_identifier`;
- `invalid_pagination`;
- `unknown_field`;
- `admin_browser_session_required`;
- `csrf_failed`;
- `token_not_found`;
- `admin_audit_unavailable`;
- `admin_write_unavailable`.

Raw SQLite errors, filesystem paths, SQL text, token values, and token hashes
are not returned.

## 16. Security test matrix

New and extended tests cover:

- registration enabled, disabled, and re-enabled;
- domain acceptance and rejection;
- setting change between initiation and completion;
- pending-token completion after registration disablement;
- invalid, expired, consumed, replayed, and malformed registration tokens;
- duplicate registration behavior and malformed/password-invalid requests;
- fixed default `user` role with no role escalation;
- concurrent completion with separate anonymous sessions;
- admin permission registry and deny-by-default role/group checks;
- empty and multi-owner token listing;
- pagination, owner filtering, stable ordering, and invalid queries;
- bearer administrator read and browser-session-only mutation;
- anonymous, ordinary-user, publisher, and editor denial;
- metadata-only response and no token/hash/password leakage;
- successful revoke, unknown/invalid IDs, CSRF failures, writer boundary,
  audit failure, persistence, and unrelated-token validity;
- audit attempted/committed/failed/rejected semantics;
- backup restore invalidating active browser sessions.

## 17. Backend regression results

With Node 24 selected through nvm:

```text
node v24.20.0
pnpm 12.5.1
backend pnpm run check: PASS
18 Vitest files / 102 tests: PASS
TypeScript typecheck: PASS
ESLint: PASS
TypeScript build: PASS
```

The existing frontend was not modified in this milestone. Its checks were
re-run with Node 24 and the documented Compose proxy target:

```text
FLASK_PROXY_TARGET=http://flask:5080 pnpm run check: PASS
TypeScript typecheck: PASS
ESLint: PASS
2 Vitest files / 5 tests: PASS
Next.js production build: PASS
```

The build emits the existing Vite config-loader warning; it does not fail the
check.

## 18. Flask differential results

Flask was inspected read-only for registration and token behavior. The
temporary Python 3.13 regression baseline remains **63 passed, 1 failed**;
the existing mDNS test starts Flask with `TESTING=False` and no `SECRET_KEY`,
so the current Flask startup guard fails before the mDNS assertion. Flask was
not changed and no workaround was added.

Intentional Fastify differences are limited to security boundaries:

- public Fastify completion is fixed to role `user`, regardless of a legacy
  `auth_default_role` value that Flask may accept as `admin`;
- token completion is rechecked and consumed transactionally to prevent
  concurrent duplicate accounts;
- request logs omit query strings to prevent one-time registration token
  leakage;
- successful restore clears process-local browser sessions.

SMTP delivery and Flask's test-only registration-token capture are not
implemented in Fastify.

## 19. Disposable Docker E2E evidence

The existing single Compose file and profiles are used. The disposable E2E
must verify health, bootstrap/login, registration policy and completion,
replay rejection, admin listing/redaction, token revoke, unrelated-token
validity, CSRF and bearer-only mutation rejection, audit persistence,
disabled-writer behavior, and named-volume-only writer mounts.

The disposable run completed successfully on 2026-10-12 with an isolated
Compose project and three disposable named volumes. It verified:

- writer health and bootstrap;
- anonymous-session CSRF issuance;
- registration request, completion with fixed `user` role, and replay rejection;
- administrator token metadata listing with pagination and response redaction;
- CSRF-required browser-session mutation and bearer-only mutation rejection;
- selective token revoke, revoked-token rejection, and unrelated-token validity;
- committed JSONL audit persistence without raw token leakage;
- writer restart with persisted bearer-token validity;
- disabled-writer behavior (`503` from `/auth/csrf`) using a one-off Compose
  container with both auth and dependent submission writes disabled;
- writer volume declarations restricted to named volumes in the Compose
  configuration.

The supporting commands were:

```text
docker compose --profile writer-init run --rm auth-writer-init
docker compose --profile writer up -d auth-writer
docker compose --profile writer restart auth-writer
docker compose --profile writer run --rm -d \
  -e PRG32_BACKEND_AUTH_WRITE_ENABLED=false \
  -e PRG32_BACKEND_SUBMISSION_WRITE_ENABLED=false auth-writer
docker compose --profile writer config --format json
```

The backend multistage image also built successfully with:

```text
docker compose --profile writer-init --profile writer build \
  auth-writer-init auth-writer
```

The run used only disposable databases, store data, cookies, and tokens. No
operational database or production routing was used. The regular `auth-writer`
service keeps auth and submission writes enabled by design; the disabled-writer
assertion therefore uses an explicit one-off override rather than changing the
shared Compose service definition.

## 20. Files changed

Added:

- `backend/src/admin/token-service.ts`
- this report

Modified:

- `backend/src/admin/routes.ts` — admin token list/revoke routes and security
  boundaries;
- `backend/src/app.ts` — token service registration and query-string-safe
  request logging;
- `backend/src/auth/service.ts` — transactional registration lifecycle and
  session invalidation hook;
- `backend/src/auth/session.ts` — session-store clear operation;
- `backend/src/authorization/permissions.ts` — `tokens:read:any` registry
  permission;
- `backend/src/backup/routes.ts` — clear browser sessions after restore;
- `backend/tests/admin.test.ts` — token metadata/revocation tests;
- `backend/tests/auth.test.ts` — registration policy and concurrency tests;
- `backend/tests/authorization.test.ts` — token permission tests;
- `backend/tests/backup.test.ts` — restore session invalidation regression;
- `docs/modernization/19-revised-migration-roadmap.md`.

No SQLite table, column, index, migration, dependency, Flask route, Jinja
template, frontend feature, companion-repository file, production write, or
production routing was modified.

## 21. Remaining risks

- Flask remains production authority; Fastify registration and token writes
  are disposable/test-writer only.
- Fastify has no SMTP delivery or external registration workflow.
- Process-local sessions remain non-portable between backend processes; the
  restore mitigation clears all sessions in the current process only.
- Restored bearer tokens remain valid if present in the restored database;
  planned operational restore procedures must decide whether credential
  rotation is required before any production cutover.
- Audit JSONL and SQLite still cannot share an atomic commit.
- Audit files are outside the application backup payload and need a separate
  operational retention/restore decision.
- Existing Flask Python environment and the one missing-`SECRET_KEY` mDNS
  test remain open compatibility-baseline issues.

## 22. GO/NO-GO recommendation

**GO** for isolated Fastify registration lifecycle testing and administrator
token metadata/revocation review.

**NO-GO** for production writes, public Fastify routing, Flask removal,
deployment, SMTP/invitation workflows, or M6.3d.2e. The next milestone must
be separately authorized.
