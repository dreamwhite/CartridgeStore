# M6.3d.2h.4 — SAML 2.0 Service Provider Implementation

Date: 2026-10-13  
Status: **complete for the isolated Fastify/TypeScript writer profile; NO-GO
for production federation, Authentik, frontend login, Flask retirement, and
deployment.**

## 1. Decision and scope

This milestone implements the narrow initial SAML profile approved by the
federation architecture:

- SP-initiated SAML 2.0 Web Browser SSO;
- HTTP-Redirect AuthnRequest;
- HTTP-POST Assertion Consumer Service (ACS);
- signed response and signed assertion validation;
- exact issuer, audience, destination, recipient, temporal, and
  `InResponseTo` checks;
- durable transaction and replay protection;
- exact pre-linked identity resolution and existing session rotation.

The implementation does not add IdP-initiated login, unsolicited responses,
Single Logout, artifact/SOAP bindings, attribute-based provisioning, automatic
account creation, email linking, group-to-role mapping, Authentik runtime
integration, frontend UI, Flask adapters, production routing, deployment, or a
storefront feature.

## 2. Dependency security gate

The selected library is the exact reviewed release
[`@node-saml/node-saml@5.1.0`](https://www.npmjs.com/package/%40node-saml/node-saml).
The upstream package documents Node LTS support, TypeScript declarations,
HTTP-Redirect request generation, HTTP-POST response validation, explicit
`validateInResponseTo: "always"`, signature algorithms, issuer/audience/time
checks, and XML Signature Wrapping protections. The implementation follows the
[upstream README](https://github.com/node-saml/node-saml/blob/master/README.md)
and keeps the package pinned rather than installing an unreviewed latest
release.

The upstream security advisories for the two critical XML-validation issues
fixed in 5.1.0 were reviewed:

- [GHSA-4mxg-3p6v-xgq3 / CVE-2025-54419](https://github.com/node-saml/node-saml/security/advisories/GHSA-4mxg-3p6v-xgq3);
- [GHSA-m837-g268-mmv7 / CVE-2025-54369](https://github.com/node-saml/node-saml/security/advisories/GHSA-m837-g268-mmv7).

The production dependency audit passed with no known vulnerabilities. The
full audit still reports pre-existing test-tool findings in Vitest/Tinypool;
they do not enter the production image and are recorded as a remaining risk.
`xml-crypto` is resolved to 6.3.3 and the direct structural XML gate uses
`@xmldom/xmldom@0.9.12`. No custom XML signature verifier or SAML parser was
introduced.

## 3. Provider configuration and schema

Federation provider configuration remains in the existing provider-neutral
service. Migration version 4 is additive and writer-only. It adds:

- IdP SSO entry point;
- IdP entity ID and SP entity ID binding through the existing fields;
- exact ACS URL;
- IdP trusted public certificate/key material;
- optional SP public certificate material;
- persistent NameID format;
- assertion-signature and response-signature policy;
- AuthnRequest signing policy;
- accepted clock skew, bounded to five minutes;
- manual metadata lifecycle policy.

Private SP signing material is referenced through the existing provider-scoped
encrypted secret store with purpose `saml-sp-signing-private-key`. It is never
accepted from the browser, logged, returned by `/api/auth/providers`, or stored
in plaintext. Provider configuration is disabled by default. The initial
runtime profile requires both response and assertion signatures and accepts
only the persistent NameID format. Transient NameIDs are rejected because they
are not a stable external identity key.

The trusted public IdP key and SP public certificate are configuration material,
not credentials; their provenance remains an administrative/provider lifecycle
responsibility. Metadata refresh is deliberately manual in this milestone.

## 4. HTTP contracts

Added routes:

| Route | Contract |
|---|---|
| `GET /api/auth/saml/:providerId/login` | Validates a local return path, creates a durable request, and redirects using HTTP-Redirect. |
| `POST /api/auth/saml/:providerId/acs` | Accepts bounded `application/x-www-form-urlencoded` `SAMLResponse` and `RelayState`, then validates and consumes the SSO transaction. |
| `GET /api/auth/saml/:providerId/metadata` | Returns SP metadata only for an enabled, complete provider. |
| `GET /api/auth/providers` | Existing safe provider metadata now includes SAML providers through the shared provider list. |

Responses use stable `{ok:false,error,code}` envelopes. Raw XML, signature
errors, certificate content, claims, secrets, and exception strings are not
returned.

## 5. AuthnRequest and metadata behavior

Each login creates a fresh request ID and opaque RelayState before invoking
Node-SAML. The custom durable cache provider confirms that the request ID is
present in the SQLite transaction store. AuthnRequests use the exact SP issuer,
entry point, ACS URL, persistent NameID format, audience, SHA-256 signature and
digest settings, and `validateInResponseTo: always`.

Request signing is policy-controlled. If enabled, the provider must have an
encrypted provider-scoped private key and a configured public certificate;
missing key material fails closed. Unsigned AuthnRequests are allowed only by
the explicit disabled request-signing policy, while the initial response
profile still requires signed responses and assertions.

Generated metadata contains the exact SP entity ID, HTTP-POST ACS, persistent
NameID format, and assertion-signing requirement. Metadata signing and SAML
decryption are not enabled as hidden fallbacks.

## 6. ACS validation boundary

Validation occurs in this order:

1. strict form size and duplicate-field checks;
2. signed browser-correlation cookie and provider-scoped transaction lookup;
3. base64 and XML envelope bounds;
4. exact root `Response` name, response ID, and ACS `Destination`;
5. Node-SAML XML signature, issuer, audience, condition, timestamp, and
   `InResponseTo` validation;
6. extraction of the assertion ID and recipient/InResponseTo from the
   library’s verified assertion representation;
7. exact IdP issuer and persistent NameID checks;
8. atomic durable transaction consumption;
9. durable response ID, assertion ID, and response-content replay insertion;
10. existing provider-neutral identity resolution and local session rotation.

The direct envelope check does not authenticate a claim by itself. The initial
profile requires a signed response, so the checked response destination and ID
are covered by the response signature before they are used for routing or
replay protection. Assertion recipient and `InResponseTo` are read only from
Node-SAML’s verified assertion object. There is no second application-level
signature implementation.

## 7. Durable correlation and replay

The existing federation transaction table stores the provider, protocol,
callback binding, hashed RelayState, request ID, expiry, and local return path.
The final consume uses `BEGIN IMMEDIATE` and a conditional single-use update.
Response IDs, assertion IDs, and a bounded response digest are inserted into
the existing replay table. Replays are rejected before identity resolution.

The browser binding is intentionally SAML-specific. The HttpOnly cookie is
`SameSite=None; Secure`, which is required for a cross-site IdP POST. The
cookie carries only an HMAC-protected transaction ID and browser binding;
RelayState is separately bounded and checked against the durable state hash.
This reduces cross-site request forgery and mix-up risk, but no server can
claim an impossible guarantee that the IdP POST came from the original browser
when the browser does not return the correlation cookie.

Node-SAML’s cache interface exposes `get/remove`, not atomic consume. Its cache
adapter therefore never consumes SQLite state. The application consumes the
transaction atomically after Node-SAML has completed signature and assertion
validation. This closes the authentication race at the session boundary; a
future library/API change can move the consume operation into the protocol
cache itself.

## 8. Identity, authorization, session, and audit behavior

The ACS creates only a branded `ValidatedExternalIdentity` containing protocol,
provider, IdP issuer, and persistent NameID. It resolves an existing exact
identity link. Unknown identities, retired links, and disabled users cannot
create accounts or sessions. Email, display name, attributes, and groups do not
link accounts or elevate roles.

Successful authentication uses the existing session service and rotates the
anonymous/session principal. Audit events contain stable action, provider,
request, outcome, and truncated identity target fields only. XML, NameID,
RelayState, cookies, response bodies, and key material are excluded.

## 9. Resource limits and error handling

Defaults are explicit and configurable:

| Limit | Default |
|---|---:|
| ACS form body | 2 MiB |
| Base64 SAML response field | 1 MiB |
| RelayState | 1 KiB |
| SAML transaction lifetime | 300 seconds |
| accepted clock skew | 0 ms by default; maximum 300,000 ms |
| login/callback limiter entries | 4,096 |

The form parser rejects oversized bodies before route processing. SAML failure
responses use stable codes such as `saml_response_invalid`,
`saml_browser_binding_failed`, `saml_subject_confirmation_invalid`,
`saml_transaction_expired`, `saml_replay_rejected`, and
`saml_identity_link_required`. Diagnostics remain in bounded server logs.

## 10. Test evidence

Executed under Node 24.20.0 after `nvm use 24`:

- `pnpm typecheck`: passed;
- `pnpm lint`: passed;
- `pnpm build`: passed;
- `pnpm test`: passed, **23 files / 121 tests**;
- `pnpm vitest run tests/saml.test.ts`: passed, **3 tests**;
- `pnpm audit --prod`: passed with no known vulnerabilities;
- `pnpm audit`: reports 4 dev-only findings in Vitest/Tinypool and is not a
  production pass.

The disposable SAML fixture generates ephemeral RSA keys and signed XML with
`xml-crypto`, then sends it through the real Node-SAML validation path. It
covers metadata, Redirect AuthnRequest, POST ACS, identity resolution, session
rotation, signature tampering, missing browser correlation, replay, issuer,
audience, destination, recipient, and temporal failures. It uses no credentials
or production data.

Existing OIDC tests remain green in the full backend run. No firmware API
contract was changed.

## 11. Other repository verification

The frontend check was executed with
`FLASK_PROXY_TARGET=http://backend:5080 pnpm check` under Node 24:

- typecheck passed;
- ESLint passed;
- **4 Vitest files / 10 tests** passed;
- Next.js production build passed.

The single-root Compose file normalized successfully for profiles `prod`,
`backend`, `writer-init`, `writer`, and `dev`. No production routing or
deployment was performed. `git diff --check` passed.

The Python baseline was also checked with the repository’s compatible Python
3.13 environment: compilation passed and **63 tests passed, 1 pre-existing test
failed**. The failure is the known mDNS test starting Flask with `TESTING=False`
without `SECRET_KEY`; it is unrelated to the TypeScript SAML implementation.

## 12. Files created or modified

Created:

- `backend/src/saml/correlation.ts`;
- `backend/src/saml/routes.ts`;
- `backend/src/saml/service.ts`;
- `backend/tests/saml.test.ts`;
- this report.

Modified within the authorized TypeScript foundation:

- `backend/src/app.ts`;
- `backend/src/config/env.ts`;
- `backend/src/db/federation-migrations.ts`;
- `backend/src/federation/provider.ts`;
- `backend/src/federation/transaction.ts`;
- `backend/package.json` and `backend/pnpm-lock.yaml`;
- `backend/pnpm-workspace.yaml` only retains its existing build policy;
- `docs/modernization/19-revised-migration-roadmap.md`.

Earlier milestone changes in the worktree remain untouched and are not
reclassified as part of this report. Flask, Jinja templates, frontend source,
production data, and the companion `../PRG32` repository were not changed.

## 13. Remaining risks and rollback

Remaining risks are deliberate and block production federation:

- no production IdP or Authentik E2E evidence exists yet;
- provider administration and certificate rotation UI/API are not part of this
  milestone;
- metadata lifecycle is manual;
- SAML decryption, SLO, artifact, SOAP, and IdP-initiated profiles are absent;
- the Node-SAML `get/remove` cache limitation remains documented above;
- the in-memory rate limiter is containment, not a distributed production
  control;
- the dev dependency audit requires a later Vitest/Tinypool upgrade;
- the existing Flask application remains authoritative and production
  federation remains disabled.

Rollback is operational: disable the SAML provider, stop the isolated writer,
and restore a verified pre-migration writer backup if the additive federation
database must be reverted. No production database was migrated and no reverse
DDL is provided.

## 14. TypeScript migration invariants

The future Fastify/TypeScript implementation must preserve these acceptance
rules independently of Flask:

1. only SP-initiated Web Browser SSO is enabled in the initial profile;
2. IdP trust is configured out of band and certificate changes are audited;
3. response and assertion signatures are required;
4. issuer, audience, ACS destination, subject recipient, timestamps, and
   `InResponseTo` are exact and bounded;
5. request correlation, response IDs, assertion IDs, and RelayState are
   durable and single-use;
6. cross-site POST correlation uses a dedicated `SameSite=None; Secure`
   browser binding and does not pretend to prove browser origin absolutely;
7. identities resolve only through exact provider/issuer/subject links;
8. no email, attribute, or group claim creates or links accounts or grants
   local roles;
9. disabled accounts cannot authenticate;
10. raw SAML material, credentials, and exception details never cross the API
    boundary;
11. session creation and rotation use the existing session service;
12. production enablement requires independent provider, deployment, and
    operational review evidence.

## 15. Next milestone

M6.3d.2h.4 is complete for the isolated protocol implementation. The next
milestone is **M6.3d.2h.5 — disposable Authentik OIDC/SAML end-to-end
validation**, limited to ephemeral local test infrastructure. It must not
enable production federation, add frontend login, retire Flask, or deploy.
