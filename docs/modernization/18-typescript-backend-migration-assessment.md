# Fastify/TypeScript/Drizzle Backend Migration Assessment

**Assessment date:** 2026-10-12
**Target:** replace Flask/Python with a TypeScript backend while keeping Next.js as the frontend direction
**Database:** existing SQLite database, initially without schema modification
**Decision:** technically feasible, but only as a staged compatibility migration with one write authority at each stage.

## Executive assessment

The Flask application is not a thin HTTP wrapper. It combines authentication, filesystem-backed cartridge storage, PRG32 binary validation, publishing/review state, scoreboard and metrics ingestion, backups, discovery, mDNS, and a WebSocket relay. A TypeScript rewrite is therefore feasible but is a behavioral reimplementation, not a framework substitution.

Fastify is a good target for the HTTP and WebSocket boundary. Drizzle can map the existing SQLite schema and provide typed access without requiring an immediate schema migration. The difficult compatibility areas are not the route declarations: they are Flask signed-cookie semantics, Werkzeug password hashes, legacy API-token lookup, filesystem/index consistency, binary and ZIP handling, external identity providers, and the exact response behavior consumed by firmware.

The recommended strategy is:

1. contain the remaining high-impact Flask risks before exposing more public traffic;
2. build a TypeScript backend shell with no writes;
3. prove read-only discovery/catalog/binary parity;
4. migrate authentication and writes one bounded domain at a time;
5. switch to a single TypeScript writer only after a backup, rollback, and contract gate;
6. remove Flask/Python only after operational cutover evidence.

## Responsibility mapping

| Current responsibility | Current location | TypeScript target | Migration notes |
|---|---|---|---|
| Application bootstrap and configuration | `app.py`, `cartridge_store/app.py` | Fastify bootstrap plus typed config plugin | Validate environment at startup; keep port `5080`, `/data`, Traefik hostnames, and WebSocket path. |
| Database connection and request lifecycle | `cartridge_store/database.py` | `drizzle-orm/better-sqlite3` or an equivalent SQLite driver behind a repository plugin | Enable foreign keys on every connection; define busy/transaction policy explicitly. |
| Settings and persistent bootstrap marker | `settings.py`, auth setup | Drizzle repository for `store_settings` | Preserve key names and values; do not create a second settings store. |
| Local auth, registration, roles, groups | `cartridge_store/auth/__init__.py`, `users.py` | Fastify auth plugin, route schemas, user/group repositories | Preserve IDs, role strings, group membership, token behavior, and error compatibility. |
| Flask session and CSRF | Flask session helpers and auth routes | Explicit cookie/session plugin plus CSRF hook | Decide whether to support old Flask cookies or force a controlled re-login with a new cookie name. |
| OIDC | `auth/oidc_adapter.py` | `openid-client`-compatible service or a reviewed Fastify OIDC plugin | Provider callback and cookie tests are required; do not infer compatibility from route shape. |
| SAML | `auth/saml_adapter.py` | A maintained Node SAML implementation behind an adapter | Preserve ACS/entity identifiers and assertion-to-user mapping; use provider fixtures before cutover. |
| LDAP | LDAP adapter/stub | Keep disabled until a real requirement exists | Do not invent an interactive LDAP feature during the rewrite. |
| Cartridge files and catalog index | `store.py` and filesystem under `PRG32_STORE_DATA` | Storage service using `fs/promises` plus atomic temp-file replacement | SQLite is not the cartridge blob store. Preserve index ABI, paths, hashes, and architecture names. |
| PRG32 binary format | `prg32_format.py` | Dedicated TypeScript parser using `Buffer`/`DataView` | Build golden-vector tests against known valid/invalid files; avoid lossy string/number conversions. |
| Publishing and review | publish routes, `review.py` | Domain service with DB transaction plus filesystem compensation | Define kill-point recovery before permitting TypeScript writes. |
| Scores and scoreboard | `scores.py` | Fastify routes and Drizzle repository | Preserve ordering, numeric representation, player/game identifiers, and bearer behavior. |
| Metrics runs and samples | `metrics.py` | Repository/service with bounded payload validation | Preserve CSV/report output; add ownership and resource policy before migration. |
| Download statistics | `stats.py` | Download event service | Preserve privacy and anonymization rules; do not duplicate writes during shadow operation. |
| Backup and restore | `app.py` backup routes | Explicit archive service and admin route | Stage and validate archives, redact/encrypt secrets, and create a rollback backup before replacement. |
| Multiplayer WebSocket | `multiplayer.py` and Flask-Sock | Fastify WebSocket plugin or `ws` adapter | Preserve wire messages and auth; add size/rate/connection controls. |
| Discovery and mDNS | discovery route and `mdns.py` | Well-known route plus reviewed Node mDNS service or deployment-owned service | The HTTP ABI is mandatory. mDNS should have one owner during migration. |
| Docker and Traefik integration | Dockerfiles and Compose | Multistage Node image plus existing Traefik labels/network | Keep `store.prg32.dream.test`, `api.prg32.dream.test`, port `5080`, `/data`, and same-port WebSocket routing. |

## SQLite and Drizzle compatibility

### Existing data model

The database is unified SQLite. The relevant tables and constraints found in the current implementation are:

- `users`: integer autoincrement ID, unique username and email, password hash, role, optional external provider/ID, timestamps;
- `api_tokens`: integer ID, foreign key to `users` with cascade delete, unique SHA-256 token hash, label and timestamps;
- `groups` and `user_groups`: unique group names and a composite primary key with cascading foreign keys;
- `registration_tokens`: unique token hash, expiry/use fields, and an email/usage/expiry index;
- `store_settings`: text primary key and required text value;
- `runs`: text `run_id` primary key, run metadata, optional `user_id` foreign key, finish state, and counters;
- `samples`: integer autoincrement ID, foreign key to `runs` with cascade delete, unique `(run_id, frame)`;
- `scores`: integer autoincrement ID with a game/score/time ordering index;
- `download_events`: cartridge/version/architecture event data with optional user and IP hash;
- `cartridge_submissions`: review state, JSON metadata/architecture fields, optional user foreign keys with `SET NULL`.

Cartridge data is outside SQLite. The filesystem contains the catalog index, cartridge binaries, pending submissions, and custom assets. A Drizzle schema must represent this boundary rather than attempting to add a blob table.

### Safe first Drizzle step

The first database step should be an isolated, read-only schema snapshot:

1. open a copy of an isolated fixture database;
2. enable `PRAGMA foreign_keys = ON`;
3. inspect tables, columns, defaults, indexes, unique constraints, and foreign-key actions;
4. express the existing schema in Drizzle without generating or applying migrations;
5. compare representative query results and serialized values with Flask;
6. review any generated SQL manually before allowing a write connection.

Drizzle migrations must not be run automatically against the production database as part of the first TypeScript deployment. The current Python code uses idempotent table/index creation and conditional column addition; that history must be preserved as a documented baseline, not silently replaced by a newly generated migration.

Important compatibility details:

- map SQLite integer autoincrement behavior deliberately;
- preserve text timestamps and integer epoch fields where they currently differ;
- preserve JSON stored as text and its current serialization/absence behavior;
- preserve `ON DELETE CASCADE` and `ON DELETE SET NULL` actions;
- preserve unique constraints and ordering indexes;
- configure SQLite busy timeout/transaction behavior explicitly rather than relying on driver defaults;
- keep the filesystem index outside Drizzle and test database/index consistency separately.

### Single-writer rule

SQLite can be read by both services during a shadow phase, but Flask and Fastify must not independently write the same logical domain. Dual writers create races around `index.json`, pending submission directories, download events, metrics rows, and backup state.

The safe sequence is:

- Flask remains the sole writer while TypeScript is read-only;
- a cutover domain enters a short maintenance or write-quiescence window;
- a verified backup and consistency snapshot are taken;
- traffic is switched to the TypeScript writer;
- Flask writes for that domain are disabled, not merely discouraged;
- rollback switches the writer back only after TypeScript writes are drained or the documented recovery procedure is applied.

## Authentication compatibility

### Sessions and cookies

The current Flask session is a signed client-side cookie. It carries values such as `user_id`, `role`, permanence, and the CSRF token; there is no server-side session table to migrate. A TypeScript session library with a different serializer cannot transparently read this cookie merely because it uses the same secret.

There are three possible policies:

| Policy | Benefit | Cost/risk |
|---|---|---|
| Controlled re-login with a new cookie name | Simple, auditable, avoids reproducing Flask serializer quirks | Existing browser sessions expire at cutover; must communicate maintenance/re-login |
| Compatibility decoder for the Flask cookie | Smooth browser cutover | Requires exact serializer/signature/timestamp behavior and security review; brittle long-term dependency |
| Keep Flask auth temporarily | Minimizes first migration slice | Extends transitional architecture and cross-service auth coupling |

The recommended default is a new TypeScript cookie name with a planned re-login window. Firmware API tokens are independent and should remain valid. If uninterrupted browser sessions are a hard requirement, make compatibility decoding an explicit project with fixture tests; do not assume it will work.

The new backend must preserve the selected policy for HttpOnly, Secure, SameSite, lifetime, logout, CSRF, and trusted proxy/scheme handling. OIDC and SAML callback tests must cover the actual Traefik external origins.

### Password hashes

Existing passwords are generated and checked by Werkzeug. Their encoded prefixes and parameters must be sampled from isolated fixtures and implemented in a compatibility verifier before changing the hashing scheme. The TypeScript service must:

- recognize every hash prefix present in the fixture database;
- compare without timing-sensitive shortcuts;
- never expose or log hashes;
- optionally rehash after a successful login only under a controlled transaction;
- avoid bulk password resets as part of a framework migration.

If a compatible Node implementation of a present Werkzeug format cannot be justified, use a small compatibility service or retain the Flask auth boundary until users have logged in and been migrated. New hashes can adopt the approved TypeScript-era policy only after the old-hash path is proven.

### API tokens and roles

The current token representation stores a SHA-256 hex digest of the raw token and returns the raw value only at creation. The TypeScript implementation must preserve this lookup behavior, token revocation semantics, and the legacy `PRG32_USERS` compatibility path where required.

Role and group values are data contracts, not UI labels. Preserve `admin`, `editor`, `user`, and player-related authorization semantics until an explicit authorization redesign is approved.

## API and binary compatibility

The migration must preserve the public paths from `docs/modernization/13-api-contracts.md`, including catalog, downloads, publishing, scores, metrics, discovery, administration, and multiplayer. The first parity tests should compare:

- status codes and content types;
- required legacy fields and their types;
- identifier formats and ordering;
- error envelopes where firmware depends on them;
- ETag/cache behavior where clients use it;
- exact binary bytes for cartridge downloads and media routes;
- SHA-256 values and architecture identifiers `esp32c6` and `qemu`;
- discovery ABI and mDNS constants.

The PRG32 parser should be ported as an independently tested library. It must use explicit little/big-endian rules, bounds checks, and integer widths. A passing route test with a hand-written mock is not sufficient; valid, corrupt, truncated, and architecture-mismatch golden vectors are required.

ZIP handling is a target hardening opportunity, but it is also a current Flask risk. The new service should enforce maximum archive bytes, entry count, per-entry uncompressed bytes, total uncompressed bytes, compression ratio, duplicate names, and manifest size before materializing content. The Flask implementation must receive equivalent containment before public publishing is left enabled.

## Domain-specific migration observations

### Publishing, filesystem, and database consistency

The current flow writes cartridge files and updates a JSON index outside an SQLite transaction. Review state is stored in SQLite, and compensating rollback exists for several failures, but a process kill at a filesystem/database boundary can still leave inconsistent state. TypeScript should not reproduce this implicitly.

Before the first write cutover, define:

- the authoritative state for each publication phase;
- an idempotent operation ID;
- a pending/staged directory convention;
- a database transaction boundary;
- a reconciliation command that can detect and repair index/file divergence;
- a kill-point test at each boundary;
- rollback behavior if the database commit succeeds but index replacement fails, and vice versa.

### Metrics, scores, and exports

Metrics ingestion needs bounded sample counts and transaction limits. Export routes need a documented ownership/privacy rule for anonymous firmware runs before they are ported. Scores must preserve firmware authentication and result ordering. Download statistics should have one writer and deterministic anonymization behavior.

### Backups

The current archive includes the SQLite database and filesystem data; settings can contain SMTP, OIDC, and SAML secrets. A TypeScript backup service should separate operational data from secrets, use explicit encryption/key management if backups leave the host, validate archive limits and ABI/schema before restore, stage extraction, and create a recoverable pre-restore snapshot. Restore must be tested with a disposable fixture and a simulated mid-restore failure.

### Multiplayer

The WebSocket path must remain on the same HTTP port and Traefik route. Preserve the wire protocol, token/player-role rules, status endpoint, and peer behavior. Add message-size, message-rate, connection-rate, and idle timeouts. In-memory groups mean a single process remains the simplest initial parity target; horizontal scaling requires a separate broker decision.

### mDNS and discovery

The HTTP discovery document is a hard compatibility contract. During migration, only one process should advertise `_prg32store._tcp` for a given store identity. Either keep mDNS in Flask until cutover or give it to a deployment-owned sidecar; do not let both services advertise competing instances.

## Target package and service boundaries

A minimal target backend can be organized as:

```text
backend/
  src/
    app.ts                 # Fastify construction and lifecycle
    config/                # environment parsing and safe defaults
    plugins/
      db.ts
      auth.ts
      csrf.ts
      errors.ts
      websocket.ts
    routes/
      discovery.ts
      catalog.ts
      auth.ts
      publish.ts
      review.ts
      scores.ts
      metrics.ts
      stats.ts
      admin.ts
      multiplayer.ts
    domain/
      cartridge-format.ts
      cartridge-storage.ts
      publication.ts
      backup.ts
    repositories/
      users.ts
      settings.ts
      scores.ts
      metrics.ts
      review.ts
```

Use Fastify schemas for request/response validation and typed route contracts. Keep domain services independent from Fastify so the same PRG32 parser and storage consistency tests can run without an HTTP server. Use Zod only where it adds boundary validation not already supplied by the chosen Fastify schema integration; avoid duplicating every schema in incompatible forms.

## Feasibility conclusion

The migration is feasible and the existing SQLite schema is reusable. Drizzle should initially be treated as a typed access layer and schema description, not as permission to recreate the database. The highest-risk compatibility decisions are sessions, password verification, OIDC/SAML, filesystem publication, and metrics privacy—not React or routing.

The first TypeScript production-relevant slice should be read-only discovery/catalog/binary parity. Authentication and writes should follow only after the compatibility fixtures and single-writer cutover procedure exist.
