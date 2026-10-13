# PRG32 Cartridge Store — M6.3d.2h.10 Dual-Origin Local Integration & Generic OIDC/SAML Interoperability

Date: 2026-10-13  
Status: **FOUNDATION IMPLEMENTED; FULL BROWSER FEDERATION ACCEPTANCE PENDING**

## Scope and decision

This milestone establishes the explicit local dual-origin boundary required by
the Next.js migration:

- frontend: `https://store.prg32.dream.test`;
- browser-facing API: `https://api.prg32.dream.test`;
- Fastify auth/federation routes are exposed through the existing Traefik edge
  only when the `dual-origin` Compose profile is enabled;
- Flask remains the owner of the remaining transitional catalog/API routes;
- Next.js does not proxy auth or federation requests in dual-origin mode;
- no Authentik-specific runtime code was added.

The implementation is intentionally opt-in. Existing same-origin development,
the Flask/Jinja application, production Compose services, and the existing
disposable Authentik harness remain unchanged unless the new profile and
variables are explicitly selected.

## Implemented boundary

### Browser API origin and credentials

`frontend/src/lib/api/origin.ts` is the single browser-side origin resolver.
Auth and federation clients use `requestApiJson`, which:

- resolves relative auth/federation paths to the configured API origin;
- uses `credentials: "include"` only when dual-origin mode is enabled;
- leaves catalog and legacy same-origin requests unchanged;
- rejects API origins containing credentials, path, query, or fragment;
- requires HTTPS for the explicit dual-origin configuration.

`next.config.ts` rejects production builds containing the dual-origin variables
and rejects a configuration that combines direct API mode with the temporary
Next auth/federation proxy integrations. This prevents silent double routing.

The federation administration UI now derives fallback OIDC callback, SAML ACS,
metadata, and metadata-link URLs from the configured API origin. It no longer
uses `window.location.origin` for backend federation endpoints.

### CORS and CSRF

Fastify has an explicit exact-origin CORS boundary. It is disabled by default
and enabled only with `PRG32_BACKEND_CORS_ORIGINS`:

- comma-separated exact origins only;
- no wildcard and no arbitrary reflection;
- `Access-Control-Allow-Credentials: true`;
- explicit methods and `Accept, Content-Type, X-CSRFToken, X-CSRF-Token`;
- `Vary: Origin`;
- denied preflight requests return the stable `cors_origin_denied` envelope.

CSRF acquisition and mutation headers continue to use the canonical Fastify
`/auth/csrf` contract. In dual-origin mode those requests go directly to the
API origin.

### Cookies and callback redirects

Session cookies remain host-only because no `Domain` attribute is emitted.
The dual-origin workflow must set `PRG32_BACKEND_SESSION_SECURE=true`; the
SAML correlation cookie is already unconditionally `Secure; SameSite=None`.

`PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN` is a trusted, validated origin used only
for the final OIDC/SAML browser redirect. The protocol callback, ACS, and SAML
metadata endpoints remain on the API origin. If this variable is absent, the
existing relative redirect behaviour is preserved.

### Compose and Traefik

The single root `docker-compose.yml` now contains an opt-in `dual-origin`
profile and `docker/auth-writer-edge-proxy.conf`:

- the proxy joins the existing Compose `app` network and external
  `DREAM_EDGE_NETWORK` (default `dream_edge`);
- a high-priority Traefik router matches only the API host and
  `/auth`, `/api/auth`, and `/api/admin/federation` paths;
- all other API paths continue to resolve through the existing Flask router;
- the proxy forwards to the disposable `auth-writer` and does not create a
  second writer process or database owner.

## Configuration

The following values are intentionally unset or disabled by default:

| Variable | Dual-origin value | Default | Purpose |
| --- | --- | --- | --- |
| `PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED` | `true` | `false` | Enables direct browser API mode |
| `PRG32_DUAL_ORIGIN_API_ORIGIN` | `https://api.prg32.dream.test` | unset | Exposed Next.js API origin |
| `PRG32_AUTH_PUBLIC_ORIGIN` | `https://api.prg32.dream.test/` | unset | Fastify OIDC/SAML callback origin |
| `PRG32_FRONTEND_PUBLIC_ORIGIN` | `https://store.prg32.dream.test/` | unset | Post-login browser destination |
| `PRG32_BACKEND_CORS_ORIGINS` | `https://store.prg32.dream.test` | empty | Exact credentialed CORS allowlist |
| `PRG32_BACKEND_SESSION_SECURE` | `true` | `false` in writer dev | Secure session cookie |
| `PRG32_BACKEND_SESSION_SAMESITE` | `none` | `lax` in writer dev | Explicit cross-origin federation cookie policy |

These are disposable local values only. No credentials or production
artifacts are stored in the repository.

## Development workflow

From the repository root, with Node 24 selected locally when running host
commands:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24

# Prepare the disposable writer volumes once.
docker compose --profile writer-init run --rm auth-writer-init

# Start Flask, Next, Fastify writer, and the dual-origin Traefik bridge.
PRG32_DEV_SECRET_KEY="$(openssl rand -hex 32)" \
PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED=true \
PRG32_DUAL_ORIGIN_API_ORIGIN=https://api.prg32.dream.test \
PRG32_AUTH_PUBLIC_ORIGIN=https://api.prg32.dream.test/ \
PRG32_FRONTEND_PUBLIC_ORIGIN=https://store.prg32.dream.test/ \
PRG32_BACKEND_CORS_ORIGINS=https://store.prg32.dream.test \
PRG32_BACKEND_SESSION_SECURE=true \
PRG32_BACKEND_SESSION_SAMESITE=none \
docker compose --profile dev --profile writer --profile dual-origin up --build
```

The `writer` and `dual-origin` profiles are intentionally started together;
the edge bridge must never point at a different writer database. Stop the
disposable stack without deleting volumes with:

```bash
docker compose --profile dev --profile writer --profile dual-origin down
```

## Verification evidence

Executed with Node 24 (`nvm use 24`):

| Check | Result |
| --- | --- |
| Backend typecheck | PASS |
| Backend Vitest suite | PASS — 26 files, 132 tests |
| New exact-origin CORS tests | PASS — 2 tests |
| Frontend typecheck | PASS |
| Frontend Vitest/RTL suite | PASS — 10 files, 29 tests |
| Frontend ESLint | PASS |
| Next production build with `FLASK_PROXY_TARGET=http://backend:5080` | PASS |
| Next dual-origin development startup | PASS |
| Single root all-profile Compose config | PASS |
| Root Flask Docker build | PASS — `docker build -t prg32-cartridge-store:local .` |
| Local Traefik/Compose smoke | PASS — store host served Next; auth CSRF reached Fastify API host |
| Allowed CORS preflight/request | PASS — 204/200, credentials and exact origin headers |
| Unknown CORS origin | PASS — 403 `cors_origin_denied` |
| Host Playwright browser smoke | BLOCKED — Chromium executable is not installed in the local Playwright cache |
| Disposable generic OIDC browser login on the exact dual origins | NOT RUN; existing harness uses isolated `writer.test` origins and was not silently relabelled |
| Disposable generic SAML browser login on the exact dual origins | NOT RUN; same limitation |

No OIDC/SAML browser result is claimed as passed. The existing disposable
Authentik harness remains provider-neutral and can be extended in the next
milestone after adding an exact dual-origin browser fixture or installing its
browser runtime in the isolated test image.

## Files changed for this milestone

- `backend/src/app.ts`
- `backend/src/auth/browser-redirect.ts`
- `backend/src/config/env.ts`
- `backend/src/oidc/routes.ts`
- `backend/src/saml/routes.ts`
- `backend/tests/dual-origin.test.ts`
- `docker-compose.yml`
- `docker/auth-writer-edge-proxy.conf`
- `frontend/next.config.ts`
- `frontend/src/components/federation/FederationWorkspace.tsx`
- `frontend/src/lib/api/auth.ts`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/federation-admin.ts`
- `frontend/src/lib/api/origin.ts`

The repository had unrelated dirty changes from previous milestones; none were
reset, committed, pushed, or removed.

## Security and compatibility invariants for Fastify/Next migration

1. API and frontend public origins are explicit trusted origins, not derived
   from an arbitrary request host or browser location.
2. Credentialed CORS uses an exact allowlist; wildcard CORS is prohibited.
3. Host-only secure cookies are used for the API session; no broad `Domain`
   cookie is introduced.
4. Browser auth mutations obtain the canonical API CSRF token and send the
   canonical `X-CSRFToken` header.
5. SAML correlation remains `Secure; SameSite=None` and transaction-bound.
6. OIDC/SAML callbacks remain on the API origin; post-auth navigation is
   limited to the validated frontend origin and safe return path.
7. Next.js direct API mode and Next proxy mode are mutually exclusive.
8. Traefik routes only explicitly owned Fastify namespaces to Fastify; legacy
   Flask/Jinja routes remain available.
9. No Authentik-specific protocol assumptions are present in the application
   boundary.
10. Defaults preserve same-origin behaviour and do not expand production
    routing or CORS.

## Remaining risks and rollback

- The exact-origin disposable OIDC/SAML browser matrix is still open.
- Host-side Playwright requires a browser runtime; the existing containerized
  harness uses different internal test hostnames.
- The dual-origin proxy is a local integration bridge, not a production route
  ownership decision.
- Rollback is configuration-only: stop the `dual-origin` profile, unset the
  dual-origin variables, and leave the existing Flask/Next same-origin mode
  active. No schema or production-data rollback is required.

## Recommendation

Do not mark M6.3d.2h.10 fully complete yet. Authorize
**M6.3d.2h.11 — exact dual-origin disposable OIDC/SAML browser verification**
to add a short, focused browser fixture for positive linked-user login and the
required negative identity/provider/account/state/replay cases. Keep the
existing long lifecycle matrix optional and do not begin Flask removal or
production federation cutover automatically.
