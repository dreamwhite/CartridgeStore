# Deployment

Deployment templates use the Fastify API and Next.js frontend behind an
operator-controlled reverse proxy. The local development Compose file also
includes a standalone Nginx edge for a reproducible `docker compose up -d`
workflow.

## Local and production hosts

The author's local dnsmasq setup resolves these development-only hosts. The
repository's local Compose file terminates TLS and routes them with Nginx;
Dream/Traefik is not required for the application edge:

| Local host | Service |
| --- | --- |
| `store.prg32.dream.test` | Next.js storefront |
| `api.prg32.dream.test` | Fastify API and WebSocket relay |

Do not publish those names as production URLs. Production runs on a different
server and must set its own registered hostnames and HTTPS origins before
starting `deploy/operational/compose.yaml`:

| Variable | Production value |
| --- | --- |
| `PRG32_STORE_DOMAIN` | Store hostname used by the Nginx edge |
| `PRG32_API_DOMAIN` | API hostname used by the Nginx edge |
| `PRG32_FRONTEND_PUBLIC_ORIGIN` | Full HTTPS storefront origin |
| `PRG32_API_PUBLIC_ORIGIN` | Full HTTPS API origin |
| `PRG32_API_WS_URL` | Full `wss://` multiplayer endpoint |
| `PRG32_COOKIE_DOMAIN` | Cookie domain matching the production host policy |

TLS terminates at the reverse proxy. The API validates the configured public
origins and trusts forwarded headers only when `PRG32_BACKEND_TRUST_PROXY` is
explicitly enabled.

## Persistent data and secrets

Mount the canonical data directory at `/data/canonical`. It contains SQLite,
cartridge objects, publication state and managed assets. Do not mount a host
path from the repository for a production deployment.

Use Docker secrets for the session secret, bootstrap token, canonical read/write
authorizations and encrypted secret key registry.

Keep the container filesystem read-only, drop capabilities, and provide a
small writable `/tmp` tmpfs as shown in the deployment templates.

## Health checks

Route traffic only after:

```text
GET http://backend:5080/health -> 200
GET http://backend:5080/ready  -> 200
GET http://next:3000/health    -> 200
```

The public reverse proxy must preserve WebSocket upgrades for
`/api/multiplayer`.

## Verification

```bash
docker compose -f deploy/operational/compose.yaml config
docker compose -f deploy/standalone/compose.yaml config
docker build -f backend/Dockerfile.operational -t prg32-cartridge-store-backend:local backend
docker build -f frontend/Dockerfile.operational -t prg32-cartridge-store-frontend:local frontend
```
