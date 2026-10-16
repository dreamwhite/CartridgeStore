# PRG32 Cartridge Store — M5.4.8 Local Integration Closure

**Date:** 2026-10-15
**Branch:** `development`
**Decision:** `M548_LOCAL_INTEGRATION_PARTIAL`
**Operational cutover:** `OPERATIONAL_CUTOVER_NO_GO`
**Flask retirement:** `FLASK_RETIREMENT_NO_GO`

## 1. Executive summary

M5.4.8 closed the local two-service integration gates that could be exercised
without changing Dream infrastructure or authenticating to a real provider.
The local Fastify and Next.js containers are healthy, reachable through the
Docker networks used by the Dream edge and Mailpit services, and the host
loopback forwards currently respond successfully.

SMTP was configured through the supported administrator API using the external
Mailpit service. A synthetic message was accepted by Fastify and observed
through Mailpit's HTTP API. The local outbound policy was narrowed to the
exact `mailpit` hostname for this disposable integration.

The milestone is partial because the execution policy prohibited real
Authentik administration and real OIDC/SAML login. No dedicated provider
resources were created, no public callback was exercised, and no external
backup destination was supplied. The public origins still resolve to the
transitional Flask/edge topology. These are cutover blockers, not reasons to
weaken the acceptance criteria.

## 2. Scope and authorization

Executed within scope:

- read-only inspection of repository, Compose, Docker networks and public
  unauthenticated endpoints;
- disposable local Fastify/Next integration;
- one pre-change encrypted backup-v4 of the local canonical root;
- local Mailpit SMTP acceptance using synthetic data;
- bounded health, readiness, persistence and regression checks;
- read-only inspection of external backup availability and public TLS/routing.

Not executed:

- no Traefik, Authentik, Mailpit, Gatus, DNS or certificate mutation;
- no public POST/PATCH/PUT/DELETE, authentication flow or provider login;
- no real OIDC/SAML resource creation or callback exchange;
- no cutover, dual-writer mode, Flask shutdown or deployment;
- no database migration, production-data access or volume cleanup;
- no commit or push.

## 3. Baseline and Git state

Initial state was branch `development` at `926fd4f` (`chore(frontend): refresh
generated Next.js type references`). The worktree already contained unrelated
untracked/generated paths:

```text
?? .srl
?? frontend/test-results/
?? node_modules/
?? pnpm-lock.yaml
```

These paths were preserved and were not staged, cleaned, or rewritten. The
tracked source tree had no pre-existing diff. `git diff --check` passed.

Node.js 24 was selected with `source "$HOME/.nvm/nvm.sh" && nvm use 24` for
Node and pnpm checks.

## 4. Protected roots and pre-change backup

The following roots were inspected and preserved:

- `.local/operational-m543/` — preserved unchanged;
- `.local/operational/` — preserved as the current local operational root;
- `.local/operational/secrets/` — mode `0700`;
- key registry and first-admin credential files — mode `0600`;
- `.local/operational/backups/` — mode `0700`.

Before changing canonical SMTP settings, only the new local Fastify writer was
quiesced. The pre-change backup was created with the existing backup-v4 CLI:

| Field | Result |
|---|---|
| Archive | `.local/operational/backups/m548-prechange.backup4` |
| Backup ID | `90f30ffd-c68b-49fe-a4bd-25a4994620df` |
| Archive bytes | `582811` |
| Key ID | `key-20261015-01` |
| CLI verification | `complete` |
| Completion marker | present |
| File permissions | `0600` |

Independent CLI verification was rerun after integration and returned the
same backup ID, size, key ID and `verification_state=complete`. The key value
was never printed. No plaintext database or key registry was copied to an
external destination.

## 5. Docker topology

The local operational project remains a two-service runtime:

| Service | Container | Role | State |
|---|---|---|---|
| Fastify | `prg32-local-operational-fastify-1` | canonical API and sole local writer | healthy, restart count 0 |
| Next.js | `prg32-local-operational-next-1` | storefront | healthy, restart count 0 |

The base standalone Compose definition remains independent: two application
services, a private internal network, bind-mounted canonical data and an
external key-registry secret. The Dream integration overlay was parsed with
`docker compose config` only; it was not started because its labels claim the
public `api.prg32.dream.test` and `store.prg32.dream.test` routers.

For this bounded local test, the existing containers were connected at runtime
to `dream_edge` and the Fastify container to `dream_mail`. The base Compose
file was not changed, so these runtime-only network attachments are not
presented as a portable deployment contract. Recreating the containers requires
an explicit, separately authorized integration step.

External services observed but not modified:

- Dream Traefik;
- generic Authentik at `sso.dream.test`;
- Mailpit;
- Gatus.

## 6. Network forwarding diagnosis

The earlier host-forwarding discrepancy was not reproducible after the
controlled Fastify recreation. Current read-only probes returned:

| Endpoint | Result |
|---|---|
| `http://127.0.0.1:15080/ready` | HTTP 200, Fastify ready |
| `http://127.0.0.1:13000/health` | HTTP 200, Next.js healthy |
| Fastify on `dream_edge` | HTTP 200 via `prg32-local-fastify:5080` |
| Next.js on `dream_edge` | HTTP 200 via `prg32-local-next:3000` |
| Mailpit SMTP on `dream_mail` | SMTP `220` banner received |

No `--network host`, wildcard binding workaround, public router change or
container capability change was used.

## 7. Dream network integration

The local containers are reachable from the existing external network names
used by Dream infrastructure. This proves Docker-network reachability only;
it does not prove public router ownership or a cutover-safe edge configuration.

The local Fastify container has the expected app-private, `dream_edge` and
`dream_mail` connections. Next.js has app-private and `dream_edge` connections.
No public Traefik labels were added to either local container.

## 8. Traefik and public routing

No Traefik configuration was inspected through an administration interface or
modified. The existing transitional topology remains authoritative for public
traffic.

Low-volume unauthenticated observations were:

| Origin/request | Observation |
|---|---|
| `https://store.prg32.dream.test/` | HTTP 200 HTML |
| `https://api.prg32.dream.test/ready` | HTTP 404 from Werkzeug/Flask |
| `https://api.prg32.dream.test/.well-known/prg32-store.json` | HTTP 200 JSON from Werkzeug/Flask |
| `https://sso.dream.test/` | HTTP 302 to the default Authentik authentication flow |

TLS certificate verification returned code `0 (ok)` for all three hostnames;
the negotiated protocol was TLS 1.3. Public observation therefore confirms
the existing edge is reachable, not that Fastify owns it.

## 9. SMTP sender configuration

Using the protected local first-administrator credential file inside a
disposable client container, the supported `/api/admin/settings` API was used
to set:

```text
smtp.enabled=true
smtp.host=mailpit
smtp.port=1025
smtp.encryption=none
smtp.auth_enabled=false
smtp.from_name=PRG32 Cartridge Store Local
smtp.from_email=prg32-store@localhost.invalid
```

The test recipient used an `example.invalid` address and no credential or
message body was printed. The settings readback after Fastify container
recreation confirmed persistence.

The ignored local environment file was augmented with the exact disposable
outbound exception `PRG32_SETUP_NETWORK_TEST_ALLOWLIST=mailpit`. This is not a
private-network wildcard and is not a production SMTP authorization.

## 10. Mailpit verification

The supported SMTP test endpoints returned:

```text
smtp_connection status=200 code=smtp_connection_ok
smtp_message status=200 code=smtp_message_accepted
```

Mailpit's supported HTTP API, queried read-only from `dream_edge`, returned
HTTP 200 and matched one message for the synthetic recipient. The observed
subject was `PRG32 Cartridge Store test message`. Mailpit was not reconfigured
and its database or volumes were not accessed directly.

## 11. Authentik inventory

The public Authentik surface was observed without login. The root redirected
to the default authentication flow. The tested unauthenticated discovery/API
candidate paths returned 404, which is not evidence that no private provider
exists.

The container environment was inspected for variable names only; values were
redacted. No Authentik administrator credential was used, printed, or stored.
Existing M5.2g.23/M5.2g.24 resources were not touched, and no new
`prg32-local-operational-*` resource was created because this milestone's
execution policy prohibited real provider administration.

**Status:** `NOT_VERIFIED`.

## 12. OIDC provisioning

No OIDC client/provider was provisioned. No client secret was generated or
read. The future provider contract remains generic and must use the dedicated
prefix `prg32-local-operational-` when a separately authorized Authentik
administration window is opened.

Required future callback target:

```text
https://api.prg32.dream.test/api/auth/oidc/<providerId>/callback
```

No callback was redirected away from Flask.

**Status:** `NOT_VERIFIED`.

## 13. OIDC callback acceptance

Real OIDC discovery, authorization-code exchange, PKCE, state/nonce
validation against Authentik, callback routing and session continuity were not
executed. The existing synthetic provider tests remain source-level regression
evidence only and are not a real-provider acceptance result.

**Status:** `NOT_VERIFIED`; this is a cutover blocker.

## 14. SAML provisioning

No SAML service-provider resource or certificate was created in Authentik.
Existing signature, issuer, audience and certificate validation code was not
weakened. No Authentik private metadata or credentials were accessed.

**Status:** `NOT_VERIFIED`.

## 15. SAML callback acceptance

No real Authentik SAML login, signed response, ACS exchange or browser session
was performed. The existing synthetic SAML tests do not prove the external
provider contract.

**Status:** `NOT_VERIFIED`; this is a cutover blocker.

## 16. Identity and session safety

The local admin login used a fresh session and CSRF token. No Flask cookie was
accepted by Fastify, no OIDC/SAML identity was linked to a local account, and
no email-based identity linking or local-admin mapping was introduced.

The public discovery response from the local Fastify instance advertises the
approved origins:

```text
web=https://store.prg32.dream.test/
api=https://api.prg32.dream.test/api
multiplayer=wss://api.prg32.dream.test/api/multiplayer
```

This is configuration evidence, not proof of public Fastify ownership.

## 17. Authenticated WebSocket

The multiplayer implementation accepts board-player tokens from the
configured `PRG32_USERS` compatibility boundary. The local operational
environment does not contain a board-player identity, and there is no
canonical admin API that provisions one. The test therefore did not invent a
board credential or mutate the environment.

Existing synthetic tests cover valid and invalid board tokens, anonymous
rejection and relay behavior. A real authenticated local WebSocket acceptance
requires an explicitly provisioned least-privilege board identity.

**Status:** `NOT_VERIFIED` / conditional gate.

## 18. External backup destination

The host filesystem and project bind mounts were inspected read-only. No
operator-approved external backup destination was supplied. Available local
storage is not an approved off-host backup target, and no arbitrary Docker
volume was selected.

No plaintext database, backup key registry or secret bundle was copied.

**Status:** `NOT_VERIFIED`.

## 19. Snapshot coordination

Host-level filesystem snapshot coordination was documented but not executed.
The future handover must coordinate SQLite writer quiescence, immutable-object
inventory, backup completion, external snapshot retention and restore
verification. A host snapshot must never be treated as a substitute for the
application-level encrypted backup-v4 protocol.

## 20. Monitoring

The application health and readiness endpoints, Docker health states, restart
counts and local disk capacity were inspected. Both local containers were
healthy with restart count `0`; readiness reported database, canonical storage
and writer lease as available. No Gatus check, alert, dashboard or external
monitoring configuration was changed.

## 21. Restart and persistence

Only the new local Fastify container was recreated, once, to apply the
non-secret disposable Mailpit allowlist. Next.js, Flask, auth-writer,
Traefik, Authentik, Mailpit and Gatus were not restarted.

After recreation:

- Fastify returned healthy;
- canonical readiness returned HTTP 200;
- admin login succeeded;
- SMTP settings remained present in canonical storage;
- SMTP connection and test-message delivery still succeeded;
- the backup key registry remained available;
- runtime network attachments were restored for the bounded integration probe.

No secret rotation or persistent-root reset was performed.

## 22. Validation commands and results

All commands below were run in the local worktree. No expensive browser E2E
suite was run.

| Check | Result |
|---|---|
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests; typecheck, lint, tests and build |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 55 files, 276 tests |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| operational Compose config with disposable placeholders | PASS |
| standalone Compose config with local env | PASS |
| standalone + Dream overlay `config --quiet` | PASS; not started |
| `git diff --check` | PASS |
| CLI verification of `m548-prechange.backup4` | PASS — `complete` |
| local Docker edge/Mailpit probes | PASS |
| public origin/TLS observations | OBSERVED; no mutation |

The Python and TypeScript test warnings were non-fatal diagnostics from the
existing test suite. No test result was fabricated.

## 23. Files changed

Tracked application source, Compose files, Traefik configuration, Authentik
configuration and production data were not modified.

One ignored local configuration line was added to:

```text
.local/operational/secrets/standalone.env
```

It contains only the exact disposable SMTP hostname allowlist. The only new
tracked-intent artifact from this milestone is this report:

```text
docs/modernization/136-local-integration-closure-m5-4-8.md
```

The pre-existing untracked/generated paths listed in section 3 remain
untouched. No commit or push was performed.

## 24. Remaining blockers

The following prevent operational cutover:

1. Real generic OIDC provider provisioning and callback acceptance are not
   verified.
2. Real generic SAML provider provisioning and ACS acceptance are not
   verified.
3. A deliberate identity/session continuity decision is still required for
   existing users and provider subject mappings.
4. Authenticated board WebSocket acceptance needs an approved test identity or
   an explicit decision that the board path is out of the cutover gate.
5. No approved external backup destination and retention owner are defined.
6. Public API ownership remains transitional Flask/edge ownership.
7. Writer quiescence, migration snapshot and rollback-data-loss policy remain
   operational decisions rather than executed actions.
8. Runtime network attachments are manual for this local probe and are not a
   portable Compose deployment contract.

## 25. Decisions

| Decision | Result |
|---|---|
| M5.4.8 local integration | `M548_LOCAL_INTEGRATION_PARTIAL` |
| Two-service local runtime health | PASS |
| Host forwarding | PASS in current Docker Desktop state |
| Docker-network edge reachability | PASS, internal only |
| SMTP/Mailpit | PASS with exact local allowlist |
| Public store/API observations | OBSERVED; transitional Flask ownership remains |
| Authentik OIDC/SAML | `NOT_VERIFIED` |
| External backup transfer | `NOT_VERIFIED` |
| Operational cutover | `OPERATIONAL_CUTOVER_NO_GO` |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` |

## 26. Recommended next phase

Open a separately authorized provider-acceptance milestone with a bounded
change window. It should provision only new resources prefixed
`prg32-local-operational-`, record exact client/entity identifiers without
recording secrets, verify callback URLs for both approved origins, perform
real OIDC and SAML exchanges, and then cleanly remove or rotate disposable
credentials.

Before any cutover milestone, separately approve an external encrypted-backup
destination, writer-quiescence procedure, session continuity policy, board
identity policy, public Traefik ownership change and explicit rollback
data-loss policy. Until those gates are closed, keep Flask and the existing
transitional edge authoritative.
