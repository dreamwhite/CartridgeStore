# Modernization roadmap

The runtime cutover is complete when the Fastify API, Next.js frontend and
repository-owned Nginx edge are the only application path. Keep this file short; detailed audit
evidence belongs in the tranche report referenced below.

## Completed

- Split frontend API modules by domain while preserving public barrels.
- Established canonical Fastify catalog, workflow, auth, federation and
  telemetry boundaries.
- Removed the old application runtime, templates, static assets and Python
  dependency surface.
- Simplified development Compose to `backend`, `next` and the repository-owned
  Nginx edge, reusing Dream Platform's external Mailpit network.
- Switched browser API calls to the explicit API origin.
- Added the PRG32 brand asset and dashboard UI refinements.

## Active next steps

- Download the current data from `store.prg32.uniparthenope.it` and upload it
  manually into the new site to demonstrate the catalog workflow.
- Replace placeholder Dream secrets with Docker secrets in the approved
  deployment environment.
- Prepare the Fumadocs project from the maintained Markdown documentation.
- Revisit dashboard workspace decomposition after the public storefront is
  stable.
- Define API version discovery for firmware clients, including a stable
  bootstrap/discovery document and a compatibility strategy for legacy routes;
  validate the design against the working PRG32 firmware prototype before
  implementing it.

## Guardrails

- Preserve firmware routes, response fields, ABI names, architecture strings,
  binary format, WebSocket messages and SQLite schema.
- Do not migrate or mutate operational data as part of UI or runtime cleanup.
- Do not add a second API proxy or a second application runtime.
- Keep audit reports tranche-sized and delete obsolete working notes before a
  pull request.
