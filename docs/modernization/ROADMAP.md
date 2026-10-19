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
boundaries have been split by domain; the storefront statistics presentation
is now separated into focused download, ranking, run-health, score and shared
state modules. The Fastify backend has separate
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
- `d2743ea` — publication granular recovery delegates over one execution
  implementation.
- `16e1a52` — storefront statistics presentation by feature with a compatibility
  barrel.

Recent product and deployment follow-up on `development`:

- `d3c295f` — public storefront layout, interactive project signal and
  responsive homepage states;
- `95051de` — explicit primary and secondary participation CTAs;
- `949617e` — Docker-secret file support for Fastify secret settings;
- `51e6c7a` — application secret mounts in the supported Compose profiles;
- `2dbb9e5` — preflight validation for file-backed secrets;
- `50e5af3` — minimized standalone environment example;
- `a143f4f` — optional standalone integrations left under setup/admin
  ownership instead of being forced off by Compose.

The codebase is not considered migration-complete. The remaining work is
product and operational work, not a reason to keep splitting already-cohesive
orchestrators.

The 2026-10-19 SRP audit did not identify another safe backend extraction:
`app.ts` remains the composition root, `readiness/inventory.ts` is a
declarative route catalog, `restore-workflow.ts` is one transactional restore
state machine, `reconciliation.ts` already delegates file and operation scans,
and the administration/federation services each own one transactional domain.
These modules remain intentionally intact until a concrete ownership boundary
or duplicated behavior appears.

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

Current state: `deploy/standalone/compose.yaml` is the smallest two-service
Fastify + Next.js topology and mounts the required application material as
Docker secrets. Its optional SMTP, WebAuthn, mDNS and setup-network settings
are no longer overridden unconditionally. The Dream operational template
keeps its explicit `store.prg32.dream.test` and `api.prg32.dream.test`
integration values because those are infrastructure-owned deployment
settings.

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

The latest complete gate passed on 2026-10-19 after the frontend CTA,
standalone Compose, publication-execution and statistics-presentation changes.
It verified backend, frontend and CLI typecheck, lint, test and build commands,
`pytest -q`, all four Compose configuration checks, and `git diff --check`.
Flask remains outside the modernization gate and outside the SRP refactoring
scope.

The statistics presentation tranche was additionally verified on 2026-10-19
with the current frontend typecheck, lint, 52 test files (120 tests), build,
and `git diff --check`. The full repository gate was then rerun with the same
result. The existing storefront import path remains available through
`statistics-presentation.tsx`; no API, response, or browser contract was
changed.

Python legacy validation is separate and is not a modernization gate while
Flask remains explicitly out of scope for refactoring.
