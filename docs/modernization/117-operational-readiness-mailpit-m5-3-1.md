# PRG32 Cartridge Store — M5.3.1 Operational Readiness, Dream Infrastructure Audit & Mailpit Integration

Date: 2026-10-14  
Execution mode: controlled read-only audit with disposable verification  
Decision: `M53_OPERATIONAL_READINESS_PLAN_PARTIAL`  
Operational cutover: `NO-GO`  
Flask retirement: `NO-GO`

## 1. Executive result

M5.3.1 produced a reliable operational-readiness plan, but not an
operational cutover authorization.

The local Dream infrastructure is running and its public development
origins are observable:

| Origin | Observed owner/behavior | Result |
| --- | --- | --- |
| `https://store.prg32.dream.test` | Next.js storefront, HTTP 200 | Verified |
| `https://api.prg32.dream.test` | Flask/Werkzeug API, HTTP 200 on `/` | Verified |
| `https://sso.dream.test` | Authentik redirect to its authentication flow | Verified |
| `https://mailpit.dream.test` | Mailpit UI through Traefik, HTTP 200 on GET `/` | Verified |

The existing Fastify writer is healthy but is intentionally isolated from
the Dream `dream_edge` and `dream_mail` networks. Mailpit accepts local
plain SMTP with permissive test authentication on container port `1025`,
but no Fastify-to-Mailpit network route exists in the current Compose
runtime. The authorized synthetic SMTP submission was therefore not sent;
no message was created and no operational inbox state was changed.

The candidate two-service topology and all disposable migration, backup,
recovery, federation, and parity tests pass. The remaining blockers are
operational ownership and cutover decisions: Fastify public API ownership,
SMTP network wiring, persistent-data/key custody, session continuity,
writer quiescence, and rollback policy.

## 2. Scope and safety boundary

This milestone inspected source, Compose definitions, Docker metadata,
public non-mutating endpoints, local SQLite integrity, and disposable test
fixtures. It did not:

- change Traefik, Authentik, Mailpit, DNS, TLS, Compose, networks, volumes,
  containers, or operational environment files;
- restart, stop, remove, or attach containers to operational networks;
- write to the Flask database, Fastify writer data, Mailpit inbox, or
  persistent Dream state;
- authenticate to Authentik or start OIDC/SAML user flows;
- migrate production data, change routing, remove Flask, deploy, commit, or
  push.

The inspected local Flask database and canonical writer database were opened
read-only. The writer database is a disposable synthetic fixture and is not
treated as an operational source of truth.

## 3. Baseline documents and implementation inspected

The following milestone documents were read before verification:

- `docs/modernization/110-real-authentik-callback-m5-2g-24.md`
- `docs/modernization/113-canonical-administration-m5-2g-27.md`
- `docs/modernization/114-migration-fault-injection-m5-2g-28.md`
- `docs/modernization/115-final-application-acceptance-m5-2g-29.md`
- `docs/modernization/116-final-disposable-application-m5-2g-30.md`

The following implementation areas were inspected:

- `backend/src/email/`
- `backend/src/settings/`
- `backend/src/admin/`
- `backend/src/app.ts`
- `backend/src/storage-v2/`
- `backend/tests/`
- `docker-compose.yml`
- `deploy/candidate/compose.yaml`
- `/Users/ivan/dream-platform/services/mailpit/docker-compose.yml`
- `/Users/ivan/dream-platform/services/traefik/docker-compose.yml`

No application code change was necessary for this audit. The only new
repository artifact from M5.3.1 is this report.

## 4. Dream infrastructure inventory

Docker Compose project discovery identified the actual Dream source
locations without printing environment-file values:

| Project | Compose source | Runtime observation |
| --- | --- | --- |
| `dream-traefik` | `/Users/ivan/dream-platform/services/traefik/docker-compose.yml` | running, healthy |
| `dream-mailpit` | `/Users/ivan/dream-platform/services/mailpit/docker-compose.yml` | running, healthy |
| `dream-authentik` | `/Users/ivan/dream-platform/services/authentik/docker-compose.yml` | running, healthy |
| `dream-gatus` | `/Users/ivan/dream-platform/services/gatus/docker-compose.yml` | running |
| `dream-whoami` | `/Users/ivan/dream-platform/services/whoami/docker-compose.yml` | running |
| `prg32-cartridge-store` | repository `docker-compose.yml` plus a local override | running |

Observed relevant containers were healthy unless otherwise stated:

| Container | Image role | Relevant networks |
| --- | --- | --- |
| `dream-traefik-traefik-1` | Traefik `v3.6.17` | `dream_edge` |
| `dream-mailpit-mailpit-1` | Mailpit `v1.27.4` | `dream_edge`, `dream_mail` |
| `dream-authentik-server-1` | Authentik server | Dream SSO/private/edge networks |
| `prg32-cartridge-store-flask-1` | transitional Flask API | `dream_edge`, project dev network |
| `prg32-cartridge-store-next-1` | Next.js storefront | `dream_edge`, project dev network |
| `prg32-cartridge-store-auth-writer-1` | Fastify auth/submission writer | project default and project dev networks only |
| `prg32-cartridge-store-auth-writer-edge-proxy-1` | Nginx auth bridge | `dream_edge`, project dev network |

The current root Compose file has the following application services:

- `cartridge-store` (`prod` profile): legacy Flask image;
- `backend` (`backend` profile): standalone Fastify development service;
- `auth-writer-init` (`writer-init`, `writer`, `dev` profiles): disposable
  writer initialization;
- `auth-writer` (`writer`, `dev` profiles): Fastify development writer;
- `auth-writer-edge-proxy` (`dual-origin`, `dev` profiles): auth-only Nginx
  bridge;
- `flask` (`dev` profile): transitional API owner;
- `next` (`dev` profile): Next.js development server.

The candidate Compose file contains exactly two application services:
`fastify` and `next`, on an isolated candidate network. It was inspected and
validated but not started or attached to Dream infrastructure in this
milestone.

## 5. Traefik and public routing observation

Traefik is configured with the external `dream_edge` network and Docker
provider selection on that network. The repository labels preserve the
requested hostnames:

- `store.prg32.dream.test` → Next.js service on port `3000`;
- `api.prg32.dream.test` → Flask service on port `5080` in the current
  transitional runtime;
- auth-specific `/auth`, `/api/auth`, and federation paths → the Nginx
  bridge, which forwards to Fastify on the project network;
- `mailpit.dream.test` → Mailpit web UI on port `8025`.

Low-volume public observations resolved all four local hostnames to
`127.0.0.1` and used only GET/HEAD requests. Results:

- `store.prg32.dream.test`: TLS/HTTP 200, Next.js headers present;
- `api.prg32.dream.test`: TLS/HTTP 200 on `/`, `Werkzeug/3.1.9` server
  header observed;
- `api.prg32.dream.test/health`: HTTP 404, consistent with the current Flask
  route set and not evidence of a Fastify health route;
- `api.prg32.dream.test/.well-known/prg32-store.json`: HTTP 200 with the
  discovery ABI and legacy-compatible service identifiers;
- `sso.dream.test`: HTTP 302 to the Authentik authentication flow;
- `mailpit.dream.test`: HTTP 200 on the UI GET.

No public POST, authentication, OIDC login, SAML login, WebSocket token, or
administrative request was made. The public observation proves current local
behavior only; it does not prove external-DNS behavior on another host.

## 6. Mailpit integration audit

The actual Dream Mailpit Compose definition is:

`/Users/ivan/dream-platform/services/mailpit/docker-compose.yml`

Its relevant contract is:

| Property | Observed configuration |
| --- | --- |
| Image | `axllent/mailpit:v1.27.4` |
| SMTP | container port `1025` |
| Web/API | container port `8025`, exposed through Traefik |
| Network | external `dream_mail` and `dream_edge` |
| SMTP TLS | not configured in the Compose definition |
| SMTP auth | test-only permissive acceptance enabled |
| Host allowlist | configured from the Dream Mailpit domain |
| Persistence | Dream state bind mount under the platform state root |

The Mailpit API is reachable through the public local route. Non-sensitive
status-only GET observations returned HTTP 200 for the messages, info, and
search API endpoints. Message bodies and headers were not collected.

Fastify's email implementation supports `disabled`, `memory`, and `smtp`
transports. SMTP supports `none`, `starttls`, and `implicit_tls` encryption,
bounded connection/delivery timeouts, optional AUTH PLAIN credentials, and
explicit certificate trust configuration. SMTP passwords are handled by the
secret store and are not returned by settings reads. Disposable tests cover
STARTTLS, implicit TLS, refusal, timeout, and missing-STARTTLS behavior.

The current runtime cannot execute Fastify SMTP delivery against Mailpit
without an unauthorized network or Compose change:

1. Mailpit is reachable on `dream_mail`/`dream_edge`.
2. The active Fastify writer is not attached to either network.
3. The active Nginx bridge is HTTP-only for auth routes and is not an SMTP
   relay.
4. Mailpit's SMTP port is not host-published.
5. Attaching the writer or a disposable helper to a Dream operational network
   would change operational infrastructure and violate this milestone's
   boundary.

Therefore the status is:

`MAILPIT_TEST_NOT_EXECUTED` — precise reason: `FASTIFY_SMTP_ROUTE_NOT_AVAILABLE`.

No synthetic recipient, subject, SMTP envelope, or Mailpit message was
created. The next authorized integration step must choose and document the
network owner before sending one unique test message. It must not silently
reuse the current isolated writer as if it were production-connected.

## 7. Authentication and federation readiness

The local public Authentik endpoint is reachable at `sso.dream.test` and
redirects unauthenticated requests into the Authentik flow. No credentials,
tokens, cookies, provider administration, OIDC authorization, or SAML
assertion was used in M5.3.1.

The existing M5.2g.24 evidence remains disposable and historical evidence of
the generic OIDC/SAML callback implementation. It is not a new operational
cutover proof. The guessed public OIDC discovery path used for a safe GET did
not return discovery metadata; this is recorded as `NOT_VERIFIED`, not as
evidence that the generic provider is absent. The exact provider paths and
client registration must be verified by an authorized operator without
printing client secrets or provider credentials.

Open gates before cutover:

- decide whether local sessions survive the origin/owner transition;
- verify exact generic OIDC and SAML provider registrations;
- verify callback and post-login origins remain
  `api.prg32.dream.test` and `store.prg32.dream.test`;
- verify the Fastify public owner for all auth, federation, and session
  routes;
- verify key custody and rotation access without exposing key material.

## 8. Storage and writer ownership audit

The local Flask SQLite file was opened using SQLite read-only mode:

`.local/flask/data/cartridge_store.sqlite`

Results:

- `PRAGMA integrity_check`: `ok`;
- `PRAGMA foreign_key_check`: no violations reported;
- safe counts: zero users, one group, zero user-group rows, zero submissions,
  scores, runs, samples, download events, and settings rows.

The local Fastify writer fixture was also opened read-only:

`.local/writer/auth-data/auth.sqlite`

Results:

- `PRAGMA integrity_check`: `ok`;
- `PRAGMA foreign_key_check`: no violations reported;
- safe synthetic counts include five users, one group, two user-group rows,
  one submission, one score, one run, and one sample.

The second database is synthetic disposable state and must not be treated as
the operational database. There is no evidence in this milestone that the
active Flask database has been quiesced, snapshotted, reconciled, or made
available to Fastify. There is also no authorization to perform that work.

The single-writer rule remains mandatory:

- before cutover, Flask is the legacy operational owner;
- during migration, no Fastify writer may accept public writes;
- after cutover, Fastify must be the sole canonical writer;
- rollback requires stopping/quiescing Fastify, reconciling post-cutover
  writes, and explicitly restoring legacy ownership;
- restarting Flask alone is not a rollback protocol.

## 9. Backup and rollback readiness

Disposable encrypted backup-v4, restore, integrity, interruption, and
rollback rehearsal tests passed in the backend suite. They prove the
candidate mechanisms against synthetic roots, not custody of operational
backup keys or the real Flask data directory.

The following operational gates remain open:

| Gate | Status | Reason |
| --- | --- | --- |
| Consistent source snapshot | `OPEN` | No operational quiescence authorized or performed |
| Complete source inventory | `OPEN` | No real-data migration authorized |
| Canonical target verification | `DISPOSABLE_ONLY` | Candidate evidence is synthetic |
| Backup archive custody | `OPEN` | Operational backup location/retention not changed or verified |
| Encryption key custody | `OPEN` | Only local disposable key metadata was observed |
| Publication/review ownership | `OPEN` | Current public API remains Flask |
| Metrics/scores/download write ownership | `OPEN` | No public writer handover performed |
| WebSocket ownership | `OPEN` | No public route cutover performed |
| mDNS ownership | `OPEN` | No operational registration change performed |
| Edge routing | `TRANSITIONAL` | API is still Flask; auth bridge is split |
| Rollback window/data-loss policy | `OPEN` | Operator decision required before cutover |

Pre-cutover abort is safe in principle: discard only the disposable target
and retain Flask authority. Post-cutover rollback is not a service restart;
it requires writer quiescence, traffic control, reconciliation of accepted
Fastify writes, and an explicit choice between accepted data loss,
post-cutover export/reconciliation, or a forward fix.

## 10. Disposable migration and recovery rehearsal evidence

The existing disposable suite was executed under Node.js `v24.20.0` with
pnpm `12.5.1`. It includes:

- legacy inventory and verification;
- deterministic migration and interruption boundaries;
- canonical catalog, publication, review, telemetry, scores, metrics,
  WebSocket, and mDNS compatibility;
- encrypted backup-v4 and restore;
- process-interruption recovery;
- candidate runtime and two-service readiness;
- synthetic OIDC/SAML and edge federation tests;
- final disposable cutover/rollback rehearsal.

The full backend result was 51 test files and 264 tests passed. The specific
cutover rehearsal test `tests/m52g14-cutover.test.ts` passed, as did the
backup-v4, migration, candidate-runtime, readiness, preflight, and edge
federation test files. This is disposable evidence only and does not authorize
operational migration.

## 11. Verification commands and results

All commands below were run from the repository root. Node commands used:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
node --version                    # v24.20.0
pnpm --version                    # 12.5.1
```

Results:

| Command | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 51 files, 264 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |

An initial Python invocation without the required test-only `SECRET_KEY`
failed one mDNS test during application construction (`63 passed, 1 failed`).
The prescribed test invocation with a non-production test secret passed all
64 tests. No application code was changed for that environment failure.

## 12. Required next implementation gates

Before M5.3.2 or an operational cutover can be authorized, resolve these
items in order:

1. Select the future Fastify public API owner and remove the current split
   ownership from the cutover plan.
2. Define the approved Fastify-to-Mailpit network path, SMTP host name, port,
   encryption mode, authentication policy, and secret source. Keep Mailpit
   local-only and do not expose SMTP publicly.
3. Execute exactly one unique SMTP integration message only after that path
   is authorized; verify its capture through the existing Mailpit API without
   exporting unrelated messages.
4. Verify generic OIDC/SAML provider registrations and session-continuity
   behavior without exposing credentials or provider secrets.
5. Define operational SQLite/storage snapshot ownership and a quiescence
   window.
6. Verify encrypted backup-v4 key custody, retention, restore target policy,
   and operator access.
7. Produce the cutover/rollback command sequence with single-writer proofs,
   telemetry ownership, WebSocket ownership, mDNS ownership, and an explicit
   accepted-data-loss policy.
8. Repeat public GET/HEAD verification after the final candidate is attached
   to `dream_edge`; do not treat the current Flask 200 as Fastify parity.

## 13. M5.3.1 decisions

| Decision | Result | Rationale |
| --- | --- | --- |
| Operational readiness plan | `M53_OPERATIONAL_READINESS_PLAN_PARTIAL` | Infrastructure and disposable evidence are complete, but SMTP wiring, public Fastify ownership, real key custody, and cutover gates remain open |
| Mailpit SMTP acceptance | `MAILPIT_TEST_NOT_EXECUTED` | No authorized Fastify route to `dream_mail`; sending would require an operational network change |
| Dream public observation | `VERIFIED_LOCAL_ONLY` | Local DNS/TLS/HTTP behavior was observed with safe requests |
| Disposable migration/recovery | `GO` | Existing synthetic suite passed, including cutover/rollback rehearsal |
| Operational cutover | `NO-GO` | Flask still owns the public API and no writer handover occurred |
| Flask retirement | `NO-GO` | Public API, data ownership, routing, and rollback gates remain transitional |

This report is the sole new Markdown artifact for M5.3.1. No Compose,
Traefik, Authentik, Mailpit, database, volume, network, deployment, commit,
or push operation was performed.
