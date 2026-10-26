# Docker

## Development

For a local setup that does not depend on Dream Platform, use dnsmasq plus
mkcert and the repository-owned Traefik overlay. The complete procedure,
including the DNS entry and certificate generation, is in
[Development](development.md#local-development-with-dnsmasq-mkcert-and-traefik).

The root Compose file is self-contained and includes the local TLS edge:

```bash
cp .env.example .env
./deploy/local/setup-tls.sh
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
docker compose ps
docker compose logs -f backend next docs traefik
```

It starts `backend`, `next`, `docs` and a generic Traefik edge on the private
application and edge networks. Traefik publishes ports 80 and 443, redirects
HTTP to HTTPS, routes the Store/API subhosts and preserves WebSocket upgrades.
The application services are not exposed directly on host ports.

The external network must already exist:

```bash
docker network inspect dream_mail
```

Override its name with `DREAM_MAIL_NETWORK` when Dream Platform uses a
different network name.

## Dream Platform edge (optional)

When the shared Dream Platform Traefik service should own HTTPS ingress, use
the dedicated override instead of starting the local Nginx service:

```bash
docker compose \
  --env-file /path/to/dream-platform/.env \
  -f docker-compose.yml \
  -f docker-compose.dream-platform.yml \
  up -d --build backend next
```

The override attaches the routed services to the external `dream_edge` network
and adds Dream-specific Traefik routers. Traefik and the standalone Nginx or
repository-owned generic Traefik edge are mutually exclusive owners of host
ports 80 and 443.

## Deployment images

Build the two production images independently:

```bash
docker build -f backend/Dockerfile.operational \
  -t prg32-cartridge-store-backend:local backend
docker build -f frontend/Dockerfile.operational \
  -t prg32-cartridge-store-frontend:local frontend
```

The frontend receives its public API origin at build time through
`NEXT_PUBLIC_PRG32_API_ORIGIN`. It does not contain a runtime proxy.

## Cleanup

Only remove project resources after verifying the exact targets:

```bash
docker compose down --remove-orphans
docker image prune -f
docker builder prune -f
docker volume prune -f
```

Never use broad destructive Docker cleanup on a host that contains unrelated
projects.
