# PRG32 Cartridge Store — M5.2g.23 Real Authentik Integration Acceptance

Date: 2026-10-14  
Decision: `REAL_AUTHENTIK_CALLBACK_BLOCKED`  
Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`  
Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive result

The real Authentik instance at `https://sso.dream.test` was reached using
read-only metadata requests, and dedicated test-only OIDC and SAML resources
were provisioned under the namespace `prg32-m52g23-fcb61d`.

The provider metadata is compatible with the generic Fastify federation
implementation. A complete real browser login and callback could not be
accepted by the disposable writer: its container is not attached to the
external `dream_edge` network, so the writer cannot reach the real Authentik
issuer for the OIDC exchange. Connecting the test container to that network
would change infrastructure topology and was outside this milestone.

Therefore this milestone is not a real-provider integration GO. The result is
`REAL_AUTHENTIK_CALLBACK_BLOCKED`, with no operational routing or identity
resources changed.

Evidence classifications used below:

- `SOURCE_VERIFIED`: observed directly from repository or infrastructure
  configuration.
- `SYNTHETIC_VERIFIED`: verified with disposable or synthetic test fixtures.
- `REAL_PROVIDER_VERIFIED`: observed from the real Authentik provider without
  claiming a completed login.
- `BROWSER_VERIFIED`: completed through a real browser session.
- `NOT_VERIFIED`: not safely demonstrated in this milestone.

## 2. Authorization and safety boundary

`SOURCE_VERIFIED`: The test-only Authentik administration was limited to
resources created for this milestone. Existing non-test applications,
providers, users, flows and policies were not modified. No credentials,
passwords, tokens, cookies or provider secrets are included in this report.

`SOURCE_VERIFIED`: No Traefik, DNS, TLS certificate, operational Compose file,
operational database, Flask route, public routing rule or production storage
was modified. No operational service was restarted and no real user identity
was migrated.

`SOURCE_VERIFIED`: The callback origins were kept exact and non-wildcard:

- Store: `https://store.prg32.dream.test`
- API: `https://api.prg32.dream.test`
- Authentik: `https://sso.dream.test`

## 3. Authentik read-only inventory

`REAL_PROVIDER_VERIFIED`: HTTPS reachability and certificate validation for
`sso.dream.test` succeeded. The observed Authentik version was `2026.8.0`.

`REAL_PROVIDER_VERIFIED`: OIDC discovery returned HTTP 200 for the dedicated
test issuer:

`https://sso.dream.test/application/o/prg32-m52g23-oidc-fcb61d/.well-known/openid-configuration`

`REAL_PROVIDER_VERIFIED`: SAML metadata returned HTTP 200 for the dedicated
test application metadata endpoint:

`https://sso.dream.test/application/saml/prg32-m52g23-saml-fcb61d/metadata/`

`SOURCE_VERIFIED`: Existing non-test Authentik applications were inspected as
metadata only and left untouched. Their names, provider relationships and
secrets were not copied into the disposable configuration.

## 4. Test resource namespace

`REAL_PROVIDER_VERIFIED`: The following resources were created only for this
milestone:

- OIDC application/provider slug: `prg32-m52g23-oidc-fcb61d`.
- SAML application/provider slug: `prg32-m52g23-saml-fcb61d`.
- Dedicated non-administrator test user: `prg32-m52g23-fcb61d`.
- Disposable Fastify writer providers with the same logical identifiers.
- Disposable writer bootstrap administrator with a milestone-specific name.

The dedicated user was restricted to the test applications. No existing Dream
user or group was linked.

## 5. Disposable callback architecture

`SOURCE_VERIFIED`: The test Fastify writer ran as a disposable Node.js 24
service on localhost port `5091`, backed by disposable SQLite data. It was
connected to the project development network but deliberately not attached to
the external `dream_edge` network.

`SOURCE_VERIFIED`: The registered callbacks were:

- OIDC: `https://api.prg32.dream.test/api/auth/oidc/prg32-m52g23-oidc-fcb61d/callback`
- SAML: `https://api.prg32.dream.test/api/auth/saml/prg32-m52g23-saml-fcb61d/acs`

`REAL_PROVIDER_VERIFIED`: Authentik accepted the exact callback and ACS
configuration as provider metadata. No wildcard redirect or ACS URI was used.

`REAL_PROVIDER_VERIFIED`: The OIDC login route returned a stable
`oidc_provider_unavailable` response because the disposable writer could not
resolve/reach the real issuer from its isolated network. The safe remediation
requires a dedicated, verified callback-capable disposable edge arrangement;
it must not be obtained by changing the operational network.

## 6. Real OIDC configuration

`REAL_PROVIDER_VERIFIED`: The dedicated provider used authorization-code flow,
an exact callback, public-client configuration appropriate to the disposable
test, restricted test-user access and no implicit grant. The issuer and
discovery metadata matched the provider configured in the writer.

`SOURCE_VERIFIED`: The writer provider was provisioned through the existing
generic federation provisioning path. No Authentik-specific shortcut or
manually copied production secret was introduced.

### OIDC acceptance matrix

| Check | Result | Evidence |
|---|---|---|
| Discovery metadata | PASS | `REAL_PROVIDER_VERIFIED` |
| Exact issuer/callback configuration | PASS | `REAL_PROVIDER_VERIFIED` |
| Authorization redirect route | BLOCKED | `REAL_PROVIDER_VERIFIED`; writer issuer connectivity unavailable |
| Authorization-code exchange | NOT_VERIFIED | Callback flow could not start safely |
| PKCE, state and nonce | NOT_VERIFIED against real provider | Synthetic coverage exists in prior backend tests |
| JWKS/signature/audience validation | NOT_VERIFIED against real provider | Discovery was readable; no real callback completed |
| Canonical session creation | NOT_VERIFIED against real provider | No completed callback |
| Logout and revocation | NOT_VERIFIED | No real session was created |
| Negative callback cases | SYNTHETIC_VERIFIED | Existing OIDC tests cover invalid state and callback rejection |

## 7. Real SAML configuration

`REAL_PROVIDER_VERIFIED`: The dedicated SAML provider exposed metadata with
the exact SP entity ID, ACS URL, audience and signed response/assertion policy.
The provider used persistent NameID mapping and was restricted to the
dedicated test user.

`REAL_PROVIDER_VERIFIED`: The public Fastify SAML login route returned the
expected redirect to the dedicated Authentik SSO location. An ACS request
without a transaction was rejected with HTTP 404, which is the expected
negative behavior and does not demonstrate a successful assertion.

### SAML acceptance matrix

| Check | Result | Evidence |
|---|---|---|
| SP/IdP metadata retrieval | PASS | `REAL_PROVIDER_VERIFIED` |
| Exact entity ID and ACS | PASS | `REAL_PROVIDER_VERIFIED` |
| Authentication redirect | PASS | `REAL_PROVIDER_VERIFIED` |
| Signed real assertion acceptance | NOT_VERIFIED | No safe completed browser callback |
| XML signature, issuer and audience validation | SYNTHETIC_VERIFIED only | Existing SAML tests; not a real assertion result |
| Destination, recipient, time and InResponseTo | SYNTHETIC_VERIFIED only | Existing SAML tests |
| NameID mapping and session creation | NOT_VERIFIED against real provider | No completed assertion |
| Logout/session behavior | NOT_VERIFIED | No real session was created |
| Unsolicited ACS rejection | PASS | `REAL_PROVIDER_VERIFIED`; stable negative response |

## 8. Browser login results

`NOT_VERIFIED`: The public Next.js storefront loaded successfully at
`https://store.prg32.dream.test` and displayed the dedicated provider links.

`NOT_VERIFIED`: A real browser completion of OIDC or SAML login was not
claimed. The browser client blocked navigation to the canonical provider link
with `ERR_BLOCKED_BY_CLIENT`; no workaround was applied and no credentials or
session cookies were captured.

The browser result is therefore not evidence of a provider defect. It is an
incomplete acceptance gate that must be rerun using a verified disposable edge
and browser profile.

## 9. Identity mapping and session behavior

`SYNTHETIC_VERIFIED`: Generic OIDC/SAML provider separation, disabled-provider
rejection, invalid callback handling and canonical session persistence remain
covered by the existing Fastify test suite.

`NOT_VERIFIED`: Stable real OIDC subject mapping, stable real SAML NameID
mapping, repeated real login idempotency, real logout, provider-disabled
behavior after a real login and real Authentik group/role behavior were not
claimed because no real callback completed.

`SOURCE_VERIFIED`: No email-based automatic linking or conversion of Flask
session cookies was performed.

## 10. Security-negative test results

`SYNTHETIC_VERIFIED`: Existing backend tests reject invalid state, invalid
callback parameters, disabled providers, malformed SAML responses and
signature/audience failures without weakening validation.

`REAL_PROVIDER_VERIFIED`: Authentik provider access was restricted to the
dedicated test identity. No unauthorized operational identity was tested and
no existing identity was enumerated.

`NOT_VERIFIED`: Real-provider replay, wrong issuer/audience, expired assertion,
disabled-user and unauthorized-user browser cases remain pending the safe
callback environment.

## 11. Application compatibility fixes

`SOURCE_VERIFIED`: No application authentication behavior was changed as a
result of the real-provider observations. No Authentik-specific bypass,
signature-validation relaxation, callback wildcard or provider secret was
added.

The following test-only configuration cleanup was applied after the acceptance
run:

- Replaced `frontend/vitest.config.ts` with
  `frontend/vitest.config.mjs` to remove the Vite native-loader warning.
- Configured Vitest with `pool: "vmThreads"`, preserving per-file isolation.
- Set a 15-second test timeout to avoid the previously observed borderline
  component-test timeout.

This is test-runner configuration only and does not alter application runtime
behavior.

## 12. Test resource cleanup

`NOT_VERIFIED`: Cleanup was intentionally not executed in this continuation
because deletion of the test-only Authentik resources requires a fresh explicit
confirmation before destructive action. No unrelated resources are targeted.

The known exact test-only identifiers are retained for a future targeted
cleanup:

- `prg32-m52g23-oidc-fcb61d`
- `prg32-m52g23-saml-fcb61d`
- `prg32-m52g23-fcb61d`
- The same milestone-specific provider/admin identifiers in the disposable
  writer database.

No administrator password, token, cookie or provider secret is present in the
repository or this report.

## 13. Files changed

`SOURCE_VERIFIED`: The repository already contained the Fastify federation,
OIDC/SAML and disposable-runtime implementation from previous milestones. No
new application compatibility patch was required for M5.2g.23.

The direct change associated with the resumed task is:

- Added `frontend/vitest.config.mjs`.
- Removed `frontend/vitest.config.ts`.

Existing unrelated worktree changes from earlier milestones were preserved and
were not reset, cleaned or rewritten.

## 14. Regression verification

All commands below were executed with Node.js 24 selected through `nvm use 24`.

| Command | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 49 files, 244 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `git diff --check` | PASS |

The full frontend Vitest run after the configuration fix completed without the
worker-environment warning and without failures.

`NOT_VERIFIED`: A real browser acceptance run was not completed. The
milestone's Playwright/browser gate therefore remains open; no browser
credentials, cookies or traces were persisted.

## 15. Remaining operational blockers

`NOT_VERIFIED`: A disposable Fastify callback-capable edge is still required
for real OIDC code exchange and SAML assertion return.

`NOT_VERIFIED`: The isolated writer must be able to reach
`sso.dream.test` without attaching test services to or modifying the
operational `dream_edge` topology.

`NOT_VERIFIED`: Real browser login, canonical session creation, logout and
identity continuity remain unaccepted.

`NOT_VERIFIED`: Test-only Authentik resources remain pending targeted cleanup.

These blockers prevent both operational cutover and Flask retirement.

## 16. Required operator decisions

The next controlled run requires:

1. Explicit confirmation to delete the exact test-only Authentik and disposable
   writer resources listed above.
2. A disposable callback path that is reachable by both the browser and the
   real Authentik instance, without changing production Traefik, DNS or
   Authentik configuration.
3. A decision on whether browser acceptance may use an approved interactive
   test identity flow, subject to the existing Authentik policies.

No decision authorizes production cutover by itself.

## 17. Recommended next milestone

Repeat the real-provider acceptance only after a disposable dual-origin edge
is available and independently verified. The rerun should use fresh test-only
resources or the explicitly retained namespace, complete one OIDC and one SAML
browser flow, verify session/logout behavior, run the negative matrix, and then
perform exact-resource cleanup.

Do not begin operational cutover or Flask retirement before that acceptance is
complete.

## 18. GO/NO-GO decisions

| Decision | Result |
|---|---|
| Real Authentik OIDC integration | `REAL_AUTHENTIK_CALLBACK_BLOCKED` |
| Real Authentik SAML integration | `REAL_AUTHENTIK_CALLBACK_BLOCKED` for full acceptance; metadata/redirect partial only |
| Browser acceptance | `NOT_VERIFIED` |
| Test-resource cleanup | `NOT_VERIFIED` — explicit destructive confirmation pending |
| Operational cutover | `OPERATIONAL_CUTOVER_NO_GO` |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` |

The report does not claim real login success from metadata inspection or
synthetic callback tests.
