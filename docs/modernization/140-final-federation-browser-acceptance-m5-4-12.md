# PRG32 Cartridge Store — M5.4.12 Final Federation Browser Acceptance

Date: 2026-10-15

## 1. Executive summary

Decision: `M5412_FEDERATION_BROWSER_GO`

Credential gate: `CLEARED_FOR_LOCAL_TEST`

The pre-acceptance backup gate passed, the existing canonical target account
was verified, the isolated Fastify runtime was restarted successfully, and the
focused federation regression suite passed. The dedicated synthetic
non-administrator Authentik identity was verified in the existing Authentik
administration UI and its local test credential was used only interactively.
The real OIDC browser regression completed successfully. The initial Chrome
profile was blocked before the ACS by `ERR_BLOCKED_BY_CLIENT`, but a clean
Chrome profile delivered the same SAML HTTP-POST to Fastify. The callback
validated, the opaque challenge was linked to canonical user ID 2, and fresh
SAML sessions succeeded before and after a Fastify restart.

The local test credential was not written to a command, file, browser script,
log, or report. The administrator was used only for the explicit challenge
link; no administrator identity was used as the federated test identity.

Final decisions:

- `M5412_FEDERATION_BROWSER_GO`
- `M5412_SAML_CALLBACK_DELIVERY_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Authorization and protected scope

The acceptance environment remained isolated:

- Store: `https://m549-store.prg32.dream.test`
- API: `https://m549-api.prg32.dream.test`
- External generic IdP: `https://sso.dream.test`
- Public production-style origins were not changed:
  `store.prg32.dream.test` and `api.prg32.dream.test`

The existing Authentik resources were preserved:

- OIDC provider ID 9: `prg32-local-operational-oidc-20261015`
- SAML provider ID 10: `prg32-local-operational-saml-20261015`

No provider was recreated, deleted, rotated, or reconfigured. No public
routing, DNS, TLS, Traefik, Flask, auth-writer, Authentik global policy,
database schema, or production data was changed. No commit or push was
performed.

## 3. Baseline

The current baseline was taken from the M5.4.9, M5.4.10, and M5.4.11 reports
and verified against the running installation. M5.4.11 had already corrected
the SAML signature-placement mismatch: Authentik signs both the Response and
Assertion, and real signed SAML validation reaches the identity-resolution
boundary.

The local containers were running before the backup gate. Fastify and Next.js
were healthy, and the API readiness response reported available database,
canonical storage, and a held writer lease.

## 4. Credential availability gate

The approved mechanisms were checked without reading arbitrary credential
stores or extracting browser cookies. The dedicated non-administrator
Authentik identity was verified through the existing Authentik administration
UI, and its local test credential was entered only into the local Authentik
login form.

The existing Chrome tabs were at blocked ACS callback pages from the previous
acceptance attempt, not at an authenticated session belonging to the
non-administrator test identity. An administrator session is not an
acceptable substitute.

This was the state at the start of the original attempt. It was superseded by
the controlled resume recorded in the final section below. The credential
value was not persisted anywhere.

```text
CLEARED_FOR_LOCAL_TEST
```

## 5. Existing Authentik test identity

The dedicated M5.4.9 OIDC/SAML applications were preserved and no new
Authentik user was created. The existing test identity was shown as active,
external, and non-superuser; its groups and assigned roles were empty; and
the intended OIDC and SAML applications were present. No unrelated provider,
user, group, or role was created or changed.

## 6. Canonical target account

The canonical database was inspected read-only. The existing target account
was verified without exposing password hashes, email addresses, or external
subjects:

| Property | Result |
| --- | --- |
| Username | `federation-m5410-test` |
| Canonical user ID | 2 |
| Role | ordinary `user` |
| Account status | active |
| Disabled | no |
| Existing active OIDC mappings | 1 provider-scoped mapping |
| Existing active SAML mapping | none |

The local administrator remained a separate active account with administrator
role. No role, mapping, or account state was modified.

## 7. Pre-acceptance backup

Fastify was healthy before quiescence. The existing M5.4.9 backup was
independently verified first, then the local Fastify writer was stopped only
for the supported backup writer-quiescence procedure. It was restarted
automatically after backup creation and verification.

New archive:

| Field | Value |
| --- | --- |
| Archive | `.local/operational/backups/m5412-preacceptance.backup4` |
| Backup ID | `26fd56c2-4c31-414c-ab6e-c47837b0f150` |
| Archive size | 631963 bytes |
| SHA-256 | `20363963fc05c6a4c6fd99aaf876a207590cd24b3b80ef151cfe05beefefcb85` |
| Key ID | `key-20261015-01` |
| Verification state | `complete` |

The archive was created with the supported encrypted backup-v4 writer and
independently verified. Existing backup archives were not overwritten. The
canonical SQLite database and immutable objects were not restored or modified.

## 8. Real SAML challenge — initial blocked attempt

Initiated with the existing non-administrator Authentik identity. Authentik
generated a signed SAML response and RelayState in its autosubmit form, but
the browser did not deliver the form POST to the Fastify ACS. The API audit
therefore records fresh `federation.saml.started` events but no fresh SAML
validation, rejection, link-challenge, or success event.

The expected sequence remains available and unchanged:

1. Start SAML login from the isolated Store origin.
2. Authenticate the existing non-administrator Authentik identity.
3. Return to the exact Fastify ACS.
4. Require Node-SAML Response and Assertion validation.
5. Receive the opaque `saml_identity_link_required` challenge.

No raw SAML response, NameID, external subject, claim, or cookie was
obtained or logged during this run.

## 9. Explicit SAML identity linking — initial blocked attempt

Not executed. No direct SQLite insertion, email link, username link, or
administrator-to-user link was attempted.

The existing administrator-only endpoints remain the required path:

- `GET /api/admin/federation/link-challenges`
- `POST /api/admin/federation/identities/from-challenge`

The link must be performed only after a real signed SAML response has reached
identity resolution, with local administrator authentication, recent
reauthentication, valid CSRF, the exact opaque challenge, and target user ID 2.

## 10. Real SAML browser login — initial blocked attempt

Not verified because the callback POST could not be delivered by the browser
automation, not because the test identity was unavailable. The browser ended
at the Authentik autosubmit page in the integrated browser; Chrome ended at
the API ACS with `ERR_BLOCKED_BY_CLIENT`.

M5.4.11 evidence that real SAML XML validation succeeds is inherited evidence,
not a new M5.4.12 browser-login result. A validated but unlinked assertion is
not sufficient for a federation browser GO.

## 11. SAML session, RBAC, CSRF, and logout — initial blocked attempt

Not verified through a real non-administrator SAML session in this milestone.
The required checks remain:

- Fastify session establishment and rotation;
- `/auth/me` resolves to `federation-m5410-test`;
- secure cookie, domain, and SameSite attributes;
- CSRF enforcement;
- ordinary-user access;
- federation administration returns 403;
- logout invalidates the session;
- a fresh SAML login succeeds after logout.

Synthetic backend security tests for these boundaries continue to pass, but
they do not replace the required real browser acceptance.

## 12. Real OIDC browser regression

Executed after the credential gate was cleared. The existing OIDC provider
completed the callback and the Store rendered the authenticated user
`federation-m5410-test`. The ordinary-user federation administration route
rendered the expected `federation:read` permission denial. Logout returned to
the sign-in page, and a fresh OIDC login after logout again rendered the same
authenticated user. No OIDC provider, callback, client secret, or identity
mapping was changed.

This is new M5.4.12 evidence; the earlier M5.4.10 result remains inherited
evidence separately.

## 13. Restart persistence — initial pre-link check

The local Fastify container was stopped for the backup writer-quiescence
window and restarted. Post-restart checks passed:

- Fastify container: running and healthy;
- Next.js container: running and healthy;
- `/ready`: HTTP 200;
- canonical database: available;
- canonical storage: available;
- writer lease: held.

Persistence of a new SAML mapping could not be tested at that intermediate
pre-link point. Existing OIDC mapping and provider records were preserved. Flask,
auth-writer, Traefik, Authentik, Mailpit, and M5.4.3 were not restarted.

## 14. Security regression tests

Executed with Node.js 24:

```text
pnpm --dir backend exec vitest run \
  tests/saml.test.ts \
  tests/edge-federation.test.ts \
  tests/federation-foundation.test.ts \
  tests/link-challenges.test.ts
```

Result: 4 test files passed, 16 tests passed.

The suite covers signed SAML callbacks, response correlation, replay,
tampering, issuer/audience/destination/recipient/temporal validation,
certificate handling, federation transaction boundaries, and opaque link
challenge behavior.

Also executed:

- `pnpm --dir backend run typecheck` — PASS.
- `pnpm --dir backend run lint` — PASS.
- `git diff --check` — PASS.

The complete backend, frontend, Python, CLI, Docker, and backup suites passed
in M5.4.11 and are inherited evidence only for this milestone; they were not
rerun because no application code or dependency changed in M5.4.12.

## 15. Runtime health

The local runtime remained healthy after the controlled Fastify restart. The
isolated readiness endpoint returned:

```json
{"ok":true,"status":"ready","resources":{"database":"available","canonical_storage":"available","writer_lease":"held"}}
```

No public origin, reverse-proxy route, external provider configuration, or
legacy Flask ownership changed.

## 16. Files changed

M5.4.12 added exactly one modernization report:

- `docs/modernization/140-final-federation-browser-acceptance-m5-4-12.md`

No application source, dependency, Compose file, database schema, provider
record, or identity mapping was changed by this milestone. The encrypted
pre-acceptance archive is a protected local operational artifact, not a
modernization report or source change.

The worktree already contained prior M5.4.8–M5.4.11 changes and local
artifacts; they were preserved and not reset or cleaned.

## 17. Remaining blockers

1. Complete the real SAML callback delivery and obtain the opaque link
   challenge.
2. Complete the real SAML challenge and explicit administrator-approved link
   to canonical user ID 2.
3. Verify real SAML `/auth/me`, ordinary-user RBAC, CSRF, logout, and replay.
4. Restart Fastify after linking and verify SAML/OIDC persistence.

No blocker authorizes creating a replacement user, resetting a password,
changing providers, public cutover, or Flask retirement.

## 18. Final decisions

The initial run did not satisfy the acceptance criteria because the original
Chrome environment blocked the ACS navigation. The controlled resume below
completed the clean-browser SAML callback, explicit mapping, real SAML
session, RBAC, logout, restart persistence, and OIDC regression.

```text
M5412_FEDERATION_BROWSER_GO
M5412_SAML_CALLBACK_DELIVERY_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 19. Recommended next authorized phase

M5.4.12 is now complete for the isolated federation acceptance scope. The
next authorized phase may plan operational cutover prerequisites, but must
not perform public cutover, remove Flask, or change shared Dream
infrastructure without separate authorization.

Do not create users or providers, modify public routing, reset passwords,
change Authentik global configuration, stop Flask, commit, or push.

## 21. M5.4.12 Chrome SAML callback diagnosis and resolution — 2026-10-15

### Browser environments used

The available Chrome browser integration was used. Two environments were
compared against the same isolated origins and the same existing Authentik
test identity:

1. The existing Chrome profile with its installed extensions. The browser
   reported `ERR_BLOCKED_BY_CLIENT` at the isolated Fastify ACS.
2. A disposable clean Chrome profile created through the browser integration.
   It had no observed extension block and used the normal trusted HTTPS
   certificate and JavaScript execution. A stable browser version string was
   not exposed by the integration and is therefore `NOT_OBSERVED`.

No global browser security protection was disabled, no TLS verification was
disabled, and no extension was installed or modified.

### Failure boundary and sanitized observations

The original Chrome environment reached the Authentik SAML autosubmit flow and
navigated toward:

```text
POST https://m549-api.prg32.dream.test/api/auth/saml/prg32-local-operational-saml-20261015/acs
```

The browser displayed `ERR_BLOCKED_BY_CLIENT`, and no corresponding fresh
Fastify SAML validation event was written. The integrated browser showed the
same Authentik autosubmit page without delivering the POST.

The clean Chrome comparison submitted the same HTTP-POST binding to the same
ACS and received the expected sanitized application response:

```text
code=saml_identity_link_required
```

The response was generated by Fastify after SAML validation and identity
resolution. No raw SAMLResponse, RelayState, cookie, assertion, claim, or
external subject was persisted or included in this report.

The Authentik form structure was verified without reading sensitive field
values: exact ACS action, `method=post`, `SAMLResponse` field, and `RelayState`
field. The clean-browser result rules out a Fastify route mismatch, Traefik
router mismatch, TLS failure, cookie/SameSite failure, CSP form-action failure,
content-type failure, request-size failure, and Node-SAML validation failure
as the cause of the original block.

### Root cause and confidence

Root cause: the original Chrome profile's client-side blocking environment
prevented the SAML HTTP-POST from being delivered to the isolated ACS. The
clean Chrome comparison reached the same endpoint and passed the protocol
boundary without an application change.

Confidence: high. The diagnosis is based on a controlled same-origin,
same-provider, same-identity comparison and the absence of a matching Fastify
ACS event in the blocked case.

### Minimal remediation

No repository, Fastify, Next.js, Traefik, Authentik, SAML, cookie, CSP, or
security-control change was necessary. The minimal local remediation is to
run this acceptance with a clean Chrome profile or with the blocking extension
disabled by the operator in that profile. The original profile was not
modified.

This is an environment compatibility resolution, not an application
workaround. SAML signature, issuer, audience, destination, recipient,
InResponseTo, temporal, replay, and provider-scoped identity controls remain
enabled.

### ACS delivery, validation, and explicit mapping

The clean Chrome ACS POST passed the following sequence:

1. Browser submitted the expected SAML HTTP-POST.
2. Fastify received the request through the isolated HTTPS edge.
3. Node-SAML validated the signed Response and Assertion.
4. Correlation and replay checks passed.
5. Identity resolution produced the expected opaque link challenge.
6. The local administrator reauthenticated with valid CSRF protection.
7. The challenge-link API returned HTTP 201 and consumed the challenge for
   canonical user ID 2.

The canonical database now contains exactly one active OIDC mapping and one
active SAML mapping for user ID 2, each scoped to its dedicated provider. No
direct SQLite insertion was used.

### Real SAML acceptance

After linking, a fresh SAML browser login completed and the Store displayed
`federation-m5410-test`. The federation administration route denied access
with the expected ordinary-user permission message. Logout returned the
browser to `/login`, and a new SAML login succeeded again.

The negative CSRF check against the administrative reauthentication route
returned HTTP 403 with `csrf_failed` when the CSRF header was omitted. This
performed no mutation. The dedicated federation regression tests also remain
green.

### OIDC regression and restart persistence

The existing OIDC mapping and provider ID 9 were not changed. A real OIDC
login succeeded before the final restart, ordinary-user RBAC denied federation
administration, logout returned to `/login`, and a fresh OIDC login succeeded.

Only `prg32-local-operational-fastify-1` was restarted. After restart:

- `/ready` returned HTTP 200;
- database, canonical storage, and writer lease were available;
- the persisted SAML mapping produced a fresh successful SAML login;
- the persisted OIDC mapping produced a fresh successful OIDC login;
- Next.js remained healthy;
- WebAuthn remained disabled;
- mDNS remained disabled;
- SMTP configuration remained unchanged.

Flask, Authentik, Traefik, Mailpit, auth-writer, and M5.4.3 were not
restarted.

### Backup verification and tests

The encrypted pre-acceptance backup was independently verified again before
linking:

```text
backup_id=26fd56c2-4c31-414c-ab6e-c47837b0f150
archive_bytes=631963
verification_state=complete
```

Executed with Node.js 24:

```text
4 Vitest files passed; 16 tests passed
backend typecheck: PASS
backend lint: PASS
git diff --check: PASS
```

### Files changed and remaining blockers

Only this existing report was updated. No application source, dependency,
Compose file, public route, provider configuration, or schema was changed.
The authorized runtime state change is the explicit SAML mapping for the
existing canonical user; it is preserved by the operational database and was
verified after restart.

The original Chrome profile remains unsuitable for this acceptance while its
client-side blocker is active. This does not block the clean-browser
M5.4.12 acceptance, but it remains a local operator-environment note.

### Final decision

```text
M5412_SAML_CALLBACK_DELIVERY_GO
M5412_FEDERATION_BROWSER_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

M5.4.12 is complete for the isolated federation acceptance scope. This does
not authorize public operational cutover, removal of Flask, or deployment.

## 20. M5.4.12 controlled resume — intermediate blocked result — 2026-10-15

The milestone was resumed after the local credential gate was explicitly
cleared by the operator. The existing Authentik test identity was verified in
the Authentik admin UI as active, external, and non-superuser. Its groups and
assigned roles were empty, and the two dedicated M5.4.9 OIDC/SAML
applications were present. The local test password was used interactively
only; it is not recorded here or anywhere in the repository.

The pre-acceptance encrypted backup was recreated and independently verified:

- Backup ID: `26fd56c2-4c31-414c-ab6e-c47837b0f150`.
- Size: `631963` bytes.
- Verification state: `complete`.
- Fastify was quiesced only for the supported writer procedure and restarted
  successfully afterward.

The real OIDC flow was completed in Chrome. The Store showed the expected
ordinary canonical user, the federation administration page denied access for
the ordinary user, logout returned to `/login`, and a fresh OIDC login
completed again. The audit log contains fresh OIDC start and success events.

The real SAML flow was started in both the integrated browser and Chrome.
Authentik generated the hidden SAMLResponse and RelayState fields, proving
that the existing provider and test identity reached the assertion-generation
stage. The integrated browser remained on the Authentik autosubmit stage and
Chrome stopped at the Fastify ACS with `ERR_BLOCKED_BY_CLIENT`. The audit log
contains fresh SAML start events but no corresponding callback validation or
identity-link challenge. No SAML mapping was created and no SAML session was
claimed.

Focused verification remained green:

```text
4 Vitest files passed; 16 tests passed
backend typecheck: PASS
backend lint: PASS
git diff --check: PASS
```

At this intermediate point the result was `M5412_FEDERATION_BROWSER_PARTIAL`
with `SAML_CALLBACK_BROWSER_BLOCKED`. The clean Chrome comparison and final
resolution are recorded in section 21 above. Operational cutover and Flask
retirement remain `NO_GO`.

## 22. Current milestone decision — 2026-10-15

Section 20 records the intermediate state before the clean-browser comparison.
The subsequent diagnosis and resolution in section 21 supersede that
intermediate result. The current M5.4.12 decision is:

```text
M5412_SAML_CALLBACK_DELIVERY_GO
M5412_FEDERATION_BROWSER_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
