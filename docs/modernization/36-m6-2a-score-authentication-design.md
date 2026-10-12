# M6.2a — Score Authentication & Firmware Compatibility Design

Date: 2026-10-12
Status: audit and design complete; implementation explicitly not authorized by this milestone.

## 1. Executive summary

The conditional score synchronization path has a real authentication mismatch. In the inspected PRG32 revision, `prg32_score_submit_remote()` sends `POST /api/scores` with JSON and `Content-Type: application/json`, but no `Authorization` or other credential header. Flask decorates the same route with `@login_required`. There is no source-backed reverse-proxy exception, trusted-network bypass, alternate score route, or device credential in the inspected repositories.

The feature is disabled by default in the firmware configuration, so this is a conditional compatibility defect rather than evidence that all deployed boards are currently failing. When enabled, the current firmware receives a non-2xx response from an authenticated Flask deployment and keeps the local score pending.

Recommended design for M6.2b:

1. Preserve `POST /api/scores` and the existing score JSON fields.
2. Require a dedicated score-ingestion bearer credential for remote firmware writes.
3. Store only a hash of that credential, bind it to an explicit device record, and enforce a score-ingestion scope at the route boundary.
4. Keep the credential-to-user association nullable and explicit; never infer ownership from `player`, board identity, game name, or IP address.
5. Require HTTPS with certificate validation before provisioning a production credential.
6. Add a client-generated submission identifier in a coordinated firmware release before promising exactly-once behavior.

This design requires firmware changes for new authenticated builds and a reviewed SQLite migration for device credentials. It does not weaken the existing Flask endpoint for old firmware. Existing user bearer tokens can be reused in a tightly controlled transitional test mode, but they are not a safe production firmware credential because the current token model has no scope, expiry, or device identity.

## 2. Repository revisions and working-tree evidence

The audit used source files at these revisions:

| Repository | Revision | Branch | Working tree at inspection |
| --- | --- | --- | --- |
| CartridgeStore | `212e06088d6eeb5121b4c08390201996978f6f48` | `main` | Already dirty from prior modernization work; tracked application/docs changes and untracked modernization/frontend/backend fixtures were present. |
| PRG32 | `ff53e81fa5825771a25a09af34f165e75378f1aa` | `main` | Dirty before this audit with `docs/quickstart-qemu.md` and `run-qemu`. |

Remotes were inspected and match the expected CartridgeStore and PRG32 repositories. The PRG32 working tree remained unchanged. No production database was opened in write mode.

## 3. Existing score lifecycle

### Board-local score lifecycle

The board-local score API and the external Cartridge Store API are separate HTTP worlds even though both use `/api/scores`.

`components/prg32/prg32_http_scores.c` implements the resident local scoreboard:

- `prg32_score_submit()` validates non-empty game/player values, keeps up to `PRG32_SCOREBOARD_TOP_MAX` (5) scores per game, and stores up to `PRG32_SCORE_MAX` (16) entries overall.
- Records are persisted in the `scores` NVS partition, namespace `prg32score`, with magic/version checks.
- Each local record contains `game[24]`, `player[24]`, `uint32_t score`, and an in-memory/persisted `pending_remote` flag.
- The current player name is also stored in NVS and defaults to `PLAYER`.
- Local scores remain usable without Wi-Fi and are retained when a cartridge slot changes.

### Remote synchronization lifecycle

On a local score submission, the firmware saves the record and calls `prg32_score_sync_remote()`. That function:

1. resolves a configured store URL from NVS, then compiled `CONFIG_PRG32_STORE_URL`, or mDNS discovery;
2. scans all pending local top-five records;
3. submits each record synchronously with `prg32_score_submit_remote()`;
4. clears `pending_remote` only when the request returns `ESP_OK`;
5. saves the store again if at least one record was acknowledged.

No periodic score-sync task or backoff schedule was found. A retry occurs when a caller invokes `prg32_score_sync_remote()` again, and the normal local submit path invokes it immediately after saving. A failed request leaves the record pending. A timeout after server-side insertion can therefore cause a duplicate on retry.

## 4. Complete score contract inventory

| Classification | Client/source | Interface | Request/authentication | Response/error handling | Storage/effect |
| --- | --- | --- | --- | --- | --- |
| ACTIVE, board-local | PRG32 resident HTTP server, `prg32_http_scores.c:571-608` | `POST /api/scores` on the board server | JSON `{game, player, score}`; no auth; score must be JSON number in `[0, UINT32_MAX]` | `{"ok":true}` on success; plain HTTP 400 text for invalid JSON/fields/score | Inserts into the board-local top-five NVS structure through `prg32_score_submit()` |
| ACTIVE, board-local | PRG32 resident HTTP server | `GET /api/scores` on the board server | Optional query filtering is not used by the handler | JSON array of local records | Reads board-local NVS-backed memory |
| CONDITIONAL, external | PRG32 `prg32_score_submit_remote()`, `components/prg32/prg32_http_scores.c:458-509` | `POST <store_url>/api/scores` | `Content-Type: application/json`; no bearer, token, CSRF, device ID, nonce, or idempotency key; body exactly `{"game":"...","player":"...","score":<uint32>}` | Reads only HTTP status; every non-2xx becomes `ESP_FAIL`; response body is ignored | Flask inserts one SQLite `scores` row on each accepted request |
| ACTIVE, external | Flask `cartridge_store/scores.py:40-69` | `GET /api/scores` | Public; optional `game`, `player`, `limit` query values; limit clamped to 1–100 | JSON list with `game`, `player`, `score`, `created_at`, `submitted_by`; score desc, created time asc | Read-only SQLite query using `scores_game_score_idx` |
| ACTIVE, browser | Flask `cartridge_store/scores.py:71-98` | `GET /scores` | Public HTML route; optional game/player/limit filters | `templates/scores.html` scoreboard | Read-only SQLite query |
| ACTIVE, external | Flask `POST /api/scores`, `scores.py:100-123` | Score insertion | `@login_required`; valid bearer-only requests bypass browser CSRF; cookie sessions require CSRF through the global auth hook | `{ "ok": true }` on success; unauthenticated API request returns JSON auth failure; invalid payload returns HTTP 400 with `expected game, player, score` | Inserts `game`, `player`, `score`, current epoch seconds, and principal name into `scores` |
| ACTIVE, host tooling | PRG32 repository search at the audited revision | No host score-management client found | Host tooling contains Cartridge Store catalog/publish operations, but no executable `/api/scores` submit/list call site was found | N/A | N/A |
| TEST_ONLY / compatibility | CartridgeStore tests and fixtures | Flask score round trips and auth regressions | Synthetic users/tokens only; no production records | Assert response/leaderboard shape and auth boundary | Isolated temporary SQLite |

The board-local endpoints must not be accidentally routed to or treated as the external Cartridge Store API. The PRG32 documentation also shows a direct host `curl` example, but no host-tool implementation that performs this operation was identified.

## 5. Current Flask score contract

### Authentication and CSRF

Flask extracts credentials from `Authorization: Bearer`, `X-PRG32-Token`, query `token`, or form `token`. `POST /api/scores` requires an authenticated principal through `login_required`.

The global auth hook has two relevant behaviors:

- a valid bearer-only request has no browser session and bypasses CSRF;
- a cookie-backed authenticated mutation requires the session CSRF token.

An unauthenticated request is not granted a trusted-network exception. On an API path, the login failure is JSON-shaped and returns HTTP 401. An invalid bearer token is simply not an authenticated principal and follows the same failure path.

Any authenticated role currently passes `login_required`; the score route does not require `player`, `publisher`, or `admin`. The score route therefore authenticates the caller but does not enforce a score-specific scope.

### Payload and validation

The current Flask implementation performs these transformations:

| Field | Current rule |
| --- | --- |
| `game` | `str(value).strip()[:24]`; must be non-empty |
| `player` | `str(value).strip()[:24]`; must be non-empty |
| `score` | `int(value)`; parse failure becomes `-1`; any negative value is rejected; there is no explicit Flask upper bound |
| Unknown fields | Ignored |
| Invalid/missing JSON | `silent=True` produces an empty payload and the route returns HTTP 400 |
| Request size | The score route inherits Flask's general `MAX_CONTENT_LENGTH` default of 8 MiB; it has no score-specific bound |

The PRG32 firmware is stricter on its board-local endpoint and carries a `uint32_t` score, so valid firmware-originated values are in `[0, 4294967295]`. The remote body uses the same unsigned range. A future TypeScript writer must preserve accepted legacy values while adding a deliberate upper-bound decision rather than silently changing score semantics.

### Storage and identity

The current SQLite row is:

```text
scores(id, game, player, score, created_at, submitted_by)
```

There is no `user_id`, `device_id`, submission ID, credential ID, expiry, or authenticity proof. `submitted_by` is a snapshot of the current principal name; it is not a verified player identity and is not sufficient to establish device ownership.

`GET /api/scores` is public and returns the leaderboard fields including `submitted_by`. The browser scoreboard and game page consume the same public score data. There is no separate score administration route in the inspected Flask implementation.

## 6. Firmware HTTP behavior and compatibility

The score synchronization feature is controlled by `PRG32_WIFI_SCORES_ENABLE`, which defaults to `n` in `components/prg32/Kconfig`. Remote submission is additionally compiled under `PRG32_WIFI_ENABLE`. The store URL is resolved from the NVS store setting, compiled `CONFIG_PRG32_STORE_URL`, or mDNS.

The exact remote client configuration is:

```text
POST <resolved-store-url>/api/scores
Content-Type: application/json
timeout: 3000 ms
body: {"game":"<escaped>","player":"<escaped>","score":<unsigned integer>}
```

No Authorization header is set. No response body is read. No distinction is made between 401, 403, 409, 429, or 5xx. Any non-2xx response or transport error leaves `pending_remote` set. The local scoreboard continues working offline.

The current firmware has NVS persistence for the score queue and store URL, but no score credential field, runtime token provisioning flow, token rotation flow, or secure-element integration was found. Adding credential storage and sending it requires a coordinated firmware release. A compile-time secret would be extractable from the image and is not an acceptable production provisioning mechanism.

## 7. Existing authentication capabilities

The current Flask and TypeScript implementations agree on the existing `api_tokens` shape:

```text
api_tokens(id, user_id, token_hash, label, created_at, last_used)
```

Verified capabilities:

- bearer authentication through SHA-256 lookup of the presented token;
- one-way token storage; raw token returned only at creation;
- multiple tokens per user;
- user association through `user_id` with cascade deletion;
- explicit revocation by deleting the token row;
- label update and last-used timestamp;
- role and group lookup through the owning user.

Not present:

- token expiry;
- a revoked flag or revocation timestamp;
- scopes or per-route permissions;
- device identity;
- rotation as an atomic old/new operation;
- an immutable token audit log;
- replay detection or idempotency;
- proof that the holder is a physical PRG32 device.

TypeScript's read-only path deliberately does not update `last_used`; its isolated writer path can update it. No score writer exists in TypeScript. OIDC and SAML are Flask-only integrations and are excluded from the target backend.

### Can existing API tokens be reused?

They can be used technically: both Flask and TypeScript accept `Authorization: Bearer`, and the token hash/owner lookup is compatible. They should not be provisioned into production firmware as the primary design. A current token is a general user credential with no score scope, no expiry, no device identity, and route behavior that grants authenticated access to other mutation surfaces. Revoking it also revokes every use of that token, while compromise has a broader blast radius than score ingestion.

Existing tokens are acceptable only as a short-lived, HTTPS-only laboratory fallback while M6.2b fixtures are built. They are not a safe substitute for a scoped device credential.

## 8. Threat model

| Asset | Actor/trust boundary | Threat | Consequence |
| --- | --- | --- | --- |
| Leaderboard rows | Internet/LAN client → score endpoint | Anonymous forged submissions or mass writes | Rankings become unreliable; SQLite grows |
| User credential | Firmware image, NVS, logs, proxy, LAN | Token extraction or plaintext interception | Account or device impersonation |
| Score identity | Player-controlled payload | Impersonated player names | Misleading attribution; not an account proof |
| Score availability | Many boards behind one NAT | IP-only throttling | One classroom can starve another or be blocked collectively |
| SQLite writer | Concurrent HTTP requests | Burst writes, busy errors, malformed values | Latency, failed submissions, resource exhaustion |
| Retry semantics | Firmware queue and network | Timeout after successful insert | Duplicate leaderboard rows |
| Score integrity | Modified game/firmware | Fabricated validly authenticated scores | Authentication does not prove gameplay correctness |
| Transport | Board/LAN/proxy → store | HTTP interception | Credential and score disclosure/manipulation |

Authentication establishes possession of a credential. It does not attest that a game binary was unmodified, that a score was honestly earned, or that `player` names an authenticated account. Signed requests would improve request-origin authentication but would not solve compromised firmware or modified game logic.

## 9. Authentication options

### Option A — Existing user bearer token

Firmware would add `Authorization: Bearer <user token>` while the server reuses the current `api_tokens` table.

Advantages: smallest protocol change, existing hash lookup, existing revocation, no SQLite migration. Disadvantages: general token scope, no expiry, no device identity, no secure provisioning flow, broad compromise impact, and no ownership distinction between a user's boards. This is a controlled fallback, not the recommended production design.

### Option B — Scoped device token

Each board receives a credential whose only server permission is score ingestion. The server hashes it, binds it to a device record, supports expiry/revocation/rotation, and optionally associates the device with a user. The firmware stores it in protected NVS and sends it as a normal bearer credential over validated TLS.

Advantages: least privilege, explicit device lifecycle, per-device limits and revocation, no need to equate player and account. Costs: new provisioning flow, firmware changes, a reviewed schema addition, and operational enrollment work. This is the recommended credential model.

### Option C — Dedicated authenticated ingestion endpoint

A separate route such as `/api/score-ingest` could isolate firmware policy from browser/user score submission. It still needs a credential model; a new URL alone provides no authentication. A dedicated route can be useful internally, but preserving `/api/scores` for the public contract minimizes firmware and leaderboard compatibility risk. If a separate route is chosen later, it should be an explicit versioned alias with identical storage semantics during migration.

### Option D — Anonymous ingestion with abuse controls

Payload validation, quotas, rate limits, and IP controls would reduce accidental abuse but would not authenticate a submitter or prevent a determined leaderboard forgery. NAT makes IP-only controls especially unsuitable for a classroom. Unrestricted anonymous writes do not meet the security requirement and are not recommended.

### Option E — Signed requests

HMAC or asymmetric signatures could authenticate possession of a device key and support nonce/timestamp replay checks. They require key provisioning, durable nonce/counter state, clock or monotonic-sequence design, firmware crypto/storage work, and server replay state. A signature still does not prove that game execution was genuine. This is deferred unless a later threat model requires stronger event authenticity than a scoped bearer credential.

## 10. Decision matrix

Scores are qualitative and reflect a classroom/research console, not a high-assurance anti-cheat platform.

| Option | Security | Firmware complexity | Backend/schema impact | Existing firmware compatibility | Provisioning/revocation | Replay resistance | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. User bearer | Medium-low | Low-medium | None | Requires header change | Existing user token lifecycle; broad blast radius | None | ACCEPTABLE WITH CONDITIONS for lab fallback |
| B. Scoped device token | High for endpoint auth | Medium | New device credential schema; scores table can remain unchanged | Requires firmware credential support | Explicit per-device lifecycle | None until submission ID is added | RECOMMENDED |
| C. Dedicated endpoint alone | Low-medium | Medium | Route only; still needs credentials | Breaking if path changes | Depends on A/B | Depends on A/B | ACCEPTABLE WITH CONDITIONS as a boundary, not a credential model |
| D. Anonymous + controls | Low | None | None | Fully compatible | No revocation | None | NOT RECOMMENDED |
| E. Signed requests | High request authentication, not score truth | High | Replay/key state required | Requires firmware crypto/provisioning | Strong but complex | Strong if nonce state is correct | DEFER |

## 11. Recommended design

Use Option B at the existing `/api/scores` path:

- authenticate with `Authorization: Bearer <score-device-token>`;
- recognize the presented credential as a score-ingestion credential, not a general user token;
- enforce a fixed `score:write` scope at the route boundary;
- apply per-credential rate limits and body/field validation;
- retain public `GET /api/scores` unchanged;
- retain the existing `scores` row shape initially so old leaderboard readers and historical rows remain compatible;
- record a stable device/source label in the existing `submitted_by` field, without treating it as a player identity;
- require HTTPS and certificate validation before a real token is provisioned;
- support revocation and rotation with a short overlap window only when explicitly requested.

The smallest maintainable implementation is a dedicated `score_devices` credential entity rather than overloading general user tokens. It keeps the security boundary legible in class and makes per-device abuse controls possible without pretending that a board is a user.

## 12. Proposed identity model

The identities are deliberately separate:

| Concept | Meaning | Trust level |
| --- | --- | --- |
| Score | Numeric event submitted by a client | Authenticated transport only; gameplay truth is unproven |
| `player` | Display name supplied by the game/user | Self-asserted |
| User | Account that may enroll or own a device | Verified only by the existing account system |
| Physical device | Board identified by an enrolled device credential | Credential possession, not hardware attestation |
| Cartridge/game | String/game identifier in the score payload | Validated identifier/length only |
| Submission source | Device label or authenticated username stored as `submitted_by` | Server-observed source, not player proof |

### Proposed schema impact

The minimum scoped-device model needs a new table, for example:

```text
score_devices(
  id INTEGER PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NULL,
  revoked_at TEXT NULL,
  last_used_at TEXT NULL
)
```

The scope is represented by the entity and route policy rather than a free-form client-supplied scope. `user_id` is nullable because device ownership is optional; it must not be filled from `player`, IP, or the first account that happens to use the device.

No change to `scores` is required for the first authenticated-ingestion slice. If product requirements later need relational ownership/audit queries, add a nullable `score_device_id` or immutable submission relation through a separately approved migration. Existing score rows must remain valid.

## 13. Retry and idempotency policy

The current firmware payload has no stable submission identifier. `game + player + score` is not a safe deduplication key: two legitimate games can produce the same tuple. Server-side heuristic deduplication is therefore forbidden.

Current behavior is at-least-once from the network's point of view. A successful insert followed by a lost response leaves the firmware record pending and a later retry creates another row. This is an existing compatibility limitation, not something to hide in M6.2b.

Recommended staged policy:

1. M6.2b preserves the current at-least-once semantics and does not invent deduplication.
2. A coordinated firmware release adds a persisted `submission_id` to each pending record and sends it in an optional versioned request field.
3. The server stores the accepted identifier per device with a uniqueness constraint and returns the same success result on a replay.
4. The client clears its pending record on any documented 2xx response; 401/403 stop retry until credentials are changed; 429/5xx/transport failures retain the record for a bounded retry schedule.

This requires either a new submission/idempotency table or a reviewed nullable column and unique index. It must not be implemented by comparing game/player/value.

## 14. Validation rules

### Current Flask rules

The current rules are documented in Section 5 and must be preserved for the existing route during the compatibility period: non-empty trimmed game/player values truncated to 24 characters, integer-coercible non-negative scores, ignored unknown fields, and `{ "ok": true }` on success.

### Proposed authenticated contract rules

- require `Content-Type: application/json` and a bounded body;
- require an authenticated score-device credential with the score-write scope;
- accept `game` and `player` as strings after trimming, maximum 23 UTF-8-safe characters for firmware-compatible storage, and reject empty values;
- accept `score` as an integer in `[0, UINT32_MAX]` for the firmware contract;
- reject arrays, objects, fractional numbers, non-finite values, and oversized fields rather than coercing them into surprising values;
- ignore unknown fields in the compatibility version, while reserving `submission_id` for the coordinated idempotency version;
- preserve `created_at` server time and `submitted_by` compatibility output;
- do not expose token hashes, device database IDs, or SQL errors.

The upper-bound tightening must be introduced deliberately. A transitional Flask implementation should first measure/fixture existing values and return a stable validation error before any production policy change.

## 15. Abuse controls and resource protection

Controls that do not require a schema change:

- request body limit of 1 KiB at the score route, comfortably above the current firmware's 160-byte body buffer;
- game/player maximums of 24 stored characters and score range `[0, UINT32_MAX]`;
- parameterized insert and one-row transaction per accepted submission;
- per-credential token bucket: suggested 30 accepted writes per minute with burst 10;
- a soft per-source/IP ceiling around 300 requests per minute for anomaly detection, not the only authorization mechanism;
- server-side logging of event type, route, status, credential identifier hash prefix, and request ID, never the raw token or full player payload;
- bounded 429 response with `Retry-After` and a stable `rate_limited` code.

The credential limit is the primary control because classroom boards may share a NAT address. Per-IP controls should be secondary and configurable. A process-local limiter is insufficient for multiple replicas; a trusted edge or shared limiter is required before horizontal scaling. SQLite write concurrency should remain single-writer with the configured busy timeout, and database growth requires the later retention milestone.

Suggested values are starting points, not observed traffic measurements. M6.2b should expose them as configuration and measure a synthetic classroom burst before deployment approval.

## 16. Transport security prerequisites

The firmware store URL documentation and mDNS discovery currently produce `http://` URLs. The score-specific HTTP client sets timeout and content type but does not set `crt_bundle_attach`; the general store client in `prg32_store.c` does attach the ESP certificate bundle for its HTTPS requests. No score-specific certificate pinning or verification configuration was found.

Therefore:

- do not provision a long-lived score credential for plaintext HTTP on an untrusted network;
- require HTTPS with certificate-chain validation for production device tokens;
- add and test score-client certificate configuration in the coordinated firmware release;
- keep HTTP only for explicitly isolated development/lab deployments with no production credential;
- verify Traefik TLS termination, forwarded scheme, certificate name, and WebSocket/API routing separately before firmware rollout.

The current development domains and local proxy setup do not by themselves prove that an ESP32-C6 can validate the development certificate. Physical/QEMU-compatible transport testing is a prerequisite, and certificate validation must not be disabled to make it pass.

## 17. Versioned contract

### CURRENT FLASK CONTRACT

```http
POST /api/scores
Content-Type: application/json

{"game":"breakout","player":"Grace","score":1200}
```

- Authentication: Flask login required. Browser sessions need CSRF; valid bearer-only requests bypass browser CSRF.
- Response: HTTP 200, `{ "ok": true }`.
- Validation: current coercion/truncation rules from Section 5.
- Errors: unauthenticated API request HTTP 401; invalid payload HTTP 400 with `expected game, player, score`; CSRF failure HTTP 403 with `csrf_failed` when applicable.
- Retry/idempotency: no server deduplication; each accepted request inserts a row.

### CURRENT FIRMWARE CONTRACT

- Feature-gated and optional; default disabled.
- Sends the same JSON body with only `Content-Type: application/json`.
- Uses a 3-second timeout.
- Does not send authentication, read response bodies, classify status codes, or send an idempotency key.
- Treats all non-2xx responses as failure and retains the local pending record.

### PROPOSED CONTRACT — score ingestion v1

```http
POST /api/scores
Authorization: Bearer <scoped-score-device-token>
Content-Type: application/json

{"game":"breakout","player":"Grace","score":1200}
```

- Authentication: required scoped score-device credential; no anonymous production writes.
- Authorization: fixed `score:write` scope; device/user identity is not the `player` field.
- Success: HTTP 200, `{ "ok": true }`, preserving the current response shape.
- Validation: firmware-compatible fields and bounds; unknown fields ignored in v1.
- Stable errors: `invalid_score_credential` (401 for absent/invalid/expired/revoked credentials), `score_scope_required` (403 only where a valid but wrongly scoped credential can be distinguished), `invalid_score_payload` (400 or 422 by approved Flask compatibility decision), `payload_too_large` (413), `rate_limited` (429), and `score_storage_unavailable` (503).
- Retry: 2xx clears pending; 401/403 stop automatic retry; 429/5xx/transport failures retain pending and use bounded retry.
- TLS: HTTPS with validated server certificate for production credentials.
- Idempotency: at-least-once in v1; `submission_id` and replay handling are a later coordinated version.

Breaking changes are explicit: current firmware without a credential will still fail against an authenticated endpoint; a secure server cannot make that build compatible without anonymous writes. New firmware must be provisioned with a credential and transport support. Existing public GET and historical score response fields remain compatible.

## 18. Cross-repository migration plan

| Phase | CartridgeStore Flask | Fastify/TypeScript | PRG32 firmware/tooling | Compatibility/rollback |
| --- | --- | --- | --- | --- |
| M6.2a | Audit only; keep current route and auth | Design only; no writer | Audit only; no firmware change | Current operational behavior unchanged |
| M6.2b isolated | Add only if separately authorized: contract fixtures or a feature-gated adapter; Flask remains writer | Implement disposable credential verifier, route policy, validation, limits, and rollback tests; no production DB | Add host/fixture representation of credential headers; do not require physical rollout yet | Disable TypeScript writer and preserve Flask; no live routing |
| Credential schema gate | Review migration and backup/restore plan | Add `score_devices` only through approved migration policy | Define device enrollment/provisioning UX and NVS storage | Migration must be reversible before production use |
| Coordinated firmware release | Accept scoped credential on Flask while it remains authoritative | Run shadow/compatibility tests only | Send bearer token, validate HTTPS, classify statuses, retain offline behavior | Old firmware remains local-only for score sync; no anonymous bypass |
| Optional idempotency release | Add reviewed replay storage/contract | Implement exact replay result | Persist/send `submission_id` | Roll back by accepting v1 at-least-once semantics |
| M8 cutover gate | Only after all parity/backup/rollback evidence | Become operational writer only after explicit approval | Release-compatible builds identified | Immediate route rollback to Flask remains available |

The PRG32 host tooling has no identified score submit/list implementation, so no host-tool change is currently required. Any future provisioning command is a separate approved feature and must never print raw credentials in normal logs.

## 19. Test strategy

| Test | Flask current/compatibility | Fastify disposable fixture | Firmware host/QEMU | Physical ESP32-C6 |
| --- | --- | --- | --- | --- |
| Valid authenticated score | Verify current session, CSRF, and bearer paths | Verify scoped credential, owner/source recording, and stable 200 | Build request bytes and header presence | HTTPS certificate and real endpoint |
| Missing/invalid/revoked/expired credential | Current missing/invalid behavior; feature-gated future policy | Credential lifecycle and generic invalid error | Retry stop behavior | Provision/revoke on device |
| Unauthorized scope | Future route policy fixture | Scope denial without leakage | N/A | N/A |
| Invalid game/player/score/unknown fields | Preserve current contract and proposed bounds separately | Exact validation matrix | Buffer/escaping boundary tests | On-device long/unicode input |
| Oversized payload/rate limit | Flask request and limiter regression | Body limit, token bucket, NAT-safe source tests | 429/Retry-After handling | Burst boards on one AP/NAT |
| Replay/duplicate/concurrency | Current duplicate evidence; no heuristic dedup | Transaction and future idempotency uniqueness tests | Timeout after server 2xx; reboot queue replay | Network interruption and power loss |
| SQLite rollback | Existing isolated temporary DB only | Failure injection and busy timeout tests | N/A | N/A |
| TLS | Proxy/certificate integration | HTTPS test server where feasible | Certificate validation in host/QEMU build | Required acceptance test |
| Leaderboard compatibility | Existing GET response/ordering fixtures | Read-only schema/serialization fixture | GET response parser if used | Board local GET remains separate |

No physical hardware, QEMU, or firmware build test was executed for this audit. The table defines required future coverage, not completed evidence.

## 20. Remaining decisions before M6.2b

1. Approve the new `score_devices` entity and whether `user_id` association is needed at enrollment.
2. Select the provisioning channel and protect device token storage in NVS.
3. Confirm production HTTPS certificate strategy for ESP32-C6 and QEMU.
4. Decide whether M6.2b implements only v1 at-least-once delivery or also schedules the coordinated `submission_id` release.
5. Set and measure per-credential and shared-NAT limits using classroom traffic assumptions.
6. Decide whether Flask should accept scoped device credentials before the M8 cutover while remaining sole writer.
7. Define backup/restore and migration handling for device credential hashes and revocation state.
8. Confirm that public leaderboards may continue to expose `submitted_by` and self-asserted `player` values.

## 21. M6.2b recommendation

**NO-GO for M6.2b implementation until the decisions in Section 20 are approved.**

The design is sufficiently bounded to proceed after approval, but firmware authentication, TLS validation, credential provisioning, and schema ownership are compatibility/security decisions rather than implementation details. M6.2b must remain isolated, must not add a production writer, must not modify the PRG32 repository without coordinated authorization, and must not begin automatically from this audit.

## 22. Audit verification record

Commands actually executed in this milestone were read-only inspection commands:

- `git rev-parse HEAD`, `git branch --show-current`, `git status --porcelain=v1`, and remote/log inspection in both repositories;
- `sed`/`rg` source inspection of the required Flask, TypeScript, firmware, configuration, documentation, templates, and tests;
- path and call-site searches for `/api/scores`, score synchronization, bearer authentication, TLS configuration, and host tooling.

No pytest, Vitest, build, Docker, firmware, QEMU, deployment, migration, or destructive test was executed for M6.2a. Previously recorded results remain historical evidence only and are not claimed as newly run here.

Documentation links and referenced repository paths were checked by locating the files and call sites during the read-only inspection. The only intended changes from this milestone are this design document, the concise ADR, and the roadmap entry.
