# PRG32 Cartridge Store — Creator, Publishing & Review Architecture
## UI.7.4 Implementation Report

Date: 2026-10-16

## 1. Executive summary

UI.7.4 is complete for the authorized frontend workflow scope. Creator
submissions and drafts, publishing, and editorial review now have explicit
feature-owned boundaries. Server state remains in TanStack Query, wizard form
state remains local to the publishing feature, and the existing workflow API
boundary remains authoritative.

The refactor preserved submission identifiers and statuses, `esp32c6`/`qemu`
architecture values, multipart bundle upload, CSRF acquisition, cookie and
credential handling, workflow capability checks, review decision semantics and
query invalidation. No backend, database, infrastructure, authentication,
Fumadocs or operational behavior was changed.

## 2. Scope and compatibility policy

The repository was already heavily modified by earlier milestones. Those
changes were preserved; no reset, clean, generated-data cleanup or unrelated
refactor was performed.

Internal frontend component boundaries were changed as authorized for this
pre-release project. External contracts were not changed:

- Fastify workflow endpoints and response structures.
- CSRF and browser credentials behavior.
- Workflow RBAC capabilities and guard behavior.
- Submission and draft identifiers, states and transitions.
- Cartridge metadata and binary upload contracts.
- Firmware, WebSocket and runtime behavior.

No new dependency was introduced. No backend or deployment command was run.

## 3. Starting workflow architecture

Before UI.7.4, the workflow tree was:

```text
frontend/src/components/workflow/
├── DeveloperWorkspace.tsx
├── PublishingWizard.tsx
├── ReviewWorkspace.tsx
├── ReviewWorkspace.test.tsx
├── WorkflowGuard.tsx
└── DeveloperWorkspace.test.tsx
```

`DeveloperWorkspace` contained the creator shell, owned-submission query,
resubmission mutation, draft query, draft mutations and all draft controls.
`PublishingWizard` contained the step controller, file validation, upload
mutation and all four step views. `ReviewWorkspace` contained the queue query,
selected-detail query, metadata form, permission checks, confirmation dialogs,
decision mutations and invalidation.

The shared API layer was already a healthy boundary:
`frontend/src/lib/api/workflow.ts` owns endpoint paths, request methods,
multipart construction, CSRF acquisition, response validation and safe error
mapping. `frontend/src/lib/api/query-keys.ts` already owns the canonical
`workflowQueryKeys` and `reviewQueryKeys` factories.

## 4. Responsibility inventory

| Domain | Responsibility | Final owner |
| --- | --- | --- |
| Creator | Principal, eligibility and workspace composition | `creator/CreatorWorkspace.tsx` plus existing `WorkflowGuard` |
| Creator | Owned submission query and resubmission lifecycle | `creator/use-creator-submissions.ts` |
| Creator | Submission status, pagination and navigation | `creator/SubmissionList.tsx` |
| Creator | Draft query, create, attach, submit and delete mutations | `creator/use-creator-drafts.ts` |
| Creator | Draft list and file input controls | `creator/DraftList.tsx` |
| Publishing | Step-local form state and one-shot submission mutation | `publishing/use-publishing.ts` |
| Publishing | Client bundle validation and size formatting | `publishing/publishing-validation.ts` |
| Publishing | Four-step interaction surface | `publishing/PublishingSteps.tsx` |
| Review | Queue status filter and selection | `review/ReviewQueue.tsx` plus `review/use-review.ts` |
| Review | Selected submission query and decision lifecycle | `review/use-review.ts` |
| Review | Metadata, note, confirmation and decision controls | `review/ReviewSubmission.tsx` |
| Shared | Authentication, capability and integration guard | existing `WorkflowGuard.tsx` |
| Shared | Transport, Zod response contracts and CSRF | existing `lib/api/workflow.ts` |
| Shared | Query identity and invalidation prefixes | existing `lib/api/query-keys.ts` |

## 5. Healthy boundaries retained

The following components were intentionally not split:

- `WorkflowGuard.tsx`: it has one cohesive authorization/integration-guard
  responsibility and remains separate from `ProtectedRoute`.
- `PublishingWizard.tsx`: it remains the page-level guard/header/composition
  shell; step interaction moved to a feature-owned module, but no generic
  wizard engine was introduced.
- `ReviewWorkspace.tsx`: it remains the review page shell and guard boundary;
  queue/detail/decision ownership moved to the review feature modules.
- `workflow.ts`: it already provides a cohesive transport/API boundary and was
  not duplicated inside presentation components.
- `workflowQueryKeys` and `reviewQueryKeys`: existing canonical factories were
  reused without adding competing keys.

No split was made solely because of file length or JSX count. The extra
modules correspond to independent query/mutation lifecycles, file handling,
queue/detail ownership and review decision behavior.

## 6. SRP problems identified

The genuine problems were responsibility concentration rather than merely
large files:

- Creator server-state mutations and UI controls were coupled to workspace
  composition.
- Publishing validation and upload lifecycle were coupled to every step view.
- Review queue state, selected detail state and decision mutations shared one
  component-level controller.
- Review invalidation behavior was difficult to test independently from the
  full review surface.

The existing workflow API, guard and query factories did not exhibit the same
problem and were retained.

## 7. Final feature boundaries

```text
frontend/src/components/workflow/
├── DeveloperWorkspace.tsx                 # active import façade
├── PublishingWizard.tsx                   # page-level publishing shell
├── ReviewWorkspace.tsx                    # page-level review shell
├── WorkflowGuard.tsx                      # shared auth/capability guard
├── creator/
│   ├── CreatorWorkspace.tsx
│   ├── DraftList.tsx
│   ├── DraftList.test.tsx
│   ├── SubmissionList.tsx
│   ├── use-creator-drafts.ts
│   └── use-creator-submissions.ts
├── publishing/
│   ├── PublishingSteps.tsx
│   ├── PublishingWizard.test.tsx
│   ├── publishing-validation.ts
│   └── use-publishing.ts
└── review/
    ├── ReviewQueue.tsx
    ├── ReviewSubmission.tsx
    └── use-review.ts
```

`DeveloperWorkspace.tsx` is now a one-line active-import façade exporting
`CreatorWorkspace as DeveloperWorkspace`; no duplicate creator behavior
remains in the legacy-named file.

## 8. Creator workspace changes

`CreatorWorkspace` now owns only:

- principal loading and workflow-level states through the existing guard query;
- creator identity presentation;
- the creator capability check for `catalog:submit`;
- page state for the current submissions page;
- composition of drafts, submissions and navigation actions.

`useCreatorSubmissions` uses `workflowQueryKeys.mine(page)` and preserves the
existing `listMySubmissions(undefined, page, 25)` call. `SubmissionList`
preserves status labels, ownership wording, pagination and rejected-submission
resubmission behavior.

`DraftList` and `useCreatorDrafts` preserve canonical draft operations already
supported by the API: create, artifact attach, submit and delete. No autosave,
offline storage, localStorage persistence or new lifecycle state was added.

## 9. Draft management ownership

Draft responses remain server state in TanStack Query under
`workflowQueryKeys.drafts()`. Form/file interaction remains local to
`DraftList`; no draft data was moved into Zustand or another global store.

Mutation invalidation is explicit:

- create, attach and delete invalidate the draft list;
- draft submit invalidates drafts and the creator-owned submissions family;
- rejected-submission resubmission invalidates creator submissions and drafts.

The staged file remains a `File` passed to the existing
`attachDraftArtifact()` multipart API function. No artifact bytes are stored in
browser persistence.

## 10. Publishing wizard changes

`PublishingWizard` is now the guarded page shell. `usePublishing` owns only
the publishing interaction lifecycle:

- current step;
- selected `File` and client validation message;
- submit mutation and reset behavior;
- one-shot upload lifecycle.

`PublishingSteps` owns the existing four-step presentation and navigation:
Basics, Bundle, Server validation and Review. The original order, labels,
back/next behavior, loading state and completion feedback are preserved.

No generic wizard abstraction was introduced.

## 11. Step validation and form state

`publishing-validation.ts` preserves the existing client constraint:

- `.zip` filename requirement;
- 64 MiB client-side size limit;
- existing human-readable MiB formatting.

Server metadata parsing remains authoritative. The UI does not fabricate title,
version or architecture values. The selected file remains local React state;
there is no new global publishing store.

## 12. Artifact upload preservation

The publishing path still calls `submitBundle(file)` from
`lib/api/workflow.ts`. That function still:

- creates `FormData`;
- sends the field as `bundle` with the original filename;
- obtains and sends the workflow CSRF token;
- does not manually set a multipart boundary;
- validates the response through `workflowSubmissionResultSchema`;
- preserves the existing CSRF refresh behavior after a CSRF failure.

The draft attachment path likewise remains delegated to
`attachDraftArtifact()` and uses the existing multipart contract.

## 13. Submission lifecycle preservation

No client-side state machine was introduced. Existing backend-defined statuses
remain displayed as returned. The creator UI still presents verified,
rejected and pending review states, while publishing continues to report a
new submission as pending review rather than published.

Revision/resubmission remains a backend operation through
`resubmitSubmission()`. The frontend does not invent additional transitions or
promote rejected submissions locally.

## 14. Review workspace changes

`ReviewWorkspace` now owns only the page header, guard boundary and composition
of queue/detail features. `useReview` owns queue/detail queries, selection,
metadata form state, reviewer note state, capability-derived action state and
decision mutations.

`ReviewQueue` preserves pending/verified/rejected/all filters, queue loading,
empty and error states, selected-row styling and submission selection.

`ReviewSubmission` preserves the selected detail presentation, supported
metadata editing, architectures display, review history, confirmation dialogs,
approval/rejection loading states and decision feedback.

## 15. Review decision ownership

Approval continues to call:

```text
approveSubmission(id, metadata, note)
```

with the existing supported metadata fields and comma-separated tags converted
to the existing array payload. Rejection continues to call:

```text
rejectSubmission(id, note)
```

Both mutations have `retry: false`, preserve confirmation dialogs, remain
permission-scoped and do not use optimistic updates.

## 16. Query-key ownership

No inline workflow query identities were added. The refactor reuses:

- `workflowQueryKeys.principal()`;
- `workflowQueryKeys.mine(page)`;
- `workflowQueryKeys.mineRoot()`;
- `workflowQueryKeys.drafts()`;
- `reviewQueryKeys.queue(status)`;
- `reviewQueryKeys.submission(id)`;
- `workflowQueryKeys.submissionsRoot()`.

Response-affecting page and status values remain in the appropriate query
keys. Server state was not moved to Zustand.

## 17. Cross-domain invalidation

The actual dependencies are now explicit:

- Draft submission invalidates drafts and creator-owned submission lists.
- Rejected-submission resubmission invalidates creator-owned submissions and
  drafts.
- Review decisions invalidate the canonical submissions root, which covers all
  review queue filters and creator submission prefixes, plus the selected
  submission detail key.

No public catalog invalidation was invented because this frontend flow does not
currently establish a public-catalog query dependency for a review decision.
The existing query-key prefix behavior is tested by the review refetch test.

## 18. Workflow guards and RBAC

`WorkflowGuard` remains unchanged as the shared authentication/integration and
permission boundary. Creator submission eligibility still uses the backend
principal permission `catalog:submit`; review access still requires
`submissions:read`, with `submissions:review` and `submissions:reject` gating
the individual actions.

Frontend capability checks only control presentation. Backend authorization
remains authoritative.

## 19. CSRF and transport preservation

No direct `fetch` calls were added to workflow components. All reads and
mutations continue through `lib/api/workflow.ts`, which preserves:

- `/__workflow-fastify` proxy routing;
- request methods and endpoint paths;
- CSRF token acquisition and `X-CSRFToken` headers;
- browser credentials behavior inherited from the shared API client;
- Zod response validation;
- stable workflow error mapping.

## 20. Session and cache safety

Workflow responses remain in the QueryClient only. No localStorage, session
storage, Zustand persistence or second principal store was introduced.

The existing workflow CSRF cache and `clearWorkflowSessionState()` boundary
were not changed. Authentication cleanup remains owned by the UI.6/UI.7.3
auth modules. The workflow refactor does not duplicate identity state or alter
logout/session-expiry behavior.

## 21. Design-system reuse

The refactor continues using the UI.5 primitives `Button`, `Badge`,
`StatusMessage`, `Field` and `Textarea` where the touched surfaces require
them. The review metadata inputs now use the shared `Field`; the reviewer note
uses the shared `Textarea`; draft and publishing controls retain shared
`Button` and `StatusMessage` behavior.

No new palette, component library, decorative styling or dashboard redesign was
introduced.

## 22. Accessibility verification

Synthetic component tests and source verification cover:

- visible form labels and associated input ids;
- labelled publishing file input;
- labelled per-draft file inputs;
- review metadata labels and reviewer-note association;
- queue status and loading roles;
- error and decision feedback roles;
- disabled/loading states for mutations;
- keyboard-usable native buttons and file controls.

The existing semantic tokens and focus styles remain in use. No real browser
screen-reader session was performed in this milestone.

## 23. Responsive and visual verification

The existing responsive layout hierarchy was preserved:

- creator cards retain small-screen stacking and larger-screen row layouts;
- publishing steps retain the four-column breakpoint behavior;
- review queue/detail retain the existing single-column to two-column layout;
- workflow spacing, borders, surface tokens and compact controls remain in the
  approved UI.5 vocabulary.

Verification here is source-level and synthetic component verification. No
authenticated live browser acceptance was claimed, and no real submission or
review mutation was performed.

## 24. Legacy code removed

Removed from the workflow implementations:

- inline creator submission query and resubmission orchestration;
- inline draft query and four draft mutation definitions;
- inline publishing file validation and upload controller;
- inline review queue/detail/decision orchestration;
- duplicate local metadata conversion logic from the review page shell.

`DeveloperWorkspace.tsx` remains only as an active-import façade to
`CreatorWorkspace`; it contains no duplicated workflow logic. No unrelated
legacy code or modernization report was deleted.

## 25. Tests added or updated

Added:

- `creator/DraftList.test.tsx`: synthetic draft list and multipart attachment
  behavior.
- `publishing/PublishingWizard.test.tsx`: step navigation, ZIP selection and
  single `submitBundle()` invocation.

Updated:

- `ReviewWorkspace.test.tsx`: confirms approval still sends supported metadata
  and that the review queue refetches after a successful decision.

Existing creator ownership and review permission tests continue to pass. No
real credentials, artifacts, submissions or reviewer actions were used.

## 26. Validation commands and results

Node.js 24 was selected with nvm:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
```

Executed from `frontend/`:

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run test` | PASS — 49 files, 106 tests |
| `pnpm run build` | PASS — Next.js 16.4.0 production build |

Also executed:

| Command | Result |
| --- | --- |
| focused workflow Vitest run | PASS — 6 files, 12 tests |
| focused review invalidation test | PASS — 1 file, 2 tests |
| `git diff --check` | PASS |

The UI.7.3 baseline was 47 files and 104 tests. UI.7.4 adds two test files
and two tests, resulting in 49 files and 106 passing tests.

## 27. Files changed

Workflow implementation changes:

- `frontend/src/components/workflow/DeveloperWorkspace.tsx`
- `frontend/src/components/workflow/PublishingWizard.tsx`
- `frontend/src/components/workflow/ReviewWorkspace.tsx`
- `frontend/src/components/workflow/creator/CreatorWorkspace.tsx`
- `frontend/src/components/workflow/creator/DraftList.tsx`
- `frontend/src/components/workflow/creator/SubmissionList.tsx`
- `frontend/src/components/workflow/creator/use-creator-drafts.ts`
- `frontend/src/components/workflow/creator/use-creator-submissions.ts`
- `frontend/src/components/workflow/publishing/PublishingSteps.tsx`
- `frontend/src/components/workflow/publishing/publishing-validation.ts`
- `frontend/src/components/workflow/publishing/use-publishing.ts`
- `frontend/src/components/workflow/review/ReviewQueue.tsx`
- `frontend/src/components/workflow/review/ReviewSubmission.tsx`
- `frontend/src/components/workflow/review/use-review.ts`

Tests:

- `frontend/src/components/workflow/creator/DraftList.test.tsx`
- `frontend/src/components/workflow/publishing/PublishingWizard.test.tsx`
- `frontend/src/components/workflow/ReviewWorkspace.test.tsx`

Documentation:

- `docs/modernization/173-creator-publishing-review-architecture-ui-7-4.md`

`WorkflowGuard.tsx` was already modified in the pre-existing dirty worktree;
it was inspected and not changed by UI.7.4.

## 28. Remaining workflow debt

- Authenticated browser acceptance for creator, publishing and review remains
  open and requires explicitly authorized identities and disposable data.
- Live responsive and visual checks at 375, 768, 1024, 1440 and 1920 pixels
  were not performed in this source-only milestone.
- Review and creator detail routes remain limited to the backend contracts
  currently exposed; no new detail route was invented.
- Operational cutover, real migration and Flask retirement remain outside
  scope.

## 29. Frontend architecture readiness

The workflow frontend is ready for further feature work at the source and
synthetic-test level. Domain ownership is explicit, API/Zod boundaries remain
centralized, and mutation invalidation is testable without a global workflow
controller.

This is not approval for operational migration or authenticated live acceptance.

## 30. Next milestone recommendation

The next milestone should address only the next approved frontend domain and
should continue consuming the existing frozen backend contracts. If workflow
acceptance is prioritized, add an explicitly authorized disposable authenticated
browser run for creator submission, draft lifecycle and review decisions before
considering operational use.

## 31. Decision markers

```text
UI74_CREATOR_BOUNDARIES_GO
UI74_DRAFT_OWNERSHIP_GO
UI74_PUBLISHING_BOUNDARIES_GO
UI74_REVIEW_BOUNDARIES_GO
UI74_SUBMISSION_LIFECYCLE_GO
UI74_UPLOAD_CONTRACT_GO
UI74_QUERY_OWNERSHIP_GO
UI74_INVALIDATION_GO
UI74_WORKFLOW_RBAC_GO
UI74_CSRF_TRANSPORT_GO
UI74_SESSION_CACHE_SAFETY_GO
UI74_ACCESSIBILITY_GO
UI74_RESPONSIVE_GO
UI74_LEGACY_CLEANUP_GO
UI74_FRONTEND_REGRESSION_GO
UI74_WORKFLOW_ARCHITECTURE_GO
```

The GO markers are limited to source-level and synthetic frontend verification.
They do not claim authenticated browser acceptance or operational readiness.

Preserved status markers:

```text
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 32. Final decision

```text
UI74_WORKFLOW_ARCHITECTURE_GO
```

UI.7.4 is complete within its authorized frontend scope. No commit or push was
performed.
