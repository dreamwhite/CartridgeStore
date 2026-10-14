# M5.2g.9 — Final Two-Service Runtime & Deployment Preparation

Date: 2026-10-14  
Scope: disposable candidate runtime only

## 1. Executive result

M5.2g.9 is **GO for the isolated two-service candidate** and **NO-GO for
operational cutover, public routing and Flask retirement**.

The candidate consists of exactly two application services:

- `fastify`: Node.js 24 Fastify backend using canonical storage-v2 only;
- `next`: Node.js 24 Next.js frontend using Fastify as its server-side API
  target.

The candidate Compose file is `deploy/candidate/compose.yaml`. It is a
separate file and does not replace or modify the operational Compose topology.

The candidate was verified with synthetic disposable storage, synthetic
configuration values, isolated loopback ports and a private Compose network.
No production data, operational volume, Traefik network, authentication
provider, public DNS route or `../PRG32` file was changed.

## 2. Scope and safety boundary

Implemented:

- explicit `two-service-disposable` Fastify mode;
- one canonical `store.sqlite` writer boundary;
- candidate-only initialization CLI;
- graceful SIGINT/SIGTERM shutdown and writer-lease release;
- canonical readiness reporting;
- candidate Fastify and Next.js multi-stage Node 24 images;
- private two-service Compose topology with bind-mounted disposable data;
- candidate Next rewrites for `/api`, `/auth` and `/.well-known`;
- negative configuration and lifecycle regression tests;
- runtime dependency, topology and retirement evidence.

Not implemented:

- operational cutover;
- modification of `docker-compose.yml` or existing Dockerfiles;
- Traefik labels, external `dream_edge`, public DNS or TLS activation;
- provider configuration or Authentik-specific behavior;
- Flask removal or Python removal;
- public backup routes or backup schedules;
- production data migration, deployment, commit or push.

## 3. Candidate runtime contract

Fastify candidate startup requires all of the following:

- `PRG32_BACKEND_CANDIDATE_MODE=two-service-disposable`;
- `PRG32_BACKEND_CANDIDATE_AUTHORIZATION=M5.2G9-DISPOSABLE-TWO-SERVICE-CANDIDATE`;
- `PRG32_BACKEND_CATALOG_READ_MODE=canonical-disposable`;
- canonical read and write authorization values;
- canonical workflow mode `disposable`;
- `PRG32_BACKEND_DB=<canonical-root>/store.sqlite`;
- `PRG32_BACKEND_STORE_DATA=<canonical-root>`;
- authentication writer DB and root equal to that same canonical root;
- non-production `NODE_ENV`;
- mDNS disabled;
- no legacy configured users, score DB, metrics DB, store DB or store-data
  fallback variables.

The tuple verified by the storage initializer is:

| Item | Value |
| --- | ---: |
| schema version | 2 |
| storage layout version | 2 |
| publication journal version | 1 |
| backup format version | 3 |

`backend/src/storage-v2/candidate-init-cli.ts` initializes only an empty,
explicitly authorized root. It refuses an existing non-empty root through the
existing storage-v2 initialization guard. It never imports legacy data and is
not wired as a Compose service.

## 4. Fastify lifecycle and storage ownership

The candidate reuses the canonical workflow, storage-v2 schema, object store,
publication journal and existing backup-v4 primitives. It does not instantiate
the legacy catalog reader or legacy SQLite fallbacks in candidate mode.

The single SQLite file is opened through the canonical root. The read-only
manager and authenticated writer use separate SQLite connections to that same
file, while `CanonicalWriterLease` provides the single-process writer boundary.
The candidate-specific validation is the only place where the existing
transitional shadow/writer separation is relaxed; it is unreachable without
the exact candidate mode and authorization.

The `/ready` response in candidate mode includes:

```json
{
  "ok": true,
  "status": "ready",
  "resources": {
    "database": "available",
    "canonical_storage": "available",
    "writer_lease": "held"
  }
}
```

Readiness checks the database connection, storage metadata state and workflow
writer lease. SIGINT and SIGTERM call `app.close()`, which closes the discovery
service, multiplayer hub, catalog resources, canonical workflow, auth and
database connections. The candidate test confirms the filesystem writer lock
is removed after shutdown.

Next.js exposes a local `/health` route for process liveness and proxies
`/ready` to Fastify so the frontend container healthcheck also reflects the
canonical storage state rather than merely proving that a Node process is
listening.

## 5. Candidate authentication and federation boundary

Local sessions, CSRF, API tokens, RBAC, registration and bootstrap continue to
use the existing Fastify implementations against the canonical SQLite schema.
The candidate contains no provider credentials and no Authentik-specific
branch. Generic OIDC/SAML modules remain code paths in the backend and are
configured only by a future deployment contract.

The candidate does not mention or activate `sso.dream.test`, Authentik
credentials, production cookies or real provider metadata. Local candidate
cookies use the explicit disposable HTTP-development setting; a future HTTPS
deployment must set Secure cookies and a reviewed trusted public origin.

## 6. Next.js routing boundary

`frontend/next.config.candidate.mjs` is selected only by the candidate
Dockerfile. The operational `frontend/next.config.ts` is unchanged.

The candidate forwards the following to `FASTIFY_PROXY_TARGET`:

- `/api/:path*`;
- `/auth/:path*` (Next-owned page routes still win through normal filesystem
  routing for GET requests);
- `/.well-known/:path*`.

Next rewrites preserve the incoming HTTP method, body, cookies and response
headers, including `Set-Cookie`, for the server-side proxy path. Binary/media
and range requests remain Fastify-owned under `/api`. WebSocket traffic is not
claimed through a Next rewrite: the candidate exposes Fastify on a loopback
port for direct WebSocket testing. A future public deployment must route
`/api/multiplayer` directly to Fastify through the reviewed edge.

The candidate has no public Traefik labels and does not activate either
`store.prg32.dream.test` or `api.prg32.dream.test`. The future edge routing
contract is:

| Host | Owner | Required paths |
| --- | --- | --- |
| `store.prg32.dream.test` | Next.js | HTML, assets, same-origin browser `/api` proxy |
| `api.prg32.dream.test` | Fastify | API, auth callbacks, media/range, WebSocket |

The future edge must preserve forwarded host/proto headers, cookies, CSRF,
OIDC/SAML callback origins, binary streaming and WebSocket upgrade headers.
That specification is preparatory only.

## 7. Images and Compose topology

Both candidate images use `node:24-bookworm-slim` and reproducible
`pnpm install --frozen-lockfile` with pnpm 12.5.1. The Fastify builder uses
Python/make/g++ only to compile native `better-sqlite3`; those tools are absent
from the runtime stage. The Next image uses the standalone output. Both
runtime stages run as the non-root `node` user.

`deploy/candidate/compose.yaml` has exactly two services, one private bridge
network, loopback-only host port bindings and an explicit bind mount for the
canonical candidate root. It has no named or anonymous volumes, no external
network, no reverse-proxy labels, no mDNS and no hidden profile services.

Default host ports are `5092` for Fastify and `3300` for Next. They can be
overridden with `PRG32_CANDIDATE_FASTIFY_PORT` and
`PRG32_CANDIDATE_NEXT_PORT`. The only writable persistent path is the explicit
candidate bind mount; `/tmp` is a bounded tmpfs. Production deployment must
retain this explicit data ownership and replace synthetic secrets through an
external secret mechanism.

## 8. Backup compatibility

No backup route, schedule or operational backup service was added. The
candidate continues to use the existing storage-v2 backup-v4 CLI and format
when explicitly invoked against a disposable root. The runtime sets backup
HTTP support to false. No key, token or credential is written into the image
or archive by this milestone.

## 9. Firmware and public contract preservation

The candidate does not rename firmware-visible identifiers or architecture
values. It continues to serve the existing catalog, detail, version,
architecture, binary/media, scores, metrics/runs, statistics, discovery and
multiplayer route contracts through Fastify. The preserved constants include
`prg32-store-discovery-1.0`, `prg32-metadata-1.0`,
`prg32-colophon-1.0`, `_prg32store._tcp`, `esp32c6` and `qemu`.

The companion `../PRG32` repository was inspected read-only and was not
modified. Firmware-facing compatibility remains a cutover acceptance gate;
this milestone does not claim production firmware acceptance.

## 10. Verification evidence

Machine-readable evidence is stored under:

- `docs/modernization/evidence/m5-2g-9-runtime-dependencies.json`;
- `docs/modernization/evidence/m5-2g-9-service-topology.json`;
- `docs/modernization/evidence/m5-2g-9-retirement-inventory.json`;
- `docs/modernization/evidence/m5-2g-9-verification.json`.

The candidate-specific test verifies successful canonical startup/readiness,
writer lock release and rejection of missing authorization, production mode,
legacy fallback variables, mDNS and mismatched database paths.

The Docker verification built both candidate images, validated the candidate
Compose configuration, created an isolated synthetic canonical root, started
both services, read Fastify readiness, read Next `/health` liveness and Next
`/ready` canonical readiness, then removed only the candidate containers and
private network. The first Next probe encountered a startup connection reset;
the repeat with `curl --retry-all-errors` passed.

## 11. Retirement and rollback boundary

Flask, the operational `cartridge-store` service, `auth-writer-init`,
`auth-writer`, `auth-writer-edge-proxy`, the operational `next` profile and
the external edge network remain in the retirement inventory. They cannot be
removed until route ownership, data/session continuity, writer quiescence,
OIDC/SAML callback ownership, firmware compatibility, multiplayer ownership,
telemetry reconciliation, backup custody and rollback policy are approved.

Pre-cutover abort remains safe: discard the disposable candidate root and keep
Flask authoritative. Post-cutover rollback is not a restart operation; it
requires stopping the new writer, controlling traffic, reconciling any writes
accepted after handover and deciding whether accepted data loss is permitted.

## 12. Remaining blockers

- operational data and session continuity have not been rehearsed;
- public Traefik routing and TLS have not been changed or tested;
- generic external OIDC/SAML provider configuration has not been activated;
- public WebSocket edge ownership and mDNS LAN ownership remain open;
- production secret custody and backup scheduling remain open;
- legacy Flask/Compose retirement remains unauthorized.

## 13. Milestone decision

**GO:** disposable two-service runtime candidate, synthetic startup, isolated
container build and readiness smoke.  
**PARTIAL:** container readiness is verified locally; no claim is made for
production deployment.  
**NO-GO:** operational cutover, public ownership, Flask retirement and any
later milestone.

Next milestone recommendation: perform a separately authorized operational
ownership and edge-routing readiness review, using this candidate as the
deployment shape. Do not remove Flask until that review closes the blockers.
