# PRG32 Cartridge Store — Flask retirement dependency matrix

Date: 2026-10-14  
Status: **planning artifact only; no removal authorized**

This matrix is derived from the current source inventory in
`backend/src/readiness/inventory.ts`, the current Compose file, and the
M5.2d/e evidence. `REMOVE` means a future candidate, not a deletion performed
by M5.2f. `RETAIN` means the dependency must remain through the relevant
cutover or rollback window.

| Component/domain | Action after verified cutover | Current evidence | Required dependency before action | M5.2f decision |
| --- | --- | --- | --- | --- |
| `cartridge_store/app.py` | `REMOVE` | Owns Flask factory, legacy pages and many public routes | all HTML/catalog/admin/backup ownership moved; rollback window closed | retain |
| `cartridge_store/auth/` | `ARCHIVE` | Owns Flask local sessions and generic adapters | local token/session continuity and generic provider identity mapping accepted | retain |
| `cartridge_store/metrics.py` | `REMOVE` | Owns firmware metrics writes and exports | Fastify ingestion, limits, exports and reconciliation verified | retain |
| `cartridge_store/scores.py` | `REMOVE` | Owns score writes and leaderboard | Fastify writer, anonymous policy and rate limits verified | retain |
| `cartridge_store/multiplayer.py` | `REMOVE` | Owns public Flask-Sock relay | Fastify WebSocket public ownership, Traefik upgrade and firmware acceptance | retain |
| `cartridge_store/mdns.py` | `ARCHIVE` | Owns `_prg32store._tcp.local` registration | Fastify failure-tolerant lifecycle and discovery regression tests | retain |
| `cartridge_store/review.py` | `REMOVE` | Owns live review state | Fastify review/publication owner and crash recovery | retain |
| `cartridge_store/store.py` and legacy cartridge files | `ARCHIVE` | Owns legacy index/filesystem reads and writes | canonical objects/index are authoritative and differential verification passes | retain through rollback |
| `templates/` and legacy `static/` | `ARCHIVE` | Jinja storefront/admin UI | Next.js storefront/admin parity and asset migration | retain |
| root `Dockerfile` | `REMOVE` | Builds transitional Flask image | slim Fastify/Next production builds and rollback window | retain |
| Compose `cartridge-store` / `prod` | `REMOVE_AFTER_CUTOVER` | Transitional Flask production service | authorized routing switch and recovery evidence | retain |
| Compose `flask` / `dev` | `REMOVE_AFTER_CUTOVER` | Flask development owner for `api.prg32.dream.test` | Fastify public owner and local workflow replacement | retain |
| Compose `backend` / `backend` | `MERGE` | isolated Fastify read-only service | consolidated Fastify dev/runtime profile | retain until merge |
| Compose `auth-writer` / `writer,dev` | `MERGE` | disposable Fastify writer with bind mounts | canonical writer boundary and initialization lifecycle | retain |
| Compose `auth-writer-init` | `REMOVE_AFTER_CUTOVER` | disposable preflight/key registry initializer | explicit external/preflight key lifecycle | retain |
| Compose `auth-writer-edge-proxy` | `REMOVE_AFTER_CUTOVER` | nginx bridge for isolated auth routes | direct Fastify-to-Traefik auth routing verified | retain |
| external Dream Traefik network | `RETAIN` | external `dream_edge` network and labels | none; preserve labels and hosts | retain |
| external generic OIDC/SAML provider | `RETAIN` | provider is outside this repository; local origin is `sso.dream.test` | callback/session decision and provider-side configuration | retain |
| SQLite and canonical filesystem | `RETAIN` | authoritative data boundary during migration | one-writer ownership, backup, restore and rollback policy | retain |
| legacy backup/restore route | `UNDECIDED` | Flask route remains operational | v3 encryption/authenticity, retention and restore runbook | retain |

## Route-family dependencies

| Route family | Flask retirement prerequisite |
| --- | --- |
| Discovery/catalog/download | exact JSON/binary/media parity, canonical object ownership, download-event write decision |
| Auth/session/token | controlled re-login, token compatibility, CSRF and provider identity decision |
| Publication/review | staging/private-data preservation, publication journal recovery, single writer |
| Scores/metrics | firmware-compatible writes, reconciliation and rate-limit continuity |
| Statistics/exports | non-identifying public aggregate policy and private authorization parity |
| Admin/settings/assets | RBAC parity, asset ownership and Next.js UI replacement |
| Multiplayer | WebSocket upgrade/reconnect/auth behavior through Traefik |
| mDNS/discovery | Fastify lifecycle, ABI, port and failure-degradation tests |
| Backup/restore | encrypted operational format, key custody, retention and restore rehearsal |

## Deletion order

No deletion is performed now. When separately authorized, the safe order is:

1. stop new legacy writes and preserve a verified source snapshot;
2. switch and verify one canonical writer;
3. retain Flask, its image and data through the rollback window;
4. remove the edge bridge only after direct Fastify auth routing is proven;
5. consolidate `backend` and `auth-writer` profiles;
6. remove `auth-writer-init` after key/data initialization is explicit;
7. archive/remove Flask code and image only after all route-family gates pass;
8. retain canonical SQLite/filesystem and external Traefik/provider.

Before step 7, it is prohibited to delete Flask, legacy data, bind mounts,
the external network, or compatibility behavior.
