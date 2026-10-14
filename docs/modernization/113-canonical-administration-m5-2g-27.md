# PRG32 Cartridge Store — M5.2g.27 Canonical Administration & Runtime Configuration

Date: 2026-10-14  
Execution mode: disposable implementation and read-only infrastructure verification

## Executive result

M5.2g.27 is a **disposable implementation GO** and an **operational NO-GO**.

The Fastify candidate now has an additive typed application-settings registry,
administrator-facing settings and SMTP operations, persistent account status
management, canonical audit events, and canonical catalog moderation records.
Existing compatibility settings and routes remain available. No Flask,
production database, Compose file, Traefik resource, Authentik resource, DNS
record, or operational container was modified.

The implementation is not an operational cutover. Public observation still
shows the current Dream route ownership as Next.js on `store.prg32.dream.test`,
Flask on `api.prg32.dream.test`, and Authentik on `sso.dream.test`.

Final decisions:

- `M5.2g.27 disposable implementation`: **GO**
- `OPERATIONAL_CUTOVER`: **NO-GO**
- `FLASK_RETIREMENT`: **NO-GO**
- `M5.2g.28`: **not started**
- `M6.3d.2h.12`: **not started**

## Implemented scope

### Typed persistent settings

`backend/src/db/application-migrations.ts` now creates additive tables for:

- `application_settings`, with JSON values, declared types, category,
  sensitivity, version and updating administrator;
- `admin_audit_events`, with bounded structured summaries;
- `catalog_moderation`, preserving the distinction between `hidden`,
  `unpublished`, and `restored` decisions.

The legacy `store_settings` table remains intact for compatibility. The new
settings API accepts a namespaced `application_settings` patch while retaining
the existing allow-listed legacy patch shape. Secret values are not returned.

The registry covers application identity, registration, publishing/review
policy, security notifications, session policy, and SMTP configuration. The
registry is persistent and versioned; policy consumers that still use static
environment configuration remain a cutover prerequisite.

### SMTP administration

`/api/admin/settings` exposes only safe SMTP state. Passwords are stored using
the existing `SecretStore` and its authenticated encryption/key registry. A
password update fails closed when safe key custody is unavailable; plaintext
fallback is not permitted.

Added administrator-only, CSRF-protected operations:

- `POST /api/admin/settings/smtp/test-connection`
- `POST /api/admin/settings/smtp/test-message`

SMTP supports `none`, `starttls`, and `implicit_tls` modes, bounded connection
and delivery timeouts, optional authentication, and runtime reconfiguration.
SMTP test delivery was not sent to the real Mailpit service during this
milestone because the requested verification was read-only and no operational
network was attached or changed.

### Account status and enforcement

Users now have additive status metadata:

- `active`
- `suspended`
- `banned`
- legacy `disabled` projection when `disabled_at` is populated

Added:

- `PATCH /api/admin/users/:userId/status`
- status fields in administrator user views;
- Activate, Suspend and Ban controls in the Next.js administration UI;
- reason, actor, timestamps and optional expiry;
- last-active-administrator and self-lockout protections;
- durable session/API-token invalidation for non-active states.

Local login, browser sessions, bearer tokens, OIDC/SAML linked identity
resolution, and WebSocket authentication all use the account-state boundary.
An expired suspension is treated as active at authorization time. The legacy
`/state` endpoint remains compatible.

### Audit events

The existing bounded filesystem audit journal remains available. The shared
audit writer additionally persists structured events in canonical SQLite when
the writable disposable database is present. Settings and account mutations
include safe summaries; credentials, password hashes, tokens, cookies and
secret values are excluded.

Added administrator read access:

- `GET /api/admin/audit?limit=...`

### Catalog moderation

Canonical catalog administration now records explicit moderation actions in
`catalog_moderation`. Public canonical catalog reads suppress active `hidden`
and `unpublished` records while preserving the underlying cartridge identity,
release and immutable objects. `restored` makes a version visible again.

This is intentionally canonical/disposable behavior. Legacy Flask catalog
ownership and operational routing were not changed.

## Compatibility and backup behavior

All schema changes are additive. Legacy user rows with only `disabled_at`
continue to work, and migration differential fingerprints exclude only the
new administrative status columns so existing Flask-to-canonical parity
evidence remains valid.

The application backup validator now allowlists the additive administration
tables and applies the same additive migrations to extracted legacy archives
before comparison. Canonical storage-v2 backups continue to use the SQLite
snapshot and therefore preserve the new tables without a second backup
format. Existing backup-v2, backup-v3 and encrypted backup-v4 regression
coverage remains green.

## Files changed for M5.2g.27

Backend:

- `backend/src/db/application-migrations.ts`
- `backend/src/auth/account-state.ts`
- `backend/src/auth/principal.ts`
- `backend/src/auth/service.ts`
- `backend/src/auth/tokens.ts`
- `backend/src/admin/audit.ts`
- `backend/src/admin/service.ts`
- `backend/src/admin/routes.ts`
- `backend/src/admin/catalog-service.ts`
- `backend/src/settings/service.ts`
- `backend/src/settings/routes.ts`
- `backend/src/email/service.ts`
- `backend/src/federation/runtime.ts`
- `backend/src/storage-v2/catalog.ts`
- `backend/src/storage-v2/migration/verification.ts`
- `backend/src/backup/service.ts`
- `backend/src/backup/routes.ts`
- `backend/src/app.ts`
- `backend/tests/admin-runtime-config.test.ts`

Frontend:

- `frontend/src/lib/api/admin.ts`
- `frontend/src/components/admin/AdminWorkspace.tsx`

Documentation:

- this report only; the roadmap was not updated because the milestone brief
  explicitly prohibited that update.

No Compose or deployment file was modified.

## Tests and verification

Node environment:

- `source "$HOME/.nvm/nvm.sh" && nvm use 24`
- Node `v24.20.0`
- pnpm `12.5.1`

Passed:

- `pnpm --dir backend run typecheck`
- `pnpm --dir backend run lint`
- `pnpm --dir backend run build`
- `pnpm --dir backend run test` — **50 test files, 249 tests passed**
- `pnpm --dir frontend run typecheck`
- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run test` — **22 test files, 65 tests passed**
- `pnpm --dir frontend run build`
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` — **64 passed**
- `docker compose --profile dev config --quiet`
- `docker compose -f deploy/candidate/compose.yaml config --quiet`
- `docker compose -f deploy/candidate/compose.yaml build` — Fastify and Next.js
  candidate images built successfully from Node 24 slim multi-stage Dockerfiles
- `git diff --check`

The focused M5.2g.27 test file contains **3 tests**, covering typed settings,
secret non-disclosure, SQLite audit persistence, suspension/ban behavior,
bearer-access revocation, and distinct catalog moderation transitions.

## Read-only Dream infrastructure observations

No operational service was started, stopped, restarted, reconfigured, or
attached to a new network. No credentials or cookies were collected.

Read-only Docker inventory found:

- Mailpit container: `dream-mailpit-mailpit-1`
- image: `axllent/mailpit:v1.27.4`
- status: running and healthy
- SMTP port: `1025/tcp`
- web port: `8025/tcp`
- networks: `dream_edge`, `dream_mail`
- Traefik route: `mailpit.dream.test`, routed through `dream_edge`

The Mailpit web endpoint responded to a safe `HEAD` observation with `405`,
which is consistent with a method-restricted web endpoint. SMTP delivery was
not probed because doing so would require an operational network connection.

DNS resolved all four observed development names to `127.0.0.1`:

- `store.prg32.dream.test`
- `api.prg32.dream.test`
- `sso.dream.test`
- `mailpit.dream.test`

Safe public headers showed:

- `store.prg32.dream.test`: Next.js response, `/health` returned `404`;
- `api.prg32.dream.test`: Werkzeug response, `/health` returned `404`;
- `sso.dream.test`: Authentik response, `/` returned `302` to the login flow.

These observations are evidence that the operational edge still owns Flask
and is not a Fastify cutover target yet.

## Current Compose topology evidence

The root Compose file remains unchanged. With `--profile dev`, the relevant
services are:

- `flask`: legacy API/catalog owner;
- `next`: Next.js development frontend with HMR;
- `auth-writer-init`: disposable writer/bootstrap initialization;
- `auth-writer`: Fastify development writer with HMR;
- `auth-writer-edge-proxy`: opt-in Nginx dual-origin bridge.

The candidate Compose file remains a separate disposable two-service
verification topology:

- `fastify`: one canonical SQLite writer and API/WebSocket owner;
- `next`: one Next.js frontend and proxy owner.

The final target hypothesis remains two application runtime services plus the
external Dream edge and external generic OIDC/SAML provider. Removal of Flask,
the writer initializer, and the compatibility edge proxy is still prohibited
until the operational ownership gates are closed.

## Remaining risks and blockers

1. The real Dream edge still routes API traffic to Flask. No public Fastify
   ownership exists.
2. Authentication/session continuity and provider callback cutover are not
   operationally rehearsed against real credentials or live provider state.
3. The current Mailpit service is externally managed. Its SMTP connectivity
   from the candidate runtime remains unverified by design.
4. Some registry policy values are persisted but still require explicit
   wiring into their eventual publishing/review/session consumers before
   cutover.
5. Canonical moderation is implemented for canonical storage-v2; legacy Flask
   moderation remains unchanged.
6. No production backup, restore, migration, routing change, or rollback was
   performed.

## Next milestone recommendation

The next milestone should be a separately authorized operational integration
gate that wires every persisted policy consumer, proves candidate-to-external
Mailpit connectivity through an explicitly approved disposable path, and
revalidates session, OIDC/SAML callback, WebSocket, download telemetry,
publishing, review and rollback ownership. It must preserve the current
decision until those gates pass:

- do not cut over `api.prg32.dream.test`;
- do not remove Flask;
- do not modify Dream Traefik or Authentik;
- do not enable dual writers;
- do not change operational databases or persistent volumes.

No commit, push, deployment, or operational cleanup was performed.
