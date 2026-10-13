# PRG32 Cartridge Store documentation

This directory contains the operational documentation for the current
repository. The service is in an incremental migration: the Next.js frontend
and TypeScript/Fastify backend are active foundations, while Flask remains the
authoritative compatibility service for the legacy catalog, firmware, metrics,
scores, publishing, and multiplayer contracts until each boundary is migrated.

## Start here

| Need | Document |
| --- | --- |
| Understand the running system | [Architecture](architecture.md) |
| Start local development | [Development](development.md) |
| Configure services and environments | [Configuration](configuration.md) |
| Review trust boundaries and security rules | [Security](security.md) |
| Run the Docker profiles | [Docker](docker.md) |
| Operate, back up, and recover a deployment | [Operations](operations.md) and [Deployment](deployment.md) |
| Integrate firmware or tools | [API](api.md) and [API contract baseline](modernization/13-api-contracts.md) |
| Follow the migration history | [Modernization roadmap](modernization/19-revised-migration-roadmap.md) |

## Documentation rules

- Code and tests are authoritative for current behavior; modernization reports
  preserve historical decisions and evidence.
- Public route names, response fields, identifiers, architecture strings, and
  ABI names must remain compatible with PRG32 firmware and tools.
- Environment variable examples use placeholders or local-only defaults. Never
  copy credentials, registration links, private keys, or real user data into
  documentation.
- Browser E2E is not part of the active validation boundary. Federation
  protocol and authorization behavior is verified at the TypeScript/API layer.
- When a document and the implementation disagree, record and resolve the
  discrepancy rather than silently documenting an intended future state.

## Repository map

```text
CartridgeStore/
├── app.py, cartridge_store/     Transitional Flask/PWA and compatibility API
├── backend/                     TypeScript/Fastify backend foundation
├── frontend/                    Next.js application
├── templates/, static/          Existing Flask/Jinja UI and PWA assets
├── docker-compose.yml           Single Compose file with profiles
├── Dockerfile                   Flask production image
├── backend/Dockerfile           Fastify production image
├── frontend/Dockerfile          Next.js production image
├── tests/                       Python compatibility and integration tests
├── backend/tests/               Fastify/API contract and security tests
├── frontend/src/**/*.test.*     Next.js component and client tests
└── docs/modernization/          Audits, decisions, reports, and roadmap
```

