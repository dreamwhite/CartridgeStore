# PRG32 Cartridge Store

PRG32 Cartridge Store is the classroom service for `.prg32` cartridges. The
runtime is a Fastify/TypeScript API paired with a Next.js frontend.

## Development

The local dnsmasq-managed `.dream.test` records expose the standalone Nginx
edge at:

- <https://store.prg32.dream.test> — Next.js frontend;
- <https://api.prg32.dream.test> — Fastify API and WebSocket relay.

The backend attaches to the external `dream_mail` Docker network so it can use
the Mailpit instance owned by Dream Platform. Mailpit is intentionally not part
of this repository's Compose project; its inbox remains available at
<https://mailpit.dream.test> when Dream Platform is running.

These are local-only development hosts. Production runs on another server and
must configure its own registered storefront/API domains, HTTPS origins,
cookie domain, certificates and WebSocket URL through the operational Compose
template.

Start the development topology with Node.js 24 and Docker Desktop:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
./deploy/local/setup-tls.sh
docker compose up -d --build
```

Persistent canonical development data is kept in `.local/candidate/canonical`;
it is not modified by the application build. Local TLS files are generated in
`.local/tls` and are not committed.

## Public contracts

The Fastify service preserves the catalog, download, scores, metrics,
multiplayer, discovery, authentication, federation, and publishing contracts.
Firmware-facing constants remain unchanged, including `esp32c6`, `qemu`,
`prg32-metadata-1.0`, `prg32-colophon-1.0`, and
`prg32-store-discovery-1.0`.

The public API is documented in [docs/api.md](docs/api.md). The current
topology and operational boundaries are described in
[docs/architecture.md](docs/architecture.md).
The shared local infrastructure contract is documented in
[docs/dream-platform.md](docs/dream-platform.md).

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
pytest -q
git diff --check
```

The runtime cutover audit and remaining work are tracked in
`docs/modernization/`.
