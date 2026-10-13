# M5 incremental cutover plan

Date: 2026-10-14
This is a planning artifact. It authorizes no production or operational
cutover.

## Stages

| Stage | Route scope | Writer | Entry gates | Exit evidence | Rollback |
| --- | --- | --- | --- | --- | --- |
| 0. Freeze and observe | all routes | Flask | current runtime inventory, backups documented, no dual writer | route/schema/filesystem matrix approved | none; remain Flask |
| 1. Read-only differential shadow | stats, catalog, discovery, health | Flask | disposable copy, deterministic fixtures, response scrubber | status/body/header diffs explained; no writes | disable observer |
| 2. First read route | recommended `GET /api/stats/runs` and `GET /api/stats/scores` | Fastify for selected reads; Flask elsewhere | Stage 1 green, edge route rule, metrics/logging, smoke checks | canary requests match Flask; no DB/filesystem mutation | remove route rule; Flask resumes |
| 3. Read catalog/media | catalog and media GETs | Fastify reads; Flask download telemetry owner until designed | exact index/filesystem/ETag/range/error parity, telemetry plan | binary and metadata comparisons, firmware read test | revert reads to Flask |
| 4. Authenticated read details | run detail/exports, submission reads, admin reads | Fastify read paths | session/CSRF/ownership parity or explicit session migration | owner/admin/anonymous matrix passes | revert route reads; preserve Flask sessions |
| 5. One write capability | choose one of scores or metrics only | exactly one writer | firmware contract, resource limits, backup/restore, stop-the-world owner handover | write/read/restart/recovery evidence | stop Fastify writer, restore verified backup, Flask only |
| 6. Publishing/review/admin | submissions, publication, catalog/admin | exactly one writer | journal reconciliation, RBAC, filesystem ownership, recovery drill | publication and rollback drill passes | controlled restore and Flask handback |
| 7. Auth/federation | local auth and generic OIDC/SAML | explicitly selected owner | cookie/session transition, CSRF, provider callback, operator runbook | login/logout/token/provider matrix | keep existing Flask auth; invalidate only planned sessions |
| 8. Multiplayer and discovery | WebSocket, mDNS, discovery | exactly one relay/advertiser | upgrade route, peer protocol, cleanup, firmware discovery | reconnect/peer/discovery evidence | revert edge and stop alternate advertiser |
| 9. Flask retirement | remaining legacy routes | Fastify/Next | all route groups green, backups and rollback window accepted | no Flask dependency in traffic | restore last-known owner from runbook |

## First candidate

The recommended first candidate is the public read-only pair:

- `GET /api/stats/runs`
- `GET /api/stats/scores`

They do not require filesystem publication, binary streaming, browser session
continuity, WebSocket state, mDNS advertisement, or firmware ingestion. The
candidate still needs exact response, ordering, empty-state, query-limit,
cache/header and SQLite snapshot comparison before it is switched. If those
comparisons expose an unresolved difference, keep Flask as owner and repair the
Fastify adapter first.

Do not begin with catalog downloads, scores POST, metrics ingestion,
publishing, authentication, federation or multiplayer. Each has an
irreversible or externally visible side effect and a larger rollback surface.

## Operational gates

No stage may advance unless all applicable gates are green:

1. **Ownership:** one process is the writer/relay/advertiser for the resource.
2. **Contract:** status, body, headers, media/range/ETag, errors and ABI
   identifiers match the documented compatibility contract.
3. **Data:** schema fingerprint, foreign keys, indexes, files and backup
   inventory are understood and verified.
4. **Security:** authentication, CSRF, bearer tokens, role/group checks,
   ownership, export authorization and resource limits match.
5. **Firmware:** score, metrics, download, discovery, architecture and
   multiplayer clients continue to work without a new required credential.
6. **Recovery:** restart, crash compensation, backup and rollback are proven
   on disposable data.
7. **Observability:** route owner, request ID, status, latency, rejection and
   recovery events are visible without secrets or personal data.

## Rollback invariant

Rollback is a route-ownership change, not a second writer. Before handing a
write resource back to Flask, stop Fastify writes, verify no in-flight write
remains, and use the documented backup/recovery procedure if data or files
changed. Never point both runtimes at the same operational writer paths during
an uncertain state.
