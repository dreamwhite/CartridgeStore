# PRG32 Cartridge Store — M6.3d.2b Settings API & Application Asset Management

**Status:** implemented in the isolated Fastify/TypeScript backend only.
**Date:** 2026-10-12

This milestone adds the first administrative settings boundary required by the
future Next.js frontend. Flask remains the authoritative production writer.
There are no Flask, firmware, companion-repository, deployment, SQLite schema,
or production-routing changes.

## Findings addressed

- The legacy `store_settings` inventory is now represented by one typed,
  allow-listed registry instead of being copied into a new settings model.
- Settings reads no longer expose SMTP, OIDC, or SAML values, including secret
  values. Unknown rows remain untouched in SQLite but are not serialized.
- Writes are restricted to the values that the isolated Fastify runtime can
  actually honor or safely hold for the future frontend.
- Browser mutations require an authenticated administrator session and a valid
  CSRF token. Bearer-only mutations are rejected.
- Logo and favicon uploads are bounded, type-checked, staged, atomically
  referenced from SQLite, and served only through controlled generated paths.
- Raw upload, filesystem, and database exception text is not returned by the
  settings routes. Rejection details are logged server-side with a request ID.

## API boundary

Implemented routes:

- `GET /api/admin/settings` — administrator with `settings:read`; bearer reads
  are allowed.
- `PATCH /api/admin/settings` — administrator with `settings:write`; browser
  session and CSRF required; writer isolation must be enabled.
- `POST /api/admin/settings/assets/logo` — administrator with
  `settings:assets:write`; browser session and CSRF required.
- `POST /api/admin/settings/assets/favicon` — same policy as logo.
- `GET /api/assets/logo` and `GET /api/assets/favicon` — public serving of the
  current managed asset.
- `GET /api/assets/:kind/:generated_filename` — public serving only when the
  filename is the currently referenced generated asset.

The PATCH body is a strict JSON object and accepts partial updates only for:

`store_name`, `store_tagline`, `store_contact_email`, `store_institution`,
`theme_primary_color`, `theme_secondary_color`, `theme_font_family`, and
`auth_allow_registration`.

Unknown, read-only, excluded, asset-managed, malformed, and invalid values
receive stable error codes. A multi-key patch is validated before its single
`BEGIN IMMEDIATE` transaction, so an invalid value cannot partially persist a
valid sibling value.

## Legacy settings classification

The exact 39-key legacy inventory is preserved in
`backend/src/settings/definitions.ts`:

- **Writable:** store identity (`store_name`, `store_tagline`,
  `store_contact_email`, `store_institution`), frontend theme primitives
  (`theme_primary_color`, `theme_secondary_color`, `theme_font_family`), and
  `auth_allow_registration`.
- **Read-only/effective projection:** `auth_require_email_domain`,
  `auth_default_role`, publishing limits/architecture policy, and mDNS
  discovery values. They are exposed only as effective values where the
  Fastify runtime can determine them; they are not presented as writable
  knobs.
- **Asset-managed:** `theme_logo_url` and `theme_favicon_url` are only changed
  by the corresponding upload route.
- **Deferred:** `theme_custom_css` is not exposed as an executable or writable
  setting.
- **Excluded:** SMTP, OIDC, and SAML values are not returned or accepted by
  this API. Fastify has no SMTP/federation implementation in this milestone;
  no credentials are copied into the TypeScript boundary.

This classification is deliberately narrower than the Flask setup form. It
does not claim runtime support that Fastify does not currently implement.

## Asset security and compatibility

- Maximum accepted upload size: **2 MiB**.
- Logo types: structurally validated PNG and JPEG.
- Favicon types: structurally validated PNG, JPEG, and ICO.
- SVG is rejected; no sanitizer is introduced.
- The multipart field is `asset`; client filenames are never used as storage
  paths.
- Files are written with mode `0600` to a private `.staging-*` file, flushed,
  renamed to a generated `logo-<32 hex>` or `favicon-<32 hex>` filename, and
  then referenced in the same SQLite transaction boundary.
- A failure after filesystem publication compensates the generated file and
  leaves the previous database reference active. Old active files are removed
  only after a successful commit, best effort.
- Serving rejects traversal, unexpected generated names, symlinks, and stale
  generated URLs. Legacy Flask `/static/custom/...` references are resolved
  only through the controlled store static directory for read compatibility.

## Security invariants for the future Fastify backend

1. The settings registry is the sole allow-list; no request key becomes a SQL
   key without registry classification.
2. Unknown, secret, deferred, and unsupported federation settings are never
   serialized into the administrative response.
3. Settings writes are administrator-only, browser-session-only, CSRF-protected,
   and disabled when the isolated writer is unavailable.
4. Every accepted setting is type-checked, length-bounded, and normalized
   before the transaction begins.
5. A multi-setting update is all-or-nothing under `BEGIN IMMEDIATE`.
6. Asset bytes are bounded before materialization, and accepted formats are
   allow-listed by content structure rather than filename or client MIME.
7. SVG is rejected unless a separately reviewed sanitizer is introduced.
8. Asset paths are server-generated, single-directory, non-symlink files; user
   filenames and arbitrary paths never enter filesystem resolution.
9. Asset publication and its active SQLite reference are compensated together
   on failure; stale cleanup cannot make a committed active reference invalid.
10. Public asset serving uses fixed content types, `nosniff`, and stable 404/503
    envelopes without filesystem exception leakage.
11. Stable error codes are returned externally; detailed causes stay in server
    logs and are never copied into response bodies.
12. The operational database is only read through the existing read boundary;
    the settings writer is the existing disposable/test auth writer.

## Files changed

Added:

- `backend/src/settings/definitions.ts`
- `backend/src/settings/schemas.ts`
- `backend/src/settings/service.ts`
- `backend/src/settings/routes.ts`
- `backend/tests/settings.test.ts`
- this report

Modified:

- `backend/src/app.ts` to construct the settings service and register routes.
- `docs/modernization/19-revised-migration-roadmap.md`.

No new dependency, table, index, migration, Flask route, Jinja template,
frontend feature, Docker production route, or companion-repository file was
introduced.

## Compatibility evidence

The tests use isolated SQLite and filesystem fixtures containing synthetic
settings, a synthetic administrator, a non-admin bearer token, and a
deterministic 1x1 PNG. They verify:

- protected GET and non-admin denial;
- secret/unknown-row redaction;
- valid persistence and restart visibility;
- invalid multi-key rollback;
- unknown/read-only/excluded/asset-managed rejection;
- CSRF and bearer-only mutation rejection;
- writer-disabled behavior;
- valid asset serving, SVG rejection, 2 MiB rejection, replacement, stale URL
  rejection, and failed-publication rollback.

Verification evidence from the final pass:

- `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run check` in
  `backend/`: **passed** — TypeScript typecheck, ESLint, 17 Vitest files / 95
  tests, and TypeScript build.
- `source "$HOME/.nvm/nvm.sh" && nvm use 24 && pnpm run check` in
  `frontend/`: typecheck, ESLint, and 2 Vitest files / 5 tests **passed**;
  the first build attempt correctly failed because `FLASK_PROXY_TARGET` was
  absent; `FLASK_PROXY_TARGET=http://flask:5080 pnpm run build` then **passed**.
- `docker compose config` and
  `docker compose --profile dev --profile writer --profile writer-init config`:
  **passed**. The resolved development routes remain
  `api.prg32.dream.test` -> Flask and `store.prg32.dream.test` -> Next.js,
  with the existing external Traefik network.
- Local backend verification used Node 24.20.0 and pnpm 12.5.1 via `nvm use
  24`; the backend dev multistage image build **passed**. Flask production
  image build
  `docker build -t prg32-cartridge-store:local .`: **passed**.
- Disposable Docker HTTP E2E using unique writer volume names:
  **passed** for health, anonymous 401, admin bootstrap, settings GET, invalid
  CSRF 403, valid PATCH persistence, asset upload, and byte-identical public
  asset serving. The disposable containers and volumes were removed.
- Flask regression under a temporary Python 3.13 virtualenv:
  **63 passed, 1 failed**. The failure is the existing
  `test_mdns_registers_prg32_service`, which calls `create_app` with
  `TESTING=False` and no `SECRET_KEY`; it fails at the existing Flask secret
  requirement before the mDNS assertion. The repository `.venv` was not
  modified and no Flask behavior was changed.
- `python3 -m py_compile app.py cartridge_store/*.py`: **passed**.
- `git diff --check`: **passed**.

## Remaining risks and rollback

- The legacy Flask settings form and asset routes remain in place and are not
  converted to call this service. Production authority therefore remains
  Flask, as required by the migration boundary.
- The Fastify settings API is disposable/test-writer only and is not a
  production cutover.
- SMTP, federation, custom CSS, dynamic mDNS, and frontend theme consumption
  remain deferred.
- The repository's Python 3.9 virtual environment still lacks
  `hashlib.scrypt`; a temporary Python 3.13 environment was used for the
  final regression attempt. One pre-existing mDNS test still omits the secret
  required by the current Flask startup policy.
- The current response is intentionally an administrative API foundation, not
  a Next.js settings UI.

Rollback is limited to disabling/removing the isolated Fastify registration;
the legacy Flask settings and asset storage remain untouched. Generated test
assets are disposable and do not require a database migration rollback.

## Next milestone

Stop after M6.3d.2b. The next separately authorized milestone is M6.3d.2c:
users, groups, roles, final-administrator protection, and session/token security
transitions. It must not be started automatically by this implementation.
