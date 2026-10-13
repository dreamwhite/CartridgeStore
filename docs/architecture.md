# Current architecture

This document describes what runs today. It is not a target-state proposal.
The migration is deliberately incremental so firmware and classroom clients
continue to use the existing contracts while new authentication, federation,
and frontend boundaries are built in TypeScript.

## Runtime topology

```text
                           shared Dream Traefik edge
                                      │
              ┌───────────────────────┴────────────────────────┐
              │                                                │
 store.prg32.dream.test                              api.prg32.dream.test
              │                                                │
        Next.js :3000                              route-owned API edge
              │                                                │
              │                         ┌──────────────────────┴─────────────┐
              │                         │                                    │
              │              auth-writer-edge-proxy                    Flask :5080
              │                         │                                    │
              │                    Fastify :5090                    legacy API + WebSocket
              │
              └── direct browser API calls in dual-origin dev mode ───────────┘
```

The production profile is intentionally smaller: it runs the Flask image on
port 5080 with `/data` as its persistent filesystem. The `backend` and
`frontend` production images are built separately for the migration and are
multi-stage/slim, but production routing is not changed by the development
integration.

## Compose profiles and containers

The repository has one Compose file. Profiles select the lifecycle:

| Profile | Services | Purpose |
| --- | --- | --- |
| `dev` | `flask`, `next`, `auth-writer`, `auth-writer-edge-proxy`, one-shot `auth-writer-init` | Full local integration with HMR and Traefik |
| `backend` | `backend` | Isolated Fastify development against mounted fixtures |
| `writer` | `auth-writer-init`, `auth-writer` | Isolated writable Fastify boundary |
| `writer-init` | `auth-writer-init` | Recreate disposable writer data only |
| `dual-origin` | `auth-writer-edge-proxy` and its dependency | Explicit API-origin bridge |
| `prod` | `cartridge-store` | Transitional Flask deployment |

The dev profile has four long-running application/proxy containers plus one
initialization container that exits successfully. `auth-writer-edge-proxy` is
Nginx, not a second Fastify backend: it keeps the writable Fastify process as
the only owner of the disposable authentication database.

## Route ownership

| Boundary | Current owner | Notes |
| --- | --- | --- |
| `/api/games`, discovery, legacy publishing/review | Flask | Firmware and catalog compatibility boundary |
| `/api/scores`, `/api/runs`, metrics exports, statistics | Flask in the deployed compatibility path; Fastify has tested parity modules | Do not change firmware response shapes during migration |
| `/api/multiplayer` WebSocket | Flask | Same HTTP port, separate WebSocket upgrade |
| `/auth/*`, `/api/auth/*` in the isolated writer | Fastify | Session, bootstrap, registration, tokens, OIDC, and SAML protocol routes |
| `/api/admin/federation/*` in the isolated writer | Fastify | Generic provider administration with re-authentication and audit |
| Next `/`, `/login`, `/account`, `/admin/federation/*` | Next.js | Current UI foundation and federation administration UI |
| Existing Jinja routes | Flask | Must remain available until their migration is explicitly authorized |

The default Next rewrite boundary still supports Flask compatibility calls. The
canonical `dev` profile enables dual-origin mode: the browser uses
`https://api.prg32.dream.test` for API calls and
`https://store.prg32.dream.test` for the application, while Traefik routes API
paths to the appropriate backend.

## Code boundaries

### Flask compatibility service

`app.py` and `cartridge_store/` own the current production-compatible
catalog/PWA, cartridge filesystem store, SQLite compatibility data, score and
metrics receivers, reports, mDNS, and multiplayer relay. It remains the
authority for routes not explicitly transferred to Fastify.

### Fastify/TypeScript backend

`backend/src/app.ts` is the composition root. Feature boundaries are explicit:

- `catalog`, `submission`, `review`, `consistency`: cartridge and publishing
  workflows;
- `auth`, `authorization`, `admin`, `settings`, `secrets`: identity and
  administrative policy;
- `oidc`, `saml`, `federation`: provider-neutral federation protocols and
  lifecycle;
- `metrics`, `scores`, `stats`: compatibility APIs and read models;
- `backup`, `db`: snapshot, restore, schema inspection, and database access;
- `compatibility`: serialization and public contract helpers.

The default configuration is read-oriented. Writable auth, submission,
metrics, scores, and backup services require the isolated `test` mode and
disposable roots; this is a migration safety boundary, not a production write
model.

### Next.js frontend

`frontend/src/app` contains route entrypoints, `components` contains shared and
feature UI, `lib/api` contains typed API clients/schemas, and `lib/auth` plus
`stores` contains browser session and federation state. The storefront itself
is not yet rewritten; existing Jinja pages remain part of the compatibility
surface.

## Data and persistence

The Flask production data root is `/data` in containers and contains the
SQLite database plus filesystem cartridge and generated assets. Do not put
uploaded cartridge binaries in SQLite.

The dev writer deliberately uses separate repository-local bind mounts:

```text
.local/
├── flask/data/                 Flask dev database and cartridges
├── writer/auth-data/           Fastify auth-write database and key registry
├── writer/shadow/              Fastify read/shadow database
├── writer/store/               disposable publishing data
└── frontend/                   node_modules and Next cache
```

`.local/` is ignored and can be recreated on another machine from the Git
checkout. Production data is separate under `data/` or an explicit
`PRG32_PROD_DATA_DIR` path.

## Migration invariants

1. Preserve public paths, response fields, identifiers, architecture names,
   binary formats, journal formats, backup formats, and WebSocket messages.
2. Keep Flask available until a boundary has a compatibility test and an
   explicit route-ownership decision.
3. Keep writable TypeScript services isolated from authoritative production
   data while the migration is in progress.
4. Treat OIDC and SAML as generic provider protocols. `sso.dream.test` is an
   infrastructure concern, not an application-specific identity provider.
5. Use the same Node 24 LTS and pnpm 12.5.1 toolchain locally and in Node
   images.
6. Keep Docker development and production in the single root
   `docker-compose.yml`; do not reintroduce split Compose files or anonymous
   persistent volumes.

## Health and readiness

Fastify exposes `/health` for process health and `/ready` for database
readiness. Flask's Compose healthcheck uses the discovery document
`/.well-known/prg32-store.json`. The dev stack is ready only after Flask,
Fastify writer, the edge proxy, and Next have started; a transient 502 from
Traefik during Next startup is not an application response and should be
rechecked after readiness.

