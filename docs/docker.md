# Docker

## Development

The root Compose profile is intentionally small:

```bash
docker compose --profile dev up -d --build
docker compose --profile dev ps
docker compose --profile dev logs -f backend next
```

It starts only `backend` and `next`, joins the external `dream_edge` network,
and uses a disposable bind-mounted canonical root. The API is available on
loopback port `5090`; the edge publishes the public HTTPS hosts.

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
docker compose --profile dev down --remove-orphans
docker image prune -f
docker builder prune -f
docker volume prune -f
```

Never use broad destructive Docker cleanup on a host that contains unrelated
projects.
