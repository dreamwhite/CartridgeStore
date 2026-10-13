# PRG32 Cartridge Store Next.js foundation

This directory is the isolated Next.js/TypeScript application for the incremental migration. It contains only application bootstrap, providers, shared styles, the API boundary, theme state, and a testable UI primitive. Storefront features are intentionally not implemented here.

## Requirements

- Node.js 24 LTS (`nvm use 24`)
- pnpm 12.5.1 (the repository package manager)
- The existing Flask service for compatibility API calls during migration

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
pnpm run dev
```

Next.js runs on `http://127.0.0.1:3000` and rewrites the documented HTTP API paths to `FLASK_PROXY_TARGET` (default `http://127.0.0.1:5080`). Browser requests therefore stay same-origin from the Next.js page, while Flask remains available on its normal port and all existing Jinja routes remain unchanged.

The Next.js development rewrites do not proxy WebSockets. Multiplayer clients should use `NEXT_PUBLIC_FLASK_WS_URL` during this transition; the Flask WebSocket endpoint remains `ws://127.0.0.1:5080/api/multiplayer`.

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
