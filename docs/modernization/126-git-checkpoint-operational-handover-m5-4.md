# PRG32 Cartridge Store — M5.4 Git Checkpoint and Operational Handover Preparation

Date: 2026-10-15

## 1. Executive summary

The completed application implementation was safely checkpointed and pushed to the configured development branch. The checkpoint contains only selected application, test, dependency, and Compose-template files. Modernization reports and generated runtime artifacts remain local and uncommitted.

Decisions:

- GIT_CHECKPOINT_PUSHED
- M54_HANDOVER_PREPARATION_GO
- OPERATIONAL_CUTOVER_NO_GO
- FLASK_RETIREMENT_NO_GO

The handover preparation is complete as a read-only plan. No deployment, cutover, production initialization, routing change, database mutation, Traefik change, Authentik change, Mailpit change, or Flask removal was performed.

## 2. Git inventory

The repository was on branch development. The configured remote was origin at https://github.com/dreamwhite/CartridgeStore. The branch tracked origin/development.

Before the push, the local branch was four commits ahead and zero commits behind the remote. After the push:

- local HEAD: 8760f70f75251f47844dcd6fc18737ec94717ad7
- remote HEAD: 8760f70f75251f47844dcd6fc18737ec94717ad7
- divergence: 0 ahead, 0 behind

Checkpoint commits:

| Commit | Conventional message | Domain |
| --- | --- | --- |
| 719ee4b | feat(auth): add WebAuthn passkey authentication | Fastify/Next authentication and durable WebAuthn state |
| 2dafbd5 | feat(setup): add provider validation and SMTP test workflows | Setup, SMTP, OIDC/SAML validation, and outbound policy |
| 3588794 | test(e2e): stabilize disposable browser acceptance | Disposable browser acceptance coverage |
| 8760f70 | chore(infrastructure): align operational WebAuthn defaults | Operational and disposable Compose templates |

The initial Git inspection included status, branch, remotes, diff statistics, diff checks, tracked files, and untracked files. git diff --check passed before staging, for each staged commit, and after the push.

## 3. Staged content policy

Files were staged with explicit paths. git add ., git add -A, and git commit -a were not used.

Included content was limited to:

- Fastify authentication, WebAuthn, setup, outbound validation, SMTP, and canonical schema compatibility code.
- Next.js authentication and setup client code.
- Backend and frontend package manifests and workspace lockfiles.
- Focused unit/API tests and disposable Playwright tests.
- Candidate/disposable/operational Compose template changes.

Excluded from the checkpoint:

- docs/modernization/124-webauthn-passkeys-m5-3-8.md
- docs/modernization/125-final-stabilization-m5-3-9.md
- frontend/test-results/
- node_modules/
- root pnpm-lock.yaml generated outside the actual workspace manifests.
- Any runtime database, storage root, backup archive, key registry, private key, certificate private key, or production environment file.

Existing modernization reports were not deleted, rewritten, untracked, or added to the checkpoint.

## 4. Secret scanning result

gitleaks, trufflehog, and detect-secrets were not installed locally. The fallback checks were:

- local pattern scan of the proposed staged diff for private keys, provider tokens, and common cloud/API key formats;
- staged filename scan for .env, private-key, database, and backup files;
- manual review of the selected source, test, and Compose files.

Result:

- no private-key or provider-token pattern found;
- no secret-bearing filename staged;
- no real Authentik, SMTP, session, bootstrap, backup, or encryption secret included;
- synthetic test credentials remain explicitly disposable fixtures and are not operational credentials.

This is not a substitute for an organization-wide scanner. A dedicated scanner should be added to CI before deployment.

## 5. Commit and push result

The checkpoint was committed as the four domain-separated Conventional Commits listed above. Push was a normal fast-forward from 4af0a1f to 8760f70:

    git push origin development
    development -> development

The remote was fetched after the push and its commit object matched local HEAD. No force push, rebase, squash, or pull request was performed.

Remaining uncommitted files after the checkpoint are intentionally excluded local artifacts plus this report while it is retained as temporary evidence. No tracked source change remains uncommitted.

## 6. Current Dream topology

The current local Dream infrastructure was inspected read-only. Relevant runtime state:

| Responsibility | Container | Observed state | Networks / routing |
| --- | --- | --- | --- |
| Public Store | prg32-cartridge-store-next-1 | running | dream_edge, router for store.prg32.dream.test |
| Public API | prg32-cartridge-store-flask-1 | healthy | dream_edge, router for api.prg32.dream.test |
| Transitional auth writer | prg32-cartridge-store-auth-writer-1 | unhealthy | project development networks, local port 5091 |
| Transitional auth edge | prg32-cartridge-store-auth-writer-edge-proxy-1 | unhealthy | dream_edge, auth-prefix router on API host |
| Edge proxy | dream-traefik-traefik-1 | healthy | external dream_edge |
| Identity provider | dream-authentik-server-1 and worker | healthy | external Dream Authentik networks and edge |
| SMTP capture | dream-mailpit-mailpit-1 | healthy | dream_mail and dream_edge |

The external dream_edge network is a bridge network and dream_mail is an internal bridge network. No container was started, stopped, restarted, removed, or reconfigured by this milestone.

Low-volume public observations:

| Host | Observation |
| --- | --- |
| store.prg32.dream.test | DNS to local loopback; HTTPS HEAD / returned HTTP/2 200 with Next.js headers |
| api.prg32.dream.test | DNS to local loopback; HTTPS HEAD /health returned HTTP/2 404 with Werkzeug/Python headers, confirming Flask API ownership |
| sso.dream.test | DNS to local loopback; HTTPS HEAD / returned HTTP/2 302 into an Authentik authentication flow |

Curl normal HTTPS verification succeeded for these observations. The certificate presented is a local mkcert development certificate; the direct OpenSSL CLI trust-store check could not build that local issuer chain. This is not production TLS evidence.

## 7. Future two-service topology

deploy/operational/compose.yaml describes the intended application topology:

1. fastify: authoritative API and sole canonical writer after a separately authorized handover.
2. next: Store frontend and server-side API proxy.

External infrastructure remains outside this Compose project:

- Dream Traefik for TLS and host routing;
- generic external OIDC/SAML provider, currently reachable through sso.dream.test;
- Dream Mailpit or a later approved SMTP relay.

The operational template has no host port publishing. Fastify exposes port 5080 to Traefik, Next exposes port 3000 to Traefik, and Fastify serves the WebSocket route on the same HTTP port. Next depends on Fastify health. Canonical storage is one explicit bind mount at /data/canonical; the encrypted-settings key registry is an external Compose secret file.

The template uses store.prg32.dream.test and api.prg32.dream.test, exact CORS/origin configuration, external dream_edge and dream_mail networks, and a private application network. Required secret and data variables fail closed when absent. The template was validated with synthetic interpolation values and was not started.

The root development Compose file remains transitional and still contains Flask, auth-writer-init, auth-writer, auth-writer-edge-proxy, and Next. That file was not modified in M5.4.

## 8. Fresh canonical installation plan

This plan assumes a fresh canonical installation. It does not migrate university content and does not delete or overwrite existing Flask or auth-writer databases.

Infrastructure-owned preparation:

1. Choose an operator-owned external data directory with separate canonical database, immutable object, private submission, journal, and temporary recovery boundaries.
2. Create the external key registry with restrictive permissions and place it in approved secret custody. Keep encryption keys out of Compose YAML and archives.
3. Generate and inject a strong session secret, one-time setup bootstrap authorization, canonical read authorization, canonical write authorization, and approved sender through the external secret mechanism.
4. Decide network names and attach Fastify to dream_edge and dream_mail only after those external networks are confirmed.
5. Confirm Traefik routes and TLS certificates for the two application hosts during a separately authorized maintenance window.

Application-owned initialization:

1. Start the fresh canonical Fastify root in controlled setup mode and verify /ready before public exposure.
2. Use the setup authorization once to create the first administrator. Do not put it in a URL, browser storage, image, or report.
3. Configure store metadata, registration policy, session lifetime, publishing policy, and review policy.
4. Configure SMTP only after the internal path and sender have been approved.
5. Configure generic OIDC and SAML with the requirements in section 10.
6. Keep mDNS disabled unless multicast permission and the discovery policy are explicitly approved.
7. Keep WebAuthn disabled until the RP/origin and recovery policy are approved.
8. Complete installation, verify durable setup completion after restart, and remove the bootstrap authorization from active custody.
9. Start Next only after Fastify is healthy, then perform a separately authorized edge handover and smoke test.

Infrastructure configuration includes storage paths, secret custody, public origins, TLS, networks, capabilities, and external services. Application settings include store metadata, users, policy, SMTP values, and generic federation records. The browser wizard cannot change infrastructure paths, routing, TLS, secret custody, or database locations.

## 9. WebAuthn operational configuration

Recommended operational candidate:

    PRG32_BACKEND_WEBAUTHN_RP_ID=store.prg32.dream.test
    PRG32_BACKEND_WEBAUTHN_ORIGINS=https://store.prg32.dream.test

The browser ceremony belongs to the Store origin. The API origin remains https://api.prg32.dream.test and is not the browser origin for the Store passkey ceremony.

The implementation supports this explicit configuration and fails closed when the RP ID or origin list is absent, malformed, insecure outside test mode, or incompatible with the RP ID. Operational Compose leaves WebAuthn disabled by default; no operational enablement was performed.

Before enabling it, the operator must approve authenticator recovery, account-recovery fallback, passkey naming/revocation policy, and the exact TLS/browser origin. Password and generic OIDC/SAML recovery remain required.

## 10. OIDC/SAML operational requirements

Federation is generic. The application source does not assume Authentik APIs, credentials, provider IDs, or administration endpoints.

For OIDC, the operator must supply and verify:

- issuer and discovery/JWKS reachability;
- client ID and external secret reference;
- openid and approved scopes;
- callback on the API origin, proposed as https://api.prg32.dream.test/api/auth/oidc/<provider-id>/callback;
- claim-to-user mapping and first-login/linking policy;
- logout and controlled re-login behavior.

For SAML, the operator must supply and verify:

- IdP entity ID and one approved SP entity ID;
- ACS on the API origin, proposed as https://api.prg32.dream.test/api/auth/saml/<provider-id>/acs;
- SSO entry point;
- signing/trusted certificate material and overlap/rotation policy;
- persistent NameID, signed assertion/response policy, destination, recipient, audience, and clock-skew settings;
- SP metadata review at https://api.prg32.dream.test/api/auth/saml/<provider-id>/metadata.

The real Authentik provider, client identifiers, certificates, credentials, and user session were not accessed or changed. A later real-provider test requires an approved test account, exact provider configuration, a maintenance window, and an explicit decision on session continuity.

## 11. SMTP operational requirements

The intended internal capture path is:

    host: mailpit
    port: 1025
    encryption: none

Fastify must be attached to dream_mail, and the application outbound policy must contain the exact approved hostname allowlist entry mailpit, or an operator-approved replacement. The resolver rejects private targets unless the hostname is explicitly allowed, validates all DNS answers, and pins the subsequent socket lookup.

The operator must decide:

- sender address;
- whether SMTP authentication is required;
- whether plaintext is acceptable inside the isolated Docker mail network;
- one approved test recipient and Mailpit capture procedure;
- later production relay, TLS, CA, and credential policy.

Mailpit capture is not proof of external production delivery. No real email was sent during this phase.

## 12. Backup and restore plan

Before any ownership transition:

1. Quiesce Flask writes and record a read-only snapshot identity.
2. Preserve a read-only snapshot of the transitional auth-writer database.
3. Keep legacy Flask and auth-writer databases as rollback evidence; do not delete or overwrite them.
4. Initialize the fresh canonical root only in the approved external data location.
5. Inject the external encryption key registry and create an encrypted backup-v4 after canonical initialization and verification.
6. Verify the archive independently, restore it into a new disposable root, run SQLite/object/publication integrity checks, and retain the result off-host according to the approved retention policy.
7. Confirm the single-writer lease and health checks before any traffic change.
8. Keep the observation window and backup retention active until the rollback gate is formally closed.

The existing disposable encrypted backup-v4 and restore implementation is validated by M5.3.9 evidence and the current backend suite. No operational backup was created here. The operational template keeps HTTP backup routes disabled by default; backup execution remains operator-controlled and must not use an implicit production path.

## 13. Rollback policy

### Before canonical writes

Abort by keeping Flask authoritative, discarding only the disposable or unpublished canonical target, and preserving all source evidence. Do not delete legacy databases or storage.

### After canonical writes

Do not blindly restart Flask. First stop or quiesce the new Fastify writer, control traffic, and determine whether post-cutover writes can be exported and reconciled. The operator must choose between:

- a forward fix;
- explicit export/reconciliation of post-cutover writes;
- rollback with explicitly accepted data loss for the post-cutover window.

No reverse migration is implemented. No simultaneous Flask/Fastify writer state is acceptable. Any rollback must preserve a consistent database, object set, publication journal, authentication state, telemetry, and audit trail.

## 14. Operator decision matrix

| Decision | Classification | Current state |
| --- | --- | --- |
| Next.js + Fastify target | Already decided | Approved two-service target |
| Generic OIDC/SAML provider model | Already decided | No Authentik-specific application dependency |
| Public names | Already decided | store.prg32.dream.test, api.prg32.dream.test, sso.dream.test |
| Fresh canonical installation | Already decided | No university data importer in this phase |
| Maintenance window | Operator approval required | Not selected |
| External canonical storage path | Operator approval required | Must be bind-mounted and outside the repository |
| Secret registry and key custody | Operator approval required | Provider, rotation, and access policy not selected |
| Session/bootstrap secret custody | Operator approval required | External injection required; no production value exists here |
| Backup retention, RPO, and RTO | Operator approval required | Not selected |
| SMTP sender, relay, TLS, and recipient policy | Operator approval required | Mailpit path is a candidate only |
| OIDC/SAML provider registrations and test account | Operator approval required | No real provider mutation or login performed |
| WebAuthn enablement and recovery policy | Operator approval required | Recommended RP ID is store.prg32.dream.test; disabled by default |
| mDNS default | Proposed | Keep disabled unless multicast is explicitly approved |
| Monitoring and alerting | Operator approval required | Health checks exist; external alert ownership is open |
| Observation duration | Operator approval required | Must cover public reads, writes, auth, WSS, and telemetry |
| Rollback data-loss policy | Operator approval required | Forward fix preferred; accepted-loss threshold not selected |
| Legacy database retention | Proposed | Retain until the rollback window formally closes |
| Flask API ownership | Blocked | Still public on api.prg32.dream.test |
| Transitional writer/bridge health | Blocked | Both observed unhealthy |
| Real operational federation continuity | Blocked | Requires authorized real-provider test |
| Production TLS trust evidence | Blocked | Current certificate is local mkcert development infrastructure |

## 15. Remaining blockers

- Flask still owns the public API route.
- The transitional Fastify auth writer and Nginx auth bridge are unhealthy in the current local runtime.
- The operational Compose template has not been started and its external networks, secret registry, data path, and Traefik ownership are not operator-approved.
- Real Authentik OIDC/SAML callback continuity and session re-login have not been tested in this phase.
- SMTP network attachment, approved sender, TLS/authentication policy, and external delivery policy remain open.
- Operational key registry custody, backup retention, restore target, and monitoring/alerting remain open.
- WebAuthn final enablement and recovery policy remain open.
- Traffic handover and post-cutover write reconciliation policy remain open.

## 16. Verification commands and results

| Command/check | Result |
| --- | --- |
| Git status, branch, remote, diff/stat inventory | PASS |
| staged git diff --check | PASS for all four commits |
| local fallback secret scan | PASS; no real-secret pattern or secret-bearing filename staged |
| git fetch origin development and divergence check | PASS; four ahead, zero behind before push |
| git push origin development | PASS; normal fast-forward |
| post-push remote/local hash comparison | PASS; 8760f70 on both |
| docker compose -f deploy/operational/compose.yaml config --quiet with synthetic values | PASS |
| pnpm --dir backend run typecheck under Node 24 | PASS |
| pnpm --dir backend run lint under Node 24 | PASS |
| pnpm --dir backend run test under Node 24 | PASS — 55 files, 276 tests |
| pnpm --dir backend run build under Node 24 | PASS |
| pnpm --dir frontend run typecheck under Node 24 | PASS |
| pnpm --dir frontend run lint under Node 24 | PASS |
| pnpm --dir frontend run test under Node 24 | PASS — 22 files, 65 tests |
| pnpm --dir frontend run build under Node 24 | PASS |
| SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q | PASS — 64 tests |
| public DNS/HTTPS GET/HEAD observations | PASS with local-development TLS caveat |
| current Docker/container/network inspection | PASS, read-only |

Not rerun in M5.4 because it is a long-running disposable workflow already closed by M5.3.9:

- Playwright operational matrix: 18/18 passed in each of three consecutive runs, with no skips or retries.
- Fresh setup browser journey: 1/1 passed.
- Disposable encrypted backup-v4 restore: passed.

## 17. Files and documentation

The application checkpoint files are contained in commits 719ee4b through 8760f70. This temporary report is intentionally not part of those commits.

Report path:

    docs/modernization/126-git-checkpoint-operational-handover-m5-4.md

No roadmap update was made, because M5.4 Phase 0 explicitly requested one temporary report and did not authorize roadmap rewriting.

## 18. Recommended next action

The next authorized action should be an operator review and sign-off of the decision matrix, followed by a separately authorized staging/maintenance window for external secret custody, canonical storage initialization, real provider acceptance, and controlled route ownership preparation.

That action must not be interpreted as authorization to cut over traffic. The current state remains:

    M54_HANDOVER_PREPARATION_GO
    OPERATIONAL_CUTOVER_NO_GO
    FLASK_RETIREMENT_NO_GO
