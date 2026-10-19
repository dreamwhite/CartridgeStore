# Development guide

This is the canonical contributor workflow for the current migration. It uses
Node.js 24 LTS and pnpm 12.5.1. Flask remains available for compatibility and
is not removed or rewritten by frontend/backend development.

## Prerequisites

- Node.js 24 LTS through `nvm`;
- pnpm 12.5.1;
- Python 3.13-compatible runtime and a virtual environment for Flask tests;
- Docker Engine and Compose v2 for the integrated profile;
- the external `dream_edge` Docker network when using the shared Traefik
  infrastructure.

Select Node before every local pnpm session:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
node --version
pnpm --version
```

The expected versions are Node 24.x and pnpm 12.5.1. The frontend and backend
package manifests enforce the Node 24 range.

## Install dependencies

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
```

Python setup remains isolated from the Node workspace:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Current Fastify + Next.js workflow

The active application path is the two-service Fastify + Next.js deployment.
For an infrastructure-independent checkout, follow the
[standalone deployment guide](../deploy/standalone/README.md). It keeps
Fastify as the API and WebSocket owner and Next.js as the storefront owner.

For the shared Dream infrastructure, use the operational template after its
external networks and secret directory are prepared. The expected public
origins are:

- `https://store.prg32.dream.test` for Next.js;
- `https://api.prg32.dream.test` for Fastify, API calls and WebSockets.

The repository's root Compose profile below remains available only when a
compatibility route or migration boundary needs Flask.

## Compatibility integrated development

The root Compose file starts Flask, Next, the isolated Fastify auth writer, the
API bridge, and the initialization job. Use it only for legacy route coverage
or migration diagnostics; it is not the target two-service topology. It
expects the shared Traefik network to exist:

```bash
docker network inspect dream_edge >/dev/null
docker compose --profile dev up -d --build
docker compose --profile dev ps
```

Use:

- <https://store.prg32.dream.test> for Next.js;
- <https://api.prg32.dream.test> for API and WebSocket routes.

The canonical repository-local state is under `.local/`. It is bind-mounted,
ignored by Git, and safe to recreate on another host. Stop services without
removing data with:

```bash
docker compose --profile dev down
```

Useful diagnostics:

```bash
docker compose --profile dev logs -f next
docker compose --profile dev logs -f flask
docker compose --profile dev logs -f auth-writer
docker compose --profile dev config --quiet
```

Do not use a persistent Authentik instance as a development dependency. The
application accepts generic OIDC/SAML provider configuration; provider/browser
E2E is outside the active test boundary.

## Hot reload

- Flask mounts the repository root and runs `flask run --debug`.
- Fastify mounts `backend/` and runs `tsx watch`.
- Next mounts `frontend/` and runs webpack development mode with Watchpack
  polling for Docker Desktop/macOS filesystem events.

The first request after a source edit may wait for the relevant process to
recompile. If a container is healthy but the store host returns 502, check
the `next` log and retry after the `Ready` message.

## Direct Fastify + Next.js workflow

Use this when Docker and Traefik are not needed:

Terminal 1 — Fastify:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend dev
```

Terminal 2 — Next.js:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
PRG32_API_UPSTREAM=http://127.0.0.1:5090 pnpm --dir frontend dev
```

Fastify listens on `http://127.0.0.1:5090` by default and Next.js on
`http://127.0.0.1:3000`. The browser-facing Next.js requests use the
backend-neutral `PRG32_API_UPSTREAM` setting; `FLASK_PROXY_TARGET` is only a
legacy compatibility escape hatch.

## Direct Flask compatibility workflow

Use this only when working on the transitional Flask/PWA path.

Terminal 1 — Flask compatibility service:

```bash
source .venv/bin/activate
export SECRET_KEY=local-only-change-me
export PRG32_ENV=development
export PRG32_MDNS_DISABLED=1
flask --app app:app run --debug --host 127.0.0.1 --port 5080
```

Terminal 2 — Next.js:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
FLASK_PROXY_TARGET=http://127.0.0.1:5080 pnpm --dir frontend dev
```

Next runs on `http://127.0.0.1:3000`. Its default compatibility rewrites target
Flask; WebSocket clients must use the Flask WebSocket URL directly because
Next rewrites do not proxy WebSocket upgrades.

Do not enable writable test boundaries against production paths.

## Verification commands

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24

pnpm --dir backend run typecheck
pnpm --dir backend run lint
pnpm --dir backend run test
pnpm --dir backend run build

pnpm --dir frontend run typecheck
pnpm --dir frontend run lint
pnpm --dir frontend run test
PRG32_API_UPSTREAM=http://127.0.0.1:5090 pnpm --dir frontend run build

source .venv/bin/activate
python -m py_compile app.py cartridge_store/*.py
python -m pytest -q

docker compose --profile dev config --quiet
git diff --check
```

The frontend build accepts the backend-neutral `PRG32_API_UPSTREAM`; the
legacy `FLASK_PROXY_TARGET` remains available only for compatibility. Browser
E2E and Authentik suites are not part of these checks.

## Safe contribution rules

- Do not commit `.local/`, `data/`, SQLite databases, secrets, key registries,
  registration links, or provider credentials.
- Do not change the database schema or public contract without a modernization
  report and compatibility tests.
- Do not modify `../PRG32` from this repository task; verify shared ABI
  constants against it when a protocol constant changes.
- Keep production images multi-stage and do not add development toolchains to
  runtime stages.

