# Incremental migration strategy

The migration is a strangler approach: the Flask application remains live while Next.js/React takes over verified browser surfaces. No big-bang rewrite is recommended.

## Stage 0 — Baseline and contract freeze

**Objective.** Make the current behavior measurable and reviewable.

**Scope.** Route/response inventory, API fixtures, user journeys, database/schema snapshot, artifact fixtures, and security baseline.

**Affected components.** `tests/`, `docs/api.md`, `ROUTES_REFERENCE.txt`, backend test configuration, operational runbooks.

**Dependencies.** None.

**Tasks.** Record all routes and auth requirements; add JSON fixtures for catalog/game/submission/principal/run/error responses; capture binary MIME/filename behavior; document SQLite tables and filesystem invariants; record current test and compile status.

**Acceptance criteria/tests.** Existing pytest suite passes in a provisioned environment; compatibility fixtures are reproducible; no public route is undocumented.

**Risk/rollback.** Documentation-only and reversible; retain the current route reference.

## Stage 1 — Security prerequisites

**Objective.** Remove blockers before exposing a richer client.

**Tasks.** Replace fixed bootstrap admin behavior; add CSRF; set session cookie policy and security headers; bound ZIP expansion and metric batches; unify run export authorization; add rate-limit deployment guidance; protect/redact backups; standardize error codes without removing `error`.

**Acceptance criteria/tests.** Security tests from `04-security-audit.md` pass; all existing compatibility tests pass; binary payloads and auth tokens remain compatible.

**Dependencies.** Stage 0, maintainer decision on metrics anonymity and first-run admin UX.

**Rollback.** Feature flags/configuration for new security enforcement; database backup before auth changes; maintain legacy Bearer clients.

## Stage 2 — React foundation

**Objective.** Create a typed frontend shell without changing backend behavior.

**Tasks.** Add the approved Next.js/TypeScript package and lockfile; configure lint/typecheck/test/build; establish App Router providers, error boundary, theme tokens, responsive shell, accessible primitives, and typed API client; add a static preview route.

**Acceptance criteria/tests.** Clean install/build/typecheck; keyboard navigation of shell; light/dark/reduced-motion modes; no API calls occur until a feature screen needs them.

**Dependencies.** Stage 0; Node version and UI-library decision.

**Rollback.** Do not switch production routes; remove the frontend build artifact and retain Jinja pages.

## Stage 3 — Read-only catalog parity

**Objective.** Modernize storefront/detail browsing while preserving existing output and downloads.

**Tasks.** Implement catalog query/pagination adapter, game card, detail page, icon/screenshot, versions, architecture badges, colophon, score panel, and download links. Compare React render data with `/api/games` fixtures and current pages.

**Acceptance criteria/tests.** Search and pagination match current behavior; every existing game detail/download URL works; no unsupported tabs appear; mobile/keyboard/a11y checks pass.

**Dependencies.** Stages 0–2.

**Rollback.** Route-level switch back to Jinja storefront/detail.

## Stage 4 — Authentication and developer workflows

**Objective.** Add session-aware React screens without moving auth authority to the client.

**Tasks.** Implement login/register/complete-registration states, current-user query, logout, token list/create/rename/revoke, publish upload wizard, validation/413/error handling, and submission status. Keep OIDC/SAML redirects backend-owned.

**Acceptance criteria/tests.** Existing local/session/Bearer flows pass; token secret is shown only once; unauthorized and forbidden states are correct; upload/review contract fixtures pass; CSRF is covered.

**Dependencies.** Security stage, same-origin deployment decision.

**Rollback.** Keep `/auth/*`, `/publish`, and editor pages available; switch screen by feature flag.

## Stage 5 — Review, admin, stats, scores, metrics, docs

**Objective.** Reach feature parity for operational screens.

**Tasks.** Add editor queue/detail/verify/reject, admin users/groups/roles/settings/cartridge metadata/backup affordances, score table, download stats, run list/detail/export links, and docs navigation. Keep destructive backup restore server-rendered until the hardened API flow is approved.

**Acceptance criteria/tests.** Role/group matrix passes; stats use real API data; exports obey authorization; destructive actions require confirmation; all supported mobile layouts work.

**Dependencies.** Stages 2–4 and security fixes.

**Rollback.** Per-feature fallback to existing templates; do not remove admin routes during migration.

## Stage 6 — Backend quality and optional database work

**Objective.** Improve boundaries only where baseline evidence shows value.

**Tasks.** Extract services, add explicit migrations, catalog reconciliation, SQLite lock policy, structured errors/logs, and API contract generation. Evaluate Drizzle only if a TypeScript backend is separately approved.

**Acceptance criteria/tests.** Migration dry-run/rollback on backup copy; catalog/file reconciliation; no response-shape drift; concurrency tests at the supported deployment profile.

**Dependencies.** Completed parity and operational ownership.

**Rollback.** Versioned backend release, pre-migration backup, reverse migration or restore rehearsal.

## Stage 7 — Production readiness and cutover

**Objective.** Demonstrate safe operation before switching default browser routes.

**Tasks.** Integration/E2E/accessibility/performance/security tests, Docker build/config validation, reverse-proxy/WebSocket rehearsal, backup/restore rehearsal, canary rollout, monitoring, and documented rollback.

**Acceptance criteria/tests.** Defined in `09-testing-strategy.md`; all P0 journeys pass in a production-like environment; rollback returns to Jinja pages and prior image without data loss.

**Dependencies.** All previous stages.

**Rollback.** Keep prior image and route switch; restore database/filesystem backup only for confirmed data migrations.
