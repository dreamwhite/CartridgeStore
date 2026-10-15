# PRG32 Cartridge Store — M5.4.1 Operational Provisioning & Cutover Readiness

Status: `M541_PROVISIONING_READINESS_PARTIAL`

Mandatory decisions:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

Assessment date: 2026-10-15

## 1. Executive summary

M5.4.1 completed the authorized read-only inspection of the current Dream
runtime, the inactive two-service operational Compose contract, the external
Traefik/Authentiк/Mailpit topology, storage and secret-custody requirements,
and the cutover/rollback boundaries.

The future architecture is understood: one Fastify backend and one Next.js
frontend, with Dream Traefik and the generic external OIDC/SAML provider kept
outside this repository's Compose project. The inactive operational template
has exactly those two application services, uses Node.js 24 multi-stage images,
does not require Python in the final images, and passes configuration
validation with synthetic values.

Readiness remains partial rather than GO because the real operational storage
root, secret registry, bootstrap policy, provider registrations, SMTP sender
policy, monitoring coverage, writer-quiescence window, and rollback decision
are still operator-controlled gates. Real Authentik OIDC/SAML login and real
operational canonical storage have intentionally not been exercised.

The currently running development topology also has a known transitional
runtime problem: `auth-writer` is unhealthy because its bind-mounted
development dependency tree does not contain `@simplewebauthn/server`; its
Nginx edge bridge is consequently unhealthy and returns upstream connection
refusals. No restart, rebuild, network change, or repair was performed.

## 2. Scope and safety

This milestone performed only:

- read-only Docker, Compose, network, mount, label, log, filesystem, Git and
  public HTTP/TLS observation;
- bounded local contract tests under Node.js 24;
- synthetic Compose interpolation validation;
- documentation of the target storage, secrets, routing, monitoring and
  rollback requirements.

No operational container was stopped, restarted, recreated or attached to a
new network. No Traefik, Authentiк, Mailpit, DNS, certificate, routing,
database, canonical storage root or production secret was modified. No real
login, provider mutation, email delivery, WebAuthn ceremony, operational
backup, content migration, Flask removal, commit or push was performed.

The working tree was already not clean because the previous authorized
checkpoint intentionally left untracked modernization reports, local test
artifacts and dependency artifacts. This milestone added only this report.

## 3. Current Dream topology

The authoritative runtime inspection found the following relevant containers:

| Container | Image | State | Networks / ports | Role |
|---|---|---|---|---|
| `prg32-cartridge-store-flask-1` | `riscv-prg32/cartridge-store:dev` | running, healthy | `dream_edge`, project dev network; internal 5080 | Transitional public Flask API |
| `prg32-cartridge-store-next-1` | `riscv-prg32/cartridge-store-frontend:dev` | running; no Docker healthcheck | `dream_edge`, project dev network; internal 3000 | Current public Next.js storefront |
| `prg32-cartridge-store-auth-writer-1` | `riscv-prg32/cartridge-store-backend:dev-hot` | running, unhealthy | project default and dev networks; `127.0.0.1:5091 -> 5090` | Transitional Fastify auth writer |
| `prg32-cartridge-store-auth-writer-edge-proxy-1` | `nginx:1.29-alpine` | running, unhealthy | `dream_edge`, project dev network; internal 80 | Transitional auth bridge |
| `dream-traefik-traefik-1` | `traefik:v3.6.17` | running, healthy | `dream_edge`; `127.0.0.1:80/443` | External edge router and TLS terminator |
| `dream-authentik-server-1` | `ghcr.io/goauthentik/server:2026.8.0` | running, healthy | Dream Authentik networks | External generic identity provider |
| `dream-authentik-worker-1` | `ghcr.io/goauthentik/server:2026.8.0` | running, healthy | Dream Authentik networks | External Authentik worker |
| `dream-mailpit-mailpit-1` | `axllent/mailpit:v1.27.4` | running, healthy | `dream_edge`, `dream_mail`; 1025/1110/8025 internal | Local capture SMTP |
| `dream-gatus-gatus-1` | `ghcr.io/twin/gatus:v5.36.0` | running | Dream monitoring network; internal 8080 | Existing infrastructure monitoring |

The current development containers use bind mounts from the repository. In
particular, the transitional writer mounts `backend/` and
`.local/backend/node_modules` into the container, while Next mounts the
frontend source, `.local/frontend/node_modules` and `.local/frontend/next-cache`.
Flask mounts the repository and `.local/flask/data`. These are development
ergonomics, not an operational persistence design.

The operational Compose template is separate and inactive. It defines exactly
`fastify` and `next`, with an internal `app_private` network plus the external
`dream_edge` and `dream_mail` networks. It publishes no host ports and uses
Traefik labels for public exposure.

The external `dream_edge` network currently contains Traefik, Authentik,
Mailpit and the current Flask/Next/transitional bridge services. The external
`dream_mail` network currently contains Mailpit and other Dream services, but
not the current PRG32 development application containers. The future Fastify
service is intended to join `dream_mail`; this was not done during M5.4.1.

The transitional auth-writer health diagnosis is read-only. Its health check
cannot reach the local service because startup fails while importing the
missing `@simplewebauthn/server` package from the bind-mounted development
dependency tree. The Nginx bridge logs repeated `502`/connection-refused
errors to the writer upstream. This is a stale development-runtime condition,
not evidence that the inactive production Dockerfile is defective. It remains
a blocker for relying on the transitional auth bridge during any future
window.

## 4. Current routing ownership

Current Traefik labels were inspected without changing them:

| Router | Rule | Priority | Target | TLS / middleware |
|---|---|---:|---|---|
| `prg32-store-dev` | `Host(\`store.prg32.dream.test\`)` | default | current Next, port 3000 | `websecure`, TLS, `dream-security-headers@file` |
| `prg32-api-dev` | `Host(\`api.prg32.dream.test\`)` | default | current Flask, port 5080 | `websecure`, TLS, `dream-security-headers@file` |
| `prg32-auth-api-dual` | API host plus `/auth`, `/api/auth` or `/api/admin/federation` prefix | 100 | Nginx auth bridge, port 5090 | `websecure`, TLS, `dream-security-headers@file` |

The auth-prefix router has higher priority than the general Flask API router.
It is currently unhealthy because its Fastify upstream is unhealthy. The
general API router still belongs to Flask, while the store router belongs to
Next.

Low-volume public observations were performed only against non-mutating
endpoints:

- DNS for `store.prg32.dream.test`, `api.prg32.dream.test` and
  `sso.dream.test` resolved to the local development address `127.0.0.1`.
- `https://store.prg32.dream.test/` returned HTTP 200 from Next.js.
- `https://api.prg32.dream.test/health` returned HTTP 404 from the current
  Flask/Werkzeug API; this is not a readiness failure by itself because the
  current Flask route set does not expose that path.
- `https://sso.dream.test/` returned the Authentik public 302 authentication
  redirect.
- The browser-facing HTTPS certificate is a local mkcert development
  certificate. Curl accepted it through the local trust setup, while the
  system OpenSSL trust store did not trust the local issuer. This is not
  production TLS evidence.

No cookies, credentials, tokens, private headers or provider configuration were
collected.

## 5. Target routing ownership

The inactive operational labels define:

- Fastify router `prg32-api-template` for
  `Host(\`api.prg32.dream.test\`)`, TLS on `websecure`, service port 5080;
- Next router `prg32-store-template` for
  `Host(\`store.prg32.dream.test\`)`, TLS on `websecure`, service port 3000.

These rules intentionally collide with the current host rules if both
topologies are attached to `dream_edge`. A safe handover therefore requires
an ownership transition, not merely starting the new containers:

1. Validate Fastify and Next privately with Traefik labels disabled or without
   `dream_edge`; use synthetic data and the isolated application network.
2. Announce maintenance and quiesce Flask and every transitional writer.
3. Preserve the legacy snapshot and record that no writer is still active.
4. Verify the externally supplied canonical root, key registry, bootstrap
   policy and provider configuration before public exposure.
5. Withdraw the old general API and auth-prefix routers as one controlled
   ownership change. Do not leave duplicate host ownership active.
6. Start/attach the new Fastify and Next services to `dream_edge` with the
   target labels and Fastify to `dream_mail`.
7. Confirm that Traefik has exactly one API owner and one store owner.
8. Run the approved public smoke tests for store, API, firmware contracts,
   authentication, WSS and health/readiness.
9. Observe the system for the approved window before declaring cutover.

This sequence is a plan only. No router labels or public routing were changed.

## 6. Operational storage proposal

The proposed Dream-convention paths are outside Git and were not created or
initialized:

| Purpose | Proposed host path | Container path / policy |
|---|---|---|
| Canonical root | `/Users/ivan/dream-platform/state/cartridge-store/canonical` | bind mount to Fastify `/data/canonical`; one Fastify writer only |
| SQLite | inside the canonical root as `store.sqlite` plus SQLite WAL/SHM as required | never copied with ordinary filesystem copying while active |
| Immutable objects | `<canonical-root>/storage/objects/` | artifact, media and site-asset bytes referenced by canonical SQLite |
| Submission staging | canonical storage-v2 private staging area below the root | never public; preserve pending/rejected state and hashes |
| Publication recovery | canonical storage-v2 publication operation/journal material below the root | preserve incomplete operations; do not auto-publish on restore |
| Temporary recovery | canonical storage-v2 recovery/staging areas below the root | same filesystem for atomic promotion; quarantine incomplete work |
| Encrypted archives | `/Users/ivan/dream-platform/ops/backups/cartridge-store/` | separate restricted backup custody; no archive created here |
| Key registry | `/Users/ivan/dream-platform/ops/secrets/cartridge-store/key-registry.json` | external read-only Compose secret; no file created here |

The storage owner and group, exact mode, disk quota, filesystem type and
off-host backup destination remain operator inputs. The root must be on a
local filesystem with reliable SQLite locking, must not be a network share of
uncertain semantics, and must not be writable by Flask or the transitional
auth-writer. The future Compose bind mount is explicit through
`PRG32_OPERATIONAL_DATA_DIR` and maps to `/data/canonical`.

The canonical root must contain no inherited legacy data. Fresh installation
means a new SQLite database and a newly provisioned object tree; no university
cartridge import is part of this phase.

## 7. External secret custody

The inactive operational Compose contract requires external injection for:

- `PRG32_OPERATIONAL_SESSION_SECRET`;
- `PRG32_OPERATIONAL_BOOTSTRAP_TOKEN`;
- `PRG32_OPERATIONAL_CANONICAL_READ_AUTHORIZATION`;
- `PRG32_OPERATIONAL_CANONICAL_WRITE_AUTHORIZATION`;
- `PRG32_OPERATIONAL_EMAIL_FROM`;
- `PRG32_OPERATIONAL_KEY_REGISTRY_FILE`.

The key registry is mounted as a Compose secret at
`/run/secrets/prg32-secret-key-registry`. The existing registry implementation
requires an absolute regular non-symlink file, no group/other permissions,
bounded size and exactly one active key. The generator uses a 0600 file and a
0700 parent directory. The application image and Git repository contain no
production key material.

The operator must choose the external secret provider and ensure that secret
values do not live in tracked `.env` files, image layers, Compose YAML, logs or
the backup archive. Environment interpolation is acceptable only through the
approved secret injection path and must be protected from shell history and
process inspection as far as the selected provider permits.

Rotation policy:

1. Add a new active encryption key in the external registry.
2. Keep the prior key decrypt-only for the archive retention period.
3. Create and verify a test backup/restore using the new active key.
4. Re-encrypt or expire all archives dependent on the old key.
5. Retire the old key only after restore obligations have expired.

The bootstrap token is one-time setup material and should be rotated or
removed after first installation. Recovery requires access to the external
secret provider, the backup key registry and the approved restore procedure;
keys must never be copied into an archive. No production secret was generated,
read or printed.

## 8. WebAuthn configuration

The intended future values are:

```text
PRG32_BACKEND_WEBAUTHN_RP_ID=store.prg32.dream.test
PRG32_BACKEND_WEBAUTHN_ORIGINS=https://store.prg32.dream.test
```

The API public origin is `https://api.prg32.dream.test`. The operational
template already sets the related public origin, exact CORS allowlist and
trusted-proxy behavior:

- frontend origin and CORS: `https://store.prg32.dream.test`;
- federation/API origin: `https://api.prg32.dream.test`;
- session cookie domain: `.prg32.dream.test`;
- secure cookies and SameSite policy enabled by the application contract;
- `PRG32_BACKEND_TRUST_PROXY=true` behind Traefik.

These values are compatible with a secure browser context and the intended
dual-origin design. WebAuthn remains disabled in the operational template by
omitting the enablement-specific RP/origin settings. Before enabling it, the
operator must approve authenticator recovery, passkey revocation/naming,
account-recovery fallback and the exact certificate/browser origin. No real
passkey was created.

The transitional writer's current missing dependency is separate from the
operational WebAuthn contract and was not repaired in this read-only phase.

## 9. Authentik OIDC requirements

Authentik is used as the current generic OIDC/SAML provider host at
`sso.dream.test`; the application must not hardcode Authentik-specific API or
administration behavior. Real provider records and real login were not
inspected or changed.

For each approved OIDC provider, the operator must supply and verify:

- HTTPS issuer and discovery endpoint;
- discovery issuer equality and JWKS endpoint;
- client ID;
- external client-secret reference, never the value in Git or the report;
- authentication method (`none`, `client_secret_basic` or
  `client_secret_post`) as approved;
- scopes including `openid` and the approved identity claims;
- exact callback URI:
  `https://api.prg32.dream.test/api/auth/oidc/<providerId>/callback`;
- logout/return behavior and post-login return-path allowlist.

The implementation requires state, nonce, PKCE, browser correlation binding,
issuer/JWKS validation, bounded metadata fetches and a controlled identity
mapping. Unknown identities must not be silently linked. The first-login
policy, canonical account mapping, explicit account-link approval and session
re-login behavior remain operator decisions.

The future acceptance test must be performed with the actual approved provider
configuration and a designated test account, but only after separate explicit
authorization for real authentication. It is not satisfied by the existing
synthetic federation tests alone.

## 10. Authentik SAML requirements

For each approved SAML provider, the operator must supply and verify:

- IdP entity ID;
- HTTPS IdP SSO entry point;
- SP entity ID;
- exact ACS URL:
  `https://api.prg32.dream.test/api/auth/saml/<providerId>/acs`;
- NameID format and identity claim mapping;
- IdP signing certificate and trusted certificate reference;
- signed assertion and signed response policy;
- whether authentication requests are signed and the SP signing-key
  reference;
- accepted clock skew;
- logout/SLS behavior and return-path policy.

The service validates destination, recipient, `InResponseTo`, signature
material, trusted certificates and the provider binding. The generic provider
model remains independent of Authentik. Real Authentik metadata, certificates
and login were not fetched, printed or changed, so this gate is
`OPERATIONAL_VERIFICATION_REQUIRED`.

## 11. SMTP/Mailpit integration

Dream Mailpit is healthy, attached to both `dream_edge` and `dream_mail`, and
listens on the internal SMTP endpoint expected by the operational template:

```text
host: mailpit
port: 1025
network: dream_mail
TLS: disabled for local capture
```

The operational Fastify service is intended to join `dream_mail`, use the
explicit outbound hostname allowlist (default candidate `mailpit`), and use an
approved sender address. Mailpit is a capture service, not proof of external
delivery. The operator must decide whether production uses Mailpit or a real
relay, then provide sender, TLS, authentication, recipient and retention
policy. No email was sent and no container was attached to `dream_mail`.

A disposable SMTP contract was already validated in prior milestone evidence;
the current M5.4.1 check did not repeat a full browser/setup workflow.

## 12. mDNS policy

mDNS remains disabled by default. The operational Compose template sets
`PRG32_BACKEND_MDNS_ENABLED=false` and the production configuration rejects
implicit activation. Enabling it later requires explicit infrastructure
permission, a reviewed interface and host/port, network multicast capability,
the required controlled restart and a firmware-compatible discovery response.

No multicast socket was opened and no Docker capability or firmware ABI was
changed.

## 13. Backup-v4 plan

The existing encrypted, authenticated backup-v4 implementation remains a
developer/operator-controlled capability, not an HTTP startup or public route.
The operational template keeps backup HTTP exposure disabled. The intended
sequence is:

1. Quiesce the sole canonical writer and verify readiness plus no pending
   publication mutation.
2. Create the first backup only after the fresh canonical root passes schema,
   object and foreign-key verification.
3. Use the supported SQLite snapshot mechanism and storage-v2 object
   inventory; do not copy an active database file casually.
4. Encrypt with the external key registry and keep the key outside the
   archive.
5. Verify the archive independently, including manifest, SQLite, objects,
   staging and recovery material.
6. Store the archive under the restricted backup path, then replicate it to an
   approved off-host destination without exposing secret-bearing rows.
7. Retain verification results, backup ID, key reference and restore test
   evidence without logging secrets.

RPO, RTO, retention, off-host replication, disk quota and alert thresholds are
   operator inputs. A restore drill must use a fresh disposable root and must
   never overwrite the operational root. A failed or incomplete restore is
   `recovery_required` or failed, never ready.

No operational archive, database export or secret copy was created. Encrypted
backup-v4 and restore were previously passed in disposable validation; the
operational gate remains open until the actual custody, storage and restore
window are approved.

## 14. Monitoring/observability

Existing Dream observability is partial. Gatus is healthy and currently checks
Dream infrastructure endpoints such as Traefik, Authentik, Mailpit, Gatus and
Whoami. It does not currently provide dedicated PRG32 Store/API checks. The
current PRG32 development containers also use unbounded `json-file` logging,
unlike the local-rotated logs observed on Dream infrastructure.

Minimum cutover-window monitoring to approve before handover:

- Fastify `/health` and `/ready`, Next `/health`, and Traefik router/service
  health;
- HTTP 4xx/5xx rates, latency and access-log correlation for both public hosts;
- canonical writer lease/readiness, SQLite integrity/checkpoint/WAL state,
  disk space and inode capacity;
- immutable-object integrity failures and publication/recovery-required state;
- backup verification result, archive age and retention capacity;
- SMTP connection failures and outbound-policy rejections;
- OIDC/SAML callback failures, identity-link conflicts and session errors;
- WebAuthn failures if and when enabled;
- WebSocket upgrade and relay availability;
- explicit alerting for readiness loss, writer-lease loss, 5xx spikes, low disk,
  failed backup verification and federation failure spikes.

No Gatus config, log retention, monitoring service or container was changed.

## 15. Writer ownership

The current topology has multiple stateful concerns:

- Flask owns the legacy application database and cartridge data.
- The transitional auth-writer owns its separate writer SQLite/state roots.
- Future Fastify owns the fresh canonical SQLite and immutable storage root.

Only one service may own canonical writes. Flask and Fastify must never write
the same database or object root, and the transitional writer must not be
treated as a second canonical writer. Readiness must prove that the target
writer lease is held before public write routes are exposed.

The currently unhealthy transitional auth-writer reinforces the need not to
make it a cutover dependency. Its recovery is outside this milestone and may
not be achieved by restarting the current container during this task.

## 16. Rollback sequence

The exact future sequence is preparatory only:

1. Read-only inventory of legacy and canonical state.
2. Maintenance announcement and freeze of new writes.
3. Quiesce Flask, transitional auth-writer and any other legacy writer.
4. Preserve and hash the legacy snapshot; record pending operations.
5. Initialize the fresh canonical root under the approved owner and mode.
6. Inject the external secrets and key registry without printing values.
7. Start Fastify privately and verify health, readiness, writer lease and
   canonical integrity.
8. Complete first installation and create the approved local administrator.
9. Validate the approved generic OIDC/SAML provider configuration.
10. Start Next privately and verify its API proxy, cookies, CSRF and health.
11. Perform the controlled Traefik router ownership transition.
12. Run public smoke tests and begin the observation window.
13. Make an explicit continue/rollback decision.

Pre-cutover abort is straightforward: keep Flask authoritative, discard the
disposable canonical target and preserve the legacy snapshot. Post-cutover
rollback is not a restart operation. It requires stopping the new writer,
controlling traffic, reconciling or explicitly discarding post-cutover writes,
withdrawing new routers, and re-enabling Flask only after a consistent legacy
state is established.

If Fastify accepts writes after cutover, those writes may not exist in the
pre-cutover Flask snapshot. The operator must choose between exporting and
reconciling them, accepting explicitly authorized data loss, or performing a
forward fix. No reverse migration is implied or implemented.

## 17. Disposable rehearsal results

This milestone used the smallest bounded validation because the full isolated
operational image, WebAuthn, federation, SMTP and encrypted backup/restore
rehearsals already have evidence in M5.3.9 and M5.4. No unnecessary long
browser run was repeated, and no Dream network was used for validation.

Executed under Node.js 24 selected with `nvm use 24`:

```text
pnpm --dir backend exec vitest run \
  tests/operational-runtime.test.ts \
  tests/candidate-runtime.test.ts \
  tests/edge-federation.test.ts \
  tests/webauthn.test.ts
```

Result: 4 test files passed, 15 tests passed. The run included operational
runtime, candidate-runtime, isolated TLS/federation/WebSocket and WebAuthn
contract coverage. Node emitted only experimental Web Crypto warnings.

Synthetic Compose validation also passed:

- `docker compose -f deploy/operational/compose.yaml config --quiet` with
  non-production synthetic interpolation: PASS;
- `docker compose -f deploy/disposable/operational-compose.yaml config
  --quiet` with synthetic disposable paths: PASS.

No disposable containers were started by this milestone. Prior evidence
remains the source for the more expensive actual two-service image, SMTP,
provider and backup-v4 browser workflow. This is sufficient for contract
readiness evidence, not operational acceptance.

## 18. Operational Compose review

`deploy/operational/compose.yaml` is structurally aligned with the future
topology:

- exactly two application services: Fastify and Next;
- Node.js 24 bookworm-slim multi-stage Dockerfiles;
- production backend image has dependency, builder, production-dependency and
  non-root runtime stages;
- production frontend image builds a Next standalone runtime and runs as
  non-root;
- no Python runtime in final operational images;
- Fastify exposes internal 5080 and Next internal 3000 without host publishing;
- `app_private` is internal, with external `dream_edge` and `dream_mail` only
  where required;
- read-only root filesystems, explicit `/tmp` tmpfs, dropped capabilities and
  `no-new-privileges` are enabled;
- Fastify binds explicit canonical storage and mounts the external key registry
  secret read-only;
- health/readiness checks are present;
- exact store/API origins, CORS, cookie domain and trusted proxy are explicit;
- backup HTTP routes and mDNS are disabled by default;
- provider values are generic configuration, not Authentik-specific code;
- images do not contain production secret values.

The Dockerfiles and inactive Compose template showed no demonstrated P0/P1
defect requiring a change in M5.4.1. The current unhealthy dev-hot writer is
caused by its bind-mounted development dependencies and is not corrected by
editing the inactive operational template. No template, Compose file or
Dockerfile was modified.

## 19. Pre-cutover gate matrix

`PASS` means the design or disposable contract is verified. It does not mean
that a real operational gate has been accepted.

| Gate | Status | Evidence / required action |
|---|---|---|
| Git backup | PASS | Previous checkpoint `8760f70` was verified on `origin/development`; no new checkpoint created here |
| Operational images | PASS | Prior M5.3.9 build evidence; current Dockerfiles remain unchanged |
| Canonical storage | OPERATOR_INPUT_REQUIRED | Approve owner, local filesystem, path and fresh-root initialization |
| External secret registry | OPERATOR_INPUT_REQUIRED | Provide external 0600 registry and custody/rotation/recovery policy |
| Setup bootstrap | OPERATOR_INPUT_REQUIRED | Inject one-time bootstrap token and approve expiry/removal |
| Local administrator | OPERATOR_INPUT_REQUIRED | Designate account and recovery procedure; no real account created |
| WebAuthn | OPERATOR_INPUT_REQUIRED | RP/origin are valid; keep disabled until recovery policy is approved |
| OIDC | OPERATIONAL_VERIFICATION_REQUIRED | Supply actual issuer, discovery, client reference, callback and test account |
| SAML | OPERATIONAL_VERIFICATION_REQUIRED | Supply actual entity IDs, ACS, certificates and signed-message policy |
| SMTP | OPERATIONAL_VERIFICATION_REQUIRED | Approve Mailpit vs relay, sender, TLS/auth and recipient policy |
| Mailpit | PASS | Healthy and on `dream_mail`; target attachment not performed |
| mDNS | PASS | Disabled by default and no multicast activation planned |
| Firmware API | OPERATIONAL_VERIFICATION_REQUIRED | Run approved non-mutating and firmware-compatible smoke suite after handover |
| Catalog | OPERATIONAL_VERIFICATION_REQUIRED | Verify fresh canonical catalog and public downloads after initialization |
| Publication/review | OPERATIONAL_VERIFICATION_REQUIRED | Verify single-writer publication/review workflows on canonical root |
| Scores | OPERATIONAL_VERIFICATION_REQUIRED | Verify firmware-compatible writes and reads against canonical data |
| Metrics | OPERATIONAL_VERIFICATION_REQUIRED | Verify run/sample ingestion and export authorization on target |
| WebSocket | OPERATIONAL_VERIFICATION_REQUIRED | Verify WSS upgrade and relay through the final API owner |
| Backup-v4 | OPERATOR_INPUT_REQUIRED | Approve custody, destination, RPO/RTO, retention and first archive window |
| Restore | OPERATIONAL_VERIFICATION_REQUIRED | Complete fresh-root restore drill with actual custody before cutover |
| Monitoring | OPERATOR_INPUT_REQUIRED | Approve Gatus/app/Traefik checks, alerts, log retention and disk thresholds |
| Writer quiescence | OPERATOR_INPUT_REQUIRED | Schedule maintenance and prove no legacy writer remains active |
| Traefik handover | OPERATIONAL_VERIFICATION_REQUIRED | Execute only in separately authorized window with collision-free ownership |
| Rollback | OPERATOR_INPUT_REQUIRED | Choose reconciliation, explicit loss window or forward-fix policy |
| Flask retirement | BLOCKED | Not authorized and depends on every cutover/rollback gate above |

## 20. Operator decisions

Before a cutover authorization can be considered, the operator must provide
decisions for:

1. Canonical host path owner/group/mode, filesystem and capacity.
2. External secret provider and key-registry custody.
3. Bootstrap token lifetime and first administrator recovery.
4. Actual generic OIDC provider registration and test identity.
5. Actual generic SAML provider registration and certificate lifecycle.
6. Mailpit-only capture versus a real SMTP relay, with sender policy.
7. WebAuthn enablement and recovery policy; default remains disabled.
8. Backup RPO/RTO, retention, off-host destination and restore cadence.
9. Gatus/Traefik/application checks, alert routing and log retention.
10. Maintenance window and evidence required to declare writer quiescence.
11. Rollback choice for post-cutover writes and any explicitly accepted data
    loss.
12. The separately authorized public router handover procedure.

## 21. Remaining blockers

The following are concrete blockers to operational cutover:

- no approved or initialized canonical storage root;
- no external production secret/key registry injected;
- no approved first-install administrator or bootstrap recovery procedure;
- no real-provider OIDC/SAML callback and identity-continuity verification;
- no approved SMTP sender/relay policy;
- no production WebAuthn enablement decision or recovery policy;
- no dedicated PRG32 Gatus/Traefik/application monitoring and alert policy;
- no maintenance window with proven legacy writer quiescence;
- no collision-free public router handover execution;
- no post-cutover rollback reconciliation/data-loss decision;
- current transitional auth-writer and its Nginx bridge are unhealthy in the
  local dev runtime because of a missing bind-mounted WebAuthn dependency;
- Flask still owns the current public API and must remain in place until an
  explicitly authorized cutover succeeds.

These blockers were not bypassed by synthetic test results.

## 22. Final decisions

`M541_PROVISIONING_READINESS_PARTIAL`

The target topology and inactive deployment contract are sufficiently mapped,
but required operator inputs and operational verification remain open. The
current transitional runtime health defect also prevents treating the existing
dev topology as a handover candidate.

`OPERATIONAL_CUTOVER_NO_GO`

No public ownership, data migration, secret injection, real provider login,
operational backup or service mutation is authorized by M5.4.1.

`FLASK_RETIREMENT_NO_GO`

Flask remains the current public API owner. Removing it would violate this
milestone's safety boundary and would be premature while storage, identity,
monitoring, writer-quiescence and rollback gates remain open.

## 23. Recommended next action

The next authorized phase should be an operator-led provisioning review, not
an automatic cutover. First approve the canonical storage owner/path and
external secret custody, then document the actual generic provider and SMTP
contracts, approve monitoring and rollback policy, and schedule a maintenance
window. Only after those decisions should a separately authorized disposable
or staging rehearsal use the intended paths and credentials, followed by a
human-approved public handover plan.

Until then, keep the current Flask/Next/transitional topology unchanged and do
not attach the current development containers to `dream_mail`, initialize
canonical storage, or modify Dream Traefik/Authentiк/Mailpit.
