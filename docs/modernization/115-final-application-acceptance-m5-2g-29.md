# PRG32 Cartridge Store — M5.2g.29 Final Application Acceptance Closure

## 1. Executive decision

`FINAL_APPLICATION_ACCEPTANCE_PARTIAL`

The disposable Fastify + Next.js application passes the available backend,
frontend, browser, compatibility, backup/restore, security-negative and
candidate-image checks. One regression found only in the complete browser
sequence was fixed: active canonical cartridges without a published release
are now excluded from catalog projections instead of causing an administrative
listing failure.

The result is intentionally not `GO`. The full acceptance matrix is not yet
complete: production email delivery was not attempted, Dream Mailpit was only
observed, SMTP registration/password-reset flows were not exercised end to end
through the synthetic SMTP server, and some administrator UI paths remain
partially covered.

Regardless of the application result:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

No operational routing, database, storage root, Traefik, Authentik, Compose
service, DNS or TLS configuration was changed. No commit, push or deployment
was performed.

## 2. Baseline and scope

The work used Node.js 24 selected with `nvm use 24`. All fixtures and browser
servers were disposable. The real Dream infrastructure was accessed only with
low-volume read-only observations.

Implemented or verified in this milestone:

- consistent session-cookie lifetime serialization from persisted runtime
  policy;
- same-origin authentication proxy coverage for local authentication routes;
- administrative settings, user state, catalog moderation and audit browser
  acceptance;
- isolated synthetic SMTP connection and message submission;
- canonical catalog filtering for unpublished active records;
- regression coverage for the resulting edge case;
- final candidate image and Compose configuration verification.

## 3. Safety boundary

The following were not performed:

- production cutover or Flask removal;
- writes to operational SQLite, object storage or Compose volumes;
- changes to Dream Traefik, Authentik, Mailpit, DNS or certificates;
- real OIDC/SAML login against the external provider;
- SMTP delivery to Dream Mailpit or an external mailbox;
- deployment, commit or push.

All credentials and tokens used by tests were synthetic fixture values and are
not included in this report.

## 4. Administrative browser acceptance

The new disposable Playwright scenario covers:

1. administrator login through the Next.js same-origin surface;
2. disabling registration and observing a rejected registration attempt;
3. persistence of registration and session settings;
4. short session cookie issuance and expiry metadata;
5. synthetic SMTP configuration, connection test and message test;
6. administrator creation of a user;
7. suspension and ban with immediate session invalidation;
8. catalog hide and public visibility removal;
9. catalog restore through the protected admin API;
10. audit entries for settings, account suspension and moderation.

The complete browser suite passes 13/13. The restore step uses the protected
admin API because the current admin catalog listing intentionally excludes
hidden/unpublished releases; a UI selector for restoring an already hidden
record is therefore not yet verified.

Evidence: `BROWSER_VERIFIED` for the paths listed above.

## 5. Session and cookie consistency

The session lifetime is now read from the runtime policy at cookie serialization
time for:

- local login, logout, bootstrap and registration completion;
- OIDC callback sessions;
- SAML callback sessions.

The canonical HTTP regression test persists a 60-second policy and verifies
`Max-Age=60`. The browser test verifies the corresponding cookie expiry and
then restores a longer disposable lifetime before continuing its remaining
administrative actions.

Evidence: `UNIT_VERIFIED`, `HTTP_VERIFIED`, `BROWSER_VERIFIED`.

## 6. Synthetic SMTP acceptance

An isolated loopback SMTP capture server is started by the disposable browser
global setup. It is not connected to Dream infrastructure. It accepts the
minimal SMTP greeting, EHLO, connection test, DATA submission and QUIT flow.

Verified:

- admin SMTP configuration is persisted in canonical SQLite;
- runtime transport switches to SMTP after the settings update;
- SMTP connection test succeeds;
- a synthetic message submission succeeds;
- the existing backend restart/reload SMTP configuration test succeeds;
- SMTP secret encryption/redaction and backup protections remain covered by
  the existing secret and backup suites.

Evidence: `UNIT_VERIFIED`, `BROWSER_VERIFIED`.

Not verified in this milestone:

- registration verification email through SMTP followed by token consumption;
- password-reset email through SMTP followed by token consumption;
- disposable STARTTLS and implicit-TLS delivery sessions;
- SMTP authentication success/failure through a live fixture;
- external mailbox delivery.

Those items remain `NOT_VERIFIED` and prevent a full application `GO`.

## 7. Dream Mailpit and public infrastructure observation

Read-only revalidation observed:

- `store.prg32.dream.test` resolves locally to `127.0.0.1`; safe `HEAD
  /health` returned `404` from Next.js.
- `api.prg32.dream.test` resolves locally to `127.0.0.1`; safe `HEAD
  /health` returned `404` from the transitional Flask/Werkzeug surface.
- `sso.dream.test` resolves locally to `127.0.0.1`; safe `HEAD /` returned
  `302` to the Authentik authentication flow and exposed the expected
  Authentik response marker.
- `mailpit.dream.test` resolves locally to `127.0.0.1`; safe `HEAD /` returned
  `405`.
- the existing Mailpit container was observed read-only as
  `axllent/mailpit:v1.27.4`, healthy, with SMTP port `1025` and web port
  `8025` exposed inside the existing infrastructure.
- TLS observation returned the local mkcert development certificate for the
  three application/SSO names. System trust-chain validation is not treated
  as production evidence.

No POST, SMTP submission, login, token exchange, provider administration or
Mailpit mutation was attempted.

Required classifications:

- `MAILPIT_SMTP_NOT_EXECUTED`
- `PRODUCTION_EMAIL_DELIVERY_NOT_VERIFIED`
- public routing observation: `HTTP_VERIFIED`
- production trust and delivery readiness: `NOT_VERIFIED`

## 8. SMTP security status

The source and existing unit suites verify that:

- SMTP passwords are stored through the existing secret envelope mechanism;
- secret values are omitted from settings responses, audit summaries and backup
  manifests;
- wrong-purpose and tampered secret envelopes are rejected;
- backup encryption/key requirements remain fail-closed;
- SMTP errors use stable public error envelopes rather than raw exception text.

Evidence: `SOURCE_VERIFIED`, `UNIT_VERIFIED`.

The live synthetic browser path uses `encryption=none` on loopback only. TLS
mode, SMTP AUTH and certificate-validation behavior remain `NOT_VERIFIED` for
this milestone.

## 9. Runtime policy matrix

| Policy | UI/API persistence | Authoritative enforcement | Evidence | Status |
|---|---|---|---|---|
| Registration enabled | Settings UI and admin API | Registration route rejects disabled registration | `HTTP_VERIFIED`, `BROWSER_VERIFIED` | Verified |
| Session lifetime | Settings UI and canonical SQLite | Local/OIDC/SAML session cookies and records | `UNIT_VERIFIED`, `HTTP_VERIFIED`, `BROWSER_VERIFIED` | Verified |
| Publishing enabled | Settings API | Publishing workflow policy | `UNIT_VERIFIED`, `HTTP_VERIFIED` | Verified |
| Maximum artifact size | Settings API | Upload validation | `UNIT_VERIFIED`, `HTTP_VERIFIED` | Verified |
| Rejection-note requirement | Settings API | Review rejection validation | `UNIT_VERIFIED`, `HTTP_VERIFIED` | Verified |
| SMTP configuration | Settings UI/API and canonical SQLite | Email transport configuration | `UNIT_VERIFIED`, `BROWSER_VERIFIED` | Partial |
| Catalog visibility | Moderation UI/API and canonical SQLite | Public/admin catalog projection | `UNIT_VERIFIED`, `BROWSER_VERIFIED` | Partial |
| Telemetry collection | Backend policy | Metrics and run ingestion limits | `UNIT_VERIFIED`, `HTTP_VERIFIED` | Verified |

Unauthorized mutation, CSRF, stale-version and secret-leakage cases are
covered by the backend administration, authorization, settings, secrets and
backup suites. Evidence: `UNIT_VERIFIED`, `HTTP_VERIFIED`.

## 10. Federation regression

Synthetic OIDC and SAML providers remain isolated from Authentik. The browser
suite verifies OIDC and SAML callback completion, session rotation, same-origin
cookie boundaries and provider administration surfaces. The backend suite also
verifies discovery, PKCE, nonce/audience validation, SAML signature and
temporal validation, and certificate overlap behavior.

Evidence: `UNIT_VERIFIED`, `HTTP_VERIFIED`, `BROWSER_VERIFIED`.

Real Authentik login and production identity continuity remain
`NOT_VERIFIED` and are outside this milestone’s authorization.

## 11. Administrative security-negative coverage

The backend suites verify rejected or fail-closed behavior for:

- missing or invalid CSRF tokens;
- bearer-only administrative mutations;
- insufficient permissions;
- invalid identifiers, roles, filters and settings;
- stale optimistic-concurrency versions;
- suspended or banned account access;
- protected administrator/group transitions;
- unsafe backup/restore archives and wrong keys;
- secret exposure in responses, diagnostics and backup metadata.

Evidence: `UNIT_VERIFIED`, `HTTP_VERIFIED`.

## 12. Candidate Docker acceptance

Read-only configuration checks passed:

```text
docker compose --profile dev config --quiet                         PASS
docker compose -f deploy/candidate/compose.yaml config --quiet      PASS
```

Build checks passed:

- root legacy image: `docker build -t prg32-cartridge-store:m52g29-root .`
  using the existing Python slim image;
- candidate Fastify image from `backend/Dockerfile.candidate`;
- candidate Next.js image from `frontend/Dockerfile.candidate`;
- candidate runtime base: `node:24-bookworm-slim`;
- candidate Compose build completed for both images.

No container was started by this milestone’s Docker checks. No operational
network or volume was attached or modified.

Evidence: `DOCKER_VERIFIED`.

## 13. Firmware and API regression

The backend contract and differential suites continue to cover catalog listing,
details, media, colophon, architecture selection, downloads, scores, runs,
metrics ingestion, telemetry, discovery and multiplayer. Firmware-shaped
anonymous ingestion and legacy serialization compatibility remain passing.

The canonical read path preserves the documented identifiers and response
fields. A new regression ensures pending/rejected active cartridges without a
published release do not become public or administrative catalog entries.

Evidence: `SOURCE_VERIFIED`, `UNIT_VERIFIED`, `HTTP_VERIFIED`.

## 14. Backup and restore regression

Existing storage-v2 and backup-v4 suites pass with disposable roots. They cover:

- canonical SQLite snapshot and schema/version checks;
- immutable artifact/media/staging integrity;
- publication and migration evidence;
- encrypted backup-v4 format;
- wrong-key, tamper, truncation and incomplete-marker rejection;
- writer lease and interrupted restore behavior;
- non-ready partial target handling.

No operational backup or restore was executed.

Evidence: `UNIT_VERIFIED`, `HTTP_VERIFIED` for existing isolated routes/tests;
operational recoverability: `NOT_VERIFIED`.

## 15. Final application capability matrix

| Capability | Fastify/Next evidence | Final status |
|---|---|---|
| Catalog listing | canonical read and browser catalog | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Cartridge detail | canonical read and browser detail | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Binary download | byte/range tests and browser download | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Registration | auth/settings tests and disabled-registration browser case | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Password recovery | local auth unit coverage | `UNIT_VERIFIED` |
| Local login | HTTP and browser login/logout | `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| OIDC | synthetic protocol and browser callback | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| SAML | synthetic protocol and browser callback | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Logout | browser and auth regression | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| User profile | browser profile surface | `BROWSER_VERIFIED` |
| User administration | create/status/role browser flow | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Roles | admin API and browser read surface | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Account suspension | immediate session denial | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Account ban | immediate session denial | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Session revocation | auth/admin regression | `UNIT_VERIFIED`, `HTTP_VERIFIED` |
| API tokens | token lifecycle and WebSocket use | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Publisher drafts | browser draft/resubmission flow | `BROWSER_VERIFIED` |
| ZIP upload | submission and adversarial upload tests | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Submission | publisher browser flow | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Review | approve/reject browser flow | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Resubmission | rejected revision browser flow | `BROWSER_VERIFIED` |
| Publication | canonical workflow and browser approval | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Moderation | hide browser flow and protected restore API | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Scores | firmware-shaped and browser scoreboard coverage | `UNIT_VERIFIED`, `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Runs | browser metrics detail and backend contract tests | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Metrics | resource/authorization and browser detail coverage | `UNIT_VERIFIED`, `HTTP_VERIFIED`, `BROWSER_VERIFIED` |
| Telemetry | canonical download/run persistence | `UNIT_VERIFIED`, `HTTP_VERIFIED` |
| Multiplayer WebSocket | TLS edge and browser relay | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| SMTP administration | synthetic connection/message only | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Application settings | persistence and browser runtime policy | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Audit | audit API and browser event assertions | `UNIT_VERIFIED`, `BROWSER_VERIFIED` |
| Backup | encrypted/disposable backup suites | `UNIT_VERIFIED` |
| Restore | encrypted/disposable restore suites | `UNIT_VERIFIED` |
| Firmware compatibility | contract and differential suites | `UNIT_VERIFIED`, `HTTP_VERIFIED` |

Not yet verified as complete: administrator user search in the browser UI,
UI restoration of an already hidden catalog item, SMTP-backed registration and
password-reset delivery, SMTP TLS/AUTH modes, Mailpit delivery and real
provider identity continuity.

## 16. Regression results

All commands below were executed with Node.js 24 selected through nvm.

| Command/check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 50 files, 261 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `pnpm --dir frontend run test:e2e` | PASS — 13 tests |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| root Compose dev config | PASS |
| candidate Compose config | PASS |
| candidate Compose build | PASS — Fastify and Next.js images |
| root Docker build | PASS |
| `git diff --check` | PASS |

The only failure encountered during execution was the browser-sequence
regression described in section 4/13; it was fixed and the complete rerun
passed.

## 17. Files changed for M5.2g.29

Application and test files touched for this milestone:

- `backend/src/auth/service.ts`
- `backend/src/auth/routes.ts`
- `backend/src/oidc/routes.ts`
- `backend/src/saml/routes.ts`
- `backend/src/app.ts`
- `backend/src/storage-v2/catalog.ts`
- `backend/tests/admin-runtime-config.test.ts`
- `backend/tests/canonical-workflow-http.test.ts`
- `backend/tests/canonical-read-http.test.ts`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/stores/admin-store.ts`
- `frontend/src/components/admin/AdminWorkspace.tsx`
- `frontend/src/app/api/auth/[...path]/route.ts`
- `frontend/e2e/global-setup.mjs`
- `frontend/e2e/m52g29.spec.mjs`

The worktree contains earlier modernization changes and reports from prior
milestones; they were preserved and not reset or cleaned.

## 18. Remaining application discrepancies

1. SMTP synthetic coverage currently proves administration-level connection
   and message submission, not the complete SMTP-backed registration and
   password-reset token journeys.
2. SMTP TLS, AUTH, certificate and failure-mode matrix is source/unit scoped,
   not browser-integrated.
3. Hidden/unpublished catalog entries are excluded from admin list/detail reads,
   so UI restore of an already hidden record is not demonstrated; the protected
   restore API is tested.
4. The user-search API path exists, but an end-to-end browser search acceptance
   is not included in this closure.
5. Real Authentik identity continuity and real external email delivery are not
   part of the disposable evidence.

These are application acceptance gaps, not authorization to alter operational
services.

## 19. Remaining operational blockers

Cutover remains blocked until all of the following are explicitly accepted and
rehearsed against the intended operational environment:

- single-writer ownership and a controlled migration window;
- real canonical data/object snapshot and independent verification;
- authentication/session continuity decision with generic OIDC/SAML provider;
- publication, review, telemetry, metrics, scores and WebSocket ownership;
- real Traefik routing for `store.prg32.dream.test` and
  `api.prg32.dream.test`;
- production secret/key custody and SMTP delivery policy;
- rollback data-loss policy for writes after cutover;
- operational backup/restore rehearsal without touching live data;
- explicit decision to retire Flask after a successful cutover window.

Evidence for operational readiness: `NOT_VERIFIED`.

## 20. Recommended next milestone

Do not begin operational cutover yet. The next milestone should close the
remaining disposable application gaps first: SMTP registration/reset through a
synthetic transport, SMTP TLS/AUTH fixture coverage, an admin restore/search
UI decision, and a complete capability-matrix rerun. Only after that should a
separately authorized operational handover milestone be planned.

M5.2g.30 and M6.3d.2h.12 were not started.

## 21. Final GO/NO-GO decisions

| Decision | Result | Reason |
|---|---|---|
| Final disposable application acceptance | `FINAL_APPLICATION_ACCEPTANCE_PARTIAL` | Core disposable paths pass, but the complete matrix and SMTP/administration gaps remain. |
| Operational cutover | `OPERATIONAL_CUTOVER_NO_GO` | No live ownership, routing, data, identity or rollback acceptance was authorized or completed. |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` | Flask remains operationally authoritative and was not removed or cut over. |

