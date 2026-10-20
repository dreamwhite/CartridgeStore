# Architecture

## Runtime topology

```text
                    Local Nginx edge
                              │
                 ┌────────────┼────────────┐
                 │                         │
       store.prg32.dream.test      api.prg32.dream.test
                 │                         │
             Next.js :3000             Fastify :5090
                 │                         │
                 └────── browser API ────┘
                              │
              external Dream Platform mail network
```

The diagram shows the local dnsmasq-backed `.dream.test` environment only.
Production uses the same service topology with operator-provided domains and
origins. Nginx owns local TLS and host routing. The browser calls the API origin directly;
Next does not proxy application routes. Fastify owns HTTP, WebSocket,
authentication, catalog, publication, telemetry, statistics and discovery.

## Local Compose

The development Compose file has three services:

| Service | Responsibility |
| --- | --- |
| `backend` | Fastify API, canonical SQLite and filesystem store |
| `next` | Next.js development server and UI |
| `nginx` | Local TLS termination, host routing and WebSocket forwarding |

The backend also joins the external `dream_mail` network, where Dream Platform
provides Mailpit. The application services otherwise join the private
`prg32_store_dev` network. The default data directory is
`.local/candidate/canonical`, which is disposable and never replaces an
operator-controlled data root.

## Route ownership

| Boundary | Owner |
| --- | --- |
| `/api/games*` and cartridge media/downloads | Fastify catalog |
| `/api/publish*`, `/api/submissions*` | Fastify publication workflow |
| `/api/scores`, `/api/runs`, `/api/metrics/batch` | Fastify compatibility services |
| `/api/multiplayer*` | Fastify WebSocket/HTTP relay |
| `/auth/*` | Fastify authentication and federation |
| `/api/admin/*`, `/api/setup/*` | Fastify administration and setup |
| `/`, `/login`, `/dashboard/*`, `/docs` | Next.js |

The public firmware routes, discovery document, binary format, WebSocket
messages and SQLite schema are compatibility boundaries.

## Code boundaries

- `backend/src/app.ts` is the composition root.
- `backend/src/catalog`, `submission`, `review` and `consistency` own the
  cartridge lifecycle.
- `backend/src/auth`, `authorization`, `admin`, `settings`, `oidc`, `saml` and
  `federation` own identity and administrative policy.
- `backend/src/metrics`, `scores` and `stats` own telemetry compatibility.
- `backend/src/storage-v2` owns canonical storage, migration and backup.
- `frontend/src/app` contains route entrypoints; `components` contains UI;
  `lib/api` contains typed clients and schemas.

## Persistence

Uploaded cartridge binaries remain in the filesystem store. SQLite stores
metadata, identity, publication, scores, metrics and service records. Local
development uses a bind-mounted disposable canonical root. Deployment
templates use `/data/canonical` and Docker secrets for sensitive values.

## Readiness

Fastify exposes `/health` for liveness and `/ready` for database readiness.
Next exposes `/health`. The edge should route only after both services are
healthy.
