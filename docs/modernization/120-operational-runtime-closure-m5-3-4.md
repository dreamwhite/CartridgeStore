# PRG32 Cartridge Store — M5.3.4 Operational Runtime Closure

Date: 2026-10-14

## Executive result

M5.3.4 is **`M534_OPERATIONAL_RUNTIME_GO`** for the disposable operational
runtime and the future deployment contract.

The TypeScript runtime now has an explicit `canonical-operational` mode. It
requires an already bootstrapped canonical storage-v2 root, opens the
canonical SQLite database as the single authentication and application
writer, acquires the existing filesystem writer lease, and refuses legacy
database/configured-user fallbacks. Normal startup never initializes missing
storage.

The disposable production-like Compose rehearsal started the operational
Fastify and Next.js images with synthetic storage, an external key registry,
an isolated network and Mailpit. Both application containers became healthy;
Fastify reported canonical storage available and the writer lease held.

This does **not** authorize operational cutover. The status remains:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

No Dream Traefik, Authentik, Mailpit, DNS, production database, operational
Compose project or production data was changed.

## Scope completed

- Added explicit `canonical-operational` catalog/workflow mode.
- Added fail-closed production configuration validation.
- Added explicit `storage:bootstrap-operational` tooling.
- Reused canonical storage-v2 schema/layout initialization; no duplicate DDL
  was introduced.
- Connected the operational authentication writer to canonical SQLite.
- Added Fastify `trustProxy` configuration and production enforcement.
- Added the operational catalog path without constructing `ReadonlyCatalog`.
- Kept mDNS disabled and rejected CORS configuration in operational mode.
- Added operational backup-v4 authorization while retaining the disposable
  authorization used by existing fixtures.
- Added slim multi-stage operational Dockerfiles for Node.js 24.
- Added a disposable operational Compose harness with Fastify, Next.js and
  synthetic Mailpit on an isolated network.
- Removed the university importer source, CLI, test and package script.
- Added an operational-mode regression test.

The historical M5.3.3 report still mentions the importer because it records
what that earlier milestone implemented. It was not rewritten as part of
this milestone.

## Operational configuration boundary

`canonical-operational` requires all of the following:

- `PRG32_BACKEND_CATALOG_READ_MODE=canonical-operational`.
- `PRG32_BACKEND_CANONICAL_WORKFLOW_MODE=operational`.
- Explicit canonical storage root, read authorization and write
  authorization.
- `PRG32_BACKEND_DB` equal to `<canonical-root>/store.sqlite`.
- `PRG32_BACKEND_STORE_DATA` equal to the canonical root.
- Authentication writes enabled with `AUTH_WRITE_MODE=operational` and the
  same canonical SQLite file.
- A session secret, bootstrap token and external secret key registry.
- `PRG32_BACKEND_TRUST_PROXY=true`.
- Secure cookies in production.
- Empty CORS allowlist, disabled mDNS, disabled federation lifecycle tests
  and disabled configured-user/legacy database fallbacks.

Missing canonical storage is a startup failure. The only initialization path
is the explicit operator command:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend run storage:bootstrap-operational -- \
  --root /absolute/path/to/canonical \
  --authorization '<operator-provided-authorization>'
```

The command requires an empty root and an explicit authorization. It cannot
overwrite an existing storage root.

## Authentication and settings

Local authentication, registration, password recovery, CSRF, sessions,
tokens, RBAC and generic OIDC/SAML code paths remain in the Fastify runtime.
The operational bootstrap route is available only with an explicit bootstrap
token and the existing one-time bootstrap guard.

The operational runtime uses the canonical database for authentication,
settings, administration, catalog publication, metrics, scores and review
workflows. No `auth-writer`, legacy Flask writer or shadow database is part
of the operational Compose template.

Secret settings remain protected by the existing `SecretStore`. The key
registry is supplied outside the application data root and is never embedded
in backup archives. Backup-v4 integrity/authenticity and confidentiality are
distinct: AES-GCM protects the encrypted envelope, while the external key
registry supplies key material.

The existing environment SMTP variables remain an infrastructure bootstrap
contract for the disposable rehearsal. Persisted canonical settings remain
the authority after configuration is established; no operational settings
API was replaced with environment mutation.

## Writer and recovery boundary

The existing `CanonicalWriterLease` remains the single-writer boundary. The
operational service acquires it during startup and releases it on shutdown.
The Compose contract defines one Fastify replica and does not expose a scale
or multi-writer mode.

The runtime opens an existing storage-v2 database and validates the existing
version tuple:

| Field | Required value |
| --- | ---: |
| Schema version | 2 |
| Storage layout version | 2 |
| Publication journal version | 1 |
| Backup format version | 3 |

Publication recovery, private staging boundaries and existing storage-v2
audits remain unchanged. An incomplete or incompatible target fails the
readiness path rather than being initialized implicitly.

## Backup-v4 capability

The backup-v4 CLI accepts an explicit operational authorization in addition
to the existing disposable authorization. It still requires:

- An explicit source and output path.
- A quiesced writer.
- An external key registry.
- No output inside the source root.
- Independent verification before restore.
- Restore into a new target root.

Example used by the rehearsal:

```bash
pnpm --dir backend exec tsx src/storage-v2/backup-v4-cli.ts backup \
  --source /tmp/<run>/data \
  --output /tmp/<run>/canonical.backup4 \
  --key-registry /tmp/<run>/key.json \
  --authorization PRG32_STORAGE_V2_ENCRYPTED_BACKUP_OPERATIONAL

pnpm --dir backend exec tsx src/storage-v2/backup-v4-cli.ts verify \
  --archive /tmp/<run>/canonical.backup4 \
  --key-registry /tmp/<run>/key.json

pnpm --dir backend exec tsx src/storage-v2/backup-v4-cli.ts restore \
  --archive /tmp/<run>/canonical.backup4 \
  --target /tmp/<new-run>/data \
  --key-registry /tmp/<run>/key.json \
  --authorization PRG32_STORAGE_V2_ENCRYPTED_BACKUP_OPERATIONAL
```

The operational Compose service does not expose backup over HTTP and does not
perform backup during startup. Backup remains an explicit maintenance
operation with writer quiescence.

## Docker contract

New images:

- `backend/Dockerfile.operational`
- `frontend/Dockerfile.operational`

Both use `node:24-bookworm-slim`, frozen pnpm installs, a builder stage and a
runtime stage. Runtime images run as the non-root `node` user. They use a
read-only root filesystem, writable `/tmp` tmpfs, dropped capabilities and
`no-new-privileges`.

The future operational template remains one Compose file with two app
services:

| Hostname | Service | Internal port |
| --- | --- | ---: |
| `store.prg32.dream.test` | Next.js | 3000 |
| `api.prg32.dream.test` | Fastify | 5080 |

Traefik, Authentik and Mailpit remain external to that template. The
operational template has no host ports and uses the existing external edge
and mail networks. The disposable rehearsal intentionally uses a private
local bridge and published loopback ports so it can be tested without
touching Dream infrastructure.

The disposable harness adds Mailpit as a synthetic supporting service; the
application runtime itself remains exactly two services.

## Disposable runtime verification

The rehearsal used a fresh temporary canonical root and a generated,
permission-restricted key registry outside that root. It ran with
`NODE_ENV=production` and `canonical-operational`, not
`canonical-disposable`.

Observed results:

- Fastify container: healthy.
- Next.js container: healthy.
- Mailpit container: healthy.
- Fastify `/health`: 200.
- Fastify `/ready`: 200 with `canonical_storage=available` and
  `writer_lease=held`.
- Fastify `/api/games`: 200.
- Fastify `/.well-known/prg32-store.json`: 200.
- Fastify `/api/multiplayer/status`: 200.
- Next.js `/`: 200.
- Next.js `/health`: 200.
- Next.js `/api/games` proxy: 200.
- Next.js `/api/auth/csrf`: 200.
- Next.js `/api/auth/providers`: 200.

The first rehearsal attempt was rejected because its disposable fixture set
`SESSION_SECURE=false` while `NODE_ENV=production`; after changing the
fixture to Secure cookies, the stack started successfully. This confirms the
production fail-closed rule is active.

## Backup and restore verification

The quiesced disposable root produced an encrypted backup-v4 archive using
the external `m534-key` registry. Independent verification returned
`verification_state=complete`. Restore completed into a different empty root.

Restored database evidence:

```text
schema/layout/journal/backup = 2/2/1/3
state = ready
PRAGMA integrity_check = ok
PRAGMA foreign_key_check = []
```

The existing storage-v2 backup/restore adversarial and interruption tests
remain part of the backend suite. This milestone did not alter operational
data or run restore over an existing target.

## University importer removal

Removed completely from executable code:

- `backend/src/importers/university/index.ts`
- `backend/src/importers/university/cli.ts`
- `backend/tests/university-importer.test.ts`
- `backend/package.json` script `import:university`

The generic canonical upload, PRG32 validation, media extraction, staging,
review, publication, migration and recovery code was preserved.

## Test and build results

Node.js was selected with `nvm use 24`.

| Check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 52 files, 266 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| Root Compose config | PASS |
| `deploy/operational/compose.yaml` config | PASS |
| Disposable operational Compose config | PASS |
| Final Fastify operational Docker build | PASS |
| Final Next.js operational Docker build | PASS |
| `git diff --check` | PASS |

The new operational runtime test covers successful startup/readiness and
rejection of missing proxy trust and legacy fallback configuration.

## Files changed for M5.3.4

Implementation changes are limited to the runtime/configuration boundary and
the importer removal:

- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/db/readonly.ts`
- `backend/src/catalog/routes.ts`
- `backend/src/storage-v2/read-mode.ts`
- `backend/src/storage-v2/database.ts`
- `backend/src/storage-v2/catalog.ts`
- `backend/src/storage-v2/workflow.ts`
- `backend/src/storage-v2/backup-v4.ts`
- `backend/src/storage-v2/backup-v4-cli.ts`
- `backend/src/storage-v2/operational-bootstrap-cli.ts`
- `backend/tests/operational-runtime.test.ts`
- `backend/Dockerfile.operational`
- `backend/package.json`
- `frontend/src/app/health/route.ts`
- `frontend/Dockerfile.operational`
- `deploy/operational/compose.yaml`
- `deploy/disposable/operational-compose.yaml`

The worktree contained substantial earlier modernization changes before this
milestone. No unrelated changes were reset or cleaned.

## Remaining risks and blockers

- No real Traefik routing or TLS observation was performed in this milestone.
- No real Authentik login, OIDC provider configuration or SAML provider
  configuration was changed or authenticated against.
- The operational Compose template still requires external networks, an
  external key registry and operator-provided secrets.
- The database/filesystem cutover remains a single-writer handover, not a
  zero-downtime dual-writer migration.
- Backup execution requires planned writer quiescence; it is not claimed as
  an online hot-backup path.
- `AUTH_DISPOSABLE_ROOT` remains a compatibility field name in the existing
  configuration interface even though operational mode points it at the
  canonical root. Renaming it is deferred to avoid an unnecessary contract
  change.
- The historical Flask service remains in the repository and in the existing
  operational infrastructure.

## M5.3.5 prerequisites

Before any cutover milestone, the operator must separately approve and verify:

1. External key custody and backup retention policy.
2. Canonical root inventory and a quiesced source snapshot.
3. Traefik routers for `store.prg32.dream.test` and
   `api.prg32.dream.test`.
4. Authentik generic OIDC/SAML redirect, issuer, audience and certificate
   contracts through `sso.dream.test`.
5. Session continuity and controlled re-login policy.
6. Single-writer ownership for publication, telemetry, scores, metrics and
   WebSocket traffic.
7. A tested rollback window and an explicit policy for post-cutover writes.
8. Approval to retire Flask only after the final public and firmware parity
   gate passes.

## Decisions

- `M534_OPERATIONAL_RUNTIME_GO`: **YES**, disposable operational runtime
  implemented and exercised.
- Operational cutover: **NO-GO**, not authorized by M5.3.4 and not
  performed.
- Flask retirement: **NO-GO**, Flask was not removed.
- Deployment: **NOT PERFORMED**.
- Commit/push: **NOT PERFORMED**.
