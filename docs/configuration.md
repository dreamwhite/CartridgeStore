# Configuration reference

Environment variables are read at process startup. Compose interpolation
happens before services start. Values below are examples, never credentials.

## Fastify API

| Variable | Meaning |
| --- | --- |
| `PRG32_BACKEND_HOST` | Listen host; use `0.0.0.0` in a container |
| `PRG32_BACKEND_PORT` | Listen port; deployment default is `5080` |
| `PRG32_BACKEND_DB` | Unified SQLite path |
| `PRG32_BACKEND_STORE_DATA` | Canonical filesystem root |
| `PRG32_BACKEND_CATALOG_READ_MODE` | `canonical-disposable` or `canonical-operational` |
| `PRG32_BACKEND_CANONICAL_STORAGE_ROOT` | Canonical storage root |
| `PRG32_BACKEND_SESSION_SECRET[_FILE]` | Session signing secret |
| `PRG32_BACKEND_BOOTSTRAP_TOKEN[_FILE]` | One-time first administrator secret |
| `PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN` | Exact storefront origin |
| `PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN` | Exact API/federation origin |
| `PRG32_BACKEND_CORS_ORIGINS` | Exact browser origins |
| `PRG32_BACKEND_EMAIL_TRANSPORT` | `memory` for tests or `smtp` for deployment |
| `PRG32_BACKEND_MDNS_ENABLED` | Enable classroom discovery advertisement |

Secrets may be supplied through Docker secrets with the `_FILE` suffix. Do not
put operational secrets in Compose YAML or source control.

## Frontend

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_PRG32_API_ORIGIN` | Fastify API origin used by browser clients |
| `NEXT_PUBLIC_PRG32_WS_URL` | Public WebSocket URL when configured |
| `NEXT_TELEMETRY_DISABLED` | Disable Next telemetry |

The frontend has no API rewrite target or second backend origin.

## Compatibility fallbacks

`PRG32_STORE_DATA` and `PRG32_STORE_DB` remain accepted for existing
installations. `PRG32_SCORE_DB` and `PRG32_METRICS_DB` remain read-compatible
fallbacks where the backend configuration supports them.
