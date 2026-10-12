# Target architecture

## Boundary diagram

```text
Browser
  React + TypeScript + Vite build
    UI components / feature screens
    Zustand: client-only state
    TanStack Query: API/server state
    typed API client + runtime response checks
          |
          | same-origin HTTP, cookies or Bearer tokens
          v
Flask Cartridge Store
  auth + authorization + CSRF
  catalog/publish/review services
  scores + metrics + stats services
  discovery + WebSocket relay
       |                         |
       v                         v
  SQLite service data       Filesystem cartridge store
  settings/users/runs/...   index.json + cartridges/ + pending/
```

## Frontend organization

Create only the directories justified by the actual screens:

```text
frontend/
  src/
    app/              router, providers, error boundary
    components/       shared layout and accessible UI primitives
    features/
      catalog/        storefront, search, filters, details, downloads
      auth/            login, registration, session state
      publishing/      upload wizard and submission status
      review/          editor queue and decisions
      stats/           downloads, scores, metrics views
      admin/           users, groups, settings, backup affordances
    lib/              API client, schemas, formatting, capabilities
    stores/           small Zustand stores
    styles/           tokens and theme CSS
    tests/             component and contract tests
```

Keep file naming and feature boundaries simple. A component belongs in shared UI only when at least two features use it. Avoid a generic “repository/service” abstraction around every fetch.

## API boundary

The React client must preserve all existing public routes and fields. Build a typed client for these resource families:

| Resource | Read operations | Mutations | Auth |
| --- | --- | --- | --- |
| Discovery | `/api`, `/.well-known/prg32-store.json` | None | Public |
| Catalog | `/api/games`, game detail, icon, screenshot, colophon, download | `/api/publish`, `/api/publish/bundle` | Publish requires session/Bearer |
| Auth | `/api/me`, `/auth/me`, token list | login/register/logout/token CRUD | Route-specific |
| Review | submissions list/detail | verify/reject | `editors` |
| Scores | list and stats | score submission | Submit requires auth |
| Metrics | runs/detail/CSV/report | create/batch/finish | Ingestion is currently public for compatibility; access policy must be decided |
| Statistics | downloads/scores/runs summaries | Download event is internal to download | Public in current code |
| Multiplayer | info/status | WebSocket join/state/leave | Legacy/configured token behavior |
| Admin | HTML admin pages currently | HTML mutations and backup | Admin/editor role/group |

### Contract rules

- Keep existing envelopes such as `{ok, games, pagination}`, `{ok, game}`, `{ok, error}`, and token-creation response fields.
- Preserve `prg32-metadata-1.0`, `prg32-colophon-1.0`, and `prg32-store-discovery-1.0` exactly.
- Preserve architecture identifiers `esp32c6` and `qemu`.
- Treat binary download MIME, filename, query parameters, and redirect/error behavior as contracts.
- Add optional fields rather than replacing fields. Proposed new fields require approval and compatibility tests.
- Normalize errors internally but keep the legacy `error` string until clients migrate; add an optional stable `code`.
- Use one pagination model in new client code while adapting the existing page/per-page/limit query compatibility.

## Authentication flow

1. Same-origin React login/register forms post to existing auth endpoints with CSRF protection once added.
2. Flask establishes the signed session and remains the source of truth for `/auth/me`.
3. Query client loads current principal; protected routes redirect or show a typed 401/403 state based on response.
4. API tokens are created in a one-time reveal screen. The client never stores the token secret in persistent global state.
5. OIDC/SAML remain backend redirects/callbacks; React handles the post-login return route only after the backend establishes the session.

Authorization is enforced server-side. Client route guards improve UX but are not security controls.

## File storage and binary distribution

Keep uploaded cartridge bytes outside SQLite. The backend validates, stores, hashes, and streams them. The frontend displays the server-provided variant metadata and uses ordinary download links or a mutation-aware download action. Do not fetch whole `.prg32` files into JavaScript unless a future feature explicitly needs it.

## Error handling and observability

Backend responses should add stable error codes, correlation/request ids, and structured logs without exposing secrets. Frontend screens should distinguish network failure, 401, 403, 404, validation failure, 413, and 5xx. Log publishing/review/download events with actor/resource ids but do not log token values or uploaded content.

## Deployment strategy

Phase 1 can build React into static assets and serve them from the existing container or a same-origin reverse-proxy path while the Jinja app remains available. Use an explicit `FRONTEND_BASE_PATH` only if needed. Keep port 5080, `/data`, WebSocket routing, and mDNS behavior unchanged.

After parity, switch selected browser routes one feature at a time. Retain server-rendered fallback routes until rollback has been rehearsed. Do not make the first React release a Docker or host-path migration.
