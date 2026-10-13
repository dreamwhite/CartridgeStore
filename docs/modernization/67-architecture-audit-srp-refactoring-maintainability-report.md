# PRG32 Cartridge Store — Architecture Audit, SRP Refactoring & Maintainability Report

Date: 2026-10-13
Scope: active TypeScript backend and Next.js frontend
Milestone: post-M6.3d.2h.11, before M6.3d.2h.12

## Executive decision

The active TypeScript/Next.js foundation is suitable for incremental delivery.
This batch is **GO for the limited refactoring performed** and **not a rewrite**.
The public HTTP contracts, firmware-facing payloads, WebSocket boundary, binary
artifacts, authentication, OIDC/SAML behavior, SQLite access, Docker profiles,
and local development workflow were left unchanged.

The historical M6.3d.2h.11 browser acceptance remains **NO-GO/NOT VERIFIED**
as recorded in report 66. Per the explicit project decision, Playwright,
disposable Authentik browser fixtures, and the `authentik-e2e` Compose profile
are removed from the active workflow. Backend/API evidence is authoritative for
this batch; M6.3d.2h.12 was not started.

## Baseline and constraints reviewed

- `docs/modernization/19-revised-migration-roadmap.md` was reviewed as the
  current roadmap. Its earlier browser-gate history is preserved and a later
  scope-reduction note records the backend-only decision.
- Report 66 was reviewed. Dream TLS and ordinary development integration were
  previously recovered, but OIDC/SAML browser callbacks and cookies were not
  verified.
- The working tree was already substantially dirty from the migration. No
  unrelated changes were reset, staged, committed, or pushed.
- The sibling `../PRG32` repository was inspected only for status and was not
  modified. Its pre-existing untracked files remain untouched.
- Node 24 was used locally through `nvm use 24` (v24.20.0) with pnpm 12.5.1.

## Hotspot inventory

Priority means architectural risk and maintenance cost, not a claim that the
current implementation is functionally broken. The committed history contains
only one committed change for several newly introduced files; uncommitted
migration work cannot support a reliable change-frequency statistic. That
limitation is recorded rather than inferred away.

| Priority | Area and evidence | Responsibility/coupling | Test evidence | Risk and proposed boundary |
|---|---|---|---|---|
| P0 | No new P0 implementation blocker found. The unresolved browser federation gate is a roadmap acceptance issue, not a reason to alter protocol code here. | — | Backend OIDC/SAML/federation tests pass; browser gate remains historical NO-GO. | Keep browser acceptance separate from backend contract verification. |
| P1 | `backend/src/app.ts` is 273 lines and composes databases, auth, secrets, every service, every route, parsers, CORS, health, errors, and shutdown. | High fan-in composition root; changes can affect every API surface. | `backend/tests/app.test.ts`, full backend suite, OIDC/SAML/federation suites. | Extract composition-only runtime factories first; leave route/error semantics stable. |
| P1 | `backend/src/consistency/publication.ts` is 1,339 lines. | Mixes filesystem publication, SQLite journal state, crash recovery, reconciliation, and variant operations. | `backend/tests/consistency.test.ts`, catalog/review tests. | Preserve as a transactional boundary for now; later split only with characterization tests. |
| P1 | `backend/src/backup/service.ts` is 751 lines alongside archive/format/routes modules. | Backup inventory, export/import orchestration, encryption/key policy, and recovery are coupled. | `backend/tests/backup.test.ts`. | Keep the service boundary; later separate archive I/O from policy/orchestration. |
| P1 | Federation stack: provider 514 lines, admin routes 400, OIDC 393, SAML 375. | Provider persistence, secret/certificate policy, transactions, protocol validation, and admin routes are security-sensitive. | OIDC, SAML, federation foundation/admin/lifecycle tests. | No protocol refactor now; future repository/transaction/protocol adapter seams need contract tests. |
| P1 | `frontend/src/components/federation/FederationWorkspace.tsx` contains overview, list, form, create, detail, certificates, and identity-link screens. | Multiple feature screens share API/query/authentication concerns. | Existing frontend API and guard tests; no active browser E2E. | Extract feature-owned hooks/presentational pieces incrementally. |
| P2 | `backend/src/config/env.ts` is 513 lines. | Environment parsing, defaults, validation, and security policy are centralized but broad. | Indirectly exercised by the backend suite. | Preserve one canonical parser; split only after focused config tests. |
| P2 | Admin service/routes are 448/395 lines; frontend admin workspace/API are 183/267. | Admin use cases, HTTP shaping, UI state, and adapters are feature-dense. | Admin, authorization, and frontend suites. | Split by resource only when a second consumer or concrete change seam exists. |
| P3 | Small route modules and UI controls are generally narrow. | Low coupling and existing test seams. | Full suites. | Avoid churn; refactor only when a concrete boundary problem appears. |

## Refactoring implemented

### Backend federation runtime composition

Added `backend/src/federation/runtime.ts` and replaced the inline federation
construction in `backend/src/app.ts` with `createFederationRuntime(...)`.
The factory preserves the exact existing gate:

```text
auth.isWriteEnabled() && config.authSessionSecret
```

It creates the same provider, identity, transaction, OIDC, SAML, operations,
and audit objects with the same constructor arguments, returning `null` under
the same read-only/session-disabled conditions. This is a composition boundary,
not a new service abstraction.

### Frontend sensitive-action hook

Added the feature-owned
`frontend/src/components/federation/use-sensitive-actions.tsx` hook and removed
the duplicate inline hook from `FederationWorkspace.tsx`. Pending actions,
re-authentication mutation, dialog state, cancellation, and error behavior are
unchanged. No generic UI or auth framework was introduced.

## Explicitly rejected in this batch

- No split or rewrite of publication consistency, backup, configuration,
  authentication, OIDC, SAML, or federation provider services.
- No API response, identifier, database schema, binary format, WebSocket,
  firmware contract, or production routing changes.
- No Flask removal or M6.3d.2h.12 work.
- No Playwright runner, browser fixture, Authentik instance, or persistent
  `https://sso.dream.test` access.
- `docker compose --profile authentik-e2e config --quiet` is intentionally not
  applicable because that profile was removed by explicit project direction.

## Verification evidence

All Node commands used Node 24 via `nvm use 24`.

| Check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 26 files, 132 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 10 files, 29 tests |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| Plain frontend build without `FLASK_PROXY_TARGET` | Expected guard failure; rerun with the required proxy target passed |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `python3 -m pytest -q` | NOT RUN — pytest is not installed in the active system Python (`No module named pytest`); no Python dependency was installed for this TypeScript-focused batch |
| Active code/config search for E2E references | PASS — none; optional peer metadata remains in the frontend lockfile |

The frontend test command emits an existing Vite `configLoader: native` warning;
it does not fail the suite.

## Remaining risks and next milestone

1. The federation browser callback/cookie path is still not verified. This is
   intentionally carried as a separate historical risk, not hidden by backend
   unit tests.
2. The largest backend modules need characterization before deeper SRP splits.
   Publication and backup are the highest-value candidates after dedicated
   failure-mode tests exist.
3. The current dirty tree contains prior milestone work. A clean review branch
   or commit boundary would improve auditability, but was outside this request.
4. The next authorized maintainability milestone should add focused
   publication/backup characterization tests, then split one orchestration seam
   at a time. Do not begin M6.3d.2h.12 as part of this report.

## Rollback considerations

The two implementation changes are isolated and reversible: restore the
federation construction block in `app.ts` and inline the small hook in
`FederationWorkspace.tsx`. They require no database migration, data conversion,
dependency change, deployment action, or rollback script.
