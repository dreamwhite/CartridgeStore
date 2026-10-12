# M5.A — Client/API Traceability Matrix

**Date:** 2026-10-12
**Scope:** `../PRG32` clients → Flask authority → Fastify foundation → storage/tests

## Classification legend

* **ACTIVE:** executable code reaches the interface in the inspected revision.
* **CONDITIONAL:** executable code reaches it only when a feature/configuration is
  enabled or a target supports it.
* **DOCUMENTED_ONLY:** mentioned in documentation without an identified call
  site to CartridgeStore.
* **TEST_ONLY:** used only by compatibility/integration tests.
* **LEGACY:** retained Flask/browser surface without a PRG32 companion consumer.
* **UNKNOWN:** no source-backed consumer found.

## Companion repository consumers

| Classification | Client / call site | Method and endpoint | Auth, body, response | Flask handler/service | Fastify status | Storage/tests |
| --- | --- | --- | --- | --- | --- | --- |
| ACTIVE | PRG32 host CLI `prg32.store.store_api.store_discover` (`../PRG32/prg32/store/store_api.py:8-51`) | mDNS `_prg32store._tcp.local.` then `GET /.well-known/prg32-store.json` | Public JSON; validates `abi` | `cartridge_store/app.py:565-595` | `backend/src/catalog/routes.ts` | `store_settings` read; discovery fixture and `tests/compatibility/generate_m3_oracle.py` |
| ACTIVE | Host CLI `store_list` (`store_api.py:53-69`) | `GET /api/games?limit=100` | Public JSON; accepts list or `games/items/cartridges` object | `app.py:637-665` → `GameStore.list_games` | `backend/src/catalog/routes.ts` → `ReadonlyCatalog.listGames` | `index.json`; catalog parity tests |
| ACTIVE | ESP32-C6 setup `fetch_catalog` (`../PRG32/components/prg32/prg32_setup_store.c:191-234`) | `GET /api/games?limit=<STORE_MAX_GAMES>` | Public JSON, streaming 8 KiB parse window; timeout configured | `app.py:637-665` → filesystem index | Implemented read-only parity | `index.json`; firmware expects IDs/title/version/architectures |
| CONDITIONAL | ESP32-C6/QEMU setup `stream_download` (`prg32_setup_store.c:468-505`) | `GET /api/games/<id>/download?architecture=<arch>&version=<version>` | Public raw bytes; validates HTTP status, length, PRG32 size | `app.py:707-721` → `GameStore.resolve_variant` | Implemented streamed/ranged parity | cartridge file; binary/hash tests |
| ACTIVE | Host CLI `store_download` (`../PRG32/prg32/store/store_api.py:71-103`) | Same download route | Public binary; 60 s timeout; writes chunks to local output | Same | Implemented | binary fixture/hash tests |
| ACTIVE | Host CLI `publish`/`publish_bundle` (`../PRG32/prg32/store/publish.py:11-59,91-105`) | `POST /api/publish/bundle` | Multipart field `bundle`; Bearer token; expects JSON `status`, `review_required`, `submission_id`, `submitted` | `app.py:730-735` → `publish_bundle_request` / `create_submission` | M5.1 isolated submission route | `cartridge_submissions` + disposable `pending/`; `tests/test_m5_1_submission_contract.py`, `backend/tests/submission.test.ts` |
| CONDITIONAL | PRG32 Wi-Fi score sync `prg32_score_submit_remote` (`../PRG32/components/prg32/prg32_http_scores.c:458-509`) | `POST /api/scores` | JSON `{game,player,score}`; `Content-Type` only; no Bearer header; 3 s timeout | `cartridge_store/scores.py:100-123` | Not implemented | `scores`; Flask score tests; auth mismatch is M5A-002 |
| CONDITIONAL | PRG32 metrics worker `post_run_start` (`../PRG32/components/prg32/prg32_metrics.c:239-257`) | `POST /api/runs` | JSON run metadata; no auth header; 1200 ms timeout | `metrics.py:142-191` | Not implemented | `runs`; firmware request contract in `tests/test_api_contracts.py`/metrics tests |
| CONDITIONAL | PRG32 metrics worker `post_batch` (`prg32_metrics.c:274-315`) | `POST /api/metrics/batch` | `{run_id,dropped_samples,samples:[...]}`; max 64 firmware samples | `metrics.py:193-270` | Not implemented | `samples`; limit/regression tests |
| CONDITIONAL | PRG32 metrics worker `post_run_finish` (`prg32_metrics.c:259-271`) | `POST /api/runs/<id>/finish` | `{finished_ms,dropped_samples}`; no auth header | `metrics.py:271-288` | Not implemented | `runs`; metrics tests |
| CONDITIONAL | PRG32 multiplayer transport (`../PRG32/components/prg32/prg32_multiplayer.c:380-470`) | Configured `PRG32_MULTIPLAYER_SERVER_URL`, default `ws://192.168.4.2:8081` | WebSocket join/state/leave frames; default points to separate MultiplayerServer, not store | `cartridge_store/multiplayer.py:318-329` only if URL is changed to store | Not implemented | process memory only; `tests/test_multiplayer_integration.py` covers Flask |

## Store routes without an identified PRG32 companion call site

These are still public or operational contracts, but no executable consumer in
the inspected `../PRG32` revision was found:

| Classification | Interface | Current owner and data | Notes |
| --- | --- | --- | --- |
| LEGACY / frontend | `GET /api/games/<id>` | Flask catalog; Fastify parity | Host CLI currently lists only; frontend/browser can use detail |
| LEGACY / frontend | `GET /api/games/<id>/icon` | Filesystem trailer/media | Optional browser preview; no firmware call site |
| LEGACY / frontend | `GET /api/games/<id>/screenshot` | Filesystem trailer/media | Optional browser preview |
| LEGACY / frontend | `GET /api/games/<id>/colophon` | PRG32 colophon trailer | Store UI/documented client |
| LEGACY / admin | `POST /api/publish` | Flask legacy multipart/form | No current PRG32 tool call; preserve until removal decision |
| LEGACY / review | `/api/submissions*` and `/editor/submissions*` | SQLite + pending filesystem | No companion client; editor/admin workflows |
| LEGACY / statistics | `/api/stats/downloads`, `/api/stats/scores`, `/api/stats/runs` | SQLite aggregates | Public/admin UI surfaces; no companion client |
| LEGACY / auth | `/auth/*`, `/api/me`, `/auth/me`, `/auth/tokens*` | SQLite/session/token | Browser/admin; PRG32 host tool uses only publish Bearer token |
| CONDITIONAL | `GET /api/multiplayer/status`, `GET /api/multiplayer`, `WS /api/multiplayer` | In-memory Flask hub | Protocol endpoint is compatible with a configured client, but PRG32 default points elsewhere |
| DOCUMENTED_ONLY / device-local | `/api/runtime`, `/api/games` POST, `/api/games/select`, `/api/screenshot.bmp`, `/api/performance.json`, `/api/memory` | Board-local firmware HTTP server | Same path fragments must not be routed to Cartridge Store |

## Three-way parity status

| Domain | PRG32 consumer | Flask | Fastify | Gate |
| --- | --- | --- | --- | --- |
| Discovery/catalog/media/download | Active | Authoritative | M3 read-only parity | Safe to continue shadow comparison; no cutover yet |
| Bundle submission | Active host CLI | Authoritative operational writer | M5.1 disposable pending writer | M5.2 blocked by consistency/reconciliation |
| Scores | Conditional firmware | Authenticated write + public read | Not migrated | Resolve firmware auth before M6 |
| Metrics ingestion | Conditional firmware | Public-compatible ingestion with limits | Not migrated | Preserve no-auth firmware contract; migrate with resource limits |
| Metrics detail/exports | Browser/admin | Owner/admin policy | Not migrated | Preserve nullable anonymous ownership semantics |
| Review/admin | Browser/editor | Authoritative | Not migrated | Route-level role/group behavior must be frozen explicitly |
| Multiplayer | Configured external WS client | In-memory relay | Not migrated | M7 single-process and proxy gate |

## Contract invariants for future Fastify work

1. Keep `prg32-store-discovery-1.0`, `prg32-metadata-1.0`, and
   `prg32-colophon-1.0` unchanged.
2. Keep `esp32c6` and `qemu` identifiers and the default architecture preference.
3. Preserve JSON field names, binary bytes, content type/disposition, range and
   conditional-download behavior.
4. Do not require Bearer auth on firmware metrics ingestion unless the PRG32
   client contract changes in a coordinated cross-repository change.
5. Do not weaken `/api/scores` auth to hide the current optional-firmware mismatch.
6. Keep WebSocket state ephemeral and preserve join/state/leave message fields.
7. Treat the filesystem/index as the public catalog authority until an explicit
   versioned migration says otherwise.
