# Deployment

Deployment templates use the Fastify API and Next.js frontend as two services
behind an operator-controlled reverse proxy.

## Public hosts

| Host | Service |
| --- | --- |
| `store.prg32.dream.test` | Next.js storefront |
| `api.prg32.dream.test` | Fastify API and WebSocket relay |

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
