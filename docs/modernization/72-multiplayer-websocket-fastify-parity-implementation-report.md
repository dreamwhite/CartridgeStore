# PRG32 Cartridge Store — Fastify Multiplayer WebSocket Parity Implementation Report

Date: 2026-10-13
Status: **GO for isolated protocol/runtime parity; NO-GO for operational route cutover**

## Executive result

The Fastify backend now implements the existing Flask multiplayer contract on
the same public path:

- `GET /api/multiplayer` returns the existing service/protocol description;
- `GET /api/multiplayer/status` returns the existing room status envelope;
- `WS /api/multiplayer` relays `join`, `state`, and `leave` frames;
- rooms remain isolated by cartridge signature;
- `PRG32_MP_MAX_PEERS` remains configurable with the existing default of `8`;
- legacy `PRG32_USERS` tokens and Fastify database bearer tokens are accepted by
  the isolated Fastify runtime according to its configured authentication mode.

The implementation uses `@fastify/websocket` with the `ws` transport and a
per-application in-memory hub. No global relay state, SQLite schema change,
firmware change, public route switch, Flask removal, deployment, or production
data access was introduced.

## Contract reconstruction

The implementation was compared against:

- `cartridge_store/multiplayer.py` and its real Flask-Sock integration;
- `tests/test_multiplayer_integration.py` and the existing hub tests;
- `docs/api.md` and the API-contract/roadmap reports;
- `../PRG32/components/prg32/prg32_multiplayer.c`, read-only;
- PRG32 firmware documentation and Kconfig defaults, read-only.

The firmware sends:

```json
{"type":"join","signature":"pong-v1","flags":1,"player_id":123}
{"type":"state","player_id":123,"x":120,"y":80,"sprite":0,"flags":0,"input":2,"frame":42}
{"type":"leave","player_id":123}
```

The server preserves the observed response behavior: `welcome` assigns the
player identifier, `peer` carries clamped state fields, `leave` removes a peer,
invalid JSON and unknown message types return stable error frames, and a peer
must join before publishing state. The state sender's `player_id` remains
server-owned, as in Flask.

## Implementation

Files added:

- `backend/src/multiplayer/hub.ts`: typed in-memory relay, room membership,
  peer-cap enforcement, player-id allocation, authorization seam, cleanup,
  and wire-field normalization;
- `backend/src/multiplayer/routes.ts`: Fastify HTTP/WebSocket route registration,
  bounded WebSocket payload configuration, request token extraction, and
  connection lifecycle cleanup;
- `backend/tests/multiplayer.test.ts`: real TCP WebSocket compatibility tests.

Files modified:

- `backend/src/app.ts`: constructs an isolated hub per Fastify application and
  registers the multiplayer routes;
- `backend/src/config/env.ts`: exposes `PRG32_MP_MAX_PEERS` and the parsed
  legacy configured-user set;
- `backend/src/auth/tokens.ts`: accepts the documented legacy
  `name:role:token` format in addition to JSON configuration;
- `backend/package.json` and `backend/pnpm-lock.yaml`: add the maintained
  Fastify WebSocket plugin, its `ws` runtime dependency, and the direct `ws`
  test client/types;
- `backend/tests/app.test.ts`: verifies the multiplayer HTTP route bindings;
- this report and the append-only roadmap entry.

The WebSocket route is declared with Fastify's full route syntax so the HTTP
fallback and WebSocket upgrade can intentionally share `/api/multiplayer`.
The plugin is registered in an encapsulated scope before the route is declared;
this avoids the duplicate-route and HTTP-only failure modes found during the
first implementation attempt.

## Verification evidence

All commands below were executed locally with Node `24.20.0` selected through
`nvm use 24` and pnpm `12.5.1`.

| Check | Result |
| --- | --- |
| `pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm run test` in `backend/` | PASS — 27 files, 138 tests |
| `pnpm run build` in `backend/` | PASS |
| focused Fastify real WebSocket tests | PASS — 2 tests |
| Flask `tests/test_multiplayer_integration.py` | PASS — 1 test |
| full Python `pytest -q` with synthetic `SECRET_KEY` | PASS — 64 tests |
| frontend typecheck, lint, and Vitest | PASS — 29 tests |
| frontend production build with `FLASK_PROXY_TARGET=http://flask:5080` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

The frontend build without `FLASK_PROXY_TARGET` was rejected by the existing
configuration guard; it was then rerun with the documented reachable Flask
proxy target and passed. No frontend source or routing behavior was changed by
this milestone.

The public infrastructure smoke also passed without changing ownership:

- `GET https://api.prg32.dream.test/api/multiplayer` returned HTTP 200 from
  the existing Flask/Werkzeug service;
- a real `wss://api.prg32.dream.test/api/multiplayer` client connected through
  the existing Traefik route and received `{"type":"welcome","player_id":7}`;
- `docker/auth-writer-edge-proxy.conf` still forwards HTTP/1.1 `Upgrade` and
  `Connection` headers;
- Compose labels still route the API domain to Flask, while the dedicated
  auth edge bridge retains its higher-priority auth/federation paths.

The running local auth-writer and edge-proxy containers were unhealthy during
the check because their existing health probes could not reach
`127.0.0.1:5090` and the proxy consequently returned 502. This was outside
the multiplayer scope; the public Flask WebSocket path remained healthy and no
container state was modified.

## Cutover classification

`CUTOVER-004` is **closed for isolated Fastify protocol and runtime parity**.
It is **not** closed for operational cutover. Flask remains the public owner of
`api.prg32.dream.test/api/multiplayer`, and the verified public WebSocket smoke
deliberately proves that existing traffic remains on Flask.

The Fastify implementation is therefore ready for a later controlled canary,
but that canary still requires an explicit routing decision, shared runtime
state strategy, rollback procedure, and operational health evidence. A
single-process in-memory relay is correct for the current Flask-compatible
deployment shape but is not sufficient for horizontally scaled Fastify
instances without sticky routing or a broker.

## Remaining risks and next milestone

- public traffic has not been switched to Fastify;
- the Flask/Fastify session and token ownership transition remains open;
- Fastify multiplayer state is process-local and has no broker or cross-instance
  replication;
- the frontend has no multiplayer UI/client yet;
- the local auth-writer health issue remains an independent environment risk;
- browser, Authentik, and Playwright E2E remain intentionally out of scope.

Recommended next milestone: perform the catalog/publication and mDNS/runtime
ownership assessment needed before a controlled API canary, or explicitly
authorize the separate Fastify multiplayer canary preparation. Do not remove
Flask or change public routing as part of this report.
