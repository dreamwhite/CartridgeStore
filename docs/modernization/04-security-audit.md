# Security audit

This is a defensive source review, not a penetration test. No production endpoint was probed. No secret values are reproduced here.

## Findings

### SEC-01 — Critical: deterministic bootstrap administrator credential

**Affected component.** Local authentication and first-run initialization.

**Evidence.** `ensure_default_admin()` inserts an administrator using a fixed password when the `admin` row is absent ([auth/__init__.py](../../cartridge_store/auth/__init__.py:248-263)). The same default credential is documented in [README.md](../../README.md:48-59) and setup docs.

**Impact.** A fresh or reset deployment can be taken over if the documented credential is not changed. Re-seeding on an existing database also makes the bootstrap behavior an ongoing security concern.

**Mitigation.** Replace with a one-time random bootstrap secret delivered out-of-band, an interactive first-run setup, or a forced password change before any privileged action. Add a migration/rollback plan and a test that a fresh deployment cannot retain a known credential.

**Verification.** Fresh isolated data directory; assert admin setup requires a one-time secret/change. Existing data backup and login regression tests must remain green.

### SEC-02 — High: no CSRF protection is evidenced for cookie-authenticated mutations

**Affected component.** Browser forms and JSON mutations using Flask sessions.

**Evidence.** POST routes for login/logout, registration completion, publishing, setup, admin changes, review, backup restore, token forms, and cartridge editing render/use forms without a CSRF token mechanism ([auth/__init__.py](../../cartridge_store/auth/__init__.py:684-818), [app.py](../../cartridge_store/app.py:215-468), [review.py](../../cartridge_store/review.py:361-375)). No CSRF dependency or token helper appears in `requirements.txt`.

**Impact.** A cross-site request could cause a logged-in browser to submit state-changing actions. Bearer-only API clients are a separate concern, but cookie-authenticated JSON routes need an explicit policy.

**Mitigation.** Add CSRF tokens for HTML forms and a documented same-origin/CSRF-token policy for session-backed JSON. Keep Bearer-token clients independent. Reject missing/invalid tokens with a stable error.

**Verification.** Tests submit every protected browser mutation with no token, bad token, and valid token; Playwright checks an external-origin form cannot mutate state.

### SEC-03 — High: bootstrap/session cookie security policy is implicit

**Affected component.** Flask signed-cookie sessions and reverse-proxy deployment.

**Evidence.** The app sets `SECRET_KEY` but does not explicitly set `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SAMESITE`, or a permanent session policy ([app.py](../../cartridge_store/app.py:122-142)). HTTPS termination is only documented as an external deployment requirement ([docs/deployment.md](../deployment.md:48-61)).

**Impact.** Cookie behavior can differ by Flask defaults, proxy scheme, or deployment. Sessions may be sent over an incorrectly configured HTTP path or have weaker cross-site constraints than intended.

**Mitigation.** Set explicit secure/HTTP-only/SameSite policy, trusted proxy handling, session lifetime, and HTTPS redirect at the deployment boundary. Add security headers and a documented local-development exception.

**Verification.** Inspect `Set-Cookie` under HTTP/HTTPS test proxy conditions and assert expected flags.

### SEC-04 — High: ZIP decompression and batch resource limits are incomplete

**Affected component.** Bundle upload and metrics ingestion.

**Evidence.** Bundle request size is capped, but `_prepare_bundle` reads manifest assets and each cartridge from the ZIP without checking total uncompressed size, per-entry size, entry count, or compression ratio ([app.py](../../cartridge_store/app.py:977-1076)). Metrics accepts a list and loops over all entries without a sample-count bound ([metrics.py](../../cartridge_store/metrics.py:176-233)).

**Impact.** A valid-sized request can cause excessive decompression, memory use, CPU, or database writes. This is a denial-of-service risk even though uploaded code is not executed.

**Mitigation.** Enforce a safe ZIP entry allowlist, duplicate/path rules, per-entry and total uncompressed limits, entry count, compression-ratio guard, and metrics sample-count/body limits. Prefer streaming or staged extraction for larger artifacts.

**Verification.** Unit tests for bomb-like fixtures, oversized entries, duplicate names, deep paths, and oversized batches; measure memory/time under a controlled test process.

### SEC-05 — High: metrics exports do not consistently enforce run ownership

**Affected component.** `/api/runs/<run_id>/samples.csv` and `/api/runs/<run_id>/report.md`.

**Evidence.** JSON run detail calls `can_view_run`, but CSV checks only existence and report generation is called without an ownership check ([metrics.py](../../cartridge_store/metrics.py:258-300); [users.py](../../cartridge_store/users.py:30-45)).

**Impact.** An unauthenticated or different authenticated user may retrieve samples or reports for a run that is otherwise intended to be owner/admin visible.

**Mitigation.** Apply one authorization policy to all run representations. Preserve anonymous ingestion if required, but decide whether unowned runs are public; otherwise require token/session or an explicit public-run flag.

**Verification.** Add owner, other-user, admin, anonymous, and missing-run tests for JSON, CSV, and Markdown endpoints.

### SEC-06 — High: full backups contain sensitive settings and are destructive on restore

**Affected component.** Admin backup download/restore.

**Evidence.** Backup archives include a SQLite snapshot and data directory ([app.py](../../cartridge_store/app.py:759-790)); settings store SMTP/OIDC/SAML secrets as values ([settings.py](../../cartridge_store/settings.py:20-60)). Restore deletes existing data children before copying restored content ([app.py](../../cartridge_store/app.py:793-824)).

**Impact.** A backup download is a credential-bearing artifact. A stolen archive exposes identity-provider/SMTP material; an operator mistake or malicious restore can erase current data.

**Mitigation.** Encrypt backups or exclude/reinject secrets, restrict and audit downloads, require a CSRF-protected confirmation, validate backup ABI/schema, stage restore, create an automatic pre-restore backup, and provide a dry-run/rollback process.

**Verification.** Assert secrets are redacted or explicitly encrypted, restore failures leave current data intact, and admin-only access is enforced.

### SEC-07 — Medium: no rate limiting or abuse controls are evidenced

**Affected component.** Login, registration, token creation, score writes, metrics writes, publishing, downloads, and WebSocket connection/join.

**Evidence.** No rate-limiter dependency or counters appear in [requirements.txt](../../requirements.txt:1-9) or route modules.

**Impact.** Credential guessing, token creation, spam submissions, metric flooding, download-event inflation, and connection exhaustion are possible.

**Mitigation.** Add reverse-proxy/app limits appropriate to classroom use; begin with login/registration/publish/token endpoints and WebSocket connection/message limits. Keep firmware-compatible limits documented.

**Verification.** Automated burst tests against an isolated app and proxy configuration review.

### SEC-08 — Medium: response and error policy leaks implementation details

**Affected component.** Store errors and optional federation adapters.

**Evidence.** Store/format exceptions are returned using `str(exc)` in API JSON ([app.py](../../cartridge_store/app.py:164-177)); SAML failures log provider error details ([saml_adapter.py](../../cartridge_store/auth/saml_adapter.py:37-44)).

**Impact.** Invalid-input callers can learn filesystem/format internals; logs may contain identity-provider diagnostics or sensitive context.

**Mitigation.** Map errors to stable public codes/messages, log detailed exceptions server-side with redaction, and preserve legacy fields with an optional code field.

**Verification.** Fuzz invalid paths/metadata and assert no absolute paths, secrets, or stack traces appear in responses/log fixtures.

### SEC-09 — Medium: custom theme assets/CSS need an explicit trust boundary

**Affected component.** Admin theme upload and rendered layout.

**Evidence.** SVG is accepted based on a prefix check, served from the same origin, and custom CSS is deliberately rendered with `|safe` ([app.py](../../cartridge_store/app.py:667-696); [templates/base.html](../../templates/base.html:11-18)).

**Impact.** An administrator can persist arbitrary CSS and potentially active SVG content. This is acceptable only as an admin-trusted customization feature; compromise of an admin account amplifies impact.

**Mitigation.** Prefer PNG/JPEG for logos, sanitize SVG if it remains supported, add a restrictive CSP, set explicit asset MIME/disposition headers, and document that custom CSS is trusted admin content.

**Verification.** Upload SVG/CSS fixtures with scripts/URLs and inspect response headers/browser behavior.

## Positive controls

Parameterized SQL is used for normal values; password hashes use Werkzeug; API token values are only returned at creation and hashes are stored; path-safe IDs/versions and backup path traversal checks exist; uploaded cartridges are never executed ([auth/local.py](../../cartridge_store/auth/local.py:36-67), [app.py](../../cartridge_store/app.py:827-834)). These controls must remain in the React migration.
