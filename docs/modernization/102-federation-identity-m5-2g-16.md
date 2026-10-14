# PRG32 Cartridge Store — M5.2g.16 Federation Migration & Identity Continuity

Date: 2026-10-14  
Scope: local/disposable federation migration and security verification

## 1. Executive result

Decision: **`LOCAL_FEDERATION_MIGRATION_GO`**.

The repository now has an explicit offline federation provisioning boundary.
It inventories legacy OIDC/SAML settings without exposing values, validates a
canonical provider document, maps legacy provider identifiers explicitly,
migrates exact external identities, preserves disabled-account state, rejects
ambiguous or conflicting ownership, and uses the canonical writer lease before
applying changes.

The disposable pipeline is idempotent and was exercised through synthetic
OIDC and SAML browser callbacks using identities migrated from legacy
`users.external_id`/`users.external_provider` fields. No duplicate accounts
were created.

This does not authorize an operational handover:

- **`OPERATIONAL_CUTOVER_NO_GO`**
- **`FLASK_RETIREMENT_NO_GO`**

No real Authentik, `sso.dream.test`, Traefik, DNS, operational database,
operational identity mapping, operational secret or operational Compose service
was accessed or modified.

## 2. Scope and safety

Only source code, synthetic SQLite databases, disposable canonical roots,
synthetic provider servers, local browser automation and disposable Docker
candidate services were used.

The following were not performed:

- no real OIDC or SAML authentication;
- no read of Authentik credentials, client secrets or private keys;
- no operational user migration;
- no public routing, DNS, TLS, Traefik or Compose change;
- no operational SQLite or filesystem access;
- no Flask removal, deployment, commit or push;
- no M5.2g.17 or M6.3d.2h.12 work.

The companion repository `../PRG32` was not modified. Existing unrelated
working-tree changes were preserved.

## 3. Legacy federation inventory

The legacy Flask adapters read environment variables first and fall back to
`store_settings`. The inventory function returns presence and classification
only; it never returns the value.

| Legacy field | Class | Canonical destination | Automatic migration |
|---|---|---|---|
| `oidc_enabled` | `LEGACY_ONLY` | canonical provider enabled state | No; provider remains disabled until explicit activation |
| `oidc_issuer` | `PUBLIC_METADATA` | `federation_providers.issuer` | Only with an explicit provider document |
| `oidc_client_id` | `NON_SECRET_CONFIGURATION` | `federation_providers.client_id` | Yes after validation |
| `oidc_client_secret` | `SECRET_VALUE` | encrypted `federation_provider_secrets` record | No; operator must provide a secret through the secret boundary |
| `oidc_scope` | `NON_SECRET_CONFIGURATION` | `federation_providers.scopes_json` | Yes after validation |
| `saml_enabled` | `LEGACY_ONLY` | canonical provider enabled state | No; activation is explicit |
| `saml_entity_id` | `PUBLIC_METADATA` | `federation_providers.sp_entity_id` | Only with explicit mapping |
| `saml_acs_url` | `PUBLIC_METADATA` | `federation_providers.acs_url` | Only after origin validation |
| `saml_sls_url` | `LEGACY_ONLY` | no current SLO destination | No; requires a separately approved SLO design |
| `saml_idp_entity_id` | `PUBLIC_METADATA` | `federation_providers.idp_entity_id` and issuer | Only when exact |
| `saml_idp_sso_url` | `PUBLIC_METADATA` | `federation_providers.saml_entry_point` | Yes after validation |
| `saml_idp_slo_url` | `LEGACY_ONLY` | no current SLO destination | No |
| `saml_idp_x509cert` | `PUBLIC_METADATA` | trusted IdP certificate fields | Yes after certificate validation |

SAML private signing/decryption keys are not legacy public metadata. They are
not imported from settings and must be installed through encrypted provider
secret storage using a reference. Empty values are treated as absent.

## 4. Canonical provider model

The existing provider-neutral model remains authoritative:

- provider ID is a stable lower-case canonical identifier;
- protocol is exactly `oidc` or `saml`;
- OIDC issuer uniqueness is enforced by protocol and issuer;
- SAML issuer must equal the IdP entity ID;
- SAML SP entity ID and ACS URL are explicit;
- client secrets and private keys are references, not inline values;
- providers are created disabled;
- enabling a provider is a separate explicit operation;
- generation changes invalidate pending federation transactions.

Provider matching never uses display name, email domain, username or email.
The migration key is an explicit legacy provider identifier mapped to a stable
canonical provider ID. OIDC matching uses the canonical issuer and SAML
matching uses the exact IdP entity ID/issuer.

## 5. Provider provisioning

`backend/src/federation/provisioning.ts` introduces the offline boundary.
Its input is an explicit versioned document containing canonical provider
definitions and zero or more legacy provider identifiers per provider.

Validation performs all of the following before writing:

1. requires the explicit disposable authorization token;
2. rejects malformed or oversized documents;
3. rejects inline client secrets, passwords, tokens and private keys;
4. validates provider IDs, protocol fields, URLs and certificates using the
   existing provider validator;
5. requires OIDC client ID/redirect URI and a secret reference unless the
   client-auth method is `none`;
6. validates distinct storefront/API origins when supplied and requires the
   callback on the API origin;
7. rejects duplicate provider IDs and duplicate protocol/issuer identities;
8. rejects ambiguous legacy-provider mappings;
9. refuses `enabled: true` in the provisioning document;
10. preflights all legacy identities before provider writes.

`FederationProviderService.provisionMany()` applies the complete provider set
inside one `BEGIN IMMEDIATE` transaction. An existing provider is accepted
only when all identity-bearing fields match exactly. It is never silently
overwritten. A conflict rolls back the complete provider document.

The canonical writer lease is acquired for apply mode. A held or malformed
lease fails closed. The provisioning module does not contact an IdP and does
not install secret values.

## 6. Provider matching

The document mapping is explicit:

```text
legacy-browser-oidc -> browser-oidc
legacy-browser-saml -> browser-saml
```

Unknown legacy provider references, multiple mappings, protocol conflicts,
changed issuers and changed SAML entity IDs are rejected. A legacy value such
as `oidc` or `saml` is not treated as a provider identity when multiple
providers could match it.

The provisioning tests verify both idempotent replay and a conflicting/ambiguous
document. The existing provider tests continue to cover duplicate database
identities and protocol mismatch.

## 7. External identity migration

`FederationIdentityService.inspectLegacyMappings()` and strict migration now
resolve only the explicit provider ID or explicit mapping. They preserve:

- local user ID;
- protocol;
- canonical provider ID;
- canonical issuer;
- external subject/NameID;
- disabled-user state in the users table.

They reject or record unresolved:

- unknown providers;
- ambiguous provider mappings;
- duplicate provider/issuer/subject ownership;
- conflicting local user assignments;
- missing users.

Email is never used to auto-link. Existing local users are reused only through
the exact external subject mapping. No account is silently created, activated
or reassigned. Strict mode fails before provider writes when the legacy
inventory cannot be resolved. Retry after a successful migration reports
`alreadyMapped` and does not create a second identity row.

The synthetic migration contains two legacy users, one OIDC and one SAML. The
SAML user is disabled before authentication acceptance; the identity is
preserved and login is rejected with the disabled-account decision.

## 8. Migration ordering and atomicity

The local sequence is:

1. validate the versioned provider document;
2. validate callback origins and secret references;
3. preflight the legacy identity inventory against the proposed providers;
4. acquire the canonical writer lease;
5. provision all providers in one SQLite transaction;
6. migrate identities in strict mode;
7. verify row ownership, provider uniqueness and disabled state;
8. leave providers disabled until explicit operator activation.

The provider transaction cannot partially commit. If identity migration fails
after provider transaction completion, the newly created providers remain
disabled and no partial federation activation is possible. The preflight
normally prevents that path; a future operational transaction coordinator may
combine both durable stages if a single cross-domain rollback is required.

## 9. Session transition

Flask signed cookies are not decoded or reused. The accepted policy is:

- account continuity: required and verified locally;
- session continuity: not transparent;
- controlled re-login: required after handover;
- Fastify issues a new canonical session and rotates it after a successful
  OIDC/SAML callback;
- logout revokes the canonical session;
- disabled accounts cannot log in or retain usable access;
- CSRF is issued for the new canonical session;
- API tokens remain independent bearer credentials and are not copied into
  browser sessions.

The existing local auth/CSRF/legacy-cookie tests and the migrated-user browser
test verify this policy. No claim is made that an existing Flask browser
session survives cutover.

## 10. OIDC migration acceptance

The disposable browser fixture now performs this sequence:

1. seed a legacy user with `external_provider=legacy-browser-oidc` and
   `external_id=browser-oidc-subject`;
2. provision the canonical OIDC provider through the new migration module;
3. migrate the exact subject to the existing local user;
4. explicitly enable the provider in the disposable fixture;
5. run the complete synthetic OIDC browser callback;
6. verify redirect, session issuance, account reuse and logout.

The existing OIDC service tests cover PKCE, state, nonce, issuer, audience,
JWKS validation, callback replay and invalid return paths. No duplicate account
is created by the migrated browser login.

Result: **PASS in disposable browser scope**. Real provider registration,
secret custody and issuer/JWKS availability remain operational gates.

## 11. SAML migration acceptance

The disposable browser fixture separately seeds:

- legacy provider `legacy-browser-saml`;
- canonical provider `browser-saml`;
- persistent NameID `browser-saml-subject`;
- an existing local user whose account is preserved as disabled for the
  negative path.

The positive synthetic SAML callback uses a separate enabled migrated user and
verifies account reuse and session rotation. The existing SAML service tests
cover signed response/assertion verification, issuer, audience, destination,
recipient, time bounds, correlation, replay and bounded input.

Result: **PASS in disposable browser scope**. Real IdP entity ID, ACS
registration, certificate lifecycle and SLO remain operational gates.

## 12. Negative security matrix

| Case | Result | Evidence |
|---|---|---|
| Unknown OIDC/SAML provider | PASS | Existing OIDC/SAML service tests |
| Wrong provider protocol | PASS | Provider and protocol tests |
| Duplicate provider ID/issuer | PASS | Provider constraints and provisioning tests |
| Ambiguous legacy mapping | PASS | Provisioning test |
| Missing OIDC secret reference | PASS | Provisioning validation |
| Inline secret/private key | PASS | Redaction/provisioning test |
| Changed callback origin | PASS | Origin validation test |
| Implicit provider activation | PASS | Provisioning test |
| Changed issuer/entity identity | PASS | Existing provider immutability/constraint behavior |
| Conflicting subject/local user | PASS | Identity foundation tests |
| Email collision | PASS | Existing no-email-auto-link test |
| Disabled account | PASS | Identity foundation and migrated-user tests |
| Duplicate migration attempt | PASS | Idempotent provisioning test |
| Interrupted/held writer | PASS | Lease test and backup/restore interruption tests |
| Replay callback | PASS | OIDC/SAML transaction/replay tests |
| Invalid return URL | PASS | OIDC/SAML route tests |
| Legacy cookie reuse | PASS | Browser authentication regression |
| Cross-origin cookie misuse | PASS | Existing dual-origin/browser cookie tests |
| Missing real provider configuration | NOT VERIFIED OPERATIONAL | Deliberately not accessed |

All local critical security cases fail closed. No test uses a real credential,
real user or real identity provider.

## 13. Writer ownership

Federation provider provisioning uses the existing canonical writer lease and
SQLite `BEGIN IMMEDIATE` transaction. Identity migration uses the same SQLite
transaction boundary. Session issuance/revocation remains inside the existing
Fastify `AuthService`/`SessionStore` writer boundary. Provider generation
changes invalidate pending correlation transactions.

The isolated tests verify a held writer lease is rejected, duplicate callback
consumption is single-writer safe, and no second federation-specific database
is introduced. Operational process ownership is still not transferred from
Flask.

## 14. Backup and restore

The encrypted backup-v4 regression now includes:

- canonical provider definition and enabled state;
- external identity mapping and subject;
- disabled account timestamp;
- canonical session row;
- existing provider reference relationships;
- exact restored SQLite values in a new target.

No secret value is written to the report or manifest. The provider model still
stores references, while encrypted provider secret material remains outside
the provisioning document and must pass the existing secret-store preflight.
Missing or invalid encrypted secret material is therefore a startup/readiness
failure, not a plaintext fallback.

The test uses an OIDC provider with `client_auth_method=none` and synthetic
data. It does not prove operational key custody, provider secret rotation,
Authentik client-secret availability or backup retention policy.

## 15. Authentik operational acceptance contract

The following is prepared as a future operator checklist only. It was not
executed against `sso.dream.test`.

| Gate | Required evidence | Current state |
|---|---|---|
| OIDC provider registration | Stable client ID, secret reference, issuer, redirect URI and logout policy | `CONFIGURATION_REQUIRES_OPERATOR` |
| OIDC cryptography | Signing algorithm and reachable JWKS with stable subject | `NOT_VERIFIED_OPERATIONAL` |
| SAML provider registration | IdP entity ID, SP entity ID and exact ACS URL | `CONFIGURATION_REQUIRES_OPERATOR` |
| SAML trust | Current and overlap certificates, assertion signing and validation policy | `CONFIGURATION_REQUIRES_OPERATOR` |
| Origin split | `store.prg32.dream.test` storefront and `api.prg32.dream.test` callback/API origin | `CONFIGURATION_REQUIRES_OPERATOR` |
| Identity mapping | Redacted legacy inventory mapped to canonical provider IDs and subjects | `CONFIGURATION_REQUIRES_OPERATOR` |
| Disabled accounts | Disabled state reconciled before provider activation | `CONFIGURATION_REQUIRES_OPERATOR` |
| Session policy | Controlled re-login announcement and rollback behavior | `CONFIGURATION_REQUIRES_OPERATOR` |
| Real browser acceptance | Authorized OIDC/SAML login against the configured generic provider | `NOT_VERIFIED_OPERATIONAL` |

The provider is treated as generic OIDC/SAML infrastructure. No
Authentik-specific implementation or assumption was introduced.

## 16. Implementation changes

Files changed for M5.2g.16:

- `backend/src/federation/provisioning.ts` — redacted legacy inventory,
  versioned provider document validation, origin checks, inline-secret
  rejection, explicit mapping, writer lease and offline apply boundary;
- `backend/src/federation/provider.ts` — normalized provider provisioning,
  atomic/idempotent `provisionMany()` and conflict-safe comparison;
- `backend/src/federation/identity.ts` — redacted strict legacy identity
  inspection, explicit provider mapping and unresolved-identity failure;
- `backend/tests/federation-provisioning.test.ts` — provisioning, identity,
  ambiguity, secret, disabled-user and writer-lease tests;
- `backend/tests/storage-v2-backup-v4.test.ts` — federation provider,
  identity, disabled-account and session restore assertions;
- `frontend/e2e/global-setup.mjs` — synthetic browser fixture now provisions
  and migrates identities before enabling providers;
- `frontend/e2e/m52g14.spec.mjs` — SAML assertion now checks the distinct
  migrated local user;
- this report.

No protocol implementation was rewritten. No production route, Compose file,
roadmap or operational configuration was modified.

## 17. Tests added and relevant existing coverage

New or extended coverage includes:

- four dedicated provisioning tests;
- exact OIDC and SAML legacy-to-canonical identity migration;
- idempotent retry and no duplicate identity;
- disabled-user preservation and rejection;
- inline secret and implicit activation rejection;
- origin separation and callback-origin validation;
- held writer lease rejection;
- federation provider/identity/session backup-v4 restoration.

Existing auth, OIDC, SAML, replay, CSRF, cookie, provider-admin and writer
isolation tests remain in the full suite.

## 18. Full verification results

Environment:

- Node.js `v24.20.0`, selected with `nvm use 24`;
- pnpm `12.5.1`;
- Python virtual environment `./.venv313`;
- disposable Docker candidate only.

| Command/check | Result |
|---|---|
| `pnpm run typecheck` in backend | PASS |
| `pnpm run lint` in backend | PASS |
| `pnpm run test` in backend | PASS — 49 files, 242 tests |
| `pnpm run build` in backend | PASS |
| federation targeted suite | PASS — provisioning 4, foundation 5, OIDC 6, SAML 5 = 20 tests |
| backup-v4 targeted suite | PASS — 5 tests |
| `pnpm run typecheck` in frontend | PASS |
| `pnpm run lint` in frontend | PASS |
| `pnpm run test` in frontend | PASS — 22 files, 65 tests |
| `pnpm run build` in frontend | PASS |
| `pnpm run test:e2e` in frontend | PASS — 5 tests |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| candidate Compose config | PASS |
| candidate Node 24 image build | PASS — Fastify and Next multi-stage images |
| candidate readiness smoke | PASS — both `/ready` endpoints returned `200` with database, canonical storage and writer lease available |
| `git diff --check` | PASS |

The browser run used synthetic OIDC/SAML providers and disposable identities.
The candidate Docker project and temporary roots were cleaned after the run;
no operational containers, volumes or networks were addressed.

## 19. Remaining P0/P1/P2 blockers

### P0 operational blockers

- Real provider registration and callback acceptance are not verified.
- Secret custody and secret-reference installation are not verified against
  the operational provider.
- No authorized identity inventory of the operational database exists.
- No operational writer ownership transfer or public routing switch occurred.

### P1 operational blockers

- Existing Flask sessions require controlled re-login.
- Real OIDC issuer/JWKS and SAML entity/ACS/certificate values require
  operator reconciliation.
- Disabled and deleted production accounts require a redacted pre-cutover
  reconciliation report.
- Backup-v4 key custody, rotation, retention and restore authorization remain
  operational decisions.
- Firmware/API write ownership and rollback reconciliation remain open.

### P2 follow-up

- Provide an operator-facing provisioning input workflow without exposing
  secrets.
- Decide whether SLO is required before Flask retirement.
- Decide whether the existing Drizzle usage is approved or must be removed.
- Add a separate authorized operational browser acceptance milestone.

## 20. Required future authorizations

The next operational milestone would require explicit authorization for:

1. read-only redacted inspection of the operational provider configuration;
2. a maintenance window and legacy writer quiescence;
3. canonical provider provisioning with externally supplied secret references;
4. a controlled user identity reconciliation;
5. real generic OIDC/SAML browser acceptance;
6. routing and writer ownership handover;
7. rollback policy and post-cutover write reconciliation.

This milestone does not grant any of those permissions.

## 21. Recommended next milestone

The recommended next milestone is a separately authorized **operational
federation acceptance and redacted identity reconciliation**. It should first
verify configuration and secret custody without changing routing, then execute
the provider/identity acceptance under a maintenance window. Only after that
gate is green should a cutover milestone be considered.

Do not combine that work with Flask deletion or broad Docker cleanup.

## 22. GO/NO-GO decisions

| Scope | Decision |
|---|---|
| Local federation provisioning and identity migration | **`LOCAL_FEDERATION_MIGRATION_GO`** |
| Disposable OIDC migrated-user browser flow | **GO** |
| Disposable SAML migrated-user browser flow | **GO** |
| Negative security and writer-boundary verification | **GO** |
| Federation backup/restore compatibility | **GO** in disposable scope |
| Real Authentik/provider acceptance | **NO-GO / NOT_VERIFIED_OPERATIONAL** |
| Operational cutover | **`OPERATIONAL_CUTOVER_NO_GO`** |
| Flask retirement | **`FLASK_RETIREMENT_NO_GO`** |
| M5.2g.17 | Not started |
| M6.3d.2h.12 | Not started |

M5.2g.16 is complete for its authorized local/disposable scope. The local
federation gate is closed successfully; production identity continuity and
operational handover remain intentionally blocked pending authorized external
acceptance.
