# PRG32 Cartridge Store — Documentation Foundation Report

Date: 2026-10-13
Status: **Documentation foundation complete; implementation unchanged**

## Objective

After the TypeScript/Fastify, Next.js, Docker, federation, and SRP milestones,
the repository needed a coherent current-state documentation layer. Existing
documents covered individual milestones well but mixed historical Flask-only
descriptions with the active migration topology.

This batch establishes a maintained entry point without changing application
behavior, database schema, public API contracts, deployment routing, or
authentication behavior.

## Documentation added

- `docs/README.md` — documentation map, repository map, and documentation
  rules;
- `docs/architecture.md` — current runtime topology, Compose profiles,
  containers, route ownership, persistence, code boundaries, and migration
  invariants;
- `docs/development.md` — Node 24/pnpm workflow, direct processes, Compose
  dev workflow, HMR, verification commands, and safe contribution rules;
- `docs/configuration.md` — Flask, Fastify, Next, origin, isolation, and
  resource-limit configuration reference;
- `docs/security.md` — implementation-independent trust boundaries,
  authentication/federation rules, write isolation, resource containment, and
  production checklist.

## Documentation aligned

- `README.md` now leads with the current Next.js/TypeScript migration and
  points contributors to the canonical documents;
- `frontend/README.md` now points to the root integrated workflow;
- `docs/api.md` now explains route ownership versus public contract;
- `docs/modernization/19-revised-migration-roadmap.md` records this batch and
  the next documentation/implementation boundary.

## Evidence

The documentation was derived from the current repository rather than an
assumed target architecture:

- `docker-compose.yml` and Dockerfiles were inspected for profiles, mounts,
  networks, ports, readiness, and multi-stage runtime behavior;
- `backend/src/app.ts`, `backend/src/config/env.ts`, route modules, and package
  manifests were inspected for composition, ownership, defaults, and checks;
- existing API, security, Docker, operations, and modernization reports were
  cross-referenced;
- the active dev stack had already been rebuilt and verified in the preceding
  implementation milestone, with HTTP 200 probes on the configured store/API
  origins;
- no credentials, provider secrets, private key material, or production data
  were copied into documentation.

## Deliberate boundaries

- The documentation does not claim that Flask has been removed.
- It does not claim that browser OIDC/SAML E2E has passed; active validation is
  backend/API-level after explicit removal of Playwright/AuthentiK E2E.
- It does not turn `sso.dream.test` into an application dependency; providers
  remain generic OIDC/SAML configuration.
- It does not introduce a second Compose file, anonymous persistent volumes,
  a deployment change, or a code refactor.

## Next recommendation

Use these documents as the review baseline for the next implementation
milestone. The next code milestone should update the route-ownership table and
API contract evidence whenever a boundary moves from Flask to Fastify; do not
declare Flask removable until all legacy firmware/WebSocket/catalog contracts
have parity tests and an explicit cutover plan.

