# Technology decisions

## Decision summary

| Area | Decision | Rationale |
| --- | --- | --- |
| Frontend | React + TypeScript | Component reuse, typed API boundaries, accessible interactive workflows, and a maintainable client layer for the growing feature set |
| Application framework/build | Next.js + TypeScript | Provides the requested React foundation and a path to a TypeScript full-stack replacement while allowing incremental routing and server boundaries |
| Routing | Next.js App Router | Keeps navigation, layouts, loading/error boundaries, and future server-side API handlers in one framework; do not duplicate every Flask URL immediately |
| UI | Tailwind CSS plus a small shadcn/ui-style component layer, or an equivalent accessible library | Tokens and composable primitives without forcing a large visual framework; select one library after bundle/accessibility review |
| Icons | Lucide React | Consistent accessible icon primitives; not a replacement for cartridge imagery |
| Client state | Zustand | Theme, filters, navigation, and temporary upload state; keep it small |
| Server state | TanStack Query | Fetching, caching, invalidation, retries, and loading/error states for existing APIs |
| Forms | React Hook Form + Zod only where forms are complex | Publishing, auth, and admin forms need client feedback; server remains authoritative |
| Backend transition | TypeScript target; Flask compatibility backend during migration | The desired end state is Next.js/TypeScript, but Flask remains temporarily authoritative until every public contract, binary rule, auth path, SQLite behavior, and WebSocket protocol has parity evidence |
| ORM | Defer Drizzle | Current backend is Python/SQLite; introducing a Node database writer would add operational and integrity risk |

## Frontend stack boundaries

The first Next.js app should be a thin migration shell, not a second business-logic implementation. It may own presentation, local validation, request cancellation, optimistic UI where safe, and cache invalidation. During the transition Flask remains authoritative for authentication, authorization, metadata validation, artifact handling, version selection, download events, scores, metrics, review transitions, and the WebSocket relay. Future TypeScript route handlers/services may replace these responsibilities only after contract and data-parity evidence.

The first frontend should use same-origin requests so existing session cookies work. If deployed under a separate origin later, define CORS and CSRF explicitly; do not make credentialed cross-origin requests by default.

Next.js is the selected target because the project owner wants the migration to converge on TypeScript rather than retain a permanent Python/React split. The current phase uses the App Router and HTTP rewrites as a reversible compatibility boundary; it does not yet claim backend parity or remove Flask.

## State ownership rules

### Zustand owns client state

- `theme`: light/dark/system and reduced-motion preference.
- Catalog query draft, selected filters, and navigation drawer state.
- Temporary publish wizard state that is safe to discard.
- Toast/banner visibility and client-only preferences.

### TanStack Query owns server state

- Games, game detail, icons/screenshots, scores, and public statistics.
- Current user, tokens (never the token secret after creation), submissions, runs, and admin lists.
- Mutation status and invalidation after publish/review/admin actions.

Do not copy query results into Zustand. TanStack Query is explicitly designed for asynchronous server-state management; Zustand is a small hook-based client store. See [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) and [Zustand introduction](https://zustand.docs.pmnd.rs/learn/getting-started/introduction).

## Backend option comparison

### Option A — Transitional Flask compatibility

Keep Flask routes and public response shapes. Add a contract layer, security fixes, migration command, and small service abstractions only where tests demonstrate value. Serve React static output through the same deployment or a reverse proxy. This reuses the parser, filesystem semantics, mDNS, WebSocket relay, auth providers, and existing pytest suite.

Trade-off: the repository remains polyglot once React is added, and Python/TypeScript types need a deliberate contract workflow.

### Option B — TypeScript backend

Use Fastify or Hono only if the project explicitly chooses a backend migration. Fastify is the more conventional candidate for a long-lived HTTP API with plugins and schema validation; Hono is lighter and useful when edge/runtime portability matters. NestJS would add more structure than the current classroom service currently needs.

Porting must cover every route in [route inventory](../../ROUTES_REFERENCE.txt), signed sessions, Bearer and legacy tokens, OIDC/SAML callbacks, upload/review rules, PRG32 binary behavior, backup semantics, CSV/Markdown exports, and WebSocket protocol. This is a new backend, not a frontend-enabling refactor.

Recommendation: use the transitional Flask boundary only while the TypeScript replacement is being implemented. Do not remove Flask or route production traffic to TypeScript until the contract suite, database migration proof, authentication review, upload/download byte checks, and WebSocket compatibility tests pass.

## Drizzle ORM assessment

The database engine is SQLite. Drizzle has an SQLite dialect and supports existing SQLite projects, schema introspection, typed table definitions, and generated SQL migrations. See the official [Drizzle SQLite existing-project guide](https://orm.drizzle.team/docs/get-started/node-sqlite-existing) and [Drizzle SQLite reference](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/src/sqlite-core).

That compatibility does not make Drizzle useful in the current Python architecture. A separate Node process would either become a second writer to the same database or require API/data duplication. Both are worse than the current direct SQLite access for the first milestone.

If Option B is approved later:

1. Freeze the current table/column/index/FK inventory.
2. Introspect a copy of a real backup, preserving table names and identifiers.
3. Generate Drizzle schema and compare SQL/constraints manually.
4. Introduce a migration journal on a copy, never with `push` against production.
5. Run dual-read or shadow comparison tests before switching writes.
6. Keep Python rollback/maintenance tooling until parity is proven.

Drizzle is therefore a conditional future choice, not a frontend dependency and not a reason to migrate SQLite to another engine.

## Dependencies that should not be added yet

Do not add a global Redux store, GraphQL, tRPC, microservices, a message queue, a new database engine, or a full-stack React framework without a measured requirement. Do not add a UI library until accessibility, theming, bundle size, and ownership are reviewed against the design tokens in `07-ui-ux-specification.md`.
