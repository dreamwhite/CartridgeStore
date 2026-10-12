# M6.3d.1 — Admin & Settings Discovery, Compatibility & Security Audit

**Date:** 2026-10-12
**Status:** assessment complete; no application implementation started
**Operational backend:** Flask remains authoritative and sole production writer
**Frontend:** Next.js foundation only; no administrative feature consumer
**Next milestone:** M6.3d.2, only after the decisions in section 21

## 1. Executive summary

This assessment reconstructed the remaining Flask administration and
application-settings surface from the registered Flask route map, source
modules, templates, tests, the current Fastify backend, the Next.js source, and
the read-only companion repository `../PRG32`.

The audited Flask surface contains **67 distinct route rules** and **69
method-path bindings** when the route aliases for delete/form operations are
counted separately. The default Flask application conditionally adds five
additional federation route rules only when OIDC or SAML is configured and the
optional dependency is installed.

Using route-rule parity as the counting basis:

| Classification | Count | Meaning |
| --- | ---: | --- |
| Fully implemented in Fastify | 34 | Same underlying capability and route family verified in the isolated backend; production cutover is not implied |
| Partial or intentional difference | 10 | Route exists or operation exists, but HTML/API shape, legacy alias, or approved security behavior differs |
| Missing from Fastify | 23 | No equivalent implementation was found |
| Explicitly excluded conditional routes | 5 | OIDC/SAML adapter routes; not active by default and excluded by approved architecture decisions |

The largest gap is not public firmware compatibility. It is the complete
administrative mutation surface: settings, users, groups, roles, direct
catalog metadata edits, and catalog deletion. Fastify already has isolated
submission/review/publication foundations and M6.3c.2 backup/restore, but it
does not yet expose the missing administrative APIs.

The Next.js frontend contains only the migration foundation, theme state, a
typed generic API client, discovery validation, and catalog foundation types.
There are no settings forms, admin user/group screens, review screens, upload
management screens, statistics pages, or administrative TanStack Query hooks.

The companion repository has no discovered calls to Flask administration,
settings, user management, review, backup/restore, or statistics routes. It
does have active dependencies on discovery, catalog, binary download, bundle
publishing, score ingestion, and metrics ingestion. Those firmware/tool
contracts must remain unchanged.

**Recommendation:** GO for a separately approved, disposable-only M6.3d.2
implementation after the product decisions in section 21. NO-GO for public
Fastify administration, operational SQLite/filesystem writes, dual writers,
Flask retirement, or production routing changes.

## 2. Sources and evidence inspected

### Modernization and architecture documents

- `docs/modernization/19-revised-migration-roadmap.md`
- `docs/modernization/40-m6-3-discovery-and-implementation-plan.md`
- `docs/modernization/41-m6-3a-statistics-parity-report.md`
- `docs/modernization/42-m6-3b-sqlite-capacity-resilience-report.md`
- `docs/modernization/43-m6-3c1-backup-restore-architecture-audit.md`
- `docs/modernization/44-m6-3c2-application-backup-restore-report.md`
- `docs/modernization/13-api-contracts.md`
- `docs/modernization/18-typescript-backend-migration-assessment.md`
- `docs/modernization/24-m4-1-authentication-foundation-report.md`
- `docs/modernization/25-m4-3-authentication-security-audit.md`
- `docs/modernization/26-m4-4-write-isolation-remediation-report.md`
- `docs/modernization/27-m4-5-trusted-write-boundary-report.md`
- `docs/modernization/29-m5-a-cross-repository-architecture-audit.md`
- `docs/modernization/30-m5-a-client-api-traceability.md`
- `docs/modernization/31-m5-a-sqlite-schema-assessment.md`
- `docs/modernization/34-m5-2b-review-publication-parity-report.md`
- `docs/modernization/35-m6-1-metrics-runs-samples-report.md`
- `docs/modernization/38-m6-2b-anonymous-score-ingestion-adr.md`
- `docs/modernization/39-m6-2b-anonymous-scores-report.md`

### Flask source and tests

- `cartridge_store/app.py`
- `cartridge_store/auth/__init__.py`
- `cartridge_store/auth/oidc_adapter.py`
- `cartridge_store/auth/saml_adapter.py`
- `cartridge_store/auth/ldap_adapter.py`
- `cartridge_store/settings.py`
- `cartridge_store/users.py`
- `cartridge_store/review.py`
- `cartridge_store/store.py`
- `cartridge_store/metrics.py`
- `cartridge_store/scores.py`
- `cartridge_store/stats.py`
- `cartridge_store/database.py`
- templates `setup.html`, `admin_users.html`, `admin_groups.html`,
  `admin_roles.html`, `admin_cartridges.html`, `admin_backup.html`,
  `editor_submissions.html`, `editor_submission.html`, `auth_tokens.html`,
  `publish.html`, `stats.html`, and related base/auth templates
- `tests/test_api.py`, `tests/test_services.py`,
  `tests/test_api_contracts.py`, `tests/test_security_m1_1.py`,
  `tests/test_security_m1_2a.py`, and review/publication tests

The Flask route map was loaded from the actual application with a test secret
and inspected directly. This avoids treating source comments or old
documentation as proof of an active route.

### Fastify and Next.js source

- `backend/src/app.ts`
- `backend/src/auth/routes.ts`, `service.ts`, `principal.ts`, `tokens.ts`
- `backend/src/catalog/routes.ts`, `catalog.ts`
- `backend/src/submission/routes.ts`, `service.ts`
- `backend/src/review/routes.ts`, `service.ts`
- `backend/src/consistency/publication.ts`
- `backend/src/metrics/routes.ts`, `service.ts`
- `backend/src/scores/routes.ts`, `service.ts`
- `backend/src/stats/routes.ts`, `service.ts`
- `backend/src/backup/routes.ts`, `service.ts`, `format.ts`
- `backend/src/db/schema.ts`, `readonly.ts`, `schema-inspection.ts`
- `frontend/next.config.ts`
- `frontend/src/lib/api/client.ts`, `contracts.ts`, `schemas.ts`
- all current files under `frontend/src/app`, `frontend/src/components`,
  `frontend/src/providers`, and `frontend/src/stores`

### Companion repository

The read-only inspection covered the local `../PRG32` repository, including:

- `prg32/store/store_api.py`
- `prg32/store/publish.py`
- `components/prg32/prg32_http_scores.c`
- `components/prg32/prg32_metrics.c`
- `components/prg32/prg32_setup_store.c`
- `docs/cartridge_store/cartridge_store.md`
- `docs/measurement/metrics_api.md`
- related tests, scripts, and endpoint documentation

No companion-repository file was modified.

## 3. Counting method and status vocabulary

The inventory counts a Flask `Rule` separately when Flask registers separate
rules for a method alias, such as `DELETE /admin/users/<id>` and
`POST /admin/users/<id>/delete`. This preserves the actual browser/API surface
without pretending that aliases are separate business capabilities.

The 67 base rules are grouped as follows:

| Domain | Flask rules |
| --- | ---: |
| Administration, including backup | 18 |
| Application settings and custom assets | 4 |
| Authentication, registration, sessions, tokens | 17 |
| Publishing/upload entry points | 4 |
| Review and submission moderation | 8 |
| Metrics/runs | 8 |
| Scores | 3 |
| Statistics | 5 |
| **Total** | **67** |

“Fully implemented” means that the underlying Fastify operation was located
and tested in the isolated backend. It does not mean that the route is
authorized for production or that Flask and Fastify may write the same store
simultaneously. “Partial” includes explicit architectural differences and
legacy HTML aliases. “Missing” means no equivalent Fastify capability was
found.

## 4. Complete Flask administrative and settings route inventory

### 4.1 Application settings and custom assets — 4 rules

| Method and exact path | Behavior, input/output, security, effects | Fastify / consumer / status |
| --- | --- | --- |
| `GET /setup` | Admin session; renders `setup.html`; reads all `DEFAULT_SETTINGS`; no direct filesystem mutation | No Fastify route; no Next.js consumer; missing backend capability, HTML retirement candidate |
| `POST /setup` | Admin + browser CSRF; form fields for every default setting; redirect and flash; upserts `store_settings` one key at a time | No Fastify route; no consumer; missing and high-risk write surface |
| `POST /setup/logo` | Admin + CSRF; multipart `logo`; accepts PNG/JPEG/SVG up to 2 MiB; writes `data/static/logo.<ext>` and updates `theme_logo_url` | No Fastify route; no consumer; missing |
| `POST /setup/favicon` | Same as logo with `favicon`; writes `data/static/favicon.<ext>` and updates `theme_favicon_url` | No Fastify route; no consumer; missing |

`setup_save` persists the known settings as strings with minimal field
validation. The settings table is initialized in a `before_request` hook, so a
nominally read request can perform idempotent DDL.

### 4.2 Users, groups, roles, cartridges, and backup — 18 rules

| Method and exact path | Behavior and effects | Fastify / status |
| --- | --- | --- |
| `GET /admin/users` | Admin-only HTML list, fixed page size 50; reads users, groups, roles | No route; missing |
| `POST /admin/users` | Admin + CSRF; form username/email/password/role/groups; inserts `users`, then updates groups; redirect | No route; missing |
| `POST /admin/users/<int:user_id>` | Admin + CSRF; updates username/email/role and optional password, then groups; redirect | No route; missing |
| `POST /admin/users/<int:user_id>/role` | Admin + CSRF; changes role; self-demotion rejected; redirect | No route; missing |
| `POST /admin/users/<int:user_id>/groups` | Admin + CSRF; replaces group memberships from form; redirect | No route; missing |
| `DELETE /admin/users/<int:user_id>` | Admin + CSRF; deletes user; self-delete rejected; JSON `{ok}` | No route; missing |
| `POST /admin/users/<int:user_id>/delete` | HTML alias for the same delete; redirect | No route; missing |
| `GET /admin/groups` | Admin-only HTML list and user counts | No route; missing |
| `POST /admin/groups` | Admin + CSRF; creates group with `INSERT OR IGNORE`; redirect | No route; missing |
| `POST /admin/groups/<int:group_id>` | Admin + CSRF; renames group; redirect | No route; missing |
| `DELETE, POST /admin/groups/<int:group_id>/delete` | Admin + CSRF; removes memberships then deletes any non-`editors` group; JSON `{ok}` for DELETE and redirect for POST | No route; missing |
| `GET /admin/roles` | Admin-only role levels and counts; read-only HTML | No route; missing |
| `GET /admin/cartridges` | Authenticated admin or `editors` group; renders catalog management | No route; missing |
| `POST /admin/cartridges/<game_id>/<version>` | Admin or editor + CSRF; updates title/summary/tags in filesystem `index.json`; redirect | No route; missing; must reuse publication lock/journal boundary |
| `DELETE, POST /admin/cartridges/<game_id>/<version>/delete` | Admin or editor + CSRF; deletes one architecture or complete version and rewrites index; JSON for DELETE and redirect for POST | No route; missing; destructive filesystem operation |
| `GET /admin/backup` | Admin-only HTML page for download/restore | M6.3c.2 provides API routes only; Next.js should replace this page |
| `GET /admin/backup/download` | Admin-only archive download | Fastify equivalent; implemented in disposable mode, disabled by default |
| `POST /admin/backup/restore` | Admin + CSRF multipart upload; Flask destructively replaces data children and database | Fastify staged/recoverable implementation; route exists only when explicitly disposable-enabled |

The table contains 18 Flask rules because delete aliases are registered as
separate rules. The two backup API rules are the only rules in this family
already implemented in Fastify.

### 4.3 Authentication, registration, sessions, and tokens — 17 rules

| Method and exact path | Actual Flask behavior | Fastify status |
| --- | --- | --- |
| `GET /auth/csrf` | Returns session CSRF token, no-store | Fully implemented; same-purpose API |
| `POST /auth/bootstrap` | One-time header secret; validates account; transactionally creates first admin, `editors` membership, and bootstrap marker; starts session | Fully implemented in isolated auth writer |
| `GET /auth/register` | Renders registration HTML | JSON route descriptor only; partial and HTML retirement candidate |
| `POST /auth/register` | CSRF-protected anonymous registration request; reads settings; stores hashed registration token; sends email when configured | Foundation implemented; email delivery remains a non-production/test concern |
| `GET /auth/register/complete` | Validates token and renders password form | JSON route descriptor only; partial |
| `POST /auth/register/complete` | CSRF-protected token completion; creates local user, consumes token, starts session | Foundation implemented; role/default differences require a decision |
| `GET /auth/login` | Renders login HTML | JSON route descriptor only; partial |
| `POST /auth/login` | CSRF-protected local login; updates `last_login`; starts session or redirects | Fully implemented API foundation |
| `POST /auth/logout` | Login-required, CSRF-protected; clears session; JSON or redirect | Fully implemented API foundation |
| `GET /auth/me` | Login-required JSON principal | Fully implemented |
| `GET /api/me` | Same principal response through the auth route surface | Fully implemented |
| `GET /auth/tokens` | Login-required token list as JSON or HTML | JSON operation fully implemented; HTML presentation is a legacy retirement candidate |
| `POST /auth/tokens` | Login-required, CSRF-protected; creates token, returns cleartext once | Fully implemented API operation |
| `PATCH /auth/tokens/<int:token_id>` | Login-required, CSRF-protected, owner-constrained label update | Fully implemented |
| `POST /auth/tokens/<int:token_id>/update` | HTML form alias for label update and flash redirect | Exact alias missing; underlying operation exists |
| `DELETE /auth/tokens/<int:token_id>` | Login-required, owner-constrained revoke; JSON `{ok}` | Fully implemented |
| `POST /auth/tokens/<int:token_id>/revoke` | HTML form alias for revoke and flash redirect | Exact alias missing; underlying operation exists |

Bearer/API-token authentication is distinct from browser session authentication.
Flask bypasses browser CSRF for bearer-only requests, while session mutations
require the global CSRF hook. Fastify preserves this boundary for isolated APIs.

### 4.4 Publishing and upload entry points — 4 rules

| Method and exact path | Actual behavior | Fastify status |
| --- | --- | --- |
| `GET /publish` | Login-required HTML upload page | Missing Fastify page; Next.js replacement candidate |
| `POST /publish` | Login-required multipart form; creates pending submission; flash redirect | Underlying disposable submission operation implemented |
| `POST /api/publish` | Login-required legacy multipart endpoint; returns pending JSON plus `legacy_endpoint` | Implemented with preserved legacy marker |
| `POST /api/publish/bundle` | Login-required multipart bundle endpoint; returns submission result | Implemented and consumed by PRG32 host tooling |

### 4.5 Review and publication moderation — 8 rules

| Method and exact path | Actual behavior | Fastify status |
| --- | --- | --- |
| `GET /editor/submissions` | `editors` group; optional status filter; HTML list | Equivalent isolated route with minimal generated HTML; presentation partial |
| `GET /editor/submissions/<int:submission_id>` | `editors` group; HTML detail | Equivalent isolated route; presentation partial |
| `POST /editor/submissions/<int:submission_id>/verify` | `editors` group + CSRF; editable metadata form; publishes/rebuilds cartridge; redirect | Underlying operation implemented with journal; HTML partial |
| `POST /editor/submissions/<int:submission_id>/reject` | `editors` group + CSRF; marks rejected, removes pending files; redirect | Underlying operation implemented with recovery journal; HTML partial |
| `GET /api/submissions` | `editors` group; status-filtered JSON list | Fully implemented in isolated Fastify review service |
| `GET /api/submissions/<int:submission_id>` | `editors` group; JSON detail or 404 | Fully implemented |
| `POST /api/submissions/<int:submission_id>/verify` | `editors` group + session CSRF or bearer; JSON metadata update and publication result | Fully implemented in isolated writer |
| `POST /api/submissions/<int:submission_id>/reject` | `editors` group + CSRF/bearer policy; JSON result | Fully implemented in isolated writer |

Flask review requires the `editors` group even for an admin without that group.
Cartridge administration separately accepts admin or editors and must not be
merged with review authorization.

### 4.6 Metrics/runs — 8 rules

| Method and exact path | Actual behavior | Fastify status |
| --- | --- | --- |
| `GET /api/metrics` | Public endpoint index | Fully implemented |
| `POST /api/runs` | Firmware-compatible run upsert; nullable ownership | Fully implemented with limits |
| `POST /api/metrics/batch` | Bounded scalar samples, duplicate-frame suppression, dropped count | Fully implemented with limits and stable errors |
| `POST /api/runs/<run_id>/finish` | Finish timestamp and monotonic dropped count | Fully implemented |
| `GET /api/runs` | Anonymous empty list; admin all; user-owned runs | Fully implemented with owner/admin policy |
| `GET /api/runs/<run_id>` | Owner/admin detail; optional JSON download form | Fully implemented |
| `GET /api/runs/<run_id>/samples.csv` | Owner/admin CSV export | Fully implemented |
| `GET /api/runs/<run_id>/report.md` | Owner/admin Markdown export | Fully implemented |

These are not new M6.3d features. The administrator list remains the M6.3b
scalability concern: the grouped runs/samples query materializes work
proportional to historical runs and samples. No optimization or index change
is authorized in M6.3d.1.

### 4.7 Scores — 3 rules

| Method and exact path | Actual behavior | Fastify status |
| --- | --- | --- |
| `GET /api/scores` | Public ordered JSON list with optional game/player and bounded limit | Fully implemented |
| `POST /api/scores` | Flask requires login; anonymous firmware-shaped requests are rejected; browser session requires CSRF | Fastify has approved isolated anonymous-ingestion difference; partial/intentional |
| `GET /scores` | Public server-rendered leaderboard HTML | Missing Fastify; HTML retirement/product decision required |

The score endpoint is a compatibility boundary with the companion firmware and
must not be silently changed during admin migration.

### 4.8 Statistics — 5 rules

| Method and exact path | Actual behavior | Fastify status |
| --- | --- | --- |
| `GET /api/stats/downloads` | Public downloads series/total/top-games with date/granularity/limit filters | Fully implemented in M6.3a |
| `GET /api/stats/downloads/<game_id>` | Public per-game totals, architectures, and series | Fully implemented |
| `GET /api/stats/scores` | Public ordered score aggregate | Fully implemented |
| `GET /api/stats/runs` | Public run aggregate | Fully implemented |
| `GET /stats` | Public Flask-rendered charts/dashboard | Missing Fastify; Next.js replacement candidate |

The public aggregates must remain non-identifying. No statistics mutation or
retention job was found.

### 4.9 Conditional federation routes — 5 explicitly excluded rules

The source contains conditional registrations for:

- `GET /auth/oidc/login`
- `GET /auth/oidc/callback`
- `GET /auth/saml/login`
- `POST /auth/saml/acs`
- `GET /auth/saml/metadata`

They are absent from the default route map because the adapters return early
unless enabled, configured, and backed by optional dependencies. OIDC and SAML
are explicitly excluded from the approved target architecture. LDAP has no
interactive route: its adapter only logs that interactive LDAP login is not
enabled when configured.

## 5. Next.js frontend consumption audit

### Verified current consumers

The current Next.js source has no administrative feature consumer. The only
runtime API helpers found are:

| Frontend source | Calls / dependency | Current status |
| --- | --- | --- |
| `frontend/src/lib/api/client.ts` | Generic `requestJson`, discovery, CSRF, `GET /api/games` | Foundation only |
| `frontend/src/lib/api/contracts.ts` and `schemas.ts` | Principal, error, CSRF, catalog, discovery types/schemas | Types only; no admin UI |
| `frontend/next.config.ts` | Rewrites `/api`, `/auth`, `/admin`, `/editor`, `/users`, `/publish`, `/setup`, `/scores`, `/stats`, `/static`, manifest and discovery to `FLASK_PROXY_TARGET` | Proxy compatibility, not feature consumption |
| `frontend/src/app`, `components`, `providers`, `stores` | Foundation shell, theme state, QueryClient provider | No admin calls, hooks, forms, or mutations |

Searches for `fetch`, TanStack Query hooks/mutations, Zustand API stores,
settings, users, groups, review, upload, backup, stats, and admin call sites
found no feature-level consumer. Therefore there are no current Next.js
request payloads, response schemas, CSRF flows, loading states, or error
handling to preserve for administration.

### Implicit Flask dependencies

The proxy configuration preserves paths that would expose Flask behavior if a
browser navigated to them, but the Next.js application does not render the
corresponding pages. Legacy behavior still available only through Flask/Jinja
includes HTML redirects, signed Flask session cookies, Flask CSRF tokens,
multipart forms, flash messages, and Jinja-rendered admin/review/statistics
pages.

M6.3d.2 should add JSON contracts and Next.js consumers deliberately. It should
not copy Flask templates or create a second competing server-rendered admin
surface.

## 6. Firmware and external-client compatibility

No firmware or host-tool call site was found for administration, settings,
users, groups, roles, review, backup/restore, or statistics. The verified
active dependencies are:

| Client | Exact dependency | Classification |
| --- | --- | --- |
| Host CLI `prg32.store.store_api.store_discover` | mDNS `_prg32store._tcp.local.` then `GET /.well-known/prg32-store.json`; validates discovery ABI | Active host-tool contract |
| Host CLI `store_list` | `GET /api/games?limit=100` | Active host-tool contract |
| Host CLI `store_download` | `GET /api/games/<id>/download?architecture=...&version=...`; streams binary | Active host-tool contract |
| Host CLI `publish` / `publish_bundle` | `POST /api/publish/bundle`, multipart `bundle`, optional Bearer token; expects pending/published fields | Active host-tool contract |
| PRG32 firmware score client | `POST /api/scores` with `game`, `player`, `score`; no credential | Conditional firmware contract; M6.2b approved isolated difference |
| PRG32 firmware metrics client | `POST /api/runs`, `POST /api/metrics/batch`, `POST /api/runs/<run_id>/finish`; no credential | Active firmware contract |
| Board-local HTTP server | `/api/runtime`, `/api/performance.json`, board-local `/api/games` and multiplayer routes | Separate device API; never route to Cartridge Store admin/settings |

The score client uses bounded C fields and no idempotency key. The metrics
client uses a bounded ring queue but can generate long-lived historical server
data. No companion changes are authorized.

## 7. Flask-to-Fastify capability matrix

| Capability | Flask reference | Fastify evidence | Status / migration decision |
| --- | --- | --- | --- |
| Local auth, sessions, CSRF | `cartridge_store/auth/__init__.py` | `backend/src/auth/routes.ts`, `service.ts`, `session.ts`, auth tests | Foundation implemented in disposable writer; verify differential behavior before cutover |
| Registration/bootstrap | Flask auth routes and `registration_tokens` | Fastify auth service/routes | Implemented with isolated write gate; email delivery is not operationally complete |
| User listing/creation/update/delete | `app.py` admin routes | No admin service/routes | Missing |
| Role and group administration | `app.py`, `auth/__init__.py` | No admin service/routes | Missing; invariants must be frozen first |
| Per-user API tokens | Flask token routes | Fastify token routes/service | JSON operations implemented; HTML aliases/presentation partial |
| OIDC/SAML/LDAP | Optional adapters | No adapters | Explicitly excluded; do not reintroduce |
| Settings read/write | `settings.py`, `/setup` | No settings route/service | Missing |
| Custom logo/favicon | `/setup/logo`, `/setup/favicon` | No asset admin route | Missing |
| Bundle submission | `publish`, `/api/publish*` | `backend/src/submission/` | Implemented isolated; writer disabled by default |
| Review list/detail/approve/reject | `review.py` | `backend/src/review/`, `consistency/publication.ts` | API and recovery implemented isolated; HTML minimal/partial |
| Direct catalog metadata editing | `GameStore.update_metadata` | No equivalent admin route | Missing; reuse publication lock/reconciliation |
| Direct catalog deletion | `GameStore.delete_variant` | No equivalent admin route | Missing; destructive and high risk |
| Backup download/restore | `app.py` backup helpers | `backend/src/backup/` | Implemented isolated in M6.3c.2; disabled by default |
| Metrics/run APIs | `metrics.py` | `backend/src/metrics/` | Implemented isolated; do not duplicate |
| Score API | `scores.py` | `backend/src/scores/` | Implemented with approved isolated anonymous-ingestion difference |
| Statistics APIs | `stats.py` | `backend/src/stats/` | Implemented read-only in M6.3a |
| Flask HTML statistics page | `/stats` | None | Missing; Next.js retirement candidate |
| Flask HTML admin pages | `/setup`, `/admin/*`, auth/review/publish pages | None as Next.js pages | Missing as UI, but pages should not be copied blindly |

The Fastify app registers isolated domains in `backend/src/app.ts`, but writer
flags and disposable mount boundaries remain authoritative. A route path alone
is not evidence of production parity.

## 8. Settings storage and configuration model

### Verified application settings

Flask stores settings in `store_settings(key TEXT PRIMARY KEY, value TEXT NOT
NULL)`. Values are serialized as strings. Defaults are defined in
`cartridge_store/settings.py`; missing keys resolve to defaults without being
materialized until a write. `init_settings_db()` executes idempotent DDL from a
`before_request` hook. `set_setting()` commits each key separately and clears
the in-process theme cache.

The 39 known keys are:

| Group | Keys and defaults/validation observed | Sensitivity / runtime impact |
| --- | --- | --- |
| Identity | `store_name` (`PRG32 Cartridge Store`), `store_tagline` (empty), `store_contact_email` (empty), `store_institution` (empty) | Public branding; `store_name` affects discovery/mDNS display |
| Theme | `theme_primary_color` (`#1a73e8`), `theme_secondary_color` (`#174ea6`), `theme_font_family` (`system-ui, sans-serif`), `theme_logo_url` (empty), `theme_favicon_url` (empty), `theme_custom_css` (empty) | Public presentation; custom CSS/assets require review |
| Registration/auth | `auth_allow_registration` (`true`), `auth_require_email_domain` (empty), `auth_default_role` (`user`) | Security policy; current form permits `user` or `admin` default |
| Publishing | `publish_require_auth` (`true`), `publish_max_bundle_mb` (`64`), `publish_allowed_architectures` (`qemu,esp32c6`) | Upload/auth policy; values are strings with limited validation |
| Discovery/mDNS | `mdns_enabled` (`true`), `mdns_name` (empty), `mdns_type` (`_prg32store._tcp.local.`), `mdns_port` (`5080`) | Public discovery; changes can break firmware discovery |
| SMTP | `smtp_host` (empty), `smtp_port` (`587`), `smtp_from` (`noreply@localhost`), `smtp_user` (empty), `smtp_password` (empty), `smtp_tls` (`true`) | Sensitive credentials; environment overrides DB |
| OIDC | `oidc_enabled` (`false`), `oidc_issuer` (empty), `oidc_client_id` (empty), `oidc_client_secret` (empty), `oidc_scope` (`openid email profile`) | Sensitive/provider config; excluded from target migration |
| SAML | `saml_enabled` (`false`), `saml_entity_id` (empty), `saml_acs_url` (empty), `saml_sls_url` (empty), `saml_idp_entity_id` (empty), `saml_idp_sso_url` (empty), `saml_idp_slo_url` (empty), `saml_idp_x509cert` (empty) | Sensitive/provider config; excluded from target migration |

### Deployment configuration, not application settings

The following must remain outside any future admin settings API unless a later
decision explicitly changes the boundary: Flask `SECRET_KEY`, Fastify session
secret and writer enablement, bootstrap token, database/data-root paths,
listening address/port, Docker/Traefik routing, proxy trust, cookie security,
backup encryption passwords/key policy, and SMTP/OIDC/SAML environment
overrides.

The current Flask implementation can read provider/SMTP secrets from
environment variables and can also persist them in `store_settings`. This is a
legacy compatibility fact, not approval to expose or migrate those secrets.

## 9. Sensitive settings and backup handling

The database can contain password hashes, API-token hashes, registration-token
hashes, user identifiers, roles, groups, external-provider identifiers, SMTP
password/provider configuration, score/run/metric/download data, and catalog
submission metadata/filesystem references.

M6.3c.2 v2 backup intentionally includes SQLite, so it can contain all of the
above. Optional archive encryption is AES-256-GCM with random salt/nonce and
scrypt; the password is not stored or logged. Restore can replace application
settings because it restores the database snapshot. There is currently no
redaction or selective secret reinjection policy.

Required future contract:

1. settings reads return a typed allow-listed public/admin projection;
2. secret fields return presence metadata or a redacted marker, never plaintext;
3. secret updates are write-only and distinguish omitted from explicit clear;
4. logs must not include request bodies, secret values, token cleartext, or
   backup passwords;
5. backup/restore authorization is separate from ordinary settings access;
6. environment-only deployment secrets are not overwritten by settings restore
   without explicit operator action.

## 10. User and role administration

### Verified current model

SQLite relationships are:

- `users` with unique username/email and nullable password for external users;
- `api_tokens.user_id -> users.id ON DELETE CASCADE`;
- `groups` with unique names;
- `user_groups.user_id/group_id` composite key, both cascading;
- `registration_tokens` with unique token hash and expiration/used fields;
- `runs.user_id -> users.id` nullable;
- `cartridge_submissions.submitted_by_user_id` and
  `reviewed_by_user_id` nullable with `ON DELETE SET NULL`.

Roles and levels are `reader=0`, `user/player=1`, `publisher=2`,
`admin=3`. Flask `admin_required` requires admin role level. Review requires
membership in `editors`; cartridge administration allows admin or editors. The
first bootstrap admin is also added to `editors`.

### Verified protections and gaps

- Flask blocks self-demotion and self-deletion from admin user routes.
- Flask does not enforce “cannot remove the final administrator”.
- Flask does not invalidate all sessions or tokens on password/role change or
  deletion beyond foreign-key token cascade on deletion.
- User update commits user fields before group replacement, so the logical
  operation is not one transaction.
- Group deletion removes memberships first and protects only literal `editors`.
- Admin creation generates a password when the form password is empty.
- Registration completion currently creates `user`; Flask's configurable
  `auth_default_role` can allow admin default, while Fastify currently creates
  `user`. This is a decision, not a safe parity assumption.
- No mutation audit table or durable admin audit event was found.

M6.3d.2 must make these transitions explicit and transactional. It must not
invent an identity provider. OIDC, SAML, and interactive LDAP remain excluded.

## 11. Registration and token administration

Registration is email-link based when SMTP is configured. Flask stores only a
hash of a random 32-byte registration token, expires it after 24 hours, marks
older unused tokens for the same email used, and marks the selected token used
after account creation.

API tokens are user-owned. Flask and Fastify list metadata (`id`, label,
created/last-used timestamps), return cleartext only during creation, update
labels owner-constrained, and revoke owner-constrained. Token use updates
`last_used` when a writable database is active. Administrative token listing or
forced revocation for another user does not exist and should not be invented
without a product decision.

M6.3d.2 must add differential fixtures for registration expiry, reuse,
duplicate accounts, token ownership, one-time cleartext, revocation, label
updates, and session behavior.

## 12. Cartridge moderation and publication administration

The current authority is split:

- Flask `GameStore` owns filesystem `index.json` and cartridge files.
- Flask review owns `cartridge_submissions`, pending directories, and approval
  or rejection.
- Fastify M5.1/M5.2a/M5.2b has isolated submission/review/publication with
  filesystem journals, publication lock, compensation, reconciliation, and
  deterministic fault tests.
- Fastify M6.3c.2 backup/restore reuses `publication.lock` and excludes derived
  journal/staging/recovery paths from portable data.

The missing direct-admin operations are metadata editing and deletion of one
architecture/version. Flask changes `index.json` and deletes cartridge files;
there is no SQLite transaction and no publication journal around those direct
operations. A failure between file deletion and index replacement can produce
an orphan/missing-reference state. Future Fastify must reuse the existing
publication consistency boundary and reconciliation service, not create a
second publication workflow.

Architecture strings `esp32c6` and `qemu`, metadata ABI names, cartridge
format validation, and public catalog identifiers are cross-repository
contracts. No admin mutation may rename them or rewrite firmware-facing fields.

## 13. Metrics, scores, and statistics administration

No Flask mutation endpoint for deleting runs, deleting scores, deleting
download events, or changing statistical aggregates was found. The remaining
administrative surface is primarily read access: admin run listing and
owner/admin run detail/export; public non-identifying statistics; public scores
and scoreboard HTML; and the Flask HTML statistics dashboard.

M6.1 metrics, M6.2 scores, M6.3a statistics, and M6.3b capacity/resilience
already cover the corresponding Fastify APIs in isolation. M6.3d.1 must not
duplicate those reads or optimize the administrator run-list query. That query
is explicitly recorded as a scalability risk for a later capacity milestone.

## 14. Authentication, authorization, and CSRF findings

### Preserved controls

- Flask browser mutations use the global CSRF hook and hidden form/header
  tokens; bearer-only API clients bypass browser CSRF by design.
- Admin routes require authenticated admin role; review requires `editors`.
- Fastify has constant-time comparisons for CSRF/bootstrap values, stable
  error envelopes, browser-session-only backup restore, and bearer-aware auth
  context.
- Fastify logs internal failures without returning raw exception strings for
  migrated isolated domains.
- Upload and metrics resource limits are already present in Flask and Fastify.

### Findings to carry into M6.3d.2

1. **Final-admin invariant is absent.** A role mutation or deletion API could
   lock out the service unless it guarantees at least one admin.
2. **Admin/editor policy differs by capability.** Review is group-only;
   catalog administration is admin-or-editors. This must be explicit in every
   route contract.
3. **Settings are mass-assignment prone.** The current form persists all known
   keys as strings, including secret/provider fields, with limited validation.
4. **Mutation atomicity is incomplete.** User+groups and direct filesystem
   catalog edits are not one transaction/journaled operation.
5. **No durable audit trail was found.** Sensitive admin actions cannot be
   reconstructed from a dedicated audit record.
6. **HTML redirect behavior is not a JSON contract.** Next.js consumers need
   explicit response/error schemas rather than relying on Flask flashes.
7. **Bearer and browser paths must remain distinct.** Backup restore rejects
   bearer-only authorization even though backup download allows admin bearer.
8. **Registration role policy is inconsistent across Flask and Fastify.** This
   requires a decision before parity implementation.
9. **Conditional federation configuration contains secrets.** OIDC/SAML must
   remain excluded; their settings must not become an accidental Fastify API.

## 15. API compatibility requirements

The following contracts are mandatory for any M6.3d.2 JSON API:

- preserve existing identifiers, role names, group names, architecture strings,
  submission IDs, token IDs, run IDs, and catalog game/version IDs;
- preserve existing firmware routes and payloads for scores, metrics,
  discovery, catalog, downloads, and bundle publishing;
- preserve existing response fields and add optional fields rather than
  replacing them;
- return stable status/error categories for validation, auth, CSRF, not found,
  conflict, and unavailable disposable-writer conditions;
- distinguish browser-session CSRF from bearer-only tool/firmware requests;
- keep JSON responses independent from Flask redirects/flash messages;
- preserve multipart field names `bundle`, `backup`, `csrf_token`, and
  `backup_password` where existing isolated contracts require them;
- use explicit pagination, sorting, and filtering contracts for users,
  groups, submissions, runs, and any future settings list;
- never expose password hashes, token hashes, cleartext API tokens after
  creation, SMTP/OIDC/SAML secret values, or backup passwords;
- preserve public statistics as aggregate/non-identifying data;
- preserve the public discovery document and companion API routes.

Recommended differential fixtures should be generated from isolated Flask
fixtures and compared field-by-field with Fastify. HTML output should not be
treated as the target contract except for redirects/status behavior needed by
legacy clients during transition.

## 16. Flask HTML retirement candidates

The final architecture is one Next.js frontend, not parallel Jinja and Next.js
administration. The following pages are retirement candidates after equivalent
Next.js workflows and backend APIs exist:

- `/setup` and its asset forms;
- `/admin/users`, `/admin/groups`, `/admin/roles`, `/admin/cartridges`, and
  `/admin/backup`;
- `/editor/submissions` and submission detail;
- `/publish`;
- `/stats` and `/scores`;
- authentication and token templates;
- user/run profile templates.

The underlying operations must be migrated or explicitly retired before the
pages are removed. The HTML itself should not be copied into Fastify. Existing
Next.js rewrites may remain during transition, but they are not proof that a
Next.js feature exists.

## 17. SQLite and filesystem mutation risks

| Operation | SQLite effects | Filesystem effects | Required M6.3d.2 boundary |
| --- | --- | --- | --- |
| Settings update | Upsert `store_settings`; Flask commits per key | Asset uploads write `data/static` | Allow-list, typed validation, one transaction, asset staging/type checks |
| User create/update | Insert/update `users`; group updates separate | None | `BEGIN IMMEDIATE`, uniqueness handling, password/session invalidation policy |
| Role/group change | Update `users`, `groups`, `user_groups` | None | Final-admin/self-protection, transactional relationship update |
| User delete | `users` delete cascades tokens/groups; runs/submissions use nullable refs | None | Confirmation, reference policy, transaction, session/token invalidation |
| Token create/update/revoke | `api_tokens` insert/update/delete | None | Owner/admin policy, one-time cleartext, CSRF/session rules |
| Submission review | Updates `cartridge_submissions` | Publishes/removes pending/cartridge/index files | Reuse publication lock/journal/reconciliation; no second workflow |
| Direct metadata edit | None | Rewrites `index.json` | Reuse publication serialization and atomic index replacement |
| Direct deletion | None | Deletes `.prg32` and rewrites `index.json` | Stage/backup/verify/compensate; validate no catalog reference remains |
| Backup export | Read snapshot | Reads SQLite/filesystem and creates archive | Existing M6.3c.2 disposable service; no production enablement |
| Backup restore | Transactional copy into existing SQLite inode | Recovery point and managed-data replacement | Existing M6.3c.2 recovery/journal; coordinate all writers |
| Run/score/stat reads | Reads potentially large history | None | Preserve limits/authorization; no M6.3d optimization |

No schema migration or index addition is authorized by this audit.

## 18. Missing functionality

Verified missing Fastify capabilities:

1. Typed settings read/write API and safe custom asset administration.
2. Admin user list/create/update/delete.
3. Role and group list/create/update/delete/membership management.
4. Final-admin, self-demotion, self-delete, password/session invalidation, and
   mutation-audit policy.
5. Admin-facing registration policy and token administration beyond current
   user-owned JSON token operations.
6. Direct cartridge metadata edit and destructive catalog deletion APIs.
7. Next.js admin/settings/review/statistics UI consumers.
8. Exact legacy HTML token form aliases, if retained through cutover.
9. Flask `/stats`, `/scores`, `/publish`, and admin HTML pages as Next.js
   replacements; these are UI decisions, not reasons to copy templates.
10. Operational email/provider integrations in Fastify, if registration email
    remains a product requirement.

No missing feature should be implemented merely because a Flask page exists.
The underlying capability and client need must be approved first.

## 19. Intentionally excluded or obsolete functionality

- OIDC routes and OIDC settings migration.
- SAML routes and SAML settings migration.
- Interactive LDAP login; the existing adapter does not provide it.
- Flask/Jinja template migration as a backend architecture goal.
- Flash-message infrastructure as a permanent frontend contract.
- Production Fastify writes, public admin routing, and Flask removal.
- Automatic retention/deletion of scores, metrics, runs, downloads, or backups.
- Schema migrations, indexes, Redis, cloud secret managers, KMS, and new
  identity providers.
- Device-local PRG32 routes such as `/api/runtime`, `/api/performance.json`,
  and board-local `/api/games` upload/select behavior.

The five conditional OIDC/SAML route rules are counted separately as
explicitly excluded; they are not part of the 67 active default rules.

## 20. M6.3d.2 implementation plan

The sequence below is disposable-only and independently testable. Each unit
must remain behind existing writer flags and must not share production mounts
with Flask.

### Unit A — Settings contracts and safe assets

**Scope:** typed read projection, allow-listed writes, secret presence/write-only
fields, public/private setting classification, asset staging.

**Flask reference:** `settings.py`, `/setup`, `/setup/logo`, `/setup/favicon`.

**Fastify foundation:** auth writer connection, `store_settings` schema,
stable error envelopes, backup secret boundary.

**Security:** admin session + CSRF for browser writes; explicit bearer policy;
never return secret values; deployment settings unavailable.

**Tests/acceptance:** defaults; invalid type/range/domain/port/color; unknown
key rejection; omitted versus clear secret; persistence after restart; asset
size/type/path traversal; no secret in response/log/backup fixture; Flask
differential fixtures for non-secret fields.

**Dependency:** decision on the allow-listed settings and SMTP scope.

### Unit B — Users, roles, groups, and security transitions

**Scope:** JSON list/create/update/delete, role change, group membership and
group CRUD; no identity-provider integration.

**Flask reference:** `app.py` admin routes and auth schema/decorators.

**Fastify foundation:** `AuthService`, principal/group queries, auth writer.

**Security:** admin session + CSRF; explicit bearer policy; transactional
changes; final-admin invariant; self-demotion/delete decision;
password/session/token invalidation; unique conflict normalization; audit event
decision.

**Tests/acceptance:** anonymous/user/editor/admin matrix; role/group boundaries;
final admin cannot disappear; self-protection; concurrent role/delete races;
foreign-key behavior; password/session invalidation; stable 401/403/404/409
errors; no mass-assignment of unknown columns.

### Unit C — Registration and token administration

**Scope:** preserve current user-owned token API and decide whether admins may
revoke another user's token; typed registration policy only if approved.

**Flask reference:** auth registration/token routes and `registration_tokens`.

**Fastify foundation:** existing auth routes/service/token hashing.

**Tests/acceptance:** registration disabled/domain/default-role behavior;
expiry/one-time use; token ownership, cleartext-once, revoke, label update;
session and CSRF/bearer behavior.

**Dependency:** SMTP delivery and default-role decisions.

### Unit D — Remaining cartridge moderation administration

**Scope:** direct metadata edit and variant/version deletion only after review
of the existing publication consistency service.

**Flask reference:** `GameStore.update_metadata`, `delete_variant`, admin
cartridge routes.

**Fastify foundation:** `PublicationConsistencyService`, `publication.lock`,
reconciliation, review/publication journals, M6.3c.2 recovery coordination.

**Tests/acceptance:** admin/editor matrix; metadata allow-list; binary reference
validation; stage/replace/index crash points; deletion compensation;
reconciliation clean result; backup interaction; no architecture/ABI drift.

**Explicit exclusion:** no second publication workflow and no schema migration.

### Unit E — Remaining metrics/score/statistics administration

**Scope:** only any explicitly approved mutation discovered after product
review; retain existing read APIs and authorization/resource behavior.

**Foundation:** M6.1, M6.2a/b, M6.3a, and M6.3b services/tests.

**Tests/acceptance:** no duplicate routes; owner/admin exports; public aggregate
privacy; firmware fixtures; capacity regression; no administrator run-list
optimization in this unit.

### Unit F — Integrated compatibility and frontend gate

**Scope:** Next.js consumers for approved JSON APIs, then route-level and
differential verification. Do not create pages for excluded functionality.

**Tests/acceptance:** Flask/Fastify fixtures; auth/CSRF matrix; settings secret
tests; SQLite/filesystem fault tests; backup/restore interaction; disposable
Docker profiles; proxy compatibility; no operational mount; no firmware or
companion changes.

## 21. Required product decisions before implementation

1. Exact allow-list of application settings exposed to administrators.
2. Whether SMTP registration email remains required in TypeScript and how
   credentials are supplied without exposing them in the API.
3. Whether `auth_default_role=admin` remains legal; recommended default is
   `user` only.
4. Whether at least one administrator must always remain, including rules for
   self-demotion, self-delete, and deleting the final admin.
5. Whether role/password changes invalidate sessions and API tokens.
6. Whether admins can revoke tokens belonging to another user.
7. Whether an append-only admin audit trail is required before cutover.
8. Whether `editors`-only review and admin-or-editors catalog management remain
   intentionally different.
9. Which Flask HTML pages may remain until cutover and which Next.js workflows
   are required before retirement.
10. Whether direct catalog deletion is supported or should be retired in favor
    of unpublish/soft-delete semantics. No schema change is proposed here.
11. Whether public statistics may expose any additional aggregate fields.
12. Production backup retention, encryption-password/key handling, and restore
    operator policy from M6.3c.2.

## 22. Testing strategy for M6.3d.2

| Area | Required deterministic evidence |
| --- | --- |
| API compatibility | Flask-generated isolated fixtures, Fastify differential tests, methods/routes/status/envelopes/fields, pagination/filtering/sorting, invalid/missing/conflict cases |
| Authorization | Anonymous, authenticated user, editor, admin, session, bearer, missing/invalid CSRF, group/role transition races |
| Settings | Defaults, allow-list, type/range validation, persistence/restart, environment precedence, secret redaction/write-only, asset validation |
| User/role integrity | SQLite transactions, unique conflicts, final-admin/self-protection, password/session/token invalidation, cascade/reference behavior |
| Filesystem/catalog | Staged edits/deletes, publication lock, journal kill points, compensation, reconciliation, symlink/path safety, backup interaction |
| Existing domains | Existing Fastify regression suite, Flask regression suite, M6.1/M6.2/M6.3a fixtures, no duplicate implementation |
| Frontend | Next.js request payload/response schemas, CSRF acquisition/injection, loading/error/refresh behavior, no plaintext secrets |
| Docker | Single Compose file, disposable profiles, Node 24/pnpm, no operational mounts, disabled-by-default writes, health/readiness, cleanup |
| Companion | Read-only firmware/tool contract checks for discovery/catalog/download/publish/scores/metrics; no companion modification |

Tests must use isolated databases and filesystem roots. No test may run a
destructive restore or delete against operational data.

## 23. Risks and blockers

- No complete product decision exists for settings exposure or secret storage.
- Flask permits high-impact settings such as admin default registration role
  and persists provider secrets in SQLite.
- User/group mutations lack a final-admin invariant and durable audit trail.
- Direct catalog admin mutations are filesystem-only and not journaled.
- The administrator run-list query remains a scalability bottleneck.
- Backup restore can overwrite settings and sensitive database material; M6.3c.2
  is isolated and disabled by default.
- Next.js has no current administrative consumer, so frontend acceptance
  criteria must be approved rather than inferred from Flask templates.
- Production cutover requires a single-writer decision and live-data
  reconciliation that this audit does not authorize.

## 24. Verification and boundary confirmation

This was a documentation-only milestone. No application source, frontend
source, Flask template, Docker/Traefik configuration, SQLite schema, database,
production data, firmware file, or `../PRG32` file was modified **as part of
M6.3d.1**. Existing uncommitted changes from prior milestones were preserved.

Checks performed after the audit document and roadmap update:

- `git diff --check` — passed;
- `git status --short` — inspected; broad uncommitted prior work was preserved;
- `git -C ../PRG32 status --short` — inspected; pre-existing untracked
  `docs/quickstart-qemu.md` and `run-qemu` were preserved;
- application regression suites were not rerun because no executable code was
  changed for M6.3d.1; previous results are not presented as new test passes;
- no operational database was opened for mutation and no Docker/Traefik command
  was executed for this documentation-only gate.

## 25. GO/NO-GO recommendation

**GO with conditions:** M6.3d.1 discovery is complete and M6.3d.2 may be
planned/implemented in the disposable Fastify writer after the product
decisions in section 21 are recorded.

**NO-GO:** public Fastify admin/settings routing, production Fastify writes,
dual Flask/Fastify writers, production backup enablement, schema changes,
Traefik changes, firmware changes, OIDC/SAML reintroduction, or Flask removal.

M6.3d.2 has not started.
