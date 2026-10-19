# PRG32 Cartridge Store documentation

The repository has one application runtime: a Fastify API and a Next.js
frontend. Dream/Traefik publishes them at `api.prg32.dream.test` and
`store.prg32.dream.test`.

## Start here

| Need | Document |
| --- | --- |
| Understand the running system | [Architecture](architecture.md) |
| Start local development | [Development](development.md) |
| Configure services | [Configuration](configuration.md) |
| Review security rules | [Security](security.md) |
| Integrate firmware and tools | [API](api.md) |
| Run Docker deployments | [Docker](docker.md) and [Deployment](deployment.md) |
| Operate the service | [Operations](operations.md) |
| Review the active roadmap | [Modernization roadmap](modernization/ROADMAP.md) |

Code and tests are authoritative for current behavior. Public route names,
response fields, identifiers, architecture strings and ABI names remain stable
for PRG32 firmware and tools.
