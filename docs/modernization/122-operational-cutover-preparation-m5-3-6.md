# PRG32 Cartridge Store — M5.3.6 Operational Cutover Preparation

Date: 2026-10-14  
Decision: \`M536_CUTOVER_PREPARATION_GO\`  
Operational cutover: \`OPERATIONAL_CUTOVER_NO_GO\`  
Flask retirement: \`FLASK_RETIREMENT_NO_GO\`

## 1. Executive result

M5.3.6 preparation is complete. The remaining cutover blockers are now reduced to explicit operator decisions and controlled operational actions. No cutover, deployment, real data migration, routing change, Authentik mutation, Mailpit mutation, Flask shutdown, or transitional-service removal was performed.

The preparation result is:

- Current Dream ownership inventoried.
- Local Flask state inventoried read-only.
- Transitional auth-writer state inventoried read-only and classified as non-discardable without approval.
- University content explicitly separated from the initial application cutover.
- Authority transition matrix prepared.
- Actual Traefik router ownership and collision points documented.
- Exact future router handover sequence prepared.
- Generic OIDC/SAML requirements separated into confirmed, synthetic-only, and operator-verification items.
- Secret/key custody proposal prepared.
- Backup/RPO/RTO proposal prepared without configuring a scheduler.
- SMTP/Mailpit role clarified.
- Controlled re-login recommended.
- Canonical root and permissions contract documented.
- Future commands classified by safety.
- Pre-cutover acceptance matrix and minimum authorization package prepared.
- One demonstrated P1 deployment defect fixed: Compose secret mount path.
- Disposable operational browser acceptance remained **16/16 passed** after the fix.

The preparation is sufficient for an operator approval review. It does not authorize execution.

## 2. Scope and safety

This milestone was limited to read-only Dream inspection, inactive deployment-template preparation, disposable validation, and the one demonstrated Compose defect remediation.

No operational Dream service was started, stopped, restarted, recreated, or reconfigured. No operational network, SQLite database, object storage, DNS record, TLS certificate, Traefik router, Authentik provider, Mailpit instance, secret, or key was modified.

The disposable validation used temporary synthetic data and isolated application networks. It did not attach to \`dream_edge\`, \`dream_mail\`, Authentik, Traefik, Flask, or the transitional auth services.

No university cartridge, image, metadata, or binary was downloaded. No university importer, importer CLI, manifest ABI, or permanent university integration was recreated.

No commit, push, staging, worktree cleanup, Git history rewrite, or deletion of modernization evidence was performed.

## 3. Current operational topology

The current Dream application ownership remains:

| Responsibility | Current service | Current owner | Status |
|---|---|---|---|
| Storefront \`store.prg32.dream.test\` | \`prg32-cartridge-store-next-1\` | Next.js | Running |
| General API \`api.prg32.dream.test\` | \`prg32-cartridge-store-flask-1\` | Flask | Healthy |
| Auth/API subset | \`prg32-cartridge-store-auth-writer-edge-proxy-1\` → auth writer | Transitional Fastify + Nginx | Healthy |
| Edge | \`dream-traefik-traefik-1\` | External Dream Traefik | Healthy |
| SSO | \`dream-authentik-server-1\` | External Authentik | Healthy |
| SMTP capture | \`dream-mailpit-mailpit-1\` | External Mailpit | Healthy |
| Auth initialization | \`prg32-cartridge-store-auth-writer-init-1\` | Transitional one-shot service | Exited successfully |

The current relevant networks are:

- \`dream_edge\`: external, non-internal edge network.
- \`dream_mail\`: external, internal mail network.
- \`dream_sso\`: external SSO network.
- \`dream_authentik_private\`: internal Authentik network.
- \`prg32_cartridge_store_dev\`: current application development network.

The future topology remains two application services:

- Fastify operational on internal port 5080.
- Next.js operational on internal port 3000.

External services remain Traefik, generic Authentik, and Mailpit/approved SMTP.

## 4. Local Flask data inventory

The local Dream Flask database was inspected read-only:

\`.local/flask/data/cartridge_store.sqlite\`

Current observations:

- SQLite integrity: \`ok\`.
- Foreign-key check: zero violations.
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
- Local Flask data directory: one SQLite file; no cartridge object files.

Classification:

| Flask category | Classification | Reason |
|---|---|---|
| Catalog, binaries, media | NOT APPLICABLE for current local data | No local content exists |
| Publication/review/submissions | NOT APPLICABLE | No local submissions |
| Users, sessions, tokens | NOT APPLICABLE | No local users/tokens |
| Scores/runs/metrics/telemetry | NOT APPLICABLE | Empty |
| Default group/configuration | REINITIALIZE only with approval | Empty local system has no content to preserve |
| Whole legacy root | PRESERVE FOR ROLLBACK until handover closes | It is the current authority even though empty |

A fresh canonical bootstrap is the recommended data action for this local empty Dream state, but it must be separately authorized and was not executed.

## 5. Transitional auth-writer inventory

The transitional auth-writer database was inspected read-only:

\`.local/writer/auth-data/auth.sqlite\`

Current observations:

- SQLite integrity: \`ok\`.
- Foreign-key check: zero violations.
- Users: 5.
- Roles: 1 administrator and 4 regular users.
- API token rows: 3.
- Auth sessions: 19.
- Federation providers: 2.
- External identity mappings: 2.
- Federation replay records: 6.
- Federation transaction records: 10.
- Submissions: 1.
- Runs: 1.
- Samples: 1.
- Scores: 1.
- Store settings: 1.
- Groups: 1.
- User/group memberships: 2.
- Password-reset and registration token tables contain no active rows observed.

The database file is mode \`0600\`. The local identity distribution indicates development/synthetic federation state, but the records include sessions and API tokens and cannot be discarded solely because the service is transitional.

The separate shadow database \`.local/writer/shadow/shadow.sqlite\` is also internally consistent and empty of users/content except for its development metadata rows. The transitional store index has only small local development state.

Classification:

| Transitional category | Classification | Cutover policy |
|---|---|---|
| Synthetic local accounts | DISCARD ONLY AFTER EXPLICIT APPROVAL | Do not copy blindly |
| Federation provider definitions | PRESERVE FOR ROLLBACK / REVIEW | Reconcile with approved generic provider contract |
| External identity mappings | MIGRATE only after identity-owner approval | Preserve subject mapping; never link by email alone |
| API tokens | REINITIALIZE | Reissue after cutover; do not copy token values |
| Sessions | DISCARD/REINITIALIZE under CONTROLLED_RELOGIN | Do not assume Flask/Fastify session portability |
| Submissions/drafts | PRESERVE FOR ROLLBACK until reviewed | Do not publish or silently discard |
| Runs/samples/scores/telemetry | MIGRATE only if owner confirms scope | Current records are not assumed disposable |
| Settings | MIGRATE only after encrypted-settings review | Never copy plaintext secret values |
| Transitional database | PRESERVE FOR ROLLBACK until explicit disposal | No deletion performed |

Recommended account policy: \`CONTROLLED_RELOGIN\`. Reissue API tokens, invalidate transitional sessions at the handover boundary, preserve approved federation subject mappings, and do not auto-link identities by email.

## 6. University data separation

University Store content is a third authority and is not part of the initial Fastify deployment.

It is explicitly classified as:

- not required for the initial application deployment;
- not inspected or downloaded in this milestone;
- not included in the local Flask inventory;
- not represented by a new importer or manifest;
- to be handled later by a separately authorized, one-time, agent-assisted operation using canonical administrative workflows.

The initial cutover must operate against an approved canonical root independently of university content migration.

## 7. Application authority transition

The future authority is the canonical Fastify SQLite database plus canonical filesystem object storage. No dual writes, legacy \`index.json\` authority, Flask fallback, or transitional auth-writer dependency are permitted after handover.

| Domain | Current authority | Future authority | Cutover action | Validation | Rollback implication |
|---|---|---|---|---|---|
| Catalog | Flask public API / local state | Fastify canonical SQLite | Stop old API writer; expose Fastify | Catalog/detail parity | Restore Flask only after new writes are reconciled |
| Cartridge binaries | Flask filesystem store where present | Canonical object storage | Snapshot/inventory then canonical bootstrap | Hash/byte verification | Preserve old source until observation closes |
| Media | Flask filesystem store where present | Canonical object storage | Same as binaries | Exact media hashes | Restore only with source/target reconciliation |
| Publication | Flask legacy behavior plus transitional workflow data | Fastify journal + SQLite | Verify completed states before handover | Publication audit | Incomplete operations require recovery decision |
| Review | Transitional/canonical workflow state | Fastify canonical review tables | Review pending records before handover | Approval/rejection parity | Preserve pending decisions |
| Local authentication | Flask legacy plus auth-writer subset | Fastify canonical auth | Controlled re-login | Login/CSRF/session checks | No session-format assumption |
| OIDC identities | Transitional provider/mapping state | Fastify canonical federation tables | Review and reconcile providers/subjects | Subject mapping, no email linking | Re-login may be required |
| SAML identities | Transitional provider/mapping state | Fastify canonical federation tables | Review ACS/entity/certificate contract | Signed callback and replay checks | Re-login may be required |
| Sessions | Flask/auth-writer sessions | New Fastify sessions | Invalidate/reissue | No stale-session acceptance | User-visible re-login |
| API tokens | Existing transitional rows | Newly issued Fastify tokens | Reissue, never copy secrets | Token lifecycle | Old tokens stop working |
| Registration | Transitional auth writer | Fastify canonical auth | Enable after handover | Registration email flow | Preserve provider policy |
| Password recovery | Transitional auth writer | Fastify canonical auth | Enable after SMTP gate | Reset flow | No recovery mail until SMTP approved |
| SMTP settings | Transitional/canonical settings | Encrypted Fastify settings | Import approved non-secret settings | Synthetic/approved SMTP test | Restore old config if delivery fails |
| Administrative settings | Transitional/canonical settings | Fastify canonical settings | Verify encrypted migration | Read/write audit | Preserve old settings source |
| Scores | Flask/legacy or transitional records | Fastify canonical SQLite | Migrate only approved rows | Score contract | Reconcile post-cutover writes |
| Runs | Flask/legacy or transitional records | Fastify canonical SQLite | Migrate only approved rows | Run/detail/export parity | Reconcile post-cutover writes |
| Metrics | Flask/legacy or transitional records | Fastify canonical SQLite | Migrate only approved rows | Resource limits and auth | Reconcile post-cutover writes |
| Download telemetry | Flask/legacy | Fastify canonical SQLite | Define ownership before handover | Download event audit | Data-loss window if not reconciled |
| WebSocket | Current Flask-compatible relay | Fastify on port 5080 | Switch with API owner | WSS join/relay/limit | Restore only after Fastify stops |
| mDNS | Disabled/default | Disabled by default | No action | Configuration check | No discovery dependency |

## 8. Traefik router inventory

Read-only container labels confirm:

| Router | Rule | Priority | Current service | Target port |
|---|---|---:|---|---:|
| \`prg32-store-dev\` | \`Host(store.prg32.dream.test)\` | default | current Next container | 3000 |
| \`prg32-api-dev\` | \`Host(api.prg32.dream.test)\` | default | current Flask container | 5080 |
| \`prg32-auth-api-dual\` | API host plus \`/auth\`, \`/api/auth\`, \`/api/admin/federation\` | 100 | Nginx auth bridge | 5090 |
| \`dream-sso\` | \`Host(sso.dream.test)\` | default | Authentik server | 9000 |
| \`dream-mailpit\` | \`Host(mailpit.dream.test)\` | default | Mailpit | 8025 |

All relevant routers use the \`websecure\` entrypoint, TLS, \`dream-security-headers@file\`, and \`dream_edge\`.

The current API host is split: Flask owns the general API while the higher-priority Nginx router owns selected authentication/admin paths. Starting the operational Fastify labels while those routers remain live would create a host collision and ambiguous ownership.

The operational template proposes:

- \`prg32-api-template\`: API host → Fastify port 5080.
- \`prg32-store-template\`: Store host → Next port 3000.

The suffix differs but the Host rules do not. The old routers must therefore be quiesced before the new services are exposed.

## 9. Exact router handover plan

### Preconditions

The operator must provide:

- \`PRG32_OPERATIONAL_PROJECT\`: expected Compose project is the template name \`prg32-operational-template\`, confirm before execution.
- \`PRG32_OPERATIONAL_DATA_DIR\`: approved canonical bind root.
- \`PRG32_OPERATIONAL_KEY_REGISTRY_FILE\`: external key registry file, mode 0600.
- All production secret values through the approved custody process.
- Source quiescence approval.
- Migration scope approval.
- Traefik handover approval.
- Rollback owner and observation window.

### Read-only preflight commands

Classification: \`READ_ONLY\`.

\`\`\`bash
docker compose -p prg32-cartridge-store -f docker-compose.yml ps
docker inspect prg32-cartridge-store-flask-1
docker inspect prg32-cartridge-store-next-1
docker inspect prg32-cartridge-store-auth-writer-1
docker inspect prg32-cartridge-store-auth-writer-edge-proxy-1
docker network inspect dream_edge
docker network inspect dream_mail
docker compose -f deploy/operational/compose.yaml config --quiet
docker secret inspect prg32-secret-key-registry
\`\`\`

The last command is only a capability check. On the inspected local Docker daemon it returned “This node is not a swarm manager”. Therefore the operational template now uses an operator-supplied file-backed Compose secret rather than assuming a Docker Swarm secret exists.

### Operator-approved mutation sequence

Classification: \`OPERATIONAL_MUTATION_REQUIRES_APPROVAL\`.

1. Quiesce and snapshot the approved source. Do not continue if any write remains possible.
2. Verify canonical root, key registry permissions, backup evidence, and source integrity.
3. Stop the old application writers and storefront without removing containers or volumes:

\`\`\`bash
docker compose -p prg32-cartridge-store --profile dev --profile dual-origin -f docker-compose.yml stop \
  flask next auth-writer auth-writer-edge-proxy
\`\`\`

4. Start the future two-service stack only after the previous routers are stopped:

\`\`\`bash
docker compose -p prg32-operational-template \
  -f deploy/operational/compose.yaml up -d fastify next
\`\`\`

5. Verify the future containers and health checks:

\`\`\`bash
docker compose -p prg32-operational-template \
  -f deploy/operational/compose.yaml ps
docker inspect <operator-confirmed-fastify-container>
docker inspect <operator-confirmed-next-container>
\`\`\`

6. Validate the public hosts:

\`\`\`bash
curl --fail --silent --show-error --max-time 10 https://api.prg32.dream.test/ready
curl --fail --silent --show-error --max-time 10 https://store.prg32.dream.test/health
\`\`\`

7. Run the approved smoke matrix: catalog, firmware discovery, download hash/ETag/range, local auth/CSRF, approved OIDC/SAML callback, WSS, publishing/review, SMTP, and backup readiness.

### Expected router state

- \`prg32-api-template\` is the only API host application router.
- \`prg32-store-template\` is the only Store host application router.
- \`dream-sso\` remains the only SSO router.
- No \`prg32-api-dev\`, \`prg32-auth-api-dual\`, or \`prg32-store-dev\` router remains active for the application hosts.

### Abort conditions

Abort before exposing the new routers if:

- any old API writer is still accepting writes;
- either old API/auth router remains active;
- the canonical root is not empty/approved or fails integrity checks;
- the key registry file is missing, too permissive, or unreadable;
- the Fastify writer lease cannot be acquired;
- Authentik redirect/ACS contracts are not approved;
- SMTP settings are not approved;
- health, CORS, CSRF, WSS, or firmware smoke checks fail.

### Rollback

Rollback is not “restart Flask” after Fastify accepts writes. The operator must first stop Fastify and prevent further writes, then choose a forward fix, reconcile/export new canonical writes, or explicitly accept data loss. Only after that decision may the previous services be started:

\`\`\`bash
docker compose -p prg32-operational-template \
  -f deploy/operational/compose.yaml stop fastify next
docker compose -p prg32-cartridge-store --profile dev --profile dual-origin -f docker-compose.yml start \
  flask next auth-writer auth-writer-edge-proxy
\`\`\`

No \`down -v\`, \`system prune\`, \`volume prune\`, \`rm -rf\`, or broad cleanup command is part of the plan.

## 10. Authentik OIDC contract

Confirmed:

- Public SSO host: \`https://sso.dream.test\`.
- Public root redirects to the Authentik authentication flow.
- The application contract uses API-origin callbacks.
- Synthetic OIDC discovery/PKCE/state/nonce/callback was passed in disposable operational mode.

Not confirmed under the read-only/no-login boundary:

- Actual issuer and discovery URL for the selected generic provider.
- JWKS URL and certificate trust from the operational Fastify network.
- Client identifier and secret reference.
- Exact approved redirect URI:
  \`https://api.prg32.dream.test/api/auth/oidc/<providerId>/callback\`.
- Scopes and logout behavior.
- Real provider/subject mappings.
- Controlled re-login behavior for existing users.

The public \`/.well-known/openid-configuration\` request on \`sso.dream.test\` returned 404, so no public discovery document was claimed. Provider-specific metadata requires operator/provider knowledge and privileged inspection.

Required policy:

- Preserve generic OIDC.
- Never auto-link by email.
- Use provider + subject identity.
- Require explicit controlled re-login where the subject mapping is not already proven.

## 11. Authentik SAML contract

Confirmed:

- SAML is implemented generically in Fastify.
- Synthetic signed response/assertion, ACS, replay, audience, destination, and certificate checks pass in disposable tests.
- Intended public ACS origin is the API origin.

Required operational values:

- Entity ID: \`OPERATOR_INPUT_REQUIRED\`.
- ACS URL: \`https://api.prg32.dream.test/api/auth/saml/<providerId>/acs\`.
- IdP SSO URL: \`OPERATOR_INPUT_REQUIRED\`.
- IdP signing certificate reference: \`OPERATOR_INPUT_REQUIRED\`.
- NameID/subject mapping: provider + subject, not email.
- Metadata URL/document: \`OPERATOR_INPUT_REQUIRED\`.
- Logout policy: \`OPERATOR_INPUT_REQUIRED\`.
- Certificate overlap/rotation owner: \`OPERATOR_INPUT_REQUIRED\`.

No real Authentik provider or certificate was created, changed, rotated, or tested through login.

## 12. Secret/key custody proposal

The current operational template uses a file-backed Compose secret for the encrypted settings key registry because the inspected Docker daemon is not a Swarm manager. The file is supplied outside Git and mounted read-only at:

\`/run/secrets/prg32-secret-key-registry\`

The application path and Compose target now match exactly.

| Secret/material | Authority | Delivery | Permissions | Rotation/recovery |
|---|---|---|---|---|
| Session secret | Service/security owner | Environment injection | Not logged; no Git | Rotate with controlled re-login |
| Bootstrap token | Service/security owner | Environment injection | One-time/limited use | Replace after bootstrap |
| Canonical read authorization | Service owner | Environment injection | Runtime only | Rotate with maintenance |
| Canonical write authorization | Service owner | Environment injection | Runtime only | Rotate with writer handover |
| Encrypted settings key registry | Security/operator | External file-backed Compose secret | Host file 0600; container read-only | Preserve decrypt-only old keys during rotation |
| Backup-v4 keys | Security/operator | Same external key registry/provider | Never inside archive | Retain old decrypt-only keys per policy |
| OIDC client secret | Identity owner | External encrypted settings/secret delivery | Never in Compose/build | Rotate per provider policy |
| SAML signing material | Identity owner | External encrypted settings/secret delivery | Never in Git/image | Overlap old/new certificates |
| SMTP credentials | Operations | Encrypted settings or external secret | No plaintext admin output | Rotate per relay policy |

The proposal introduces no Vault, KMS, Redis, PostgreSQL, or new infrastructure. \`OPERATOR_INPUT_REQUIRED\` remains for the actual host path, owner/group, rotation mechanism, and backup of the key registry itself.

Required file preflight after approval:

\`\`\`bash
test -f "$PRG32_OPERATIONAL_KEY_REGISTRY_FILE"
test "$(stat -c '%a' "$PRG32_OPERATIONAL_KEY_REGISTRY_FILE")" = 600
\`\`\`

On macOS, use the equivalent \`stat\` syntax and verify the Docker host-side file permissions explicitly. Do not run this against a guessed production path.

## 13. Backup policy proposal

The existing \`prg32-cartridge-store-backup-4.0\` implementation is retained. No backup redesign or scheduler was added.

Proposed policy — **PROPOSED — NOT APPROVED**:

- Mode: quiesced/offline canonical backup, not online backup.
- Destination: \`OPERATOR_INPUT_REQUIRED\` external backup filesystem.
- Frequency: daily full backup plus pre/post-cutover backup.
- Retention: \`OPERATOR_INPUT_REQUIRED\`; recommend at least one short-term operational window and one independently stored recovery copy.
- Encryption: authenticated backup-v4 using the external key registry.
- Integrity: independent verification after creation and before restore.
- RPO: \`OPERATOR_INPUT_REQUIRED\`; proposed maximum 24 hours before steady-state scheduling.
- RTO: \`OPERATOR_INPUT_REQUIRED\`; proposed target to be measured during a real recovery rehearsal.
- Off-host copy: required before Flask retirement.
- Alerting: required for backup failure, verification failure, low capacity, and key-registry unavailability.
- Recovery owner: \`OPERATOR_INPUT_REQUIRED\`.
- Storage capacity: \`OPERATOR_INPUT_REQUIRED\`.

Do not configure a scheduler, create a production backup, rotate a production key, or claim the proposal is approved.

## 14. SMTP/Mailpit policy

Read-only Dream Mailpit contract:

- Host: \`mailpit\`.
- Port: 1025.
- Network: \`dream_mail\`.
- Encryption: none.
- Authentication: disabled.

Recommendation: retain Mailpit for development/test capture only. Do not treat it as external production email delivery.

If the application requires real outbound registration/password-reset/recovery messages, use an approved SMTP relay/provider with:

- host, port, TLS mode, authentication mode;
- sender address and domain authorization;
- credential/key custody;
- delivery monitoring;
- bounce/failure ownership.

All values are \`OPERATOR_INPUT_REQUIRED\`. No operational email was sent.

## 15. Session/account transition

Flask and Fastify session formats are not assumed portable. The recommended policy is:

\`CONTROLLED_RELOGIN\`

At cutover:

- Do not migrate Flask session cookies.
- Invalidate transitional sessions after the ownership boundary.
- Require users to log in again through Fastify.
- Preserve only approved provider + subject identity mappings.
- Reissue API tokens; do not copy token values.
- Do not auto-link by email.
- Announce the re-login window and recovery path.
- Keep the legacy source preserved for rollback evidence.

The transitional database contains five users, three API-token rows, and nineteen sessions, so it cannot be treated as disposable without explicit owner approval.

## 16. Canonical root and permissions

The operational contract is:

- Canonical root: \`OPERATOR_INPUT_REQUIRED\`, injected as \`PRG32_OPERATIONAL_DATA_DIR\`.
- SQLite: \`<canonical-root>/store.sqlite\`.
- Object/staging/recovery material: under the canonical root according to storage-v2 layout.
- Backup output: \`OPERATOR_INPUT_REQUIRED\`, outside the application image and not inside the live canonical root.
- Key registry source: \`PRG32_OPERATIONAL_KEY_REGISTRY_FILE\`, outside Git.
- Container key path: \`/run/secrets/prg32-secret-key-registry\`.
- Container user: non-root \`node\`.
- Root filesystem: read-only.
- Writable paths: canonical bind mount and tmpfs only.
- mDNS: disabled.

Before any approved start, the operator must verify:

- canonical root ownership allows the container runtime user to perform approved writes;
- parent directories do not expose unrelated data;
- SQLite/object/staging permissions are least privilege;
- key registry file is mode 0600;
- backup output is separate and protected;
- no pre-existing operational root is silently reused.

No real root was created, chowned, chmodded, initialized, or migrated.

## 17. Cutover command classification

### READ_ONLY

- \`git status --short\`, \`git diff --stat\`, \`git diff --check\`.
- \`docker ps\`, \`docker inspect\`, \`docker network inspect\`.
- \`docker compose ... config --quiet\`.
- SQLite opened with \`mode=ro\`.
- \`PRAGMA integrity_check\` and \`PRAGMA foreign_key_check\`.
- Public unauthenticated GET/HEAD checks.
- \`docker secret inspect\` capability check.

### DISPOSABLE_ONLY

- \`docker compose -f deploy/disposable/operational-compose.yaml up\`.
- Synthetic key registry generation.
- Disposable canonical bootstrap.
- Operational-mode Playwright.
- Backup-v4/restore/fault-injection suites.
- Synthetic SMTP/OIDC/SAML providers.

### OPERATIONAL_MUTATION_REQUIRES_APPROVAL

- Stopping current Flask/Next/auth-writer services.
- Starting the operational Fastify/Next Compose project.
- Any canonical root bootstrap or migration.
- Any Traefik ownership transition.
- Any real Authentik/SMTP setting activation.
- Any post-cutover backup scheduling.

### DESTRUCTIVE_REQUIRES_SEPARATE_APPROVAL

- Deleting transitional services, volumes, databases, or reports.
- Removing Flask after the observation window.
- Discarding legacy/auth-writer data.
- Key retirement.
- Any cleanup that could remove rollback evidence.

The plan deliberately contains no \`docker compose down -v\`, \`docker system prune\`, \`docker volume prune\`, \`rm -rf\`, or \`git clean -fd\`.

## 18. Pre-cutover acceptance matrix

The following is a live-window checklist. Disposable evidence is not marked as live proof.

| Gate | Expected result | Verification | Responsible operator | Current evidence | Remaining approval/abort |
|---|---|---|---|---|---|
| Source integrity | Read-only checks pass | SQLite/object audit | Data owner | Local Flask integrity passed | Approve source snapshot |
| Canonical root | Approved fresh/verified root | Bootstrap + schema audit | Data owner | Disposable passed | Root path approval |
| Single writer | Fastify only | Lease/readiness | Backend owner | Disposable passed | Abort on any old writer |
| Fastify readiness | Healthy/ready | \`/ready\` | Backend owner | Disposable passed | Abort on failure |
| Next readiness | Healthy | \`/health\` | Frontend owner | Disposable passed | Abort on failure |
| API routing | Only Fastify router | Traefik inspect + curl | Edge owner | Current Flask split observed | Handover approval |
| Store routing | Only Next operational | Traefik inspect + browser | Edge owner | Current Next observed | Handover approval |
| Local auth | Login/CSRF/logout pass | Approved smoke account | Auth owner | Synthetic passed | Re-login approval |
| OIDC | API callback/subject mapping pass | Approved provider test | Identity owner | Synthetic only | Real provider verification |
| SAML | API ACS/signature pass | Approved provider test | Identity owner | Synthetic only | Real provider verification |
| Controlled re-login | No stale session acceptance | Session test | Auth owner | Policy prepared | User comms/approval |
| CSRF | Invalid requests rejected | API/browser test | Backend owner | Synthetic passed | Abort on failure |
| Secure cookies | Secure/domain/SameSite correct | Header/browser inspection | Security owner | Synthetic passed | Review live headers |
| CORS | Exact Store allowlist | Preflight request | Backend owner | Synthetic passed | Abort on wildcard/mismatch |
| Firmware discovery | ABI/fields stable | Discovery GET | Firmware owner | Contract tests passed | Live smoke |
| Catalog/download | Exact bytes/hash/ETag/range | Firmware/client smoke | Firmware owner | Disposable passed | Abort on mismatch |
| Media | Exact media response | GET/hash | Frontend/backend owner | Disposable passed | Abort on mismatch |
| Publishing/review | Workflow consistent | Approved test data | Product owner | Disposable passed | Data scope approval |
| Scores/runs | Canonical writes/readback | API smoke | Backend owner | Disposable passed | Data scope approval |
| Metrics/telemetry | Limits/auth/write ownership | API smoke | Backend owner | Disposable passed | Write ownership approval |
| WebSocket | WSS join/relay works | Client smoke | Backend/edge owner | Disposable passed | Abort on upgrade failure |
| SMTP | Approved relay works | Synthetic then approved mail | Operations | Synthetic only | SMTP decision |
| Backup-v4 | Verified backup exists | Independent verifier | Operations | Disposable passed | Destination/RPO/RTO |
| Fresh restore | Clean target verifies | Restore audit | Operations | Disposable passed | Recovery owner |
| Monitoring | Alerts/logs available | Operator checks | Operations | Not configured as live | Define window |
| Rollback | Writer/traffic sequence known | Runbook review | Service owner | Disposable state machine | Policy approval |
| Observation window | Exit criteria defined | Runbook | Operations | Not assigned | Assign owner/window |
| mDNS disabled | No registration | Config/readiness | Backend owner | Config enforced | Abort if enabled |
| No Flask fallback | Operational env rejects legacy fallback | Config/runtime check | Backend owner | Disposable passed | Abort on legacy env |
| No dual writer | Old writers stopped before new start | Process/router inspection | Service owner | Not live-tested | Hard cutover gate |

## 19. Disposable validation

The operational Docker images and Compose contract were validated with synthetic data and isolated networks. The relevant post-fix command was:

\`\`\`bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
PRG32_M535_OPERATIONAL_E2E=1 pnpm --dir frontend run test:e2e
\`\`\`

Result: **16 passed in 28.2 seconds** after the secret-target fix.

This validation exercised canonical-operational production containers, synthetic key registry, synthetic credentials, synthetic OIDC/SAML/SMTP, Store/API HTTPS origins, CSRF, secure cookies, WSS, workflows, administration and recovery-related paths. It did not use Flask or Dream networks.

No second full browser suite was invented; the existing applicable suite was rerun because the deployment Compose contract changed.

## 20. Git/repository hygiene

The worktree is intentionally dirty from earlier modernization milestones. It contains:

- many prior application changes;
- untracked modernization reports;
- generated/test artifacts;
- operational/candidate/disposable deployment files;
- the previous M5.3.5 report.

No files were staged, committed, pushed, cleaned, or deleted.

Future cleanup plan:

1. Preserve migration and cutover evidence until the Flask retirement gate closes.
2. Archive historical evidence outside the final application repository when explicitly authorized.
3. Retain concise definitive architecture/runbook reports.
4. Avoid \`git add -A\` while the worktree contains generated or historical artifacts.
5. Require explicit authorization before deleting reports, changing tracking, or rewriting history.

## 21. Operator decision matrix

| Decision | Options | Recommendation | Implication | Operator | Blocking | Codex preparation |
|---|---|---|---|---|---|---|
| Canonical root | Existing root / fresh root | Fresh approved root | Avoids empty legacy ambiguity | Data owner | Yes | Prepared contract |
| Key custody | File-backed Compose secret / Swarm secret / new KMS | Existing file-backed Compose secret | Works on current non-Swarm Docker; file must be protected | Security/operator | Yes | Template fixed |
| Backup destination | Local protected / off-host / provider | Protected off-host copy plus local staging | Improves recovery | Operations | Yes | Policy prepared |
| RPO/RTO | Operator values | Set explicit values before cutover | Defines loss/recovery expectations | Operations | Yes | Proposal prepared |
| OIDC mapping | Existing provider / new provider | Existing generic provider after review | Avoids provider mutation | Identity owner | Yes | Contract prepared |
| SAML mapping | Existing provider / new provider | Existing generic provider after review | Certificate/ACS continuity | Identity owner | Yes | Contract prepared |
| Session transition | Attempt portability / controlled re-login | Controlled re-login | Avoids unsafe format assumptions | Identity/product owner | Yes | Policy prepared |
| SMTP role | Mailpit capture / approved relay | Mailpit only for test; relay for real mail | Mailpit is not production delivery | Operations | Yes if mail required | Contract prepared |
| Flask quiescence | Immediate stop / scheduled freeze | Scheduled freeze with snapshot | Prevents data loss | Service/data owner | Yes | Sequence prepared |
| Auth-writer state | Migrate / preserve / discard | Preserve then classify; do not blindly migrate | Contains users/tokens/sessions | Security/data owner | Yes | Inventory prepared |
| Traefik handover | Overlap / stop-then-start | Stop old routers before new routers | Prevents dual writer/collision | Edge owner | Yes | Commands prepared |
| Deployment window | Immediate / scheduled | Scheduled maintenance window | Allows rollback and observation | Operations | Yes | Checklist prepared |
| Post-write rollback | Restart Flask / reconcile / accepted loss / forward fix | Forward fix; reconcile if needed | Restart alone is unsafe | Service/data owner | Yes | Policy prepared |
| Observation window | Undefined / explicit | Explicit owner, duration, exit criteria | Required before retirement | Operations | Yes | Checklist prepared |
| University timing | Before cutover / after cutover | After initial Fastify deployment | Independent scope | Product/data owner | No for app cutover | Separation documented |
| Flask retirement | Immediate / observation-gated | Observation-gated | Preserves rollback | Service owner | Yes | No removal performed |

## 22. Minimum authorization package

The service owner must approve the following package before any operational mutation:

- Current state: Flask API and Next Store are live; auth bridge owns selected API paths.
- Future state: Fastify canonical API/auth/workflow plus Next Store.
- Affected services: current Flask, current Next, auth-writer, auth-writer-edge-proxy; future Fastify and Next operational services.
- Affected data: approved canonical root and explicitly approved source snapshot; transitional auth database remains preserved until classified.
- Affected networks: current application/edge networks; future Fastify/Next use \`app_private\` plus external \`dream_edge\` and optionally \`dream_mail\`.
- Routing changes: API host from Flask/bridge to Fastify; Store host from dev Next to operational Next.
- Secret references: operator-provided session/bootstrap/read/write values and external key registry file.
- Backup: approved encrypted backup-v4 destination, retention, RPO/RTO, independent verification.
- Downtime: \`OPERATOR_INPUT_REQUIRED\`; expected controlled interval while old routers stop and new routers start.
- Sessions: controlled re-login; no cookie portability assumption.
- Rollback: stop new writers, reconcile/forward-fix or explicitly accept data loss, then restore old ownership.
- Observation: \`OPERATOR_INPUT_REQUIRED\` duration, owner and exit criteria.
- Unknowns: real Authentik provider contract, SMTP relay/role, root path/permissions, key custody, data scope, approvals.

## 23. Commands and actual results

Node.js 24 was selected with \`nvm use 24\`.

Fresh focused checks executed in M5.3.6:

\`\`\`text
pnpm --dir backend run typecheck                 PASS
pnpm --dir backend run lint                      PASS
pnpm --dir frontend run typecheck                PASS
pnpm --dir frontend run lint                     PASS
docker compose --profile dev config --quiet      PASS
deploy/candidate/compose.yaml config --quiet     PASS
deploy/operational/compose.yaml config --quiet   PASS with synthetic file secret
git diff --check                                  PASS
operational disposable Playwright                PASS — 16/16
\`\`\`

The previous M5.3.5 baseline remains:

\`\`\`text
backend: 52 files / 266 tests
frontend: 22 files / 65 tests
Python: 64 tests
operational image builds: PASS
\`\`\`

The Docker secret capability check returned:

\`\`\`text
This node is not a swarm manager
\`\`\`

That result drove the inactive operational-template change from an assumed external Swarm secret to an explicit file-backed Compose secret. No production file was supplied or created.

The current Dream service inventory after validation remained unchanged:

- Flask.
- Next.
- transitional auth-writer.
- transitional Nginx bridge.
- external Traefik.
- external Authentik.
- external Mailpit.

No disposable M5.3.5/M5.3.6 containers or networks remained.

## 24. Files changed

M5.3.6 changes:

- \`deploy/operational/compose.yaml\`: explicit key-registry secret target and Compose-standard external file input.
- \`deploy/disposable/operational-compose.yaml\`: explicit key-registry secret target.
- \`docs/modernization/122-operational-cutover-preparation-m5-3-6.md\`: this report.

All other uncommitted changes predate this milestone and were preserved. No historical report was rewritten. No application feature was added.

## 25. Remaining blockers

The remaining blockers are operational authorization items:

1. Approved canonical root path and permissions.
2. Key registry file custody, owner/group, mode, backup, rotation, and recovery.
3. Backup destination, retention, RPO/RTO, capacity, alerting, and recovery owner.
4. Real generic Authentik OIDC provider/client/redirect contract.
5. Real generic Authentik SAML entity/ACS/certificate contract.
6. SMTP role: Mailpit-only test capture or approved outbound relay.
7. Source quiescence and exact data scope.
8. Transitional auth-writer account/token/session disposition.
9. Traefik handover approval with no competing routers.
10. Controlled re-login communication and identity policy.
11. Planned downtime and observation window.
12. Post-cutover write rollback/reconciliation policy.
13. Explicit university migration timing, independent of initial application deployment.
14. Explicit Flask retirement authorization after observation.

No critical technical contradiction remains in the inactive templates after the secret mount correction. Operational cutover remains blocked by the above approvals.

## 26. Final decisions

| Decision | Result | Reason |
|---|---|---|
| M5.3.6 preparation | \`M536_CUTOVER_PREPARATION_GO\` | Required inventories, plans, classifications, and authorization package are complete |
| Operational deployment | \`OPERATIONAL_CUTOVER_NO_GO\` | Deployment and routing changes were not authorized |
| Flask retirement | \`FLASK_RETIREMENT_NO_GO\` | Flask remains current API authority and rollback/observation gates are open |
| University migration | NOT PART OF THIS CUTOVER | Explicitly deferred to a later agent-assisted operation |
| Authentik mutation | NO-GO | Requires privileged identity-owner approval |
| Mailpit mutation | NO-GO | External service remains unchanged |

## 27. Recommended next phase

The next phase should be a human-approved operational handover window, not M5.4 implementation.

Before execution, the operator should close the minimum authorization package, provision the approved external key registry file, approve the canonical root and backup policy, verify real Authentik OIDC/SAML contracts, decide SMTP delivery, classify transitional records, schedule source quiescence, and assign the rollback/observation owners.

Only then should the operator execute the classified handover commands. Keep Flask and transitional services available for rollback until the observation window and reconciliation decision are complete.

