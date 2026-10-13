# M6.3d.2h.2 — Federated Identity Foundation & Security Prerequisites

Date: 2026-10-13

Status: **Complete for the isolated Fastify/TypeScript writer foundation; NO-GO for OIDC, SAML, Authentik, and production federation.**

## 1. Scope and outcome

This milestone implements the provider-neutral security foundation identified
by the M6.3d.2h.1 audit. It does not implement an OIDC or SAML protocol flow,
callback endpoint, provider discovery, Authentik integration, frontend login,
Flask changes, production routing, deployment, or production-data migration.

The implementation is intentionally limited to the isolated TypeScript writer
profile. `openAuthWriteDatabase` applies the additive migration only to the
explicit test writer database. The operational database remains read-only.
The legacy Drizzle schema mapping remains unchanged so existing compatibility
queries and firmware-facing contracts retain their current identifiers and
response shapes.

## 2. Findings addressed

The implementation closes the hard prerequisites from report 54:

- account disablement is represented by `users.disabled_at` and enforced in
  local login, session resolution, bearer-token lookup, and federated identity
  resolution;
- sessions are durable in the isolated SQLite writer, while the raw session
  identifier is stored only as an HMAC digest and the CSRF value is encrypted;
- provider configuration is explicit, disabled by default, HTTPS-bound by
  default, issuer-scoped, bounded, and has no discovery or outbound network
  behavior;
- external identities are normalized into a separate relation with exact
  protocol/provider/issuer/subject matching and non-reusable retired links;
- correlation state, nonce/PKCE material, request identifiers, expiration,
  single-use consumption, and replay identifiers have durable transactional
  storage;
- administrative account disablement revokes API tokens, deletes durable
  sessions, advances the existing revocation watermark, and protects the last
  enabled administrator;
- provider secrets use the existing AES-256-GCM/HKDF envelope and
  provider-scoped authenticated purposes; raw secrets are not stored in
  provider configuration columns;
- backup validation accepts migrated legacy writer backups, preserves current
  schema compatibility, and clears ephemeral sessions and federation
  transactions after a successful restore.

## 3. Additive writer migration

`backend/src/db/federation-migrations.ts` introduces schema version 1 through
`PRAGMA user_version` and an idempotent migration record. It adds:

- `users.disabled_at`;
- `federation_schema_migrations`;
- `federation_providers`;
- `user_external_identities`;
- `federation_transactions`;
- `federation_replays`;
- `federation_provider_secrets`;
- `auth_sessions`.

The migration requires the existing `users` and `store_settings` tables,
rejects unsupported future versions, runs under `BEGIN IMMEDIATE`, validates
all expected objects before commit, and rolls back on failure. It is not run
against the operational read-only database and has no reverse-DDL operation.

Legacy backup archives are upgraded only in the disposable restore staging
database when the live writer already has the federation foundation. A legacy
profile used by existing compatibility tests remains supported.

## 4. Identity and account-state rules

`backend/src/federation/identity.ts` accepts only a branded
`ValidatedExternalIdentity` produced at a future protocol-adapter boundary.
The adapter boundary is documented as responsible for signature, issuer,
nonce/request correlation, timestamp, audience, and protocol validation.

The identity service applies these independent rules:

1. Provider ID, protocol, issuer, and subject are bounded allow-listed data.
2. Provider enablement and exact issuer binding are required.
3. The tuple `(protocol, issuer, subject)` is unique, including retired rows.
4. A retired identity cannot be silently reused.
5. Email and display-name claims never auto-link an account.
6. External groups never grant local role or administrator capability.
7. Disabled local accounts cannot resolve through an external identity.
8. Linking requires recent local reauthentication and either self-ownership or
   administrator authority.
9. Unlinking requires the same authorization and cannot remove the final
   usable authentication method.
10. Identity audit targets use a truncated hash, not raw external claims.

The additive administrative route
`PATCH /api/admin/users/:userId/state` accepts only `{ "disabled": boolean }`.
It is protected by the existing local RBAC, browser-session, and CSRF guards.
Re-enabling does not restore previously revoked credentials.

## 5. Provider configuration and secrets

`backend/src/federation/provider.ts` provides a provider-neutral CRUD service
for OIDC/SAML configuration without protocol execution. Providers start
disabled. HTTPS is required unless an explicit test-only `allowHttp` argument
is used. URLs reject credentials and fragments; provider references are scoped
to the same provider ID and a fixed purpose allow-list.

`backend/src/secrets/service.ts` extends the existing secret envelope to:

- `oidc-client-secret`;
- `saml-sp-signing-private-key`;
- `saml-sp-decryption-private-key`.

The encrypted provider-secret table is bounded by the existing secret inventory
limit, is included in backup preflight metadata, is decrypted before accepting
a backup, and participates in key rotation. No OIDC/SAML key is generated,
loaded, or enabled by this milestone.

## 6. Transactions and replay protection

`backend/src/federation/transaction.ts` stores only opaque transaction IDs,
hashes of state/nonce, encrypted PKCE verifier material, bounded callback
bindings, request identifiers, return paths, and timestamps. It does not store
authorization codes, access tokens, ID tokens, assertions, or raw SAML XML.

Consumption uses `BEGIN IMMEDIATE`, verifies protocol/provider/callback/state,
checks expiry and single-use state, marks the row consumed before returning,
and decrypts PKCE only after the commit. Replay identifiers have a composite
provider/protocol key and deterministic duplicate rejection. Cleanup is bounded
and can run later without changing authentication behavior.

## 7. Compatibility evidence

- Existing Fastify compatibility, authentication, authorization, metrics,
  publishing, review, backup, and SQLite resilience tests continue to pass.
- The legacy Drizzle mapping and public API routes were not renamed or removed.
- Firmware-facing score and metrics routes were not changed.
- Backup tests cover legacy v1 import and current v2 export after the new
  writer-only foundation.
- New disposable tests cover migration idempotence, provider binding and
  default-disablement, issuer-scoped identity linking/unlinking, disabled
  account rejection, PKCE protection, transaction single-use, callback
  binding rejection, and replay rejection.

## 8. Verification commands and results

All Node commands selected Node 24.20.0 using `nvm use 24`.

| Command | Result |
|---|---|
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run check` in `backend/` | PASS — 21 Vitest files, 115 tests; typecheck, ESLint, and TypeScript build passed |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && FLASK_PROXY_TARGET=http://flask:5080 pnpm run check` in `frontend/` | PASS — typecheck, ESLint, 4 Vitest files / 10 tests, Next.js production build |
| `docker compose --profile dev --profile backend --profile writer --profile writer-init --profile prod config` | PASS |
| `git diff --check` | PASS |
| `.venv313/bin/pytest -q` | 63 passed, 1 pre-existing failure in the mDNS test because it deliberately uses `TESTING=False` without `SECRET_KEY` |
| `git -C ../PRG32 status --short` | Pre-existing untracked `docs/quickstart-qemu.md` and `run-qemu`; no files changed |

The frontend check emitted only the existing Vite native-config deprecation
warning. It did not fail the check.

## 9. Files changed

Implementation files:

- `backend/src/db/federation-migrations.ts`;
- `backend/src/db/readonly.ts`;
- `backend/src/auth/account-state.ts`;
- `backend/src/auth/session.ts`;
- `backend/src/auth/service.ts`;
- `backend/src/auth/principal.ts`;
- `backend/src/auth/tokens.ts`;
- `backend/src/admin/service.ts`;
- `backend/src/admin/routes.ts`;
- `backend/src/federation/provider.ts`;
- `backend/src/federation/identity.ts`;
- `backend/src/federation/transaction.ts`;
- `backend/src/secrets/envelope.ts`;
- `backend/src/secrets/service.ts`;
- `backend/src/backup/service.ts`;
- `backend/tests/federation-foundation.test.ts`.

Documentation:

- this report;
- `docs/modernization/19-revised-migration-roadmap.md`.

The pre-existing untracked report 54 and pre-existing roadmap edits were
preserved. No Flask, frontend, Compose, deployment, production-data, or
companion-repository file was changed by this milestone.

## 10. Remaining risks and deviations

- No protocol adapter has yet validated real OIDC or SAML messages.
- No callback route, provider discovery, token exchange, SAML XML parsing,
  certificate rotation, or Authentik environment exists yet.
- SQLite remains a constrained single-writer topology. Durable state is safe
  for the isolated writer, but a production multi-replica federation
  deployment requires an explicit topology and shared rate-limit decision.
- Provider secret references have been implemented as a storage boundary, but
  no admin API for entering or rotating provider-specific values is exposed.
- There is no reverse migration. Rollback means stopping the writer, restoring
  a verified pre-migration backup, and reopening the isolated test database;
  a live federation database must never be silently downgraded.
- The Flask mDNS/`SECRET_KEY` test failure remains outside this milestone and
  was not masked or “fixed” by changing application behavior.

The deliberate deviation from the earlier sequence is that the former
M6.3d.2h.2 OIDC implementation slot is now consumed by this security
foundation. This is a safety prerequisite, not an authorization to start a
protocol flow.

## 11. Next milestone recommendation

Proceed only with **M6.3d.2h.3 — OIDC protocol implementation**, after a
separate authorization review. It should add a narrow Authorization Code +
PKCE flow over this foundation, with no automatic email linking and no role
mapping from claims. Then sequence:

1. M6.3d.2h.3 — OIDC adapter and callback contract;
2. M6.3d.2h.4 — narrow SP-initiated SAML adapter and ACS contract;
3. M6.3d.2h.5 — disposable Authentik OIDC/SAML end-to-end validation.

Production federation and Flask retirement remain separate cutover decisions.
