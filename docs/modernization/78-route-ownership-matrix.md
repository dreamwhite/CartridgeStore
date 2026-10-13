# M5 route ownership and parity matrix

Date: 2026-10-14
Evidence: live Flask `url_map`, live Fastify `printRoutes`, and current source/tests.
Machine-readable companion: [`78-route-inventory.json`](78-route-inventory.json)

## Reading the matrix

`PARITY` means the route is implemented on both sides with a verified contract,
not merely that the path exists. `PARTIAL` means a route exists on both sides
but at least one response, authorization, persistence, side-effect, or runtime
dependency still differs. `CONDITIONAL` means registration depends on a feature
flag or configured provider. `MISSING` means no Fastify equivalent is available.
The current snapshot contains no operational `PARITY` group that is safe to
cut over without a route-specific gate; the closest candidate is the read-only
statistics group.

## Ownership summary

| Capability | Flask route owner today | Fastify status | Data/filesystem dependency | Side effects | Current classification | Cutover note |
| --- | --- | --- | --- | --- | --- | --- |
| Discovery and health | Flask | discovery plus health/ready | SQLite settings and mDNS for discovery | none | Partial | Fastify has no mDNS registration; preserve one advertiser. |
| Catalog and media | Flask | read-only catalog | `index.json`, cartridge tree, assets | download telemetry in Flask | Partial | Fastify currently does not record download events. |
| Scores | Flask | read/write isolated implementation | `scores` table | score insert | Partial | Anonymous firmware POST and ordering/error parity are gates. |
| Metrics and runs | Flask | read/write isolated implementation | `runs` and `samples` tables | ingestion and exports | Partial | Firmware payloads, resource limits, ownership and exports must match. |
| Public statistics | Flask | read-only implementation | SQLite aggregate queries | none | Partial | Recommended first route group after differential comparison. |
| Multiplayer | Flask | WebSocket implementation | in-memory process state | peer relay | Partial | One process must own relay state; direct upgrade path required. |
| Local authentication | Flask | isolated replacement | users/tokens/session DB | sessions, CSRF, user/token writes | Partial | Cookie formats are incompatible; no transparent session continuity. |
| Generic OIDC/SAML | optional Flask adapters | conditional Fastify writer | provider configuration and session DB | redirects, callbacks, provider changes | Conditional | Provider is generic; no Authentik-specific assumption. |
| Publishing and review | Flask | isolated submission/review implementation | SQLite, pending tree, index, published tree | staged files, index and DB updates | Partial | Publication journal and filesystem handover are incomplete. |
| Administration | Flask | different route/action model | users/groups/settings/catalog | privileged writes | Partial | RBAC and exact action/response mapping required. |
| Backup/restore | Flask | feature-gated Fastify implementation | full DB/filesystem archive | archive and restore | Conditional | Restore must never be dual-owned or enabled during migration. |

## Complete Flask inventory by responsibility

The following is the current Flask inventory, including HTML compatibility
routes because ownership of those routes also affects a safe Next.js cutover.

### Public pages and assets — Flask only

`GET /`, `GET /games/<game_id>`, `GET /scores`, `GET /stats`, `GET /publish`,
`POST /publish`, `GET /users/<username>`, `GET /users/<username>/runs`,
`GET /users/<username>/runs/<run_id>`, `GET /manifest.webmanifest`,
`GET /static/<path:filename>`, `GET /static/custom/<filename>`, `GET /setup`,
`POST /setup`, `POST /setup/logo`, and `POST /setup/favicon` remain Flask/Jinja
compatibility routes. Next.js has replacement UI pages but does not remove the
legacy routes.

### Catalog and discovery — Flask operational owner

`GET /.well-known/prg32-store.json`, `GET /api`, `GET /api/games`,
`GET /api/games/<game_id>`, `GET /api/games/<game_id>/icon`,
`GET /api/games/<game_id>/screenshot`, `GET /api/games/<game_id>/colophon`,
`GET /api/games/<game_id>/download`, and `GET /api/me` are public or session
aware compatibility endpoints. Fastify has equivalents for all except the
legacy `GET /api` endpoint, but its catalog reads a shadow filesystem and its
download route does not yet reproduce Flask download-event persistence.

### Scores, metrics, runs and statistics

Flask owns `GET/POST /api/scores`, `GET /api/metrics`, `POST
/api/metrics/batch`, `GET/POST /api/runs`, `GET /api/runs/<run_id>`, `POST
/api/runs/<run_id>/finish`, `GET /api/runs/<run_id>/samples.csv`, `GET
/api/runs/<run_id>/report.md`, `GET /api/stats/downloads`, `GET
/api/stats/downloads/<game_id>`, `GET /api/stats/runs`, and `GET
/api/stats/scores`. Fastify has matching route paths for these groups. Matching
paths are not sufficient: write ownership, anonymous firmware compatibility,
authorization, bounded work, error envelopes, ordering, and export content
still require differential tests.

### Publishing and review

Flask owns `POST /api/publish`, `POST /api/publish/bundle`, `GET
/api/submissions`, `GET /api/submissions/<int:submission_id>`, `POST
/api/submissions/<int:submission_id>/verify`, `POST
/api/submissions/<int:submission_id>/reject`, and the corresponding
`/editor/submissions` list/detail/verify/reject routes. Fastify has an extra
`GET /api/submissions/mine` and uses colon-style route parameters. Its
submission and publication journal implementation is isolated and must not be
pointed at the Flask operational root before a handover gate.

### Authentication and federation

Flask owns local `/auth/*` routes, including login, registration, bootstrap,
CSRF, session inspection, logout, API tokens and token revocation/update.
Fastify implements most local paths but uses a different cookie name and
database-backed session format. Flask optional OIDC/SAML adapters register
only when configured. Fastify generic provider routes are under
`/api/auth/*` and administrative federation routes under
`/api/admin/federation/*`, gated by isolated auth-write mode.

### Administration and backup

Flask admin paths are `/admin/users*`, `/admin/groups*`, `/admin/roles`,
`/admin/cartridges*`, and `/admin/backup*`. Fastify exposes a JSON `/api/admin`
surface with a different verb/action model and has conditional backup routes.
This is a behavioral migration, not a proxy rename.

## Cross-cutting gates

Every route group must be compared for:

- status codes, stable error envelope, content type, headers, cache/ETag and
  range behavior;
- authentication, CSRF, bearer-token, ownership and role decisions;
- SQLite reads/writes, transaction boundaries, index/file updates and audit
  events;
- firmware-visible ABI strings, anonymous score/metrics behavior and mDNS;
- timeout, payload, archive, sample and export limits;
- WebSocket upgrade, reconnect, peer cleanup and single-process ownership.

Until these gates are green, the route remains Flask-owned even if a Fastify
handler exists.
