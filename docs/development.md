# Development

## Requirements

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
corepack enable
pnpm --version
```

The repository uses pnpm and Node 24. Install dependencies once with
`pnpm install` at the root and in each workspace when needed.

## Local standalone development stack

dnsmasq resolves the `.dream.test` hosts. These are local development names
only, not production domains. Nginx terminates local TLS and routes the Store
and API hosts to the application containers, so Dream/Traefik is not required
for the application edge.

The backend joins Dream Platform's external `dream_mail` network to reuse its
Mailpit service. This Compose project does not create or proxy Mailpit.

Create a trusted local certificate once:

```bash
./deploy/local/setup-tls.sh
```

Then start the complete stack from the repository root:

```bash
docker compose up -d --build
```

That command starts the repository-owned standalone Nginx edge. To run the
application through the shared Dream Platform Traefik edge instead, keep
Dream Platform's Traefik and Mailpit services running and use the override:

```bash
docker compose \
  --env-file /path/to/dream-platform/.env \
  -f docker-compose.yml \
  -f docker-compose.dream-platform.yml \
  up -d --build backend next
```

In Dream Platform mode, visit `https://store.prg32.dream.test`. Traefik owns
ports 80 and 443, `backend` and `next` join `dream_edge`, and the backend also
uses the external `dream_mail` network. Nginx is not started.

Open:

- `https://store.prg32.dream.test` — Next storefront;
- `https://api.prg32.dream.test/health` — Fastify liveness;
- `https://api.prg32.dream.test/ready` — Fastify readiness.

When Dream Platform is running, its Mailpit inbox is available at
`https://mailpit.dream.test`.

The stack contains Fastify, Next.js and Nginx. Mailpit is an external Dream
Platform dependency on the `dream_mail` network. The canonical local data root
defaults to `.local/candidate/canonical`; set
`PRG32_CANONICAL_DATA_DIR` to an explicit disposable directory when required.
Never point this development stack at operational data.

The certificate files live under `.local/tls` and are ignored by Git. If the
host ports are already in use, set `PRG32_HTTP_PORT` and `PRG32_HTTPS_PORT` for
a temporary alternate port, or stop the previous edge before starting this
stack. The normal standalone edge uses ports 80 and 443.

## Direct processes

Run the API:

```bash
pnpm --dir backend dev
```

Run the frontend with an explicit API origin:

```bash
NEXT_PUBLIC_PRG32_API_ORIGIN=http://127.0.0.1:5090 \
  pnpm --dir frontend dev
```

## Validation

```bash
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint
pnpm --dir frontend run test
pnpm --dir frontend run build
pnpm --dir backend run typecheck
pnpm --dir backend run lint
pnpm --dir backend run test
pnpm --dir backend run build
docker compose config
pytest -q
git diff --check
```
