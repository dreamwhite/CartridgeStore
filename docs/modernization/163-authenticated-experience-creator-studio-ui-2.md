# PRG32 Cartridge Store — Authenticated Experience & Creator Studio UI.2

## 1. Executive summary

UI.2 redesigns the authenticated frontend surfaces that already existed in the repository. The implementation is frontend-only and preserves the existing Next.js routes, API client methods, CSRF handling, session queries, permission checks, redirects, and workflow invalidation rules.

Implemented surfaces:

- Login, registration, registration completion, password recovery, and passkey entry points.
- Account security workspace for password, API tokens, passkeys, and re-authentication.
- Public profile and protected run views.
- Role-aware account, creator, review, and administration navigation.
- Creator Studio ownership view, drafts, staged bundle attachment, submission history, and resubmission.
- Cartridge publishing wizard with client-side ZIP checks and server-side validation handoff.
- Review queue, submission detail, editable supported metadata, review notes, approval, rejection, and decision history.

The UI implementation is complete for the supported workflow contract. Real authenticated browser acceptance is not claimable in this environment because the configured authentication service was unavailable during observation.

Decision markers:

```text
UI2_AUTH_EXPERIENCE_GO
UI2_ACCOUNT_PROFILE_GO
UI2_CREATOR_STUDIO_GO
UI2_CARTRIDGE_WORKFLOWS_GO
UI2_REVIEW_WORKFLOWS_GO
UI2_RBAC_PRESERVATION_GO
UI2_DARK_LIGHT_GO
UI2_RESPONSIVE_GO
UI2_FRONTEND_REGRESSION_GO
UI2_UI3_READY|BLOCKED
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

`UI2_UI3_READY|BLOCKED` reflects the remaining real-auth integration gate, not a missing UI implementation. UI.3 should begin only after the authentication dependency is reachable or an approved disposable authenticated environment is provided.

## 2. Scope and safety constraints

This milestone changed only frontend presentation and frontend tests. It did not change backend source, database schema, API contracts, Docker Compose, routing infrastructure, Authentik, public deployment, Flask behavior, or Fastify behavior.

No credentials, tokens, production records, or real user data were added. No commit or push was performed.

The working tree already contained changes from prior milestones. Those changes were preserved and were not reset or cleaned.

## 3. Authenticated route inventory

| Route | Existing responsibility | UI.2 result | Access boundary |
| --- | --- | --- | --- |
| `/login` | Local password, passkey, configured OIDC/SAML providers | Redesigned two-column access entry with explicit unavailable/error states | Public |
| `/auth/login` | Legacy compatibility route | Preserved redirect to `/login` | Public |
| `/register` | Registration request | Redesigned account setup form | Public, auth integration gated |
| `/register/complete` | One-time registration completion | Redesigned completion form | Public, auth integration gated |
| `/auth/register` and `/auth/register/complete` | Legacy compatibility routes | Preserved redirects | Public |
| `/forgot-password` | Password reset request | Redesigned recovery form and non-identifying success state | Public |
| `/password-reset` | Password reset completion | Redesigned token/password form | Public |
| `/account` | Password, API tokens, passkeys, re-authentication | Redesigned security workspace | Authenticated |
| `/users/[username]` | Public profile summary | Redesigned profile header | Public according to backend response |
| `/users/[username]/runs` | User run list | Redesigned responsive data table | Protected by existing `ProtectedRoute` |
| `/users/[username]/runs/[runId]` | User run detail and exports | Redesigned metric summary and export actions | Protected by existing `ProtectedRoute` |
| `/workspace` | Developer ownership workspace | Redesigned Creator Studio overview, drafts, and submissions | Existing workflow principal and `catalog:submit` behavior |
| `/publish` | Cartridge bundle submission | Redesigned four-step publishing UI | Existing `catalog:submit` guard |
| `/review` | Review and moderation queue | Redesigned queue/detail split view | Existing `submissions:read`, `submissions:review`, and `submissions:reject` checks |
| `/admin` and `/admin/federation/*` | Administrative workflows | Not redesigned in UI.2; existing role-aware links preserved | Existing admin/federation guards |

The route inventory intentionally does not add cartridge editing, arbitrary metadata editing, or developer-owned detail routes where the backend contract does not provide them.

## 4. Backend/API contract inventory

No API client contract was changed.

### Authentication

The existing `frontend/src/lib/api/auth.ts` methods remain authoritative:

- `GET /auth/me`
- `GET /auth/csrf`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /api/auth/providers`
- `POST /auth/register`
- `POST /auth/register/complete`
- `POST /auth/password/reset/request`
- `POST /auth/password/reset/complete`
- `POST /auth/password/change`
- `POST /auth/reauthenticate`
- `GET/POST/PATCH/DELETE /auth/tokens...`
- `GET/POST/PATCH/DELETE /auth/passkeys...`
- Provider redirects remain generated by `federatedLoginUrl()` and preserve safe `return_to` handling.

When the candidate auth proxy is enabled, the existing client normalization continues to route `/auth/*` browser calls through `/api/auth/*`. This was not changed.

### Profile and runs

The existing same-origin client remains:

- `GET /api/users/<username>`
- `GET /api/users/<username>/runs?page=<page>`
- `GET /api/users/<username>/runs/<run_id>`
- Existing JSON, CSV, and Markdown export links remain unchanged.

### Creator and publication workflow

The existing workflow proxy prefix remains `/__workflow-fastify`:

- `GET /auth/me`
- `GET /api/submissions/mine`
- `GET /api/drafts`
- `POST /api/drafts`
- `PATCH /api/drafts/<id>`
- `DELETE /api/drafts/<id>`
- `POST /api/drafts/<id>/artifact`
- `POST /api/drafts/<id>/submit`
- `POST /api/submissions/<id>/resubmit`
- `POST /api/publish/bundle`

### Review workflow

- `GET /api/submissions?status=<status>`
- `GET /api/submissions/<id>`
- `POST /api/submissions/<id>/verify`
- `POST /api/submissions/<id>/reject`

CSRF tokens, request payloads, Zod response validation, error mapping, and query invalidation were preserved.

## 5. RBAC and workflow mapping

The redesign does not infer role from visual state and does not duplicate backend authorization.

| Capability | Existing permission | UI behavior |
| --- | --- | --- |
| Creator Studio | `catalog:submit` | Navigation, draft controls, and publish route remain permission-scoped |
| Review queue visibility | `submissions:read` | `WorkflowGuard` remains authoritative |
| Approve | `submissions:review` plus pending submission | Approval controls remain hidden when absent |
| Reject | `submissions:reject` plus pending submission | Rejection controls remain hidden when absent |
| Administration | Existing admin permission set | Contextual navigation exposes administration only when a matching permission exists |
| Federation | `federation:read` | Existing federation link and guards remain intact |

The new review regression test verifies both an authorized approval path and a read-only reviewer path.

## 6. Visual reference inspection

The approved UI.2 reference contact sheet was inspected at:

`/Users/ivan/.codex/attachments/03757b30-4d43-4edc-a3af-2ed7caa84c57/image-1.png`

The implementation adopts its useful direction—clear account entry, compact profile/workspace navigation, restrained purple accent, structured creator dashboard, and visible workflow status—while keeping the repository’s established neutral/light and purple/dark token system. It does not copy unsupported mockup actions or invent API behavior.

## 7. Design decisions

- Auth pages use a constrained, high-signal form layout with a separate federated-access panel.
- Authenticated pages use a stable sidebar/context navigation on large screens and a stacked layout on smaller screens.
- Creator and review workspaces use thin borders, compact radius, explicit section headings, and status-forward rows instead of deeply nested decorative cards.
- Long lists retain real identifiers, status, timestamps, and pagination.
- Server-owned metadata remains server-owned; the publish UI does not reimplement manifest parsing.
- Success, loading, unavailable, empty, authorization, and error states remain visible and predictable.
- Existing dark/light CSS variables are used instead of hard-coded theme-specific component logic.

## 8. Authentication entry redesign

`LoginPanel` now presents local sign-in and provider access as two related but visually distinct areas. It preserves password sign-in, both passkey modes, safe return paths, session-expired messaging, provider filtering, and fallback behavior when discovery fails.

`RegisterPanel`, forgot-password, and password-reset routes now share the same account/recovery visual language. Registration success remains non-sensitive and continues to direct the user to sign in or the account page according to the existing behavior.

Provider buttons are still rendered only for enabled providers returned by the backend. No provider name, issuer, credential, or callback was hard-coded.

## 9. Account/profile redesign

The account workspace now groups:

- Password change and session invalidation.
- API token creation, one-time secret display, rename, revoke, empty, loading, and error states.
- Optional passkey enrollment, rename, revoke, unavailable, and empty states.
- Re-authentication escape hatch.

The profile and run views use responsive reading-width layouts, compact summary cards, and an overflow-safe run table. Export links remain direct links to the existing API resources.

## 10. Role-aware navigation

`ContextualNavigation` and `AuthNavigation` continue using the existing permission model. UI.2 changes their visual hierarchy only: contextual navigation is now a compact surface with a clear section label, active state, and responsive stacking. The header account menu still exposes account, creator, review, administration, federation, public profile, and sign-out destinations only when the existing user/session data permits them.

## 11. My Cartridges

The repository’s supported ownership surface is `My submissions`, backed by `GET /api/submissions/mine`. The UI now emphasizes owner scope, stable submission ID, game ID, version, timestamp, status, pagination, and rejected-submission resubmission. It does not invent a backend-owned “My Cartridges” detail route.

Empty, pending, error, rejected, verified, and revision states remain explicit.

## 12. Creator Studio

Creator Studio now has a clear overview header, identity/role summary, private staging section, ownership boundary notice, submission history, and next-action cards. Draft actions remain the existing create, attach ZIP, submit, and delete operations.

The UI deliberately communicates that private staging is persisted server-side and that submissions are not published automatically.

## 13. Cartridge creation

There is no separate metadata creation form in the current public contract. Creation is represented by creating a server draft and attaching the authoritative ZIP bundle. The UI keeps that boundary explicit and does not create client-side cartridge metadata fields that the backend does not accept.

## 14. Cartridge editing

Supported editing is limited to the existing draft metadata/artifact lifecycle and review-supported publication metadata. No unsupported developer-side submission editing was added. Rejected submissions continue to use the existing `resubmit` endpoint and draft flow.

## 15. Artifacts and versions

The publish wizard keeps the existing single ZIP bundle upload and client-side 64 MiB guard. The server remains responsible for manifest, architecture, archive, version, and artifact validation. Drafts display whether a bundle is attached and cannot be submitted without one.

## 16. Publication workflow

The four-step flow is now visually explicit:

1. Bundle contract.
2. ZIP selection.
3. Server-side validation handoff.
4. Review and submit.

The result state continues to say that the submission is pending review and is not published automatically. No publication state transition was moved into the browser.

## 17. Review and moderation

The review workspace now uses a queue/detail layout with status tabs, loaded-count context, explicit no-selection state, submission facts, supported metadata editing, reviewer note, architectures, history, and permission-scoped approval/rejection actions.

The existing confirm dialogs, mutation payloads, mutation invalidation, and stable error mapping remain intact.

## 18. Empty/loading/error states

Covered states include:

- Auth service unavailable while local sign-in remains visible.
- Session checking and protected-route redirect states.
- Provider discovery loading and failure.
- Registration and password recovery success/failure.
- Token/passkey loading, empty, unavailable, and operation errors.
- Profile/run loading, 403, 404, and service failure.
- Workflow principal loading, unauthorized, unavailable, empty, and mutation errors.
- Empty creator submissions, empty drafts, empty review filters, and no selected review item.

Errors continue to use stable frontend messages; raw backend details are not rendered.

## 19. Dark-theme validation

The live Next.js development container was observed at `https://store.prg32.dream.test/login`. The theme toggle switched the new login layout from light to dark without a hydration warning or layout failure. Dark surfaces, borders, inputs, controls, and typography use the existing `data-theme="dark"` token set.

The observation was visual and non-mutating. No authentication was attempted.

## 20. Light-theme validation

The same login layout was observed in light mode before toggling. The account-entry panel, provider panel, form controls, unavailable-auth notices, and header remained readable and aligned. The public storefront remained available at the same origin.

## 21. Responsive validation matrix

The component implementation uses the following responsive boundaries and was checked statically against the requested matrix:

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 375 px | Single-column auth/workflow layout, wrapping actions, no fixed-width overflow | `flex-col`, `grid`, `sm:*` breakpoints, overflow-safe table |
| 768 px | Compact two-column-capable forms and stacked contextual navigation | `sm:*` and `md:*` layout boundaries |
| 1024 px | Sidebar/context navigation and workspace content split | `lg:grid-cols-[240px_minmax(0,1fr)]` route shells |
| 1440 px | Full reading width with stable queue/detail proportions | `page-gutter`, `page-reading`, review `lg` grid |
| 1920 px | Content remains bounded rather than stretching indefinitely | `page-reading` and max-width route shells |

The live browser viewport available during this run was 1512 px wide. Small viewport behavior is backed by responsive CSS and the full frontend test/build checks, but a separate authenticated browser session at each exact width was not possible because the auth service was unavailable.

## 22. Accessibility verification

- Existing semantic headings, labels, landmarks, buttons, links, tablist label, status roles, and alert roles were preserved or improved.
- Inputs retain explicit labels and autocomplete semantics.
- Publishing steps expose `aria-current="step"`.
- Review queue selections remain keyboard-operable buttons.
- Existing focus-visible styling remains active through shared tokens.
- Decorative icons remain `aria-hidden` where applicable.
- No color-only workflow status is introduced; status text remains visible.

Automated accessibility scanning was not introduced because UI.2 is constrained to existing frontend infrastructure and no new browser E2E suite was authorized.

## 23. Functional regression tests

Existing login and creator ownership tests continue to pass. A new `ReviewWorkspace.test.tsx` covers:

- Authorized reviewer approval with supported metadata and the existing mutation contract.
- Read-only reviewer behavior with no approval/rejection controls.

No API client method, route, schema, or payload test required modification.

## 24. Real vs synthetic auth validation

### Real observation

- `https://store.prg32.dream.test/` returned the live storefront.
- `https://store.prg32.dream.test/login` returned the redesigned login page.
- The browser reported the authentication service as unavailable; provider discovery could not be completed.
- No credentials were submitted and no OIDC/SAML flow was initiated.

### Synthetic validation

- Login tests use anonymous and provider fixtures and verify safe provider filtering and redirect paths.
- Creator tests use an authenticated publisher fixture and ownership-scoped submissions.
- Review tests use authorized and read-only principal fixtures.
- API contract methods are tested through isolated frontend fetch fixtures.

Synthetic fixtures contain no production data or credentials.

## 25. Files changed

UI.2-specific files changed or added:

- `frontend/src/app/forgot-password/page.tsx`
- `frontend/src/app/password-reset/page.tsx`
- `frontend/src/app/publish/page.tsx`
- `frontend/src/components/account/AccountWorkspace.tsx`
- `frontend/src/components/auth/LoginPanel.tsx`
- `frontend/src/components/auth/RegisterPanel.tsx`
- `frontend/src/components/profile/ProfileWorkspace.tsx`
- `frontend/src/components/workflow/DeveloperWorkspace.tsx`
- `frontend/src/components/workflow/PublishingWizard.tsx`
- `frontend/src/components/workflow/ReviewWorkspace.tsx`
- `frontend/src/components/workflow/ReviewWorkspace.test.tsx`
- `docs/modernization/163-authenticated-experience-creator-studio-ui-2.md`

No backend or infrastructure file was changed for UI.2. The worktree also contains pre-existing modifications from earlier milestones; they were intentionally left untouched.

## 26. Remaining limitations

1. The live auth integration was unavailable, so real login, logout, token operations, passkey ceremony, provider discovery, and authenticated browser navigation were not executed.
2. Exact per-viewport browser screenshots for 375, 768, 1024, 1440, and 1920 were not collected; responsive behavior is implemented and statically verified through the existing CSS/build system.
3. No unsupported developer-side cartridge metadata editor was added because the current backend contract does not provide one.
4. No new automated accessibility scanner or E2E dependency was introduced.
5. UI.2 does not change public catalog, admin, federation, metrics, multiplayer, or documentation surfaces beyond preserving their navigation boundaries.

## 27. UI.3 readiness

The frontend structure is ready for the next authorized UI milestone from a code-boundary perspective: authenticated surfaces now have consistent layout primitives, explicit states, and test coverage without moving business logic into React.

The real-auth gate remains open. Before UI.3 or any operational acceptance, restore/identify a disposable authentication target and rerun real browser checks for local credentials, generic OIDC, generic SAML, session expiry, and logout.

## 28. Final decision

```text
UI2_AUTH_EXPERIENCE_GO
UI2_ACCOUNT_PROFILE_GO
UI2_CREATOR_STUDIO_GO
UI2_CARTRIDGE_WORKFLOWS_GO
UI2_REVIEW_WORKFLOWS_GO
UI2_RBAC_PRESERVATION_GO
UI2_DARK_LIGHT_GO
UI2_RESPONSIVE_GO
UI2_FRONTEND_REGRESSION_GO
UI2_UI3_READY|BLOCKED
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

UI.2 is implementation-complete for the supported authenticated frontend contract, but not real-auth acceptance-complete. No operational cutover, Flask retirement, backend change, deployment, commit, or push was performed.

## Verification commands

Executed with Node.js 24.20.0 selected using `nvm use 24`:

```text
pnpm --dir frontend run typecheck  PASS
pnpm --dir frontend run lint       PASS
pnpm --dir frontend run test       PASS — 31 test files, 78 tests
pnpm --dir frontend run build      PASS — Next.js 16.4.0, 39 routes generated
git diff --check                    PASS
```

Backend tests were not rerun because this milestone made no backend changes and the backend freeze was explicitly preserved. Docker Compose was inspected read-only; no service was recreated or modified during UI.2.
