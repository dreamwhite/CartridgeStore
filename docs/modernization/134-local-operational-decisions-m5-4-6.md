# PRG32 Cartridge Store — M5.4.6 Local Operational Decisions & Cutover Preparation

## 1. Executive summary

M5.4.6 produces the operator decision package for the future local
standalone deployment. It does not perform a cutover, bootstrap the final
canonical root, change Dream infrastructure, change public routing, retire
Flask, or alter the protected M5.4.3 installation.

~~~text
M546_OPERATOR_DECISION_PACKAGE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
~~~

The package is GO because all sixteen decisions are classified, technical
requirements are resolved where the repository can prove them, and every
remaining operator choice is explicit. It is not an operational GO.

| Classification | Decisions | Count |
| --- | --- | ---: |
| Already established | D07, D10 | 2 |
| Technically resolved; activation still needs approval | D01, D02, D03, D08, D09, D11 | 6 |
| Operator approval required | D04, D05, D06, D12, D13, D14, D15 | 7 |
| Deferred | D16 | 1 |
| Blocked by evidence | none | 0 |

## 2. Scope and safety

The authorized work was limited to source and documentation inspection,
read-only Docker and filesystem inspection, synthetic configuration rendering,
disposable validation and this report.

No operational or protected state was changed. Flask, Fastify, Next.js,
Traefik, Authentik, Mailpit, DNS, TLS, operational Compose, SQLite files,
object storage, .local/operational-m543/, and the sibling ../PRG32 repository
were not modified or restarted. No credentials, tokens, password hashes,
cookies, keys or populated secret files were created or printed. No staging,
commit, push, deployment, cutover or Flask retirement was performed.

Disposable docker run --rm identity checks and the existing CLI integration
tests did not attach to operational networks or mount operational data.

## 3. Baseline

The repository was already dirty. The pre-existing modified
frontend/next-env.d.ts, untracked CLI/deployment material, modernization
reports, lockfile, dependencies and generated test output were preserved.
They were not staged, cleaned or rewritten.

Observed:

- Node.js v24.20.0, selected with nvm use 24.
- pnpm 12.5.1.
- HEAD 8760f70f75251f47844dcd6fc18737ec94717ad7.
- HEAD subject: chore(infrastructure): align operational WebAuthn defaults.
- git diff --check passed.
- Protected M5.4.3 Fastify and Next.js containers were running and healthy.
- Current Dream development ownership is Flask for the API and Next.js for the
  storefront, with the transitional Fastify auth writer and Nginx bridge.
- External Dream Traefik, Authentik, Mailpit and Gatus were observed running.

The protected M5.4.3 bind mounts are separate from the future layout:

~~~text
.local/operational-m543/data/canonical -> /data/canonical
.local/operational-m543/secrets/key-registry.json -> /run/secrets/prg32-secret-key-registry
~~~

They remain out of scope and must not be reused as a future bootstrap target.

## 4. Decisions already established

The operator requirements in the M5.4.6 authorization are treated as current
decisions, not as new approvals:

- Final application runtime is exactly Fastify plus Next.js. Flask, Python,
  auth-writer and the Nginx compatibility bridge are not in the final
  application topology.
- Canonical SQLite, immutable objects, staging and recovery material share one
  root. No cloud database, second writer or repository database is introduced.
- A fresh local canonical installation is allowed. Existing legacy data is
  preserved and is not implicitly migrated or deleted.
- University integration is separate and deferred.
- mDNS is disabled by default and never gates readiness.
- Authentication is local plus generic OIDC/SAML. WebAuthn is initially
  disabled. No provider-specific Authentik assumption is required.
- Existing encrypted/authenticated backup-v4 and fresh-root restore remain the
  backup contract.
- The CLI is a one-shot administrative tool, not a runtime service and not a
  direct application-SQLite writer.

## 5. Decision classification

| ID | Classification | Current result | Approval status |
| --- | --- | --- | --- |
| D01 | Technically resolved | Filesystem layout and mount contract defined | Approve final host path |
| D02 | Technically resolved | Runtime and permission contract verified | Approve provisioning/ownership |
| D03 | Technically resolved | External secret/key contract defined | Approve custodian/recovery policy |
| D04 | Operator approval | Frequency, retention and off-device policy proposed | Required |
| D05 | Operator approval | RPO, RTO and restore-drill targets proposed | Required |
| D06 | Operator approval | Forward-fix preferred after canonical writes | Required |
| D07 | Already established | Fresh install allowed; legacy deletion unauthorized | Established |
| D08 | Technically resolved | Generic OIDC/SAML contracts and callbacks verified | Approve real provider values |
| D09 | Technically resolved | Optional Mailpit SMTP contract verified | Approve sender/enablement |
| D10 | Already established | WebAuthn disabled initially | Established |
| D11 | Technically resolved | Current/future route ownership explicit | Approve handover window |
| D12 | Operator approval | Minimal monitoring proposal prepared | Required |
| D13 | Operator approval | Bounded maintenance window proposed | Required |
| D14 | Operator approval | Legacy retention proposal prepared | Required |
| D15 | Operator approval | Clean Git release sequence prepared | Required |
| D16 | Deferred | University migration is not a local prerequisite | Deferred |

## 6. D01 — Storage

Recommended local layout:

~~~text
<operator-root>/
├── data/
│   └── canonical/
├── secrets/
├── backups/
└── runtime/
~~~

Future mount mapping:

~~~text
operator host: <operator-root>/data/canonical
container:    /data/canonical
~~~

PRG32_DATA_DIR is used by the standalone Compose contract;
PRG32_OPERATIONAL_DATA_DIR is used by the separate operational template. No
production path was selected and no root was created. A local development
operator may choose .local/operational/data/canonical; an installed host
should prefer a dedicated path outside the checkout.

The standalone Compose file contains exactly Fastify and Next.js, one private
internal network and the /data/canonical bind mount. Fastify is configured in
canonical-operational mode and is the sole canonical writer. Technical layout
is RESOLVED; final activation is OPERATOR_APPROVAL_REQUIRED.

## 7. D02 — Filesystem ownership

The operational images use Node 24 slim and run as:

~~~text
uid=1000(node) gid=1000(node)
~~~

Fastify is read-only except for the /data/canonical bind mount and bounded
/tmp tmpfs. SQLite WAL, SHM and journal activity require write and create
permission on the canonical directory, not just store.sqlite.

Required contract:

- Canonical SQLite/object/staging/recovery directories are writable by the
  runtime identity or by a host UID/GID mapping explicitly verified by the
  operator.
- The key registry is a separate read-only Compose secret and mode 0600 on the
  host.
- Backup output is in the operator-controlled backup directory, not an image
  layer.
- No chown or chmod is run against operational paths in this milestone.
- Docker Desktop/macOS bind mounts must be validated separately from native
  Linux ownership and locking.

Future runbook examples, not executed:

~~~text
Linux: provision the host root for UID/GID 1000:1000 and validate WAL.
macOS: use a Docker-shared directory and validate UID 1000 write/locking.
~~~

Technical requirements are RESOLVED. Ownership provisioning remains approval
required.

## 8. D03 — Secret custody

No secret values belong in Git, images, reports, logs or the manifest.

| Material | Source | Container use |
| --- | --- | --- |
| Session secret | protected provider/environment | Fastify session signing |
| Bootstrap token | protected provider/environment | one-time setup |
| Canonical read/write authorizations | protected provider/environment | writer boundary |
| Backup-v4 key registry | external 0600 file | read-only Compose secret |
| OIDC client secrets | protected reference/encrypted application record | federation |
| SAML material | protected provider/configuration reference | federation |
| SMTP credentials | protected provider/encrypted settings | optional SMTP |

The key registry enforces exactly one active key and supports historical keys.
A key cannot be removed while retained backups or encrypted settings need it.
Rotation requires a verified backup, restore with historical keys, new-key
activation and explicit old-key retention.

The final human/service custodian, recovery contact and minimum retention are
not invented here. The technical custody contract is RESOLVED; custody
approval remains open.

## 9. D04/D05 — Backup policy

Existing encrypted/authenticated backup-v4 remains the mechanism. It requires
external key custody, completion markers, writer quiescence, fresh-root
restore and independent verification. This milestone created no archive,
scheduler or off-device copy and modified no existing archive.

All values below are RECOMMENDATION — NOT APPROVED:

| Item | Proposal | Consequence |
| --- | --- | --- |
| Frequency | One verified backup daily and before changes/cutover | Recurring storage/operator work |
| Retention | 7 daily, 4 weekly, 3 monthly | Predictable growth and deletion review |
| Off-device | One encrypted copy on a separately controlled host/device | Protects local-disk loss; adds custody/transfer work |
| RPO | 24 hours for ordinary local use | Up to one backup interval of exposure |
| RTO | 4 hours for fresh restore and verification | Requires reserved operator capacity |
| Restore drill | Quarterly and before major storage/runtime upgrades | Consumes a disposable target |
| Key retention | Every key referenced by retained archives | Prevents impossible restores |

The operator must approve or replace every value. Mailpit and Dream storage are
not backup destinations.

## 10. D06 — Rollback after writes

Forward fix is preferred. No rollback was executed.

A. Before routing switch: keep Flask authoritative, retain evidence and discard
only the disposable target.

B. After routing switch with no canonical writes: freeze the candidate, prove no
writes occurred, preserve evidence and change the route only in an approved
edge operation. Health alone is not proof of no writes.

C. After canonical writes: never blindly restart Flask. Freeze writers and
inventory users, roles, groups, tokens, sessions, submissions, staging,
reviews, publications, releases, immutable objects, scores, runs, samples,
metrics, downloads, audit records, settings and journal state.

Use a pre-switch encrypted backup/manifest and a post-switch read-only
database/object/journal inventory containing identifiers, hashes, timestamps
and writer-lease state. Compare before choosing forward fix,
separate-authorized reconciliation or approved data-loss rollback. Data loss
is never implicit.

Operator approval statement:

> I approve forward-fix as the preferred post-write recovery strategy. No
> implicit data loss is authorized.

## 11. D07 — Local legacy data

Fresh local canonical installation is allowed. Legacy migration is not
required, but legacy deletion is not authorized.

Preserve without moving, renaming, overwriting or reusing as canonical:

- .local/flask/data/cartridge_store.sqlite and Flask objects;
- .local/writer/auth-data, .local/writer/shadow and writer objects;
- existing snapshots and archives;
- protected .local/operational-m543/.

~~~text
DATA MIGRATION NOT REQUIRED
LEGACY DATA DELETION NOT AUTHORIZED
~~~

## 12. D08 — OIDC/SAML

The backend implements generic provider records and protocol contracts and does
not hardcode Authentik. Existing synthetic Authentik evidence from M5.2g.23
and M5.2g.24 remains test-only evidence. No provider resource was created or
modified and no real login was performed.

Checklist for optional Dream integration:

| Value | Status |
| --- | --- |
| OIDC issuer, discovery and JWKS | Supplied/approved by identity operator |
| OIDC client ID | Supplied/approved |
| OIDC client secret reference | Protected custody |
| Redirect URI | https://api.prg32.dream.test/api/auth/oidc/<providerId>/callback |
| SAML entity ID | Supplied/approved |
| SAML ACS | https://api.prg32.dream.test/api/auth/saml/<providerId>/acs |
| SAML certificate | Protected custody |
| Identity mapping/linking | Explicit approval |
| Logout/re-login | Smoke-test in approved window |

sso.dream.test was reachable and its local TLS certificate validated. This
does not prove issuer, claims, client, account linking or real callback
acceptance. D08 is technically resolved; real values and login approval are
open.

## 13. D09 — SMTP

Optional local Dream proposal:

~~~text
Transport: enabled only after approval
Host:      mailpit
Port:      1025
Network:   dream_mail
TLS:       none for local Mailpit capture
Auth:      disabled
Sender:    operator-approved; none invented here
~~~

Standalone stays disconnected from dream_mail with SMTP disabled. Mailpit is
capture only, not proof of delivery. No email was sent. Host/port/transport
are compatible with Fastify; sender and enablement require approval.

## 14. D10 — WebAuthn

Initial local decision: DISABLED.

There is no RP activation, passkey registration/migration or recovery
dependency. Future Dream values, only after separate approval:

~~~text
RP ID:  store.prg32.dream.test
Origin: https://store.prg32.dream.test
~~~

No production RP ID or credential was created.

## 15. D11 — Routing

Observed labels:

| Host/path | Current owner | Evidence |
| --- | --- | --- |
| store.prg32.dream.test | development Next.js | prg32-store-dev, port 3000 |
| api.prg32.dream.test | Flask | prg32-api-dev, port 5080 |
| /auth, /api/auth, /api/admin/federation | Nginx auth bridge | priority 100, auth-writer:5090 |

Future ownership:

~~~text
store.prg32.dream.test -> operational Next.js :3000
api.prg32.dream.test   -> operational Fastify :5080
~~~

The handover must preserve HTTPS, trusted forwarded headers, approved cookie
domain, CORS, Next-to-Fastify API proxying, OIDC/SAML callbacks, WebSocket
upgrades and readiness routes. The priority-100 bridge must lose public
precedence only in the approved edge change.

Stop on an unknown writer, failed backup, unhealthy target, unresolved
identity, invalid callback origin, unverified cookie/CORS behavior, failed
WebSocket smoke test or competing Traefik owner. No labels/routes changed.

## 16. D12 — Monitoring

Dream Gatus exists on dream_edge with read-only configuration from the Dream
platform. Its inspected configuration contains platform checks but no
PRG32-specific endpoint entry. It was not modified.

Proposal — RECOMMENDATION — NOT APPROVED:

- Fastify /health and /ready every 30 seconds;
- Next.js /health every 30 seconds;
- API reachability and WebSocket smoke check every 60 seconds;
- backup freshness and disk capacity every 5 minutes;
- container restarts and authentication failures every 60 seconds;
- alert after two consecutive failures with maintenance suppression;
- operator-selected escalation destination.

The current public transitional API returned HTTP 404 for /health and /ready
because Flask owns that route today. This is not evidence that future Fastify
routes are public. Final owner validation remains required.

## 17. D13 — Maintenance window

Proposal — RECOMMENDATION — NOT APPROVED:

| Phase | Estimate | Restriction |
| --- | ---: | --- |
| Preflight/capacity | 15 min | None |
| Backup and writer freeze | 20 min | Write freeze |
| Fresh bootstrap/import | 25 min | Target isolated |
| Integration checks | 20 min | Target isolated |
| Routing change | 10 min | Yes |
| Smoke tests | 20 min | Controlled traffic |
| Initial observation | 30 min | Controlled observation |

Planning envelope is about 2 hours, with 40–60 minutes of expected
write/traffic restriction, assuming fresh install, known custody, available
images and no data migration. This is not a zero-downtime promise. Missing
provider values or failed preflight stops the window before routing.

## 18. D14 — Legacy retention

Recommendation — NOT APPROVED:

- retain Flask/auth-writer databases, object trees, images and transitional
  volumes through observation;
- preserve a read-only source snapshot and verified backup;
- retain legacy data at least 30 days after an accepted cutover, or longer if
  the approved recovery policy requires;
- archive before any deletion decision;
- treat application shutdown, archival, deletion and source retirement as
  separate approvals.

No prune, image removal, volume removal, git clean or legacy deletion occurred.

## 19. D15 — Git release

Proposed Conventional Commit sequence:

~~~text
feat(cli): add administrative operational commands
feat(deploy): add standalone Fastify and Next.js deployment contracts
test(cli): cover disposable and Docker-network acceptance
docs(operations): document provisioning and handover
chore(deps): record the required workspace lockfile
~~~

The final grouping must follow the actual diff. Include standalone deployment
files, CLI source/tests, maintained operator documentation, application source
and required lockfiles. Exclude SQLite, object storage, key registries, tokens,
certificates, node_modules, test output and generated artifacts. Do not
automatically stage all modernization reports.

This milestone did not stage, commit, push or rewrite history. The release
checkpoint remains operator approval required.

## 20. D16 — University migration

Status: DEFERRED.

University migration is not a prerequisite for the first local Dream-integrated
cutover. No university data, server, importer, ETL, bridge or manifest was
inspected or created. Future transfer requires a separate authorized
administration UI/API workflow.

## 21. Disposable validation

Validation used Node.js 24 selected through nvm and synthetic placeholders for
Compose interpolation. No placeholder was written as a production secret.

| Command/check | Result |
| --- | --- |
| pnpm --dir cli run check | PASS — 5 files, 9 tests; typecheck, lint, build |
| pnpm --dir backend run typecheck | PASS |
| pnpm --dir backend run lint | PASS |
| pnpm --dir backend run test | PASS — 55 files, 276 tests |
| pnpm --dir frontend run typecheck | PASS |
| pnpm --dir frontend run lint | PASS |
| pnpm --dir frontend run test | PASS — 22 files, 65 tests |
| docker compose --profile dev config --quiet | PASS |
| candidate Compose config | PASS |
| operational Compose with synthetic required values | PASS |
| standalone Compose with synthetic required values | PASS |
| standalone plus Dream override with synthetic values | PASS |
| git diff --check | PASS |

An earlier deliberately concurrent duplicate backend run produced one
5-second migration-test timeout under resource contention. The suite was
rerun alone and passed 55/55 files and 276/276 tests. The isolated result is
authoritative; the timeout is recorded as a test-runner parallelism
observation, not an application failure.

Bare standalone and operational Compose rendering without required secret
variables failed closed as designed. Synthetic values were used only for
interpolation validation.

### Public read-only observation

| Observation | Result |
| --- | --- |
| https://store.prg32.dream.test/ | HTTP 200 |
| https://api.prg32.dream.test/.well-known/prg32-store.json | HTTP 200 |
| https://api.prg32.dream.test/health | HTTP 404 under current Flask ownership |
| https://api.prg32.dream.test/ready | HTTP 404 under current Flask ownership |
| https://sso.dream.test/ | HTTP 200 |
| TLS for all three hosts | OpenSSL verify return code 0; local mkcert certificates |

Only low-volume unauthenticated GET/TLS observations were made. No form,
authentication, cookie collection, WebSocket token, provider administration or
mutating method was used.

### Compose/runtime inventory

Future independent topology:

~~~text
Fastify :5080 -> /data/canonical
Next.js :3000  -> Fastify over app_private
~~~

CLI is not a long-running service. Dream Traefik, Authentik, Mailpit and
optional Gatus are external integrations. Current development still contains
Flask, dev Next.js, auth-writer, auth-writer-init and Nginx bridge; removal is
only after cutover approval.

## 22. Compact operator approval package

### A. Storage and security

1. D01: approve the selected host directory mounted at /data/canonical.
2. D02: approve UID/GID 1000 ownership, WAL locking validation and restrictive
   key-registry permissions.
3. D03: name the secret/key custodian, recovery contact and key-retention
   policy; approve external custody only.

### B. Backup and recovery

4. D04: approve or replace daily/pre-change frequency and 7/4/3 retention.
5. D05: approve or replace RPO 24 hours, RTO 4 hours and quarterly drills.
6. D06: approve forward-fix as preferred post-write recovery; authorize no
   implicit data loss.

### C. External integrations

7. D08: approve real generic OIDC/SAML issuer, clients, certificates,
   mappings, callbacks and account-linking policy.
8. D09: approve SMTP disabled or the optional mailpit:1025 capture path and
   sender address.

### D. Routing and monitoring

9. D11: approve ordered routing handover from Flask/bridge to Fastify/Next.js
   for api.prg32.dream.test and store.prg32.dream.test.
10. D12: approve monitoring checks, cadence, threshold and escalation.

### E. Release and maintenance

11. D13: approve the bounded maintenance window and restrictions.
12. D14: approve legacy retention and later archival review.
13. D15: approve final diff review and Conventional Commit sequence.

D07 and D10 are established. D16 remains deferred. No approval above is
claimed as granted by this report.

## 23. Future cutover release gate

Before cutover, explicitly approve and evidence:

- canonical host root and /data/canonical mapping;
- UID/GID, directory, SQLite WAL and object permissions;
- session, bootstrap, canonical authorization and key custody;
- backup frequency, retention, off-device copy, RPO, RTO and drill;
- forward-fix/reconciliation decision;
- generic OIDC/SAML values and callback smoke test;
- SMTP state;
- WebAuthn state;
- public Next.js/Fastify ownership and removal of transitional precedence;
- monitoring owner, endpoints, alerts and suppression;
- maintenance window and stop conditions;
- legacy retention and archival;
- clean Git release checkpoint;
- final disposable operational preflight and storage audit;
- explicit written cutover authorization.

Preparation GO is not cutover authorization.

## 24. Validation results

The authoritative result is:

~~~text
M546_OPERATOR_DECISION_PACKAGE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
~~~

The GO applies only to the decision package. It does not certify public
Fastify ownership, migration, production backup freshness, real provider login,
SMTP delivery, routing handover or Flask retirement.

## 25. Files changed

Created by this milestone:

- docs/modernization/134-local-operational-decisions-m5-4-6.md

No application source, tests, Compose service, Dockerfile, deployment
environment, operational data or previous report was modified. The existing
dirty worktree remains preserved and unstaged.

## 26. Remaining blockers

P0/P1 cutover blockers:

- approval of canonical root, ownership and secret custody;
- backup policy, off-device custody, RPO/RTO and restore drill;
- explicit post-write rollback/forward-fix policy;
- real generic OIDC/SAML values and controlled-login acceptance;
- SMTP decision and sender identity;
- public routing handover and removal of priority-100 transitional precedence;
- monitoring owner and maintenance window;
- final Git release checkpoint and clean diff;
- final operational preflight against the approved root.

Current public API ownership is still Flask and the development auth-writer/Nginx
bridge remains. This transitional state prevents cutover and Flask retirement.

## 27. Final decisions

M5.4.6 is complete as a bounded preparation milestone:

~~~text
M546_OPERATOR_DECISION_PACKAGE_GO
~~~

The application is not authorized to change public ownership:

~~~text
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
~~~

## 28. Recommended next authorized phase

Run an operator approval phase using section 22. After approvals are recorded,
perform a separately authorized final preflight on a newly selected canonical
root, then request explicit cutover authorization with a named maintenance
window and rollback decision.

This report does not authorize routing changes, migration, service restarts,
backup scheduling or Flask removal.
