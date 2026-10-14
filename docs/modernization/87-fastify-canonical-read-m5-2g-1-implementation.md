# PRG32 Cartridge Store — M5.2g.1 Fastify canonical read integration

Date: 2026-10-14  
Status: **GO for isolated disposable reads; NO-GO for operational cutover**

## 1. Executive result

The actual Fastify catalog handlers can now read a verified storage-v2 target
without making canonical storage operational. The default remains the legacy
`index.json`/filesystem reader. Canonical reads require an explicit disposable
mode, root, marker, compatible version tuple and exact test authorization.

Flask remains the public owner. No operational database, cartridge store,
Docker service, route, proxy, provider, deployment or Flask behavior changed.

## 2. Scope and non-goals

Implemented:

- catalog listing and search;
- cartridge detail and historical published-version selection;
- architecture selection and supported aliases;
- icon, screenshot and colophon reads;
- cartridge download, range responses, conditional responses, content type,
  filename and exact bytes;
- fail-closed startup validation and read-only canonical object access.

Not implemented or enabled:

- operational canonical ownership or public routing;
- canonical writes, publishing, review, staging promotion or telemetry writes;
- migration, deployment, Compose/Traefik changes, Flask removal or Python
  removal;
- browser E2E/AuthentiK execution;
- WebSocket/mDNS or session-cookie cutover.

## 3. Read modes and authorization

`PRG32_BACKEND_CATALOG_READ_MODE` accepts:

- `legacy` — default; uses the existing `ReadonlyCatalog` and preserves the
  current Fastify legacy behavior;
- `canonical-disposable` — opt-in only; requires
  `PRG32_BACKEND_CANONICAL_STORAGE_ROOT` and the exact developer-only value
  `M5.2G1-DISPOSABLE-CANONICAL-READ` in
  `PRG32_BACKEND_CANONICAL_READ_AUTHORIZATION`.

Canonical disposable mode is rejected in production. Supplying a root or
authorization alone never activates it. A canonical initialization failure is
fatal; there is no fallback to the legacy reader.

The root must be a fresh, non-symlink disposable storage-v2 target with the
`.prg32-storage-v2` marker, application marker `prg32-cartridge-store`, and
tuple schema `2`, storage layout `2`, publication journal `1`, backup format
`3`. It must not overlap the repository, configured legacy data root or
configured legacy SQLite path.

## 4. Read architecture

`backend/src/storage-v2/catalog.ts` is the shared canonical read source. The
M5.2d differential projection now wraps this source instead of maintaining a
second SQL/object implementation. `backend/src/catalog/routes.ts` selects a
legacy or canonical source at application construction and registers the same
existing public paths.

The source derives public visibility from active cartridges, published
releases, published artifacts and available immutable objects. Pending,
rejected, withdrawn, staged, quarantined and private submission rows are not
catalog candidates. Version and architecture selection is relationship-based;
directory enumeration and storage keys are never used as catalog truth.

The canonical route source owns a `ReadonlyObjectStore` capability rather than
the writable promotion class. It opens SQLite with `query_only=ON`, resolves
only derived object keys, rejects symlink/non-regular files, checks metadata
size, and streams a bounded hash verification before exposing the object path.
The route then uses Fastify's existing stream/range handling. This is suitable
for the disposable quiesced target used here; concurrent promotion/retirement
is not claimed as hot-backup or operational read consistency.

## 5. Compatibility behavior

The existing route paths and public response envelopes remain unchanged:

```text
GET /api/games
GET /api/games/:game_id
GET /api/games/:game_id/icon
GET /api/games/:game_id/screenshot
GET /api/games/:game_id/colophon
GET /api/games/:game_id/download
```

The implementation preserves JSON serialization, status/error envelopes,
content types, download disposition filenames, content lengths, ETags,
conditional `304` responses and byte ranges. Canonical media and cartridge
bytes are read from object relationships, not from internal storage keys.

The Fastify route layer does not insert `download_events`; this is explicitly
**telemetry write parity NOT_VERIFIED**, not a claim that operational telemetry
ownership is complete. Existing legacy behavior is unchanged.

## 6. Tests and evidence

Added `backend/tests/canonical-read-http.test.ts` with three tests and actual
Fastify `app.inject()` requests. It verifies:

- list/search-compatible catalog visibility, detail, published version and
  `esp32c6`/`qemu` architecture behavior;
- exact icon/screenshot/download bytes and content headers;
- colophon response, unsupported architecture and unpublished-version errors;
- byte ranges and conditional downloads;
- unchanged canonical DB bytes and download telemetry count;
- the canonical reader's query-only state and exact startup authorization;
- legacy mode remains the default.

The disposable fixture is built by the existing M5.2b/M5.2c path and uses no
operational data. M5.2d's Flask differential evidence remains 22/22 and is
still run independently.

## 7. Files changed

Implementation:

- `backend/src/storage-v2/read-mode.ts`
- `backend/src/storage-v2/catalog.ts`
- `backend/src/storage-v2/objects.ts`
- `backend/src/storage-v2/differential/projection.ts`
- `backend/src/storage-v2/differential/harness.ts`
- `backend/src/config/env.ts`
- `backend/src/catalog/routes.ts`
- `backend/src/app.ts`
- `backend/tests/canonical-read-http.test.ts`

Documentation:

- this report;
- current M5.2f readiness/plan wording and the roadmap were updated to state
  that generic OIDC/SAML is required in final Fastify and remains provider
  neutral. Historical milestone reports were not rewritten.

## 8. Generic OIDC/SAML boundary

Generic OIDC/SAML remains a required final Fastify capability. The provider is
external and provider-neutral; the local infrastructure origin is
`sso.dream.test`. This milestone does not alter provider configuration,
credentials, callback routes, cookies, AuthentiK state or browser federation.

The current readiness decision remains open until external-provider callback,
identity mapping, session creation, logout, negative cases and rollback
behavior are accepted. No AuthentiK-specific implementation is introduced.

## 9. Verification commands

Executed with Node 24 after `nvm use 24`:

```bash
pnpm --dir backend run typecheck
pnpm --dir backend run lint
pnpm --dir backend run build
pnpm --dir backend run test
pnpm --dir backend exec vitest run tests/canonical-read-http.test.ts
```

The focused canonical HTTP suite passed: **3 tests**. The complete backend
suite passed: **36 test files, 187 tests**. M5.2d's existing differential test
continued to pass, including **22/22** compatibility cases.

Repository-wide verification also passed: frontend typecheck, lint and tests
(`20` files / `55` tests), frontend production build with
`FLASK_PROXY_TARGET=http://flask:5080`, Python compile and pytest (`64` tests),
`docker compose --profile dev config --quiet`, and `git diff --check`. The
bare frontend build without `FLASK_PROXY_TARGET` failed closed as designed and
was then rerun successfully with the required disposable/dev proxy target.

## 10. Remaining risks and gates

- the canonical source is intentionally disposable-only and not a public
  operational writer;
- object verification plus streaming has a read/stream race if a future
  writer mutates a target concurrently; operational single-writer/quiescence
  policy remains required;
- download telemetry is not owned or reconciled by this milestone;
- publication/review, scores, metrics, WebSocket, mDNS, authentication/session
  continuity and public reverse-proxy behavior remain open gates;
- exact live Flask/Fastify response ownership and operational backup policy are
  not established;
- no operational readiness or Flask retirement claim is made.

## 11. GO/NO-GO decisions

- isolated disposable canonical HTTP read integration: **GO**;
- canonical mode as default: **NO-GO**;
- operational Fastify ownership/cutover: **NO-GO**;
- canonical writer/public storage-v2 writes: **NO-GO**;
- Compose/Traefik/provider changes: **NO-GO**;
- Flask retirement: **NO-GO**;
- M5.2g.2 or later milestone: **NOT STARTED**.
