# M6.3d.2h.1 — Federated Authentication Architecture & Identity Mapping Audit

Date: 2026-10-13

Status: **Complete as an audit and architecture gate; implementation is not authorized by this milestone**

Decision: **NO-GO for production federation implementation or cutover**

## 1. Executive summary

This audit defines the final TypeScript/Fastify architecture for optional
federated authentication through OpenID Connect (OIDC) and Security Assertion
Markup Language (SAML). It does not add providers, routes, dependencies,
database objects, containers, or user-facing flows.

The current Fastify foundation has a useful local-auth boundary: password
verification is explicit, sessions are signed and server-side, CSRF errors are
stable, bearer tokens preserve firmware compatibility, and authorization is
derived from local roles and groups. It is not yet a federation-capable
identity system. In particular:

- there are no Fastify federation routes or provider configurations;
- the only external identity columns are legacy single-link fields on users;
- external identity resolution is not issuer-scoped and cannot safely represent
  multiple identities per user;
- the current session and rate-limit stores are process-local;
- the current production database writer is deliberately not enabled;
- the schema has no disabled-account field or transaction/replay store.

The target is therefore a provider-neutral identity-linking layer above local
users, with protocol adapters below it. OIDC should be implemented first with
openid-client. SAML should be implemented only with a current patched direct
library after the security regression suite is in place; the recommended
candidate is @node-saml/node-saml. @node-saml/passport-saml is not a good
Fastify boundary, and samlify is deferred pending a fresh security and Node 24
compatibility review.

The first implementation gate must add an explicit identity-link model,
disabled-account enforcement, durable one-time federation transaction storage,
provider-scoped secret references, and the provider-neutral service contract.
No automatic email linking is permitted. External groups must never elevate a
local role.

## 2. Scope, constraints, and evidence

This is M6.3d.2h.1. The identifier is available in the modernization roadmap;
no competing M6.3d.2h.1 report was found. This document records the audit
only. The following are explicitly out of scope:

- implementing OIDC or SAML;
- installing or changing npm dependencies;
- adding HTTP routes;
- changing SQLite schema or executing DDL;
- changing Flask, Jinja templates, frontend code, or Docker Compose;
- migrating production identities or production data;
- enabling an external identity provider;
- committing, pushing, or deploying.

Evidence was taken from the current Fastify source, tests, settings and secret
boundaries, the existing modernization reports, the single root Compose file,
and the companion repository at ../PRG32. The companion repository was
read-only during this audit and retains its pre-existing untracked files
docs/quickstart-qemu.md and run-qemu.

The principal local evidence is:

- backend/src/auth/password.ts:3-113 — supported password hash formats and
  constant-time verification;
- backend/src/auth/principal.ts:5-120 — local Principal construction,
  role/group loading, and bearer-token authentication;
- backend/src/auth/session.ts:3-100 — signed cookie sessions backed by an
  in-memory Map;
- backend/src/auth/service.ts:80-228 — local login, bootstrap, registration,
  session rotation, and revocation handling;
- backend/src/auth/routes.ts:145-280 — local auth, CSRF, logout, and token
  routes;
- backend/src/db/schema.ts:4-83 — current users, groups, tokens,
  registration_tokens, and store_settings objects;
- backend/src/config/env.ts:5-285 — environment validation and the current
  test-only auth-writer boundary;
- backend/src/secrets/service.ts:10-283 — envelope encryption, secret
  classification, registry, migration, and rotation;
- backend/src/authorization/permissions.ts:7-105 and
  backend/src/authorization/policies.ts:4-68 — local role and group
  authorization;
- backend/src/admin/audit.ts:7-101 — bounded JSONL administrative audit;
- docs/modernization/13-api-contracts.md — public compatibility contracts;
- docs/modernization/31-m5-a-sqlite-schema-assessment.md — schema and
  migration constraints;
- docs/modernization/45-m6-3d1-admin-settings-discovery-audit.md through
  docs/modernization/53-m6-3d2g2-sensitive-data-encryption-key-lifecycle-report.md
  — completed administrative, security, and secret-lifecycle gates.

The historical Flask adapters were also inspected for compatibility and risk.
cartridge_store/auth/oidc_adapter.py:40-97 and
cartridge_store/auth/saml_adapter.py:32-146 are not the target implementation.
Their shared upsert_external_user logic in
cartridge_store/auth/__init__.py:394-442 falls back to email or username when
the external identifier is not found. That behavior is specifically excluded
from the TypeScript design because it can link an identity to the wrong local
account.

## 3. Current Fastify authentication lifecycle

### 3.1 Registration and local login

The current local lifecycle is deliberately small and readable:

1. A local user is created through bootstrap or the registration-token flow in
   backend/src/auth/service.ts:130-228.
2. Passwords are verified against the supported Werkzeug-compatible formats in
   backend/src/auth/password.ts:75-108.
3. A successful login in service.ts:116-128 rotates the session and updates
   last_login.
4. The route layer in auth/routes.ts:211-232 applies CSRF protection to browser
   mutations and invalidates the current session on logout.
5. A bearer API token is resolved separately in auth/tokens.ts:27-120 so
   firmware and tools retain their existing contract.

There is no federation branch in this lifecycle. A future provider adapter must
return a validated external identity to the same identity service, never create
an independent authorization path.

### 3.2 Sessions, rotation, expiry, and invalidation

SessionRecord contains an identifier, user ID, CSRF token, created time, and
expiry in backend/src/auth/session.ts:3-9. SessionStore signs a cookie with
HMAC-SHA256, stores the record in a process-local Map, checks expiry, and
supports rotate and invalidate in session.ts:18-75. AuthService also compares
session.createdAt with the per-user auth_revoked_before setting in
auth/service.ts:80-114 and auth/revocation.ts:3-25.

This is acceptable for the current isolated writer test boundary, but not for
federated callbacks on multiple replicas. A callback transaction containing
state, nonce, PKCE verifier, SAML request ID, and return path must be consumed
exactly once by all replicas. Sticky routing is not a sufficient security
acceptance criterion. A shared durable store or a single-writer deployment
with a documented availability trade-off is required before federation is
enabled.

### 3.3 CSRF and callback boundaries

The current browser mutation routes require a session CSRF token; bearer-only
mutations bypass the browser CSRF check by design for firmware. A future OIDC
callback cannot use the ordinary browser CSRF header because the provider
redirect does not carry it. It must instead validate a server-side,
single-use transaction containing state, nonce, and PKCE verifier. A SAML ACS
POST similarly requires strict request correlation, signature, issuer,
audience, recipient, destination, timestamp, and replay validation.

“Callback does not use CSRF” must never mean “callback has no request
authenticity control.”

### 3.4 Disablement and admin revocation

The current users table has no disabled_at, status, or equivalent account
state. Session revocation is available, but it does not stop a future local or
federated login. The Principal loader in auth/principal.ts:90-95 queries only
the user ID and does not enforce disablement because no such field exists.

This is a hard precondition for federation. The future identity migration must
add an explicit account-state representation and apply it consistently before
password login, API-token lookup, OIDC identity resolution, SAML identity
resolution, session creation, and session refresh. M6.3d.2h.1 does not add it.

### 3.5 Current rate limiting and logging

The auth route rate limiter in auth/routes.ts:122-133 is process-local. It
must be replaced or supplemented with a shared bounded counter before exposing
provider login and callback endpoints in a multi-replica deployment. Provider
issuer, protocol, provider ID, outcome, and stable error code may be logged;
authorization codes, access tokens, ID tokens, assertions, client secrets,
private keys, raw SAML XML, and full email addresses must not be logged.

## 4. Current SQLite identity model

The users table in backend/src/db/schema.ts:4-20 contains:

- integer local ID;
- unique username and email;
- nullable password_hash;
- local role;
- nullable external_id and external_provider;
- created_at and last_login.

There is a non-unique composite index on external_provider and external_id.
The fields are not sufficient as a federation identity model:

| Gap | Consequence |
|---|---|
| Only one external pair per user | Cannot represent OIDC and SAML links together or multiple tenants. |
| No issuer or IdP entity ID | Subjects are not globally scoped; equal values across issuers collide. |
| Non-unique index | Duplicate identity claims can be stored and resolved ambiguously. |
| No protocol/provider configuration ID | OIDC and SAML namespaces cannot be separated safely. |
| No immutable-link timestamps/status | Linking, unlinking, migration, and incident response are opaque. |
| Legacy email fallback exists in Flask | Email equality could become an account takeover/linking path. |
| No disabled-account field | Revocation does not prevent new login. |
| No transaction/replay table | State, nonce, PKCE, InResponseTo, and RelayState cannot be consumed atomically. |

The nullable password_hash is compatible with an OIDC-only or SAML-only
account in principle, but only after the account-state and recovery policy are
defined. A user with no local password must retain an administrator-approved
recovery or reset path; an external provider must not become an implicit
permanent owner of the account.

### 4.1 Conceptual identity model for a later migration

The smallest safe future model is a separate
user_external_identities relation. This is conceptual only; no DDL is
authorized in this milestone.

Proposed fields:

| Field | Requirement |
|---|---|
| id | Local surrogate key. |
| user_id | Required foreign key to users with cascade on deliberate user deletion. |
| protocol | Allow-list: oidc or saml. |
| provider_id | Local immutable provider configuration identifier. |
| issuer | Exact validated OIDC issuer or SAML IdP entity ID. |
| subject | Exact validated OIDC sub or SAML NameID/subject value, with protocol-specific canonicalization. |
| created_at | Link creation time. |
| last_login_at | Last successful use, not a claim-derived authorization value. |
| unlinked_at/status | Optional explicit lifecycle state; never silently reuse a retired link. |

Required uniqueness is at least
protocol + issuer + subject, with provider_id also checked against the
selected provider configuration. A provider configuration must not permit two
ambiguous entries for the same protocol and issuer. An index on user_id is
required for account management. The subject value must be bounded and stored
as data, never as SQL or a redirect target.

The legacy users.external_id and users.external_provider fields should remain
read-only compatibility data during transition. They must not be used for new
automatic linking. A migration may import a row only from an operator-reviewed
mapping with exact provider, issuer, protocol, and subject evidence; it must
never infer ownership from email.

### 4.2 Conceptual federation transaction and replay model

A future durable transaction store must contain a bounded opaque transaction
ID, protocol, provider_id, state hash or opaque state handle, nonce hash where
applicable, PKCE verifier encrypted or protected at rest where required,
SAML request ID where applicable, exact redirect/ACS binding, created and
expiry times, consumed_at, and a normalized failure outcome. It must support
an atomic consume operation and a uniqueness/replay constraint.

Raw tokens, assertions, authorization codes, client secrets, and private keys
must not be stored in this transaction record.

## 5. Security invariants

These invariants are independent of Flask and are acceptance criteria for the
future Fastify implementation.

| ID | Invariant | Required enforcement and test |
|---|---|---|
| I-01 | A federated identity is resolved only by protocol, configured provider, exact validated issuer, and exact validated subject. | Unit tests for same subject at two issuers and two protocols. |
| I-02 | Email is an attribute, never an identity-link key. | No automatic email link; regression test with matching email and different subject. |
| I-03 | An external identity can link to at most one local user. | Database uniqueness and concurrent-link test. |
| I-04 | Linking requires an authenticated local account or explicit administrator action. | Unauthenticated link attempts fail; no first-login account takeover. |
| I-05 | External claims cannot directly set local role or administrator status. | Claims with admin/editor values remain non-privileged. |
| I-06 | External groups are ignored unless an explicit provider-scoped allow-list mapping exists. | Unknown and case-variant groups grant nothing. |
| I-07 | Local admin membership is never removed by external group synchronization. | Group-removal regression test. |
| I-08 | Disabled users cannot create or refresh local, OIDC, SAML, or token sessions. | Disablement matrix across every auth method. |
| I-09 | OIDC callback validates state, nonce, PKCE, issuer, audience, azp, signature, and time claims. | Negative tests for each missing or mismatched value. |
| I-10 | SAML ACS validates signature, issuer, audience, recipient, destination, InResponseTo, time conditions, and replay. | Signed-fixture and mutation tests, including wrapping attempts. |
| I-11 | Callback transactions and replay records are single-use and atomically consumed. | Double-submit and concurrent-consume tests. |
| I-12 | Redirect targets are same-origin or allow-listed relative paths. | Open-redirect tests for absolute, encoded, and scheme-relative URLs. |
| I-13 | No raw token, assertion, code, secret, private key, or sensitive claim is persisted or logged. | Log redaction and database inspection tests. |
| I-14 | Protocol/provider outages return stable generic errors and do not create partial users or links. | Timeout, JWKS failure, metadata failure, and transaction rollback tests. |
| I-15 | Local emergency administration remains available independently of an external provider. | Provider outage test with local admin login and revocation. |

These invariants must be copied into the M6.3d.2h.2 and M6.3d.2h.3
implementation acceptance criteria rather than hidden in adapter-specific code.

## 6. OIDC architecture

### 6.1 Provider discovery and configuration

Each provider must have a local immutable provider_id and an exact issuer
allow-list entry. Discovery starts from the configured issuer, uses HTTPS in
non-test environments, validates the returned issuer against the configured
value, and rejects metadata that changes the issuer or endpoints unexpectedly.
An arbitrary user-provided discovery URL is not acceptable because it creates
an SSRF and trust-boundary problem.

The provider configuration contains non-secret metadata such as display name,
issuer, client ID, redirect URI, scopes, enabled state, and group-claim
mapping. The client secret is referenced through the existing protected secret
boundary, not returned to the frontend or stored in ordinary settings.

### 6.2 Authorization Code + PKCE flow

The flow is:

1. A browser requests an enabled provider login.
2. The server generates fresh state, nonce, and a high-entropy PKCE verifier
   with S256 challenge.
3. The server stores a bounded, single-use transaction containing the
   provider, exact redirect binding, state/nonce material, verifier, expiry,
   and a safe return path.
4. The browser is redirected to the validated provider authorization endpoint.
5. The callback checks and atomically consumes the transaction before accepting
   the code. A code, state, or transaction cannot be reused.
6. The server exchanges the code with a strict timeout and validates the ID
   token against the issuer's JWKS and the selected client.
7. The validated issuer + sub is resolved through the identity-link service.
8. Only then is a local session created and rotated.

The callback must validate:

- exact issuer;
- ID-token signature and an explicit algorithm allow-list;
- exp, iat, and nbf with bounded clock skew;
- audience containing the configured client ID;
- azp when multiple audiences are present;
- nonce equal to the transaction nonce;
- UserInfo sub equal to the ID-token sub if UserInfo is used;
- TLS and endpoint binding through the selected provider configuration.

The implementation must not accept an access token as proof of local identity,
must not trust an unvalidated UserInfo email, and must not use a frontend-held
PKCE verifier.

### 6.3 Timeouts, outages, and replicas

Metadata discovery, authorization-code exchange, JWKS retrieval, and UserInfo
requests require finite connect and response timeouts, bounded response sizes,
and safe retry behavior. Login failure must not disclose whether a local
account exists or expose provider exception text. No local user or identity
link is committed until all validation succeeds.

The current in-memory SessionStore and rate limiter are not sufficient for
multi-replica callback processing. A shared durable transaction/replay store
is required. Provider metadata/JWKS caching must have bounded freshness,
stale-use rules, and a safe outage behavior; a stale key must not be accepted
after a signature or issuer policy failure simply because the provider is
unavailable.

The official openid-client documentation recommends issuer discovery and
demonstrates fresh PKCE and nonce material stored in the end-user session:
https://github.com/panva/openid-client/blob/main/docs/functions/discovery.md
and https://github.com/panva/openid-client/blob/main/examples/oidc.ts.
The future implementation must adapt that model to the server-side transaction
store above.

## 7. OIDC library assessment

### 7.1 openid-client

The official package manifest currently identifies openid-client 6.8.8 on the
main branch, uses ESM and TypeScript, and has a small direct dependency set
including jose and oauth4webapi:
https://github.com/panva/openid-client/blob/main/package.json.
Its v6 changelog documents the Node 20+ baseline and the ESM/TypeScript
direction:
https://github.com/panva/openid-client/blob/main/CHANGELOG.md.
Node 24 satisfies that baseline, subject to pinning and CI verification at
implementation time.

Assessment:

| Criterion | Result |
|---|---|
| OIDC discovery and Authorization Code flow | Suitable. |
| PKCE and nonce primitives | Suitable, provided the application owns transaction storage and validation policy. |
| TypeScript/ESM and Node 24 | Suitable; verify exact pinned release in CI. |
| Token/JWT validation | Suitable with explicit issuer, audience, azp, nonce, algorithm, and clock policy. |
| Fastify integration | Suitable as a transport-neutral library; route and cookie policy remain application code. |
| Dependency footprint | Acceptable; no additional auth framework is required. |
| Security posture | Prefer this maintained OIDC implementation over hand-written protocol code; still require negative tests and advisory monitoring. |
| Decision | **GO for M6.3d.2h.2 evaluation/implementation, not installed in M6.3d.2h.1.** |

Do not let the library choose account-linking, local RBAC, session persistence,
logout semantics, or provider trust. Those remain application invariants.

## 8. SAML architecture

### 8.1 Narrow profile

The first SAML profile should be SP-initiated Web SSO only:

- HTTP-Redirect binding for the AuthnRequest;
- HTTP-POST binding for the ACS;
- a stable, configured SP entity ID;
- exact ACS URL per deployment/provider;
- signed assertions and signed responses required;
- pinned or separately validated IdP metadata and certificate;
- explicit SHA-256-or-stronger signature and digest policy;
- no IdP-initiated SSO in the first release;
- no promise of global logout in the first release.

The ACS must validate the signature before consuming claims and must verify
issuer, audience, recipient, destination, InResponseTo, temporal conditions,
subject confirmation, NameID/subject, and replay. RelayState is an opaque,
bounded server-side transaction handle and never an arbitrary redirect URL.

IdP-initiated SSO is deferred because it removes the request correlation
provided by InResponseTo. If it is eventually supported, it needs a separate
security profile with explicit replay storage, strict issuer/certificate
pinning, no automatic account linking, and an operator-approved decision about
whether unsolicited login is acceptable.

### 8.2 XML and key handling

The implementation must use a maintained XML signature library and reject XXE,
DTD expansion, oversized XML, duplicate/conflicting signature structures, and
signature wrapping. XML parser behavior and assertion canonicalization are
security controls, not convenience settings.

SAML SP signing and assertion-decryption private keys are definite secrets and
must use provider-scoped protected secret references. An IdP public certificate
is not normally confidential, but it is trust material: it must be validated,
bounded, integrity-controlled, and rotated deliberately. The existing
saml_idp_x509cert setting is intentionally classified as ambiguous by the
secret lifecycle work in docs/modernization/53-m6-3d2g2-sensitive-data-encryption-key-lifecycle-report.md;
the future implementation must not place private keys in that ordinary setting.

Logout is local-first. SP-initiated SLO may be added later as best effort with
strict issuer and signature checks. A provider outage must not leave the local
session active merely because remote logout failed, and the UI must not claim
that every provider session was terminated.

## 9. SAML library assessment

### 9.1 @node-saml/node-saml

The official project is TypeScript-capable and framework/transport agnostic,
which fits Fastify better than a Passport wrapper. Its documented controls
include signed assertion/response preferences, explicit InResponseTo
validation, clock skew and assertion age limits, and signature-wrapping
defenses:
https://github.com/node-saml/node-saml.

The project documents that validateInResponseTo must be selected explicitly and
that a shared cache is required for multi-server replay protection. The future
implementation must set the strict mode explicitly rather than accepting a
library default. Current patched releases must be pinned and checked against
the project's security advisories, including the historical signature
verification advisory:
https://github.com/node-saml/node-saml/security/advisories/GHSA-4mxg-3p6v-xgq3.

Decision: **preferred candidate for M6.3d.2h.3**, conditional on a pinned
release, Node 24 CI verification, XML/security regression tests, and review of
the exact transitive xml-crypto version.

### 9.2 @node-saml/passport-saml

This package is a Passport integration rather than the direct protocol
boundary. Introducing Passport only for SAML would add an unnecessary
framework layer and complicate the provider-neutral Fastify service. It is
not selected.

### 9.3 samlify

samlify remains a technically capable candidate, but it is not selected for
the first implementation. Its official release and advisory history includes
security fixes for signature wrapping and a later XML injection advisory:
https://github.com/tngan/samlify/releases and
https://github.com/tngan/samlify/security/advisories/GHSA-34r5-q4jw-r36m.
Any future consideration would require a current patched release, a fresh
dependency audit, explicit Node 24 compatibility tests, and the same
signature-wrapping, replay, and privilege-escalation regression suite.

## 10. Provider-neutral identity interface

The protocol adapters must produce a small validated result and nothing more:

    ValidatedExternalIdentity {
      protocol: "oidc" | "saml",
      providerId: string,
      issuer: string,
      subject: string,
      email?: string,
      displayName?: string,
      groups?: string[],
      assurance?: string,
      authenticatedAt: string
    }

Only protocol, providerId, issuer, and subject participate in identity
resolution. Email, display name, groups, and assurance are informational or
policy inputs and must be bounded, normalized according to protocol rules, and
redacted from ordinary logs. The interface must carry a validation result
proving that protocol checks completed; a caller must not be able to construct
it from an unverified decoded token or assertion.

The identity service then performs:

1. provider enablement and protocol check;
2. exact external identity lookup;
3. explicit local link or operator-approved provisioning decision;
4. account-state enforcement;
5. provider-group mapping without role elevation;
6. session rotation and local principal construction.

Raw tokens, assertions, authorization codes, and provider client secrets never
cross this interface.

## 11. Provisioning, linking, and unlinking policy

The default policy is deny-by-default:

- an unknown external identity does not automatically attach to a local user;
- automatic account creation is disabled until a provider-specific provisioning
  policy is explicitly configured;
- email equality cannot create or merge a link;
- linking from an already authenticated local session requires a fresh local
  authentication or an administrator-approved action;
- a link can be removed only by the account owner with an adequate recovery
  method or by an administrator;
- unlinking the final authentication method is rejected unless an explicit
  recovery/reset procedure is used;
- provider disablement stops new logins without deleting links;
- deletion of a provider configuration does not silently reassign identities.

If just-in-time provisioning is later approved, it must create a least
privileged local user and record the provider and issuer in the audit event.
The first successful external login must not grant publisher, editor, or admin
capabilities.

## 12. Group and role mapping

Local roles remain authoritative. The current explicit mappings in
backend/src/authorization/permissions.ts:45-99 and
backend/src/authorization/policies.ts:25-68 are the model to preserve:
unknown groups grant nothing, and catalog administration is distinct from
submission review.

External group mapping should therefore be:

- provider- and issuer-scoped;
- an explicit allow-list from an external group value to a local non-admin
  group;
- exact and case-sensitive unless a documented provider normalization rule is
  applied before mapping;
- unable to map directly to a role;
- unable to grant the local admin group;
- auditable with provider, group mapping identifier, and outcome;
- separated from manually assigned local memberships.

On login, provider-managed memberships may be reconciled according to an
explicit policy, but external absence must not remove a manually assigned
local admin or emergency membership. A provider group claim is never a
substitute for a local authorization decision.

## 13. Coexistence with local authentication

Local password authentication, bearer API tokens, OIDC, and SAML must coexist
under one Principal and authorization service. Protocol adapters may differ in
how identity is proven, but they must not bypass:

- account-state checks;
- local role/group permission evaluation;
- CSRF requirements for ordinary browser mutations;
- session rotation and revocation;
- stable error envelopes;
- audit policy.

The local emergency administrator is a required break-glass path. It must not
depend on OIDC or SAML availability and must be protected by the existing
bootstrap/secret operational controls plus a documented rate limit and
revocation procedure. Federation is not ready while a provider outage could
lock out the only administrator.

## 14. Session and browser integration

After validated identity resolution, federation uses the same local session
cookie and rotation boundary as local login. The callback must never directly
set an unvalidated user ID from a query parameter or decoded claim.

SameSite=Lax normally permits a top-level GET callback, but SAML ACS commonly
uses a cross-site POST. The implementation must explicitly test the selected
cookie policy and callback flow in supported browsers. Options are:

- use a short-lived callback transaction and a deliberately selected
  SameSite=None; Secure session policy for the federation callback;
- use a separate, narrowly scoped callback transaction cookie that is Secure,
  bounded, and still backed by server-side state;
- use a deployment-specific callback pattern that preserves CSRF-equivalent
  state and does not weaken ordinary application cookies.

Changing SameSite globally is not acceptable as a shortcut. Browser behavior,
reverse-proxy headers, HTTPS, and the configured public origin must be tested
with Traefik at store.prg32.dream.test and api.prg32.dream.test in a future
integration milestone.

## 15. Configuration and provider lifecycle

Provider configuration should be split by sensitivity:

| Material | Preferred future location | Rule |
|---|---|---|
| Provider ID, protocol, issuer, display name, enabled flag, scopes, claims mapping | Versioned protected application configuration or a dedicated bounded configuration table | No secrets; validate allow-lists and exact URLs. |
| OIDC client secret | Existing encrypted secret envelope plus external key registry, referenced by provider ID | Never frontend-visible or in logs/backups as plaintext. |
| SAML SP signing/decryption private key | Existing encrypted secret envelope with a new provider-scoped purpose | Separate from public metadata and rotate deliberately. |
| IdP certificate/metadata | Protected, integrity-controlled provider configuration or artifact store | Validate size, entity ID, certificate chain/pin, and rotation. |
| Discovery/JWKS cache | Bounded runtime cache | No authority beyond validated issuer/provider policy. |
| State/nonce/PKCE/SAML request transaction | Shared durable transaction/replay store | Single-use, expiring, atomically consumed. |

Environment variables remain appropriate for bootstrap credentials and deployment
secrets, not for an unbounded number of provider records. SQLite
store_settings is currently a key/value compatibility store and cannot safely
become an unvalidated federation registry. A future provider table plus
provider-scoped secret references is the clearest model; that migration is
deferred to implementation.

## 16. Encrypted secret integration

The secret definitions in backend/src/secrets/service.ts:10-14 currently
recognize oidc_client_secret as a definite secret and leave
saml_idp_x509cert ambiguous. This is correct for the present single-provider
legacy setting but cannot represent multiple OIDC tenants or SAML private keys.

The future design must:

- keep each provider secret under a provider-scoped reference;
- extend the envelope purpose namespace with strict provider ID validation;
- preserve purpose separation between OIDC client secrets, SAML signing keys,
  SAML decryption keys, and unrelated settings;
- use the existing external key registry and rotation behavior;
- exclude key material from frontend variables, SQLite plaintext, application
  backups, and ordinary logs;
- rotate a provider secret without changing the immutable identity link;
- treat public IdP certificates as trust material, not automatically as secret
  material;
- validate PEM/DER and metadata bounds before persisting trust material.

No secret classification, setting, envelope, or key registry code is changed by
this audit.

## 17. Frontend and auth UX audit

The current Next.js foundation has no login, provider-selection, callback,
account-linking, or unlinking UI. The API client in
frontend/src/lib/api/client.ts:27-75 already uses same-origin credentials,
stable API errors, and CSRF acquisition. The contracts and schemas in
frontend/src/lib/api/contracts.ts and schemas.ts contain only local Principal
data. This is an acceptable foundation and no frontend implementation is
needed now.

The future UX should:

- display only enabled provider labels and non-secret provider IDs;
- keep OIDC/SAML protocol details server-side;
- show generic provider-unavailable, cancelled, conflict, and disabled-account
  outcomes;
- never render raw callback query values, XML, tokens, or provider exceptions;
- provide account-linking and unlinking only from an authenticated,
  reauthentication-protected account page;
- explain that local logout may not terminate an IdP session;
- preserve a local emergency-admin path.

## 18. Proposed HTTP contract (design only)

These are proposed future contracts, not implemented routes:

| Method/path | Purpose | Security boundary |
|---|---|---|
| GET /api/auth/providers | Return enabled provider ID, protocol, label, and availability. | No secrets, issuer metadata, or internal errors. |
| GET /api/auth/oidc/:providerId/login | Begin OIDC Authorization Code + PKCE. | Provider allow-list, rate limit, safe return path. |
| GET /api/auth/oidc/:providerId/callback | Consume OIDC response. | Atomic transaction, state, nonce, PKCE, token validation. |
| GET /api/auth/saml/:providerId/login | Begin SP-initiated SAML. | Provider allow-list, opaque RelayState, rate limit. |
| POST /api/auth/saml/:providerId/acs | Consume SAML response. | Strict form size, signature, issuer, audience, request ID, replay. |
| GET /api/auth/saml/:providerId/metadata | Publish exact SP metadata if enabled. | No private material; stable provider selection. |
| POST /api/auth/logout | Local logout. | Existing CSRF/session policy. |
| POST /api/auth/federated/:identityId/link or unlink | Account management. | Authenticated reauthentication and local authorization. |

Stable failure codes should include
federation_provider_disabled, federation_transaction_invalid,
federation_signature_invalid, federation_identity_conflict,
federation_account_disabled, federation_provider_unavailable, and
federation_link_required. Responses must use the existing stable error-envelope
style and must not expose exception strings or provider response bodies.

## 19. Threat model

| Threat | Preconditions | Impact | Required mitigation/test |
|---|---|---|---|
| Email-based account takeover | Attacker controls a provider account with victim email | Login to wrong local user | Never auto-link by email; matching-email negative test. |
| Subject collision | Two issuers emit same sub | Cross-tenant login | Issuer/provider-scoped uniqueness and lookup tests. |
| State/nonce replay | Callback transaction remains reusable | Login CSRF or account confusion | Atomic consume, expiry, concurrent replay test. |
| PKCE substitution | Verifier not bound to transaction | Authorization-code interception | S256, server-side verifier, mismatch test. |
| Token issuer/audience confusion | Token from another client/provider | Wrong-account login | Exact iss, aud, azp and JWKS validation tests. |
| JWKS key confusion | Untrusted or stale key metadata | Forged token acceptance | Issuer-bound discovery, algorithm allow-list, bounded cache tests. |
| SAML signature wrapping | Malformed signed XML | Privilege or identity confusion | Maintained parser/library, signed-content binding, wrapping fixtures. |
| SAML replay | Reused response/request ID | Repeated login | InResponseTo cache, assertion ID replay store, atomic consume. |
| Open redirect | Unsafe return path or RelayState | Phishing/token leakage | Relative/allow-listed return paths; encoded bypass tests. |
| Provider outage lockout | External IdP unavailable | No administrator access | Local emergency admin and outage E2E. |
| External group escalation | Claim maps to admin/editor | Privilege escalation | Explicit non-admin allow-list and claim mutation tests. |
| Disabled-account bypass | Federation path omits account state | Revoked user regains access | Shared account-state guard on every login path. |
| Secret leakage | Logs/backups/config expose credentials | Provider compromise | Envelope/registry, redaction, backup inspection. |
| XML/HTTP resource exhaustion | Oversized metadata/assertion/JWKS | Worker exhaustion | Strict body/element/time limits and timeout tests. |
| Multi-replica race | In-memory callback state | Intermittent bypass or failed login | Durable shared transaction store and concurrent tests. |

## 20. Disposable authentik test architecture

Authentik is recommended as a disposable conformance provider, not as a
runtime dependency of Cartridge Store. The test environment should cover both
OIDC and SAML using seeded users, groups, claims, certificates, and controlled
provider settings.

The future harness should include:

- an OIDC provider with issuer, client ID/secret, PKCE, nonce, group claim,
  expired-token, wrong-audience, and rotated-JWKS cases;
- a SAML provider with signed response/assertion, audience/recipient,
  InResponseTo, expiry, replay, certificate rotation, and malformed XML cases;
- a disposable database and volume set isolated from normal dev and production;
- a private test network and explicit Traefik hostnames if browser testing
  needs the same origin;
- deterministic seed/reset scripts with no production identities or secrets;
- an outage mode that blocks the provider while the local emergency admin is
  still usable.

Because the repository policy requires one root Compose file with profiles,
M6.3d.2h.4 should decide between an opt-in authentik profile in the existing
file and a separate disposable test harness under an ops directory. The
recommendation is a separate harness or a strictly opt-in profile that has
isolated volumes, network names, secrets, and no dependency from backend,
writer, or prod profiles. No authentik service or profile is added here.

## 21. End-to-end test matrix

| Area | Positive cases | Negative/security cases |
|---|---|---|
| Provider discovery | Valid issuer and rotated JWKS | Wrong issuer, HTTP production URL, oversized metadata, timeout. |
| OIDC login | PKCE login, nonce, new linked user, existing linked user | State replay, nonce mismatch, wrong aud/azp/iss, expired token, UserInfo sub mismatch. |
| OIDC linking | Reauthentication and explicit link | Matching email without approval, duplicate subject, disabled target, unsafe return path. |
| SAML login | Signed SP-initiated response | Unsigned response, assertion-only signature mismatch, wrong audience/recipient/destination, old/future timestamps, wrong InResponseTo, replay. |
| SAML XML | Valid bounded assertion | XXE/DTD, wrapping, duplicate subject/signature, oversized form/XML. |
| Groups | Allow-listed non-admin mapping | Unknown group, case variant, external admin claim, external group removal of local admin. |
| Session | Rotation, CSRF after callback, local logout | Reuse old session, callback without transaction, multi-replica transaction miss. |
| Account state | Local and federated enabled user | Disabled local user through password, bearer, OIDC, SAML, refresh. |
| Resilience | Provider unavailable with local admin | Partial user/link, raw error leakage, outage lockout. |
| Secrets | Provider-scoped secret lookup and rotation | Plaintext secret, wrong-purpose key, backup/key/log leakage. |

All tests are future work. This audit does not create fixtures or add a
provider.

## 22. Migration feasibility and conceptual DDL

The migration is feasible without changing public firmware identifiers, but it
requires a controlled schema gate before production federation:

1. add explicit account state to users;
2. add user_external_identities with provider/issuer/subject uniqueness;
3. add provider configuration and secret-reference boundaries;
4. add durable federation transaction/replay storage;
5. backfill only operator-reviewed identity mappings, if any;
6. preserve legacy external columns read-only during a deprecation window;
7. add indexes and idempotent migrations;
8. verify rollback and orphan prevention with disposable data.

A conceptual SQL shape is:

    user_external_identities(
      id primary key,
      user_id references users(id),
      protocol check (protocol in ('oidc', 'saml')),
      provider_id,
      issuer,
      subject,
      created_at,
      last_login_at,
      status,
      unique(protocol, issuer, subject)
    )

This is a design sketch only, not executable migration instructions. No
production schema change is authorized by M6.3d.2h.1.

## 23. Deployment and operational considerations

Federation must remain opt-in and disabled by default until all controls pass.
The public origins are currently store.prg32.dream.test and
api.prg32.dream.test behind Traefik. Future callback URLs, cookie Secure
flags, forwarded-proto handling, and CORS/same-origin assumptions must be
tested through the same reverse proxy topology.

Before production:

- use a durable/shared session and federation transaction store;
- choose one writer boundary and document SQLite concurrency;
- set finite provider HTTP, XML, form, and JWKS limits;
- provide key/certificate rotation and rollback runbooks;
- monitor discovery, JWKS, token exchange, callback validation, replay,
  linking, disablement, and provider outage outcomes;
- retain no raw protocol payloads by default;
- verify local emergency-admin access in a provider outage;
- run the full E2E matrix against disposable providers;
- keep Flask and Jinja behavior unchanged until an independently approved
  cutover milestone.

## 24. Observability and audit events

The bounded administrative audit in backend/src/admin/audit.ts:7-101 supports
event IDs, actor, target, action, outcome, and request ID with a 4 KiB record
limit. Future federation events should use stable action names such as:

- federation.login.attempted / committed / rejected;
- federation.identity.linked / unlinked;
- federation.provider.failure;
- federation.account.disabled_login;
- federation.transaction.replay.

Records should contain provider ID, protocol, stable error code, outcome, and
request ID where useful, but not raw email, token, assertion, code, state,
nonce, PKCE verifier, RelayState, certificate private key, or provider
exception text. If the existing bounded schema cannot carry a necessary
security fact, extend it deliberately in a later milestone; do not serialize
an unbounded claims object into the audit line.

## 25. Dependency decision matrix

| Dependency | Role | Node 24/TS fit | Security/maintenance assessment | Decision |
|---|---|---|---|---|
| openid-client | OIDC discovery, authorization-code exchange, protocol primitives | ESM/TS; documented Node 20+ baseline | Maintained official package with small direct dependency set; still pin and test | Preferred for h2 |
| @node-saml/node-saml | Direct SAML SP protocol boundary | TS and transport-neutral | Good fit; explicit replay/signature controls required; monitor advisories | Preferred candidate for h3 |
| @node-saml/passport-saml | Passport SAML adapter | Adds Passport boundary | Unnecessary abstraction for Fastify | Not selected |
| samlify | SAML alternative | Node 24 compatibility must be verified | Past signature-wrapping and later XML injection advisories require fresh audit | Deferred |

No package was installed or changed. The exact versions must be pinned only
after the implementation milestone verifies the current advisories, lockfile,
Node 24 CI, and transitive XML/JWT dependencies.

## 26. Future implementation milestones

### M6.3d.2h.2 — OIDC implementation

Objective: add one provider-neutral OIDC adapter and safe identity linking.

Scope: provider configuration, openid-client at a pinned version, discovery,
Authorization Code + PKCE, nonce/state transaction storage, issuer/audience/
azp validation, JWKS cache, local account-state checks, explicit linking,
stable errors, audit events, and tests.

Dependencies: approved account-state and identity-link schema, durable
transaction/replay storage, provider-scoped secret references, local emergency
admin.

Likely files: backend/src/auth, backend/src/db, backend/src/config,
backend/src/secrets, backend/src/authorization, backend tests, and a
contract/test-fixture directory. Frontend changes are separate and minimal.

Acceptance: I-01 through I-09 and I-11 through I-15 pass; no email
auto-linking; no raw material in logs; local auth remains compatible; no
Flask/Jinja or firmware contract change.

Rollback: disable the provider and remove routes/configuration through the
approved migration rollback; preserve local auth and links as inert data.

Exclusions: SAML, IdP-initiated login, global logout, production cutover, and
automatic identity backfill.

### M6.3d.2h.3 — SAML implementation

Objective: add the narrow SP-initiated SAML profile after the OIDC identity
boundary is proven.

Scope: direct SAML adapter, signed SP-initiated requests, HTTP-POST ACS,
strict XML and assertion validation, shared InResponseTo/replay storage,
provider-scoped certificate/key references, stable errors, and regression
fixtures.

Dependencies: h2 identity service, durable transaction/replay model, exact
patched library decision, XML security review, certificate rotation plan.

Acceptance: I-01 through I-08 and I-10 through I-15 pass, including wrapping,
XXE, replay, wrong audience/recipient/destination, and provider outage tests.

Rollback: disable SAML providers and leave local/OIDC links intact; do not
delete identity records as a rollback shortcut.

Exclusions: IdP-initiated SSO, unconditional SLO, private-key storage in
ordinary settings, and production cutover.

### M6.3d.2h.4 — authentik disposable E2E

Objective: validate OIDC and SAML behavior against a disposable real provider.

Scope: opt-in single-Compose-profile or isolated harness, seeded users/groups,
browser callback tests through Traefik, key rotation, outages, replay,
disablement, and reset.

Dependencies: h2 and h3 implementation, test-only provider secrets, isolated
volumes/network, no production data.

Acceptance: the complete matrix in section 21 passes and local emergency admin
remains usable while authentik is unavailable.

Rollback: remove only the disposable harness/profile and volumes after an
explicit test teardown; no application or production data is involved.

Exclusions: making authentik a runtime dependency, enabling production SSO,
or changing root production routing.

## 27. Verification results for this audit

Only documentation was changed in M6.3d.2h.1. The following checks were
executed after the report and roadmap edit:

    source "$HOME/.nvm/nvm.sh" && nvm use 24
    cd backend && pnpm run check
    cd ../frontend && FLASK_PROXY_TARGET=http://flask:5080 pnpm run check
    cd .. && docker compose --profile dev --profile backend --profile writer \
      --profile writer-init --profile prod config
    git diff --check
    git status --short
    git -C ../PRG32 status --short

Results:

- Node 24.20.0 was selected with nvm use 24.
- Backend pnpm run check passed: typecheck, ESLint, 20 Vitest files, 111
  tests, and TypeScript build.
- Frontend FLASK_PROXY_TARGET=http://flask:5080 pnpm run check passed:
  typecheck, ESLint, 4 Vitest files, 10 tests, and Next.js production build.
  Vitest emitted the existing Vite CommonJS/ESM configuration warning.
- docker compose with dev, backend, writer, writer-init, and prod profiles
  passed config normalization.
- python3 -m py_compile app.py cartridge_store/*.py passed.
- .venv313/bin/pytest -q ran under Python 3.13.16: 63 passed and one known
  mDNS test failed because the test intentionally invokes Flask with
  TESTING=False and no SECRET_KEY. No application code was changed to mask it.
- The older .venv/bin/pytest environment is Python 3.9 and is not compatible
  with the repository's scrypt path: it produced 16 passed, 32 failed, and
  16 errors due to missing hashlib.scrypt. This is an environment diagnostic,
  not a valid baseline result.
- git diff --check passed. The root repository contains only the two
  documentation changes from this milestone; ../PRG32 remains unchanged with
  its pre-existing untracked docs/quickstart-qemu.md and run-qemu.

No command in this milestone is permitted to mutate production data or start
an external identity provider. The known Flask baseline caveat remains the
pre-existing mDNS test failure caused by a test invoking Flask with
TESTING=False and no SECRET_KEY; it is unrelated to this documentation gate.

## 28. Confirmed remaining risks

- No Fastify federated login exists yet.
- No durable shared session or federation transaction store exists.
- No disabled-account field exists.
- Legacy external identity columns and Flask email fallback remain in the
  transitional code and must not be copied.
- The current secret namespace supports one legacy OIDC secret, not multiple
  provider references or SAML private keys.
- The current rate limiter is process-local.
- No authentik E2E provider or signed protocol fixtures exist.
- Browser SameSite behavior for SAML POST has not been verified through
  Traefik.
- Production writer/cutover remains intentionally closed.

## 29. Open decisions

The following must be resolved before h2 implementation starts:

1. Exact account-state field and admin disablement workflow.
2. Durable transaction/replay store compatible with SQLite deployment and
   future replicas.
3. Provider configuration storage and immutable provider ID policy.
4. Provider-scoped secret reference and key-rotation naming.
5. JIT provisioning default (recommended: off).
6. Whether provider-managed groups may reconcile memberships (recommended:
   allow-list only, never local admin).
7. Browser callback cookie strategy for cross-site SAML POST.
8. Exact pinned openid-client and node-saml releases after advisory review.
9. Root Compose opt-in authentik profile versus isolated disposable harness.
10. Retention and access policy for federation audit events.

## 30. Gate decision

**Architecture decision: GO for the planned OIDC-first TypeScript design.**

**Implementation decision: NO-GO for M6.3d.2h.1.** No provider, endpoint,
dependency, schema, secret, frontend flow, Docker service, or deployment was
introduced. M6.3d.2h.2 may begin only after the open decisions and the
security invariants in section 5 are accepted. M6.3d.2h.3 remains blocked on
the h2 identity boundary and the SAML library/security review. M6.3d.2h.4
remains a disposable-test milestone and must not become a production
dependency.
