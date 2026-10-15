# PRG32 Cartridge Store — M5.4.2 Standalone Deployment & Infrastructure Independence

Decision: `M542_STANDALONE_DEPLOYMENT_GO`

Mandatory decisions:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

Assessment date: 2026-10-15

## 1. Executive summary

M5.4.2 established a standalone deployment boundary that does not require
Dream Platform, Dream Docker networks, Traefik, Authentik, Mailpit or any
developer-specific absolute path. The standalone Compose contract contains
exactly two application services: `fastify` and `next`.

Both services use the existing Node.js 24 operational images. The standalone
Compose configuration was validated without Dream networks and the optional
Dream overlay was validated separately. A disposable run used the actual
operational images, a fresh canonical SQLite root and a synthetic external key
registry. After the explicit storage bootstrap command, both containers became
healthy, Fastify became ready with the canonical writer lease, the setup wizard
completed, local authentication and CSRF worked, the catalog contract returned
successfully, and setup/storage survived a restart.

External reverse proxies, identity providers, SMTP relays, TLS, DNS, storage,
secret custody and monitoring remain operator-supplied integration boundaries.

No running Dream service, public route, operational database, production
secret, legacy database or Flask service was modified. No commit or push was
performed.

## 2. Scope and safety

Implemented:

- standalone Compose with two application services;
- explicit loopback-only and generic reverse-proxy overlays;
- opt-in Dream integration overlay;
- safe standalone environment example;
- standalone deployment documentation;
- disposable startup, bootstrap, setup, authentication, persistence and
  proxy checks;
- full requested regression and Compose validation.

Not performed:

- no operational Compose start, stop, restart or recreation;
- no Dream network, Traefik, Authentik, Mailpit, DNS or TLS modification;
- no public routing change or cutover;
- no production canonical SQLite initialization;
- no real provider login or university-service access;
- no university content migration or importer work;
- no Flask or transitional-service removal;
- no Git staging, commit or push.

The disposable containers and network were removed after the test. The
synthetic temporary filesystem root under `/tmp` was left untouched by cleanup
policy; it is outside the repository and all operational Dream paths.

## 3. Architecture decision

Dream is now an optional integration, not an application dependency.

Fastify remains the sole canonical writer and owns canonical SQLite, immutable
objects, private staging, publication recovery, authentication, sessions,
authorization, WebAuthn state, generic OIDC/SAML state, SMTP settings, all
publishing/review/telemetry/score state, WebSockets and backup-v4.

Next.js remains the storefront, administration UI, setup wizard and browser
API-proxy boundary. No application feature requires a Dream service to start.

The canonical application images remain the existing operational images. No
Dream-specific image or build target was introduced.

## 4. Previous deployment dependencies

The active development topology still contains Flask, Next, `auth-writer`, an
Nginx auth bridge and external Dream infrastructure. It was not changed and
remains transitional.

The previous operational template required external `dream_edge` and
`dream_mail` networks, Dream hostnames, Traefik labels and Mailpit. Those
assumptions are not part of the new default deployment:

| Previous assumption | Standalone result |
|---|---|
| `dream_edge` | No default external network; optional generic `proxy` overlay |
| `dream_mail` | No default SMTP network; SMTP is disabled/configured by operator |
| Traefik | No labels in base Compose; any reverse proxy may be used |
| Authentik | No provider container or provider-specific runtime code |
| Mailpit | No fixture container; optional SMTP configuration only |
| `sso.dream.test` | No default identity-provider URL |
| Dream absolute paths | Operator-controlled `PRG32_DATA_DIR` and key path |
| Flask/auth-writer | Not present in standalone Compose |
| Python runtime | Not present in final Fastify/Next runtime images |

## 5. New deployment structure

```text
deploy/
├── standalone/
│   ├── compose.yaml
│   ├── compose.direct.yaml
│   ├── compose.proxy.yaml
│   ├── compose.test.yaml
│   └── README.md
├── integrations/
│   └── dream/
│       └── compose.override.yaml
└── examples/
    └── standalone.env.example
```

The base `deploy/standalone/compose.yaml` is the deployment contract. The
other Compose files are explicit overlays:

- `compose.direct.yaml`: loopback-only ports for diagnostics;
- `compose.proxy.yaml`: an operator-created generic external proxy network;
- `compose.test.yaml`: disposable-only test settings and loopback ports;
- `integrations/dream/compose.override.yaml`: explicit Dream opt-in.

No overlay adds a third application service. Existing candidate, disposable and
operational templates were preserved.

## 6. Standalone Compose contract

The base file defines exactly two services:

| Service | Image source | Internal port | Persistence |
|---|---|---:|---|
| `fastify` | `backend/Dockerfile.operational` | 5080 | bind mount at `/data/canonical` |
| `next` | `frontend/Dockerfile.operational` | 3000 | no application database/storage |

The base file has one private `app_private` bridge network, no external network
declaration, no host-port publishing, no Flask/Python/Nginx/Authentiк/Mailpit
or database service, no proxy labels, health checks for `/ready` and `/health`,
health-gated Next startup, read-only roots, tmpfs `/tmp`, dropped capabilities,
`no-new-privileges`, non-root runtimes and an external key-registry secret.

Required operator inputs fail Compose interpolation when absent: canonical path,
key registry, canonical authorizations, session secret, bootstrap token, public
origins, WebSocket URL and trusted-proxy decision. There is no Dream or
repository-local production fallback.

The backend remains operational-only:

```text
PRG32_BACKEND_CATALOG_READ_MODE=canonical-operational
PRG32_BACKEND_CANONICAL_WORKFLOW_MODE=operational
PRG32_BACKEND_AUTH_WRITE_MODE=operational
PRG32_BACKEND_DB=/data/canonical/store.sqlite
PRG32_BACKEND_STORE_DATA=/data/canonical
PRG32_BACKEND_MDNS_ENABLED=false
PRG32_BACKEND_BACKUP_ENABLED=false
```

Public backup HTTP routes are not enabled by Compose.

## 7. Reverse proxy models

### Model A: external reverse proxy

`compose.proxy.yaml` attaches both services to an explicitly named
operator-created external network. It does not assume the proxy implementation
or add labels. The proxy must route the store HTTPS origin to Next port 3000,
the API HTTPS origin to Fastify port 5080, and WebSocket upgrades to
Fastify `/api/multiplayer`.

The proxy must preserve the original HTTPS host/scheme, set forwarded headers
only at the trusted boundary, enforce request/body limits and avoid exposing
Fastify directly. `PRG32_TRUST_PROXY=true` is an explicit required operator
input in canonical-operational mode; the backend refuses to start without it.

Required callback shapes are:

```text
https://<api-host>/api/auth/oidc/<providerId>/callback
https://<api-host>/api/auth/saml/<providerId>/acs
```

### Model B: direct standalone diagnostics

`compose.direct.yaml` publishes only loopback ports:

```text
127.0.0.1:15080 -> Fastify 5080
127.0.0.1:13000 -> Next 3000
```

This overlay is not a public production edge. Secure cookies and
provider/WebAuthn origins still require HTTPS, so a local TLS terminator is
required for a complete browser authentication/setup flow. Security controls
were not weakened to make plain HTTP convenient.

The mapping was present in rendered Compose, but host-side curl could not reach
those ports in the current Docker host; the application was verified from
inside the isolated containers instead. This is an environment-specific port
publishing observation, not a Dream dependency or application change.

## 8. Canonical storage

Standalone uses an explicit bind mount:

```text
PRG32_DATA_DIR=<operator-controlled local path> -> /data/canonical
```

The root contains `store.sqlite` and supported WAL/SHM files, storage-v2
immutable objects, private submission staging, publication journal/recovery,
authentication, settings, federation, telemetry, scores and audit state. It
must be a local filesystem with reliable SQLite locking, suitable ownership for
the non-root runtime, and no writable sharing with Flask or an auth writer.

An empty root is not initialized automatically. The operator must explicitly
run:

```bash
pnpm --dir backend run storage:bootstrap-operational -- \
  --root /absolute/path/to/canonical \
  --authorization '<operator-provided-authorization>'
```

This preserves the fail-closed storage contract and prevents an accidental
production database from being created by a Compose start.

## 9. Secret management

Required secret classes are canonical read/write authorization, session secret,
one-time bootstrap token, backup-v4 key registry, SMTP credentials when used,
OIDC client-secret references and SAML signing/trust references.

The key registry is supplied as a Compose secret at
`/run/secrets/prg32-secret-key-registry`, outside application data. Existing
validation enforces a regular non-symlink file, bounded size, restrictive
permissions and exactly one active key. No new secret manager was introduced.

`deploy/examples/standalone.env.example` contains empty secret placeholders,
not credentials. Values must come from an operator secret provider or protected
process environment and must not be committed, copied into images, logged,
placed in browser storage or included in backup archives.

Environment variables select deployment behavior; Docker secrets provide the
key registry; external providers own production custody; SQLite stores
application settings and encrypted secret references, never plaintext secret
values in responses.

## 10. Generic OIDC/SAML

No Authentik- or Parthenope-specific runtime dependency was added. Existing
generic provider administration remains responsible for issuer/discovery,
client ID, external client-secret references, scopes, redirect URI, entity IDs,
ACS URL, certificates and identity mapping.

OIDC state, nonce, PKCE, browser correlation, issuer and JWKS checks remain
active. SAML destination, recipient, request correlation, signature and
certificate checks remain active. A standalone installation with no configured
provider is valid; real provider login was not performed here.

## 11. Generic SMTP

Mailpit is not part of standalone Compose. SMTP starts disabled unless the
operator selects it through the setup/admin flow. Existing settings support
host, port, `none`, `starttls` or `implicit_tls`, optional authentication,
sender/reply-to, connection test and test message.

The existing SSRF-resistant outbound policy remains active. Private/internal
SMTP destinations require explicit infrastructure allowlisting; no global
private-network exception was added. University or other approved SMTP relays
can be configured without code changes. No real email was sent.

## 12. WebAuthn

WebAuthn is deployment-configurable and disabled by default:

```text
PRG32_BACKEND_WEBAUTHN_ENABLED=false
```

When enabled, the operator must provide an explicit RP ID, compatible HTTPS
origin list and account-recovery policy. Standalone defaults contain no Dream
hostname. Secure cookies, CSRF, origin validation and trusted-proxy behavior
remain active in operational mode.

## 13. mDNS

mDNS remains optional and disabled by default. Standalone Compose does not
require multicast networking, UDP 5353, extra capabilities or a special Docker
network. The firmware discovery ABI and service constants are unchanged.

Enabling mDNS requires separate infrastructure permission, application
preference, interface review and a controlled restart. Canonical operational
mode continues to reject implicit production activation.

## 14. Optional Dream integration

`deploy/integrations/dream/compose.override.yaml` is not loaded by the
standalone base. It is an explicit overlay that attaches Fastify to external
`dream_edge` and `dream_mail`, attaches Next to `dream_edge`, adds optional
Traefik labels, and selects `mailpit:1025` only when deliberately enabled.

The overlay does not create, modify, start or stop Dream infrastructure. It is
not required for standalone Compose validation. Rendering the base and Dream
overlay confirmed that the service set remains exactly Fastify and Next.

## 15. University deployment compatibility

No university-specific implementation was created. An operator can deploy the
same images by supplying university HTTPS origins and DNS, a managed reverse
proxy, university OIDC/SAML provider records, an approved SMTP relay, local
persistent storage, a secret provider, backups and monitoring.

No university credentials, provider metadata, certificates, domains or
cartridges were invented or accessed.

## 16. First installation

The first-installation flow was exercised in the disposable standalone run:

1. Generate a synthetic external key registry outside the data root.
2. Bootstrap an empty canonical root with the explicit operational command.
3. Start exactly two application containers on the generated private network.
4. Verify Fastify health/readiness and the canonical writer lease.
5. Authorize the wizard with a synthetic bootstrap token.
6. Create a synthetic first administrator.
7. Save store, registration, security, SMTP-disabled, OIDC-disabled,
   SAML-disabled, mDNS-disabled and review steps.
8. Complete installation, obtain CSRF state and authenticate locally.
9. Verify `/api/auth/me`, `/api/games` and Next `/api/games`.
10. Restart both containers and verify durable setup/storage state.

Observed result:

```text
Fastify health: 200
Fastify ready: 200
Next health: 200
Setup completion: 200
Setup after completion: INSTALLATION_COMPLETE
CSRF issuance: 200
Local login: 200
Authenticated /api/auth/me: true
Catalog /api/games: 200
After restart: Fastify and Next healthy; writer lease held
```

Starting an empty root without bootstrap correctly failed closed with
`canonical operational database is unavailable`; no automatic initialization
was added.

## 17. Backup-v4

The existing encrypted authenticated backup-v4 implementation is preserved and
does not depend on Dream paths. Standalone operation requires operator choices
for external key custody, quiesced-writer backup windows, archive/off-host
destinations, retention, RPO/RTO, independent verification, fresh-root restore
and key rotation.

No backup HTTP route is enabled and no production archive was created.
Existing disposable tests cover creation, verification, rotation, restore,
wrong-key rejection, tampering, truncation and interrupted restore behavior.

## 18. Security validation

The review confirmed:

- no secret values in Compose YAML or the public environment example;
- no hardcoded Dream credentials or developer data paths;
- no private keys in images;
- exact store-origin CORS rather than unrestricted CORS;
- secure cookies in the production base configuration;
- explicit trusted-proxy input;
- existing SSRF-resistant OIDC/SAML and SMTP outbound policy;
- no public bootstrap or backup route enabled by Compose;
- only Fastify receives writable canonical storage;
- no writable Flask/Next storage in standalone deployment;
- no unnecessary host ports in base Compose;
- no Dream network attachment in base or disposable acceptance;
- non-root runtime, read-only root filesystem, tmpfs and dropped capabilities.

The disposable test override changes `NODE_ENV` and Secure-cookie behavior only
for loopback acceptance. It is marked disposable and is not an operational
override.

## 19. Disposable standalone acceptance

The acceptance used the actual images built by the operational Dockerfiles,
not a mock server. The environment had fresh canonical SQLite storage, a
synthetic external key registry, synthetic authorization/session values, one
Compose-created private network, no Dream network, no SMTP fixture, no
external identity provider, mDNS disabled and WebAuthn disabled.

| Requirement | Result |
|---|---|
| Both containers start | PASS |
| Fastify healthy and ready | PASS |
| Next healthy | PASS |
| Setup available and completes | PASS |
| First administrator authenticates | PASS |
| Session and CSRF work | PASS |
| Canonical SQLite survives restart | PASS |
| Setup completion survives restart | PASS |
| Catalog and Next proxy work | PASS |
| No Flask/Python runtime dependency | PASS; Node `v24.21.0`, no Python executable |
| No Dream network dependency | PASS; only `app_private` attached |
| No mandatory SMTP dependency | PASS; SMTP disabled |
| No mandatory OIDC/SAML dependency | PASS; both disabled |

The first pre-bootstrap start failed as designed because the canonical database
did not exist. The explicit bootstrap then returned schema 2, layout 2, journal
1 and backup format 3, after which the acceptance passed.

## 20. Regression results

Node.js 24 was selected through nvm for Node-based commands.

```text
pnpm --dir backend run typecheck   PASS
pnpm --dir backend run lint        PASS
pnpm --dir backend run test        PASS — 55 files, 276 tests
pnpm --dir backend run build       PASS

pnpm --dir frontend run typecheck  PASS
pnpm --dir frontend run lint       PASS
pnpm --dir frontend run test       PASS — 22 files, 65 tests
pnpm --dir frontend run build      PASS

SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q
PASS — 64 tests
```

Compose validation passed for the root dev profile, candidate, operational,
standalone base, direct overlay, proxy overlay and explicit Dream overlay.
Standalone base and Dream overlay each rendered exactly `fastify` and `next`.

One initial operational Compose invocation used stale variable names for the
external key-registry/bootstrap inputs and failed interpolation. It was
immediately rerun with the actual template variable names and passed; no
service was started by either validation.

The standalone image build passed:

```text
docker compose -f deploy/standalone/compose.yaml build
PASS — prg32-cartridge-store-fastify:standalone
PASS — prg32-cartridge-store-next:standalone
```

## 21. Files changed

New files created by M5.4.2:

- `deploy/standalone/compose.yaml`
- `deploy/standalone/compose.direct.yaml`
- `deploy/standalone/compose.proxy.yaml`
- `deploy/standalone/compose.test.yaml`
- `deploy/standalone/README.md`
- `deploy/integrations/dream/compose.override.yaml`
- `deploy/examples/standalone.env.example`
- `docs/modernization/128-standalone-deployment-m5-4-2.md`

No existing backend/frontend source file was modified. No existing
operational, candidate or disposable Compose definition was rewritten.
Previous untracked modernization reports and local artifacts were preserved.

## 22. Remaining blockers

M5.4.2 has no known unresolved P0/P1 application defect in the tested
standalone scope. Operational work remains blocked by the M5.4.1 gates:

- canonical production path owner, permissions, capacity and filesystem;
- production secret-provider and key-registry custody;
- real OIDC/SAML provider registration and identity continuity;
- approved SMTP relay/sender policy;
- WebAuthn recovery policy and production enablement;
- monitoring and alerting implementation;
- maintenance window and single-writer quiescence evidence;
- collision-free public reverse-proxy handover;
- post-cutover rollback/reconciliation policy.

The direct loopback overlay requires a local TLS terminator for complete secure
browser flows, and its host-port reachability should be checked on the target
Docker Engine. This does not affect the base Model A deployment contract.

## 23. Final decisions

`M542_STANDALONE_DEPLOYMENT_GO`

The standalone application is independent of Dream infrastructure, contains
exactly two application services, preserves canonical persistence and security
controls, supports operator-owned secrets and generic integrations, and passed
the disposable acceptance and required regressions.

`OPERATIONAL_CUTOVER_NO_GO`

This milestone does not authorize public routing, real secret provisioning,
production SQLite initialization, external provider login or ownership handover.

`FLASK_RETIREMENT_NO_GO`

Flask remains in the current runtime and was not removed. Its retirement
requires separately authorized cutover and all storage, identity, monitoring,
writer-quiescence and rollback gates.

## 24. Recommended next phase

The next authorized phase should be an operator-led review on the target Linux
host. Provision the canonical path and external key registry, select the
reverse-proxy model, configure real origins and generic provider/SMTP
contracts, and run the TLS-backed acceptance without Dream-specific
assumptions.

Only after that evidence is accepted should operational provisioning and a
separate public cutover authorization be considered. Keep Flask and all
transitional services unchanged until then.
