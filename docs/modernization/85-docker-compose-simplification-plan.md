# PRG32 Cartridge Store — future Docker Compose simplification plan

Date: 2026-10-14  
Status: **read-only inventory; no Compose change authorized in M5.2e**

## 1. Current topology

The single `docker-compose.yml` defines seven services and six named profiles:

| Service | Profiles | Current responsibility | Classification |
| --- | --- | --- | --- |
| `cartridge-store` | `prod` | legacy Flask/PWA production image, SQLite/filesystem at `/data`, port 5080 | `REMOVE_AFTER_CUTOVER` |
| `backend` | `backend` | isolated read-only Fastify development service, port 5090 | `DEV_ONLY` until merged |
| `auth-writer-init` | `writer-init`, `writer`, `dev` | creates disposable auth/shadow/store files and key registry | `DEV_ONLY` / remove after writer consolidation |
| `auth-writer` | `writer`, `dev` | writable disposable Fastify service with hot reload and isolated bind mounts | `KEEP`, then rename/merge as canonical Fastify |
| `auth-writer-edge-proxy` | `dual-origin`, `dev` | nginx bridge for dual-origin auth routes | `DEV_ONLY` / `REMOVE_AFTER_CUTOVER` |
| `flask` | `dev` | transitional Flask development owner on `api.prg32.dream.test` | `REMOVE_AFTER_CUTOVER` |
| `next` | `dev` | Next.js development server and HMR on `store.prg32.dream.test` | `KEEP` |

The service list reports seven services; the profile list reports `backend`,
`dev`, `dual-origin`, `prod`, `writer`, and `writer-init`. Compose uses one
internal `app` network and one external `edge` network. `edge` defaults to the
existing `${DREAM_EDGE_NETWORK:-dream_edge}` and is managed by the external
Dream Traefik installation.

There are no Docker named volumes in this file. Persistent or disposable state
is bind-mounted through configurable paths, including Flask data,
Fastify/auth-writer data, shadow database, store objects, key registry,
frontend/backend `node_modules`, and Next `.next` cache. This is consistent
with moving the repository root to another machine, provided the bind-mounted
directories are intentionally recreated or copied as documented disposable or
persistent data; Docker anonymous volumes are not the source of portability.

## 2. Ports, labels and external dependencies

- Flask development listens on container port 5080 and is routed by Traefik
  to `api.prg32.dream.test`.
- Next development listens on container port 3000 and is routed to
  `store.prg32.dream.test`.
- Fastify development listens on container port 5090; the writer exposes a
  loopback host port 5091 and the standalone backend 5090.
- `auth-writer-edge-proxy` publishes no host port; it joins `app` and external
  `edge`, with Traefik labels for auth paths on `api.prg32.dream.test`.
- `next` currently proxies catalog/API compatibility to Flask and can use
  optional Fastify workflow/federation targets. Its WebSocket public URL is
  `wss://api.prg32.dream.test/api/multiplayer`.
- Authentik is external to this Compose project. The generic provider origin
  is configured outside this file; the application must continue to use the
  user's `sso.dream.test` provider arrangement without embedding provider
  credentials here.

## 3. Persistent data ownership

Current Flask owns its bind-mounted `/data` database and cartridge filesystem.
The disposable Fastify writer owns separate auth data, shadow DB, canonical
test store, key registry, and submission/metrics/score test roots. The frontend
owns only caches and dependencies. `auth-writer-init` writes initialization
material into the writer bind mounts and is therefore a development lifecycle
dependency, not a final runtime responsibility.

The final design must retain explicit host-directory ownership and the `/data`
contract for whichever service becomes authoritative. It must not silently
convert cartridge objects or SQLite into anonymous volumes.

## 4. Proposed minimal development topology

After the cutover gates are complete, the target hypothesis is:

1. one `fastify` development service with Node 24, TypeScript hot reload,
   canonical SQLite/filesystem bind mounts, and the shared WebSocket HTTP port;
2. one `next` development service with Next HMR and bind-mounted source,
   dependencies/cache kept as explicit disposable host directories;
3. the existing external Dream Traefik network and external generic
   OIDC/SAML provider;
4. no Flask, nginx auth bridge, or separate auth initializer in the ordinary
   development profile.

The `dev` profile should keep local ergonomics and stable hosts while routing
`store.prg32.dream.test` to Next and `api.prg32.dream.test` to Fastify. Same-
origin Next `/api` proxy behavior and WebSocket availability must be verified
before any removal. Authentik remains external and is not added as a Compose
service.

## 5. Proposed minimal production topology

The final production hypothesis is one slim multi-stage Fastify runtime and
one slim multi-stage Next runtime, both attached to the external Traefik
network. Fastify owns the canonical SQLite and filesystem bind mounts; Next
owns no database. Traefik terminates public TLS and preserves the two hostnames
above. A separate database service is not proposed: SQLite remains
authoritative. Health checks remain on both application services, and the
Fastify WebSocket relay remains on its HTTP service port.

This is a target architecture, not an M5.2e deployment change.

## 6. Consolidation and removal plan

`backend` and `auth-writer` are two development views of the same Fastify
codebase. They can be consolidated after write-boundary tests prove that one
service can provide read-only and disposable-write modes through explicit
configuration. `auth-writer-init` can then become an image entrypoint/preflight
script or disappear when canonical directories/key provisioning have a
documented external lifecycle. `auth-writer-edge-proxy` can be removed only
after Fastify and Traefik directly own the exact auth routes on the API host.

`flask` and `cartridge-store` are removal candidates only after operational
cutover, backup/restore evidence, telemetry reconciliation, and the rollback
window are approved. `next` remains. No service is removed in M5.2e.

## 7. Required prerequisites before cleanup

- canonical migration and final source/target differential verification;
- single-writer Fastify ownership for catalog, publication, auth, metrics,
  scores, telemetry, and multiplayer;
- generic OIDC/SAML provider/session continuity decision;
- direct Traefik routing and health checks for both hostnames;
- same-origin `/api` proxy and WebSocket verification without nginx;
- explicit persistent bind-directory backup/restore and ownership policy;
- key/secret injection policy outside images and archives;
- rollback reconciliation and accepted-data-loss decision;
- a maintenance window with Flask writes quiesced.

## 8. Cleanup execution order

1. Freeze and verify the source snapshot and canonical backup.
2. Start the canonical Fastify/Next test topology on disposable roots.
3. Verify direct Traefik labels, API, browser proxy, WebSocket, OIDC/SAML,
   telemetry, and health checks.
4. Switch ownership only under the separately authorized cutover milestone.
5. Keep Flask and its data available through the rollback window.
6. Remove the nginx bridge after direct auth-route evidence is accepted.
7. Remove `auth-writer-init` after initialization/key lifecycle is moved to a
   deliberate preflight or external secret process.
8. Consolidate the standalone `backend`/`auth-writer` dev profiles.
9. Retire Flask and its image/profile only after the rollback window closes.
10. Simplify labels/profile names and retain persistent bind mounts.

## 9. Prohibited cleanup before cutover

Do not remove Flask, `cartridge-store`, auth-writer services, the nginx bridge,
Traefik network, bind-mounted data, key registry, or compatibility proxy before
the relevant ownership gate. Do not run `docker compose down`, `down -v`,
`docker system prune`, `docker volume prune`, or delete images, networks or
volumes as part of this milestone. Do not modify persistent Authentik or the
external Dream Traefik installation.

## 10. Read-only evidence

The inventory was obtained from the current `docker-compose.yml`, Dockerfiles,
profile-expanded service configuration, health checks, labels, networks, bind
mounts and environment declarations. M5.2e made no Compose edit and no Docker
runtime mutation. The next milestone must re-run `docker compose --profile dev
config --quiet` after any separately authorized topology change.
