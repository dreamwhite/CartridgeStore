# Next.js Storefront M3 — Statistics, Scoreboard and Documentation

Date: 2026-10-14
Scope: Next.js user-facing read-only Storefront surfaces
Status: GO for isolated M3 implementation; NO-GO for operational Fastify cutover

## 1. Result

M3 is implemented in the existing Next.js application without adding a new
backend contract, changing Flask ownership, enabling Fastify writes, touching
operational data, or modifying `../PRG32`.

The Storefront now provides:

- `/stats` for documented public download, score-preview, and metrics-run
  aggregates;
- `/scores` for bounded, filterable score browsing using the server's existing
  ordering semantics;
- `/docs` and `/docs/[slug]` for a curated, source-traceable developer
  documentation experience covering the requested public topics.

The implementation deliberately omits unsupported architecture-download
charts, synthetic historical trends, and public run-sample visualization.
The metrics detail/export routes remain owner/admin protected by the existing
API contract.

## 2. Initial frontend state

The existing Storefront already used Next.js App Router, Tailwind CSS, TanStack
Query, Zod response validation, the shared purple/light-dark design tokens,
and a single `AppShell`. M3 reused those conventions and preserved `/`,
`/games/[gameId]`, `/workspace`, `/publish`, and `/review`.

Primary additions:

- statistics, scores, metrics, and documentation API adapters and contracts;
- Statistics and Scoreboard components with explicit loading, empty, and
  failure states;
- structured documentation content with article navigation, tables, code
  blocks, internal links, and source labels;
- primary navigation links for Statistics, Scores, and Docs.

## 3. API contract and runtime ownership matrix

| Method/path | Request | Response used by M3 | Auth | Public owner | Fastify status |
|---|---|---|---|---|---|
| `GET /api/stats/downloads` | `since`, `until`, `granularity=day\|week\|month`, bounded `limit` | `{series,total,top_games}` | public aggregate | Flask | read-only equivalent registered |
| `GET /api/stats/downloads/<game_id>` | same range filters | `{id,total,architectures,series}` | public aggregate | Flask | read-only equivalent registered |
| `GET /api/stats/scores` | bounded `limit` | `{scores:[...]}` | public | Flask | read-only equivalent registered |
| `GET /api/stats/runs` | none | `{total,finished,active_last_7_days}` | public aggregate | Flask | read-only equivalent registered |
| `GET /api/scores` | `game`, `player`, bounded `limit` | score array | public | Flask | read-only equivalent registered |
| `GET /api/runs` | none | owner/admin-filtered run array | authenticated owner/admin | Flask | read-only equivalent registered |
| `GET /api/runs/<run_id>` | optional `format=json` | owner/admin run detail and summary | owner/admin | Flask | read-only equivalent registered |
| `GET /api/runs/<run_id>/samples.csv` | run id | bounded CSV export | owner/admin | Flask | read-only equivalent registered |
| `GET /api/runs/<run_id>/report.md` | run id | Markdown report | owner/admin | Flask | read-only equivalent registered |

The Next.js client calls the public API origin in dual-origin mode and the
existing same-origin compatibility route otherwise. It never opens SQLite and
never targets the disposable writer for public Store statistics.

## 4. Statistics implementation

`/stats` consumes the real download, score-summary, and run-summary contracts.
It presents:

- recorded download total;
- metrics-run total and finished/last-seven-day counters;
- a bounded download-event table with an accessible relative-volume bar;
- top downloaded cartridges from `top_games`;
- a bounded score-activity preview.

No total is converted into a historical series. The download table only renders
the `series` points returned by the API. Architecture breakdown is not shown on
the aggregate page because the public summary contract does not provide it;
the per-game endpoint remains available for a future scoped detail view.

## 5. Scoreboard implementation

`/scores` uses `GET /api/scores` with the documented exact `game`, `player`, and
bounded `limit` filters. It displays the returned order as the position in the
bounded response and explicitly explains that this is not a newly calculated
global rank.

The UI does not:

- assume a different ranking direction;
- deduplicate records;
- invent tie-breaking rules;
- merge anonymous player labels with authenticated users or firmware IDs;
- fetch an unbounded collection.

## 6. Metrics and units

The public Statistics page uses only `/api/stats/runs`, because detailed runs,
samples, CSV, and Markdown exports are protected by the existing owner/admin
policy. Frontend metrics contract tests preserve the actual units for a future
authorized run view:

- `frame_us`, `update_us`, `draw_us`, and `present_us` remain microseconds;
- raw `fps_x100` is not mistaken for FPS; the documented summary `fps_avg` is
  used as returned;
- `deadline_missed` and `dropped_samples` remain counts;
- an empty owner-scoped run list remains empty.

This is an intentional privacy and ownership boundary, not a missing fallback.

## 7. Documentation architecture and sources

Public developer content is maintained as a small structured content tree in
`frontend/src/lib/docs/content.ts`, rendered by shared documentation
components. This avoids introducing a documentation framework or copying whole
Markdown files into independently maintained pages.

The curated articles cover:

- Getting started;
- cartridge format;
- metadata and compatibility;
- publishing;
- multiplayer;
- scores;
- metrics and runs;
- Store API.

Each article exposes its source label. Content was derived from the current
Store API reference, the repository ABI rules, and public firmware guides in
`../PRG32/docs/`. No private Dream infrastructure, Authentik configuration,
credentials, internal security procedures, or maintainer runbooks are exposed.
The sibling repository was read-only and unchanged.

## 8. Accessibility and responsive behavior

The new surfaces use semantic headings, labeled filters, table captions,
`scope="row"`, keyboard-focus styles, explicit alert states, text alternatives
for the download volume bars, responsive grids, and horizontal overflow for
wide tables. Existing CSS variables preserve light/dark themes and the shared
purple accent. No Playwright or browser E2E infrastructure was introduced.

Responsive behavior is represented by the established Tailwind breakpoints and
was covered by component structure/tests; browser automation remains explicitly
out of scope.

## 9. Verification evidence

Executed with Node `24.20.0` after `nvm use 24`:

```text
frontend typecheck                         PASS
frontend lint                              PASS
frontend Vitest                            PASS — 18 files, 51 tests
frontend Next production build             PASS — /stats, /scores, /docs and 8 SSG articles
backend typecheck                          PASS
backend lint                               PASS
backend Vitest                             PASS — 28 files, 142 tests
backend build                              PASS
Python pytest                              PASS — 64 tests
docker compose --profile dev config        PASS
git diff --check                            PASS
```

Read-only public-origin smoke, with no login and no mutation, returned:

```text
GET /api/stats/downloads?limit=1  HTTP 200  (empty series/top_games)
GET /api/scores?limit=1          HTTP 200  (empty array)
GET /api/stats/runs               HTTP 200  (zero aggregate counters)
GET /docs                          HTTP 200  (Next.js documentation HTML)
```

The empty production-compatible responses are reported as empty states. No
synthetic production statistics were inserted to make the page appear full.

## 10. Known limitations and deferred work

- Public aggregate stats do not include a historical architecture series;
  M3 does not derive one from incomplete data.
- The public Store API has no pagination envelope for scores, only a bounded
  `limit`; the Scoreboard reflects that contract.
- Detailed metrics visualization requires an explicitly scoped authenticated
  owner/admin route and bounded sample strategy. It is not exposed publicly.
- Documentation content is curated and source-labeled; it is not an automatic
  Markdown importer. Future firmware contract changes must update the source
  label/content together.
- Flask remains the operational owner for public catalog, score, metrics,
  statistics, download telemetry, publishing, review, and multiplayer routes.

## 11. Final decision

**GO for isolated Next.js Storefront M3.**

**NO-GO for Flask retirement, public Fastify cutover, operational write
enablement, production routing changes, deployment, schema changes,
Authentik changes, Playwright restoration, commits, or pushes.**

`M6.3d.2h.12` was not defined or started.
