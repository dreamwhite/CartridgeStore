# PRG32 Cartridge Store — M5.2g.4 Fastify networking parity

Date: 2026-10-14  
Status: **GO for isolated disposable/loopback verification; NO-GO for public networking and operational cutover**

## 1. Executive result

M5.2g.4 verifies and completes the Fastify networking boundary for the
existing multiplayer relay and adds a provider-neutral mDNS discovery service.
The WebSocket route is exercised over real loopback TCP connections and
differentially compared with Flask. mDNS has a deterministic contract builder,
an injectable transport, and an actual Node transport using `multicast-dns`.

mDNS is disabled by default, requires explicit non-production activation and a
selected network interface, and was never announced on the real LAN during
tests. Fastify remains disposable/loopback-only; Flask remains the public
operational owner.

## 2. Source-backed inventory

| Capability | Flask | Fastify | M5.2g.4 status |
| --- | --- | --- | --- |
| `GET /api/multiplayer` | protocol information | protocol information | MATCH/TESTED |
| `GET /api/multiplayer/status` | room status | room status | MATCH/TESTED |
| `WS /api/multiplayer` | Flask-Sock relay | `@fastify/websocket` relay | MATCH/TESTED |
| Join/state/leave | JSON messages | JSON messages | MATCH/TESTED |
| Authentication | Bearer, `X-PRG32-Token`, query token, configured/API users | same after header fix | MATCH/TESTED |
| mDNS advertiser | `zeroconf`, best-effort startup/shutdown | explicit Fastify lifecycle service | IMPLEMENTED/LOOPBACK-TESTED |
| Physical LAN discovery | real deployment behavior | not executed by authorization | NOT_VERIFIED |

Both runtimes preserve the route path, `PRG32 multiplayer relay` service
label, `auth_enabled` status field, protocol examples, room signature ABI,
eight-peer default and single-process in-memory state.

## 3. Multiplayer protocol compatibility

The Flask implementation and PRG32 firmware use:

- `join`: `type`, `signature`, optional `flags`, optional `player_id`;
- `state`: `type`, `player_id`, `x`, `y`, `sprite`, `flags`, `input`, `frame`;
- server `welcome`: `type`, `player_id`;
- server `peer`: bounded numeric state fields;
- server `leave`: `type`, `player_id`;
- server `error`: stable human-readable `error` values.

Fastify does not add firmware-visible fields. It retains signature validation,
player-ID collision avoidance, room capacity, state clamping, join-first
errors, malformed JSON errors, unknown-message errors, leave cleanup and
single-process room ownership. The default maximum remains eight peers.

Repeated join leaves the existing room membership before attempting the new
membership, matching the Flask hub. A duplicate requested player ID receives a
new safe ID. A peer cannot publish state until it has joined, and broadcasts
are scoped to the peer’s room.

## 4. Authentication behavior

The WebSocket upgrade is intentionally accepted before the join message, as in
Flask. Authorization is enforced at `join`, so an anonymous or invalid client
receives the existing `player role required` error and cannot enter a room.

Fastify now accepts all source-backed token locations:

- `Authorization: Bearer <token>`;
- `X-PRG32-Token: <token>`;
- `?token=<token>`;
- join-message `token` or `auth_token` where the existing contract permits it.

Canonical/API-token authentication continues through `AuthService`, including
disabled-account and revoked-token rejection. Legacy configured users retain
the existing `name:role:token` compatibility path. Anonymous firmware remains
supported when authentication is not configured; no authentication weakening
was introduced for the tests.

OIDC, SAML, local sessions, CSRF and RBAC remain mandatory final Fastify
features and were not changed by this milestone. The external provider remains
generic and external; no Authentik state or credentials were touched.

## 5. Real TCP WebSocket verification

`backend/tests/multiplayer.test.ts` uses an actual Fastify TCP listener and
the `ws` client. It verifies upgrade, Bearer/query authentication, anonymous
and invalid-token rejection, join, state relay, malformed JSON, unsupported
message type, leave cleanup, status, room isolation, configured capacity and
shutdown cleanup.

The server binds only to `127.0.0.1` and ephemeral ports. `fastify.inject()`
is not used as a substitute for the upgrade test.

## 6. Flask differential verification

`backend/tests/multiplayer-differential.test.ts` starts Flask and Fastify on
separate ephemeral loopback ports with synthetic temporary data. The same
anonymous client scenario is run against both implementations:

1. two clients upgrade;
2. both join the same room with requested IDs;
3. the first sends state and the second receives a peer snapshot;
4. malformed JSON receives the stable error;
5. the second leaves and the first receives the leave event.

The normalized five-event sequences matched exactly. Result: **MATCH** for
the executed anonymous protocol scenario. Authenticated API-token and
physical-firmware scenarios are covered by source inspection and Fastify
tests, but physical hardware execution is **NOT_VERIFIED**.

## 7. Discovery contract

The source-backed mDNS contract is:

| Field | Value/selection |
| --- | --- |
| Service type | `_prg32store._tcp.local.` |
| ABI TXT value | `abi=prg32-store-discovery-1.0` |
| Instance name | configured store name, default `PRG32 Cartridge Store` |
| Host | validated `<hostname>.local.` or explicit safe host |
| Address | selected non-loopback IPv4 interface |
| Port | `PRG32_BACKEND_MDNS_PORT`, then `PRG32_STORE_PORT`, then Fastify listen port |
| QEMU | no mDNS assumption; configured URL remains required |

The transport emits PTR, SRV, TXT and A records and responds to relevant PTR,
SRV or host queries. Goodbye records with TTL zero are sent during shutdown.
Only the ABI TXT record is emitted; no credentials, internal paths, tokens or
database details are advertised.

The historical firmware contract advertises port 5080. The final Fastify
deployment must set its actual listen/advertised endpoint accordingly (the
repository’s container contract remains port 5080). A local disposable
Fastify process may use another explicit port; it must not advertise 5080
unless that is the reachable endpoint. This distinction is an operational
gate, not an automatic routing change.

## 8. Discovery implementation and lifecycle

The implementation is split into:

- `discovery/contract.ts` — deterministic validation and contract building;
- `discovery/transport.ts` — injectable transport plus actual
  `multicast-dns@7.2.5` PTR/SRV/TXT/A announcement transport;
- `discovery/service.ts` — startup, duplicate-instance protection, cleanup and
  degraded state;
- `app.ts` — start after Fastify readiness and stop before runtime resources
  close.

Activation requires:

- `PRG32_BACKEND_MDNS_ENABLED=true`;
- non-production `NODE_ENV`;
- explicit `PRG32_BACKEND_MDNS_INTERFACE`;
- validated name, host, address and port.

Default behavior is disabled. A startup/transport failure is logged through
Fastify and leaves HTTP healthy, matching Flask’s best-effort discovery
behavior; the discovery service enters `degraded` state and does not fall
back to Flask or start another process. Duplicate active instance names are
rejected. Partial startup is stopped and its reservation is released.

## 9. Discovery security and tests

The contract rejects unsafe service names, control characters, dotted instance
names, malformed host labels, invalid IPv4 addresses and invalid ports. The
runtime requires an explicit interface and only accepts a non-loopback IPv4
address from that interface. The test transport never opens a UDP socket.

`backend/tests/discovery.test.ts` verifies:

- exact service type, ABI, instance, host, port and TXT values;
- exact PTR/SRV/TXT/A record construction;
- disabled-by-default behavior;
- explicit activation and production rejection;
- duplicate active advertiser rejection;
- shutdown cleanup and restart after cleanup;
- invalid configuration rejection;
- startup failure cleanup;
- Fastify HTTP health when the explicitly selected interface is unavailable.

No real LAN announcement was performed. No public interface, Docker network,
Traefik route or UDP multicast membership was intentionally opened by tests.

## 10. Canonical runtime integration

Discovery is a lifecycle sidecar inside the Fastify process, not a storage
writer or a second service. It does not open SQLite, acquire a writer lease,
modify canonical objects, or change catalog/telemetry/auth routes. Multiplayer
state remains process memory and does not bypass canonical authentication.

The existing canonical disposable HTTP suites continue to pass for catalog,
publication/review, telemetry, scores, metrics and statistics. Fastify close
stops discovery before closing multiplayer, catalog, authentication and
database resources. A second canonical writer remains rejected by the
existing storage-v2 lease.

## 11. Reverse-proxy readiness

No public proxy was changed or exercised. The future deployment must preserve:

- `https://store.prg32.dream.test` for Next.js;
- `https://api.prg32.dream.test` for Fastify HTTP and WebSocket;
- `https://sso.dream.test` as the external generic OIDC/SAML provider.

Traefik must forward HTTP/1.1 Upgrade and Connection headers, preserve the
`/api/multiplayer` path, terminate WSS consistently with the advertised
origin, and use connection/idle timeouts compatible with long-lived game
sessions. Room state is single-process, so a future multi-replica deployment
requires deliberate sticky routing or a separately authorized distributed
state design; Redis/brokers are not introduced here.

mDNS advertises a direct local HTTP endpoint, not the HTTPS Traefik origin.
That is intentional for current ESP32 discovery behavior and must be resolved
as an operational endpoint decision before cutover.

## 12. Fault-injection results

Verified with synthetic loopback/fake transports:

- malformed WebSocket messages do not mutate room state;
- invalid authentication cannot join a room;
- duplicate IDs do not impersonate an existing peer;
- room capacity is enforced;
- disconnect/leave removes peer state;
- server shutdown closes active WebSockets;
- failed discovery startup cleans the transport and duplicate reservation;
- duplicate discovery startup is refused;
- failed discovery does not make HTTP readiness fail;
- canonical writer/auth/database state is not touched by discovery.

Physical network conflict behavior, multicast delivery across Wi-Fi/VLANs and
hardware firmware reconnection are **NOT_VERIFIED** by this milestone.

## 13. Dependency and file changes

Added the minimal pinned `multicast-dns@7.2.5` dependency and lockfile
entries. It is required because Node 24 has no built-in mDNS service
advertisement API; the transport remains isolated and injectable.

M5.2g.4 files:

- `backend/src/discovery/contract.ts`;
- `backend/src/discovery/service.ts`;
- `backend/src/discovery/transport.ts`;
- `backend/src/config/env.ts` — explicit disabled-by-default mDNS settings;
- `backend/src/app.ts` — ready/close lifecycle integration;
- `backend/src/multiplayer/routes.ts` — `X-PRG32-Token` compatibility;
- `backend/package.json` and `backend/pnpm-lock.yaml`;
- `backend/tests/discovery.test.ts`;
- `backend/tests/multiplayer.test.ts`;
- `backend/tests/multiplayer-differential.test.ts`;
- this report and the roadmap.

Earlier M5.2e–M5.2g.3 worktree changes were preserved and are not
retroactively attributed to this milestone.

## 14. Verification commands and results

Executed with Node 24.20.0 selected through `nvm use 24`:

```text
pnpm --dir backend run typecheck                         PASS
pnpm --dir backend run lint                             PASS
pnpm --dir backend run test                             PASS — 40 files, 201 tests
pnpm --dir backend run build                            PASS
pnpm --dir backend exec vitest run tests/multiplayer.test.ts
                                                         PASS — 2 tests
pnpm --dir backend exec vitest run tests/multiplayer-differential.test.ts
                                                         PASS — 1 test
pnpm --dir backend exec vitest run tests/discovery.test.ts
                                                         PASS — 7 tests
pnpm --dir frontend run typecheck                       PASS
pnpm --dir frontend run lint                            PASS
pnpm --dir frontend run test                            PASS — 20 files, 55 tests
FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build
                                                         PASS
SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q
                                                         PASS — 64 tests
docker compose --profile dev config --quiet              PASS
git diff --check                                         PASS
```

The WebSocket differential test starts Flask and Fastify only on loopback
ephemeral ports with synthetic temporary data. No operational container,
database, volume, public socket, mDNS announcement, provider, Compose file or
`../PRG32` file was modified.

## 15. Known limitations and blockers

- No physical ESP32-C6, Wi-Fi, multicast VLAN or real mDNS browser test was
  authorized; those results remain NOT_VERIFIED.
- No public WSS/Traefik test was authorized.
- Multiplayer state is single-process and non-persistent; multi-instance
  scaling is not supported.
- mDNS uses explicit environment configuration rather than dynamically
  reloading legacy `store_settings`; final deployment must choose and verify
  the advertised instance, interface and reachable port.
- Authentication/session continuity, OIDC/SAML callbacks, operational writer
  ownership, backup retention/authenticity, routing and rollback remain open
  cutover gates.

## 16. GO/NO-GO decisions

**GO:** isolated Fastify WebSocket protocol parity, loopback TCP verification,
Flask differential scenario, and disposable mDNS contract/lifecycle
implementation.

**NO-GO:** real LAN discovery acceptance, public WSS routing, operational
canonical networking, Compose/Traefik changes, deployment, Flask removal,
M5.2g.5 and M6.3d.2h.12.

## 17. Recommended next milestone

The next milestone should close operational endpoint selection and deployment
verification: direct Fastify/Traefik WebSocket routing, mDNS advertised-port
decision, authentication/session continuity, monitoring, single-process
ownership policy and rollback rehearsal under an explicitly authorized
maintenance window. It must not remove Flask or change public routing until
those gates are separately approved.
