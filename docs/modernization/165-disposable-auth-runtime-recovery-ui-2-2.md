# PRG32 Cartridge Store — Disposable Auth Runtime Recovery (UI.2.2)

## 1. Executive summary

The disposable Fastify authentication runtime was recovered without changing
backend source, package manifests, lockfiles, Compose configuration, public
routing, Flask, Authentik, Traefik, or persistent operational data.

The failure was exactly the UI.2.1 diagnosis: the disposable `auth-writer`
could not import `@simplewebauthn/server` because its isolated dependency
mount did not contain the package. The tracked frozen lockfile was respected;
the dependency was restored at version `14.0.3`. The writer is healthy, the
direct edge proxy is healthy, Fastify-owned authentication routes are publicly
reachable on `api.prg32.dream.test`, and CORS is correct for
`store.prg32.dream.test`.

The disposable runtime recovery gate is GO. Real local login remains blocked:
the available local credential attempt returned `401`, so no session lifecycle
or authenticated workflow is claimed. OIDC, SAML, passkey ceremony, creator
workflow, and review workflow acceptance therefore remain blocked at the real
integration level.

**Final marker: `UI22_RUNTIME_RECOVERED_REAL_AUTH_BLOCKED`**

Preserved status markers:

- `M555_BACKEND_FREEZE_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Scope and authorization

This execution was limited to UI.2.2. The only state-changing actions were:

1. Installing dependencies from the existing `backend/pnpm-lock.yaml` into the
   isolated disposable dependency mount.
2. Restarting the disposable `auth-writer` container.

The directly dependent `auth-writer-edge-proxy` was not recreated or restarted;
it recovered automatically when its upstream became healthy. No shared Dream
service was changed. No operational database, canonical data root, Compose
file, authentication provider, frontend source, backend source, manifest, or
lockfile was changed.

## 3. Starting UI.2.1 state

Before mutation, the original failure was still reproducible:

- Compose project: `prg32-cartridge-store`.
- `auth-writer`: running, unhealthy.
- `auth-writer-edge-proxy`: running, unhealthy.
- `flask`: running, healthy.
- `next`: running.
- Writer logs repeatedly reported `ERR_MODULE_NOT_FOUND` for
  `@simplewebauthn/server` imported by `src/auth/webauthn.ts`.
- Edge logs reported connection refused to `auth-writer:5090`.
- The public auth paths previously fell through to Flask and returned the
  wrong owner/response behavior.

The inspected dependency declaration remained
`@simplewebauthn/server: 14.0.3` in both `backend/package.json` and the tracked
lockfile.

## 4. Pre-mutation environment audit

The effective configuration was inspected with:

```text
docker compose --profile dev config --format json
docker compose --profile dev ps -a
docker inspect prg32-cartridge-store-auth-writer-1
docker inspect prg32-cartridge-store-auth-writer-edge-proxy-1
docker compose ls
```

The exact Compose project was `prg32-cartridge-store`. A separate
`prg32-local-operational` project was visible but was not touched.

The writer service uses the existing disposable development profile and the
existing local bind roots. It does not use the operational Compose service or
the Flask `/data` mount.

## 5. Dependency mount ownership

The exact dependency mount is:

```text
Host: /Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/.local/backend/node_modules
Container: /app/node_modules
Type: bind
Read/write: yes
```

The host mount was consumed by only one running container:

```text
/prg32-cartridge-store-auth-writer-1 -> /app/node_modules
```

It was not a named Docker volume and it was not shared with Flask, Next.js,
the edge proxy, Authentik, Traefik, or the separate operational project.

The writer's other mounts were the disposable roots:

```text
.local/writer/auth-data -> /writer-data
.local/writer/shadow    -> /writer-shadow (read-only in auth-writer)
.local/writer/store     -> /writer-store
```

The writer runtime configuration resolves its database and store to those
paths (`/writer-data/auth.sqlite`, `/writer-shadow/shadow.sqlite`, and
`/writer-store`). This ownership and path separation satisfied the mutation
safety gate.

## 6. Original runtime failure

The startup exception was:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@simplewebauthn/server'
imported from /app/src/auth/webauthn.ts
```

The package declaration and lockfile entry were already present. The mounted
`/app/node_modules` did not contain the package or its root link.

## 7. Repair strategy and justification

The chosen strategy was the smallest safe repair: reinstall the existing
frozen dependency graph in the already verified disposable bind mount, then
restart only `auth-writer`.

No package version was changed, no lockfile was regenerated, no source import
was patched, and no dependency was removed.

The first in-container attempt failed to fetch public registry tarballs because
the inherited `NODE_EXTRA_CA_CERTS=/run/prg32-m52g24/rootCA.pem` caused Node's
registry TLS validation to report `UnknownIssuer`. It was stopped before any
service restart or configuration change. No insecure TLS setting was persisted.

The successful retry changed only the environment of that one install process:

```text
docker exec -e NODE_EXTRA_CA_CERTS= \
  prg32-cartridge-store-auth-writer-1 \
  sh -lc 'pnpm install --frozen-lockfile'
```

The same tracked lockfile was used. The install reported
`@simplewebauthn/server 14.0.3` and completed successfully.

## 8. Exact authorized mutations

The effective mutation sequence was:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm --dir backend install --frozen-lockfile \
  --config.modules-dir=/Users/ivan/Desktop/Workspace/UniParthenope/Montella/CartridgeStore/.local/backend/node_modules
docker exec -e NODE_EXTRA_CA_CERTS= \
  prg32-cartridge-store-auth-writer-1 \
  sh -lc 'pnpm install --frozen-lockfile'
docker restart prg32-cartridge-store-auth-writer-1
```

The host install populated the isolated package store but did not by itself
make the root link visible through the separate `/app/node_modules` mount. The
successful in-container frozen install completed the correct link layout.

No `docker compose down`, `down -v`, volume removal, image removal, prune,
recreate of unrelated services, or global cleanup was performed.

## 9. Dependency restoration result

Verified in the container:

```text
node -e "import('@simplewebauthn/server').then(() => console.log('simplewebauthn=resolved'))"
simplewebauthn=resolved
```

The successful frozen install used Node `v24.21.0` in the container and pnpm
`12.5.1`. The local host checks used `nvm use 24`, Node `v24.20.0`, and pnpm
`12.5.1`.

Marker: **`UI22_DEPENDENCY_REPAIR_GO`**

## 10. auth-writer health

After the targeted restart:

```text
auth-writer              running healthy  127.0.0.1:5091->5090/tcp
auth-writer-edge-proxy   running healthy
flask                    running healthy
next                     running
```

The writer logged listeners on its expected internal addresses and no new
module-load exception. Its direct health response was:

```text
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
{"ok":true,"service":"prg32-cartridge-store-backend","status":"healthy"}
```

No unexpected migration or storage initialization was observed in the post-
repair logs.

Marker: **`UI22_AUTH_WRITER_HEALTH_GO`**

## 11. Edge-proxy health

The existing `auth-writer-edge-proxy` became healthy after the upstream writer
recovered. Its configuration mount, networks, labels, published ports, and
route rules were not changed. The previous upstream connection-refused errors
stopped.

No edge-proxy restart was necessary.

Marker: **`UI22_EDGE_PROXY_HEALTH_GO`**

## 12. API routing ownership

Low-volume requests were sent to the existing origins:

- Store: `https://store.prg32.dream.test`
- API: `https://api.prg32.dream.test`

Observed API-origin results:

| Request | Status | Content type | Interpretation |
| --- | ---: | --- | --- |
| `GET /api/auth/me` | 401 | JSON | Fastify auth route, anonymous response |
| `GET /api/auth/providers` | 200 | JSON | Fastify provider route |
| `GET /auth/csrf` | 200 | JSON | Fastify CSRF route |
| `OPTIONS /api/auth/me` | 204 | empty/CORS | Fastify edge CORS preflight |
| `GET /health` | 404 | HTML | Not exposed by the auth-only public edge route |

The response shapes had the expected key sets:

- `/api/auth/me`: `ok`, `error`, `user`.
- `/api/auth/providers`: `ok`, `providers`.
- `/auth/csrf`: `ok`, `csrf_token`.

The writer logs recorded the public `/api/auth/*` and `/auth/csrf` requests,
confirming that these paths reached Fastify rather than Flask. The public
`/health` 404 is a pre-existing edge exposure boundary; direct writer health
and container health both passed. It is not claimed as a public Fastify health
acceptance.

Marker: **`UI22_AUTH_ROUTE_OWNERSHIP_GO`**

## 13. CORS and session behavior

Requests sent with `Origin: https://store.prg32.dream.test` returned:

```text
access-control-allow-origin: https://store.prg32.dream.test
access-control-allow-credentials: true
access-control-allow-methods: GET,POST,PATCH,PUT,DELETE,OPTIONS
access-control-allow-headers: Accept,Content-Type,X-CSRFToken,X-CSRF-Token
```

The preflight returned HTTP 204. No cookies, CSRF values, bearer tokens, or
authorization headers were included in this report.

Marker: **`UI22_CORS_VERIFICATION_GO`**

## 14. Local login verification

The safe disposable login attempt exercised the real API origin and the real
CSRF/session sequence without creating or changing an account:

| Step | Status | Result |
| --- | ---: | --- |
| CSRF acquisition | 200 | token issued to disposable anonymous session |
| Password login | 401 | supplied local credential was not accepted |
| `/api/auth/me` after login | 401 | no authenticated session created |
| CSRF reacquisition | 200 | anonymous session endpoint remained healthy |
| Logout | 401 | correct because no authenticated session existed |
| `/api/auth/me` after logout | 401 | anonymous state preserved |

No retry, brute force, password reset, account creation, or Authentik mutation
was attempted. Because a valid disposable identity/session was not established,
real login, logout invalidation, and protected-route acceptance are not claimed.

Marker: **`UI22_REAL_LOCAL_AUTH_BLOCKED`**

## 15. OIDC/SAML verification

Provider discovery was reachable through Fastify (`GET /api/auth/providers`
returned JSON 200). No real OIDC or SAML login was initiated. No provider,
callback URL, identity mapping, certificate, secret, or Authentik configuration
was changed.

Discovery alone is insufficient for federation acceptance.

Marker: **`UI22_FEDERATION_VERIFICATION_BLOCKED`**

## 16. Passkey verification

The server package now resolves at the expected locked version and the focused
WebAuthn backend tests pass. No passkey feature flag was enabled and no
credential was enrolled or revoked. A real browser WebAuthn ceremony was not
attempted because there was no established disposable authenticated session and
no authorized ceremony harness.

Marker: **`UI22_PASSKEY_VERIFICATION_BLOCKED`**

## 17. Creator/review integration status

No real authenticated Creator Studio or review session was established. The
`PRG32_WORKFLOW_FASTIFY_TARGET` value remains empty as previously diagnosed;
it was not silently populated and no deployment configuration was changed.

Marker: **`UI22_CREATOR_REVIEW_INTEGRATION_BLOCKED`**

## 18. Browser acceptance

A one-off Playwright smoke check used Node 24 and the existing frontend runtime
without adding an E2E file or persistent test artifact. It navigated the
anonymous browser to:

```text
/login
/account
/workspace
/publish
/review
```

All five responses were HTTP 200, each page reached its requested final path,
and there were zero browser page errors. This is anonymous Level B synthetic /
runtime smoke evidence, not Level C authenticated acceptance.

## 19. Responsive/theme smoke checks

No frontend source changed in UI.2.2. The UI.2.1 evidence remains the latest
full responsive matrix: 5 widths × 5 routes × 2 themes = 50 synthetic checks,
with no overflow failures. The focused UI.2.2 browser smoke did not repeat that
matrix because this milestone changed only a disposable backend dependency
mount and restarted the auth writer.

## 20. Security and data-integrity checks

- No password, token, cookie, CSRF value, OAuth secret, SAML secret, key, or
  private environment value was written to this report.
- The runtime process used the existing CA environment only as a one-command
  install override; TLS verification was not disabled globally or persisted.
- No database schema or operational database was changed.
- No Flask, Next.js, Authentik, Traefik, Mailpit, backup scheduler, or separate
  operational container was restarted.
- No Compose labels, networks, ports, mounts, or environment configuration was
  changed.
- The disposable writer remains isolated from the Flask `/data` root and from
  the separate operational Compose project.
- The only observed authentication write side effect was the disposable
  anonymous/session test state; no account mutation or provider mutation was
  performed.

## 21. Validation commands and results

All commands below were actually executed.

| Command/check | Result |
| --- | --- |
| `nvm use 24` | PASS; host Node 24.20.0 |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS; 31 files, 78 tests |
| `pnpm --dir frontend run build` | PASS; Next 16.4.0, 39 routes |
| `pnpm --dir backend run typecheck` | PASS |
| Container auth/WebAuthn focused Vitest run | PASS; 3 files, 19 tests |
| Host auth/WebAuthn focused Vitest run | FAIL before tests; missing optional `@rollup/rollup-darwin-arm64` |
| Frozen container dependency install | PASS after process-local CA override |
| `@simplewebauthn/server` runtime import | PASS |
| `auth-writer` health | PASS |
| `auth-writer-edge-proxy` health | PASS |
| API auth route ownership | PASS |
| API CORS/preflight | PASS |
| Real local login | BLOCKED; 401 for supplied local credential |
| Anonymous Playwright browser smoke | PASS; 5 routes, 0 page errors |
| `git diff --check` | PASS |

The host Vitest failure is platform-specific dependency materialization in the
shared macOS development mount. The Linux container test runner passed using the
same frozen lockfile and is the relevant runtime-platform verification.

## 22. Remaining blockers

1. A valid, explicitly authorized disposable local identity/password pair must
   be supplied or provisioned through the already-approved disposable setup
   flow before Level C login acceptance can pass.
2. Real protected-route Creator Studio and review acceptance depends on that
   authenticated session and remains unverified.
3. OIDC/SAML acceptance still requires an already-configured disposable
   provider identity; discovery is not login acceptance.
4. A real WebAuthn ceremony requires an authorized disposable identity and a
   supported browser authenticator.
5. The host macOS backend test command needs platform-correct optional Rollup
   package materialization if host-side backend tests are required; this is not
   needed by the recovered Linux container runtime.
6. Public `/health` is not exposed through the current auth-only API edge route;
   direct Fastify health is healthy, but public health ownership needs a future
   separately authorized routing decision.

## 23. Files changed

The only tracked file created by UI.2.2 is:

- `docs/modernization/165-disposable-auth-runtime-recovery-ui-2-2.md`

No backend/frontend source, `package.json`, `pnpm-lock.yaml`, Compose file,
Traefik configuration, Authentik configuration, or deployment file was changed
by this milestone. The disposable `.local/backend/node_modules` bind mount was
updated as explicitly authorized; it is runtime state and is not a tracked
source change.

The worktree already contained unrelated changes and prior milestone artifacts;
they were preserved and not reset or cleaned.

## 24. Rollback considerations

The repair is additive and confined to the disposable dependency mount. The
safe rollback boundary is to stop using the disposable writer and restore its
previous disposable runtime only through the existing Compose lifecycle if a
future operator explicitly requires that state. Recreating a broken dependency
state was intentionally not performed after recovery.

No rollback of operational data, routing, authentication providers, or Flask is
required because none was changed.

## 25. Next milestone readiness

UI.2.2 runtime recovery is ready to hand off to a narrowly scoped credential
closure/integration acceptance milestone, not to operational cutover. The next
milestone should first establish an explicitly documented disposable test
identity without touching shared Authentik, then repeat real login/logout,
protected navigation, and safe Creator Studio/review read/write acceptance.

Do not treat the healthy writer or anonymous browser smoke as authorization for
cutover, Flask retirement, or public ownership changes.

## 26. Final decision

| Gate | Decision marker | Result |
| --- | --- | --- |
| Dependency repair | `UI22_DEPENDENCY_REPAIR_GO` | GO |
| Auth writer health | `UI22_AUTH_WRITER_HEALTH_GO` | GO |
| Edge proxy health | `UI22_EDGE_PROXY_HEALTH_GO` | GO |
| Auth route ownership | `UI22_AUTH_ROUTE_OWNERSHIP_GO` | GO |
| CORS verification | `UI22_CORS_VERIFICATION_GO` | GO |
| Real local auth | `UI22_REAL_LOCAL_AUTH_BLOCKED` | BLOCKED |
| Federation verification | `UI22_FEDERATION_VERIFICATION_BLOCKED` | BLOCKED |
| Passkey verification | `UI22_PASSKEY_VERIFICATION_BLOCKED` | BLOCKED |
| Creator/review integration | `UI22_CREATOR_REVIEW_INTEGRATION_BLOCKED` | BLOCKED |
| Frontend regression | `UI22_FRONTEND_REGRESSION_GO` | GO |

Final result: **`UI22_RUNTIME_RECOVERED_REAL_AUTH_BLOCKED`**.

This does not authorize M5.4 cutover, Flask retirement, provider changes,
Compose changes, deployment, commit, or push.
