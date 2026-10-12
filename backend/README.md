# PRG32 TypeScript Backend Foundation

This is the TypeScript/Fastify migration foundation. Catalog reads remain
read-only, while M5.1 adds submission writes only inside the explicitly
disposable writer profile. Flask remains the public backend and the sole
operational database/filesystem writer.

The backend is pinned to the Node.js 24 LTS line. Use Node 24 for local
development and CI; the multistage image uses `node:24-bookworm-slim`.

## Local usage

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm install
PRG32_BACKEND_DB=/absolute/path/to/an/isolated/cartridge_store.sqlite pnpm dev
```

`GET /health` is liveness. `GET /ready` opens the configured SQLite file in
read-only mode and returns readiness without exposing the path. A missing file
is a safe not-ready state; the backend never creates its parent directory or
falls back to a writable database.

The default listener is `127.0.0.1:5090`, deliberately separate from Flask's
port 5080 and from the Traefik `api.prg32.dream.test` route.

## Disposable authentication writer profile

The single root Compose file also provides an explicit `writer-init`/`writer`
profile for local authentication, submission lifecycle, and filesystem-boundary
smoke tests. It is
not enabled by default, has no Traefik labels or edge network, and publishes
only `127.0.0.1:5091`. The writer uses separate named volumes for its auth
SQLite file, read-only shadow SQLite file, and disposable cartridge data. Its
root filesystem is read-only, all Linux capabilities are dropped, and
`no-new-privileges` is enabled.

Provision the disposable volumes explicitly, then start the writer:

```bash
docker compose --profile writer-init run --rm auth-writer-init
docker compose --profile writer up auth-writer
```

The init service is the only component that creates the synthetic databases;
normal backend startup never creates a database or falls back to operational
paths. Use a disposable volume prefix for smoke tests when the default named
volumes should not be retained:

```bash
PRG32_WRITER_VOLUME_PREFIX=prg32_m45_smoke \
docker compose --profile writer-init run --rm auth-writer-init
```

M5.1 submission writes are enabled only in this disposable writer profile. A
successful `POST /api/publish/bundle` creates a `pending/<submission_id>/`
directory and a `pending` SQLite row; it never writes `index.json` or a
published cartridge directory. The `/api/publish` alias is preserved and
`/publish` returns the Flask-compatible redirect after a successful upload.
Review, approval, publication, and deletion routes are not implemented here.

The isolated writer uses these additional settings:

```text
PRG32_BACKEND_SUBMISSION_WRITE_ENABLED=true
PRG32_BACKEND_SUBMISSION_WRITE_MODE=test
PRG32_BACKEND_SUBMISSION_DISPOSABLE_ROOT=/writer-store
```

The ZIP limits default to 64 MiB archive bytes, 128 entries, 32 MiB per
entry, 128 MiB total decompressed bytes, 100:1 compression ratio, and 256 KiB
manifest bytes. They can be tightened with the
`PRG32_BACKEND_SUBMISSION_MAX_*` variables in isolated test environments.

The profile is a trusted single-container development boundary, not protection
against a host administrator or another process with access to Docker volumes.

## Development Compose profile

The root `docker-compose.yml` contains an isolated `backend` profile. It
binds only to loopback port 5090, has no Traefik labels, no edge network, and
mounts an operator-provided fixture directory read-only. Set
`PRG32_BACKEND_FIXTURE_DIR` to a directory containing an isolated
`cartridge_store.sqlite` before using the readiness endpoint.

M4.1 authentication writes are disabled in this profile by default. Tests may
enable them only with a separate pre-existing disposable SQLite file inside a
pre-existing disposable root:

```bash
PRG32_BACKEND_AUTH_WRITE_ENABLED=true \
PRG32_BACKEND_AUTH_WRITE_MODE=test \
PRG32_BACKEND_AUTH_WRITE_DB=/absolute/path/to/disposable/auth.sqlite \
PRG32_BACKEND_AUTH_DISPOSABLE_ROOT=/absolute/path/to/disposable \
PRG32_BACKEND_SESSION_SECRET=local-only-secret
```

The root and database must already exist, contain no symlink indirection, and
must be outside the operational database path. Device/inode checks reject
same-file hardlinks. SQLite URI syntax is rejected. The operational/shadow
database path is always rejected as a writer target. See
[`27-m4-5-trusted-write-boundary-report.md`](../docs/modernization/27-m4-5-trusted-write-boundary-report.md).
