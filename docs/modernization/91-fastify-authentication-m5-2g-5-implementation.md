# PRG32 Cartridge Store — M5.2g.5 Fastify authentication, identity and session parity

Date: 2026-10-14  
Status: **GO for isolated disposable authentication parity; NO-GO for operational cutover and Flask retirement**

## 1. Executive result

Fastify now exercises the actual local authentication, durable session, logout,
CSRF, bearer-token, RBAC, generic OIDC and generic SAML paths against
disposable SQLite databases. Canonical workflow mode uses the same
`storage-v2/store.sqlite` file for catalog, workflow, telemetry and
authentication state; the existing canonical writer lease is acquired before
federation services can perform legacy-identity migration.

The real external provider remains outside this repository. Tests use only
loopback synthetic OIDC/SAML providers and generated disposable keys. No
Authentik state, `sso.dream.test` request, credential, operational account,
public callback, route, Compose service or Traefik configuration was changed.

This is a disposable parity gate, not a public ownership handover.

## 2. Files changed

Implementation and tests:

- `backend/src/config/env.ts` — canonical auth invariants, secure cookie
  validation and disposable-only federation auto-provision flag.
- `backend/src/app.ts` — canonical workflow is established before federation
  runtime composition; `/ready` checks canonical storage in canonical mode.
- `backend/src/auth/session.ts` — malformed cookie encoding fails closed as an
  anonymous request instead of becoming a server error.
- `backend/src/federation/runtime.ts` — controlled legacy identity migration
  and auto-provisioning options are composed into the runtime.
- `backend/src/federation/identity.ts` — safe historical mapping, new-account
  provisioning, collision refusal and transactional last-login updates.
- `backend/src/oidc/service.ts` — provider-neutral `discovery_issuer`, bounded
  identity claims and stable identity error mapping.
- `backend/src/saml/service.ts` — bounded email/username/display-name claim
  extraction and stable provisioning error mapping.
- `backend/tests/auth.test.ts` — cookie security attributes and malformed
  cookie regression coverage.
- `backend/tests/canonical-workflow-http.test.ts` — canonical auth/readiness
  independence from the legacy shadow database.
- `backend/tests/federation-foundation.test.ts` — historical external identity
  migration and idempotency.
- `backend/tests/oidc.test.ts` — actual synthetic OIDC provisioning and email
  collision callbacks.
- `backend/tests/saml.test.ts` — actual synthetic signed SAML provisioning.
- this report and `docs/modernization/19-revised-migration-roadmap.md`.

No schema version or storage tuple changed. No frontend source was required:
the existing Next.js client already consumes the Fastify-compatible paths and
was re-verified by its full test/type/build checks.

## 3. Flask/Fastify authentication route matrix

| Capability | Flask compatibility route | Fastify route | Result |
| --- | --- | --- | --- |
| CSRF bootstrap | `/auth/csrf` | `/auth/csrf` | TESTED |
| Local login | `/auth/login` | `/auth/login` | TESTED |
| Current browser user | `/auth/me` | `/auth/me` | TESTED |
| API principal | `/api/me` | `/api/me` | TESTED |
| Logout | `/auth/logout` | `/auth/logout` | TESTED |
| Registration | `/auth/register`, `/auth/register/complete` | same paths | TESTED |
| One-time bootstrap | `/auth/bootstrap` | `/auth/bootstrap` | TESTED |
| API token lifecycle | token-compatible auth routes | `/auth/tokens*` | TESTED |
| Federation discovery | Flask provider adapters | `/api/auth/providers` | TESTED |
| OIDC | `/auth/oidc/*` legacy adapter | `/api/auth/oidc/:providerId/{login,callback}` | SYNTHETIC-TESTED |
| SAML | `/auth/saml/*` legacy adapter | `/api/auth/saml/:providerId/{login,acs,metadata}` | SYNTHETIC-TESTED |
| Protected publishing/review/admin | Flask route families | Fastify route families with centralized RBAC | TESTED in disposable suites |

The old Flask signed `session` cookie is not accepted as a Fastify session.
The planned transition is controlled browser re-login; existing bearer/API
tokens remain the compatibility path and must be checked against the final
operational database during a separately authorized handover.

## 4. Canonical identity authority and writer ownership

In canonical workflow mode configuration now fails closed unless:

- catalog reads are `canonical-disposable`;
- the canonical workflow is explicitly `disposable`;
- auth writes are enabled in isolated `test` mode;
- the auth disposable root equals the canonical storage root;
- the auth database is exactly `<canonical-root>/store.sqlite`.

`AuthService`, federation mappings, sessions, users, groups, roles, API
tokens, settings and canonical workflow therefore use one SQLite authority,
even when Fastify holds separate SQLite connections. `/ready` and auth tests
remain healthy after the legacy shadow database is temporarily unavailable.

The canonical filesystem writer lease is acquired before federation runtime
composition. Session creation, logout, token mutations and identity
provisioning use the same canonical connection and cannot create a second
canonical writer process. No dual-writer mode was enabled.

## 5. Local authentication, sessions, CSRF and RBAC

Local login keeps Werkzeug scrypt/PBKDF2 verification compatibility and does
not rehash historical passwords implicitly. Invalid, missing and disabled
accounts fail without exposing account data. Login rotates the session, and
logout revokes it. Durable sessions store only an HMAC-derived session lookup
key and encrypted CSRF material in SQLite; the raw session identifier and CSRF
secret are not logged or stored in the manifest.

Cookie regression coverage verifies `HttpOnly`, `SameSite=Lax` and `Path=/`.
Production configuration rejects `Secure=false`; `SameSite=None` requires
`Secure=true`. Malformed percent-encoded cookies are treated as anonymous.
Cookie-authenticated mutations require the session CSRF token; bearer-only
firmware/API requests preserve their no-browser-CSRF behavior.

Authorization continues to derive from canonical user role and group rows via
the shared `AuthorizationService`. Publication, review, settings, federation
administration, metrics exports, scores and token administration remain
permission guarded. The frontend does not infer roles; it consumes the backend
principal and permission fields.

## 6. External identity mapping and provisioning

The stable mapping keys are:

- OIDC: provider, issuer and subject;
- SAML: provider, issuer and persistent NameID subject.

Existing mappings update only bounded last-login timestamps. A new external
identity can be provisioned only when
`PRG32_BACKEND_FEDERATION_AUTO_PROVISION=true` is explicitly set in the
isolated non-production auth writer. Provisioning requires a valid email and
creates a normal user with no local password and role `user`.

Email is never used to auto-link an external subject. If a local account with
that email already exists, the callback returns a stable conflict and an
administrator must create an explicit identity link. Ambiguous or missing
historical provider metadata is skipped rather than guessed.

Historical Flask `users.external_provider`/`external_id` rows are migrated
only when they match exactly one configured provider ID or exactly one provider
protocol. The migration is transactional and idempotent; a second run reports
the mapping as already present. It never changes user IDs, usernames,
password hashes, roles, disabled state, groups, token hashes or email values.

## 7. OIDC implementation and tests

The actual Fastify callback uses openid-client discovery, authorization-code
PKCE, nonce, state/browser binding, signed ID-token verification through JWKS,
issuer/audience/`azp` checks, endpoint-origin binding, bounded responses,
replay protection, safe return paths and session rotation. The optional
`discovery_issuer` is used for discovery and endpoint retrieval while the
configured issuer remains the token identity authority.

The synthetic provider uses a generated RSA key, loopback HTTP endpoints and
real Fastify routes. Covered cases include successful mapping, new-account
provisioning, email collision, invalid signature, unknown identity, disabled
account, signing-key overlap/retirement, replay and browser-binding failure.

## 8. SAML implementation and tests

The actual Fastify SAML service creates signed SP-initiated requests and
validates signed POST responses with request correlation, RelayState binding,
issuer, audience, destination, recipient, persistent NameID, temporal
conditions, subject confirmation, certificate trust and replay protection.
Profile claims are bounded before they reach identity provisioning.

The synthetic IdP uses generated disposable RSA keys and actual Fastify
metadata/login/ACS routes. Covered cases include successful mapping, new
provisioning with an email attribute, tampered signatures, missing
correlation, issuer/audience/destination/recipient/time failures, certificate
overlap/retirement and replay. No unsigned assertion or real provider was
accepted.

## 9. Historical data and compatibility

The existing M5.2c migration copies compatible users, groups, memberships,
API tokens, registration rows, settings, scores, runs and samples while
retaining source identifiers and password/token hashes. This milestone adds
the missing explicit external-identity mapping bridge described above. The
M5.2c idempotency and verification suites remain green.

The PRG32 firmware-facing token locations and response contracts are
unchanged. The Fastify multiplayer route still accepts the source-compatible
Bearer/header/query/join token forms, and the previous M5.2g.4 differential
scenario remains green. Physical firmware and public Traefik verification are
not claimed.

## 10. Next.js compatibility

The Next.js client continues to use `/auth/csrf`, `/auth/login`, `/auth/me`,
`/auth/logout`, `/api/auth/providers` and provider-specific OIDC/SAML login
URLs through its existing same-origin/explicit development integration. The
auth integration remains disabled by default and no production rewrite or
public route changed. Existing frontend auth API, login panel, protected-route,
federation-admin and workflow tests passed.

## 11. Security and differential evidence

Security regressions covered:

- session rotation, expiry and logout revocation;
- CSRF rejection and bearer-token compatibility;
- disabled account rejection and role/group enforcement;
- malformed cookie fail-closed behavior;
- safe OIDC/SAML callback validation and replay rejection;
- email-collision takeover refusal;
- no raw identity/provider secret values in public errors;
- canonical auth without a readable legacy shadow database.

There is no new route-level Flask/Fastify authentication differential oracle:
the two runtimes intentionally use different session cookie formats and the
handover policy is controlled re-login. Flask remains the public owner. Source
schema, password/token fixtures, catalog/telemetry parity and the existing
multiplayer differential evidence remain the compatibility evidence for this
isolated gate.

## 12. Verification

Executed with Node.js `24.20.0` selected through `nvm use 24`:

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run build` | PASS |
| Full backend Vitest suite | PASS — 40 files, 206 tests |
| Focused auth/federation/canonical suite | PASS — 5 files, 31 tests |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 20 files, 55 tests |
| `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

The implementation never contacted `sso.dream.test`, never changed Docker or
Traefik, and never modified `../PRG32`. No commit or push was performed.

## 13. Known limitations and operational gates

- Flask remains public and authoritative.
- Fastify sessions require controlled browser re-login at a future cutover;
  Flask signed cookies are not translated.
- OIDC/SAML were verified only against synthetic providers, not the external
  provider deployment.
- Public callback origins, Traefik forwarding, WebSocket/WSS, mDNS, physical
  firmware, monitoring and production secret custody remain open.
- Operational backup authenticity, key lifecycle and restore maintenance
  procedures remain separate gates.
- A post-cutover rollback still requires stopping the Fastify writer and
  reconciling writes; restarting Flask alone is not a safe rollback.

## 14. Decisions

- **M5.2g.5 isolated disposable parity:** GO.
- **Public/operational Fastify authentication ownership:** NO-GO.
- **Operational cutover:** NO-GO.
- **Flask retirement:** NO-GO.
- **M5.2g.6 / M6.3d.2h.12:** not started.

Recommended next milestone: an explicitly authorized operational authentication
readiness review covering real provider callback configuration, session
continuity/re-login communication, final canonical account snapshot, secret
custody, public Traefik origins and one-writer handover. It must not be
interpreted as authorization to cut over.
