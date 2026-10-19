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

## Production host variables

The `dream.test` values in the root development Compose file are local-only
dnsmasq names. A production server must provide its own registered domains and
HTTPS endpoints to the operational template:

| Variable | Meaning |
| --- | --- |
| `PRG32_STORE_DOMAIN` | Production storefront hostname |
| `PRG32_API_DOMAIN` | Production API hostname |
| `PRG32_FRONTEND_PUBLIC_ORIGIN` | Production storefront origin |
| `PRG32_API_PUBLIC_ORIGIN` | Production API origin |
| `PRG32_API_WS_URL` | Production WebSocket origin and path |
| `PRG32_COOKIE_DOMAIN` | Production session-cookie domain |

The operational template intentionally fails Compose interpolation when these
values are missing; it must never silently deploy the local `.dream.test`
names.

## Compatibility fallbacks

`PRG32_STORE_DATA` and `PRG32_STORE_DB` remain accepted for existing
installations. `PRG32_SCORE_DB` and `PRG32_METRICS_DB` remain read-compatible
fallbacks where the backend configuration supports them.
