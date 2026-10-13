# PRG32 Cartridge Store — M6.3d.2h.5b Federation Certificate Lifecycle, Revocation & Provider Operations

## 1. Milestone status

Implementation is complete for the authorized containment scope. The full
browser lifecycle gate was intentionally not completed on the user's request;
therefore this milestone is **implementation complete, verification incomplete,
NO-GO for production federation rollout**.

## 2. Scope

This milestone covers provider disablement/deletion boundaries, transaction
revocation, identity-link retirement, local-account disablement, OIDC signing
key rollover, SAML trust-set rollover, encrypted provider-secret rotation, and
safe provider-operation status.

## 3. Explicit non-goals

No Flask changes, firmware changes, SQLite schema redesign, production routing,
Traefik configuration, deployment, real Authentik credentials, real provider,
CRL/OCSP implementation, frontend login, or M6.3d.2h.6 work was performed.

## 4. Findings addressed

- Provider state is rechecked at both OIDC callback and SAML ACS.
- Pending transactions carry a provider generation and are invalidated on
  disablement or security changes.
- Re-enabling a provider cannot revive transactions created before disablement.
- SAML trust is bounded to an additive maximum of two certificates.
- Safe provider status exposes SHA-256 certificate fingerprints, never PEM or
  secrets.
- Existing-session invalidation is applied when a local account is disabled.
- External errors remain stable and do not expose raw exception strings.

## 5. Provider lifecycle state model

The implementation distinguishes provider enabled/disabled state, provider
generation, pending transaction state, identity-link active/retired state,
local account enabled/disabled state, and protocol trust material. Provider
deletion remains a future administrative operation; callers must retire links
and revoke pending work before deletion.

## 6. Generation and transaction invalidation

`federation_providers.generation` and
`federation_transactions.provider_generation` were added through idempotent
migration version 5. Callback consumption rejects disabled providers or a
generation mismatch with `federation_transaction_revoked`. Disablement and
secret/trust updates consume outstanding transactions atomically.

## 7. Provider disablement and re-enable

Disablement increments generation and consumes pending transactions. Re-enable
does not restore them. The provider state is checked after the external IdP
has authenticated the user and immediately before protocol completion.

## 8. Identity-link retirement

Retirement uses the existing identity unlink boundary and preserves the
reserved subject. A later callback receives `oidc_identity_link_required` or
`saml_identity_link_required`; the subject is not silently linked to another
local account.

## 9. Local-account disablement and sessions

The provider operation delegates local-account disablement to the existing
account access invalidation path. Existing sessions and tokens are revoked when
an account is disabled. Re-enabling permits a fresh authentication only; it
does not restore old sessions.

## 10. Session policy matrix

| Event | Existing session | New OIDC callback | New SAML callback |
|---|---|---|---|
| Provider disabled | remains subject to normal session policy | reject | reject |
| Provider re-enabled | not restored if explicitly revoked | allowed if a new transaction is created | allowed if a new transaction is created |
| Identity link retired | existing local session follows account policy | reject | reject |
| Local account disabled | revoke immediately | reject | reject |
| Local account re-enabled | old session remains invalid | fresh login only | fresh login only |

## 11. OIDC signing-key lifecycle

The OIDC verifier retains bounded discovery caching (16 providers, five-minute
TTL, five-second network timeout, one MiB response limit) and validates the
discovered issuer/JWKS relationship. JWT verification remains issuer,
audience, nonce, `azp`, and RS256 constrained. No arbitrary `kid` URL is
accepted.

Fixture coverage exercises initial key A, overlap with key B, B authentication,
retirement of A, rejection of A, and acceptance of B. Temporary JWKS recovery
and real Authentik key rotation remain unverified in this milestone.

## 12. OIDC secret rotation

`rotateProviderSecret` stores provider-scoped OIDC secrets through the existing
encrypted secret store, increments generation, and consumes pending work in one
SQLite transaction. Wrong-purpose/provider mismatches fail closed. Secrets are
not returned by status or logs.

## 13. SAML certificate lifecycle

SAML providers now support an explicit trust set of one or two normalized
certificates/public keys. The active set can overlap A+B during rollover and
then be reduced to B. Expired X.509 certificates are rejected. Incoming
embedded certificates are never trusted.

Fixture coverage exercises A+B overlap, rejection of retired A, and acceptance
of B. CRL, OCSP, emergency compromise revocation, and real Authentik
certificate rotation are deferred and not claimed as implemented.

## 14. Certificate validation policy

Malformed certificates produce stable federation errors. X.509 certificate
validity windows are checked at provider configuration/use. Public-key fixtures
remain accepted for compatibility with the existing test adapter.

## 15. Safe provider status

The internal operations service reports provider identifier, protocol, display
name, enabled state, generation, pending count, update timestamp, and SAML
certificate SHA-256 fingerprints. No private key, client secret, token, cookie,
raw XML, or PEM is included.

## 16. Pending-operation controls

The operations service supports bounded pending-count inspection and explicit
pending revocation. Both operations use existing provider and transaction
services rather than duplicating protocol logic.

## 17. Authorization boundary

Production administrative HTTP routes were not added. The disposable lifecycle
route is enabled only in `authWriteMode=test`, requires a generated 32-byte
test token with constant-time comparison, and is not exposed in normal modes.
Production administration remains required work using native RBAC, CSRF,
reauthentication, and audit controls.

## 18. Audit behavior

Provider state changes, secret rotation, pending revocation, identity retirement,
and local-account state changes use the existing audit context where available.
The disposable test operator uses actor id zero only inside the isolated test
profile.

## 19. Error leakage

Lifecycle test routes return stable generic envelopes. Protocol services retain
safe public error codes while logging diagnostics server-side. Raw exception
messages and secret material are not returned to clients.

## 20. Database compatibility

The only database change is additive, idempotent federation migration version 5.
No existing Flask/SQLite schema or production database was modified. Existing
legacy SAML certificate data is read as a one-element trust set.

## 21. Files added

- `backend/src/federation/operations.ts`
- `backend/src/federation/lifecycle-test-routes.ts`
- `backend/src/auth/account-state.ts`
- `backend/tests/federation-lifecycle.test.ts`
- Updated OIDC and SAML protocol fixtures for rollover coverage.
- This report.

## 22. Files modified

- `backend/src/db/federation-migrations.ts`
- `backend/src/federation/provider.ts`
- `backend/src/federation/transaction.ts`
- `backend/src/oidc/service.ts` integration points were preserved.
- `backend/src/saml/service.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`
- Disposable Authentik provisioning, Compose environment, and E2E runner.
- `docs/modernization/19-revised-migration-roadmap.md`

## 23. Compatibility evidence

Existing OIDC/SAML contracts, identifiers, callback cookies, redirect paths,
and stable error codes remain unchanged. The backend suite passed with 24 test
files and 126 tests.

## 24. Protocol fixture evidence

`tests/oidc.test.ts`: 4/4 passed, including signing-key overlap/retirement.
`tests/saml.test.ts`: 4/4 passed, including bounded certificate overlap and
retirement.
`tests/federation-lifecycle.test.ts`: 3/3 passed, including transaction
invalidation, bounded trust-set validation, and secret-free status.

## 25. Authentik evidence

The preceding 5a disposable generic-provider gate remains recorded as 6/6
OIDC/SAML browser scenarios across Chromium, Firefox, and WebKit. No production
Authentik provider or credentials were used. Real Authentik signing-key and
certificate rotation APIs were not exercised because the disposable provisioning
surface used by this repository does not expose a supported rotation operation.

## 26. Lifecycle browser verification

The new `./tests/integration/authentik/run.sh lifecycle` command was added and
its preflight reached healthy disposable Authentik and writer services. The
user explicitly requested skipping lifecycle verification; the run was stopped
and is recorded as **not executed to completion**, not as a pass.

## 27. Backend verification

Executed with Node 24 via `nvm use 24`:

- `pnpm run check`: PASS — typecheck, ESLint, 24 Vitest files/126 tests, build.
- `pnpm audit --prod`: PASS — no known production vulnerabilities.

## 28. Frontend verification

Executed with `FLASK_PROXY_TARGET=http://backend:5080` and Node 24:

- `pnpm run check`: PASS — typecheck, ESLint, 4 test files/10 tests, Next.js
  production build.

The existing Vite CommonJS/ESM warning remains non-fatal.

## 29. Compose and static verification

- Single-file Compose profile normalization: PASS.
- `node --check tests/integration/authentik/run-e2e.mjs`: PASS.
- `git diff --check`: PASS before documentation-only changes; rerun required
  after final edits.

## 30. Python/Flask boundary verification

Python compilation passed. The existing pytest result remains 63 passed and one
known pre-existing mDNS test failure caused by `TESTING=False` without
`SECRET_KEY`. No Flask behavior was changed to mask that failure.

## 31. Deferred or blocked items

- Real Authentik OIDC signing-key rotation and JWKS outage recovery.
- Real Authentik SAML certificate rotation and emergency revocation.
- Production provider-operation UI/API with native RBAC, CSRF, and reauth.
- Completed browser lifecycle matrix, intentionally skipped on request.
- Provider deletion workflow and durable identity-retirement administration.
- CRL/OCSP or equivalent online revocation semantics.

## 32. Rollback considerations

Rollback is additive: remove the lifecycle route registration from test mode,
revert application code to the prior provider parser, and leave migration
version 5 installed because its columns are backward-compatible. Do not delete
the new columns or alter production data manually.

## 33. TypeScript migration invariants

The future Fastify implementation must preserve: exact provider/protocol/subject
identity matching; no email auto-linking; generation-bound transactions; state,
nonce, PKCE, and browser binding; bounded discovery/JWKS fetches; issuer and
audience validation; bounded SAML trust overlap; no embedded certificate trust;
encrypted provider-scoped secrets; immediate local-account session invalidation;
stable non-leaking errors; safe fingerprint-only status; and auditability.

## 34. Acceptance decision and next milestone

The containment code and automated fixture gates are ready for review, but M6.3d.2h.5b
is not marked fully complete because the requested browser lifecycle verification
was skipped. The next authorized milestone should be a short operational
verification pass for real provider rotation support and the browser lifecycle
matrix, followed by production administration only after a separate approval.
