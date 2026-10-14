# PRG32 Cartridge Store — M5.3.2 Operational Integration Rehearsal & Mailpit Connectivity

Date: 2026-10-14  
Execution mode: controlled operational-network integration and disposable rehearsal  
Integration decision: `M532_INTEGRATION_REHEARSAL_GO`  
Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`  
Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive decision

M5.3.2 is **GO for the controlled integration rehearsal**.

Exactly one synthetic SMTP message was submitted to the existing Dream
Mailpit through a temporary helper attached only to `dream_mail`. The message
was accepted and verified through the Mailpit API. The helper was removed and
the Dream network membership returned to its pre-test state.

The disposable application rehearsal also passed. The candidate Fastify and
Next.js images built successfully, and the existing isolated browser harness
passed all 16 Playwright scenarios.

This result does not authorize an operational handover. The public API still
belongs to Flask, real-data migration was not performed, and the operational
backup/key-custody and writer-quiescence gates remain open.

## 2. Authorization and safety

The only operational mutation authorized by this milestone was creation of
one disposable SMTP helper on the existing `dream_mail` network. The helper
was not connected to `dream_edge`, had no volumes, no host ports, no Docker
socket, no credentials, and no application/database mounts.

No operational Compose file, Traefik configuration, Authentik provider,
DNS/TLS configuration, application container, SQLite database, object store,
or persistent volume was changed. No existing container was restarted or
attached to a new network. No real user, credential, token, authentication
link, or production identifier was used.

The synthetic Mailpit message was intentionally not deleted, as required by
the milestone. No unrelated Mailpit messages were enumerated or retrieved.

## 3. Docker preflight

The active Docker context was `desktop-linux`.

The existing network and service were revalidated before the helper was
created:

| Item | Observation |
| --- | --- |
| Network | `dream_mail`, Docker bridge, `internal=true` |
| Mailpit container | `dream-mailpit-mailpit-1` |
| Image | `axllent/mailpit:v1.27.4` |
| Health | `healthy`, running |
| Mailpit network aliases | `mailpit`, container alias |
| Mailpit address on `dream_mail` | `172.25.0.2` |
| SMTP port | `1025/tcp`, not host-published |
| Web/API port | `8025/tcp`, exposed through Traefik on `mailpit.dream.test` |
| Existing `dream_mail` members | Mailpit plus the pre-existing `abacus` and `locus` application containers |
| Helper connection requirement | `dream_mail` only |

The helper resolved `mailpit` through Docker DNS and connected directly to
`mailpit:1025`. No host publishing or edge-network route was required.

## 4. Mailpit Compose findings

The source of truth was re-read from:

`/Users/ivan/dream-platform/services/mailpit/docker-compose.yml`

Relevant configuration:

- Mailpit image `axllent/mailpit:v1.27.4`;
- external networks `dream_mail` and `dream_edge`;
- SMTP exposed internally on `1025`;
- Mailpit web/API exposed internally on `8025` and routed by Traefik;
- persistent Mailpit state mounted under the Dream platform state root;
- no SMTP TLS configuration in the Compose definition;
- `MP_SMTP_AUTH_ACCEPT_ANY` enabled for local test use;
- `MP_SMTP_AUTH_ALLOW_INSECURE` enabled for local test use;
- no SMTP credentials were required for this test.

The existing Traefik labels route only the Mailpit web/API interface at
`mailpit.dream.test`. They do not expose SMTP publicly.

## 5. SMTP authentication and TLS findings

The helper used plain SMTP on `mailpit:1025`.

The server greeting and EHLO capabilities reported `AUTH LOGIN PLAIN`, but
the server accepted an unauthenticated envelope. No username or password was
invented or sent. The server did not advertise STARTTLS, and implicit TLS was
not attempted against a plain SMTP port.

Observed transport contract:

| Setting | Required value for local Mailpit |
| --- | --- |
| Host | `mailpit` when the client is on `dream_mail` |
| Port | `1025` |
| Encryption | `none` |
| Authentication | disabled/no credentials for the controlled helper test |
| Public SMTP exposure | prohibited; keep SMTP internal to `dream_mail` |

The permissive AUTH settings are suitable only for this local Mailpit
environment. They must not be copied to a production relay configuration.

## 6. Temporary helper and single SMTP submission

The helper used the already available local image `alpine:3.24.1` and was
created with:

- unique container name `prg32-m532-smtp-helper-20261014193619-45313`;
- `--network dream_mail` only;
- no `--publish` options;
- no volumes or secret mounts;
- read-only root filesystem;
- a small `/tmp` tmpfs;
- all Linux capabilities dropped;
- `no-new-privileges` enabled;
- bounded CPU, memory, and PID limits;
- `--pull=never`, so no image was downloaded;
- automatic removal with `--rm` after the one command.

The synthetic identifiers were:

- test identifier: `20261014193619-45313`;
- recipient: `prg32-m532-20261014193619-45313@example.invalid`;
- subject: `PRG32 M5.3.2 Mailpit Integration 20261014193619-45313`.

The body contained only the required synthetic marker:

`PRG32 Cartridge Store — M5.3.2 controlled SMTP integration test.`

The SMTP server returned `250 2.0.0 Ok` and a queue identifier. The helper
exited successfully. No retry or second submission was performed.

Result: `MAILPIT_SMTP_ACCEPTED`.

## 7. Mailpit capture verification

The existing HTTPS Mailpit API was used through:

`https://mailpit.dream.test/api/v1/search`

The search used only the unique test identifier. It returned exactly one
matching message. The message endpoint was then read once and checked for:

- exact synthetic recipient;
- exact synthetic subject;
- the required M5.3.2 body marker;
- the unique test identifier.

No unrelated message bodies or attachments were retrieved.

Result: `MAILPIT_CAPTURE_VERIFIED`.

## 8. Helper cleanup

Cleanup verification succeeded:

- helper container count after completion: `0`;
- `dream_mail` still existed and remained `internal`;
- Mailpit remained running and healthy;
- `dream_mail` membership contained the same pre-existing three containers;
- Traefik, Authentik, Flask, Next.js, and the transitional writer remained
  running without restart;
- no operational Compose or Dream service definition was modified.

## 9. Fastify Mailpit configuration

Fastify's existing email implementation was inspected in:

- `backend/src/email/service.ts`;
- `backend/src/settings/service.ts`;
- `backend/src/settings/routes.ts`;
- `backend/src/admin/routes.ts`;
- `backend/src/app.ts`.

The future canonical settings contract is:

| Setting | Candidate value for Dream Mailpit integration |
| --- | --- |
| `smtp.enabled` | `true` only in an explicitly authorized disposable/integration environment |
| `smtp.host` | `mailpit` if Fastify joins `dream_mail`; otherwise an explicitly approved internal DNS name |
| `smtp.port` | `1025` |
| `smtp.encryption` | `none` for the current Mailpit Compose contract |
| `smtp.auth_enabled` | `false` for this local Mailpit contract |
| `smtp.from_email` | operator-selected non-sensitive sender, not hard-coded by the integration helper |
| timeout settings | existing bounded connection and delivery timeouts |
| password storage | SecretStore only when a future relay requires credentials |

The application supports `none`, `starttls`, and `implicit_tls`, but this
Mailpit instance supports only the plain mode observed above. Fastify must not
fall back silently from TLS to plaintext. Settings remain persisted in the
canonical SQLite authority; no second SMTP configuration mechanism is needed.

Administrative behavior is already separated into test-connection and
test-message operations. Both are authorization-protected, use the canonical
settings runtime, and return stable error responses. The existing Fastify
synthetic SMTP tests cover transport refusal, timeout, STARTTLS failure, and
implicit TLS compatibility. This milestone did not write Fastify settings or
send a second Mailpit message from Fastify.

The evidence levels are intentionally separate:

1. This milestone proves Dream Mailpit network connectivity and one SMTP
   capture through the helper.
2. Existing disposable Fastify tests prove the application transport and
   settings behavior.
3. Neither proves that an operational Fastify writer is authorized to join
   `dream_mail` or that production SMTP should use Mailpit.

## 10. Authoritative legacy data inventory

The active local Flask container mount was revalidated from Docker metadata:

`/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/.local/flask/data`
→ `/data`

The Flask application configuration uses this mounted directory for
`PRG32_STORE_DATA` and the SQLite path
`/data/cartridge_store.sqlite` for the current development runtime.

Read-only filesystem inventory:

| Component | Observed state |
| --- | --- |
| SQLite | `cartridge_store.sqlite`, 135,168 bytes |
| Catalog index | `index.json` absent |
| Cartridge root | `cartridges/` exists but contains no files |
| Cartridge binaries | 0 |
| Media files | 0 separate files |
| Pending submission files | 0 in the inspected Flask data root |
| Total regular files under the data root | 1, the SQLite database |
| Aggregate data-root size | approximately 192 KiB |

SQLite read-only checks returned `integrity_check=ok` and no foreign-key
violations. Safe row counts were:

| Table | Rows |
| --- | ---: |
| `users` | 0 |
| `groups` | 1 |
| `user_groups` | 0 |
| `api_tokens` | 0 |
| `registration_tokens` | 0 |
| `store_settings` | 0 |
| `cartridge_submissions` | 0 |
| `download_events` | 0 |
| `scores` | 0 |
| `runs` | 0 |
| `samples` | 0 |

The observed catalog source of truth in Flask is the combination of
`index.json` and regular files under
`cartridges/<game_id>/<version>/<architecture>.prg32`. The inspected local
mount currently has neither a catalog index nor cartridge objects. This is a
complete inventory of the active local development mount, not a claim that a
separate production host or uninspected backup contains no catalog data.

The inspected repository Compose topology exposes no additional legacy
catalog volume. No separate Dream backup service, restic configuration,
snapshot service, or object-storage service was found in the inspected Dream
platform tree. This leaves operational backup discovery as an open handover
gate rather than silently treating the local mount as production authority.

## 11. Source-to-target migration map

The existing storage-v2 inventory and migration primitives define the
following map. Historical data requiring identity or ambiguity decisions is
not auto-linked or auto-promoted.

| Category | Legacy source | Canonical target | Migration and verification | Rollback implication |
| --- | --- | --- | --- | --- |
| Cartridges | `index.json` cartridge identities | `cartridges` | deterministic ID mapping; inventory and row/identity verification | retain legacy snapshot until parity is accepted |
| Releases/versions | index release/version records | `releases` | stable release IDs, publication-state checks | unpublished or ambiguous releases remain recoverable, not published |
| Architecture artifacts | `cartridges/<game>/<version>/<architecture>.prg32` | `artifacts` + immutable object store | bounded path check, regular-file check, SHA-256/size and embedded metadata verification | remove only disposable target on pre-cutover abort |
| Icon/screenshot/media | embedded PRG32 media blocks and declared media | `media` + immutable object store | MIME, hash, size, identity and release mapping checks | preserve source bytes and migration exceptions |
| Site assets | legacy settings/static asset sources if present | canonical site asset objects/settings | explicit asset inventory and hash verification | manual decision for assets with no source mapping |
| Users | Flask `users` | canonical `users` | explicit identity mapping; password hashes only through approved compatible migration | sessions are not assumed portable |
| Groups/roles | Flask `groups`, `user_groups`, role fields | canonical groups and membership tables | row-level and membership verification | preserve disabled/status policy before any writer handover |
| Sessions | Flask session cookies/server records | not directly migrated | require re-login or an explicit session-continuity design | rollback cannot assume old cookies remain valid |
| API tokens | Flask `api_tokens` | canonical token metadata/hash records | hash/token lookup compatibility verification; plaintext values never exported | revoke or explicitly preserve according to identity decision |
| OIDC mappings | legacy external-provider fields/mappings | canonical federation provider and identity tables | explicit provider/subject mapping; never match by email alone | unmapped identities require controlled re-login |
| SAML mappings | legacy SAML identity fields | canonical external identities/federation tables | issuer/NameID mapping and certificate/provider verification | preserve disabled/ambiguous identities for manual review |
| Submissions | `cartridge_submissions` and pending paths | canonical submissions, drafts, staging objects | ownership, architecture, SHA-256, size, status and private-boundary checks | pending staging is restored privately; never auto-published |
| Reviews | legacy review fields/history | canonical moderation/review records | decision, reviewer, note, and publication-state consistency | rejected revisions remain rejected until explicit review |
| Publication state | legacy active index state | canonical publication operations/events/release state | publication journal and object-state verification | incomplete operations become recovery-required |
| Downloads | `download_events` | canonical download telemetry | deterministic artifact mapping; unmapped events become exceptions | post-cutover writes require reconciliation before rollback |
| Scores | `scores` | canonical scores | compatibility projection and ordering/timestamp checks | post-cutover score writes are part of rollback data-loss decision |
| Runs | `runs` | canonical runs | identity, owner, firmware fields and state verification | preserve historical run ownership where resolvable |
| Samples/metrics | `samples` and run metrics | canonical samples/metrics | row identity, run relation, bounded export and foreign-key checks | post-cutover firmware writes require reconciliation |
| Settings | Flask `store_settings` and static configuration | typed canonical settings and SecretStore records | allowlisted keys, redaction, schema/version and audit verification | secrets require key-custody and rollback policy |

Migratable historical data is data with a verified deterministic mapping.
Data requiring controlled re-login includes sessions and identities lacking a
stable provider subject mapping. Data requiring operator choice includes
ambiguous downloads, missing artifacts, broken media references, incomplete
submissions, untrusted settings, and any secret whose key custody is not
proven. Nothing in this milestone migrated real data.

## 12. Operational routing inventory

Read-only inspection of current container labels and the Dream Traefik
Compose source found:

| Router/service | Current owner | Rule/target |
| --- | --- | --- |
| Storefront | Next.js | `Host(store.prg32.dream.test)`, TLS, service port `3000` |
| Public API | Flask | `Host(api.prg32.dream.test)`, TLS, service port `5080` |
| Transitional auth | Nginx edge bridge → Fastify writer | API host plus `/auth`, `/api/auth`, and federation admin path prefixes |
| Mailpit UI | Mailpit | `Host(mailpit.dream.test)`, TLS, service port `8025` |
| SSO | external Authentik server | `sso.dream.test` through Dream edge aliases |

Traefik selects `dream_edge` as its Docker provider network and terminates
TLS on the `websecure` entrypoint. The observed local browser origins are:

- `store.prg32.dream.test` → Next.js;
- `api.prg32.dream.test` → Flask for the public API, while the transitional
  auth bridge reaches Fastify;
- `sso.dream.test` → external Authentik;
- `mailpit.dream.test` → external Mailpit UI/API.

The future ownership design remains:

```text
store.prg32.dream.test  → Next.js
api.prg32.dream.test    → Fastify
sso.dream.test           → external generic OIDC/SAML provider
mailpit.dream.test       → external Mailpit UI/API only
```

That design was not applied to operational routing in M5.3.2. WebSocket
ownership, authentication callback ownership, router priorities, and
middleware behavior must be revalidated after a separately authorized
Fastify edge candidate is attached to `dream_edge`.

## 13. Disposable integration candidate

`deploy/candidate/compose.yaml` was inspected and built without attachment to
Dream networks. It contains exactly two application services:

- `fastify`, using `backend/Dockerfile.candidate`;
- `next`, using `frontend/Dockerfile.candidate`.

The candidate uses a dedicated `candidate` bridge network, a disposable
canonical bind root, read-only containers, bounded tmpfs, dropped
capabilities, no public edge attachment, and mDNS disabled. The Fastify
candidate owns canonical SQLite and immutable storage in the disposable root;
Next.js proxies to Fastify on the candidate network.

The candidate Compose build passed for both images. The isolated Playwright
global setup separately exercised a disposable Fastify/Next/HTTPS edge,
synthetic OIDC and SAML providers, canonical storage, authentication, CORS,
CSRF, WebSocket, SMTP capture, and administrative workflows. No candidate
service was published through Dream Traefik.

## 14. Federation readiness

Generic OIDC and SAML remain the intended provider interfaces. Existing
M5.2g.24 evidence covers disposable real-provider callback behavior, while
M5.3.2 added no real login or provider mutation.

Current readiness:

- Authentik is externally reachable at `sso.dream.test` and returns its
  unauthenticated flow redirect;
- exact provider client secrets and provider-admin state were not accessed;
- callback origins remain configured around
  `api.prg32.dream.test` and `store.prg32.dream.test`;
- synthetic OIDC and SAML callbacks pass in the disposable browser suite;
- identity mapping must use provider/subject identity, never email-only
  matching;
- session continuity, logout continuity, provider registration, certificate
  custody, and final operational callback routing remain handover gates.

The helper SMTP test does not establish federation readiness and no
Authentik provider was changed.

## 15. Backup and key custody

The repository contains storage-v2 backup-v3 and encrypted backup-v4
implementation and tests. The candidate Compose definition explicitly keeps
backup disabled. The inspected Dream platform tree contained no separate
backup scheduler, restic configuration, snapshot service, or external key
provider configuration.

Therefore the operational state is:

| Requirement | Status |
| --- | --- |
| Backup format compatibility | disposable implementation verified |
| Encrypted backup-v4 tests | pass in backend suite |
| Operational backup location | not verified |
| Schedule/retention | not verified |
| External key provider/custody | not verified |
| Restore destination and operator access | not verified |
| RPO/RTO | operator decision required |

No operational backup was created, copied, rotated, or restored. No key
material was printed or exported. A handover cannot be approved until the
operator identifies the encrypted backup location, retention, key owner,
restore target, verification cadence, and recovery objectives.

## 16. Writer ownership

The handover boundary remains:

1. Before cutover, Flask owns public API and legacy writes.
2. During cutover, public writes are quiesced and a consistent authorized
   snapshot is inventoried.
3. The canonical target is independently verified before any public writer is
   enabled.
4. After cutover, Fastify is the sole canonical writer.
5. Flask and Fastify must never accept simultaneous writes.

The current runtime is still split: Flask owns public API traffic, Fastify
owns only the transitional auth/submission writer paths, and the helper was
not Fastify. The controlled Mailpit test intentionally did not change this
ownership.

## 17. Rollback and abort conditions

The default rollback preference is `FORWARD_FIX` after any post-write
cutover. A safe rollback requires:

- Fastify writer quiescence;
- traffic control;
- inventory of all post-cutover canonical writes;
- reconciliation or explicit accepted-data-loss authorization;
- controlled restoration of legacy ownership;
- re-verification of the legacy snapshot.

Pre-write abort is simpler: discard only the disposable target and retain
Flask authority. Restarting Flask alone is not a post-write rollback.

Abort conditions for the next handover rehearsal are:

- more than one writer can accept a mutation;
- source snapshot or object inventory is incomplete;
- any required artifact/media hash does not match;
- a publication or migration journal is incomplete without a recovery plan;
- backup/key custody cannot be proven;
- session/identity continuity is ambiguous;
- public router selection does not unambiguously identify the intended owner;
- SMTP delivery falls back from the configured encryption policy;
- any operational service or persistent data would need an unapproved write.

## 18. Disposable rehearsal

The synthetic rehearsal covered:

- source inventory and migration primitives;
- canonical verification and immutable objects;
- encrypted backup-v4 and fresh restore;
- candidate Fastify startup/readiness through the existing isolated harness;
- Next.js browser startup and public catalog/download flows;
- local authentication and CSRF;
- synthetic OIDC and SAML callbacks;
- authenticated WebSocket relay;
- settings/SMTP behavior and disposable SMTP capture;
- publication/review/admin workflows;
- simulated cutover, abort, rollback, and forward-fix decisions.

The final browser run passed all 16 scenarios. The first full run had one
failure in the reset-link flow because the test could click before Next.js
hydration and could read a shared capture entry. The fixture was corrected to
scope links to messages created after the current request and wait for
`networkidle` before interactive completion. The corrected full run passed
`16/16`; this is a test determinism fix, not an application behavior change.

## 19. Regression and build results

Node was selected with `nvm use 24`:

```text
node v24.20.0
pnpm 12.5.1
```

| Command/result | Outcome |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 51 files, 264 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir frontend run test:e2e` | PASS — 16/16 Playwright scenarios |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml build` | PASS — Fastify and Next candidate images |
| `git diff --check` | PASS |

The initial Python invocation without the required test-only `SECRET_KEY`
is not used as the acceptance result; the prescribed test-only invocation
passed all 64 tests.

## 20. Files changed for M5.3.2

- `frontend/e2e/m52g30.spec.mjs`: made SMTP-link selection request-scoped and
  waited for browser hydration before interactive registration/password-reset
  actions;
- `docs/modernization/118-operational-integration-m5-3-2.md`: this report.

No production backend, frontend runtime, Docker Compose, Dream infrastructure,
database, object store, authentication provider, or public route was changed.

## 21. Remaining operational blockers

1. Fastify is not yet the public API owner for `api.prg32.dream.test`.
2. The operational writer is not connected to `dream_mail`; the SMTP helper
   proved connectivity but was intentionally not an application writer.
3. The actual operational legacy catalog/objects on any production host still
   require an operator-authorized inventory and consistent snapshot.
4. Backup schedule, retention, restore destination, RPO/RTO, and encryption
   key custody are not verified.
5. Generic OIDC/SAML provider registration, callback ownership, identity
   mapping, and session-continuity decisions remain open.
6. WebSocket, mDNS, firmware telemetry, scores, downloads, publication, and
   review writer ownership remain to be transferred as one single-writer
   boundary.
7. A post-cutover rollback data-loss policy requires explicit human approval.

## 22. Required human approvals

Before operational handover, an operator must approve:

- the exact Fastify attachment and public Traefik router transition;
- whether and how Fastify may join the internal SMTP network;
- the production SMTP relay policy, TLS mode, authentication, and sender;
- the source snapshot/quiescence window;
- identity/session continuity behavior;
- backup/key custody and recovery objectives;
- the single-writer cutover window;
- the accepted-data-loss versus forward-fix rollback policy.

## 23. Recommended next phase

The next phase should be an operator-reviewed cutover plan and a separately
authorized dry run against an explicitly selected disposable copy of the
authoritative legacy catalog. It should not yet remove Flask. First close the
real-data inventory, key-custody, session-continuity, router-ownership, and
writer-quiescence gates.

## 24. Final decisions

| Decision | Result |
| --- | --- |
| M5.3.2 integration rehearsal | `M532_INTEGRATION_REHEARSAL_GO` |
| SMTP server acceptance | `MAILPIT_SMTP_ACCEPTED` |
| Mailpit message capture | `MAILPIT_CAPTURE_VERIFIED` |
| Helper cleanup | `GO` — no helper remains |
| Disposable application rehearsal | `GO` — 16/16 Playwright plus backend/candidate evidence |
| Operational handover | `NO-GO` |
| Operational cutover | `OPERATIONAL_CUTOVER_NO_GO` |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` |

No M5.3.3 or later milestone was started. No real data was migrated. No
public routing or operational Compose was changed. No Authentik provider was
modified. No commit, push, or deployment was performed.
