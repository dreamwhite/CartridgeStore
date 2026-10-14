# PRG32 Cartridge Store — M5.2g.20 Transitional Auth Runtime Recovery & Routing Acceptance

Date: 2026-10-14  
Milestone: M5.2g.20  
Execution mode: controlled development-runtime remediation and non-destructive routing acceptance

## 1. Executive result

Decision: **TRANSITIONAL_AUTH_RECOVERY_GO**.

The precise runtime failure was confirmed and repaired in the isolated
development dependency mount. The mount contained a pnpm virtual-store
directory but no `multicast-dns` package entry and no root module link. The
tracked manifest and lockfile were correct; the running development container
was therefore using an incomplete dependency tree rather than a missing source
dependency or an incorrect final image.

The existing startup command was re-run by recreating only the transitional
`auth-writer` service. `pnpm install --frozen-lockfile` installed the locked
`multicast-dns@7.2.5` package into the existing project-local dependency
mount. Fastify then started and bound port 5090.

The full acceptance chain now passes:

- Fastify direct `/health`: 200.
- Fastify direct `/ready`: 200.
- Existing Nginx edge proxy: healthy without recreation.
- Public `/api/auth/providers`: Fastify contract through Nginx, 200 JSON.
- Public `/api/games?limit=100`: remains Flask/Werkzeug-owned.
- Public `/health`: remains Flask/Werkzeug-owned.

The recovery is limited to the transitional development runtime. It does not
authorize operational cutover or Flask removal:

- **OPERATIONAL_CUTOVER_NO_GO**
- **FLASK_RETIREMENT_NO_GO**

No Traefik, Authentik, DNS, TLS, operational Compose, operational database,
object store, backup, or unrelated container was modified. No commit, push, or
deployment was performed.

## 2. Authorization and safety boundary

### Phase A — read-only preflight

Before mutation, the following were inspected:

- Running writer and edge-proxy Docker metadata.
- Image identity, creation time, command, working directory, and restart policy.
- Mount type, destination, read/write mode, and source existence without
  exposing source paths in the report.
- Dependency mount ownership, permissions, virtual-store markers, and package
  link presence.
- Other running container mount usage.
- Tracked package manifest, lockfile, Dockerfile, Compose service, Nginx
  configuration, and Fastify startup/routes.
- Bounded sanitized writer and edge logs.
- Bounded unauthenticated public and host-only health observations.

### Phase B — permitted narrow remediation

All Phase B gates were satisfied before mutation:

- The dependency failure was demonstrated by `MODULE_NOT_FOUND` and the
  missing package/link markers in the actual mounted directory.
- The exact effective dependency location was identified as the project-local
  `.local/backend/node_modules` bind mount.
- The location is development-only and separate from writer data, shadow
  database, store objects, and the application source mount.
- No other running container shared that dependency source.
- The writer had no listening Fastify socket, its healthcheck was unhealthy,
  its edge proxy was unhealthy, and public auth discovery was still served by
  Flask/Werkzeug. No candidate user-facing auth operation was active.
- The repair used the existing frozen lockfile, required no dependency
  upgrade, no deletion, no volume removal, no Compose edit, and no secret
  change.
- Only `auth-writer` was recreated. Nginx, Flask, Next.js, Traefik, Authentik,
  networks, and persistent data mounts were preserved.
- The same auth-writer remained the owner of its existing disposable writer
  data; no writer ownership transfer or second writer was created.
- Verification used bounded unauthenticated health and routing requests.

The operator impact and rollback boundary were recorded before the service
recreation: if startup failed, no dependency directory or writer data would be
deleted; the only permitted rollback would be a targeted recreation of the
same service with the preserved Compose configuration and mounts.

## 3. Pre-repair container state

The pre-repair `auth-writer` metadata was:

| Property | Observed value |
|---|---|
| Container state | Running, restart count 0 |
| Image | `riscv-prg32/cartridge-store-backend:dev-hot`; image ID recorded during inspection |
| Container creation | 2026-10-13T22:21:33Z |
| Working directory | `/app` |
| Runtime command | `sh -c "pnpm install --frozen-lockfile && exec pnpm dev"` |
| Dependency mount | Bind mount at `/app/node_modules`, writable |
| Writer data | Separate writable bind mount at `/writer-data` |
| Shadow database | Separate read-only bind mount at `/writer-shadow` |
| Store objects | Separate writable bind mount at `/writer-store` |
| Health | Unhealthy; no listener on port 5090 |

The process supervisor remained present, but the Fastify child repeatedly
failed before binding. The edge proxy was also running but unhealthy because
its upstream connection was refused.

Pre-repair bounded observations were:

- Host publication `127.0.0.1:5091/health`: connection reset/no usable
  Fastify response.
- Public `/api/auth/providers`: HTTP 404, `text/html`,
  `Werkzeug/3.1.9 Python/3.13.16`.
- Public `/health`: HTTP 404, `text/html`, Werkzeug.
- Public `/api/games?limit=100`: HTTP 200 JSON, Werkzeug.

## 4. Dependency mount investigation

The effective dependency location was not a named Docker volume. It was a
writable bind mount sourced from the project-local development dependency
directory and mounted at `/app/node_modules`.

The source directory was present and had normal development-directory
permissions. The source was not shared with any other running container. The
writer data, shadow database, and object-store mounts were distinct sources and
were not part of the dependency repair.

The pre-repair dependency markers were:

- pnpm virtual store: present.
- `multicast-dns@7.2.5` virtual-store entry: absent.
- root `multicast-dns` module link: absent.
- `multicast-dns` Node resolution from the mounted dependency location:
  unavailable before repair.

This explains why the source import failed even though the application
manifest and lockfile declared the package. The bind mount shadowed the
dependencies installed in the image layer, and the mounted tree was
incomplete.

The running container matched the tracked service's relevant runtime contract:
the same working directory, Node development image family, startup command,
port, dependency bind mount, and separate writer-data mounts were present.

## 5. pnpm dependency analysis

The dependency classification before repair was:

| Classification | Result |
|---|---|
| Declared | Yes — `multicast-dns` under backend runtime dependencies |
| Locked | Yes — version `7.2.5` in `backend/pnpm-lock.yaml` |
| Installed in effective mount | No — no package entry or root link before repair |
| Resolvable before repair | No — `MODULE_NOT_FOUND` from `src/discovery/transport.ts` |
| Installed after repair | Yes — pnpm reported `+ multicast-dns 7.2.5` |
| Resolvable after repair | Yes — Node resolved `multicast-dns/index.js` from the mount |
| Runtime verified after repair | Yes — Fastify loaded and listened on port 5090 |

The repair output showed:

```text
Lockfile is up to date, resolution step is skipped
Packages: +4
dependencies:
+ multicast-dns 7.2.5
Done in 6.1s using pnpm v12.5.1
```

No lockfile update or package upgrade occurred. The exact historical reason
the previous startup installation left the bind mount incomplete was not
available from the bounded pre-repair logs. The directly demonstrated failure
mechanism is the stale/incomplete bind-mounted dependency tree.

The final candidate is not affected by this development-only mount: its
Dockerfile builds dependencies into the image and does not use this runtime
bind mount. Candidate Compose configuration also remained valid.

## 6. Root cause and evidence

Root-cause classification: **A/B — stale or incomplete dependency bind mount,
with the historical installation failure mechanism not independently
observable**.

Direct evidence:

1. Writer logs showed `Cannot find module 'multicast-dns'` with a require stack
   rooted at `/app/src/discovery/transport.ts`.
2. `backend/package.json` and `backend/pnpm-lock.yaml` both declared and locked
   `multicast-dns@7.2.5`.
3. The effective `/app/node_modules` bind mount had a virtual-store directory
   but no `multicast-dns` package entry and no root link.
4. The image layer could not be treated as authoritative because the writable
   bind mount shadowed `/app/node_modules`.
5. Re-running the existing frozen-lockfile installation in the same isolated
   mount installed the package without changing source or lockfile.
6. Fastify immediately loaded, bound port 5090, and passed its healthcheck.

The failure was not caused by a missing package declaration, an intentional
missing import fallback, a healthcheck defect, or an mDNS protocol mismatch.
`multicast-dns` was not removed or bypassed.

## 7. Phase B safety-gate matrix

| Gate | Result | Evidence |
|---|---|---|
| 1. Root cause demonstrated | PASS | Module error plus missing package/link in actual mount |
| 2. Dependency location identified | PASS | Project-local bind mount at `/app/node_modules` |
| 3. Development-only | PASS | Auth-writer dev profile and disposable runtime |
| 4. No application data in location | PASS | Writer data, shadow DB, store, and dependency mounts are separate |
| 5. Not shared with unrelated services | PASS | No other running container used the dependency source |
| 6. No other application process using it | PASS | Only auth-writer used the dependency source |
| 7. No delete/recursive cleanup required | PASS | Existing frozen-lockfile install was sufficient |
| 8. Existing lockfile sufficient | PASS | Resolution step skipped; locked package installed |
| 9. No Compose/secrets change | PASS | No tracked operational configuration changed |
| 10. Only auth-writer restart required | PASS | Single-service recreation with `--no-deps` |
| 11. No public routing change | PASS | Traefik and labels unchanged |
| 12. No second writer | PASS | Same writer service and mounts retained |
| 13. No new auth behavior | PASS | Runtime dependency restoration only |
| 14. Bounded verification possible | PASS | Health and public GET checks only |
| 15. Operator impact/rollback documented | PASS | Same-service recreation; no deletion or data rollback |

## 8. Remediation performed or blocked

Remediation was performed after the gates passed:

```text
docker compose --profile dev up -d --no-deps --force-recreate auth-writer
```

This recreated only `prg32-cartridge-store-auth-writer-1`. It did not recreate
the edge proxy or any dependency service. The preserved startup lifecycle then
ran `pnpm install --frozen-lockfile` against the isolated dependency mount.

Modified runtime location:

- Project-local development dependency bind mount corresponding to
  `/app/node_modules`.

Not modified:

- `backend/package.json`.
- `backend/pnpm-lock.yaml`.
- Application source.
- Docker Compose source.
- Dockerfiles.
- Writer data, shadow database, object store, or backups.
- Nginx configuration.
- Traefik or Authentik configuration.

The previous container was not preserved as a running service, but no data
mount was deleted or replaced. The new container used the same image,
configuration, networks, and data mounts.

## 9. Post-repair auth-writer health

After recreation:

- Container state: running.
- Docker health: healthy.
- Restart count: 0.
- Fastify listener: active on `127.0.0.1:5090`, container network addresses,
  and the host-only publication.
- Direct `GET http://127.0.0.1:5091/health`: HTTP 200.
- Direct `GET http://127.0.0.1:5091/ready`: HTTP 200.

The direct response contracts were:

```json
{"ok":true,"service":"prg32-cartridge-store-backend","status":"healthy"}
```

```json
{"ok":true,"status":"ready","resources":{"database":"available"}}
```

The runtime log contains no new module-resolution failure after the repair.

## 10. Post-repair Nginx health

Nginx was not restarted or recreated. Its existing healthcheck recovered
automatically when the upstream writer became available:

- Nginx process: running.
- Docker health: healthy.
- Restart count: 0.
- Latest healthcheck entries: exit code 0.
- Current post-recovery log window: no 502 or connection-refused errors.

The earlier connection-refused entries remain historical evidence from before
writer recovery. The tracked upstream hostname, port, paths, forwarding
headers, and WebSocket header handling were not changed.

## 11. Public routing acceptance

All requests were bounded, unauthenticated, non-mutating HTTPS GET requests
with certificate verification enabled and no authentication redirects followed.

| Request | Result | Effective owner/evidence |
|---|---|---|
| `GET /api/auth/providers` | HTTP 200, `application/json` | Nginx edge proxy forwarding to Fastify; source contract matches `{ok, providers}` |
| `GET /health` | HTTP 404, HTML | Flask/Werkzeug; general transitional root health ownership remains unchanged |
| `GET /api/games?limit=100` | HTTP 200, `application/json` | Flask/Werkzeug; general API ownership remains Flask |

The public authentication response was summarized without retaining provider
payloads:

```json
{"ok":true,"provider_count":0,"keys":["ok","providers"]}
```

The response is consistent with the Fastify route definition
`GET /api/auth/providers`, and the direct writer request returned the same
contract. The public response header identifies Nginx as the edge server; the
source-backed body and direct Fastify comparison establish the upstream route.

No real OIDC or SAML flow was attempted.

## 12. Traefik routing evidence

Tracked labels remain unchanged:

- Host: `api.prg32.dream.test`.
- Candidate auth path prefixes: `/auth`, `/api/auth`,
  `/api/admin/federation`.
- Candidate priority: `100`.
- Entry point: `websecure` with TLS.
- Candidate service port: `5090`.
- Docker network: `dream_edge`.

The public before/after behavior demonstrates the effective result:

- Before repair: `/api/auth/providers` was Flask/Werkzeug HTML 404.
- After writer and edge recovery: `/api/auth/providers` is Nginx-fronted
  Fastify JSON 200.

Computed Traefik router state was not queried because no authorized dashboard
or administration access was enabled. Therefore label intent and public
behavior are verified, while the internal computed-router object remains
classified **NOT_VERIFIED**. No Traefik change is required by the observed
result.

## 13. Authentik verification boundary

The recovery proves only that the generic federation route surface is reachable
through the candidate auth edge. It does not prove provider configuration,
redirect URI alignment, issuer validation, SAML metadata validity, certificate
trust, session continuity, or real identity mapping.

The following remain intentionally unverified:

- `LIVE_OIDC_NOT_VERIFIED`.
- `LIVE_SAML_NOT_VERIFIED`.

No Authentik login, provider inspection, credential use, provider provisioning,
activation, or configuration change occurred.

## 14. Final candidate impact

The development-runtime repair did not alter the intended final candidate:

- Exactly two application services remain the target: Fastify and Next.js.
- Node.js 24 remains the target runtime.
- Canonical SQLite and single-writer rules remain unchanged.
- Candidate Dockerfile and Compose configuration were not modified.
- No candidate service was started on `dream_edge`.
- No candidate service was connected to operational storage or ports.
- No Flask dependency was added to the candidate runtime.
- No Python runtime dependency was added to the candidate runtime.
- No legacy `index.json` ownership or runtime behavior was changed.
- OIDC/SAML source, firmware contracts, WebSocket behavior, mDNS contracts,
  and backup-v4 behavior were not changed.

The transitional Nginx bridge remains a development compatibility component,
not part of the final two-service architecture.

## 15. Rollback and incident handling

### Pre-repair state

The auth-writer was unhealthy and not listening. Its writer-data, shadow, and
store bind mounts were preserved throughout the remediation. No database or
object-store content was intentionally read or changed by the repair.

### Recovery rollback boundary

If the repaired runtime had failed, the safe rollback would have been limited
to a targeted recreation of `auth-writer` using the same tracked service
definition, image, networks, and data mounts. Dependency directories and
volumes would not be deleted, and unrelated services would not be restarted.

Because the repaired process is healthy and the public route acceptance passes,
no rollback was performed.

If an unexpected application write or writer-ownership conflict is observed in
future work, further remediation must stop. No directory deletion, database
restore, data reset, or routing change is an approved rollback for this
milestone.

## 16. Regression verification

Node.js 24 was selected with `nvm use 24`. Resource-heavy suites were run
sequentially.

| Command/check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 49 files, 242 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir frontend run test:e2e` | PASS — 5/5 tests |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 passed in 9.07s |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |

Temporary E2E result directories were removed after verification. No test
result report, JSON evidence file, or raw log archive was added.

## 17. Remaining P0/P1/P2 blockers

### P0

No P0 runtime recovery blocker remains for the isolated transitional auth
writer.

Operational cutover remains P0-prohibited because this milestone did not
authorize ownership transfer, real federation acceptance, or production
deployment.

### P1

- Computed Traefik router state remains not independently inspected.
- Live OIDC and SAML integration remain unverified by design.
- Flask remains the owner of general public APIs.
- The transitional Nginx bridge remains in the development path and is not
  the final architecture.
- No operational writer-ownership handover has occurred.

### P2

- The development dependency mount relies on the startup installation
  lifecycle; future dev documentation should make its isolation and recovery
  behavior explicit.
- The Nginx healthcheck intentionally represents upstream readiness rather
  than pure process liveness; a separate diagnostic liveness signal could be
  considered later without weakening readiness.

## 18. Required operator actions

No immediate dependency repair action remains. Before any cutover milestone,
the operator must still:

- verify the computed Traefik router/service state through authorized
  read-only infrastructure access;
- perform a controlled non-production generic OIDC acceptance;
- perform a controlled non-production generic SAML acceptance;
- decide authentication/session continuity and writer ownership explicitly;
- keep Flask as general API owner until the full cutover gate is separately
  approved;
- preserve the single-writer and rollback policy.

No Authentik credential or provider configuration action is requested by this
milestone.

## 19. Recommended next milestone

Proceed to the already-planned M5.2g.21 only after a fresh preflight confirms
the recovered health state and after the remaining live federation and
computed-routing gates are explicitly scheduled. M5.2g.21 must not infer
production readiness from this development-runtime recovery alone.

M5.2g.21 was not started automatically.

## 20. GO/NO-GO decisions

| Decision | Result | Reason |
|---|---|---|
| Transitional auth runtime recovery | **TRANSITIONAL_AUTH_RECOVERY_GO** | Dependency root cause confirmed, isolated repair completed, Fastify health/readiness passed, Nginx recovered, public auth route reached Fastify, general API remained Flask-owned, and regression checks passed |
| Live OIDC federation | **NO-GO / NOT VERIFIED** | Real Authentik login and provider validation were explicitly out of scope |
| Live SAML federation | **NO-GO / NOT VERIFIED** | Real Authentik login and provider validation were explicitly out of scope |
| Operational cutover | **OPERATIONAL_CUTOVER_NO_GO** | No writer handover, deployment, or operational routing change was authorized |
| Flask retirement | **FLASK_RETIREMENT_NO_GO** | Flask remains the general API owner and retirement was explicitly out of scope |

The narrow transitional runtime recovery is complete. The application remains
in the controlled pre-cutover state.
