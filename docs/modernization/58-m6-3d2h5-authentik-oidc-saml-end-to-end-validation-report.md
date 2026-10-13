# M6.3d.2h.5 — Authentik OIDC/SAML End-to-End Validation

Status: **INCOMPLETE / NO-GO**. The disposable Authentik platform and the
Fastify federation writer bootstrap successfully, but the required browser
authentication gate did not complete. No production Authentik, deployment,
Flask cutover, frontend login UI, database migration, commit, or push was
performed.

## Scope and implementation

The isolated Compose profile is `authentik-e2e` in the existing root
`docker-compose.yml`. It uses a separate Compose project, network, volumes,
and generated credentials. It has no Traefik labels, edge network, host
ports, production volumes, or production data access.

The disposable topology contains:

- Authentik `2026.8.3`, pinned by image digest, with PostgreSQL 16 and the
  official server/worker pair;
- an internal Nginx TLS proxy for `authentik.test:8443` and
  `writer.test:8443`;
- a short-lived local CA and RSA certificates generated per run;
- a Node 24 Fastify writer initialized with a separate SQLite auth database,
  shadow database, store directory, and encrypted key registry;
- a Playwright browser container using the official browser image and the
  frontend lockfile's pinned `@playwright/test` 1.56.1 package. The final
  runner is built from the official Playwright image but replaces its Node
  binary with pinned Node 24 LTS; the build was verified with `node --version`
  returning `v24.21.0`.

The provisioning path uses Authentik's supported API with the bootstrap token.
It waits for managed flows, property mappings, and the self-signed certificate,
then creates the disposable user, confidential OIDC provider/application, SAML
provider/application, strict redirect/ACS URLs, persistent NameID policy, and
RSA-SHA256 signing settings. It does not write Authentik's database directly.

All public origins include the internal TLS port consistently:

- Authentik: `https://authentik.test:8443`;
- writer: `https://writer.test:8443`;
- OIDC redirect: `/api/auth/oidc/authentik-oidc/callback`;
- SAML ACS: `/api/auth/saml/authentik-saml/acs`.

## Evidence obtained

The following stages completed in the real disposable Compose run:

1. PostgreSQL health check passed.
2. Authentik server and worker started.
3. Bootstrap API token authenticated successfully.
4. Authentik managed flows, mappings, and certificate became available.
5. API provisioning created the disposable user and both providers/applications.
6. Fastify writer initialization completed.
7. Provider secrets were encrypted through the existing key registry service.
8. Fastify writer became healthy behind the internal TLS proxy.
9. The Playwright container launched Chromium, Firefox, and WebKit processes.

The browser gate did not produce a valid OIDC or SAML login result. The final
Node 24 runner launched the browser container but remained in navigation
timeouts while trying to reach the Compose services and was stopped after the
bounded diagnostic run. Therefore no engine/protocol combination is marked
passed, and no claim is made about the browser correlation-cookie assertions
from this run.

Earlier failures were corrected during implementation and are retained as
diagnostic history: missing Authentik worker dependency, readiness race,
disposable-volume ownership, strict key-registry permissions, the Fastify
`warn` log-level spelling, and the absent Playwright npm package. The final
remaining blocker is browser-to-service connectivity/response inside the
official Playwright container, not an accepted authentication result.

## Security and compatibility decisions

- OIDC remains confidential Authorization Code + PKCE with strict issuer,
  audience, nonce, JWKS, and RS256 validation in the TypeScript backend.
- SAML remains SP-initiated Redirect with POST ACS, persistent NameID, signed
  response and assertion requirements, exact issuer/audience/destination/
  recipient checks, and replay protection.
- Both protocols use the same pre-linked local user subject. No email-based
  linking or automatic account creation is introduced.
- Local Fastify RBAC remains authoritative.
- The SAML correlation cookie remains `Secure`, `HttpOnly`, and
  `SameSite=None`; browser verification is still pending because the E2E did
  not complete.
- Secrets are generated at runtime, kept out of committed files and logs, and
  the OIDC client secret is stored through the encrypted provider-secret
  lifecycle. Disposable volumes are removed by `run.sh`.
- The profile is deliberately not connected to the existing Traefik
  infrastructure or to `store.prg32.dream.test` / `api.prg32.dream.test`.
- Certificate rotation, trust-store replacement, and rollover/revocation
  behavior were not accepted as complete in this milestone; they require a
  separate executable test after the browser path is unblocked.

## Verification commands

Passed:

- `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm audit --prod` in `backend/` — 23 files, 121 tests passed; production audit clean.
- `source "$HOME/.nvm/nvm.sh" && nvm use 24 && FLASK_PROXY_TARGET=http://backend:5080 pnpm check` in `frontend/` — typecheck, ESLint, 4 test files/10 tests, and Next production build passed.
- `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` — passed.
- `docker compose --profile prod --profile backend --profile writer-init --profile dev --profile authentik-e2e config` — passed.
- `git diff --check` — passed.

Known existing failure:

- `./.venv313/bin/pytest -q` — 63 passed, 1 pre-existing failure in
  `tests/test_services.py::test_mdns_registers_prg32_service`; it constructs
  Flask with `TESTING=False` and no `SECRET_KEY`. Flask was not changed.

Not passed:

- `docker compose --profile authentik-e2e build authentik-e2e-browser` plus
  `docker run --rm riscv-prg32/authentik-e2e-browser:node24 node --version` —
  passed; Node 24.21.0 was used by the final runner.
- `./tests/integration/authentik/run.sh run` — provisioning and writer
  bootstrap passed, but the browser E2E did not complete and was stopped.

## Files added or changed for this milestone

- `docker-compose.yml` — disposable `authentik-e2e` profile only;
- `backend/src/authentik-writer-init.ts` — disposable writer provisioning;
- `frontend/package.json`, `frontend/pnpm-lock.yaml` — pinned Playwright test
  dependency;
- `tests/integration/authentik/generate-certs.sh`;
- `tests/integration/authentik/auth-proxy.conf`;
- `tests/integration/authentik/writer-proxy.conf`;
- `tests/integration/authentik/provision-authentik.mjs`;
- `tests/integration/authentik/run-e2e.mjs`;
- `tests/integration/authentik/playwright-node24.Dockerfile`;
- `tests/integration/authentik/run.sh`;
- `tests/integration/authentik/authentik-blueprint.yaml` — retained as a
  reviewed reference, not mounted by the final API-provisioned run.

## Remaining risks and next step

M6.3d.2h.5 is not complete. The immediate next action is to isolate and fix
the browser-container network/response problem, then rerun the full Chromium,
Firefox, and WebKit OIDC/SAML matrix and explicitly record cookie, linked-user,
disabled-user, unknown-identity, provider-disabled, issuer-mismatch,
certificate, and replay outcomes. Only after that evidence exists should
certificate rollover testing and the next milestone be considered.

No automatic transition to M6.3d.2h.6 was made.
