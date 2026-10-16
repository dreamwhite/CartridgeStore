# PRG32 Cartridge Store — Authenticated Integration Verification UI.2.1

## 1. Executive summary

UI.2.1 completed the requested read-only authentication diagnosis and frontend acceptance work. The real-authentication gate remains blocked by the local runtime, not by a demonstrated frontend contract defect.

The decisive finding is:

```text
auth-writer: unhealthy
cause: ERR_MODULE_NOT_FOUND for @simplewebauthn/server from /app/src/auth/webauthn.ts
edge proxy: unhealthy because the auth-writer upstream refuses connections
```

The package is declared in `backend/package.json` and `backend/pnpm-lock.yaml`, but it is absent from the mounted `/app/node_modules` used by the running `auth-writer` container. The browser-facing dual-origin API therefore reaches the Flask fallback for the inspected auth paths. `GET /api/auth/me` and `GET /api/auth/providers` are not served by the intended Fastify auth owner.

No backend, Compose, Authentik, Traefik, database, identity, token, passkey, or production resource was modified.

Final state:

```text
UI21_AUTH_DIAGNOSIS_GO
UI21_REAL_AUTH_BLOCKED
UI21_SYNTHETIC_BROWSER_GO
UI21_RBAC_VERIFICATION_GO
UI21_CREATOR_VERIFICATION_GO
UI21_REVIEW_VERIFICATION_GO
UI21_RESPONSIVE_BROWSER_GO
UI21_ACCESSIBILITY_GO
UI21_FRONTEND_REGRESSION_GO
UI21_FRONTEND_VERIFIED_AUTH_BLOCKED
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
```

## 2. Scope and safety constraints

This milestone was limited to diagnosis, read-only observations, synthetic browser verification, and existing frontend regression checks. No new feature, endpoint, provider, auth mechanism, UI redesign, backend change, infrastructure change, or operational cutover was performed.

No credentials were guessed or submitted. No Authentik mutation, user creation, password reset, provider change, DNS/TLS change, container restart, database write, upload, approval, rejection, token operation, or passkey operation was executed against a real service.

The worktree already contained prior milestone changes. They were preserved.

## 3. Starting UI.2 acceptance state

UI.2 started from 31 frontend test files and 78 passing tests, with typecheck, lint, build, and `git diff --check` passing. Its explicit limitation was that the configured authentication service was unavailable, so no real authenticated browser workflow had been accepted.

That limitation was preserved and investigated rather than reinterpreted as a frontend success.

## 4. Authentication dependency map

| Browser operation | Browser target in dual-origin mode | Intended owner | Observed result |
| --- | --- | --- | --- |
| `GET /auth/me` logical client call | `https://api.prg32.dream.test/api/auth/me` | Fastify auth runtime through API origin | `404` HTML from Flask/Werkzeug fallback; no CORS response headers |
| `GET /auth/csrf` logical client call | `https://api.prg32.dream.test/api/auth/csrf` | Fastify auth runtime through API origin | Not accepted as a real Fastify auth result; auth edge unavailable |
| `POST /auth/login` logical client call | `https://api.prg32.dream.test/api/auth/login` | Fastify auth runtime through API origin | Not executed against a real service |
| `POST /auth/logout` logical client call | `https://api.prg32.dream.test/api/auth/logout` | Fastify auth runtime through API origin | Not executed against a real service |
| `GET /api/auth/providers` | `https://api.prg32.dream.test/api/auth/providers` | Fastify provider discovery | `404` HTML from Flask/Werkzeug fallback |
| Registration | API-origin auth registration routes | Fastify auth runtime | Blocked by same runtime failure |
| Password recovery | API-origin auth recovery routes | Fastify auth runtime | Blocked by same runtime failure |
| Passkeys | API-origin WebAuthn options/finish routes | Fastify auth runtime plus WebAuthn server package | Blocked; auth runtime cannot start |
| OIDC/SAML redirects | API-origin provider login/callback routes | Fastify federation runtime and external generic provider | Not initiated |
| Workflow principal | `/__workflow-fastify/auth/me` when configured | Workflow Fastify target | Synthetic only; live workflow target is not configured in the inspected Next container |

Relevant inspected Next environment flags were:

```text
PRG32_AUTH_INTEGRATION_ENABLED=false
PRG32_AUTH_FASTIFY_TARGET=[empty]
PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED=true
NEXT_PUBLIC_PRG32_DUAL_ORIGIN_ENABLED=true
NEXT_PUBLIC_PRG32_API_ORIGIN=https://api.prg32.dream.test
PRG32_WORKFLOW_FASTIFY_TARGET=[empty]
```

This is consistent with the intended dual-origin design: the browser calls the API origin directly. It also means the API origin must actually route to a healthy Fastify auth owner before real authentication can work.

## 5. Read-only diagnosis

### Container state

```text
auth-writer              running / unhealthy
auth-writer-edge-proxy   running / unhealthy
flask                    running / healthy
next                     running
```

The edge proxy log repeatedly reports connection refused while connecting to the `auth-writer` upstream on port `5090`.

### Auth-writer failure

The non-sensitive container log reports:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@simplewebauthn/server'
imported from /app/src/auth/webauthn.ts
```

The dependency is present in the tracked backend manifest and lockfile at version `14.0.3`, but read-only inspection inside the running container reports:

```text
node_modules package: missing
package manifest version: 14.0.3
```

The smallest proposed remediation is to rebuild or repopulate the disposable auth-writer dependency mount from the tracked lockfile, then recheck the auth-writer health endpoint and edge route. That remediation was not executed because UI.2.1 explicitly prohibits backend/infrastructure mutations.

### Routing and CORS symptoms

- `https://store.prg32.dream.test/health` returned `200` from Next.
- `https://store.prg32.dream.test/auth/me` returned a Flask `401`, demonstrating that the legacy same-origin path remains reachable.
- `https://api.prg32.dream.test/auth/me` returned a Flask `401`.
- `https://api.prg32.dream.test/api/auth/me` returned a Flask `404`.
- `https://api.prg32.dream.test/api/auth/providers` returned a Flask `404`.
- Requests with `Origin: https://store.prg32.dream.test` did not receive `Access-Control-Allow-Origin` headers from the Flask fallback.
- The browser therefore reports the auth service as unavailable rather than exposing a misleading authenticated state.

The evidence points to a failed auth-writer runtime and fallback routing, not an Authentik provider failure. Authentik itself was not accessed or mutated.

## 6. Observed HTTP/browser behavior

Read-only HTTP checks used low-volume `GET` requests with short timeouts and redacted headers. The live store origin returned the public frontend and the redesigned login page. The header displayed the existing auth-unavailable state and a retry link.

The live browser was not authenticated. No form was submitted and no OIDC/SAML redirect was followed.

The browser console in an unmocked headless check recorded CORS rejection for the API-origin auth request because the API host was returning the Flask fallback without the expected dual-origin CORS response.

## 7. Disposable environment assessment

The repository has a disposable auth-writer Compose service and tracked dependency lockfile, but the currently running development mount is incomplete. There is no safe, healthy, disposable authenticated target available without repairing the dependency mount or recreating the local auth-writer runtime.

Because that repair is outside UI.2.1 authorization, real authenticated testing is blocked. Existing synthetic frontend fixtures are safe to use and were used below.

## 8. Evidence-level definitions

| Level | Meaning | Used here |
| --- | --- | --- |
| A | Frontend unit/component tests with controlled fixtures | Yes: 31 files / 78 tests |
| B | Browser navigation/layout/interaction with intercepted synthetic responses | Yes: 50 responsive route/theme layout checks and existing browser-compatible fixtures |
| C | Real backend session, CSRF, RBAC, and lifecycle | No: blocked by auth-writer runtime |

Level B evidence is not represented as Level C.

## 9. Authentication UI verification

| Workflow | Level | Result | Real backend/data mutation |
| --- | --- | --- | --- |
| Anonymous login rendering | A/B | PASS | No |
| Session loading/unavailable state | A/B and live observation | PASS for safe error state | No |
| Invalid credentials message | A | PASS | No |
| Provider discovery success/failure presentation | A | PASS | No |
| Safe return path | A | PASS | No |
| Protected-route behavior | A | PASS | No |
| Registration and recovery presentation | A | PASS by existing frontend coverage/build | No |
| Local login against real auth | C | BLOCKED | No |
| Logout against real auth | C | BLOCKED | No |
| Session expiry against real auth | C | BLOCKED | No |
| Passkey ceremony | C | BLOCKED | No |
| OIDC/SAML federation | C | BLOCKED/not initiated | No |

## 10. Account security verification

Account UI rendering and operation states are covered at Level A through the existing auth API fixtures and component contract. Real password change, re-authentication, token reveal/rename/revoke, and passkey operations were not executed. No secret was placed in persistent browser storage or logs during this milestone.

Result: Level A PASS; Level C BLOCKED.

## 11. Creator Studio verification

Creator Studio synthetic fixtures cover authenticated principal rendering, ownership-scoped empty submissions, permission-gated navigation, draft section rendering, and the existing publish link. The backend workflow target was not configured in the live Next container, so no real draft or submission data was touched.

Result: Level A/B PASS; Level C BLOCKED.

## 12. Publishing wizard verification

The existing wizard remains a four-step UI. Synthetic/component coverage verifies the bundle contract presentation, ZIP selection boundary, client-side `.zip` rejection, 64 MiB client guard, server-validation explanation, pending-review wording, and mutation error mapping.

No bundle was uploaded to operational or shared storage.

Result: Level A/B PASS; Level C BLOCKED for server validation and real submission.

## 13. Review workflow verification

The existing review component and focused regression test cover:

- Read-only reviewers without decision controls.
- Reviewers with approval and rejection permissions.
- Pending submission selection.
- Supported metadata fields and tags conversion.
- Reviewer note input.
- Approval/rejection confirmation boundaries.
- Mutation error and query invalidation behavior.

No real submission was approved or rejected.

Result: Level A/B PASS; Level C BLOCKED.

## 14. Role/permission matrix

| Principal fixture | Permissions | Expected UI | Result |
| --- | --- | --- | --- |
| Anonymous | `[]` | Public navigation; no creator/review/admin actions | PASS at Level A/B |
| Authenticated reader | `[]` | Account access only; no creator/review actions | PASS at Level A |
| Creator | `catalog:submit` | Creator Studio and publish entry points | PASS at Level A/B |
| Review read-only | `submissions:read` | Queue/detail visibility without approve/reject controls | PASS at Level A |
| Review approver | `submissions:read`, `submissions:review` | Approve control for pending item | PASS at Level A |
| Review rejector | `submissions:read`, `submissions:reject` | Reject control for pending item | PASS at Level A |
| Editor with both decisions | read, review, reject | Full supported review actions | PASS at Level A/B |
| Administrator | Existing admin permissions | Existing admin/federation links only | Existing tests; no new capability added |

Permission checks remain a presentation aid, not a security boundary. Backend authorization remains authoritative.

## 15. Responsive browser matrix

Synthetic browser checks ran against the live Next.js frontend with intercepted auth/workflow responses:

```text
5 widths × 5 authenticated entry routes × 2 theme states = 50 checks
Widths: 375, 768, 1024, 1440, 1920
Routes: /login, /account, /workspace, /publish, /review
Themes: light, dark (theme token applied in browser before measurement)
Horizontal overflow failures: 0
Navigation/load errors: 0
```

The checks inspected the actual browser DOM and measured `document.documentElement.scrollWidth > window.innerWidth`. They did not use real authentication or real workflow data.

## 16. Dark/light verification

The live Chrome browser previously showed the redesigned login in light and dark mode without a hydration warning. The Level B browser matrix applied both theme token states to all five requested widths and found no horizontal overflow.

The current live auth service remains unavailable, so theme verification is independent of authenticated session state.

## 17. Accessibility verification

The existing frontend checks and browser DOM inspection verified:

- Labeled login and publishing inputs.
- Semantic headings and landmarks.
- Named buttons and links.
- Alert/status text for errors and mutations.
- Keyboard-operable review selection buttons.
- Visible focus styles from the shared CSS tokens.
- Table semantics for run history.
- Textual status labels in addition to color.

No clear accessibility regression was discovered. A full automated WCAG scanner was not added, consistent with the no-new-dependency scope.

## 18. Frontend bugs discovered

No frontend bug requiring a UI.2.1 code fix was demonstrated.

The auth-unavailable state is correct for the observed backend failure. The underlying issue is runtime dependency availability and edge ownership, not an incorrect frontend response mapping.

## 19. Targeted fixes and regression tests

No source fix was applied because the evidence identifies a prohibited backend/runtime remediation. Existing frontend tests remain unchanged for UI.2.1; no regression test was necessary for a non-existent frontend defect.

The focused UI.2 review regression test remains present and passes as part of the 78-test suite.

## 20. Test commands and results

Executed with Node.js `v24.20.0` selected using `nvm use 24`:

```text
pnpm --dir frontend run typecheck  PASS
pnpm --dir frontend run lint       PASS
pnpm --dir frontend run test       PASS — 31 test files, 78 tests
pnpm --dir frontend run build      PASS — Next.js 16.4.0, 39 routes generated
git diff --check                    PASS
```

Additional read-only/synthetic checks:

```text
docker compose --profile dev ps                         DIAGNOSIS ONLY
curl GET health/auth endpoints                          DIAGNOSIS ONLY
container log inspection                                DIAGNOSIS ONLY
synthetic browser responsive matrix                     PASS — 50 checks, 0 overflow failures
```

No backend test command was rerun because UI.2.1 did not modify backend code and the backend freeze was preserved.

## 21. Real vs synthetic coverage

### Real, Level C

Real public store navigation and unauthenticated HTTP observations were performed. Real authenticated integration was not performed because the auth-writer dependency/runtime gate is unhealthy.

### Synthetic, Levels A/B

Synthetic fixtures covered session principals, anonymous states, provider responses, ownership-scoped submissions, drafts, review permissions, and browser layout across the requested viewport/theme matrix. Synthetic checks did not create sessions, write databases, upload bundles, approve submissions, revoke credentials, or contact Authentik.

## 22. Remaining blockers

1. Repopulate/rebuild the disposable `auth-writer` dependency mount so `@simplewebauthn/server@14.0.3` is available at runtime.
2. Verify the auth-writer `/health` endpoint becomes healthy.
3. Verify the edge proxy becomes healthy and owns the `api.prg32.dream.test` auth paths.
4. Verify `GET /api/auth/me`, `GET /auth/csrf`, and `GET /api/auth/providers` through the API origin with correct CORS/session behavior.
5. Only then execute real local login/logout/session-expiry and safe disposable RBAC checks.
6. Configure a safe disposable workflow Fastify target before real Creator Studio and review acceptance.

The smallest remediation proposal is a local dependency-volume repair/rebuild from the tracked backend lockfile. It is intentionally not performed in UI.2.1.

## 23. Files changed

UI.2.1 changed only this report:

- `docs/modernization/164-authenticated-integration-verification-ui-2-1.md`

No backend, frontend source, test, Compose, Docker, Authentik, Traefik, database, or deployment file was changed in this milestone.

## 24. Next milestone readiness

The frontend is ready for the next UI milestone from a synthetic verification perspective. Real authenticated acceptance is not ready.

The next authorized action should be a narrowly scoped local runtime repair of the disposable auth-writer dependency mount, followed by a new read-only health check and real-auth acceptance run. That repair must remain outside UI.2.1 and must not touch shared Authentik or operational data.

## 25. Final decision

```text
UI21_AUTH_DIAGNOSIS_GO
UI21_REAL_AUTH_BLOCKED
UI21_SYNTHETIC_BROWSER_GO
UI21_RBAC_VERIFICATION_GO
UI21_CREATOR_VERIFICATION_GO
UI21_REVIEW_VERIFICATION_GO
UI21_RESPONSIVE_BROWSER_GO
UI21_ACCESSIBILITY_GO
UI21_FRONTEND_REGRESSION_GO
UI21_FRONTEND_VERIFIED_AUTH_BLOCKED
M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
```

UI.2.1 is complete as an integration diagnosis and synthetic frontend verification milestone. It is not a full authenticated acceptance. No commit or push was performed.
