# PRG32 Cartridge Store — M5.5.1 WebSocket & HTTP Security Hardening

Date: 2026-10-16  
Scope: targeted Fastify hardening, isolated adversarial validation and
disposable configuration checks  
Operational deployment: **not performed**

## 1. Executive summary

M5.5.1 implemented the targeted remediations identified by M5.5.0:

- bounded WebSocket admission by global process, source, identity and
  never-joined connection counts;
- bounded per-connection, per-source and per-identity message rates;
- bounded join attempts and state-update rates;
- standard WebSocket ping/pong liveness with shared timer cleanup;
- bounded `ws.bufferedAmount` handling and slow-consumer eviction;
- shallow, typed and depth-bounded multiplayer message validation;
- bounded authentication, setup-authorization and federation-reauthentication
  limiter state;
- explicit Fastify request and keep-alive timeouts;
- source-based catalog-listing and download-initiation quotas;
- explicit configurable trusted-proxy hop/CIDR handling;
- isolated real-upgrade adversarial tests and regression coverage.

The PRG32 multiplayer wire format was not changed. Firmware still sends
`join`, `state` and `leave` JSON messages. Heartbeats use standard WebSocket
control frames and do not require firmware changes.

The high-severity resource-control finding is closed at application level by
the tests in this milestone. Production edge isolation, proxy-network
reachability and actual operational traffic remain separate deployment gates.
HTTP hardening is intentionally partial: catalog listing and download
initiation are protected here; existing upload, authentication, setup and
administrative controls remain bounded by their existing route-specific
protections and were not replaced by a speculative global quota.

## 2. M5.5.0 findings addressed

| Finding | Result |
| --- | --- |
| M550-WS-001 — WebSocket resource controls | Addressed in Fastify with bounded admission, rates, lifecycle and backpressure; real tests pass |
| M550-RATE-001 — authentication limiter state | Addressed with `BoundedRateLimiter` and capacity-exhaustion tests |
| M550-PROXY-001 — forwarded-IP attribution | Application policy is explicit: Fastify verified `request.ip` with either trusted CIDRs or a bounded hop policy; forged headers are ignored when trust is disabled |
| M550-HTTP-001 — application quotas/timeouts | Partial: catalog/download quotas and explicit request/keep-alive timeouts implemented; other families retain their existing controls and are not claimed fully hardened |

No Flask source, sibling `../PRG32` source, canonical SQLite schema,
storage-v2, backup-v4, scheduler, Compose service, public route, Dream
infrastructure or operational data was modified.

## 3. Threat model

The implementation addresses the following bounded process-local threats:

- anonymous clients opening many sockets without joining;
- authenticated clients opening excessive sockets for one identity;
- many clients behind one source address;
- repeated join attempts and state/message floods;
- malformed, deeply nested or oversized JSON messages;
- clients that stop responding to transport pings;
- slow WebSocket receivers that accumulate outbound bytes;
- high-cardinality authentication source keys;
- forged forwarded headers when the backend is in direct mode;
- repeated catalog/download initiation from one source.

Shared-NAT clients are not treated as one identity for WebSocket identity
limits. They share only the deliberately generous source admission and source
aggregate message budget. Limits are process-local. No Redis or other shared
coordination service was introduced, so a multi-replica deployment must treat
each replica's limits as independent.

## 4. Existing protocol compatibility

The sibling repository was inspected read-only at
`../PRG32/components/prg32/prg32_multiplayer.c` and its cartridge-store
documentation. The client behavior remains:

1. connect to the configured WebSocket URL;
2. send `{"type":"join","signature":...,"flags":...,"player_id":...}`;
3. periodically send `state` frames, approximately at the existing configured
   multiplayer send period;
4. accept `welcome`, `peer`, `leave` and error messages;
5. send `leave` on disconnect.

The PRG32 source does not define an application heartbeat message. M5.5.1
therefore uses `ws` ping/pong control frames. The state default is 30 messages
per second with a burst of 60, which accommodates the observed firmware
update cadence while bounding sustained abuse.

The following wire behavior remains unchanged for valid clients:

- message types and existing fields;
- room signature syntax;
- room peer cap;
- `welcome`, `peer`, `leave` and compatibility error shapes;
- anonymous connection behavior before a protected join;
- bearer/query/header token locations;
- state numeric clamping in relayed `peer` messages.

Intentional secure changes are limited to connection close/rejection for
exhausted admission/rate/backpressure/liveness limits and stable error codes
for rejected abuse. No firmware update is required.

## 5. WebSocket admission controls

`backend/src/multiplayer/hub.ts` owns process-local admission state. Every
accepted connection reserves a global slot, a source slot and an unjoined slot
before peer/room state is created. Authentication is evaluated after those
cheap admission checks. A valid authenticated principal also reserves an
identity slot.

Defaults:

| Control | Configuration | Default | Enforcement |
| --- | --- | ---: | --- |
| Global connections | `PRG32_BACKEND_MP_MAX_CONNECTIONS` | 256 | Upgrade closes with 1013 and `global_connection_limit` |
| Connections per source | `PRG32_BACKEND_MP_MAX_CONNECTIONS_PER_SOURCE` | 32 | Upgrade closes with 1013 and `source_connection_limit` |
| Connections per identity | `PRG32_BACKEND_MP_MAX_CONNECTIONS_PER_IDENTITY` | 4 | Upgrade closes with 1013 and `identity_connection_limit` |
| Never-joined connections | `PRG32_BACKEND_MP_MAX_UNJOINED_CONNECTIONS` | 64 | Upgrade closes with 1013 and `unjoined_connection_limit` |
| Frame/message bytes | fixed existing `@fastify/websocket` limit | 64 KiB | Oversized input closes with 1009 |

Source attribution comes from Fastify's verified `request.ip`, never from raw
`X-Forwarded-For`, `X-Real-IP` or `Forwarded` values. A connection accepted in
direct mode uses the socket peer address. When proxy trust is enabled, the
application accepts either:

- `PRG32_BACKEND_TRUST_PROXY_CIDRS`, a validated comma-separated list of IPs or
  CIDRs passed to Fastify's proxy address policy; or
- `PRG32_BACKEND_TRUST_PROXY_HOPS`, default 1 and bounded to four, as an
  explicit hop-count policy.

Supplying proxy CIDRs while `PRG32_BACKEND_TRUST_PROXY=false` fails closed.
The deployment still must ensure that only the approved edge can reach the
backend when a hop policy is used; application configuration cannot create a
network boundary.

Reservations are released on normal close, abnormal close, socket error,
admission failure, stale-peer removal, abuse closure and server shutdown.
Cleanup is idempotent, and active source/identity registries contain only
currently admitted connections.

## 6. Message and join rate limiting

`MultiplayerHub` uses token buckets. Each peer has an independent message and
state bucket. Shared source and authenticated-identity buckets bound aggregate
fanout work when several connections share the same source or identity.

Defaults:

| Control | Configuration | Default |
| --- | --- | ---: |
| All messages per connection | `PRG32_BACKEND_MP_MESSAGE_RATE` | 60/sec |
| All-message burst | `PRG32_BACKEND_MP_MESSAGE_BURST` | 120 |
| State messages per connection | `PRG32_BACKEND_MP_STATE_RATE` | 30/sec |
| State burst | `PRG32_BACKEND_MP_STATE_BURST` | 60 |
| Join attempts | `PRG32_BACKEND_MP_JOIN_MAX` | 4 |
| Join window | `PRG32_BACKEND_MP_JOIN_WINDOW_SECONDS` | 10 sec |
| Source aggregate messages | `PRG32_BACKEND_MP_SOURCE_MESSAGE_RATE` / `..._BURST` | 300/sec / 600 |
| Identity aggregate messages | `PRG32_BACKEND_MP_IDENTITY_MESSAGE_RATE` / `..._BURST` | 120/sec / 240 |

The token bucket refills continuously and is stored on the bounded peer or
active source/identity record. A rate violation sends a stable error when
possible, releases the peer, and closes the connection with WebSocket code
1008. Join and state violations use `join_rate_limited` and
`state_rate_limited`; aggregate/general violations use
`message_rate_limited`.

## 7. Heartbeat and idle lifecycle

`backend/src/multiplayer/routes.ts` uses one shared lifecycle timer rather than
one timer per connection.

| Control | Configuration | Default |
| --- | --- | ---: |
| Ping interval | `PRG32_BACKEND_MP_HEARTBEAT_INTERVAL_SECONDS` | 30 sec |
| Pong grace | `PRG32_BACKEND_MP_HEARTBEAT_GRACE_SECONDS` | 10 sec |
| Never-joined timeout | `PRG32_BACKEND_MP_UNJOINED_TIMEOUT_SECONDS` | 30 sec |

The server sends standard ping frames and records the pong event. Missing pong
within the grace period closes the connection. A never-joined socket expires
after the unjoined timeout even if its TCP connection remains open. A joined
client is not disconnected merely for being application-idle; transport
liveness is independent from state-update activity.

The shared timer is cleared on plugin close. Connection records and peer
reservations are cleared on close, error and shutdown. Tests use short
test-only values for deterministic validation and do not change defaults.

## 8. Backpressure and slow consumers

Outbound messages are serialized once per send and checked against:

- the existing 64 KiB message boundary; and
- `PRG32_BACKEND_MP_MAX_BUFFERED_BYTES`, default 256 KiB per connection.

The relay does not create an application-level retry queue. Before and after a
send it checks `socket.bufferedAmount`; a receiver that exceeds the bound is
closed with 1013 (`slow consumer`). A send to a closed or failed socket is
treated as stale and removed from the room. Broadcast loops skip the sender,
closed peers and failed receivers. One slow receiver therefore cannot block
the room's other sends through an unbounded application queue.

The bound is per process and per socket. Kernel/TCP buffers and edge proxy
buffers remain deployment-level concerns and were not modified here.

## 9. Bounded state and cleanup

New state is bounded as follows:

- active peers are bounded by the global connection limit;
- source and identity maps contain only active reservations;
- per-peer token buckets and join windows are released with the peer;
- no per-message timers are created;
- no historical source labels or raw tokens are retained;
- `BoundedRateLimiter` refuses a new key when capacity is full rather than
  evicting an active key.

The hub's public status response was not expanded with identity, source or
connection-registry details. No new unauthenticated diagnostic endpoint was
added. Server-side logs continue to use request IDs and stable error codes;
credentials and cookies are not logged by the new controls.

## 10. Authentication limiter remediation

`backend/src/security/rate-limiter.ts` introduces `BoundedRateLimiter`:

- fixed-window counting with an injectable `now` argument for deterministic
  tests;
- maximum tracked key count;
- expiration cleanup on every admission attempt;
- active entries are not evicted to make room for new high-cardinality keys;
- capacity exhaustion rejects the new key, preserving existing active-key
  protection;
- `size` is exposed only for isolated tests.

The local auth limiter uses:

- `PRG32_BACKEND_AUTH_RATE_LIMIT_MAX`, default 5;
- `PRG32_BACKEND_AUTH_RATE_LIMIT_WINDOW_SECONDS`, default 60;
- `PRG32_BACKEND_AUTH_RATE_LIMIT_MAX_CLIENTS`, default 4096.

The same bounded primitive now protects setup authorization and federation
administrative reauthentication, replacing their previously unbounded maps.
OIDC, SAML and scores already had bounded limiter structures and were not
rewritten.

## 11. HTTP quotas and timeouts

Fastify now explicitly receives:

- `PRG32_BACKEND_HTTP_REQUEST_TIMEOUT_MS`, default 120000 ms;
- `PRG32_BACKEND_HTTP_KEEPALIVE_TIMEOUT_MS`, default 5000 ms.

The values are intentionally conservative for streamed cartridge downloads;
the implementation does not buffer a download to enforce a quota.

Targeted source-based quotas apply to:

| Family | Configuration | Default |
| --- | --- | ---: |
| `GET /api/games` listing/search | `PRG32_BACKEND_HTTP_CATALOG_RATE_LIMIT_MAX` | 120 per 60 sec |
| `GET /api/games/:game_id/download` | `PRG32_BACKEND_HTTP_DOWNLOAD_RATE_LIMIT_MAX` | 60 per 60 sec |
| Shared window | `PRG32_BACKEND_HTTP_RATE_LIMIT_WINDOW_SECONDS` | 60 sec |
| Shared key capacity | `PRG32_BACKEND_HTTP_RATE_LIMIT_MAX_CLIENTS` | 4096 |

Rejected requests return the stable existing-style envelope
`{"ok":false,"error":"too many requests","code":"rate_limited"}` with a
`Retry-After` header. Existing multipart, metrics, SAML, score and backup
body-size protections remain in place. No arbitrary global quota was added to
firmware downloads, browser navigation, or authenticated administration.

This section is intentionally a partial closure of M550-HTTP-001. Upload,
search subfamilies outside catalog listing, admin operations and edge-level
timeouts require separate measured policies before they can be called fully
hardened.

## 12. Trusted proxy handling

Fastify is constructed with:

- `false` when `PRG32_BACKEND_TRUST_PROXY=false`;
- an explicit validated CIDR/IP list when
  `PRG32_BACKEND_TRUST_PROXY_CIDRS` is set; or
- a bounded hop-count function using `PRG32_BACKEND_TRUST_PROXY_HOPS` when
  trust is enabled without a CIDR list.

The default remains direct mode with proxy trust disabled. Canonical
operational mode still requires explicit `PRG32_BACKEND_TRUST_PROXY=true`.
The application does not hardcode Traefik, Dream network names, hostnames or
addresses. The operational network must still restrict direct backend access;
that is a deployment gate, not something an HTTP header can enforce.

The isolated regression test sends two different forged `X-Forwarded-For`
values with proxy trust disabled. Both requests share the loopback source
bucket and the second is rate-limited, demonstrating that the header cannot
bypass source quotas in direct mode. Configuration tests cover valid CIDRs
and reject CIDRs supplied while trust is disabled.

## 13. Configuration and defaults

All new controls are parsed centrally in `backend/src/config/env.ts` with
positive-integer validation. Proxy CIDRs are checked with Node's IP parser and
prefix bounds. Hop count is capped at four. No secret value is logged.

The new configuration is portable and does not require Dream infrastructure,
Redis, a database change or an additional service. Existing deployments that
enable proxy trust without `PRG32_BACKEND_TRUST_PROXY_CIDRS` use the explicit
one-hop default; operators may provide CIDRs for stronger network-specific
attribution. No Compose or operational environment file was changed in this
milestone.

## 14. Security observability

The implementation intentionally keeps `/health` and `/ready` lightweight and
does not expose source, identity, token or cookie information publicly.

Stable close/error codes provide bounded diagnostics to the connected client:

- `global_connection_limit`;
- `source_connection_limit`;
- `identity_connection_limit`;
- `unjoined_connection_limit`;
- `message_rate_limited`;
- `join_rate_limited`;
- `state_rate_limited`;
- `message_too_large`.

Admission and cleanup are represented by bounded in-memory state. No
high-cardinality public metric labels or unbounded logs were added. A future
operational metrics surface may count these events, but exposing it was not
needed to close the application behavior safely and was outside this scope.

## 15. Adversarial test results

New test file:
`backend/tests/security-hardening.test.ts`

The eight tests passed:

1. bounded limiter capacity does not evict an active source;
2. global/source/unjoined admission and cleanup;
3. per-identity admission with a second identity allowed;
4. normal join/state compatibility and sustained state-abuse closure;
5. join-attempt flood closure;
6. unjoined expiry and joined idle ping/pong liveness;
7. catalog quota and forged-forwarded-header rejection;
8. proxy CIDR validation.

The tests use real Fastify HTTP injection and real `ws` upgrades. The
heartbeat test uses a one-second test-only timeout; no long sleeps or public
load tests were used. The test fixture roots, databases, users and sockets are
disposable and cleaned up by the test lifecycle.

Existing real WebSocket and differential tests also passed, including:

- `backend/tests/multiplayer.test.ts`;
- `backend/tests/multiplayer-differential.test.ts`;
- WebSocket portions of `backend/tests/edge-federation.test.ts`.

No stress test against operational services was run. The 100-connection and
1000-message envelopes from the milestone request were not needed: targeted
tests exercised the admission and rate boundaries with smaller deterministic
fixtures.

## 16. Disposable Docker acceptance

No operational containers, Dream networks, Authentik resources, canonical
volumes or backup directories were touched.

The existing CLI Docker-network integration test passed using a synthetic
Fastify HTTPS target and private disposable Docker networking. The new
hardening code is included in the backend build used by the normal test/build
path; no operational image was started.

Compose configuration validation passed for:

- root `docker compose config --quiet`;
- `docker compose -f deploy/candidate/compose.yaml config --quiet`;
- `docker compose -f deploy/standalone/compose.yaml config --quiet` with
  synthetic test-only variables;
- `docker compose -f deploy/operational/compose.yaml config --quiet` with
  synthetic test-only variables and `/dev/null` only as a parse-time secret
  path.

The operational Compose file remained a template and was not started. No
public hostname was used in disposable acceptance.

## 17. Regression results

| Check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 57 files, 287 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0, 38 generated pages |
| `pnpm --dir cli run typecheck` | PASS |
| `pnpm --dir cli run lint` | PASS |
| `pnpm --dir cli run test` | PASS — 5 files, 9 tests |
| `pnpm --dir cli run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose ... config --quiet` validations | PASS, including synthetic standalone and operational templates |
| `git diff --check` | PASS |

Expected Node deprecation/experimental warnings and existing test fixture
warnings were observed; no test failure was attributed to them.

## 18. Files changed

M5.5.1 application/test changes:

- `backend/src/app.ts` — trusted proxy policy, Fastify timeouts, HTTP quotas,
  multiplayer limit wiring.
- `backend/src/auth/routes.ts` — bounded authentication limiter.
- `backend/src/config/env.ts` — validated hardening configuration and safe
  defaults.
- `backend/src/federation/admin-routes.ts` — bounded reauthentication limiter.
- `backend/src/multiplayer/hub.ts` — admission, token buckets, validation,
  cleanup and bounded fanout behavior.
- `backend/src/multiplayer/routes.ts` — real-upgrade admission, ping/pong,
  unjoined expiration, payload-size checks and `bufferedAmount` enforcement.
- `backend/src/security/rate-limiter.ts` — bounded fixed-window limiter.
- `backend/src/setup/routes.ts` — bounded setup authorization limiter.
- `backend/tests/security-hardening.test.ts` — isolated adversarial and
  regression tests.
- `docs/modernization/154-websocket-http-security-hardening-m5-5-1.md` — this
  report.

No dependency, Dockerfile, Compose, Flask, frontend, sibling-repository or
operational-infrastructure file was changed by M5.5.1.

The worktree contained unrelated pre-existing changes and untracked artifacts
before this milestone. They were preserved and are not attributed to this
implementation.

## 19. Remaining findings

### M551-HTTP-001 — PARTIAL

Catalog listing and download initiation now have application-level quotas and
explicit Fastify timeouts. Upload initiation, all admin operations, broader
search behavior and edge-level limits are not claimed fully hardened. Existing
multipart/auth/metrics limits remain in force.

### M551-PROXY-001 — application policy closed, deployment gate open

Application attribution no longer consumes arbitrary forwarded headers in
direct mode and supports explicit CIDR/hop policies. The actual Dream edge
must still be the sole ingress, overwrite forwarded headers and prevent direct
backend access. That was not changed or tested against the real infrastructure.

### Functional parity and session continuity

M5.5.0 findings remain: legacy providerless federation aliases, complete legacy
HTML URL parity, Flask/Fastify cookie continuity and live write ownership are
not resolved by this security milestone.

### Firmware runtime evidence

Source-level protocol compatibility remains verified, but no physical PRG32
board or QEMU network run was authorized in this milestone.

## 20. Backend Freeze blockers

M5.5.1 closes the application-level WebSocket resource-control finding, but
backend freeze remains blocked by the previously documented parity and
operational gates:

1. Full Flask/Fastify route and behavior parity is incomplete.
2. Flask/Fastify session continuity requires an explicit cutover decision.
3. Real firmware/QEMU network compatibility evidence is incomplete.
4. Actual Dream Traefik proxy isolation and forwarded-header behavior remain
   deployment gates.
5. Live write ownership, rollback reconciliation and cutover authorization
   remain open.
6. HTTP resource hardening is partial outside catalog/download families.

This milestone does not claim backend freeze readiness.

## 21. Final decision

`M551_WEBSOCKET_RESOURCE_CONTROLS_GO`

`M551_AUTH_LIMITER_BOUNDED`

`M551_PROXY_TRUST_APPLICATION_GO`

`M551_HTTP_RESOURCE_CONTROLS_PARTIAL`

`M551_FIRMWARE_PROTOCOL_COMPATIBLE`

`M550_FUNCTIONAL_PARITY_INCOMPLETE`

`M550_FIRMWARE_COMPATIBILITY_INCOMPLETE`

`OPERATIONAL_CUTOVER_NO_GO`

`FLASK_RETIREMENT_NO_GO`

M5.5.1 is complete within its authorized targeted scope. The next work, if
authorized, is the remaining M5.5.2 parity/firmware closure and the specific
HTTP/edge follow-up identified above. No operational deployment, public
cutover, Flask removal, commit or push was performed.
