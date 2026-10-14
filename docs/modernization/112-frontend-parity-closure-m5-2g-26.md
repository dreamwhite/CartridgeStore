# PRG32 Cartridge Store — M5.2g.26 Frontend Parity Closure & Canonical Workflow Completion

Date: 2026-10-14  
Milestone: M5.2g.26  
Application decision: `PARTIAL_GO_FOR_DISPOSABLE_IMPLEMENTATION`  
Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`  
Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive result

The isolated Next.js storefront and Fastify canonical workflow now include the
missing publisher lifecycle foundations identified by M5.2g.25:

- username/password registration requests with one-time email completion;
- password change and password-reset request/completion contracts and UI;
- a dependency-light email transport boundary with disposable memory delivery
  and explicit SMTP configuration;
- durable canonical publisher drafts with staged ZIPs;
- restart recovery for draft submission state;
- reviewer notes and persisted decision history;
- rejected-submission revision lineage and publisher resubmission;
- a browser acceptance scenario covering draft creation, rejection, revision
  and approval.

The implementation is verified against disposable SQLite/object-storage roots.
The candidate two-service Docker runtime also built and served successfully.
This is not an operational cutover authorization: real deployment ownership,
production email delivery, persistent Authentik behavior, Dream Traefik
routing, migration of operational data and rollback policy remain open.

## 2. Scope and safety boundary

This milestone changed only the isolated TypeScript/Fastify and Next.js
implementation and its disposable tests. No Flask route was removed, no Flask
database or object store was opened for mutation, no operational Compose file
was changed, and no persistent Authentik resource was modified. The real
federation resources from M5.2g.23/M5.2g.24 remain preserved:

- `prg32-m52g23-oidc-fcb61d`;
- `prg32-m52g23-saml-fcb61d`;
- `prg32-m52g23-fcb61d`.

All local Node commands selected Node.js 24 through `nvm use 24`. Disposable
browser and container fixtures use synthetic credentials and data only.

## 3. Implemented backend boundaries

### Authentication and email

`backend/src/email/service.ts` defines a transport-neutral email boundary.
The supported modes are:

| Mode | Purpose | Operational status |
|---|---|---|
| `memory` | deterministic disposable/test delivery | verified in backend tests and browser fixture configuration |
| `smtp` | dependency-light plain/TLS SMTP delivery with optional AUTH PLAIN | configuration boundary implemented; real provider delivery not verified |
| `disabled` | fail-closed non-delivery mode | default outside test mode |

The auth service now stores only token digests, uses bounded expiry and
one-time consumption, invalidates sessions after password changes/resets, and
returns generic password-reset behavior for unknown or ineligible identifiers.
Registration completion preserves the legacy email-only contract while also
supporting username/password registration. The test-only email inspection
endpoint is available only in `authWriteMode=test` and requires the exact
disposable bootstrap header.

New environment controls are parsed in `backend/src/config/env.ts`:

- `PRG32_BACKEND_EMAIL_TRANSPORT`;
- `PRG32_BACKEND_EMAIL_FROM`;
- `PRG32_BACKEND_EMAIL_PUBLIC_ORIGIN`;
- `PRG32_BACKEND_EMAIL_SMTP_HOST`;
- `PRG32_BACKEND_EMAIL_SMTP_PORT`;
- `PRG32_BACKEND_EMAIL_SMTP_USER`;
- `PRG32_BACKEND_EMAIL_SMTP_PASSWORD`.

No credentials or message bodies are written to the report or logs.

### Canonical workflow

`backend/src/storage-v2/drafts.ts` and the draft route boundary implement
publisher-owned draft persistence under the canonical storage root:

- database rows are authoritative for draft identity/status/ownership;
- staged ZIPs are written below `storage/staging/drafts/` with restrictive
  permissions and atomic temporary-file promotion;
- ZIP parsing and PRG32 validation reuse the existing submission parser;
- `submitting` drafts recover to `draft` on process restart;
- a failed submission does not publish a partial release;
- delete marks the record abandoned and removes only that draft's staged file;
- draft routes require authentication, `catalog:submit` and CSRF for writes;
- owner checks prevent cross-user draft access.

The canonical schema receives additive application migrations only when the
canonical `submissions` table exists. The legacy auth-only schema is not
silently expanded during ordinary startup. Added fields/tables cover password
reset tokens, publisher drafts and immutable rejected-submission revision
lineage.

### Review and revision lineage

Reviewer approval and rejection accept an optional bounded note. Notes are
stored in the existing review-decision history rather than a second journal.
Submission detail exposes history to reviewers and to the owning publisher.

The resubmission contract is:

```text
POST /api/submissions/<submission_id>/resubmit
        -> owner-scoped draft with source_submission_id
POST /api/drafts/<draft_id>/artifact
POST /api/drafts/<draft_id>/submit
        -> new pending submission with revision_of_submission_id/revision_number
```

Rejected submissions remain immutable history. A revision is a new submission,
not an in-place mutation of the rejected record. The backend verifies that the
source belongs to the current publisher and is rejected before creating the
revision draft.

## 4. Frontend implementation

The Next.js boundary now includes:

- registration fields for username, email and password confirmation;
- registration-completion token handling;
- `/forgot-password` and `/password-reset` pages;
- account password-change UI with session-invalidation feedback;
- durable draft list/create/attach/submit/delete controls in the developer
  workspace;
- publisher-visible rejected state and `Revise and resubmit` action;
- reviewer note input and persisted decision-history rendering;
- candidate production proxy coverage for `/api/drafts`, submission review
  and resubmission requests.

The UI remains a client of Fastify contracts. It does not duplicate Flask
business logic and does not use Flask as a fallback for the new workflow.

## 5. Browser acceptance

The final Playwright run used the existing synthetic HTTPS dual-origin harness,
isolated SQLite data and synthetic OIDC/SAML providers:

```text
12 passed (44.1s)
```

The run includes the previous catalog, auth, CSRF, OIDC, SAML, WebSocket,
statistics, scores, metrics, account, administration and publication scenarios,
plus the new canonical workflow scenario:

```text
draft creation -> ZIP attachment -> pending submission -> reviewer note
-> rejection -> owner-visible rejected state -> revision draft
-> revised ZIP attachment -> resubmission -> approval
```

The browser harness explicitly sets `PRG32_BACKEND_EMAIL_TRANSPORT=memory`.
It does not exercise a real SMTP provider or real Authentik credentials.

## 6. Candidate Docker verification

The candidate file `deploy/candidate/compose.yaml` was inspected and verified
without touching operational Compose. The candidate contains exactly two
application services:

- `fastify`, listening internally on 5090 and using the disposable canonical
  root;
- `next`, listening internally on 3000 and proxying API requests to Fastify.

Both images were built from Node 24 slim multi-stage Dockerfiles:

```text
prg32-cartridge-store-fastify:candidate  Built
prg32-cartridge-store-next:candidate     Built
```

The disposable container run verified:

- canonical schema tuple `2 / 2 / 1 / 3` initialization;
- Fastify `/health`;
- Fastify `/ready` with canonical storage and writer lease available;
- Next `/health` after startup readiness;
- Next same-origin `/api/games` proxy;
- disposable local auth bootstrap;
- candidate Compose service health and port bindings.

The first probe against Next occurred during its startup window and reset the
connection; the bounded readiness retry then passed. This is recorded as a
startup-observation issue, not as a failed final candidate verification.
The candidate containers were brought down after the disposable check. No
operational containers, images, networks or volumes were removed.

## 7. Compatibility evidence

Existing firmware-facing and legacy-compatible backend tests remain green.
The implementation preserves the existing route families and response
contracts, adding optional fields for workflow revision/history data. The
existing canonical IDs and architecture values remain unchanged. No SQLite
schema migration was applied to operational data.

The following are verified by the current suites:

- local auth/session/CSRF compatibility;
- owner-scoped submission and metrics access;
- review approval/rejection behavior;
- exact canonical object handling and publication consistency;
- canonical readiness and candidate runtime boundaries;
- existing firmware, multiplayer and federation contract suites.

## 8. Tests and commands

All commands below completed successfully on Node.js 24 where applicable:

| Check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | pass |
| `pnpm --dir backend run lint` | pass |
| `pnpm --dir backend run build` | pass |
| `pnpm --dir backend run test` | 49 files, 246 tests passed |
| `pnpm --dir frontend run typecheck` | pass |
| `pnpm --dir frontend run lint` | pass |
| `pnpm --dir frontend run test` | 22 files, 65 tests passed |
| `pnpm --dir frontend run build` | pass; Next routes include `/forgot-password` and `/password-reset` |
| `pnpm --dir frontend run test:e2e` | 12 tests passed |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | 64 passed |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | pass |
| candidate multistage image build | pass |
| disposable candidate health/proxy/bootstrap check | pass |
| `git diff --check` | pass |

The backend test output contains expected warning logs for negative catalog
cases; they did not fail the suite.

## 9. Files changed for this milestone

The worktree already contains broad uncommitted changes from earlier
modernization milestones. The M5.2g.26 implementation specifically extends
the following areas:

- backend application migrations, config, app wiring, auth routes/service and
  email service;
- canonical storage-v2 workflow, draft service/routes/endpoints and review
  note/revision handling;
- frontend auth API/contracts/schemas and registration/reset/account UI;
- frontend developer/reviewer workflow components and API client;
- candidate Next proxy configuration;
- Playwright global fixture configuration and
  `frontend/e2e/m52g25.spec.mjs`;
- `backend/tests/auth.test.ts`,
  `backend/tests/canonical-workflow-http.test.ts` and the frontend workspace
  test mock.

Exactly one new Markdown report is created by this milestone:
`docs/modernization/112-frontend-parity-closure-m5-2g-26.md`.

No commit or push was performed. The roadmap was not rewritten in this
milestone.

## 10. Remaining gaps and blockers

The isolated implementation is materially complete for the requested
publisher workflow, but the following keep the operational gates closed:

1. SMTP delivery has not been verified against the approved production mail
   provider; `memory` is disposable-only.
2. The real Authentik resources were preserved, but no operational provider
   configuration or credential was changed or revalidated here.
3. The candidate Compose file is not the operational Compose file. Dream
   Traefik, DNS, TLS, external networks and the actual `store.prg32.dream.test`
   / `api.prg32.dream.test` edge remain outside this authorization.
4. Operational SQLite/object-storage migration and single-writer handover have
   not occurred.
5. Session continuity, telemetry reconciliation, WebSocket/mDNS ownership and
   rollback data-loss policy remain cutover gates.
6. Browser verification covers the critical user workflows, but not every
   administrative mutation, SMTP delivery, backup UI or multi-page dataset.
7. Flask templates and runtime remain intentionally present and authoritative
   for the current deployment.

## 11. Recommended next milestone

The next milestone should be separately authorized as an operational
acceptance gate, not inferred from this implementation. It should verify the
approved production mail transport, final Dream edge configuration, session
continuity, real operational storage snapshot, writer quiescence, migration
reconciliation and an explicit rollback data-loss decision. It must not remove
Flask or alter operational routing until those gates are independently closed.

## 12. Final decisions

| Decision | Result |
|---|---|
| Disposable Next.js/Fastify frontend parity implementation | `PARTIAL_GO_FOR_DISPOSABLE_IMPLEMENTATION` |
| Disposable canonical publisher/reviewer workflow | `GO` |
| Candidate two-service Docker verification | `GO` |
| Production SMTP/provider readiness | `NO-GO` |
| Operational cutover | `OPERATIONAL_CUTOVER_NO_GO` |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` |

The milestone stops here. No M5.2g.27, operational cutover, Flask removal,
deployment, commit or push was started.
