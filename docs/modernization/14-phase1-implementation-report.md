# Phase 1 implementation report

Date: 2026-10-12

## Outcome

The initial Phase 1 report is superseded by
[`15-m0-remediation-report.md`](15-m0-remediation-report.md). The existing
Flask service remains unchanged as the compatibility authority, and the new
frontend foundation is Next.js App Router with TypeScript. Flask has not been
deleted because full backend parity, database compatibility, authentication,
binary behavior, and TypeScript WebSocket migration are not yet proven.

## Backend baseline

- Dependencies were installed only in the ignored `.venv313/` environment using `requirements.txt`.
- `SECRET_KEY=phase1-test-secret .venv313/bin/python -m pytest -q` passed: **48 passed** before remediation; the current remediated suite passes **53 tests**.
- `python3 -m py_compile app.py cartridge_store/*.py` passed.
- The initial Python 3.9.6 environment was not used for the final result because Werkzeug password hashing requires `hashlib.scrypt`, which that interpreter build does not provide. This is recorded as an environment issue, not fixed by changing authentication behavior.
- No production data, database, authentication configuration, or application behavior was changed.

## API contract coverage

`docs/modernization/13-api-contracts.md` freezes the public route areas and migration rules. `tests/fixtures/api_contracts.json` contains synthetic field/ABI/architecture expectations. `tests/test_api_contracts.py` exercises isolated discovery, catalog listing/detail, version and architecture selection, binary download markers, authentication boundaries, publishing/review access, statistics, scoreboard access, metrics ingestion/export, and multiplayer status. Existing tests continue to cover deeper publishing, review, auth, admin, score, metrics, and service behavior.

Fixtures use temporary data directories and synthetic cartridge/PNG bytes. No credentials, real users, production databases, or production cartridge files are serialized.

## Frontend foundation

`frontend/` contains:

- Next.js 16 App Router, React, and strict TypeScript;
- TanStack Query provider and Zustand theme store;
- Tailwind CSS and a minimal shadcn/ui-style button primitive;
- API client with same-origin credentials and normalized errors;
- application shell, providers, root error boundary, shared styles, and environment example;
- ESLint, Vitest, React Testing Library, npm scripts, and `package-lock.json`.

No storefront, catalog feature, Flask business logic duplicate, Drizzle ORM, or production route was added.

## Development workflow

1. Start Flask with its normal development configuration on port 5080.
2. In `frontend/`, run `npm ci` and `npm run dev`.
3. Browse `http://127.0.0.1:3000`. HTTP API paths are rewritten to `FLASK_PROXY_TARGET`, defaulting to `http://127.0.0.1:5080`.
4. Keep multiplayer WebSockets on `ws://127.0.0.1:5080/api/multiplayer` until a WebSocket-capable proxy is introduced.

The smoke test confirmed the Next page, proxied `/api/games`, proxied discovery, and the Flask multiplayer info route. Existing Jinja routes remain served by Flask and were not modified.

The Traefik profile was also built and started against the existing external
`dream_edge` network. HTTPS requests with the configured local certificate
returned 200 for `store.prg32.dream.test`, `api.prg32.dream.test`, and
`/api/multiplayer/status`. The stack was stopped after verification; named
development volumes were retained.

Production image preparation now uses multi-stage builds: `Dockerfile` keeps
dependency installation in a separate Python stage and uses
`requirements.runtime.txt`, while `frontend/Dockerfile` emits a Next.js
standalone runtime with no npm toolchain. Both images were built and started
successfully in isolated smoke tests.

## Remaining risks

- Flask is still required; its replacement is a future migration, not part of M0.
- Next.js development rewrites are HTTP-only, so browser WebSockets use the
  direct Traefik API hostname (`wss://api.prg32.dream.test/api/multiplayer`)
  until a same-origin WebSocket strategy is deliberately added.
- The Next frontend has no catalog/auth/publish features yet by design.
- TypeScript backend work must preserve SQLite/file-store semantics, auth/session/token behavior, PRG32 binary bytes, mDNS/discovery fields, CSV/Markdown exports, admin protections, and the multiplayer protocol.
- The frontend test command emits a non-failing ESM config-loader warning; npm also reports an ESLint 9 deprecation warning.

## Next milestone

M1: close the documented security blockers. In parallel, design the first TypeScript backend shadow slice around read-only discovery/catalog responses, compare it against Flask using the frozen fixtures, and keep Flask as the rollback path until parity is demonstrated.
