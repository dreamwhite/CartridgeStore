# PRG32 Cartridge Store documentation

This directory contains the canonical Markdown documentation for the current
repository. The Next.js frontend and TypeScript/Fastify backend are the active
modernization foundations. Flask remains available temporarily as a
compatibility path, but it is not a target for further refactoring.

## Start here

| Need | Document |
| --- | --- |
| Understand the running system | [Architecture](architecture.md) |
| Start local development | [Development](development.md) |
| Configure services and environments | [Configuration](configuration.md) |
| Review trust boundaries and security rules | [Security](security.md) |
| Run the Docker profiles | [Docker](docker.md) |
| Operate a deployment | [Operations](operations.md) and [Deployment](deployment.md) |
| Integrate firmware or tools | [API](api.md) and the compatibility contracts |
| Follow the active work plan | [Modernization roadmap](modernization/ROADMAP.md) |

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
