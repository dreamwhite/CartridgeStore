# PRG32 Cartridge Store — M5.2g.21 Optional mDNS Discovery & Startup Isolation

## 1. Executive result

The optional mDNS implementation is isolated from the normal Fastify startup
path. With `PRG32_BACKEND_MDNS_ENABLED=false` (the default), the backend does
not dynamically load `multicast-dns`, does not enumerate a local network
interface, and does not create an advertiser. With mDNS explicitly enabled,
startup now fails closed if the dependency or selected interface is unusable;
the process cannot report readiness while the requested advertiser is broken.

Decision: `OPTIONAL_MDNS_IMPLEMENTATION_GO` for disposable/candidate use.

The operational decisions remain:

- `OPERATIONAL_CUTOVER_NO_GO`: this milestone did not deploy or change the
  Dream runtime.
- `FLASK_RETIREMENT_NO_GO`: Flask remains in place and no ownership handover
  was performed.

Evidence labels used below:

- `SOURCE_VERIFIED`: established from repository source or configuration.
- `DISPOSABLE_VERIFIED`: exercised against synthetic data or disposable
  containers.
- `LIVE_BEHAVIOR_OBSERVED`: observed against a live service without mutation.
- `NOT_VERIFIED`: intentionally not tested or unavailable under the safety
  boundary.

## 2. Architectural decision

The mDNS advertiser remains a single Fastify-process capability, but its
runtime dependency is optional. `multicast-dns@7.2.5` is declared under
`optionalDependencies`, while the transport module is loaded only from the
explicitly enabled startup hook.

The normal path is therefore:

```text
server.ts -> app.ts -> discovery/service.ts
                         |
                         +-- disabled: return without transport import
                         +-- enabled: dynamic import transport.ts
                                             |
                                             +-- require multicast-dns
```

This keeps the default backend independent of the LAN advertiser and avoids
making a UDP discovery library a mandatory runtime prerequisite for HTTP,
WebSocket, authentication, or canonical storage operation.

## 3. Safety boundary

Only source, tests, candidate Docker assets, and disposable containers were
changed or exercised for this milestone. No operational Compose service,
container, network, volume, database, object store, Traefik configuration,
Authentik configuration, DNS record, TLS certificate, Flask process, or
Next.js operational process was modified or restarted.

The worktree was already substantially dirty from earlier milestones. Those
changes were preserved. No reset, broad cleanup, commit, push, deployment, or
operational cutover was performed.

## 4. Source import graph

`app.ts` still imports the discovery service module, but that module imports
only the `DiscoveryTransport` type from `transport.ts`. The runtime transport
module is reached through `loadMdnsTransport()` and a dynamic `import()` only
after the `onReady` hook observes `mdnsEnabled=true`.

Consequences:

- The disabled path does not execute the top-level `createRequire()` call in
  `transport.ts`.
- The disabled path does not invoke `localAddress()` and therefore does not
  enumerate network interfaces.
- The `multicast-dns` module is resolved only when mDNS has been explicitly
  enabled and startup has reached the advertiser phase.
- Other backend routes and readiness checks are not coupled to optional mDNS
  when it is disabled.

Evidence: `SOURCE_VERIFIED`; disabled import behavior and enabled failure
behavior are also `DISPOSABLE_VERIFIED` through the discovery tests and
candidate image checks.

## 5. Firmware discovery contract

The companion `../PRG32` repository was inspected read-only. The implementation
preserves the firmware-visible contract:

- Service type: `_prg32store._tcp.local.`
- Discovery ABI: `prg32-store-discovery-1.0`
- TXT record: `abi=prg32-store-discovery-1.0`
- Default service port: `5080`
- Firmware architectures: `esp32c6` and `qemu`

The firmware discovery order retains configured/NVS or compile-time store URL
support before mDNS fallback. `CONFIG_PRG32_STORE_URL` and manual URL
configuration remain available. QEMU does not depend on mDNS and can use its
configured URL. No change was made to `../PRG32`.

Evidence: `SOURCE_VERIFIED`. Public firmware discovery behavior was not
retested against hardware in this milestone: `NOT_VERIFIED`.

## 6. Default configuration

`PRG32_BACKEND_MDNS_ENABLED` remains strict boolean configuration and defaults
to `false`. Enabling mDNS requires `PRG32_BACKEND_MDNS_INTERFACE`. Production
configuration rejects explicit mDNS enablement until the advertised endpoint
has received a deployment-specific review. The two-service candidate also
rejects mDNS enablement.

The candidate Compose configuration explicitly sets:

```text
PRG32_BACKEND_MDNS_ENABLED=false
```

The default behavior is therefore HTTP/API/WebSocket operation without a LAN
advertiser.

Evidence: `SOURCE_VERIFIED`; configuration and candidate startup are
`DISPOSABLE_VERIFIED`.

## 7. Startup isolation implementation

`DiscoveryService` now accepts a synchronous or asynchronous transport factory.
The real factory dynamically loads `transport.ts`. Startup state is retained
as `idle`, `starting`, `announced`, `degraded`, `stopped`, or `disabled`.

When mDNS is explicitly enabled, the Fastify `onReady` hook awaits discovery
startup. Any failure is logged with a stable code and rethrown. This makes the
failure visible as a process startup failure rather than allowing a misleading
HTTP-ready server with a requested but non-functional advertiser.

The existing lifecycle protections remain in force:

- one active advertiser per service instance;
- duplicate active advertisers are rejected;
- partial startup removes the active-instance reservation;
- partially created transports are stopped on failure;
- normal shutdown stops the transport and removes its reservation.

Evidence: `SOURCE_VERIFIED` and `DISPOSABLE_VERIFIED`.

## 8. Missing-dependency behavior

If the optional package is absent while mDNS is explicitly enabled, the
startup error is normalized to `DiscoveryDependencyError` with code
`mdns_dependency_unavailable`. The public log contains only the stable code
and generic startup message; it does not expose a module path, stack, secret,
or host-specific filesystem detail.

The disposable candidate image was built with optional dependencies disabled.
`require.resolve("multicast-dns")` failed with `MODULE_NOT_FOUND`, as intended.
Starting that image with mDNS enabled exited with status `1` and emitted the
controlled dependency error. It did not report a ready server.

Evidence: `DISPOSABLE_VERIFIED`.

## 9. Package management decision

`backend/package.json` now declares `multicast-dns` as an optional dependency,
and the lockfile records the exact locked version and optional transitive
packages. Normal local development installs the optional package by default,
so an explicitly enabled local advertiser remains usable.

The candidate Dockerfile deliberately runs:

```text
pnpm install --frozen-lockfile --no-optional
pnpm prune --prod --no-optional
```

This produces a slim public candidate without the advertiser. The generic
self-hosted backend Dockerfile was not changed in this milestone; a future
self-hosted mDNS-enabled image may therefore include the optional package
when installed normally. This is intentional and must be resolved by an
explicit deployment profile decision before operational enablement.

Evidence: `SOURCE_VERIFIED` and `DISPOSABLE_VERIFIED`.

## 10. Discovery lifecycle

The service contract continues to build the source-compatible PTR, SRV, TXT,
and A records. The advertiser uses the existing `multicast-dns` transport and
responds only to relevant service, instance, or host questions. It sends a
goodbye record on stop.

The disabled service starts and stops as a no-op with state `disabled`. It
does not construct a transport. An enabled service that cannot resolve a
non-loopback IPv4 address fails before advertising. An explicit invalid
interface therefore produces a controlled startup rejection.

Evidence: `SOURCE_VERIFIED` and `DISPOSABLE_VERIFIED`.

## 11. Public deployment policy

The candidate runtime remains a two-service topology: one Fastify backend and
one Next.js frontend. The candidate backend uses Node.js 24, canonical SQLite
storage, a single writer lease, and mDNS disabled. Its disposable health and
readiness endpoints returned HTTP `200`.

The candidate was not attached to `dream_edge`, did not use host networking,
and did not bind UDP multicast on the operational network. Existing public
origins remain documented as `store.prg32.dream.test` and
`api.prg32.dream.test`; no routing was changed.

Live Dream mDNS behavior, live public HTTP behavior, live TLS behavior, and
live federation behavior were not changed or newly exercised by this
milestone: `NOT_VERIFIED`.

## 12. Candidate Docker compatibility

The disposable candidate backend image was built from
`backend/Dockerfile.candidate` using Node `24-bookworm-slim`. The final image
did not contain `multicast-dns`, while the server remained able to start with
mDNS disabled.

The candidate Compose file was validated and both candidate images were built:

- `prg32-cartridge-store-fastify:candidate`
- `prg32-cartridge-store-next:candidate`

The candidate configuration check passed. A disposable candidate container
reported HTTP `200` for both health and readiness. Temporary candidate data
and containers were removed by exact target paths only; no operational Docker
resource was touched.

Evidence: `DISPOSABLE_VERIFIED`.

## 13. Regression test matrix

The discovery test file now covers:

- exact discovery contract records;
- disabled service never constructing a transport;
- real disabled configuration not loading the optional transport;
- duplicate advertiser rejection and cleanup;
- transport startup failure cleanup;
- missing optional dependency normalization;
- contract validation;
- strict configuration and production guards;
- startup failure on an invalid explicitly selected interface.

The new and existing tests use fake transports or disposable configuration;
they do not require a live LAN or real authentication provider.

## 14. Security and failure semantics

The change is fail-closed for explicit mDNS enablement. A missing package,
invalid interface, transport startup error, or duplicate advertiser does not
silently degrade into a server that claims the requested discovery capability.

The disabled path has no multicast socket, no discovery dependency load, and
no interface discovery. The candidate production-like image has no optional
advertiser package at all. Stable error codes are logged while raw exception
strings remain out of the controlled application log message.

This protects availability and diagnostics boundaries; it does not provide
cryptographic authentication for mDNS, which remains an unauthenticated LAN
discovery mechanism. mDNS answers must never be treated as an authentication
or authorization signal.

## 15. Files changed

The M5.2g.21 delta is limited to:

- `backend/src/discovery/service.ts`: dynamic transport loading, dependency
  error normalization, and failure cleanup.
- `backend/src/app.ts`: explicit enabled-startup hook and fail-closed startup.
- `backend/package.json`: move `multicast-dns` to optional dependencies.
- `backend/pnpm-lock.yaml`: lockfile update for the optional dependency.
- `backend/tests/discovery.test.ts`: startup-isolation and failure tests.
- `backend/Dockerfile.candidate`: omit optional dependencies from the
  candidate image.
- `docs/modernization/107-optional-mdns-m5-2g-21.md`: this report.

The surrounding worktree contains earlier milestone changes and untracked
artifacts. They were not reset, reformatted, or folded into this report.

No roadmap update was made because the milestone brief required exactly one
new Markdown report and prohibited unrelated documentation changes.

## 16. Verification results

All commands below were executed with Node.js `v24.20.0` and pnpm `12.5.1`
where applicable:

| Check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 49 files, 244 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `pnpm --dir frontend run test:e2e` | PASS — 5 tests |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `git diff --check` | PASS |

The frontend test suite emitted an existing Vite configuration warning about
future `configLoader: native` behavior; it did not fail the tests. The
frontend production build completed successfully.

Additional disposable verification passed:

- candidate Docker build with optional dependencies omitted;
- dependency absence probe returning `MODULE_NOT_FOUND`;
- candidate Fastify health/readiness returning HTTP `200`;
- explicit mDNS enablement in the dependency-free candidate exiting with
  status `1` and stable `mdns_dependency_unavailable` diagnostics;
- focused discovery suite: 9 tests passed.

No `LIVE_BEHAVIOR_OBSERVED` evidence is claimed for the new implementation.

## 17. Remaining limitations

1. mDNS is not publicly or operationally verified because the new code was
   not deployed, as required by the milestone safety boundary.
2. The generic backend Dockerfile still permits optional dependencies when
   installed normally; the deployment profile must decide whether any
   operational image may advertise mDNS.
3. mDNS itself is not an authenticated discovery channel and remains subject
   to local-network spoofing or denial of service.
4. Multicast availability depends on container networking and host/network
   policy. Candidate validation intentionally avoids proving operational
   multicast reachability.
5. Hardware and QEMU firmware discovery were source-checked but not exercised
   against a device in this milestone.
6. This change does not solve the separate operational edge, federation,
   cutover, backup, or Flask-retirement blockers.

## 18. P0/P1/P2 blockers

### P0

- No new P0 blocker was introduced by optional startup isolation.
- Operational cutover remains blocked by the prior pre-cutover gates and is
  explicitly out of scope.

### P1

- Decide and document the production mDNS policy before enabling it in any
  operational Fastify deployment.
- Validate the chosen container network can provide the intended multicast
  behavior, or keep mDNS disabled and require configured store URLs.
- Complete the independent operational edge/federation and ownership gates
  before any Flask retirement decision.

### P2

- Add a deployment-specific smoke test only after an authorized disposable
  network profile exists; do not use the operational network as a test target.
- Revisit whether the generic Dockerfile should gain a separately named
  mDNS-enabled build profile after the cutover architecture is approved.

## 19. Recommended next milestone

The next milestone should be a deployment-profile decision and disposable
network acceptance gate for discovery, not an operational enablement. It should
define whether mDNS is disabled everywhere in the two-service deployment or
enabled only in a separately reviewed LAN profile, then verify multicast
behavior in an isolated network without changing Dream infrastructure.

The next milestone must preserve configured URL discovery for firmware and
must not make mDNS a prerequisite for API, WebSocket, authentication, or
canonical storage readiness.

## 20. GO/NO-GO decisions

| Decision | Result | Basis |
|---|---|---|
| Optional mDNS implementation | **GO** | Contract preserved, default disabled, dynamic dependency isolation, fail-closed explicit enablement, tests/builds/candidate checks pass. |
| Candidate two-service runtime | **GO for disposable validation** | Fastify and Next.js candidate images/configuration validated; health/readiness passed with mDNS disabled. |
| Operational mDNS enablement | **NO-GO** | Live network behavior and deployment-specific multicast policy are not verified. |
| Operational cutover | **NO-GO** | This milestone made no cutover decision or operational change. |
| Flask retirement | **NO-GO** | Flask remains transitional and prior ownership, routing, data, and rollback gates remain open. |

