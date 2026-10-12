# Repository audit

## Scope and evidence rules

This audit treats checked-out source as authoritative. The public deployment URL could not be opened by the read-only inspection tool, so no claim is made that production matches this checkout. No database, deployment configuration, credential, or application behavior was changed.

## Directory structure

| Area | Contents | Responsibility |
| --- | --- | --- |
| `app.py` | Development entrypoint | Exports `app` and runs Flask debug server locally ([app.py](../../app.py:1)) |
| `cartridge_store/` | Flask modules | App factory, catalog storage, PRG32 format, auth, review, scores, metrics, stats, users, mDNS, WebSocket relay |
| `cartridge_store/auth/` | Local/OIDC/SAML/LDAP adapters | Principal resolution, sessions, API tokens, role/group checks, optional identity providers |
| `templates/` | 24 Jinja templates | Storefront, detail, publish, auth, editor, admin, stats, profiles, run views |
| `static/` | CSS, JS, PWA assets | Global stylesheet, service worker, manifest, icons |
| `tests/` | pytest tests | Format, API, services, auth, storage, relay and page regression tests |
| `docs/` | Operations and developer docs | Setup, API, deployment, Docker, operations, game development |
| root manifests | `requirements.txt`, `Dockerfile`, `docker-compose.yml` | Python dependencies and single-container deployment |

No `package.json`, TypeScript configuration, frontend build, lockfile, CI workflow, or migration directory is present in the checkout. Hidden-file discovery found only Git/Docker/Pytest metadata; `.github/workflows` is absent.

## Component responsibilities and execution flow

1. `app.py` imports `create_app` from `cartridge_store`, which delegates to [cartridge_store/app.py](../../cartridge_store/app.py:103).
2. The factory resolves `DATA_DIR` and SQLite path, configures Flask, registers teardown, then registers auth, settings, scores, metrics, multiplayer, stats, users, review, and mDNS modules ([cartridge_store/app.py](../../cartridge_store/app.py:103-162)).
3. Each service module adds a `before_request` initializer that executes idempotent `CREATE TABLE IF NOT EXISTS`, indexes, and limited `ALTER TABLE` compatibility additions.
4. Browser requests render Jinja templates. API requests return JSON or binary assets. `GET /api/games` reads the complete JSON index, filters in Python, and paginates the resulting list ([cartridge_store/app.py](../../cartridge_store/app.py:546-574); [cartridge_store/store.py](../../cartridge_store/store.py:159-165)).
5. Publishing accepts a ZIP bundle, validates its manifest/assets/architectures, builds PRG32 metadata trailers, and creates a pending review record plus filesystem files ([cartridge_store/app.py](../../cartridge_store/app.py:977-1076); [cartridge_store/review.py](../../cartridge_store/review.py:71-125)).
6. An editor verifies or rejects a submission. Verification rebuilds each variant and publishes it into the filesystem catalog; the review row is then marked verified ([cartridge_store/review.py](../../cartridge_store/review.py:209-258)).
7. Downloads resolve the selected version/architecture, record an event, and stream the `.prg32` file ([cartridge_store/app.py](../../cartridge_store/app.py:616-630)).

## Storage and database interactions

### Filesystem store

`GameStore` creates `data/cartridges`, stores artifacts at `{game}/{version}/{architecture}.prg32`, and keeps a JSON index at `data/index.json`. It uses a temporary file followed by `replace()` for index writes ([cartridge_store/store.py](../../cartridge_store/store.py:43-73)). Game IDs and versions are constrained by path-safe regexes ([cartridge_store/store.py](../../cartridge_store/store.py:15-40)).

Pending submissions are stored under `data/pending/{submission_id}`. Custom theme assets are stored under `data/static` ([cartridge_store/app.py](../../cartridge_store/app.py:667-685)). The backup ZIP includes database and data-directory contents ([cartridge_store/app.py](../../cartridge_store/app.py:759-790)).

### SQLite tables

| Table | Key relationships/indexes | Source |
| --- | --- | --- |
| `users`, `api_tokens`, `groups`, `user_groups`, `registration_tokens` | User/token/group FKs, external identity and token indexes | [auth schema](../../cartridge_store/auth/__init__.py:44-95) |
| `store_settings` | Key/value primary key | [settings schema](../../cartridge_store/settings.py:13-18) |
| `scores` | Game/score index | [scores schema](../../cartridge_store/scores.py:13-32) |
| `runs`, `samples` | `samples.run_id` cascades to `runs`; unique `(run_id, frame)` and run/frame indexes | [metrics schema](../../cartridge_store/metrics.py:18-56) |
| `download_events` | Game/date and architecture indexes | [stats schema](../../cartridge_store/stats.py:20-37) |
| `cartridge_submissions` | User FKs with `SET NULL`, status/date index; JSON metadata and architecture payloads | [review schema](../../cartridge_store/review.py:19-38) |

Connections enable foreign keys but do not configure busy timeouts, WAL, transaction isolation policy, or connection pooling ([database.py](../../cartridge_store/database.py:11-19)). Schema initialization is distributed across request hooks, not a versioned migration system.

## Dependencies and runtime

`requirements.txt` contains Flask, Authlib, Flask-Sock, Gunicorn, Matplotlib, pytest, python3-saml, simple-websocket, and zeroconf ([requirements.txt](../../requirements.txt:1-9)). LDAP is referenced as an optional import but `ldap3` is not in the manifest ([auth/ldap_adapter.py](../../cartridge_store/auth/ldap_adapter.py:14-21)).

The Docker image uses `python:3.13-slim`, installs from an unpinned requirements file, copies the whole repository, creates a non-root `prg32` user, exposes 5080, and launches one Gunicorn process with eight threads ([Dockerfile](../../Dockerfile:1-44)). Compose persists `./data` at `/data` and requires `SECRET_KEY` ([docker-compose.yml](../../docker-compose.yml:1-15)).

## Configuration

Configuration comes from environment variables, Flask config, and the `store_settings` table. Important variables include `PRG32_STORE_DATA`, `PRG32_STORE_DB`, legacy DB fallbacks, bundle/peer limits, `PRG32_USERS`, SMTP, OIDC, SAML, mDNS, and `SECRET_KEY` ([cartridge_store/app.py](../../cartridge_store/app.py:103-142); [docs/deployment.md](../deployment.md:1)). Environment-variable completeness should be made machine-readable before introducing a new frontend.

## Deployment assumptions

The documented deployment is a single container on port 5080 with durable `/data`, HTTPS termination expected outside the container, and WebSocket upgrade forwarding for `/api/multiplayer` ([docs/deployment.md](../deployment.md:48-74)). mDNS is best effort and degrades to warnings ([cartridge_store/mdns.py](../../cartridge_store/mdns.py:16-64)). There is no checked-in reverse-proxy config, healthcheck in the Dockerfile, CI workflow, dependency lockfile, or automated deployment definition.

## Known limitations

- Single JSON catalog means full-catalog reads and in-memory filtering/pagination.
- Filesystem index and SQLite review/statistics state cannot commit atomically together.
- Runtime schema setup is idempotent but not a release-managed migration process.
- Frontend has no typed API contract, component library, client router, server-state cache, dark theme, or E2E/browser test suite.
- Metrics ingestion is intentionally unauthenticated for compatibility; export access is not consistently authorized (see security audit).
- Public response and error shapes are compatibility contracts but are not represented by OpenAPI or generated types.
- Dependency versions are ranges rather than a lockfile; reproducibility depends on the installation date.
