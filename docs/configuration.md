# Configuration reference

Configuration is split by runtime. Environment variables are read at process
startup; Compose interpolation happens before profile selection. Values in this
document are examples, not credentials.

## Flask compatibility service

The Flask service is configured by the existing variables documented in
[Deployment](deployment.md). The most important storage variables are:

| Variable | Meaning |
| --- | --- |
| `PRG32_STORE_DATA` | Filesystem root for cartridges, index, and generated assets |
| `PRG32_STORE_DB` | Unified SQLite path; defaults below the store data root |
| `PRG32_SCORE_DB` | Legacy score database fallback |
| `PRG32_METRICS_DB` | Legacy metrics database fallback |
| `SECRET_KEY` | Flask session signing secret; required for production |
| `PRG32_ENV` | Set to `production` for production session policy |
| `PRG32_SESSION_COOKIE_SECURE` | Require HTTPS for Flask session cookies |
| `PRG32_BOOTSTRAP_TOKEN` | One-time first-administrator bootstrap secret |
| `PRG32_MDNS_DISABLED` | Disable mDNS advertisement when set to `1` |

Do not use the local Compose fallback secret in production. Generate secrets
outside the repository and inject them through the deployment secret manager.

## Fastify backend core

| Variable | Default | Meaning |
| --- | ---: | --- |
| `PRG32_BACKEND_HOST` | `127.0.0.1` | Listen address |
| `PRG32_BACKEND_PORT` | `5090` | Listen port |
| `PRG32_BACKEND_DB` | `data/cartridge_store.sqlite` | Read/shadow SQLite path |
| `PRG32_BACKEND_STORE_DATA` | `data` | Filesystem store root; falls back to `PRG32_STORE_DATA` |
| `PRG32_BACKEND_LOG_LEVEL` | `info` | Fastify log level |
| `PRG32_BACKEND_BUSY_TIMEOUT_MS` | `5000` | SQLite busy timeout |

The Fastify service is read-oriented by default. The following write switches
are intentionally constrained to isolated test mode and disposable roots:

| Boundary | Enable | Required companion variables |
| --- | --- | --- |
| Auth | `PRG32_BACKEND_AUTH_WRITE_ENABLED=true` | `AUTH_WRITE_MODE=test`, `AUTH_WRITE_DB`, `AUTH_DISPOSABLE_ROOT`, session secret |
| Submission | `PRG32_BACKEND_SUBMISSION_WRITE_ENABLED=true` | auth writes, `SUBMISSION_WRITE_MODE=test`, `SUBMISSION_DISPOSABLE_ROOT` |
| Metrics | `PRG32_BACKEND_METRICS_WRITE_ENABLED=true` | auth writes, `METRICS_WRITE_MODE=test`, same disposable writer root |
| Scores | `PRG32_BACKEND_SCORES_WRITE_ENABLED=true` | auth writes, `SCORES_WRITE_MODE=test`, same disposable writer root |
| Backup | `PRG32_BACKEND_BACKUP_ENABLED=true` | auth writer profile and `BACKUP_MODE=test` |

Never point these test write paths at the Flask production `/data` mount.

## Origin and session configuration

| Variable | Meaning |
| --- | --- |
| `PRG32_BACKEND_SESSION_SECRET` | Fastify session signing secret, at least 32 characters when writes are enabled |
| `PRG32_BACKEND_SESSION_SECURE` | Secure cookie flag; defaults on in production |
| `PRG32_BACKEND_SESSION_SAMESITE` | `lax`, `strict`, or `none` |
| `PRG32_BACKEND_SESSION_LIFETIME_SECONDS` | Session lifetime; default 8 hours |
| `PRG32_BACKEND_OIDC_PUBLIC_ORIGIN` | Trusted API origin used by OIDC callbacks |
| `PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN` | Trusted federation origin; falls back to OIDC origin |
| `PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN` | Exact frontend origin used for browser return paths |
| `PRG32_BACKEND_CORS_ORIGINS` | Comma-separated exact origins; disabled for production until deployment review |
| `PRG32_BACKEND_SAML_MAX_POST_BYTES` | Maximum SAML form POST; default 2 MiB |
| `PRG32_BACKEND_SAML_MAX_RESPONSE_BYTES` | Maximum SAML response; default 1 MiB |
| `PRG32_BACKEND_SAML_MAX_RELAY_STATE_BYTES` | Maximum relay state; default 1024 bytes |

The dev profile defaults to `https://store.prg32.dream.test` and
`https://api.prg32.dream.test`. These are local infrastructure values, not a
requirement that a deployment use Authentik or any particular provider.

## Resource limits

### Cartridge submissions

| Variable | Default |
| --- | ---: |
| `PRG32_BACKEND_SUBMISSION_MAX_ARCHIVE_BYTES` | 64 MiB |
| `PRG32_BACKEND_SUBMISSION_MAX_ENTRIES` | 128 |
| `PRG32_BACKEND_SUBMISSION_MAX_ENTRY_BYTES` | 32 MiB |
| `PRG32_BACKEND_SUBMISSION_MAX_TOTAL_BYTES` | 128 MiB |
| `PRG32_BACKEND_SUBMISSION_MAX_COMPRESSION_RATIO` | 100 |
| `PRG32_BACKEND_SUBMISSION_MAX_MANIFEST_BYTES` | 256 KiB |

### Metrics, scores, and backup

| Variable | Default |
| --- | ---: |
| `PRG32_BACKEND_METRICS_MAX_CONTENT_BYTES` | 2 MiB |
| `PRG32_BACKEND_METRICS_MAX_SAMPLES` | 1024 samples/request |
| `PRG32_BACKEND_METRICS_MAX_DB_WORK` | 2048 units/request |
| `PRG32_BACKEND_METRICS_MAX_EXPORT_SAMPLES` | 100000 |
| `PRG32_BACKEND_SCORES_MAX_CONTENT_BYTES` | 1024 bytes |
| `PRG32_BACKEND_SCORES_MAX_ROWS` | 100000 |
| `PRG32_BACKEND_BACKUP_MAX_ARCHIVE_BYTES` | 1 GiB |
| `PRG32_BACKEND_BACKUP_MAX_EXPANDED_BYTES` | 4 GiB |
| `PRG32_BACKEND_BACKUP_MAX_ENTRY_BYTES` | 2 GiB |
| `PRG32_BACKEND_BACKUP_MAX_MANIFEST_BYTES` | 256 KiB |
| `PRG32_BACKEND_BACKUP_MAX_ENTRIES` | 50000 |
| `PRG32_BACKEND_BACKUP_MAX_PATH_BYTES` | 1024 |
| `PRG32_BACKEND_BACKUP_MAX_PATH_DEPTH` | 32 |
| `PRG32_BACKEND_BACKUP_MAX_COMPRESSION_RATIO` | 200 |

The complete parser and validation rules are implemented in
`backend/src/config/env.ts`; update this reference when a new operational
variable becomes part of the supported interface.

## Next.js frontend

| Variable | Meaning |
| --- | --- |
| `FLASK_PROXY_TARGET` | Flask origin for compatibility rewrites; required for production builds |
| `NEXT_PUBLIC_FLASK_WS_URL` | Direct Flask WebSocket URL; Next rewrites do not proxy upgrades |
| `PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED` | Enable direct browser API-origin mode |
| `NEXT_PUBLIC_PRG32_API_ORIGIN` | Exact API origin required by dual-origin mode |
| `PRG32_AUTH_INTEGRATION_ENABLED` | Opt into an isolated Fastify auth proxy mode |
| `PRG32_AUTH_FASTIFY_TARGET` | Fastify auth origin required by that mode |
| `PRG32_FEDERATION_ADMIN_INTEGRATION_ENABLED` | Opt into isolated federation admin proxy mode |
| `PRG32_FEDERATION_ADMIN_FASTIFY_TARGET` | Fastify federation origin required by that mode |
| `NEXT_TELEMETRY_DISABLED` | Disable Next telemetry in containers |
| `WATCHPACK_POLLING` | Enables reliable Docker Desktop/macOS file watching |

The production Next image uses `output: standalone`. Development-only
integration flags are rejected by the production build configuration.

