# PRG32 Cartridge Store — M5.4.9 Real Authentik Federation Acceptance

Date: 2026-10-15  
Scope: isolated local operational runtime only  
Decision: **M549_REAL_FEDERATION_PARTIAL**  
Operational cutover: **NO-GO**  
Flask retirement: **NO-GO**

## 1. Executive result

The dedicated Authentik resources were provisioned and enabled for the
isolated local runtime. A real OIDC browser flow reached the Fastify callback,
passed the browser binding and protocol validation boundaries, and was
rejected only because the external identity has no explicit local identity
link. This is the expected fail-closed behavior.

A real SAML browser flow reached Authentik consent and posted to the Fastify
ACS after the shared-cookie correction. The SAML browser binding was accepted,
but Node-SAML rejected the returned response as `saml_response_invalid` before
identity resolution. SAML therefore is not a passing acceptance gate.

Because both real OIDC and SAML flows did not complete through a linked local
account, this milestone is PARTIAL. No external identity was mapped to the
existing local administrator, and no federated session was granted.

## 2. Scope and safety boundary

The test used disposable hostnames and the existing external Dream edge:

- `m549-store.prg32.dream.test`
- `m549-api.prg32.dream.test`
- Authentik provider: `sso.dream.test`

Only the local Fastify and Next.js containers were recreated. Persistent
Traefik, Authentik, Flask, production Compose, canonical public routing and
operational services were not changed. No production data was used, and no
credentials, tokens, cookies, client secrets, SAML assertions or private keys
are included in this report.

The isolated runtime override is intentionally ignored local configuration at
`.local/operational/runtime/m549-federation.compose.yaml`. It supplies the
dual origins, the `.prg32.dream.test` session-cookie domain, the mkcert CA
mount and the temporary Traefik labels. It does not alter tracked production
configuration.

## 3. Protected state and rollback point

The required pre-change encrypted backup was created and independently
verified before the local federation mutations:

| Item | Result |
| --- | --- |
| Backup format | backup-v4 |
| Archive | `.local/operational/backups/m549-prechange.backup4` |
| Backup ID | `71c29544-9839-4a72-98ad-7de5636d946a` |
| Archive size | 582811 bytes |
| Archive SHA-256 | `94ce52d817c25a9893b3aa2a69e27b4cb70f2dc62de6995ded2d53a9b4972b9f` |
| Key identifier | `key-20261015-01` |
| Verification | `verification_state=complete` |

The archive was not overwritten or removed. A pre-change Flask snapshot was
not modified.

## 4. Authentik resource inventory

The resources are dedicated to this isolated acceptance and are not reused
from the earlier M5.2g.23 test resources.

| Protocol | Authentik provider | Application slug | Local state |
| --- | --- | --- | --- |
| OIDC | provider ID 9, `PRG32 M5.4.9 Local Operational OIDC Provider` | `prg32-local-operational-oidc-20261015` | enabled |
| SAML | provider ID 10, `PRG32 M5.4.9 Local Operational SAML Provider` | `prg32-local-operational-saml-20261015` | enabled |

Both applications are bound to the existing disposable Authentik test user
created for the federation acceptance. The user was not linked to the local
administrator account.

The Authentik issuer and metadata endpoints were configured through the
provider-neutral Fastify federation administration boundary. The Authentik
administrator session was used only for the local provider/application setup;
its password is not persisted in the repository or report.

## 5. Isolated runtime and cookie correction

Fastify and Next.js run as the two local application containers. Traefik is
the existing external edge on `dream_edge`. The exact isolated settings were:

- frontend origin: `https://m549-store.prg32.dream.test`;
- federation/API origin: `https://m549-api.prg32.dream.test`;
- OIDC public origin: `https://m549-api.prg32.dream.test`;
- frontend CORS origin: the isolated storefront origin;
- session-cookie domain: `.prg32.dream.test`;
- WebSocket URL: `wss://m549-api.prg32.dream.test/api/multiplayer`.

The cookie domain was required because initiation starts on the storefront
host while OIDC and SAML callbacks arrive on the API host. Before this
correction both protocols failed the browser-binding check. After it, OIDC
reached identity resolution and SAML reached response validation.

## 6. OIDC acceptance

The configured Authentik issuer was:

`https://sso.dream.test/application/o/prg32-local-operational-oidc-20261015/`

The strict callback configured in Authentik and Fastify was:

`https://m549-api.prg32.dream.test/api/auth/oidc/prg32-local-operational-oidc-20261015/callback`

Observed real browser sequence:

1. Fastify generated the OIDC authorization redirect with state, nonce and
   PKCE.
2. Authentik authenticated the dedicated test user and displayed consent.
3. Authentik redirected to the exact API callback.
4. Fastify accepted the shared browser correlation and validated the callback.
5. Fastify returned the stable fail-closed result
   `oidc_identity_link_required` because no explicit local identity mapping
   exists.

This proves real Authentik-to-Fastify callback interoperability through the
identity-resolution boundary. It does not prove a successful user session.

Authentik retained its default hashed-user-ID subject behavior. An attempt to
change that setting through the available Authentik administration UI was
rejected for lack of permission. No subject was guessed, copied into the
database, or linked to an administrator.

OIDC result: **callback validation PASS; complete authenticated acceptance
BLOCKED by explicit identity linking**.

## 7. SAML acceptance

The configured Authentik metadata URL was:

`https://sso.dream.test/application/saml/prg32-local-operational-saml-20261015/metadata/`

The configured entity ID was the same Authentik metadata entity identifier.
The Authentik HTTP-Redirect SSO endpoint was configured from the dedicated
application metadata. Fastify used the dedicated ACS:

`https://m549-api.prg32.dream.test/api/auth/saml/prg32-local-operational-saml-20261015/acs`

The provider was configured with persistent NameID, signed assertions,
signed responses and the Authentik metadata certificate trust material.

Observed real browser sequence:

1. Fastify generated the SAML request and correlation cookie.
2. Authentik authenticated the dedicated test user and displayed consent.
3. Authentik posted the response to the Fastify ACS on the API host.
4. The shared cookie was accepted; the earlier
   `saml_browser_binding_failed` condition was no longer present.
5. Node-SAML rejected the response as `saml_response_invalid`.

The response was not treated as authenticated and no identity resolution or
session rotation occurred. The raw SAML response was not stored or logged.

SAML result: **browser reachability and binding PASS; protocol validation
FAIL; complete acceptance NO-GO**.

The remaining SAML issue requires a narrowly scoped provider interoperability
investigation, using the Authentik permission model to inspect or align the
response signature/NameID settings. It is not safe to weaken Fastify
validation or accept an unverified assertion.

## 8. Identity mapping and RBAC

The canonical local database contains the existing `local-admin` account. The
acceptance deliberately did not map the external test user to that account.
No dedicated non-administrator local account was created because the OIDC
subject is provider-generated and the SAML response did not reach validated
identity resolution. This avoids inventing ownership or creating an unsafe
implicit account link.

The Fastify administrative provider operations were authenticated with local
admin session, CSRF and recent reauthentication. Both dedicated providers
were explicitly enabled through the supported admin API and persisted.

Federated-user RBAC, `/auth/me` after a successful federation session and
federated logout cannot be accepted until at least one protocol reaches a
validated, explicitly linked non-administrator account. Local login, CSRF,
session rotation and local logout remain covered by the existing Fastify
regression suite; upstream Authentik logout was not initiated.

## 9. Persistence and restart evidence

The local Fastify and Next.js containers were recreated after the federation
configuration and cookie-domain change. After restart:

- Fastify was healthy;
- Next.js became healthy;
- `GET /api/auth/providers` returned both dedicated providers with
  `enabled=true`;
- `GET /ready` returned `ok=true`;
- no Flask or external infrastructure container was restarted.

The pre-change backup was independently verified again after the restart.

## 10. Public read-only observations

Only low-volume, non-mutating requests were used against the canonical public
hostnames:

| Observation | Result |
| --- | --- |
| `GET https://store.prg32.dream.test/` | HTTP 200 |
| `GET https://api.prg32.dream.test/` | HTTP 200 |
| `GET https://sso.dream.test/` | HTTP 302 to Authentik authentication flow |
| Authentik OIDC discovery for the dedicated provider | HTTP 200 |
| Authentik SAML metadata URL | HTTP 302 observed; no authenticated access attempted |

No POST, PUT, PATCH or DELETE was sent to the public infrastructure. No real
public OIDC/SAML login, account administration or token operation was started.

## 11. Verification commands and results

All Node commands were run after `nvm use 24`.

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test -- --testTimeout=15000` | PASS — 55 files, 276 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests, typecheck/lint/build |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| base Compose `config --quiet` | PASS |
| isolated M5.4.9 Compose `config --quiet` | PASS |
| pre-change backup verification | PASS — `verification_state=complete` |
| `git diff --check` | PASS |

The first deliberately parallel smoke run showed a resource-contention race:
one frontend test observed its loading state and one backend migration test
hit the default five-second test timeout. Both suites passed when rerun
serially; the backend rerun used a 15-second test timeout for the known
long-running disposable migration case. No application code was changed for
that observation.

## 12. Files and repository state

Created by this milestone:

- `docs/modernization/137-real-authentik-federation-m5-4-9.md`

The isolated Compose override is ignored local runtime configuration:

- `.local/operational/runtime/m549-federation.compose.yaml`

No tracked application source, Flask code, production Compose file, Traefik
configuration, Authentik persistent configuration or database schema was
modified by this milestone. Existing untracked files from M5.4.8 were
preserved, including report 136, `node_modules/`, `pnpm-lock.yaml`,
`frontend/test-results/` and `.srl`.

## 13. Remaining blockers and risks

1. **SAML protocol validation:** Authentik reaches the ACS, but the returned
   response is rejected by Node-SAML. The cause must be isolated without
   weakening signature, issuer, audience, destination or correlation checks.
2. **OIDC identity mapping:** the provider returns a hashed subject and the
   explicit local identity link is absent. No identity may be guessed or
   email-linked automatically.
3. **Dedicated local account:** a non-administrator local target account is
   still required before testing federated RBAC safely.
4. **Complete browser acceptance:** successful `/auth/me`, session rotation,
   logout and role-bound authorization remain unverified for a real linked
   Authentik user.
5. **Operational boundary:** all work remains isolated under the `m549-*`
   hostnames. Canonical `store.prg32.dream.test` and
   `api.prg32.dream.test` ownership was not changed.

## 14. Final decisions

- `M549_REAL_FEDERATION_PARTIAL`: **YES**.
- `OPERATIONAL_CUTOVER_NO_GO`: **YES**.
- `FLASK_RETIREMENT_NO_GO`: **YES**.
- Real public routing change: **NO**.
- Real data migration: **NO**.
- Existing Authentik provider mutation: **NO**; only dedicated acceptance
  resources were used.
- Further milestone implementation: **NOT STARTED**.

The next authorized work should first resolve the SAML response-validation
compatibility and establish an explicit OIDC subject mapping to a dedicated
non-administrator local account. Only then should the real-session RBAC and
logout gates be rerun. No cutover or Flask retirement is recommended on the
basis of this partial acceptance.
