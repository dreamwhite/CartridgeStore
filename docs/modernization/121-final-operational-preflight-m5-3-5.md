# PRG32 Cartridge Store — M5.3.5 Final Operational Preflight

Date: 2026-10-14  
Decision: \`M535_FINAL_PREFLIGHT_PARTIAL\`  
Operational cutover: \`OPERATIONAL_CUTOVER_NO_GO\`  
Flask retirement: \`FLASK_RETIREMENT_NO_GO\`

## 1. Executive decision

The canonical-operational Fastify + Next.js runtime passed the disposable application acceptance gate, including the full applicable browser matrix:

- Fastify operational image: passed build and startup checks.
- Next.js operational image: passed build and startup checks.
- Operational-mode Playwright: **16/16 passed**.
- Backend: **52 test files, 266 tests passed**.
- Frontend: **22 test files, 65 tests passed**.
- Python: **64 tests passed**.
- Docker Compose configuration and \`git diff --check\`: passed.

This is not authorization to cut over. The real Dream deployment still has Flask as the public API owner, the transitional authentication bridge is still active, and the external Traefik/Authentik contracts have not been privilegedly reconfigured or approved for handover. The real university data migration is intentionally outside this milestone.

The result is therefore \`M535_FINAL_PREFLIGHT_PARTIAL\`, not a final technical GO. The disposable runtime is ready for a separately authorized handover procedure; operational authorization remains open.

## 2. Scope and safety

This milestone was executed as a read-only operational preflight plus production-like disposable acceptance. No operational Dream container, network, database, object store, DNS record, TLS certificate, Traefik configuration, Authentik provider, Mailpit instance, or public route was modified.

The disposable browser run used an isolated Docker network and temporary synthetic storage. Synthetic HTTPS providers and a synthetic SMTP endpoint were used. The isolated hostnames were \`store.m52g14.test\` and \`api.m52g14.test\`; they reproduce the two-origin security properties without touching \`store.prg32.dream.test\` or \`api.prg32.dream.test\`.

No commit, push, deployment, real data migration, importer recreation, or Flask removal was performed.

## 3. Current Dream topology

The read-only inventory was repeated during this milestone.

| Responsibility | Current service | Image/status | Current owner |
|---|---|---|---|
| Public API | \`prg32-cartridge-store-flask-1\` | \`riscv-prg32/cartridge-store:dev\`, healthy | Flask |
| Public storefront | \`prg32-cartridge-store-next-1\` | \`riscv-prg32/cartridge-store-frontend:dev\`, running | Next.js |
| Transitional auth writer | \`prg32-cartridge-store-auth-writer-1\` | \`riscv-prg32/cartridge-store-backend:dev-hot\`, healthy | Fastify transitional writer |
| Transitional auth edge | \`prg32-cartridge-store-auth-writer-edge-proxy-1\` | \`nginx:1.29-alpine\`, healthy | Nginx bridge |
| Transitional auth init | \`prg32-cartridge-store-auth-writer-init-1\` | exited successfully | One-shot initializer |
| Edge proxy | \`dream-traefik-traefik-1\` | \`traefik:v3.6.17\`, healthy | External Dream infrastructure |
| Identity provider | \`dream-authentik-server-1\` | Authentik \`2026.8.0\`, healthy | External Dream infrastructure |
| SMTP test service | \`dream-mailpit-mailpit-1\` | Mailpit \`v1.27.4\`, healthy | External Dream infrastructure |

The relevant networks are \`dream_edge\`, \`dream_mail\`, \`dream_sso\`, \`dream_authentik_private\`, and the application development network \`prg32_cartridge_store_dev\`. The operational template uses the external \`dream_edge\` and \`dream_mail\` networks but was not started.

Low-volume public observations were limited to unauthenticated GET/HEAD requests:

- \`https://store.prg32.dream.test/\`: HTTP/2 200, Next.js/security headers.
- \`https://api.prg32.dream.test/\`: HTTP/2 200, \`Werkzeug/3.1.9\` and \`Python/3.13.16\`; the current Flask API sets a session cookie on the public response. Its value was not collected or reported.
- \`https://sso.dream.test/\`: HTTP/2 302 to the Authentik authentication flow, served by \`uvicorn\`.

No login, form submission, private resource access, WebSocket authentication, or mutating public request was performed.

## 4. Legacy data authority inventory

The local Dream legacy source was inspected read-only at:

\`.local/flask/data/cartridge_store.sqlite\`

This is local Dream legacy data, not the university production dataset and not the transitional auth-writer database. The current read-only inventory is:

- \`PRAGMA integrity_check\`: \`ok\`.
- \`PRAGMA foreign_key_check\`: no rows.
- Users: 0.
- Submissions: 0.
- Scores: 0.
- Runs: 0.
- Samples: 0.
- Download events: 0.
- Store settings: 0.
- User groups: 0.
- API tokens: 0.
- Registration tokens: 0.
- Groups: 1.
- No cartridge object files were present under the local Flask data root.

No checkpoint, vacuum, migration, or write operation was performed. University historical data and cartridge assets remain a separate, later, agent-assisted operation.

## 5. Operational Compose audit

\`deploy/operational/compose.yaml\` contains exactly two application services:

- \`fastify\`, listening internally on port 5080.
- \`next\`, listening internally on port 3000.

The template has no host port publishing, no anonymous volumes, and no Flask, auth-writer, or Nginx service. Canonical storage is one explicit bind-mounted root at \`/data/canonical\`; the external key registry is a Compose secret reference. The containers use Node 24 slim multi-stage images, non-root runtime users, read-only root filesystems, temporary \`/tmp\`, dropped Linux capabilities, \`no-new-privileges\`, health checks, and \`restart: unless-stopped\`.

The operational template requires operator-supplied values for:

- canonical read authorization;
- canonical write authorization;
- session secret;
- bootstrap token;
- approved sender address;
- canonical bind-mounted data directory;
- external \`prg32-secret-key-registry\` secret.

Those values were not guessed, printed, or inserted into the template.

Configuration checks passed for the root development Compose, candidate Compose, operational template with synthetic placeholders, and disposable operational Compose with synthetic paths. The operational template remains a template and was not started against Dream networks.

Classification for the future topology:

| Component | Classification | Decision |
|---|---|---|
| Fastify | KEEP | Future canonical API/auth/workflow owner |
| Next.js | KEEP | Future storefront owner |
| Flask | REMOVE_AFTER_CUTOVER | Retain until authorized observation and rollback window close |
| \`auth-writer\` | REMOVE_AFTER_CUTOVER | Transitional writer only |
| \`auth-writer-init\` | REMOVE_AFTER_CUTOVER | Transitional one-shot initialization only |
| \`auth-writer-edge-proxy\` | REMOVE_AFTER_CUTOVER | Transitional routing bridge only |
| Dream Traefik | EXTERNAL/KEEP | Existing edge owner; no change performed |
| Dream Authentik | EXTERNAL/KEEP | Generic OIDC/SAML provider; no change performed |
| Dream Mailpit | EXTERNAL/KEEP | SMTP endpoint if retained for non-production operation |

## 6. Docker image audit

Both operational images were built from the repository Dockerfiles using Node.js 24 Bookworm slim bases. The backend build separates dependency, builder, production-dependency, and runtime stages. The frontend build separates dependency, builder, and standalone runtime stages.

The production frontend build now explicitly receives operational rewrite targets for Fastify auth, administration, workflow, and federation paths. This prevents a production image from silently falling back to a missing or non-operational route boundary.

Docker emitted a BuildKit warning about routing configuration passed through Docker \`ENV\` instructions. These values are service targets and feature flags, not credentials; no secret value was embedded in the image. The warning is a hardening follow-up, not an acceptance failure.

## 7. Secret and key custody inventory

Operational secrets are represented by external environment/secret-provider references. The application requires a session secret, bootstrap token, canonical read/write authorizations, an external encrypted-settings key registry, and an approved SMTP sender. Generic OIDC and SAML provider credentials/certificates are persisted through the encrypted canonical settings mechanism and require operator-owned provider configuration and key references.

The disposable run used a synthetic key registry and synthetic authentication secrets. It verified that the operational container can read the external key registry through the mounted path. No production secret, password hash, API token, cookie, certificate private key, or key material is included in this report.

Open custody decisions remain: production key provider and rotation policy, backup retention/RPO/RTO, real provider identifiers and redirect registrations, SMTP credentials if SMTP authentication is enabled, and the approved controlled re-login policy.

## 8. Canonical bootstrap verification

The existing storage-v2 test suite and M5.2g operational tests cover:

- explicit canonical bootstrap;
- empty-root and incompatible-root rejection;
- schema v2, storage layout v2, and publication journal v1;
- canonical SQLite integrity and foreign-key checks;
- immutable object checks;
- exclusive writer lease acquisition and release;
- stale lease and interrupted journal recovery;
- fail-closed legacy fallback rejection in canonical-operational mode.

These checks use disposable roots. No operational root was initialized or modified.

## 9. Operational-mode startup

The actual production runtime code paths were started through \`deploy/disposable/operational-compose.yaml\` with:

- \`NODE_ENV=production\`;
- \`canonical-operational\` catalog read mode;
- operational canonical workflow mode;
- freshly seeded synthetic canonical SQLite/object storage;
- synthetic external key registry;
- synthetic OIDC, SAML, and SMTP services;
- isolated Docker network;
- no Flask, auth-writer, Nginx, \`dream_edge\`, or \`dream_mail\` attachment.

Fastify and Next health checks passed. The stack used no test authorization constants from the candidate runtime and no implicit production bootstrap.

## 10. Operational-mode Playwright results

Command executed:

\`\`\`bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
PRG32_M535_OPERATIONAL_E2E=1 pnpm --dir frontend run test:e2e
\`\`\`

Result: **16 passed, 0 failed, one Chromium worker**.

The run exercised the actual production Docker images and operational mode, through an isolated synthetic HTTPS edge with separate Store and API origins. It covered public catalog/detail/media/download paths, local authentication and CSRF, exact CORS and Next proxy behavior, synthetic OIDC and SAML callbacks, secure shared-domain cookies, authenticated WSS, catalog/publishing/review workflows, admin settings/users/moderation/federation, registration/password reset SMTP capture, metrics and public statistics.

The first post-change run exposed one stale assertion that expected a host-only session cookie. The intended dual-origin behavior uses a configured parent domain (\`.m52g14.test\` in the disposable run); the assertion was corrected to accept only the host-only or configured synthetic parent-domain forms. The complete rerun passed 16/16.

## 11. Local authentication

Operational-mode browser coverage passed registration/password-reset SMTP flows, login/logout, CSRF rejection, session persistence, secure cookies, suspension/ban behavior, token lifecycle, and administrative authorization.

The session cookie serializer now accepts an explicit configured cookie domain. This is required when the Store initiates authentication and the API receives the OIDC/SAML callback. The operational template uses \`.prg32.dream.test\`; the disposable harness uses \`.m52g14.test\`. No wildcard or uncontrolled cookie domain is inferred.

## 12. Generic OIDC/SAML

The operational-mode run used synthetic HTTPS OIDC and SAML providers. OIDC discovery, PKCE/state/nonce, callback, identity mapping, and session rotation passed. SAML signed response/assertion validation, ACS callback, replay and identity mapping passed.

The federation and OIDC public origins are now the API origin:

\`https://api.prg32.dream.test\`

The Store/API browser session is preserved by the explicit parent-domain cookie configuration. This matches the preflight contract requiring OIDC redirect and SAML ACS endpoints on the API origin.

The real Authentik instance was not logged into or modified. Real provider metadata, client identifiers, provider secrets, signing certificates, and logout behavior remain operator verification items.

## 13. Publishing and moderation

The operational browser matrix passed synthetic cartridge upload, draft and revision lifecycle, submission, review notes, approval, rejection, resubmission, publication visibility, hidden/unpublished exclusion, and administrative moderation journeys. ZIP validation and resource-limit behavior are also covered by backend regression tests.

No real cartridge or university asset was uploaded, migrated, promoted, or deleted.

## 14. Firmware compatibility

The companion repository \`../PRG32\` was inspected read-only. The existing compatibility tests and operational disposable fixtures preserve:

- \`GET /api/games?limit=100\`;
- \`GET /api/games/<id>/download?architecture=&version=\`;
- discovery ABI \`prg32-store-discovery-1.0\`;
- metadata ABI \`prg32-metadata-1.0\`;
- colophon ABI \`prg32-colophon-1.0\`;
- architectures \`esp32c6\` and \`qemu\`;
- version selection, exact bytes, SHA-256, ETag, and range behavior.

No physical hardware acceptance was performed, so no hardware result is claimed. The companion repository was not modified.

## 15. Scores, metrics and WebSocket

Backend and browser tests passed canonical scores, runs, samples, download telemetry, statistics, metrics authorization/export, and multiplayer WebSocket coverage. The WebSocket relay uses the same application port and the operational disposable run verified authenticated WSS through the isolated HTTPS edge.

mDNS is explicitly disabled in canonical-operational mode and was not started or advertised.

## 16. SMTP/Mailpit

The Dream Mailpit inventory was read-only:

- service: \`mailpit\`;
- network: \`dream_mail\`;
- SMTP port: 1025;
- encryption: none;
- authentication: disabled.

No message was sent to Dream Mailpit. Disposable operational tests used a synthetic SMTP capture service and passed registration/password-reset delivery, SMTP refusal/timeout handling, and secret-safe diagnostics. The future Fastify service must join the externally managed mail network only after the operator supplies the approved SMTP configuration.

## 17. Backup-v4 and restore

The backend suite covered encrypted backup-v4 creation, external key registry use, key rotation, fresh restore, object/database integrity, wrong-key rejection, tamper rejection, interrupted backup/restore handling, journal preservation, and non-ready partial targets.

The M5.2g cutover dry-run also covered the disposable inventory → migration → canonical ownership → backup-v4 → fresh restore → rollback rehearsal chain. These are offline/quiesced disposable checks, not online operational backup proof. No operational backup was created.

## 18. Failure injection

Existing backend tests executed deterministic failure boundaries for:

- storage bootstrap and writer lease;
- publication journal recovery;
- migration checkpoints;
- backup-v4 encryption/finalization;
- interrupted restore;
- corrupt/tampered archive and wrong key;
- object integrity and non-ready restore targets;
- SMTP refusal/timeout/TLS negotiation;
- authentication and federation invalid callbacks.

The first full backend run before the final fix showed 52/52 files and 266/266 tests but exited non-zero because a simulated STARTTLS timeout produced an unhandled TLS socket error. The smallest fix changed the error listener from a one-shot listener to a persistent listener; the targeted email suite and then the complete backend suite passed without unhandled errors.

No failure injection was run against Dream services.

## 19. Single-writer handover

The disposable cutover and operational-runtime tests verified one canonical writer lease, no legacy fallback, controlled shutdown, stale lease handling, interrupted startup recovery, and rollback state classification. This proves the application invariant in a disposable root only.

The real handover still requires a separately authorized source quiescence, snapshot, migration, verification, writer transition, and traffic transition. No simultaneous Flask/Fastify writer state was created.

## 20. Traefik router handover table

The following table describes the required future action; none of the actions has been executed.

| Current owner/router | Future owner | Action at cutover | Validation | Rollback action |
|---|---|---|---|---|
| Next, \`prg32-store-dev\`, \`Host(store.prg32.dream.test)\` | Next operational | Stop/replace current Next service with operational image and keep host/TLS contract | Store GET, health, browser catalog and auth smoke | Restore prior Next image/service |
| Flask, \`prg32-api-dev\`, \`Host(api.prg32.dream.test)\` | Fastify operational | Quiesce Flask, stop old API writer, then expose Fastify labels/service | API health, firmware contract, CORS, WSS, write smoke | Stop Fastify writer, restore Flask only after reconciliation decision |
| Nginx bridge, \`prg32-auth-api-dual\`, API host plus auth prefixes, priority 100 | Fastify auth routes | Disable/remove bridge only after Fastify owns all auth paths | OIDC/SAML/local auth and CSRF on API origin | Restore bridge only after Fastify writer relinquishes ownership |
| Authentik \`dream-sso\`, \`Host(sso.dream.test)\` | External Authentik | No application-side replacement | Read-only reachability and approved provider checks | No change |
| Mailpit \`dream-mailpit\` | External SMTP service | No application-side replacement | Approved SMTP test after authorization | Restore prior SMTP configuration |

Current API host ownership is not unambiguous for handover because Flask owns the general API while the auth bridge has a higher-priority subset. A full Fastify API router must not be enabled until the old Flask and bridge routers are quiesced/removed in one controlled transition.

## 21. Authentik contract

Read-only public observation confirms \`sso.dream.test\` reaches Authentik and redirects to its login flow. Historical M5.2g.24 evidence covers a real Authentik callback path, but it is not a new operational-mode login result.

Still requiring privileged operator verification:

- generic OIDC issuer/discovery/JWKS and client-secret reference;
- API-origin redirect URI;
- generic SAML entity ID, API-origin ACS, signing certificate and overlap;
- provider/subject mapping;
- controlled re-login and logout policy;
- container DNS and TLS trust from the operational Fastify network.

No Authentik provider, user, credential, certificate, or setting was changed.

## 22. Cutover runbook corrections

The M5.3.3 runbook remains historical; this report does not rewrite it. The validated future sequence is:

1. Obtain all approvals in the matrix below.
2. Freeze/quiesce Flask writes and record the source snapshot identity.
3. Verify the read-only legacy inventory and source integrity.
4. Bootstrap a fresh canonical root using operator-owned paths and secrets.
5. Perform the separately authorized agent-assisted migration.
6. Run canonical integrity, compatibility, backup, and restore checks.
7. Acquire Fastify's single-writer lease while Flask is stopped/quiesced.
8. Start Fastify, then Next, with production secrets injected externally.
9. Transition Traefik ownership without overlapping API writers.
10. Run public Store/API health, firmware, auth, WSS, and publication smoke tests.
11. Observe the agreed window and retain rollback evidence.

Abort if the source snapshot is inconsistent, canonical verification fails, writer ownership is ambiguous, provider/SMTP contracts are unresolved, or an old API router remains active during the new writer transition. Exact real paths, values, and credentials remain operator-owned and are intentionally not invented here.

## 23. Operator approval matrix

| Approval | Owner | Status | Evidence | Blocking? | Required action |
|---|---|---|---|---|---|
| Operational deployment authorization | Service owner | OPEN | Disposable runtime only | Yes | Explicitly authorize the handover window |
| Source quiescence | Flask/data owner | NOT GRANTED | Local source remains live | Yes | Schedule and confirm write freeze |
| Canonical target initialization | Data owner | NOT GRANTED | Disposable bootstrap passed | Yes | Approve real root and empty-root check |
| Data migration scope | Product/data owner | OPEN | University migration excluded | Yes | Approve one-time agent-assisted scope |
| External key custody | Security/operator | OPEN | Synthetic registry passed | Yes | Supply provider, permissions, rotation plan |
| Backup retention/RPO/RTO | Operations | OPEN | Disposable backup-v4 passed | Yes | Set retention, RPO, RTO and recovery owner |
| Traefik routing transition | Edge owner | NOT GRANTED | Router inventory read-only | Yes | Approve collision-free label transition |
| Authentik provider configuration | Identity owner | NOT VERIFIED | Public redirect only | Yes | Verify generic OIDC/SAML settings |
| Controlled re-login policy | Identity/product owner | OPEN | Synthetic callbacks passed | Yes | Approve session continuity/re-login behavior |
| SMTP operational configuration | Operations | OPEN | Synthetic SMTP passed | Yes | Approve host, port, sender, auth and TLS policy |
| Synthetic post-cutover test accounts | Operations/security | OPEN | Disposable accounts only | Nonblocking until window | Create time-limited approved accounts |
| Observation window | Operations | OPEN | No window authorized | Yes | Define monitoring and exit criteria |
| Post-write rollback policy | Product/data owner | OPEN | Disposable state machine passed | Yes | Choose reconcile, accepted loss, or forward-fix policy |
| Flask retirement | Service owner | NOT GRANTED | Flask is current public API | Yes | Authorize only after observation and reconciliation |

## 24. Regression results

Node.js 24 was selected with \`nvm use 24\` (local version \`v24.20.0\`). The following checks were executed successfully:

\`\`\`text
pnpm --dir backend run typecheck                 PASS
pnpm --dir backend run lint                      PASS
pnpm --dir backend run test                      PASS — 52 files / 266 tests
pnpm --dir backend run build                     PASS
pnpm --dir frontend run typecheck                PASS
pnpm --dir frontend run lint                     PASS
pnpm --dir frontend run test                     PASS — 22 files / 65 tests
pnpm --dir frontend run build                    PASS
pnpm --dir frontend run test:e2e                 PASS — 16 tests operational mode
SECRET_KEY=... ./.venv313/bin/python -m pytest -q PASS — 64 tests
python -m py_compile                             PASS
docker compose --profile dev config --quiet      PASS
deploy/candidate/compose.yaml config --quiet     PASS
deploy/operational/compose.yaml config --quiet   PASS with synthetic placeholders
deploy/disposable/operational-compose.yaml       PASS with synthetic paths
disposable operational image build                PASS — Fastify + Next
git diff --check                                  PASS
\`\`\`

Test classification:

- **EXECUTED:** all commands above, public unauthenticated observations, actual Docker operational-mode disposable startup, full Playwright run, image build, Compose validation, local SQLite inventory, and Dream Docker metadata inventory.
- **COVERED BY EXISTING TESTS:** storage/bootstrap, writer lease, migration, backup-v4/restore, journal recovery, firmware contracts, metrics/scores, publication/review, OIDC/SAML protocol validation, SMTP failure handling, and edge/WebSocket behavior.
- **NOT EXECUTED:** real cutover, real migration, real Authentik login or provider administration, real Mailpit delivery, physical hardware test, DNS/TLS changes, and post-cutover observation.
- **FAILED AND REMEDIATED:** one stale cookie-domain assertion in the first operational Playwright run; one simulated STARTTLS unhandled-error issue in an earlier full backend run. Both were fixed with regression coverage and final reruns passed.

## 25. Defects fixed

The demonstrated defects addressed in this milestone were narrowly scoped:

1. Operational Next production rewrites did not include all canonical Fastify auth/admin/workflow/federation targets. The operational image now sets the explicit operational rewrite boundary.
2. Exact operational CORS configuration was rejected by an overly broad production guard. Operational mode now accepts only an exact allowlist matching the configured Store origin.
3. STARTTLS timeout handling could emit an unhandled TLS socket error after the request timeout. The listener now remains attached for the socket lifetime; the full backend suite passes.
4. Dual-origin federation callbacks needed a safe shared-cookie boundary. Session and OIDC/SAML correlation cookies now accept an explicit configured domain, and operational OIDC/SAML origins are aligned to the API host.

The cookie-domain change is constrained by configuration and does not infer a domain from an untrusted request.

## 26. Remaining blockers

No unresolved P0 application defect was observed in the tested disposable runtime. The following P1/operational blockers remain:

1. The live Dream API is still Flask-owned; no ownership transition has been authorized or executed.
2. The current Flask API router and higher-priority auth bridge create a routing collision until both are quiesced as part of the handover.
3. Real Authentik provider contracts and controlled re-login policy remain unverified under the no-login safety boundary.
4. Production secret/key custody, backup retention, RPO/RTO, SMTP policy, and operator permissions remain undecided.
5. University data and cartridge migration are intentionally not performed.
6. Post-cutover write reconciliation and accepted-data-loss policy are not approved.
7. No real observation window or rollback owner is assigned.

These blockers are why the result is \`M535_FINAL_PREFLIGHT_PARTIAL\`.

## 27. Files changed

M5.3.5 implementation changes:

- \`backend/src/config/env.ts\`
- \`backend/src/auth/session.ts\`
- \`backend/src/auth/routes.ts\`
- \`backend/src/oidc/correlation.ts\`
- \`backend/src/oidc/routes.ts\`
- \`backend/src/saml/correlation.ts\`
- \`backend/src/saml/routes.ts\`
- \`deploy/operational/compose.yaml\`
- \`deploy/disposable/operational-compose.yaml\`
- \`frontend/e2e/global-setup.mjs\`
- \`frontend/e2e/m52g14.spec.mjs\`
- \`frontend/next.config.ts\`
- \`frontend/Dockerfile.operational\`
- \`backend/src/email/service.ts\`

The repository already contained extensive uncommitted modernization work from earlier milestones; it was preserved and not reset or cleaned. This milestone added this report only as a new Markdown document and did not modify historical modernization reports.

## 28. Final GO/NO-GO decisions

| Decision | Result | Reason |
|---|---|---|
| Disposable operational runtime | \`GO\` | Fastify + Next production images and full browser matrix passed |
| Technical preflight | \`TECHNICAL_PREFLIGHT_PARTIAL\` | Application evidence is strong, but real external provider and edge handover remain unverified |
| Operational authorization | \`OPERATIONAL_AUTHORIZATION_NO_GO\` | Required human approvals and production custody decisions are open |
| Operational cutover | \`OPERATIONAL_CUTOVER_NO_GO\` | Current public API remains Flask and routing ownership has not changed |
| Flask retirement | \`FLASK_RETIREMENT_NO_GO\` | Flask is still the live API authority and rollback/reconciliation are not authorized |

## 29. Recommended next phase

The next phase should be a separately authorized operational handover preparation, not an automatic cutover. It should first close the approval matrix, verify the real generic Authentik OIDC/SAML registrations with the identity owner, confirm SMTP/key custody, define the migration snapshot and rollback policy, and schedule a controlled write freeze. Only after those decisions should an operator execute the M5.3.3 runbook against the real data.

Until then, retain Flask as the public API owner, keep the transitional auth bridge unchanged, and continue using the disposable operational stack for regression validation.

