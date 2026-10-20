# Docker

## Development

The root Compose file is self-contained and includes the local TLS edge:

```bash
./deploy/local/setup-tls.sh
docker compose up -d --build
docker compose ps
docker compose logs -f backend next nginx
```

It starts `backend`, `next` and `nginx` on the private `prg32_store_dev`
network. The backend also attaches to the external `dream_mail` network and
uses the Mailpit service provided by Dream Platform; this project does not
create a second Mailpit container. Nginx publishes ports 80 and 443, redirects
HTTP to HTTPS, routes the Store/API subhosts and preserves WebSocket upgrades.
The application services are not exposed directly on host ports.

The external network must already exist:

```bash
docker network inspect dream_mail
```

Override its name with `DREAM_MAIL_NETWORK` when Dream Platform uses a
different network name.

## Dream Platform edge

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
and adds the `store.prg32.dream.test` and `api.prg32.dream.test` Traefik
routers. Traefik and the standalone Nginx edge are mutually exclusive owners
of host ports 80 and 443.

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
