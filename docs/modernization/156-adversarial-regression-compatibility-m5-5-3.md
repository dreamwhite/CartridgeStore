# M5.5.3 — Adversarial Regression & Backend Compatibility

Date: 2026-10-16  
Status: implemented and verified in disposable/local scope  
Operational cutover: **NO-GO**  
Flask retirement: **NO-GO**

## 1. Executive result

M5.5.3 is **GO for the verified Fastify security-regression and firmware/HTTP compatibility scope**. The milestone found one real compatibility defect: Fastify had no `GET /api` endpoint even though Flask exposed it and the PRG32 firmware repository documents `/api` and `/api/` as discovery endpoints. Fastify now exposes both read-only routes with the Flask-compatible store index envelope.

No production data, Flask source, `../PRG32`, operational Compose, Traefik, Authentik, public routing, or credentials were modified. No deployment, commit, or push was performed.

The result is not an operational cutover approval. External Dream infrastructure, physical ESP32/QEMU execution, production data migration, session continuity, and final single-writer ownership remain outside this milestone.

## 2. Authorized scope and safety boundary

Work was limited to:

- current Fastify source and tests;
- read-only inspection of Flask and `../PRG32`;
- disposable Fastify HTTP/WebSocket fixtures;
- existing isolated backup, publication, federation, migration, and firmware-host tests;
- one Fastify compatibility remediation and one adversarial regression test file;
- this report only as new Markdown documentation.

No public authentication was initiated. No OIDC/SAML provider was contacted. No public POST/PATCH/PUT/DELETE was sent. No operational container or persistent volume was stopped, removed, or changed.

## 3. Baseline and repository state

Initial verification used:

```text
git status --short
git log -6 --oneline
git diff --check
git -C ../PRG32 status --short
source "$HOME/.nvm/nvm.sh" && nvm use 24 && node -v && pnpm -v
```

The worktree was already dirty from prior modernization milestones. Those changes were preserved. The companion repository had pre-existing untracked `docs/quickstart-qemu.md` and `run-qemu`; neither was touched. Node.js was `v24.20.0` and pnpm was `12.5.1`.

## 4. Source and test audit

Inspected:

- M5.5.0, M5.5.1, and M5.5.2 reports;
- `backend/src/security/rate-limiter.ts`;
- authentication, authorization, setup, OIDC, SAML, WebAuthn, upload, archive, backup, publication, metrics, scores, and multiplayer modules;
- `backend/tests/` security, authentication, federation, publication, backup, storage-v2, telemetry, runtime, and compatibility tests;
- Next.js API clients and compatibility URL mapping;
- CLI tests and Docker-network integration;
- Flask `cartridge_store/app.py` route behavior;
- `../PRG32` firmware HTTP discovery and store client code.

The current controls are route-specific and bounded. There is no new global “allow all” middleware or broad prefix alias.

## 5. New implementation

### 5.1 Store API index

`backend/src/catalog/routes.ts` now registers:

- `GET /api`;
- `GET /api/`.

The response preserves the Flask store index fields:

- `ok`;
- `service`;
- `version`;
- `auth_enabled`;
- `roles`;
- `mdns.service` and `mdns.name`;
- the existing endpoint string list.

The handler is read-only and obtains the configured/canonical store name through the existing catalog read source. It does not access or expose credentials, tokens, sessions, database paths, or private provider records.

### 5.2 Adversarial regression tests

Added `backend/tests/adversarial-regression.test.ts` with five disposable tests covering:

1. `/api` and `/api/` firmware-discoverable index compatibility;
2. bounded high-cardinality rate limiter behavior plus trusted/untrusted forwarded-client attribution;
3. stable catalog error envelopes without filesystem/SQLite exception leakage;
4. repeated WebSocket admission-slot cleanup;
5. nested and oversized WebSocket payload rejection without poisoning the next connection.

No application behavior was changed for the initially attempted invalid pagination case; the test was corrected after observing that this existing contract intentionally ignores that unknown/invalid pagination value and returns a list response.

## 6. Adversarial identity and authorization matrix

| Actor/state | Verified evidence | Result |
|---|---|---|
| Anonymous catalog, score, aggregate statistics and firmware reads | catalog, score, stats, firmware-runtime, differential tests | allowed only on public contracts |
| Anonymous metrics/run detail and exports | metrics authorization tests | denied or empty according to the documented contract |
| Authenticated owner | ownership and metrics tests | owner-only resources remain isolated |
| Editor/reviewer | review, authorization, canonical workflow tests | review permission is required; CSRF applies to browser mutations |
| Publisher/catalog administrator | admin, catalog, canonical workflow tests | permission checks and publication state transitions are enforced |
| Administrator | admin, settings, federation-admin, backup tests | privileged APIs require the expected permission/session boundary |
| Suspended/disabled/banned account | admin-runtime-config and auth tests | durable access is revoked and authorization is re-evaluated |
| Revoked session/token | auth, admin invalidation, federation transaction tests | stale credentials do not retain access |
| Malformed credential/header | auth, OIDC/SAML, multiplayer and outbound-security tests | fail closed with stable public errors |
| Shared NAT/high-cardinality clients | new adversarial test and bounded limiter test | active keys are not evicted; capacity is finite |

No test establishes access for a role merely from a client-supplied role field.

## 7. Authentication, sessions, tokens, RBAC and CSRF

Verified existing behavior includes:

- browser sessions are distinct from bearer-only requests;
- browser mutations require the session CSRF token;
- bearer mutations do not use a browser CSRF token but still require authorization;
- logout, password changes, role/group changes, disable/suspend/ban, and deletion invalidate durable access as applicable;
- admin federation mutations require a browser session, CSRF, permission, and recent local reauthentication where required;
- WebAuthn ceremonies require the expected session/CSRF and challenge boundaries;
- setup authorization and setup mutations are bounded and fail closed.

Authentication rate limiting is applied to bootstrap, registration, password reset, and login. Setup authorization, OIDC login/callback, and SAML login/callback use bounded limiter instances. No password, token value, session cookie, hash, or provider secret was included in test output or this report.

## 8. OIDC and SAML callback abuse

Existing M5.5.2/M5.4 tests and the complete backend run verify:

- provider allow-listing and enabled-provider checks;
- state, nonce and PKCE transaction binding for OIDC;
- replay, expiry and provider-generation invalidation;
- SAML issuer, audience, destination, recipient, temporal, signature and certificate checks;
- bounded providerless aliases only when exactly one enabled provider exists;
- ambiguous or unavailable aliases fail closed;
- callback errors use stable public codes rather than raw upstream exceptions;
- the configured generic provider model remains generic and does not hard-code Authentik.

No live Authentik/SSO session was created in this milestone.

## 9. WebAuthn and malformed credential handling

`tests/webauthn.test.ts`, `tests/auth.test.ts`, `tests/security-hardening.test.ts`, and the admin suites cover anonymous ceremonies, missing/invalid CSRF, malformed ceremony input, disabled accounts, token/session invalidation, and authorization changes. The frontend dependency and generated Next build remain healthy.

## 10. Upload, multipart and archive boundaries

The existing submission and application-backup suites were rerun. They cover:

- archive byte limits;
- entry count, individual entry, aggregate expansion, compression-ratio and manifest limits;
- unsafe paths and invalid bundles;
- bounded multipart files/fields/parts;
- missing/corrupt/unsupported backup archive structures;
- wrong/tampered encrypted backup material;
- inventory mismatch validation before mutation;
- interrupted backup/restore and non-ready partial targets.

No new upload parser or archive dependency was introduced in M5.5.3.

## 11. SQLite, publication and recovery boundaries

The existing storage-v2 migration, publication, consistency, SQLite resilience, backup-v3 and encrypted backup-v4 tests passed. Evidence includes:

- transactionally consistent SQLite snapshot handling;
- foreign-key/integrity verification;
- publication journal and recovery evidence;
- interrupted publication compensation;
- source snapshot immutability;
- canonical writer lease and single-writer rejection;
- exact immutable object and staging restoration;
- migration exception preservation.

These tests remain disposable. They do not authorize production ownership transfer.

## 12. Backup and invalid-backup defenses

Backup tests reject or quarantine truncated/corrupt archives, missing required files, corrupt SQLite, missing objects, inventory mismatch, duplicate/unsafe/unsupported archive content, incorrect compression, wrong keys, tampered ciphertext and incomplete restore states. The independent verifier recomputes hashes and rejects unexpected or unsafe members before restore.

The M5.5.3 work did not change backup format, backup encryption, key registry behavior, retention, or operational scheduling.

## 13. HTTP rate limits and resource hardening

Verified controls:

| Surface | Control/evidence |
|---|---|
| Auth bootstrap/register/reset/login | bounded shared limiter, stable `429` code |
| Setup authorization | bounded limiter, stable `429` code |
| OIDC login/callback | bounded per-provider/IP limiter |
| SAML login/callback | bounded per-provider/IP limiter |
| Catalog listing | bounded process-local limiter and `Retry-After` |
| Binary download | bounded process-local limiter and `Retry-After` |
| Multipart submission/asset/backup | explicit Fastify multipart limits and route/service limits |
| Metrics | existing payload/sample/nesting/resource controls and firmware regression tests |
| Scores | existing validation and rate-limit behavior |

The limiter registry refuses new high-cardinality keys when capacity is full rather than evicting active protection. Catalog/download `429` responses retain the stable `{ok:false,error,code}` envelope and `Retry-After` window header. Other route-specific limiters retain their existing stable error contracts; no broad global limit was added.

## 14. Proxy attribution and forwarded headers

Fastify trust is disabled by default. CIDR trust requires the explicit trust switch. When enabled, the configured CIDR/hop policy controls `request.ip`; when disabled, forged `X-Forwarded-For` values do not create independent limiter identities.

The adversarial test verified:

- two forged forwarded addresses collapse to the direct client when proxy trust is disabled;
- two forwarded addresses are distinct only when loopback is explicitly trusted;
- the existing edge-federation suite overwrites forwarded headers at the disposable TLS edge;
- public-origin generation remains tied to configured origin values.

Malformed and untrusted proxy input is not treated as a trusted identity source.

## 15. WebSocket admission, message abuse and liveness

The existing M5.5.1 suite plus the new adversarial tests verify:

- global, source, identity and unjoined admission caps;
- cleanup after normal close, error and server shutdown;
- repeated disconnect/reconnect slot reuse;
- message, source, identity, state and join token-bucket controls;
- maximum payload enforcement and nested JSON/depth rejection;
- invalid JSON and unknown-message handling;
- room-size and role admission;
- heartbeat ping/pong liveness;
- unjoined timeout;
- bounded outbound payloads and slow-consumer closure;
- TLS edge WebSocket forwarding and invalid-token rejection.

The WebSocket route remains on the backend HTTP port and no separate relay service was created.

## 16. Error leakage and stable envelopes

The app-level error handler emits `internal_error` without raw exception text. Route-specific public mappers preserve required firmware contracts while replacing unexpected errors with stable messages. The new malformed-catalog regression confirmed that a representative invalid request returns:

```json
{"ok":false,"error":"invalid request","code":"invalid_request"}
```

Server-side logs retain request IDs and structured error diagnostics. The report contains no secret-bearing diagnostics.

## 17. Legacy route disposition policy

The previous broad “missing” label is replaced here by explicit route-level decisions. A disposition is a compatibility decision, not a claim that every historical HTML byte is identical.

| Legacy route(s) | Disposition | Canonical owner/evidence |
|---|---|---|
| `GET /` | `REPLACED_BY_NEXT` | Next catalog page and catalog API |
| `GET /games/:game_id` | `REPLACED_BY_NEXT` | Next game detail page and catalog API |
| `GET /publish` | `REPLACED_BY_NEXT` | Next publishing workspace and Fastify submission API |
| `GET /setup` | `REPLACED_BY_NEXT` | Next setup/admin workspace and `/api/setup/*` |
| `POST /setup` | `INTENTIONAL_DEPRECATION` | no unsafe form redirect; modern setup API is canonical |
| `POST /setup/logo` | `INTENTIONAL_DEPRECATION` | modern settings asset API |
| `POST /setup/favicon` | `INTENTIONAL_DEPRECATION` | modern settings asset API |
| `GET /static/custom/:filename` | `LEGACY_STORAGE_REFERENCE_ONLY` | old stored asset references are parsed safely; no new public write route |
| `GET /admin/users` and user mutations | `REPLACED_BY_NEXT` | Next admin UI plus `/api/admin/users*` |
| `GET/POST/PATCH/DELETE /admin/groups*` | `REPLACED_BY_NEXT` | Next admin UI plus `/api/admin/groups*` |
| `GET /admin/roles` | `REPLACED_BY_NEXT` | `/api/admin/roles` |
| `GET/PATCH/DELETE /admin/cartridges*` | `REPLACED_BY_NEXT` | Next catalog administration plus `/api/admin/cartridges*` |
| `GET/POST /admin/backup*` | `REPLACED_BY_NEXT` | administrator backup API/UI surface |
| `GET/POST /editor/submissions*` | `FASTIFY_COMPATIBILITY_HTML` plus `REPLACED_BY_NEXT` UI | Fastify review HTML/API and Next review workspace |
| `GET /scores`, `/stats`, `/users/*` | `REPLACED_BY_NEXT` | Next pages backed by compatible APIs |
| `GET /manifest.webmanifest` | `REPLACED_BY_NEXT` | Next static route |
| legacy `/auth/*` browser pages | `REDIRECTED_BY_NEXT` | compatibility redirect mapping to Next auth pages |

No broad `/admin`, `/api`, or unsafe-POST redirect was introduced. Each listed mutation has an explicit modern API or an intentional retirement decision.

## 18. `/api` compatibility resolution

Flask `cartridge_store/app.py` returns the store endpoint index at `GET /api`. The firmware repository independently registers `/api` and `/api/` and documents them as discovery endpoints. The previous M5.5.2 classification “missing; not firmware relevant” was therefore factually wrong.

The new Fastify route is a safe read-only implementation, tested on both spellings. The existing firmware host acceptance still passes catalog/discovery/download/SHA behavior, and the new test directly asserts the store index fields. The route does not expose device-local PRG32 endpoints that belong to the board firmware; it exposes the Cartridge Store contract only.

## 19. Disposable workflow matrix A–G

| Workflow | Disposable evidence | Result |
|---|---|---|
| A — public client | catalog, discovery, media/download, score/stats and firmware runtime tests | PASS |
| B — authenticated user | auth, ownership, metrics and profile tests | PASS |
| C — publisher/reviewer | submission, review, canonical workflow and admin catalog tests | PASS |
| D — metrics client | firmware-shaped runs/batch/finish, ownership, export and resource-limit tests | PASS |
| E — multiplayer client | real WebSocket, differential, admission, abuse, heartbeat and TLS-edge tests | PASS |
| F — administrator | settings, users/groups/roles/tokens, federation, WebAuthn and backup tests | PASS |
| G — backup/recovery | storage-v2 backup-v3, backup-v4, restore, interruption and rollback rehearsal tests | PASS |

These are local/disposable HTTP and WebSocket workflows. No production route or operational database was exercised.

Playwright browser E2E was not run for this milestone: the verified workflows use direct disposable HTTP/WebSocket clients, and no real external identity-provider session was authorized.

## 20. Failure injection and fail-closed behavior

The existing suites exercise process interruption during migration, publication, backup encryption, backup creation, restore extraction and restore verification. They verify no ready partial target, no completed corrupt archive, no silent object overwrite, preserved recovery evidence, and safe writer-lock behavior.

No new failure-injection implementation was required in M5.5.3. No failure scenario was run against operational roots.

## 21. Firmware ABI and host compatibility

Read-only inspection confirmed the companion repository constants remain:

- `_prg32store._tcp`;
- discovery ABI `prg32-store-discovery-1.0`;
- metadata ABI `prg32-metadata-1.0`;
- colophon ABI `prg32-colophon-1.0`;
- `esp32c6` and `qemu` architecture identifiers.

`backend/tests/firmware-runtime-acceptance.test.ts` ran the actual `../PRG32/prg32/store/store_api.py` client against a disposable Fastify server and passed discovery, catalog and binary SHA verification. No firmware source was changed. Physical ESP32-C6 and QEMU execution were not available/authorized in this milestone.

## 22. Public Dream infrastructure observation

No public observation was performed in this run. Therefore TLS/DNS/HTTP behavior for `store.prg32.dream.test`, `api.prg32.dream.test`, and `sso.dream.test` is **NOT_VERIFIED** here. This avoids authentication, public mutations, provider login, or accidental interaction with shared Dream infrastructure.

## 23. Validation commands and results

All commands below were executed with Node.js 24 where applicable:

| Command | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test -- --reporter=dot` | PASS — 59 files, 295 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test -- --reporter=dot` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0, 38 generated routes |
| `pnpm --dir cli run typecheck` | PASS |
| `pnpm --dir cli run lint` | PASS |
| `pnpm --dir cli run test -- --reporter=dot` | PASS — 5 files, 9 tests |
| `pnpm --dir cli run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| standalone Compose config with synthetic required variables | PASS |
| operational Compose config with synthetic required variables | PASS |
| CLI Docker-network integration | PASS — included in 5-file/9-test CLI run |
| `git diff --check` | PASS |

The repository-wide Python suite was not altered by this milestone. No test result was inferred from an unexecuted command.

## 24. Files changed for M5.5.3

M5.5.3 changes:

- `backend/src/catalog/routes.ts` — added read-only `/api` and `/api/` store index routes;
- `backend/tests/adversarial-regression.test.ts` — five disposable adversarial regressions;
- `docs/modernization/156-adversarial-regression-compatibility-m5-5-3.md` — this report.

The worktree also contains many pre-existing M5.0–M5.5.2 changes and generated/untracked artifacts. They were not rebased, reset, cleaned, committed, or pushed.

## 25. Remaining risks and deviations

Remaining risks:

- process-local rate limiters are not distributed across multiple backend replicas;
- public Dream DNS/TLS/edge behavior is not verified in this run;
- physical firmware/QEMU execution is not verified;
- external OIDC/SAML browser session continuity is not re-proven here;
- exact historical Flask HTML bytes are intentionally not preserved by Next;
- browser-level Playwright federation acceptance remains unverified;
- operational writer ownership and telemetry reconciliation remain open;
- operational backup scheduling and retention remain governed by previous milestones and are not changed here.

Deviation from the prior plan:

- the expected `/api` disposition was changed from “not required” to a minimal Fastify endpoint after direct inspection of `../PRG32` firmware source and documentation;
- no broad legacy prefix fallback was added;
- no additional dependency was introduced.

## 26. Milestone decision markers

```text
M553_SECURITY_REGRESSION_GO
M553_FUNCTIONAL_COMPATIBILITY_GO
M553_LEGACY_ROUTE_DISPOSITION_RESOLVED
M553_HTTP_HARDENING_ACCEPTED
M553_FIRMWARE_HOST_COMPATIBILITY_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The GO markers apply only to the tested/disposable scope described in this report. They do not certify production readiness.

## 27. Next milestone recommendation

The next milestone should be a controlled operational handover gate, not another broad compatibility rewrite. Before it can receive a GO decision, it must close the explicit blockers: public edge verification, production writer quiescence and ownership, authentication/session continuity, telemetry and multiplayer ownership, mDNS ownership, backup restore rehearsal against operator-approved data, and rollback data-loss policy.

Do not remove Flask or change public routing until those gates are accepted with a real operator decision.

## 28. Final GO/NO-GO summary

| Decision | Result |
|---|---|
| M5.5.3 disposable adversarial/security regression | **GO** |
| Verified Fastify HTTP/API compatibility scope | **GO** |
| Firmware host compatibility scope | **GO** |
| External public infrastructure acceptance | **NO-GO / NOT_VERIFIED** |
| Operational migration | **NO-GO** |
| Flask retirement | **NO-GO** |
| Backend Freeze complete | **NO** — not declared |
