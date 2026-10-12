# API contract freeze and compatibility fixtures

This document freezes the existing public interfaces before the Next.js/TypeScript migration. Flask remains the compatibility authority during Phase 1. A future TypeScript implementation must preserve identifiers, legacy fields, status codes, binary bytes, authentication semantics, and WebSocket message behavior unless a versioned contract change is explicitly approved.

## Coverage matrix

| Contract area | Existing interface | Compatibility evidence |
| --- | --- | --- |
| Discovery | `GET /.well-known/prg32-store.json` | Discovery ABI, service URLs, port, and required keys are asserted by contract tests and the route reference |
| Catalog listing | `GET /api/games` | `ok`, `games`, pagination fields, stable game IDs, version and architecture arrays |
| Cartridge details | `GET /api/games/<id>` | `game` envelope, metadata/colophon ABI, variants, publisher, timestamps |
| Version selection | `version` and `?version=` catalog/detail/download behavior | Existing selected/latest/version fields remain additive and stable |
| Architecture selection | `architecture` query/body values, currently `esp32c6` and `qemu` | Architecture identifiers are stored values and are covered by multi-architecture fixtures |
| Binary downloads | `GET /api/games/<id>/download`, icon, screenshot, colophon routes | Response status, content type/disposition, architecture-specific SHA-256, PRG2 bytes, and metadata markers |
| Authentication | `/auth/*`, `/api/me`, `/auth/me`, session and Bearer/legacy token paths | Anonymous principal, registration completion, token lifecycle, and JSON auth error shape; credentials are never stored in fixtures |
| Publishing | `POST /api/publish`, `POST /api/publish/bundle` | Multipart package upload, pending status, submission ID, review-required and submitted architecture fields, invalid input envelopes |
| Review workflows | `/api/submissions*`, verify/reject endpoints, editor routes | Submission shape, protected access, status transitions, identity immutability, verify and reject responses |
| Statistics | `/api/stats/downloads`, `/api/stats/scores`, `/api/stats/runs` | Stable summary envelopes and empty isolated-database responses |
| Scoreboard | `GET/POST /api/scores` | Score list/write contract, Bearer token authentication, validation error, and authentication boundary; no real scores in fixtures |
| Metrics | `POST /api/runs`, `POST /api/metrics/batch`, run finish/detail/list/export routes | Receiver and report routes are covered by existing tests and isolated route checks |
| Multiplayer | `GET /api/multiplayer/status`, `WS /api/multiplayer` | Status JSON and a real Flask WebSocket test covering handshake, auth, join, state, invalid messages, leave, and close |
| Administration | `/admin/*`, backup and cartridge-management operations | Unauthenticated/unauthorized boundaries plus existing admin integration tests |

## Fixture policy

Fixtures use synthetic PRG32 metadata, deterministic in-memory ZIP uploads, 1x1 test PNG bytes, isolated temporary directories, and test-only database files. They contain no credentials, real user records, production cartridge artifacts, production database paths, or secrets. The existing test helper's default login exists only inside the test process and is not serialized into a fixture.

## Migration rules

1. Keep legacy response fields and identifiers; add optional fields rather than replacing them.
2. Preserve `prg32-metadata-1.0`, `prg32-colophon-1.0`, and `prg32-store-discovery-1.0`.
3. Preserve `esp32c6` and `qemu` architecture values.
4. Compare downloaded bytes and SHA-256 values before changing binary-serving code.
5. Compare authenticated and anonymous responses separately; never weaken a protected endpoint to make a frontend test pass.
6. Run the TypeScript implementation against the same isolated fixture inputs before considering a Flask route removable.

The detailed route inventory remains in [`ROUTES_REFERENCE.txt`](../../ROUTES_REFERENCE.txt). The executable compatibility tests are in `tests/test_api_contracts.py`, `tests/test_multiplayer_integration.py`, and the existing domain-specific tests under `tests/`. The fixture stores deterministic SHA-256 values per architecture; these hashes describe synthetic fixture output, not production artifacts.
