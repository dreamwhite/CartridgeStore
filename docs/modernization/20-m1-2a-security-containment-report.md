# M1.2a — Security Containment Report

**Date:** 2026-10-12
**Status:** implemented and verified
**Scope:** ZIP upload hardening, metrics resource limits, metrics export authorization, and API error leakage containment in the transitional Flask backend.

## Outcome

M1.2a is complete within its approved scope. The active Flask service now has bounded ZIP ingestion, bounded metrics batches, consistent run/export authorization, and stable API error envelopes for store validation failures. No SQLite schema migration, Fastify implementation, storefront feature, deployment change, or production-data operation was performed.

The existing firmware ingestion paths remain anonymous-compatible: `POST /api/runs`, `POST /api/metrics/batch`, and `POST /api/runs/<run_id>/finish` continue to accept the documented request shapes without requiring a browser session or CSRF token.

## Findings addressed

### ZIP upload hardening

Bundle upload handling now reads the multipart file through a bounded stream and rejects the upload once the configured archive-byte limit is exceeded. ZIP central-directory metadata is checked before any manifest, asset, or cartridge entry is materialized.

The following controls are enforced:

- archive byte limit;
- maximum entry count;
- maximum uncompressed size for an individual entry;
- maximum aggregate uncompressed size;
- maximum compression ratio;
- maximum `manifest.json` size;
- duplicate filename rejection;
- NUL, absolute, drive-qualified, dot-component, and `..` path rejection;
- bounded reads for manifest, icon, splash, and cartridge entries;
- invalid ZIP metadata and decompression failures converted to a stable client error.

Directory entries are included in the entry count and filename validation. No generic archive extraction operation is used; only the required bounded entries are read and transformed into the existing PRG32 submission flow.

### Metrics resource limits

Metrics JSON requests now have a route-specific content limit. Batch requests also have an explicit maximum sample count and a maximum database-work budget. One sample represents one insert attempt; a non-zero `dropped_samples` value adds one update operation to the budget.

Sample items must be objects whose values are scalar. Nested objects, nested arrays, and non-object sample entries are rejected before database work. Invalid JSON, oversized bodies, sample-count overflow, and work-budget overflow use stable status/code combinations.

The existing permissive numeric conversion for scalar firmware fields remains in place to avoid changing the documented receiver behavior for valid firmware payloads. This milestone does not change the database schema.

### Metrics export authorization

The provisional policy is now enforced by one shared `can_view_run` decision:

| Run or principal | Detail | JSON/CSV/Markdown export |
|---|---:|---:|
| Authenticated owner | Allowed | Allowed |
| Administrator | Allowed | Allowed |
| Authenticated non-owner | Forbidden | Forbidden |
| Anonymous run, anonymous requester | Forbidden | Forbidden |
| Anonymous run, administrator | Allowed | Allowed |

Anonymous ingestion remains unchanged. A run’s `user_id` is no longer overwritten during an existing `run_id` upsert, so a later request cannot silently reassign ownership. The first stored ownership state remains authoritative.

The `/api/runs` list preserves its JSON list shape. Anonymous callers receive an empty list; authenticated non-administrators receive their own runs; administrators receive all runs. Public aggregate metrics at `/api/stats/runs` remain available because they expose only counts and activity totals, not run-level identifiers or samples.

### API error leakage

The API handler for `StoreError` and PRG32 validation errors no longer serializes `str(exc)` into an externally visible API response. It logs the rejected path and diagnostic message server-side and returns:

```json
{"ok": false, "error": "invalid request", "code": "invalid_request"}
```

Metrics resource and validation failures use stable codes, including:

- `metrics_payload_too_large` — HTTP 413;
- `metrics_sample_limit` — HTTP 413;
- `metrics_work_limit` — HTTP 413;
- `invalid_metrics_json` — HTTP 400;
- `invalid_metrics_payload` — HTTP 400;
- `invalid_sample_structure` — HTTP 400;
- `run_not_found` — HTTP 404.

The existing success envelopes and firmware ingestion responses remain unchanged. The generic store-error message is an intentional compatibility-safe change: the response still contains `ok: false` and a string `error`, while implementation details and user-controlled values are no longer disclosed. A new `code` field is additive.

## Limits and defaults

All size values use binary units in the implementation.

| Control | Environment variable | Default | Flask config key |
|---|---|---:|---|
| Archive bytes | `PRG32_BUNDLE_MAX_ARCHIVE_MB` | 64 MiB | `BUNDLE_MAX_ARCHIVE_BYTES` |
| Legacy archive-size environment alias | `PRG32_BUNDLE_MAX_MB` | 64 MiB fallback | `BUNDLE_MAX_CONTENT_LENGTH` and archive fallback |
| ZIP entries | `PRG32_BUNDLE_MAX_ENTRIES` | 128 | `BUNDLE_MAX_ENTRIES` |
| Entry uncompressed bytes | `PRG32_BUNDLE_MAX_ENTRY_MB` | 32 MiB | `BUNDLE_MAX_ENTRY_UNCOMPRESSED_BYTES` |
| Total uncompressed bytes | `PRG32_BUNDLE_MAX_UNCOMPRESSED_MB` | 128 MiB | `BUNDLE_MAX_TOTAL_UNCOMPRESSED_BYTES` |
| Compression ratio | `PRG32_BUNDLE_MAX_COMPRESSION_RATIO` | 100 | `BUNDLE_MAX_COMPRESSION_RATIO` |
| Manifest bytes | `PRG32_BUNDLE_MAX_MANIFEST_KB` | 256 KiB | `BUNDLE_MAX_MANIFEST_BYTES` |
| Multipart parser overhead allowance | internal | 1 MiB | `BUNDLE_MULTIPART_OVERHEAD_BYTES` |
| Metrics request bytes | `PRG32_METRICS_MAX_MB` | 2 MiB | `METRICS_MAX_CONTENT_LENGTH` |
| Samples per batch | `PRG32_METRICS_MAX_SAMPLES` | 1,024 | `METRICS_MAX_SAMPLES_PER_REQUEST` |
| Database work per batch | `PRG32_METRICS_MAX_DB_WORK` | 2,048 | `METRICS_MAX_DB_WORK` |

The request parser allows the configured archive size plus the fixed multipart overhead. The bounded stream then applies the archive limit to the actual uploaded ZIP bytes, avoiding rejection of a valid archive solely because of multipart framing while keeping both layers bounded.

## Files modified

M1.2a changes are present in:

- `cartridge_store/app.py` — route-specific request limits, ZIP configuration, bounded upload reads, ZIP validation, and generic API store errors;
- `cartridge_store/metrics.py` — bounded JSON/batch validation, ownership-safe run upsert, list filtering, and detail/export authorization;
- `cartridge_store/metrics_report.py` — optional owner-filtered run listing;
- `cartridge_store/users.py` — anonymous-run administrator-only visibility;
- `tests/test_api.py` — updated assertions for the stable generic store-error envelope;
- `tests/test_api_contracts.py` — anonymous ingestion plus administrator export compatibility coverage;
- `tests/test_security_m1_2a.py` — new ZIP adversarial, metrics-limit, ownership, and export-policy tests;
- this report.

No SQLite schema definition or migration was added. No production data was opened or changed. Existing unrelated M0/M1.1 working-tree changes remain untouched.

## Compatibility evidence

The existing synthetic bundle fixtures continue to publish successfully under the default limits. The new tests cover duplicate filenames, unsafe manifest paths, entry count, per-entry size, total uncompressed size, compression ratio, manifest size, archive size, valid firmware-shaped metrics, oversized batches, nested sample structures, payload size, owner access, administrator access, and anonymous denial.

The API contract suite still covers catalog, version/architecture selection, binary downloads, authentication, publishing/review, statistics, scoreboard, metrics, multiplayer, discovery, and administrative boundaries. The metrics contract now deliberately authenticates as an administrator before exporting an anonymous fixture run, reflecting the approved provisional policy.

## Verification results

All commands below were executed successfully for this milestone.

| Check | Command | Result |
|---|---|---|
| Python syntax | `python3 -m py_compile app.py cartridge_store/*.py tests/test_security_m1_2a.py` | Passed |
| Full Python suite | `SECRET_KEY=m1-2a-test PATH="$PWD/.venv313/bin:$PATH" pytest -q` | **63 passed** |
| API contract, auth/CSRF, and M1.2a security tests | `SECRET_KEY=m1-2a-test PATH="$PWD/.venv313/bin:$PATH" pytest -q tests/test_api_contracts.py tests/test_security_m1_1.py tests/test_security_m1_2a.py tests/test_api.py tests/test_services.py` | **57 passed** |
| Frontend typecheck | `npm run typecheck` in `frontend/` | Passed |
| Frontend unit tests | `npm run test` in `frontend/` | **2 files, 5 tests passed**; existing Vitest config-loader warning |
| Frontend production build | `FLASK_PROXY_TARGET=http://flask:5080 npm run build` in `frontend/` | Passed |
| Patch whitespace | `git diff --check` | Passed |

No Docker or deployment operation was required by M1.2a. No frontend source or production routing was modified.

## Remaining risks and explicit non-goals

The following remain outside M1.2a and are not reported as fixed:

- rate limiting for login, publishing, scores, metrics, downloads, and WebSocket activity;
- backup archive secret redaction/encryption and staged restore rollback;
- complete production security-header/CSP/SVG policy verification;
- WebSocket payload and message-rate limits;
- proxy forwarded-scheme validation for external OIDC/SAML callbacks;
- OIDC/SAML provider end-to-end testing and permanent-session parity;
- filesystem/index versus database crash consistency;
- dependency maintenance findings in development tooling;
- a production-load test for SQLite lock contention and batch processing.

The API error handler still renders detailed messages for non-API HTML pages. The M1.2a requirement was specifically to remove raw exception strings from externally visible API error responses; HTML error-page policy remains a separate hardening decision.

The metrics limit is intentionally request- and row-work-based, not a complete CPU/time quota. A future backend should add operational timeouts and monitoring without changing the public firmware contract.

## TypeScript migration invariants

These rules are independent of Flask and must become Fastify/TypeScript acceptance criteria:

1. Uploaded archives are bounded before materialization by archive bytes, entry count, per-entry bytes, total uncompressed bytes, compression ratio, manifest bytes, duplicate names, and safe relative paths.
2. Required ZIP entries are streamed/read with bounded buffers; no archive entry is trusted solely because its central-directory metadata is small.
3. Metrics requests have independent body, sample-count, and database-work limits.
4. Sample records are objects with scalar fields; nested structures are rejected before database writes.
5. Firmware ingestion remains compatible for anonymous clients and valid bearer clients.
6. A run with an authenticated owner is visible only to that owner or an administrator.
7. A run without an owner is visible only to an administrator; exports use exactly the same decision as detail.
8. Public statistics contain aggregates only and do not reveal run-level identifiers or samples.
9. Existing run ownership is immutable during an upsert; client-supplied `run_id` cannot be used to claim another run.
10. API validation failures use stable status codes and machine-readable error codes; raw exception text, secrets, SQL, paths, and stack details never cross the API boundary.
11. Legacy response fields and identifiers remain present; additive error codes do not replace required fields.
12. Flask and TypeScript do not become simultaneous writers for the same metrics or filesystem domain.

## Rollback considerations

No data migration is required. A code rollback can restore the previous Flask release, but doing so also restores the previously identified ZIP and export vulnerabilities; rollback must therefore be treated as an emergency compatibility action with compensating edge controls.

Configuration changes should remain bounded and reviewed. Increasing a limit is not a substitute for disabling the controls, and production values should be tested against representative PRG32 bundles and firmware batches before changing the defaults.

The ownership change is intentionally fail-closed for anonymous run exports. If a client depends on the former public export behavior, the correct response is a versioned policy decision and compatibility review, not an unaudited bypass.

## Milestone boundary

M1.2a stops here. It does not begin M1.2b, implement rate limiting, change backup/restore behavior, add security headers, or start the Fastify migration.
