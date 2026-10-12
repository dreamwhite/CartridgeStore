# PRG32 Cartridge Store modernization plan

Status: historical baseline. This document records the repository audit
performed on 2026-10-12. Current implementation and remediation status is
tracked in `11-implementation-roadmap.md`, `14-phase1-implementation-report.md`,
and `15-m0-remediation-report.md`. The original Vite/React Router proposal is
superseded by the approved Next.js App Router decision; the historical text is
retained for traceability.

## A. Current state

Cartridge Store is a single Flask application created by `cartridge_store.app.create_app()` and exported as `app:app` by [app.py](../../app.py:1). It renders Jinja HTML pages, serves a small vanilla JavaScript PWA shell, exposes catalog/publishing/authentication/statistics/score/metrics APIs, and hosts a Flask-Sock WebSocket relay. The runtime is Python 3.13 in Docker, Gunicorn on port 5080 ([Dockerfile](../../Dockerfile:1)).

Cartridge artifacts are stored on the filesystem under `PRG32_STORE_DATA`; the catalog index is `index.json`, while service data is SQLite. The database is selected by `PRG32_STORE_DB`, with legacy score/metrics fallbacks ([cartridge_store/app.py](../../cartridge_store/app.py:103)). The catalog is versioned by metadata `id` and `version`, with `esp32c6` and `qemu` variants ([cartridge_store/store.py](../../cartridge_store/store.py:75), [cartridge_store/prg32_format.py](../../cartridge_store/prg32_format.py:33)).

## B. Key findings

1. The existing backend has meaningful functionality and test coverage: the
   original 39-test baseline covered format parsing, publishing/review, auth
   roles/tokens, scores, metrics, multiplayer, mDNS, stats, backup/restore,
   and page rendering. The remediation suite now provides 53 passing tests
   ([tests](../../tests)). A rewrite would discard working compatibility behavior.
2. The frontend is server-rendered and intentionally small: 24 Jinja templates, one service-worker-backed PWA shell, one six-line application script, and one global stylesheet ([templates](../../templates), [static/app.js](../../static/app.js:1)). It is responsive but has no React component system, typed client models, dark theme, or client-side data cache.
3. The most important security gaps are a deterministic bootstrap administrator credential documented in the repository and missing CSRF protection for cookie-authenticated mutations. Uploads have byte limits and format validation, but ZIP expansion limits, rate limiting, explicit session-cookie policy, and comprehensive security headers are not evidenced.
4. The catalog index and SQLite review/service records are separate stores. Writes are mostly atomic at the individual file/index level, but there is no cross-store transaction, formal migration runner, or concurrency strategy for multiple writers ([store.py](../../cartridge_store/store.py:64), [review.py](../../cartridge_store/review.py:305)).
5. React + TypeScript is justified for a progressive frontend replacement, and
   the approved implementation uses Next.js App Router rather than the
   earlier Vite/React Router proposal. Zustand should own local UI state;
   TanStack Query should own API/server state. Drizzle is compatible with
   SQLite, but it is useful only if the backend is also moved to TypeScript;
   adding it beside the Python backend would create a second database access
   layer without a clear benefit.

## C. Recommended architecture

Retain the Python backend and public contracts first. Add a separately built React/TypeScript frontend that consumes the current APIs, initially mounted behind the same origin or a reverse-proxy path. Keep filesystem cartridge storage and SQLite until a measured scale or operational requirement justifies a change. Introduce a typed API client and runtime response validation in the frontend, without changing wire shapes.

Use feature-oriented frontend modules (`catalog`, `cartridges`, `publishing`, `authentication`, `statistics`, `scores`, `metrics`, `admin`) and a small shared UI system. Use Next.js App Router for navigation. Use Zustand for theme, navigation, and temporary form state; use TanStack Query for catalog, auth, stats, submission, and run data.

Do not introduce Drizzle in the first frontend milestones. If a future decision selects a TypeScript backend, use Drizzle against the existing SQLite file only after schema introspection, backup/restore rehearsal, and a compatibility test suite. Do not migrate engines or identifiers as part of the frontend modernization.

## D. Python vs TypeScript backend

| Criterion | Preserve Python | Migrate to TypeScript |
| --- | --- | --- |
| Reuse | Reuses Flask routes, PRG32 parser, upload/review code, auth adapters, and tests | Requires porting all of them, including binary format logic |
| Compatibility risk | Low if API responses remain stable | High during route, session, WebSocket, and error-shape parity work |
| Delivery effort | Frontend can ship incrementally | Backend and frontend become coupled to a larger rewrite |
| Runtime consistency | Two frontend/backend languages | One application language, but new server operational surface |
| Database/Drizzle | Keep direct SQLite access and existing schema | Drizzle becomes a useful typed access layer |
| Recommendation | **Preferred now** | Reconsider only with a separately funded backend migration |

## E. Drizzle assessment

The current engine is SQLite, not an unknown relational service: tables are created in [auth](../../cartridge_store/auth/__init__.py:44), [metrics](../../cartridge_store/metrics.py:18), [stats](../../cartridge_store/stats.py:20), [scores](../../cartridge_store/scores.py:13), [review](../../cartridge_store/review.py:19), and [settings](../../cartridge_store/settings.py:13). Drizzle supports SQLite drivers and migration generation, but a Node/TypeScript process cannot safely become a second writer to the same schema by preference alone. The correct decision is “defer”; preserve Python SQL and formalize migrations in Python first, or adopt Drizzle only with a TypeScript backend boundary and a rehearsed migration plan.

## F. UI/UX direction

Use a calm technical storefront: purple accent, neutral surfaces, readable sans-serif typography, compact metadata chips, high-contrast controls, and restrained pixel-art references. Provide light/dark themes, responsive navigation, keyboard-visible focus, reduced-motion behavior, and mobile-first catalog/detail layouts. Do not show ratings, categories, drafts, or release history unless backed by existing data or explicitly approved as new functionality.

## G. Migration roadmap

1. Baseline and contract freeze.
2. Security prerequisites: bootstrap-admin remediation, CSRF, cookie policy, upload and metrics bounds, and protected metrics exports.
3. React/Vite/TypeScript shell and design tokens.
4. Read-only catalog and detail parity.
5. Authentication and token flows.
6. Publishing/review and developer/admin workflows.
7. Scores, statistics, metrics, and documentation views.
8. Production hardening, accessibility, E2E, performance, and rollout rehearsal.
9. Optional backend/Drizzle evaluation only after evidence supports it.

## H. Critical risks

The release gate must cover authentication regressions, CSRF, upload decompression/resource exhaustion, broken binary downloads, catalog/index consistency, exposed metrics data, backup confidentiality, and API response drift. Every stage should support rollback by keeping the Flask pages and API available until React parity is demonstrated.

## I. Open questions

- Is the public deployment behind HTTPS and a reverse proxy, and does it differ from this checkout?
- Should metrics ingestion and run exports remain anonymous for firmware compatibility, or can a token be required for new clients?
- Is the current SQLite/file-store architecture expected to support multiple Gunicorn workers or only classroom-scale single-instance operation?
- Are ratings, categories, drafts, source browsing, and changelogs desired product features, or only visual concepts?
- Is a TypeScript backend a strategic requirement, or is TypeScript limited to the frontend?

## J. Approval gate

**Repository audit and modernization planning completed. No application implementation has been performed. Awaiting approval to begin the first implementation milestone.**
