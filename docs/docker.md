# Docker Deployment

Docker deployment runs the web catalog, score API, metrics receiver, and
multiplayer WebSocket relay as one service.

## Compose profiles

The repository uses one `docker-compose.yml` with explicit profiles. The
`dev` profile runs Next.js, the Fastify authentication/federation writer, the
transitional Flask compatibility API, and an edge bridge behind the shared
Dream Platform Traefik installation. It expects the external `dream_edge`
network created by that platform.

Start the platform Traefik service first, then run:

```bash
docker compose --profile dev up -d --build
```

The dev profile exposes two HTTPS hostnames through Traefik:

```text
https://store.prg32.dream.test  # Next.js application
https://api.prg32.dream.test    # Fastify auth + Flask compatibility API/WS
```

The defaults can be overridden without editing Compose:

```bash
PRG32_STORE_DOMAIN=store.prg32.dream.test \
PRG32_API_DOMAIN=api.prg32.dream.test \
docker compose --profile dev up -d --build
```

The API host is split by route ownership: `/auth/*`, `/api/auth/*`, and
`/api/admin/federation/*` go through the Fastify writer bridge; legacy Flask
routes, including `/api/games` and `/api/multiplayer`, remain on Flask. The
Next.js browser calls the API origin directly in dev, while Traefik still
provides the HTTPS edge and WebSocket upgrade path.

The dev profile starts `auth-writer-init`, `auth-writer`,
`auth-writer-edge-proxy`, `flask`, and `next`. It does not start an identity
provider or browser-test infrastructure. All writable dev state is
bind-mounted below `.local/`; neither service mounts production `./data`.

### Repository-local Docker state

The Compose file deliberately does not declare Docker-managed data volumes.
Writable state and rebuildable caches use explicit bind directories relative to
the repository root:

```text
data/                         production Flask data
.local/flask/data/            dev Flask data
.local/writer/                dev Fastify auth/shadow/store data
.local/backend/node_modules/  backend dependency cache
.local/frontend/              frontend dependency and Next cache
```

`.local/` is ignored by Git. A fresh checkout therefore starts with an empty,
visible local state tree, and moving the repository to another machine does
not require importing anonymous Docker volumes. The disposable writer init
also creates its local synthetic key registry inside `.local/writer/auth-data`;
no ignored `.secrets` file is required for the default dev profile. Persistent
production data is still explicit under `data/` (or `PRG32_PROD_DATA_DIR`).
Override any state location with the corresponding `PRG32_*_DIR` Compose
variable when the host uses a separate data disk.

The dev writer defaults to UID/GID `0:0` because Docker Desktop bind mounts
preserve host ownership and the host UID is not portable across machines. Set
`PRG32_WRITER_UID` and `PRG32_WRITER_GID` when the host uses a matching Linux
UID/GID; this affects only the dev/writer profiles, not production images.

### Development hot reload

The `dev` profile watches the mounted source trees inside the containers:

- `backend/` is mounted into Fastify and `tsx watch` restarts the TypeScript
  backend after source changes.
- The repository root is mounted into Flask and `flask run --debug` reloads the
  transitional compatibility API after Python/template/static changes.
- `frontend/` is mounted into Next.js. Next runs its webpack development server
  with Watchpack polling so HMR also works reliably when the repository is on a
  Docker Desktop/macOS filesystem.

Start the stack with:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
docker compose --profile dev up -d --build
```

Follow reload activity with:

```bash
docker compose --profile dev logs -f auth-writer flask next
```

Changes to `package.json` or either lockfile require a rebuild so the bind
mounted dependency directories are reseeded:

```bash
docker compose --profile dev up -d --build auth-writer next
```

The Compose file supplies stable local-only fallback secrets for Flask and the
Fastify disposable writer, so the canonical command needs no manual exports.
Override them with uncommitted environment values when desired; never reuse
them in production.

```bash
docker compose --profile dev up -d --build
```

Stop dev without deleting repository-local state:

```bash
docker compose --profile dev down --remove-orphans
```

The isolated TypeScript backend foundation is available through the `backend`
profile. It binds only to `127.0.0.1:5090` and uses read-only fixture data:

```bash
docker compose --profile backend up --build
```

### Disposable TypeScript writer smoke environment

M4.5 adds two explicit profiles for testing the isolated authentication writer.
They are separate from `dev`, `backend`, and `prod`; they have no Traefik
labels or edge network and expose only `127.0.0.1:5091`:

```bash
docker compose --profile writer-init run --rm auth-writer-init
docker compose --profile writer up --build auth-writer
```

`auth-writer-init` creates only synthetic databases and a disposable cartridge
filesystem in explicit bind directories. It pre-creates the two SQLite files
before applying the schema because SQLite's first journaled write is not
reliable on a newly-created Docker Desktop/macOS bind-mounted database file.
The writer mounts its shadow SQLite directory read-only and its auth/database
and cartridge directories separately. The writer container has a read-only
root filesystem, dropped capabilities, and
`no-new-privileges`. It does not mount `/data`, the production database, or the
operational cartridge directory.

The init step is deliberately explicit: normal startup does not create missing
databases. To isolate smoke-test state, set the bind-directory variables before
both commands. Removing this test data is limited to those explicit paths, for
example:

```bash
PRG32_WRITER_DATA_DIR=./.local/m45-smoke/auth-data \
PRG32_WRITER_SHADOW_DIR=./.local/m45-smoke/shadow \
PRG32_WRITER_STORE_DIR=./.local/m45-smoke/store \
docker compose --profile writer --profile writer-init down
rm -rf -- ./.local/m45-smoke
```

This is a trusted development boundary, not a defense against a privileged
host administrator, Docker daemon access, or an untrusted process that can
modify the bind-mounted state directories.

M5.1 enables submission writes only in `auth-writer`. Bundle uploads are
validated and staged below `pending/<submission_id>/` in the disposable
`/writer-store` bind directory. The service does not write the published catalog index;
review and publication remain Flask responsibilities until the later M5.2
gate.

The production Flask image is available through the `prod` profile. Set
`SECRET_KEY` before starting it; an empty production secret is rejected by the
application at startup:

```bash
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
docker compose --profile prod up --build
```

## Quick Start

```bash
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
docker compose --profile prod up --build
```

Open:

```text
http://127.0.0.1:5080/
```

The WebSocket multiplayer URL is:

```text
ws://127.0.0.1:5080/api/multiplayer
```

## Persistent Data

The `prod` service in `docker-compose.yml` mounts `./data` on the host to
`/data` in the container.
The container uses:

```text
PRG32_STORE_DATA=/data
PRG32_STORE_DB=/data/cartridge_store.sqlite
```

This keeps uploaded cartridges, pending review packages, the catalog index,
scores, and metrics outside the container image.

## Build Only

```bash
docker build -t prg32-cartridge-store:local .
```

The production Dockerfiles use multi-stage builds. The Flask runtime receives
only the Python virtualenv built from `requirements.runtime.txt` and the
application files from the dependency stage; test dependencies such as pytest
stay out of the image. The Next.js runtime receives only the standalone server
and static assets; npm and the frontend toolchain remain in earlier stages.

Build the production images separately:

```bash
docker build -t prg32-cartridge-store:local .
docker build \
  --build-arg FLASK_PROXY_TARGET=http://flask:5080 \
  --build-arg NEXT_PUBLIC_FLASK_WS_URL=wss://api.prg32.dream.test/api/multiplayer \
  -f frontend/Dockerfile \
  -t prg32-cartridge-store-frontend:local \
  frontend
```

The Next.js image is built with `output: standalone` and starts with
`node server.js` on port 3000. Its proxy target and public WebSocket URL are
build arguments because Next.js resolves these route settings during the
production build; supply the values for the target deployment rather than
using the development defaults.

Run the image manually:

```bash
docker run --rm \
  -p 5080:5080 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY="$SECRET_KEY" \
  -e PRG32_ENV=production \
  -e PRG32_SESSION_COOKIE_SECURE=1 \
  -e PRG32_BOOTSTRAP_TOKEN="${PRG32_BOOTSTRAP_TOKEN:-}" \
  -e PRG32_STORE_DATA=/data \
  -e PRG32_STORE_DB=/data/cartridge_store.sqlite \
  prg32-cartridge-store:local
```

Database users are the primary auth path. Fresh data has no known admin
password: set `PRG32_BOOTSTRAP_TOKEN` (or the dev variable above) and call the
one-time `POST /auth/bootstrap` endpoint from [the API documentation](api.md).
Existing users and roles are preserved. New users register by email verification link. Configure `PRG32_SMTP_HOST` and related
SMTP variables to send those links. Legacy `PRG32_USERS` tokens are still
accepted for API clients, but database users in the `editors` group must verify
pending cartridge packages.

Production Compose explicitly enables Secure, HttpOnly, SameSite=Lax session
cookies with an eight-hour permanent session lifetime. The dev profile uses
HTTP-compatible cookies for local Traefik development. TLS is terminated by
the shared Traefik edge; Flask does not blindly trust forwarded headers.

Use `/setup` to configure SMTP, mDNS, OpenID Connect, and SAML2 from the
browser. Environment variables with matching `PRG32_*` names override saved
setup values after restart.

## Classroom LAN Deployment

Find the host computer IP address and point boards to:

```text
http://<host-ip>:5080
ws://<host-ip>:5080/api/multiplayer
```

The discovery document is available at:

```text
http://<host-ip>:5080/.well-known/prg32-store.json
```

The service advertises itself via mDNS as `_prg32store._tcp.local.`. Set
`PRG32_MDNS_DISABLED=1` to turn that off, or `PRG32_MDNS_NAME` to change the
advertised name.

## Backup and Restore

Administrators can download and restore a full ZIP backup from `/admin/backup`.
The archive includes the SQLite database and filesystem data mounted under
`/data`, covering settings, users, roles, groups, cartridges, scores,
statistics, measurements, and metrics.

## Maintenance

View logs:

```bash
docker compose --profile prod logs -f
```

Restart after configuration changes:

```bash
docker compose --profile prod restart
```

Stop the service while keeping data:

```bash
docker compose --profile prod down
```

Stop and remove local persistent data:

```bash
docker compose --profile prod down
rm -rf data
```

Only remove `data` when you intentionally want to delete uploaded cartridges,
scores, and metrics.
