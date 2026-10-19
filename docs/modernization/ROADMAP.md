# PRG32 Cartridge Store — living modernization roadmap

**Status:** active

This is the only living planning document for the modernization work. Detailed
tranche reports are temporary working evidence. Once a workstream is closed,
its obsolete reports can be removed without changing the public documentation
source in `docs/`.

## Non-negotiable constraints

- preserve firmware, API, WebSocket, discovery, ABI, SQLite and filesystem
  contracts until an explicit cutover proves compatibility;
- do not change authentication or authorization as part of a cleanup-only
  change;
- keep one clear writer for each operational data domain;
- use Node.js 24 and reproducible pnpm commands;
- do not add dependencies unless the required boundary cannot be implemented
  with the existing stack;
- keep Flask available only as a temporary compatibility path; do not invest in
  refactoring code that will be removed;
- keep Docker Compose understandable for classroom and single-host operation;
- use Docker-managed secrets for application secrets instead of committing or
  interpolating secret values through ordinary environment variables.

## Current baseline

The Next.js frontend and Fastify backend are active foundations. The frontend
API, schema, workflow, federation-admin, setup and selected presentation
boundaries have been split by domain. The Fastify backend has separate
boundaries for configuration values, storage, backup, workflow, publication,
federation, administration, setup and readiness.

The latest scoped refactor commits are:

- `cf9233a` — administrative API domains;
- `68b9b33` — frontend schemas by domain;
- `29fdb39` — frontend authentication API;
- `b0d9c4d` — frontend workflow API;
- `f279185` — frontend federation administration API;
- `4164228` — frontend setup API;
- `5f7895b` — publication execution state machine;
- `b0c683e` — canonical workflow durable execution.

The codebase is not considered migration-complete. The remaining work is
product and operational work, not a reason to keep splitting already-cohesive
orchestrators.

The canonical storage-v2 schema contract lives in
[`docs/storage-schema.md`](../storage-schema.md); `docs/modernization/` contains
this roadmap only.

## Workstreams

### 1. Frontend product completion

Finish the user-facing work before polishing internals further:

- complete the public catalog, detail and download experience;
- complete publishing and review flows with clear pending, rejected and
  published states;
- finish account, authentication, setup and administration workspaces;
- close responsive, keyboard, focus, error, loading and empty-state gaps;
- remove placeholder or duplicated UI content;
- keep API response handling in domain adapters and presentation components
  free of transport logic.

**Exit criteria:** the main user journeys are covered by component/integration
tests, the Next.js build is reproducible, and no UI requires undocumented API
fields.

### 2. Fastify compatibility and ownership

Finish the TypeScript backend without changing public contracts:

- close remaining route and response parity gaps;
- verify publication, backup, score, metrics, multiplayer and discovery
  behavior against contract fixtures;
- make writer ownership and recovery boundaries explicit;
- keep SQLite schema and filesystem layout stable;
- define the final Flask compatibility window and cutover gates.

**Exit criteria:** every migrated domain has contract tests, recovery evidence,
one-writer ownership and a documented rollback path.

### 3. Docker Compose simplification

Reduce the deployment model to the smallest topology that still supports local
development, classroom use and production-like validation:

- remove obsolete bridge, initializer and duplicate service paths after their
  replacement is verified;
- keep the web app, API and WebSocket ownership obvious;
- preserve port `5080`, persistent `/data`, health checks and WebSocket
  upgrades;
- keep optional services behind explicit profiles;
- avoid host-specific paths and hidden volume coupling;
- validate every profile with `docker compose config` and a smoke runtime.

**Exit criteria:** a new operator can understand the Compose file without
reading migration reports, and each profile has a stated purpose and rollback.

### 4. Configuration and secret reduction

Reduce the environment surface and separate configuration from secrets:

- The standalone and Dream operational Compose boundaries now mount canonical
  authorizations, session, and bootstrap material as Docker secrets; Fastify
  accepts their `*_FILE` paths while retaining inline values for local
  compatibility.
- inventory every environment variable by owner and lifecycle;
- remove aliases and transitional variables only after compatibility evidence;
- group non-secret settings into a small documented configuration surface;
- move application secrets to Docker secrets or the deployment secret store;
- ensure secrets are never exposed in logs, diagnostics, backups or browser
  responses;
- preserve explicit local-development defaults without making them production
  defaults.

**Exit criteria:** the required environment variables are minimal and typed,
secret files have clear permissions, and startup fails closed when required
secrets are absent or unsafe.

### 5. Documentation source consolidation

Keep `docs/*.md` as the canonical product/developer documentation source for
the future Fumadocs project. Do not maintain a second full article copy in the
frontend.

- reorganize Markdown by audience and task, not by migration milestone;
- update architecture, API, deployment, Compose, security and development
  guides after the corresponding implementation work is stable;
- keep migration evidence out of the public documentation navigation;
- reduce `docs/modernization/` to this roadmap when the current work closes;
- replace the hardcoded frontend article model with links or a generated
  integration once the separate Fumadocs project is started.

**Exit criteria:** one canonical Markdown source exists for each document,
obsolete reports are removed, and no public guide describes a retired runtime
as the target architecture.

### 6. Cutover and retirement

Only after the previous workstreams pass:

- run a disposable migration and backup/restore rehearsal;
- verify firmware acceptance, API parity and WebSocket behavior;
- switch ownership domain by domain with monitoring;
- preserve a rollback window and reconcile writes;
- remove Flask, obsolete Compose paths and transitional configuration only after
  explicit acceptance;
- archive or delete the remaining migration evidence in the same cleanup.

## Validation gate

Before declaring the repository ready for review:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint
pnpm --dir frontend run test
pnpm --dir frontend run build
pnpm --dir backend run typecheck
pnpm --dir backend run lint
pnpm --dir backend run test
pnpm --dir backend run build
pnpm --dir cli run typecheck
pnpm --dir cli run lint
pnpm --dir cli run test
pnpm --dir cli run build
pytest -q
docker compose config
git diff --check
```

The repository wrapper `./manage.sh --json ci check` runs this same gate plus
the candidate, standalone, operational and root Compose configuration checks.

Python legacy validation is separate and is not a modernization gate while
Flask remains explicitly out of scope for refactoring.
