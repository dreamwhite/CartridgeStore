# PRG32 Cartridge Store — M5.4.10 Federation Interoperability & Identity Linking

Date: 2026-10-15

## 1. Executive result

M5.4.10 is **PARTIAL**.

The dedicated generic OIDC provider completed a real Authentik browser flow,
was explicitly linked to the synthetic non-administrator local account, and
produced a persistent Fastify session. The session survived a local Fastify
restart, the ordinary user was denied federation administration with HTTP 403,
and storefront logout returned the browser to `/login`.

The dedicated generic SAML provider reached Authentik and posted a real
response to the Fastify ACS, but Node-SAML rejected the document signature.
The embedded certificate fingerprint matched the configured trust anchor and
the public Authentik metadata certificate. No signature validation was
weakened and no SAML session was created.

Required status:

```text
M5410_FEDERATION_INTEROPERABILITY_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Scope and safety boundary

Implemented only the federation interoperability and explicit identity-linking
boundary. No production routing, Flask code, legacy data, operational Compose
file, shared Authentik resource, Traefik configuration, or database schema was
changed.

The only runtime recreation was the isolated local Fastify container using the
existing M5.4.9 disposable integration override. Next.js was not changed or
recreated. Authentik provider IDs 9 and 10 were inspected through their public
protocol behavior and metadata; no Authentik mutation was required.

The pre-change encrypted backup was retained and independently verified:

- path: `.local/operational/backups/m5410-prechange.backup4`;
- format: backup-v4;
- verification state: complete;
- archive size: 603291 bytes.

No password, token, cookie, private key, raw OIDC claim, SAML assertion, or
external subject is included in this report.

## 3. Implementation

### 3.1 Opaque identity-link challenges

Unknown identities are now staged only after the protocol adapter has completed
its existing validation boundary.

The new `FederationLinkChallengeService` provides:

- cryptographically random opaque challenge IDs;
- five-minute expiry;
- a maximum of 64 pending challenges;
- oldest-entry eviction at the bound;
- process-memory storage only;
- invalidation on process restart;
- no subject, email, display name, or raw protocol claim in the list view.

The challenge contains the already validated `ValidatedExternalIdentity`, but
that object is never serialized into the unauthenticated callback response.
The callback returns only the opaque `link_challenge` value with the stable
`oidc_identity_link_required` or `saml_identity_link_required` error.

New administrative routes:

- `GET /api/admin/federation/link-challenges` — local administrator session
  with `federation:read`; metadata only.
- `POST /api/admin/federation/identities/from-challenge` — local administrator
  session with `federation:manage`, browser session, valid CSRF, and recent
  password reauthentication.

The link route consumes a challenge only after the canonical identity link has
committed. Its response intentionally omits the external subject. Existing
direct identity-link behavior was not removed or changed.

### 3.2 Error handling and diagnostics

OIDC and SAML errors now support a narrowly typed safe detail containing only an
opaque link challenge. No raw exception string is copied into an external
response.

SAML validation failures are classified internally into stable categories. The
classification does not contain XML or exception text. The final real-browser
failure was recorded as:

```text
validation:document_signature
```

The final diagnostic also recorded only a truncated SHA-256 fingerprint of the
embedded public certificate. It matched the configured trust material. The
diagnostic is useful for future interoperability work without logging the
assertion or its claims.

## 4. Real OIDC acceptance

The browser used the isolated origins:

- storefront: `https://m549-store.prg32.dream.test`;
- API/federation: `https://m549-api.prg32.dream.test`;
- external generic provider: `https://sso.dream.test`.

Observed sequence:

1. Fastify generated the Authentik authorization redirect with state, nonce,
   and PKCE.
2. Authentik authenticated the dedicated synthetic test identity.
3. Authentik returned to the exact Fastify callback.
4. Fastify initially returned `oidc_identity_link_required` and staged an
   opaque challenge.
5. The local administrator authenticated, supplied CSRF and recent
   reauthentication, and linked the challenge to the dedicated `user` account.
6. A subsequent real browser flow reached the storefront as the non-admin
   test user.
7. After a Fastify restart, the persisted identity mapping remained present
   and a fresh OIDC flow again authenticated the same local user.
8. Storefront logout returned the browser to `/login`.

The browser extension blocked direct display of the API callback page with
`ERR_BLOCKED_BY_CLIENT`, but the callback request reached Fastify and the
storefront session was verified through the browser accessibility tree. No
credential or callback parameter was copied into the report.

OIDC result: **PASS for real linked-session, persistence, RBAC boundary, and
logout acceptance**.

## 5. Real SAML acceptance

The dedicated SAML provider reached Authentik and posted to:

`https://m549-api.prg32.dream.test/api/auth/saml/prg32-local-operational-saml-20261015/acs`

The shared browser correlation was accepted. The response was then rejected
by Node-SAML during document-signature verification. The application returned
the stable external error `saml_response_invalid`; no session rotation and no
identity resolution occurred.

The following non-secret comparison was performed:

- configured SAML trust certificate fingerprint: matched;
- certificate embedded in the real SAML response: matched;
- certificate published by the dedicated Authentik metadata: matched;
- Node-SAML result: document-signature validation failure.

The trust anchor was therefore not replaced blindly. Accepting the response
without valid document-signature verification would violate the security
boundary. Authentik response/assertion signing compatibility with the current
Node-SAML stack remains the blocker.

SAML result: **browser reachability and correlation PASS; validated linked
session FAIL**.

## 6. Authorization and CSRF decisions

The new link redemption route reuses the existing federation administration
guard:

- unauthenticated requests receive `auth_required`;
- non-administrators receive `permission_denied`;
- bearer-only requests cannot redeem a browser challenge;
- missing or invalid CSRF receives `csrf_failed`;
- stale or absent password reauthentication receives
  `recent_reauthentication_required`;
- unknown or expired challenges fail closed;
- duplicate identity reservations remain rejected by the existing unique
  identity rules.

The real OIDC test user was assigned only the ordinary `user` role. A browser
request to federation administration was observed as HTTP 403. The local
administrator performed the link using the required CSRF and recent
reauthentication protections.

## 7. Files changed

Application code:

- `backend/src/federation/link-challenges.ts`
- `backend/src/federation/admin-routes.ts`
- `backend/src/federation/runtime.ts`
- `backend/src/app.ts`
- `backend/src/oidc/service.ts`
- `backend/src/oidc/routes.ts`
- `backend/src/saml/service.ts`
- `backend/src/saml/routes.ts`

Tests:

- `backend/tests/link-challenges.test.ts`

Documentation:

- `docs/modernization/138-federation-interoperability-m5-4-10.md`

No frontend source, Docker Compose definition, database migration, or
roadmap file was modified.

## 8. Compatibility and migration invariants

The implementation preserves these future Fastify invariants:

1. An external identity is trusted only after the protocol adapter validates
   issuer, signature, audience, request correlation, nonce/PKCE where
   applicable, timestamps, destination, recipient, and NameID constraints.
2. Email, username, or display name never links an external identity to a
   local account implicitly.
3. Identity linking is an explicit administrator operation.
4. The external identity tuple remains protocol, provider, issuer, and
   subject.
5. The subject is not exposed in a callback error or pending-challenge list.
6. A link challenge is bounded, expiring, single-use after successful commit,
   and invalidated by process restart.
7. Local account role and enabled state remain authoritative.
8. Browser mutations require the existing same-origin session, CSRF, and
   recent reauthentication controls.
9. Logout rotates/revokes the local session according to the existing auth
   service behavior.
10. SAML signature verification must not be weakened to accommodate a provider.
11. OIDC and SAML provider configuration remains generic; no Authentik-specific
    code or assumptions were introduced.
12. No schema migration is required for this milestone.

## 9. Verification commands and results

All Node commands were executed after `nvm use 24`; the local runtime reported
Node 24.x.

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 56 files, 278 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests; typecheck/lint/build pass |
| `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `docker compose -f deploy/candidate/compose.yaml config --quiet` | PASS |
| `docker compose -f deploy/operational/compose.yaml config --quiet` | PASS with disposable inline validation values; no services started |
| isolated standalone + M5.4.9 override config | PASS |
| `git diff --check` | PASS |
| isolated Fastify `/health` and `/ready` | PASS |
| isolated Fastify image rebuild | PASS |
| isolated Fastify restart persistence check | PASS |

The full Python, backend, frontend, and CLI suites were run against synthetic
or disposable data. No production database or operational persistent service
was used.

## 10. Public observation

Only low-volume non-mutating observations were made:

| Host/endpoint | Observation |
| --- | --- |
| `https://store.prg32.dream.test/` | HTTP 200 |
| `https://api.prg32.dream.test/` | HTTP 200 |
| `https://api.prg32.dream.test/health` | HTTP 404; no change made |
| `https://sso.dream.test/` | HTTP 302 to provider authentication |
| dedicated OIDC discovery metadata | HTTP 200 |
| dedicated SAML metadata | HTTP 302 in browser-facing observation; direct metadata retrieval used for certificate comparison returned HTTP 200 |

No POST, PUT, PATCH, DELETE, login form submission, administration request, or
real public-provider session was sent to the canonical public origins. The real
federation acceptance used only the isolated `m549-*` origins.

## 11. Remaining risks and blockers

1. The dedicated real SAML flow remains blocked at Node-SAML document-signature
   validation. The certificate is not the mismatch; the remaining work must
   isolate Authentik signing serialization, canonicalization, or Node-SAML
   compatibility without weakening validation.
2. The link challenge is intentionally process-local. A restart between a
   validated callback and administrator redemption requires a new login flow.
3. The browser automation environment blocks direct API callback-page display
   with `ERR_BLOCKED_BY_CLIENT`; server-side callback evidence and the
   storefront OIDC session were independently observed.
4. The canonical public origins still require a separately authorized
   operational cutover and ownership decision.
5. SAML-linked RBAC and SAML logout cannot be accepted until SAML protocol
   validation succeeds.

## 12. Rollback and recovery

No schema migration or production mutation was performed. The application
changes are reversible by restoring the pre-change source and rebuilding only
the isolated local image. The M5.4.10 pre-change backup remains available for
disposable recovery.

The OIDC identity link was created in the disposable local canonical database
through the supported administrator API. It was verified after a local Fastify
restart. This does not authorize copying the link into production or attaching
the external identity to a production account.

## 13. Next milestone recommendation

Do not begin operational cutover or Flask retirement.

The next authorized milestone should be a narrowly scoped SAML
interoperability investigation that captures only safe structural diagnostics,
compares Authentik signing configuration with Node-SAML expectations, and
keeps signature, issuer, audience, destination, recipient, temporal, and
request-correlation checks fail-closed. Once a real SAML linked session passes,
rerun the combined OIDC/SAML RBAC, CSRF, persistence, and logout acceptance
before any cutover decision.

## 14. Final decisions

| Decision | Result |
| --- | --- |
| M5.4.10 federation interoperability | **PARTIAL / NO-GO** |
| Real OIDC linked session | **GO** |
| Real SAML linked session | **NO-GO** |
| Operational cutover | **NO-GO** |
| Flask retirement | **NO-GO** |
