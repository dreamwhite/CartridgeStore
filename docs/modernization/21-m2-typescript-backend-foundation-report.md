# M2 — TypeScript Backend Foundation Report

Date: 2026-10-12

## Outcome

M2 foundation is implemented as an isolated, read-only Fastify/TypeScript
service. Flask remains the only authoritative HTTP backend and the only
service allowed to write SQLite, cartridge files, settings, authentication
state, metrics, scores, reviews, or multiplayer state.

No business route, schema migration, deployment change, or production data
operation was introduced.

## Runtime and dependency decisions

- Node.js 24 LTS is required by `backend/package.json` and both `.nvmrc` files.
- Local commands use `source "$HOME/.nvm/nvm.sh" && nvm use 24` before pnpm.
- pnpm 12.5.1 is pinned in `packageManager` and in the Docker build.
- `better-sqlite3` 13.0.3 is used for the Node 24-compatible native SQLite
  driver; `node-gyp` is a development-only build dependency.
- Drizzle ORM is used only for typed schema/query foundations.
- Fastify supplies the HTTP lifecycle and structured logging through its
  built-in Pino integration.
- No runtime configuration-validation or web framework dependency was added
  beyond the approved foundation.

## Implemented structure

```text
backend/
  src/app.ts                         Fastify app and lifecycle hooks
  src/server.ts                      production/dev entrypoint
  src/config/env.ts                  validated environment configuration
  src/db/readonly.ts                 read-only SQLite/Drizzle manager
  src/db/schema.ts                   current SQLite schema mapping
  src/db/schema-inspection.ts        schema compatibility inspection helpers
  src/contract/harness.ts            response compatibility comparison helpers
  tests/app.test.ts                  health/readiness/error containment tests
  tests/readonly.test.ts             disposable SQLite read-only tests
  tests/contract.test.ts             JSON/header/binary compatibility harness
  Dockerfile                         Node 24 multistage image
  pnpm-lock.yaml                     reproducible dependency lockfile
```

## Read-only database guarantees

The backend opens SQLite only when `/ready` is requested, using:

- `readonly: true`;
- `fileMustExist: true`;
- a regular-file check before opening;
- foreign-key enforcement and bounded busy timeout;
- no directory creation, empty-database fallback, migration, or write path.

The tests prove that a missing database is not created and that direct DDL and
INSERT attempts through the read-only connection fail. The mapped schema
covers the current Flask tables: `users`, `api_tokens`, `groups`,
`user_groups`, `registration_tokens`, `store_settings`, `runs`, `samples`,
`scores`, `download_events`, and `cartridge_submissions`, including the
current columns, foreign keys, primary keys, unique constraints, and named
indexes relevant to the migration comparison.

## Contract foundation

`src/contract/harness.ts` compares status, content type, required headers,
recursive JSON shape and types, exact binary bytes, and SHA-256 digests. It
preserves the compatibility rule that additive response fields are allowed.
This is a reusable test tool; it is not a claim that TypeScript parity has
already been achieved. Catalog, discovery, authentication, publishing,
review, metrics, scores, statistics, administration, and multiplayer routes
remain Flask-owned and are intentionally absent from M2.

## Development integration

The existing dev stack remains unchanged for the active application routes:

- Flask continues on port `5080` and remains behind the existing API route at
  `api.prg32.dream.test`.
- Next.js continues behind the existing store route at
  `store.prg32.dream.test`, with its Flask proxy and WebSocket URL unchanged.
- The unified `docker-compose.yml` adds an opt-in `backend` profile. It binds only
  `127.0.0.1:5090`, mounts an optional SQLite fixture read-only at
  `/fixtures`, and has no Traefik labels, edge network attachment, or
  production data volume.
- The backend profile therefore cannot take ownership of either configured
  hostname or WebSocket route before a later parity milestone.

Local backend usage:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
cd backend
pnpm install --frozen-lockfile
PRG32_BACKEND_DB=/absolute/path/to/an/isolated/cartridge_store.sqlite pnpm dev
```

The database file must already exist. A disposable fixture can be supplied to
Compose with `PRG32_BACKEND_FIXTURE_DIR`; no production database should be
mounted.

## Verification evidence

All commands below were executed with Node `v24.20.0` where applicable:

| Check | Result |
| --- | --- |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm install --frozen-lockfile` in `backend/` | PASS |
| `pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm run test` in `backend/` | PASS — 3 files, 9 tests |
| `pnpm run build` in `backend/` | PASS |
| `SECRET_KEY=m2-test .venv313/bin/pytest -q` | PASS — 63 passed |
| `npm run typecheck` in `frontend/` | PASS |
| `npm run lint` in `frontend/` | PASS |
| `npm run test` in `frontend/` | PASS — 2 files, 5 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 npm run build` in `frontend/` | PASS |
| `PRG32_DEV_SECRET_KEY=local-compose-check docker compose --profile backend config` | PASS |
| `docker build -t prg32-cartridge-store-backend:m2-local backend` | PASS — multistage image built |
| Ephemeral `docker run` plus `GET /health` smoke test | PASS |

The frontend test runner emitted an existing Vite configuration warning about
future native config loading; it did not fail the tests. An initial frontend
build without `FLASK_PROXY_TARGET` was rejected by the existing explicit
configuration guard, then passed with the documented target.

## Files created or modified for M2

Created:

- `backend/` TypeScript service, tests, fixture guidance, Dockerfile, and
  pnpm lockfile;
- root `.nvmrc` and `backend/.nvmrc` containing `24`;
- `docker-compose.yml` backend profile;
- this report.

Modified within the M2 implementation:

- no Flask application, SQLite schema, Jinja template, authentication
  behavior, production Compose file, or Traefik production configuration.

The working tree already contained earlier modernization and security changes;
this report does not attribute those unrelated pre-existing changes to M2.

## Remaining risks and rollback

- There are no TypeScript business APIs yet, so no response-parity claim can
  be made beyond the test harness and schema foundation.
- Drizzle schema mappings require a reviewed M2.1 comparison against real,
  sanitized compatibility fixtures before any query implementation.
- The native SQLite driver requires a Node 24-compatible toolchain; `.nvmrc`,
  `packageManager`, Docker base images, and lockfile must remain aligned.
- The backend profile has no routed hostname by design; Traefik cutover,
  WebSocket parity, and same-origin route ownership remain future work.

Rollback is limited to stopping/removing the opt-in backend profile and
discarding its image. Flask routes, SQLite files, cartridge storage, and
production routing are unaffected because the service has no writable volume
and is not attached to the edge network.

## Next milestone

The next milestone should be **M2.1 — schema and serialization compatibility
gate**: generate sanitized fixtures from the documented Flask contracts,
compare table/index metadata and representative read queries, and define the
serialization rules needed for the first read-only catalog/discovery parity
work. Do not introduce write ownership or begin auth/publishing migration
until that gate is accepted.
