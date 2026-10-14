# PRG32 Cartridge Store — M5.2g.19 Transitional Auth Health & Routing Diagnostics

Date: 2026-10-14  
Milestone: M5.2g.19  
Execution mode: controlled read-only diagnostics and disposable regression verification

## 1. Executive result

Decision: **TRANSITIONAL_AUTH_DIAGNOSTICS_GO**.

The diagnostic scope is complete. Both unhealthy authentication-related
containers were investigated without entering or modifying them, the Fastify
route registry was compared with the public behavior, the Nginx bridge and
Traefik labels were mapped, the `/api/auth/providers` 404 was attributed to
the legacy Flask owner, and the candidate impact is explicit.

The confirmed primary failure is a runtime dependency mismatch in the
auth-writer development container. The running `tsx` process repeatedly fails
to resolve `multicast-dns` from `/app/src/discovery/transport.ts`. The package
is present in the tracked backend manifest and lockfile, but is unavailable to
the mounted runtime dependency tree. Consequently, the writer never listens
on port 5090. The edge proxy then returns 502 for its upstream health check.

These diagnostics do not make the candidate operationally ready:

- **OPERATIONAL_CUTOVER_NO_GO**
- **FLASK_RETIREMENT_NO_GO**

No application source, Compose file, Docker network, volume, Traefik
configuration, Authentik configuration, DNS record, TLS asset, database, or
operational container was modified.

## 2. Scope and safety

The following actions were performed:

- Read tracked backend, Nginx, and Compose source.
- Read selected non-secret Docker metadata for the already-running
  `auth-writer` and `auth-writer-edge-proxy` containers.
- Read bounded, sanitized recent container logs.
- Read the public response headers for the non-authenticated
  `GET /api/auth/providers` observation.
- Inspected the Fastify route registration and startup code.
- Ran local type, lint, build, unit, Python, Compose-configuration, and diff
  checks.

The following were not performed:

- No `docker exec` or other command inside an operational container.
- No restart, stop, recreate, rebuild, or removal of an operational service.
- No environment-value, secret, credential, cookie, token, database, object,
  backup, user, or identity inspection.
- No authenticated request, form submission, OIDC login, SAML login, or
  provider administration request.
- No modification to Traefik, Authentik, DNS, TLS, Compose, or public routing.

## 3. Evidence classification

Evidence is classified as follows:

- **Confirmed:** directly observed in source, Docker metadata, bounded logs, or
  a bounded public response.
- **Probable:** strongly supported by the confirmed evidence but dependent on
  a runtime component that could not be inspected under the safety boundary.
- **Not verified:** requires Traefik computed configuration, provider access,
  or operational access that was intentionally not used.

No secrets or private identity data are included in this report.

## 4. Current Docker health state

Selected metadata from the running local development topology:

| Component | State | Health evidence | Relevant ports/networks |
|---|---|---|---|
| `auth-writer` | Running, restart count 0 | Unhealthy; failing streak 1805 | Internal `5090/tcp`, host loopback `5091`; app and default networks |
| `auth-writer-edge-proxy` | Running, restart count 0 | Unhealthy; failing streak 3619 | Internal `80/tcp`; `dream_edge` and app networks |
| Flask | Running and healthy | Existing legacy API remains responsive | Internal `5080`; `dream_edge` |
| Next.js | Running | No Docker healthcheck configured | Internal `3000`; `dream_edge` |
| Traefik | Running and healthy | Existing edge process healthy | Host loopback `80/443`; `dream_edge` |
| Authentik server/worker | Running and healthy | Existing infrastructure health only | External infrastructure to this application |

The writer healthcheck is:

```text
node -e fetch('http://127.0.0.1:5090/health').then(response => {
  if (!response.ok) process.exit(1);
})
```

Its last observed failures were `exit=1`, `TypeError: fetch failed`, with
`ECONNREFUSED 127.0.0.1:5090`. This proves that no listener was available on
the expected local port inside the writer container.

The writer process metadata showed the expected development process tree
(`pnpm dev`, `tsx watch src/server.ts`, and the Node tsx process), but process
presence is not service readiness. The bounded writer logs show repeated
startup/watch failures rather than a successful Fastify listen.

## 5. Auth-writer healthcheck and confirmed startup failure

The bounded writer log contains repeated failures of this form:

```text
Error: Cannot find module 'multicast-dns'
Require stack: /app/src/discovery/transport.ts
code: MODULE_NOT_FOUND
```

The source dependency audit confirms:

- `backend/package.json` declares `multicast-dns` version `7.2.5` under
  runtime dependencies.
- `backend/pnpm-lock.yaml` records the same importer and package resolution.
- `backend/src/discovery/transport.ts` imports and uses the module.
- The running development service bind-mounts `/app/node_modules` from the
  local dependency directory and runs `pnpm install --frozen-lockfile` before
  `pnpm dev` according to the tracked Compose definition.

Therefore the confirmed failure is not an absent declaration in the
repository. It is a runtime module-resolution failure in the dependency tree
used by the running container. The exact reason that the mounted runtime tree
does not expose the declared package is **not verified** without inspecting or
recreating that dependency mount. Plausible causes include stale or
incomplete bind-mounted dependencies, an installation that did not populate
the mounted tree, or a mismatch between the running image/mount lifecycle and
the current source.

The healthcheck itself is appropriate for the intended service contract: it
probes the Fastify `/health` listener. Changing it to hide the failed listener
would weaken readiness evidence and was intentionally not done.

## 6. Fastify route registry

The current source registry was inspected directly.

`backend/src/app.ts` always registers the local authentication routes:

- `GET /auth/csrf`
- `GET/POST /auth/login`
- `GET/POST /auth/register`
- `GET/POST /auth/register/complete`
- `POST /auth/bootstrap`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /api/me`
- token management routes under `/auth/tokens`

The federation runtime is created only when the authentication write service
is enabled and an authentication session secret is configured. When that
composition gate is satisfied, the application registers:

- `GET /api/auth/providers`
- `GET /api/auth/oidc/:providerId/login`
- `GET /api/auth/oidc/:providerId/callback`
- `GET /api/auth/saml/:providerId/login`
- `POST /api/auth/saml/:providerId/acs`
- `GET /api/auth/saml/:providerId/metadata`
- administration routes under `/api/admin/federation/...`

The Fastify source therefore contains the expected `/api/auth/providers`
route. Its absence from the public response is a routing/availability issue,
not evidence that the route was omitted from the candidate source.

The Fastify health endpoints are also explicit:

- `GET /health` reports process-level health.
- `GET /ready` checks database/storage readiness and, in candidate mode, the
  canonical writer state.

No public request was sent to a private or authenticated route. No provider
configuration or identity records were inspected.

## 7. Auth-writer runtime diagnostics

The auth-writer container has the intended port configuration (`0.0.0.0:5090`)
and its host-only publication is `127.0.0.1:5091 -> 5090`. The internal Nginx
bridge correctly targets the service DNS name `auth-writer:5090`; it does not
incorrectly use the host publication port.

The startup failure occurs before Fastify can bind port 5090. The process tree
remaining alive is explained by the development `tsx watch` supervisor, which
can remain present while the application child repeatedly fails to load.

No source fix was justified in this milestone because the repository
declaration and lockfile are already correct. The required correction is to
repair the disposable runtime dependency population and then verify the
listener, without weakening the healthcheck.

## 8. Nginx configuration

The tracked file `docker/auth-writer-edge-proxy.conf` contains one server:

- Listens on port 5090 inside the proxy container.
- Resolves `auth-writer` through Docker DNS.
- Proxies to `http://auth-writer:5090` without path rewriting.
- Forwards `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and
  `X-Forwarded-For`.
- Preserves WebSocket upgrade headers.

The configuration is internally consistent with the intended two-service
candidate topology. It is not the source of the observed upstream refusal.

## 9. Nginx healthcheck

The proxy healthcheck is:

```text
wget -q -O /dev/null http://127.0.0.1:5090/health || exit 1
```

This is an upstream-readiness check through Nginx, rather than a pure Nginx
process liveness check. The proxy process itself is running, but the check
returns `HTTP/1.1 502 Bad Gateway`.

Bounded proxy logs repeatedly report:

```text
connect() failed (111: Connection refused) while connecting to upstream
request: "GET /health HTTP/1.1"
upstream: "http://172.28.0.3:5090/health"
```

This confirms that Docker DNS resolution reaches the writer container address
and that the writer's port rejects the connection. The edge-proxy unhealthy
state is therefore a confirmed consequence of the writer failure.

## 10. Traefik routing analysis

The tracked/live label intent is:

- Host: `api.prg32.dream.test`.
- Path prefixes: `/auth`, `/api/auth`, and `/api/admin/federation`.
- Candidate edge-proxy priority: `100`.
- Entry point: `websecure` with TLS.
- Candidate service port: `5090`.
- Docker network: `dream_edge`.

The Flask router remains a broad `Host(api.prg32.dream.test)` route to port
5080. The labels therefore describe the intended split: authentication paths
to the edge bridge and the rest of the API to Flask.

The computed Traefik router/service state was not inspected because no
dashboard or administration access was authorized. In particular, this
report does not claim whether Traefik currently retained, suppressed, or
degraded the unhealthy candidate service in its computed configuration.

The public result is nevertheless conclusive about the response owner:

```text
HEAD https://api.prg32.dream.test/api/auth/providers
HTTP/2 404
content-type: text/html; charset=utf-8
server: Werkzeug/3.1.9 Python/3.13.16
```

This is a Flask/Werkzeug 404, not the JSON response implemented by the
Fastify OIDC route. The exact Traefik selection mechanism that led to the
legacy owner is **probable but not directly verified**; the unhealthy
candidate service and the confirmed Flask response are not.

## 11. `/api/auth/providers` 404 analysis

The response is explained by the combined evidence:

1. Fastify source defines `/api/auth/providers` when the federation runtime is
   composed.
2. The candidate writer cannot complete module loading because
   `multicast-dns` cannot be resolved.
3. No listener is available on writer port 5090.
4. The Nginx bridge returns 502 for its own upstream health probe.
5. The public request returns Flask/Werkzeug HTML 404.

The most likely operational path is that the candidate auth router has no
usable healthy backend and the broad Flask API route remains the effective
owner. That final Traefik behavior remains classified as probable because
computed Traefik state was not accessed. There is no evidence that the
Flask application should implement the Fastify route; adding a compatibility
route to Flask would mask the candidate runtime failure and was not done.

## 12. Final candidate impact analysis

| Surface | Current observed owner/state | Candidate impact |
|---|---|---|
| Public catalog/API | Flask, responsive | No cutover evidence; candidate cannot assume API ownership |
| `/api/auth/providers` | Flask/Werkzeug 404 | Generic provider discovery unavailable publicly |
| OIDC login/callback | Candidate source only; writer unavailable | Not publicly verifiable |
| SAML login/ACS/metadata | Candidate source only; writer unavailable | Not publicly verifiable |
| Federation administration | Candidate source only; auth required | Not publicly verifiable and not attempted |
| Auth-writer health | Unhealthy | P0 candidate blocker |
| Auth edge proxy health | Unhealthy due to upstream refusal | P0 candidate blocker |
| Next.js storefront | Running | Does not compensate for unavailable candidate auth API |
| Authentik | External server/worker healthy | Provider itself was not accessed or changed |

No dual-writer condition was created. Flask remains the observed public API
owner.

## 13. Diagnostic matrix

| Component | Observed failure | Root cause | Confidence | Final-candidate impact | Required action |
|---|---|---|---|---|---|
| `auth-writer` | Healthcheck connection refused on `127.0.0.1:5090` | Runtime cannot resolve `multicast-dns` during startup | Confirmed | Candidate Fastify process never becomes available | Repair disposable dependency mount/install, then reverify `/health` |
| Writer dependency tree | `MODULE_NOT_FOUND` despite manifest/lock entry | Runtime tree does not expose tracked dependency; exact mount cause not inspected | Confirmed mismatch; underlying mount cause probable | Any route served by writer is unavailable | Reconcile image, bind mount, lockfile install, and Node 24 runtime under operator control |
| Nginx edge proxy | Healthcheck returns 502 | Upstream `auth-writer:5090` refuses connection | Confirmed | Auth edge route cannot forward requests | Recheck after writer recovery; retain upstream check |
| Traefik candidate route | Public candidate route not observed | Computed unhealthy-service behavior not directly inspected | Probable | Candidate path falls through or is unavailable | Operator-level computed-router verification after health recovery |
| `/api/auth/providers` | Public HTML 404 | Response is served by Flask/Werkzeug, which does not expose the Fastify route | Response owner confirmed; routing mechanism probable | Generic provider discovery fails | Do not patch Flask; restore candidate writer and validate route ownership |
| Authentik federation | No provider/login verification | Explicitly out of scope and unauthenticated access was not authorized | Not verified | Federation readiness remains unproven | Verify later with controlled non-production browser acceptance |

## 14. Proposed corrections

No corrections were applied in M5.2g.19.

The next operator-authorized remediation should be narrowly scoped:

1. Ensure the disposable dependency directory mounted at `/app/node_modules`
   is populated from the current backend lockfile and is compatible with Node
   24.
2. Verify that `multicast-dns` resolves in the same runtime used by the
   auth-writer process. Do not remove the dependency merely to make startup
   pass; it is used by the discovery implementation.
3. Start or recreate only the disposable candidate writer through the normal
   approved development lifecycle, then confirm the writer healthcheck and
   the direct Fastify `/health` response.
4. Confirm that the edge proxy changes from 502/unhealthy only after the
   writer is actually listening.
5. Inspect computed Traefik route ownership through an authorized
   read-only mechanism, then perform the bounded public GET checks again.
6. Only after the above succeeds, prepare the dual-origin browser acceptance
   required by the next milestone.

The Nginx healthcheck should remain upstream-aware. A separate liveness check
could improve observability in a future change, but changing health semantics
in this diagnostic milestone would risk hiding the exact failure.

## 15. Source changes

Only this report was added:

```text
docs/modernization/105-transitional-auth-diagnostics-m5-2g-19.md
```

No application code, tests, Compose files, Dockerfiles, environment files, or
operational configuration were modified for M5.2g.19. The pre-existing dirty
worktree was preserved.

## 16. Regression tests and verification

Node.js 24 was selected with `nvm use 24` for the Node checks.

| Command/check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 49 test files, 242 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 test files, 65 tests |
| Frontend Playwright E2E suite | PASS — 5/5; no live authentication flow was added or attempted |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 passed in 9.04s |
| `docker compose --profile dev config --quiet` | PASS |
| Candidate Compose configuration validation | PASS |
| `git diff --check` | PASS |

An initial parallel verification attempt experienced one backend storage test
timeout and an incomplete Python result due to concurrent resource
contention. The backend and Python suites were then rerun separately, as
shown above, and passed. The parallel timeout is retained here for audit
accuracy; it is not treated as a product failure after the isolated rerun.

The live diagnostic observations were read-only and used low-volume HEAD/GET
requests only. No authenticated or mutating request was executed.

## 17. Remaining P0/P1/P2 blockers

### P0

- The auth-writer does not listen on port 5090 because runtime dependency
  resolution fails.
- The auth edge proxy is unhealthy and returns 502 to its upstream.
- Candidate authentication and federation routes are not publicly available.
- Operational cutover and Flask retirement remain prohibited by evidence.

### P1

- The exact state of Traefik's computed candidate router/service after the
  unhealthy backend was not verified.
- The dependency mount/image lifecycle that produced the missing runtime
  module was not inspected or repaired.
- Dual-origin browser acceptance cannot be meaningful until the candidate
  writer and edge proxy are healthy.
- Authentication session continuity and provider behavior remain unverified.

### P2

- The proxy healthcheck conflates Nginx process liveness with upstream
  readiness; this is useful for routing safety but could be complemented by a
  separate diagnostic signal later.
- The current development topology still contains Flask, Next.js, auth-writer,
  and auth-writer edge responsibilities; simplification remains future work.

## 18. Required operator actions

No operator action was executed by this milestone. Before any cutover work,
the operator must:

- repair the disposable auth-writer dependency tree without changing
  production or external infrastructure;
- verify `auth-writer` health and the Fastify `/health` listener;
- verify the Nginx edge health after upstream recovery;
- verify computed Traefik route ownership using authorized infrastructure
  access;
- repeat the bounded public GET for `/api/auth/providers` and require the
  Fastify JSON contract rather than Flask HTML;
- complete a controlled, non-production dual-origin authentication acceptance
  before considering any handover.

No Authentik credentials, provider IDs, or real user identity data are needed
for the dependency and routing correction itself.

## 19. Recommended next milestone

The next milestone should be the already-planned M5.2g.20 only after the
runtime dependency mismatch is corrected and the candidate health gates pass.
It should begin with a fresh read-only preflight and a narrowly bounded
browser acceptance plan. It must not assume that a healthy Docker process is
equivalent to a verified public route; both service health and response-owner
evidence are required.

M5.2g.19 does not authorize M5.2g.20 execution automatically.

## 20. GO/NO-GO decisions

| Decision | Result | Reason |
|---|---|---|
| Transitional auth diagnostics | **TRANSITIONAL_AUTH_DIAGNOSTICS_GO** | Both unhealthy states investigated; route registry, Nginx, public 404 owner, candidate impact, confirmed/probable causes, and corrections documented without operational changes |
| Operational cutover | **OPERATIONAL_CUTOVER_NO_GO** | Candidate writer and edge proxy remain unhealthy; public auth ownership is not verified |
| Flask retirement | **FLASK_RETIREMENT_NO_GO** | Public API response is still Flask/Werkzeug and candidate auth is unavailable |
| Authentik migration/change | **NO-GO / NOT AUTHORIZED** | No provider or identity modification was in scope |

The diagnostic milestone is complete, but the runtime remains intentionally
transitional and not ready for ownership handover.
