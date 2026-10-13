# PRG32 Cartridge Store — Next.js Storefront M2

Date: 2026-10-14
Status: **GO for the isolated frontend implementation; NO-GO for operational
Fastify cutover or Flask retirement**

## Executive result

The Next.js application now contains the M2 developer workspace, publishing
wizard, and editor review workspace. These surfaces use only the already
implemented isolated Fastify contracts. They do not write to Flask, read
SQLite, duplicate Flask business logic, or fabricate a private-submission API.

The implementation distinguishes the isolated workflow being unavailable, a
principal lacking permission, and the backend not exposing an ownership-scoped
“my submissions” contract. The default Compose development stack leaves the
M2 workflow target empty, preserving Flask as the operational owner. To
exercise the disposable Fastify writer locally, set
`PRG32_WORKFLOW_FASTIFY_TARGET=http://auth-writer:5090` for the dev profile.

## Contract and ownership matrix

| UI action | Route used | Owner in M2 | Authorization boundary |
| --- | --- | --- | --- |
| Load workflow principal | `GET /auth/me` | isolated Fastify | authenticated session or bearer context |
| Obtain mutation CSRF | `GET /auth/csrf` | isolated Fastify | isolated session |
| Submit a ZIP bundle | `POST /api/publish/bundle` | isolated Fastify submission service | `catalog:submit` plus session CSRF |
| List editor submissions | `GET /api/submissions?status=` | isolated Fastify review service | `submissions:read` |
| Load editor submission detail | `GET /api/submissions/<id>` | isolated Fastify review service | `submissions:read` |
| Approve with supported metadata | `POST /api/submissions/<id>/verify` | isolated Fastify review service | `submissions:review` plus session CSRF |
| Reject submission | `POST /api/submissions/<id>/reject` | isolated Fastify review service | `submissions:reject` plus session CSRF |

The frontend uses a same-origin Next rewrite at `/__workflow-fastify/*` and
does not expose the backend target to browser code. Response envelopes and
submission identifiers are validated with Zod. Mutations use the Fastify CSRF
contract, never store CSRF in localStorage, do not retry, and do not apply
optimistic state. Flask remains the operational owner of the legacy publish
and review routes, catalog publication, and production data. There is no
fallback from the isolated workflow routes to Flask.

## Developer workspace

`/workspace` shows the authenticated isolated principal, role, groups, and
effective permissions. It links to the real publishing surface and catalog.
It explicitly reports that a private ownership-scoped submission list is
unavailable because neither Flask nor isolated Fastify exposes one. The UI
therefore never calls the editor-only global list for a normal developer and
cannot disclose other developers’ submissions.

Loading, unauthenticated, unauthorized, unavailable, and backend-error states
are explicit. No local mock cartridges, status transitions, or ownership data
were added.

## Publishing wizard

`/publish` is a four-step guided flow: explain the authoritative bundle
manifest, select one ZIP, display bounded client-side filename/size checks,
and confirm one submission. The client limit is 64 MiB, matching the isolated
backend default, but the backend remains authoritative. The browser does not
parse, extract, re-pack, or base64-encode the archive. A successful response
displays the existing `pending`, `submission_id`, `version`, and `submitted`
fields and explicitly states that publication is not automatic.

## Review workspace

`/review` is gated by `submissions:read`. Editors can filter pending, verified,
rejected, and all submissions, inspect the real detail record, and edit only
metadata fields accepted by the existing approval contract: title, summary,
description, tags, license, homepage, and repository. Identity, version,
authors, and architectures are read-only. Approve and reject are explicit
confirmed actions followed by query invalidation after the backend response;
there is no optimistic mutation or automatic retry.

Non-editors receive an authorization state and no submission data. Raw backend
exception text is not rendered; stable messages are used for authorization,
CSRF, not-found, conflict, payload-size, and service-availability failures.

## Files created or modified for M2

Created: `frontend/src/app/workspace/page.tsx`,
`frontend/src/app/publish/page.tsx`, `frontend/src/app/review/page.tsx`,
`frontend/src/components/workflow/WorkflowGuard.tsx`,
`frontend/src/components/workflow/DeveloperWorkspace.tsx`,
`frontend/src/components/workflow/PublishingWizard.tsx`,
`frontend/src/components/workflow/ReviewWorkspace.tsx`,
`frontend/src/lib/api/workflow.ts`, `frontend/src/lib/api/workflow.test.ts`,
and this report.

Modified: `frontend/next.config.ts` (optional development-only workflow
rewrite and production guard), frontend API contracts/schemas, the app shell
navigation, `docker-compose.yml` (optional dev-only target variable), and the
modernization roadmap.

No backend source, database schema, production routing, Flask route,
authentication behavior, firmware contract, `../PRG32`, deployment, or
production data was modified for M2.

## Verification evidence

Node checks used `nvm use 24`, Node `24.20.0`, and the repository pnpm
lockfiles.

| Check | Result |
| --- | --- |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 13 files, 38 tests |
| `FLASK_PROXY_TARGET=http://backend:5080 pnpm --dir frontend run build` | PASS — `/workspace`, `/publish`, `/review` |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 27 files, 138 tests |
| `pnpm --dir backend run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret .local/python3.13-venv/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

The dev containers were not all healthy: Flask and Next were up/healthy,
while the pre-existing disposable `auth-writer` and edge proxy were
unhealthy because their bind-mounted backend dependency cache was stale
(`@fastify/websocket` was unavailable). This prevents claiming a live
publishing/review smoke in the default stack. It is an environment/cache
issue, not a frontend test result, and was not repaired in this milestone.

## Remaining risks and acceptance decision

- Fastify workflow storage remains disposable and is not the public operational
  publication/review owner.
- The default dual-origin session arrangement requires deliberate local
  workflow-target configuration before browser publishing/review can be
  exercised end to end.
- There is no ownership-scoped submissions endpoint. Adding one is a backend
  contract milestone, not a frontend workaround.
- Playwright/browser E2E and Authentik lifecycle verification remain out of
  scope by project direction.

**GO for isolated Storefront M2 frontend code and contract integration.**
**NO-GO for Flask retirement, public Fastify workflow routing, deployment, or
production data.** The next milestone should authorize an ownership-scoped
submission contract and repair/rehearse the disposable writer environment, or
select another explicitly authorized storefront surface. Do not define or
start `M6.3d.2h.12` automatically.
