# PRG32 Cartridge Store — M5.2 storage compatibility matrix

Date: 2026-10-14
Scope: external contract preservation while changing internal storage.

The target architecture changes database tables and object paths, not the
public HTTP or firmware contract. Any row marked `PARTIAL` is a future
implementation gate, not evidence that a cutover is safe.

M5.2a refinement: physical metadata has one authority, `storage_objects`.
Relationship rows resolve hash, size, MIME type, and generated storage key by
`object_id`; only `submission_artifacts` retains hash/size for pre-promotion
staging. Publication items are unique by `(operation_id, expected_object_id)`
and carry an explicit role, allowing multiple media items per operation.
Application validation and the read-only audit enforce object-kind
relationships in addition to SQLite foreign keys.

| Capability | Current contract | Target internal change | Public behavior change | Migration dependency | Validation method | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Discovery document | `GET /.well-known/prg32-store.json`; ABI `prg32-store-discovery-1.0`; configured name/port | settings read from SQLite; no index dependency | none | preserve settings and mDNS owner | Flask/Fastify JSON diff; mDNS fixture | medium |
| Catalog listing | `GET /api/games`; accepts `q/search`, pagination; game IDs, versions, architectures | SQL joins `cartridges`, published `releases`, `artifacts` | none | import valid index entries; latest publication order | deterministic fixture response diff | high |
| Cartridge details | `GET /api/games/<id>?version=...` with metadata, colophon, variants | SQL release/artifact/media query | none | release/revision mapping | body/status/header diff | high |
| Version selection | `version` query; absent selects current/latest version | published-order/latest-release query, no semver reinterpretation | none | preserve legacy latest selection order | multi-version fixture and tie test | high |
| Architecture selection | `esp32c6` and `qemu`; query aliases normalized at edge | artifact row lookup | none | exact architecture mapping | firmware/host and API tests | high |
| Metadata ABI | `prg32-metadata-1.0`; metadata embedded in binary | copy normalized fields plus lossless SQLite JSON | none | parse every source artifact | parser and byte-level fixture | high |
| Colophon ABI | `prg32-colophon-1.0`; JSON from selected cartridge | release `colophon_json`, verified against binary | none | preserve/validate colophon | response diff and invalid fixture | medium |
| Icon delivery | `GET /api/games/<id>/icon`; selected version/architecture; image bytes | `media` object lookup with architecture fallback | none | extract/hash media | bytes, MIME, 404/headers tests | medium |
| Screenshot delivery | `GET /api/games/<id>/screenshot` | same as icon | none | extract/hash media | bytes, MIME, absent-media tests | medium |
| Binary download | `GET /api/games/<id>/download?architecture=&version=`; PRG32 bytes; attachment MIME/name | SQL artifact -> object resolver | none required; ETag/range only if proven | object copy/hash and release mapping | bytes, content length/type/disposition, error tests | high |
| Download telemetry | event inserted before `send_file`; valid resolved request counts, anonymous allowed | `download_events` references artifact/release/object identity | none | deterministic event mapping | count/order/anonymous/failed lookup tests | high |
| Scores | `GET/POST /api/scores`; firmware POST unauthenticated; ordering preserved | keep compatible `scores` table/service | none | copy rows unchanged | firmware-shaped API tests | high |
| Metrics runs | `GET/POST /api/runs`; firmware writes no browser auth | keep compatible `runs` table/service | none | copy rows and samples unchanged | payload/limit/export tests | high |
| Metrics batch | `POST /api/metrics/batch`; firmware samples/dropped count | same table; no catalog FK required | none | preserve sample IDs/frames | regression/resource-limit tests | high |
| Publishing | `POST /api/publish`, `/api/publish/bundle`; pending/review response | submissions and object staging; no index write | none | bundle parser, owner/auth mapping | host tool + API fixture | high |
| Review | verify/reject submission routes; editor authorization | normalized submission/review decision and publication op | none | preserve IDs/status/final reviewer | auth/state/crash tests | high |
| Administration | existing admin HTML/API actions and RBAC | target services query normalized rows | none | users/groups/settings preservation | role/action matrix | high |
| Authentication | Flask signed session, CSRF, bearer token behavior | target session/auth services remain compatible at API boundary | session continuity is not automatic | explicit auth migration later | auth/CSRF/token regression tests | high |
| Backup | legacy v1 ZIP with DB/data tree; v2 Fastify isolated archive | target archive with schema/layout/object inventory; legacy adapter | preserve old import readability | source backup and mapping exceptions | archive import/export/restore tests | high |
| WebSocket multiplayer | `WS /api/multiplayer`; in-memory protocol, same HTTP port | unrelated to catalog storage; one relay owner | none | route ownership handover | protocol/reconnect/upgrade tests | high |
| mDNS | `_prg32store._tcp.local.`, port 5080, discovery ABI | target process registers exactly one service | none | one advertiser and settings | zeroconf fixture + firmware discovery | high |
| Jinja/static pages | legacy Flask HTML/static routes | Next.js owns migrated pages; Flask retained during migration | none until separately retired | frontend route parity | HTTP/rendered contract tests | medium |
| `index.json` | internal Flask/Fastify implementation dependency; not firmware HTTP contract | generated legacy input/export only | final runtime removes authority | complete target import and Flask retirement | source grep, SQL-only catalog test | high |

## Firmware and host observables

Read-only inspection of `../PRG32` shows:

- firmware and host tools request catalog metadata over HTTP;
- host `store-list` requests `/api/games?limit=100` and accepts a top-level
  list or `games/items/cartridges` array;
- host `store-download` builds `/api/games/<quoted-id>/download` with
  `architecture` and optional `version`, consumes `Content-Length` when
  present, and streams raw response bytes;
- firmware/host do not construct or inspect server filesystem paths and do not
  depend on `index.json` or the current directory names;
- stable observable identifiers are the game ID, version, architecture,
  discovery ABI, metadata/colophon ABIs, URL paths, binary bytes, status/error
  behavior, MIME/attachment headers, and mDNS service/port;
- publishing host tools use multipart `/api/publish/bundle` and optional Bearer
  token; firmware score/metrics clients use their existing unauthenticated
  firmware-shaped POST contracts;
- mDNS service `_prg32store._tcp.local.` and default port 5080 remain required.

This confirms filesystem independence at the client boundary, but it does not
permit changing public response shapes or firmware behavior. The target must
preserve all observables above.

## Compatibility acceptance gate

M5.2 implementation cannot advance to public cutover until the target passes
the matrix against deterministic fixtures and the copied legacy source:

1. exact status/body/error/header comparison for catalog/media/download;
2. byte, size, MIME, attachment and conditional/range behavior comparison;
3. telemetry count and identity comparison;
4. scores/metrics/publishing/review/auth/admin regression suites;
5. firmware and host contract tests without changing `../PRG32`;
6. backup import/export, integrity, crash recovery and rollback rehearsal;
7. proof that target catalog queries neither read `index.json` nor enumerate
   object directories.

Until then, Flask remains the sole operational owner.

## M5.2d executed evidence

The disposable differential gate is implemented in
`backend/src/storage-v2/differential/`. It compares real Flask test-client
responses against a SQL/object-backed read-only projection on a populated
synthetic snapshot. The gate passed 22/22 catalog, detail, media, colophon,
download, pagination, architecture and error cases; exact binary/media bytes,
MIME types, required attachment names and status semantics matched. It also
verified three historical telemetry rows, nine deterministic migration fault
boundaries, source immutability, and corrupt-object refusal.

This evidence does not cover live Fastify route registration, operational
download-event writes, firmware runtime execution, conditional/range behavior,
or backup/restore. Those remain separate gates and Flask remains the
operational owner.
