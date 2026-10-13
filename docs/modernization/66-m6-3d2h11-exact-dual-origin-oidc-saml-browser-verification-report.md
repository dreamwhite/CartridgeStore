# PRG32 Cartridge Store — M6.3d.2h.11 Exact Dual-Origin OIDC/SAML Browser Verification

Date: 2026-10-13
Status: **NO-GO — Dream TLS recovered, but downstream browser acceptance remains incomplete**

## Scope

This milestone prepared a reproducible, isolated Chromium/Playwright fixture
for the exact browser origins:

- store: `https://store.prg32.dream.test`;
- API: `https://api.prg32.dream.test`;
- disposable generic identity provider: Authentik used only as the local OIDC/SAML fixture;
- disposable Fastify writer, SQLite databases, Authentik database, provider
  records, identity links, sessions, and generated test secrets.

The implementation does not use credentials from the user's Authentik
installation, production data, host `/etc/hosts`, global browser TLS bypasses,
or `ignoreHTTPSErrors`.

## Implemented fixture

The root `docker-compose.yml` remains the single Compose file. The existing
`authentik-e2e` profile now includes an exact-origin path which:

- starts a disposable Next.js dev server with direct dual-origin API mode;
- routes only the API authentication/federation namespaces through a
  disposable Nginx edge proxy joined to the existing external `dream_edge`
  network;
- routes the store host to the disposable Next.js service;
- uses Chromium's host resolver mapping to resolve the exact store/API names
  to the existing Traefik container without changing host DNS or `/etc/hosts`;
- imports the existing mkcert root CA into the browser container at runtime;
- keeps the Authentik fixture CA separate;
- creates local user and administrator credentials only for the run;
- runs with Node 24 in the Playwright image.

The focused browser runner covers the intended positive/negative matrix for
local login/logout, linked OIDC, linked SAML, unknown OIDC/SAML identities,
provider rendering, cookie flags, credentialed API requests, and federation
administration UI smoke. Existing backend tests remain the authority for
invalid-state, replay, invalid-signature, disabled-provider, disabled-account,
and privilege-isolation negative cases when the browser gate is unavailable.

## Verification commands and results

Commands executed:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
node --check tests/integration/authentik/run-dual-origin-e2e.mjs
bash -n tests/integration/authentik/run.sh
docker compose --profile authentik-e2e config --quiet
tests/integration/authentik/run.sh dual-origin
```

Static checks passed. The disposable stack built and reached the browser
container; Authentik provisioning, writer initialization, API edge proxy, and
Next startup all completed. The browser run did not pass because the first
exact-origin navigation failed with:

```text
page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://store.prg32.dream.test/login
```

The browser-container SNI diagnostic established the cause:

```text
Subject: CN = TRAEFIK DEFAULT CERT
Issuer: CN = TRAEFIK DEFAULT CERT
```

The existing Dream Traefik container mounts
`/Users/ivan/dream-platform/services/traefik/dynamic/00-tls.yml`, whose
contents still contain the unrendered `{{ ... }}` certificate template. Its
configured certificate directory does contain `dream.test.pem`, and that
certificate verifies against the local mkcert root CA and contains
`DNS:*.dream.test`; it was not selected by Traefik during this run.

Therefore no OIDC, SAML, local logout, cookie, or admin UI result is claimed
as passed. The browser correctly stopped before an insecure or hostname-invalid
session could be created.

## Acceptance status

| Criterion | Result |
| --- | --- |
| Exact store/API URLs used | PASS — fixture configuration and browser target |
| Containerized Node 24 Playwright runtime | PASS |
| No global TLS bypass / no host trust mutation | PASS |
| Disposable databases, accounts, providers, and secrets | PASS — stack teardown removes volumes |
| Next.js dual-origin startup | PASS — `/login` returned HTTP 200 internally |
| Traefik exact-host TLS trust | **BLOCKED** — default Traefik certificate served |
| Local login/logout | NOT EXECUTED after TLS gate |
| OIDC positive/negative browser flows | NOT EXECUTED after TLS gate |
| SAML positive/negative browser flows | NOT EXECUTED after TLS gate |
| Cookie evidence | NOT EXECUTED after TLS gate |
| Federation admin UI smoke | NOT EXECUTED after TLS gate |

Decision: **NO-GO** for M6.3d.2h.11 browser acceptance. This is not an
application authentication failure and is not evidence that OIDC/SAML works or
fails; the required HTTPS edge precondition is unavailable.

## Files created or modified

Created:

- `tests/integration/authentik/run-dual-origin-e2e.mjs`;
- `tests/integration/authentik/writer-edge-proxy.conf`;
- `tests/integration/authentik/empty-ca.pem`;
- this report.

Modified:

- `docker-compose.yml` — opt-in exact-origin disposable services only;
- `frontend/next.config.ts` — expose auth UI in direct dual-origin mode while
  keeping Next auth/federation proxy rewrites disabled;
- `backend/src/authentik-writer-init.ts` — disposable local user/admin hashes
  and configurable callback origin;
- `tests/integration/authentik/provision-authentik.mjs` — exact API-origin
  callback/ACS fixture values;
- `tests/integration/authentik/run.sh` — `dual-origin` mode, Node 24 runtime,
  disposable writer hashes, runtime CA path, and target service selection;
- `tests/integration/authentik/run-dual-origin-e2e.mjs` — verifier-only wait for
  asynchronous provider links before the smoke assertion;
- `docs/modernization/19-revised-migration-roadmap.md`.

No production route, database schema, host trust store, `/etc/hosts`,
`../PRG32`, deployment, credential, or commit/push state was changed.

## Remaining risks and prerequisite

- Dream Traefik TLS rendering and exact nested-host certificate selection are
  now verified; this prerequisite is resolved.
- The provider-discovery/client-hydration issue was isolated to the frontend
  auth feature flag: direct dual-origin mode did not reliably enable the
  client query from the derived `next.config` environment value. The client
  now treats `NEXT_PUBLIC_PRG32_DUAL_ORIGIN_ENABLED=true` as an explicit auth
  enablement signal and Next dev allows the exact store origin for HMR.
- The existing long lifecycle suite remains intentionally separate and was not
  started.

The next action is to diagnose the missing provider-discovery request in the
isolated fixture and rerun this same M6.3d.2h.11 gate. M6.3d.2h.12 must not
start until this report is replaced by a GO result.

## Dream Traefik recovery follow-up — 2026-10-13

The Dream infrastructure repository repaired the TLS source-of-truth with a
deterministic startup renderer and an exact nested-host certificate. Evidence
is recorded in:

`/Users/ivan/dream-platform/docs/services/traefik-tls-recovery-report-2026-10-13.md`

The recovery was independently verified for both exact SNI names:

- `store.prg32.dream.test` served the mkcert certificate with
  `DNS:*.prg32.dream.test` and `ssl_verify=0` using the existing root CA;
- `api.prg32.dream.test` served the same valid certificate and verification
  result;
- neither host served `TRAEFIK DEFAULT CERT`.

The exact browser command was rerun after the recovery. A small verifier-only
timing correction now waits for asynchronous React Query provider discovery
before asserting the OIDC/SAML links. The rerun reached the HTTPS Next.js page,
but still failed the provider-rendering gate after 10 seconds. The API-edge
log showed the CSRF smoke request but no `/api/auth/providers` request. The
frontend fix was then applied and the exact command was attempted twice more;
both disposable runs reached Next startup but Compose reported the Next
container exited with code 0 before the browser dependency could remain
healthy. Those runs are inconclusive, not passes. The ordinary dev stack was
then restarted and verified independently: `/auth/csrf`, `/api/auth/providers`
(empty provider list in the ordinary no-Authentik dev environment), and
`/api/games` all returned HTTP 200 after warm-up.

Therefore Dream TLS recovery is **PASS**, ordinary development integration is
**PASS**, but the M6.3d.2h.11 full browser acceptance remains **NO-GO** until
the disposable Next/Playwright lifecycle is made deterministic. No OIDC,
SAML, logout, cookie, or federation-admin browser result is claimed as
passed. The lifecycle suite remains skipped as requested.

## Development integration recovery — 2026-10-13

The canonical local command is now exactly:

```bash
docker compose --profile dev up -d --build
```

It starts the five expected dev services: `auth-writer-init`, `auth-writer`,
`auth-writer-edge-proxy`, `flask`, and `next`. The `authentik-e2e` profile is
not selected. A stale upstream-IP failure after container recreation was
fixed by enabling Docker DNS resolution in the Nginx bridge with a short
validity window.

Evidence:

- `docker compose --profile dev config --quiet`: PASS;
- dev service healthchecks: PASS for Fastify writer, edge proxy, Flask, and
  the Next startup path;
- DNS for both exact hosts resolves to `127.0.0.1` through the existing Dream
  setup;
- existing mkcert root verifies the Dream Traefik certificate for both hosts;
- `GET https://api.prg32.dream.test/auth/csrf`: HTTP 200;
- `GET https://api.prg32.dream.test/api/auth/providers`: HTTP 200;
- `GET https://api.prg32.dream.test/api/games`: HTTP 200;
- frontend `/`, `/login`, `/account`, and `/admin/federation` returned HTTP
  200 through the exact store origin.

The first startup also exposed the missing Flask local secret fallback; the
dev Compose service now provides a local-only default while production still
requires an explicit secret. No production environment or routing was
changed.

## Final lifecycle recovery and acceptance run — 2026-10-13

Docker event evidence identified the disposable lifecycle failure: the
`authentik-e2e-next` service had a 512 MiB limit, and Next.js/Turbopack plus
the Node healthcheck caused an OOM event. Docker then exposed the misleading
`Exited (0)` state after the healthcheck process was killed with exit 137.

The disposable fixture now uses dedicated frontend volumes, starts one-shot
setup independently from the long-running Next service, polls Next readiness
before launching Playwright, and gives only the disposable Next service a 1 GiB
limit. The browser test also waits for provider discovery/React hydration and
accepts the documented logout `reason=required` return path.

Exact command executed:

```bash
tests/integration/authentik/run.sh dual-origin
```

The run reached real Chromium through the exact HTTPS store/API origins. Smoke,
provider discovery, local login/session, and local logout passed. The run then
reached `https://authentik.test:8443`, but Authentik's
`ak-flow-executor` remained in `loading` state with its spinner and exposed no
credential input. OIDC/SAML positive and negative flows, cookie assertions,
callbacks, and federation-admin UI therefore remain **NOT VERIFIED**. M6.3d.2h.11
federation browser acceptance remains **NO-GO**.

The dev environment was restored with:

```bash
docker compose --profile dev up -d --build
```

The dev services were healthy and exact-origin HTTP checks returned 200 for
store `/`, store `/login`, API `/auth/csrf`, API `/api/auth/providers`, and API
`/api/games`. M6.3d.2h.12 remains prohibited.

## Authentik Flow Executor recovery and final browser acceptance — 2026-10-13

The disposable fixture was rerun with the exact command after the previous
spinner diagnosis:

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 24
tests/integration/authentik/run.sh dual-origin
```

The diagnosis corrected the earlier interpretation. Authentik returned HTTP
200 for `/api/v3/flows/executor/default-authentication-flow/`, with component
`ak-stage-identification` and two user fields. The identification chunk and
fonts returned HTTP 200, with no failed requests or page errors. The captured
screen showed the credential form. The `ak-flow-executor[loading]` attribute is
therefore not evidence of a backend flow or asset failure in this pinned
disposable Authentik image; it is a UI-component rendering detail.

The browser runner was updated with diagnostics and compatibility fallbacks for
the custom-element boundary. The run no longer fails on a missing credential
field, but it still receives no OIDC callback and times out before the linked
user reaches `/account`. Consequently the exact OIDC and SAML positive/negative
flows, callback URLs, cookies, logout, and federation-admin browser assertions
remain **NOT VERIFIED**. The browser acceptance remains **NO-GO**.

The failure is isolated to the disposable browser interaction/callback path;
it is not evidence of a failure in the persistent generic provider at
`https://sso.dream.test`, which was not contacted. The disposable identity
provider remains intentionally isolated at `https://authentik.test:8443`.

The dev profile was restored and verified after cleanup. `docker compose
--profile dev ps` showed Flask, Next.js, the Fastify writer, and the API edge
proxy running; exact-origin store `/`, store `/login`, and API `/auth/csrf`
returned HTTP 200. No production routing, schema, credentials, sibling
repository, commit, or push was changed.

Next action: isolate the missing disposable Authentik callback with one
focused browser trace or a supported Authentik flow-interaction method, then
rerun this same gate. Do not start M6.3d.2h.12.

## Scope decision — browser E2E removed

The disposable Playwright/Authentik browser integration is now explicitly
de-scoped. The user-authorized implementation boundary is backend/API
verification only; browser acceptance is not part of the active test or Docker
workflow. The disposable `authentik-e2e` Compose services, Playwright runner,
generated reports/certificates, and Playwright frontend dependency were
removed. The historical failures above remain preserved as audit history and
must not be read as successful browser acceptance.

The active compatibility evidence is the Fastify TypeScript contract,
authentication, OIDC, SAML, federation lifecycle, authorization, and
dual-origin backend test suites. The persistent generic provider at
`https://sso.dream.test` was not contacted or changed.
