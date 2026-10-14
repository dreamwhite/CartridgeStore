# PRG32 Cartridge Store — M5.2g.24 Real Authentik Callback Recovery

Date: 2026-10-14  
Decision: `REAL_AUTHENTIK_INTEGRATION_GO`  
Operational cutover: `NO-GO`  
Flask retirement: `NO-GO`

## 1. Executive decision

The real Authentik OIDC and SAML acceptance gate is closed for the disposable
development stack. Existing M5.2g.23 resources were reused without deletion,
disabling, or unnecessary recreation:

- OIDC: `prg32-m52g23-oidc-fcb61d`
- SAML: `prg32-m52g23-saml-fcb61d`
- dedicated user: `prg32-m52g23-fcb61d`

Both real browser flows reached Fastify on `api.prg32.dream.test`, created a
canonical session, showed the account in Next.js on `store.prg32.dream.test`,
and logged out successfully.

Evidence: `REAL_PROVIDER_VERIFIED`, `BROWSER_VERIFIED`, `DOCKER_VERIFIED`.

## 2. Safety and authorization

Only the dedicated Authentik test namespace, its two applications, and its
dedicated user were used. The dedicated test-user password was reset as
authorized for this acceptance. No global Authentik flow, unrelated provider/user,
Traefik configuration, DNS record, operational database, object store, or
production container was changed.

Temporary test credentials were used only in memory for the disposable
acceptance. They were not printed, persisted, or included in source,
fixtures, logs, or this report. No cookies, codes, state values, nonces, SAML
assertions, tokens, or credentials are included here.

Evidence: `SOURCE_VERIFIED`, `BROWSER_VERIFIED`.

## 3. Previous failure reproduction

The M5.2g.23 OIDC failure was reproduced before the fix: host requests to
`sso.dream.test`, `api.prg32.dream.test`, and `store.prg32.dream.test` worked,
but the disposable writer resolved `sso.dream.test` to loopback and received
connection refusal. After routing was corrected, Node HTTPS rejected the
mkcert chain because the CA was not trusted in the container.

Evidence: `DOCKER_VERIFIED`, `REAL_PROVIDER_VERIFIED`.

## 4. Network root cause

The failure was disposable-container egress and CA trust, not an Authentik
issuer or metadata failure. The accepted origins remain:

- `https://store.prg32.dream.test`
- `https://api.prg32.dream.test`
- `https://sso.dream.test`

Evidence: `DOCKER_VERIFIED`, `SOURCE_VERIFIED`.

## 5. Disposable network remediation

For this run only, the disposable `auth-writer` used an untracked temporary
override that mapped the three test hostnames to `host-gateway`, mounted the
local mkcert root CA read-only, set `NODE_EXTRA_CA_CERTS`, ran the existing
Fastify watcher, and enabled federation auto-provisioning only in the
isolated writer.

From inside the writer, OIDC discovery returned HTTP 200, SAML metadata was
reachable over verified HTTPS, provider listing returned HTTP 200, and both
public origins returned successfully. The override was removed after testing;
no tracked Compose file was modified and no disposable service was attached
to `dream_edge` by this milestone.

Evidence: `DOCKER_VERIFIED`, `REAL_PROVIDER_VERIFIED`.

## 6. Callback routing architecture

```text
Browser
  ├─ store.prg32.dream.test  → Next.js storefront
  └─ api.prg32.dream.test    → existing edge route → Fastify auth writer
                                ├─ /api/auth/oidc/<provider>/callback
                                └─ /api/auth/saml/<provider>/acs
```

Exact callbacks:

- `https://api.prg32.dream.test/api/auth/oidc/prg32-m52g23-oidc-fcb61d/callback`
- `https://api.prg32.dream.test/api/auth/saml/prg32-m52g23-saml-fcb61d/acs`

Provider routes remain under `/api/auth`; local session routes support the
existing `/auth/*` paths plus compatible `/api/auth/*` aliases.

Evidence: `SOURCE_VERIFIED`, `BROWSER_VERIFIED`.

## 7. Clean Chromium acceptance

A controlled Chromium/IAB tab reached the real Authentik flow, showed the
existing dedicated test application, and returned to the Store origin. The
previous browser `ERR_BLOCKED_BY_CLIENT` condition did not block this run.
The application identity was the dedicated non-administrator test user.

Evidence: `BROWSER_VERIFIED`.

## 8. Real OIDC configuration

The existing OIDC provider remained enabled and was not recreated. Fastify
used its existing issuer and exact redirect URI. Discovery and JWKS access
were verified over HTTPS from the disposable writer. The initial callback
also reproduced the expected explicit-link failure, proving that code
exchange and protocol validation had completed before linking.

Evidence: `REAL_PROVIDER_VERIFIED`, `DOCKER_VERIFIED`.

## 9. Real OIDC results

OIDC passed login initiation, real Authentik authentication, exact callback
return, code/issuer/nonce/PKCE/signature validation, canonical identity
resolution, session rotation, Next.js account display, logout, and repeated
login idempotency. The final browser state showed the dedicated username and
a working `Sign out` control.

Evidence: `REAL_PROVIDER_VERIFIED`, `BROWSER_VERIFIED`.

## 10. Real SAML configuration

The existing SAML provider remained enabled and unchanged. Fastify used the
existing entity ID, ACS, persistent NameID format, and trusted Authentik
certificate. Metadata and the real redirect were verified over HTTPS. The
first ACS attempt reached Fastify and returned the intentional
`saml_identity_conflict` response because an explicit canonical link was
required.

Evidence: `REAL_PROVIDER_VERIFIED`, `DOCKER_VERIFIED`.

## 11. Real SAML results

After the explicit disposable identity link, SAML passed the real Authentik
application, signed response POST to the exact ACS, issuer/signature checks,
audience/destination/time/correlation/replay checks, canonical identity
resolution, session rotation, Next.js account display, and logout.

The disposable database showed OIDC and SAML links assigned to the same local
test user and no active session rows after logout.

Evidence: `REAL_PROVIDER_VERIFIED`, `BROWSER_VERIFIED`, `DOCKER_VERIFIED`.

## 12. Canonical identity mapping

| Protocol | Provider | Local account | State |
|---|---|---|---|
| OIDC | `prg32-m52g23-oidc-fcb61d` | dedicated test user | active |
| SAML | `prg32-m52g23-saml-fcb61d` | same dedicated test user | active |

Subjects were not printed. Read-only inspection verified only provider,
issuer, local user, subject length, and login timestamps. The SAML mapping
was created through the existing protected federation administration API after
local administrator reauthentication. No email-only implicit linking was
introduced.

Evidence: `REAL_PROVIDER_VERIFIED`, `SYNTHETIC_VERIFIED`.

## 13. Session and logout acceptance

The browser acceptance verified callback session rotation, authenticated
Next.js account state, dual-origin `GET /api/auth/me`, CSRF-protected
`/api/auth/logout`, anonymous state after logout, no active disposable session
rows after logout, and repeated OIDC/SAML login for the existing identity.

Evidence: `BROWSER_VERIFIED`, `DOCKER_VERIFIED`, `SYNTHETIC_VERIFIED`.

## 14. Negative security matrix

Existing synthetic coverage continues to reject unknown/retired OIDC keys,
invalid OIDC issuer/audience/nonce/state, unlinked OIDC identities, invalid
SAML issuer/signature/audience/destination/recipient/time, invalid SAML
correlation, replayed SAML responses, unknown/conflicting SAML identities,
logout without CSRF, and malformed session cookies. The real run additionally
observed the intended SAML conflict before linking.

Evidence: `SYNTHETIC_VERIFIED`, `REAL_PROVIDER_VERIFIED`.

## 15. Compatibility fix

The real browser run exposed one defect: Next.js called `/api/auth/me`, while
Fastify exposed only `/auth/me` and `/api/me`. The callback succeeded, but the
frontend then rendered an authentication error because the session lookup was
404.

`backend/src/auth/routes.ts` now registers `/api/auth/*` aliases for CSRF,
local login/registration, registration completion, logout, current user, and
token list/create/update/revoke. Existing `/auth/*` and `/api/me` routes
remain intact. `backend/tests/auth.test.ts` verifies an authenticated rotated
session through `/api/auth/me`.

Evidence: `SOURCE_VERIFIED`, `SYNTHETIC_VERIFIED`, `BROWSER_VERIFIED`.

## 16. Preserved resources

Preserved: the Authentik namespace `prg32-m52g23-fcb61d`, both provider and
application pairs, the dedicated test user, callback registrations, public
origins, and the external reverse-proxy arrangement. The dedicated test-user
password reset was the only Authentik user change; no unrelated Authentik
resource was modified.

Evidence: `SOURCE_VERIFIED`, `REAL_PROVIDER_VERIFIED`.

## 17. Temporary cleanup

The temporary Compose override was outside the repository and was removed.
No tracked Compose file, environment file, operational container, volume,
network, or Traefik configuration was deleted, pruned, restarted, or
reconfigured. The browser was left at anonymous Store login state and no auth
trace was saved. The dedicated test-user password reset is the only persistent
Authentik change and remains within the authorized test scope.

Evidence: `SOURCE_VERIFIED`, `BROWSER_VERIFIED`.

## 18. Files changed in M5.2g.24

- `backend/src/auth/routes.ts` — dual-origin local authentication aliases.
- `backend/tests/auth.test.ts` — `/api/auth/me` compatibility regression.
- `docs/modernization/110-real-authentik-callback-m5-2g-24.md` — this report.

Earlier worktree changes from previous milestones were preserved and are not
reclassified here.

Evidence: `SOURCE_VERIFIED`.

## 19. Regression verification

Executed results:

- `source "$HOME/.nvm/nvm.sh" && nvm use 24`: PASS.
- Backend typecheck, lint, and build: PASS.
- Frontend typecheck and lint: PASS.
- Frontend tests: PASS — 22 files, 65 tests.
- Frontend production build: PASS.
- `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build`: PASS.
- Python pytest: PASS — 64 tests.
- Python `py_compile`: PASS.
- `docker compose --profile dev config --quiet`: PASS.
- `git diff --check`: PASS.

The default parallel backend command reported 8 contention timeouts after
236 tests had passed. The accepted serialized verification completed:

`pnpm --dir backend exec vitest run --pool=threads --maxWorkers=1
--minWorkers=1 --no-file-parallelism`: **PASS — 49 files, 244 tests**.

Evidence: `SYNTHETIC_VERIFIED`, `DOCKER_VERIFIED`.

## 20. Remaining blockers

Operational cutover remains blocked by writer handover, real-data migration,
production session continuity, operational backup/restore and rollback,
post-cutover write reconciliation, and final ownership decisions for
publishing, review, telemetry, scores, metrics, multiplayer, and mDNS.
Flask remains authoritative and no operational routing or data was changed.

Evidence: `SOURCE_VERIFIED`, `NOT_VERIFIED` for operational gates.

## 21. Recommended next milestone

Make candidate container-to-public-origin routing and CA trust explicit, add
non-secret automated callback acceptance around both providers, decide
production identity-link and session-continuity policy, close writer and
rollback gates, and repeat final readiness review before any cutover decision.

Do not delete the M5.2g.23 Authentik test resources.

## 22. GO/NO-GO decisions

| Decision | Result |
|---|---|
| Real OIDC provider integration in disposable stack | **GO** |
| Real SAML provider integration in disposable stack | **GO** |
| Browser dual-origin acceptance | **GO** |
| Canonical identity/session mapping | **GO** |
| Local `/api/auth/*` compatibility | **GO** |
| Operational public cutover | **NO-GO** |
| Real-data migration | **NO-GO** |
| Flask retirement | **NO-GO** |
| Production Authentik/Traefik modification | **NO-GO** |

Final milestone decision: **M5.2g.24 GO for isolated real-provider
acceptance; NO-GO for operational cutover and Flask retirement.**
