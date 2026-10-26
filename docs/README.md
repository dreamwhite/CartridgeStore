# PRG32 Cartridge Store documentation

The repository has one application runtime: a Fastify API and a Next.js
frontend. Local development uses configurable dnsmasq hostnames, defaulting to
`api.prg32.test` and `store.prg32.test`, with local HTTPS provided by mkcert
and the generic Traefik overlay. Production uses separately configured
registered domains; see [Deployment](deployment.md).

## Start here

| Need | Document |
| --- | --- |
| Understand the running system | [Architecture](architecture.md) |
| Start the generic local edge | [Development](development.md) |
| Understand the optional Dream integration | [Dream Platform](dream-platform.md) |
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
