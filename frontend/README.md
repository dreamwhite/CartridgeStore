# PRG32 Cartridge Store Next.js foundation

This directory is the isolated Next.js/TypeScript application for the incremental migration. It contains only application bootstrap, providers, shared styles, the API boundary, theme state, and a testable UI primitive. Storefront features are intentionally not implemented here.

## Requirements

- Node.js 24 LTS (`nvm use 24`)
- pnpm 12.5.1 (the repository package manager)
- A reachable Fastify API upstream for the standard build, or the existing Flask service when using the explicit legacy compatibility path

## Development

The canonical integrated workflow is documented at
[`../docs/development.md`](../docs/development.md):

```bash
docker compose --profile dev up -d --build
```

For a direct process workflow, start Flask on its normal port in one terminal.
In a second terminal:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
cd frontend
pnpm install
FLASK_PROXY_TARGET=http://127.0.0.1:5080 \
pnpm run dev
```

Next.js rewrites the documented HTTP API paths to `PRG32_API_UPSTREAM` (default `http://fastify:5090`). The current Flask deployment remains supported when `FLASK_PROXY_TARGET` is set explicitly and `PRG32_API_UPSTREAM` is absent. Browser requests therefore stay same-origin from the Next.js page, while the selected backend remains authoritative for API behavior.

For the transitional Flask development path, set `FLASK_PROXY_TARGET=http://127.0.0.1:5080`. For a Fastify build, set `PRG32_API_UPSTREAM=http://127.0.0.1:5090`. Do not set both variables; the build fails closed rather than choosing an ambiguous upstream.

The Next.js development rewrites do not proxy WebSockets. Configure the
backend WebSocket URL separately with `NEXT_PUBLIC_PRG32_WS_URL`; the standard
Fastify endpoint is `ws://127.0.0.1:5090/api/multiplayer`. The transitional
Flask service remains available through the existing Compose profile.

For the shared Dream Platform Traefik environment, start from the repository root:

```bash
export PRG32_DEV_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export PRG32_DEV_BOOTSTRAP_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
docker compose --profile dev up --build
```

Use `https://store.prg32.dream.test` for the Next.js application and
`https://api.prg32.dream.test` for direct Flask API and WebSocket access. The
profile requires the external `dream_edge` network provided by the platform.

## Checks

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```
