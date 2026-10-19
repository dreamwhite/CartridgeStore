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

## Local Dream development stack

The author's local infrastructure provides the external `dream_edge` network,
and dnsmasq resolves the `.dream.test` hosts. These are local development
names only, not production domains. Start the application from the repository
root:

```bash
docker compose --profile dev up -d --build
```

Open:

- `https://store.prg32.dream.test` — Next storefront;
- `https://api.prg32.dream.test/health` — Fastify liveness;
- `https://api.prg32.dream.test/ready` — Fastify readiness.

The profile contains only `backend` and `next`. The canonical local data root
defaults to `.local/candidate/canonical`; set `PRG32_CANONICAL_DATA_DIR` to an
explicit disposable directory when required. Never point this profile at
operational data.

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
