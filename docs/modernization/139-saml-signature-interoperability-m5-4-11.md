# PRG32 Cartridge Store — M5.4.11 SAML XML Signature Interoperability

Date: 2026-10-15

## 1. Executive result

Result: `M5411_SAML_INTEROPERABILITY_PARTIAL`

The real SAML failure was diagnosed and the smallest secure correction was
applied to the dedicated Authentik SAML provider. The provider was issuing a
signed assertion but an unsigned top-level SAML Response, while Fastify was
configured to require both signatures. After enabling response signing, the
real Authentik response passed the Node-SAML validation stage and reached the
expected `saml_identity_link_required` boundary.

The complete non-administrator browser acceptance could not be completed
because the protected password for the existing dedicated federation test
identity was not available. It was not guessed, reset, or replaced. No
administrator identity was linked to the non-administrator local account.

Final decisions:

- `M5411_SAML_INTEROPERABILITY_PARTIAL`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Scope and safety boundaries

This milestone was limited to the isolated federation acceptance environment:

- Store: `https://m549-store.prg32.dream.test`
- API: `https://m549-api.prg32.dream.test`
- Generic identity provider: `https://sso.dream.test`

The canonical public origins `store.prg32.dream.test` and
`api.prg32.dream.test` were not changed. No public routing, DNS, TLS,
Traefik, Flask, Authentik global policy, auth-writer, database schema, or
production data was changed. No commit or push was performed.

Only the existing dedicated Authentik SAML provider (ID 10) was inspected and
changed. No duplicate provider was created and no shared Authentik resource
was modified.

## 3. Protected state

The following state was preserved:

- `.local/operational/`
- `.local/operational-m543/`
- canonical SQLite and immutable objects
- local administrator and existing federation test account
- existing OIDC identity mapping
- federation provider records
- existing backup archives and key registry
- legacy Flask databases and transitional auth-writer data

The local Fastify container was recreated only to run the host-built
diagnostic runtime through a temporary bind overlay. The operational data
root remained mounted and was not reinitialized.

## 4. Backup gate and recovery evidence

The preserved M5.4.10 encrypted backup was independently verified before the
provider mutation. The verification command used absolute paths, as required
by the key-registry safety policy:

```text
pnpm --dir backend run storage:backup-v4 -- verify \
  --archive "$PWD/.local/operational/backups/m5410-prechange.backup4" \
  --key-registry "$PWD/.local/operational/secrets/key-registry.json"
```

Safe verification result:

```json
{"command":"verify","backup_id":"24654c84-0867-4379-9189-b1c57953b0cf","archive_bytes":603291,"archive_sha256":"339eab1f0c5d5149b458c4870c4721fe244b86e57eb36ef4e3e170d66f903465","key_id":"key-20261015-01","verification_state":"complete"}
```

This archive predates the M5.4.11 Authentik provider mutation and was not
overwritten. A new pre-change archive was not created in this milestone; the
existing verified M5.4.10 archive was used as the protected pre-change
snapshot. This is a documented deviation from the requested sequencing. The
Authentik mutation was provider-only and did not alter canonical SQLite or
filesystem data.

The local runtime subsequently reported:

```json
{"ok":true,"status":"ready","resources":{"database":"available","canonical_storage":"available","writer_lease":"held"}}
```

## 5. Authentik resources and provider configuration

Existing dedicated resources were reused:

- OIDC provider ID 9: `prg32-local-operational-oidc-20261015`
- SAML provider ID 10: `prg32-local-operational-saml-20261015`

Before correction, the dedicated SAML provider had:

| Setting | Observed value |
| --- | --- |
| Sign assertions | enabled |
| Sign responses | disabled |
| Signature algorithm | SHA-256 |
| Digest algorithm | SHA-256 |
| SAML signing certificate | present |
| ACS and audience | matched the dedicated Fastify provider |

The correction enabled only `Sign responses` on provider ID 10. Assertion
signing, SHA-256 algorithms, signing certificate, ACS URL, audience, NameID
format, and all unrelated provider settings were left unchanged.

## 6. Installed SAML library versions

The installed and locked versions were inspected; no speculative upgrade was
performed:

- `@node-saml/node-saml`: `5.1.0`
- `xml-crypto`: `6.3.3`
- `@xmldom/xmldom`: `0.9.12`
- transitive `xpath`: `0.0.34`

`xml-crypto` was already used by the new diagnostic module at runtime, so it
was moved from `devDependencies` to `dependencies` and the backend lockfile
was updated. The application validation path remains Node-SAML; the
diagnostic code never accepts a response rejected by Node-SAML.

## 7. XML signature diagnostics

The real response was analysed in memory. No raw SAML XML, assertion,
attribute, cookie, token, private key, or credential was stored in the
repository or report.

The pre-correction diagnostic was:

```text
response=rejected:missing;refs=0;uri=none;targets=0;parent=no;transforms=0;sig=none;digest=none;c14n=none
assertion=rejected:other;refs=1;uri=fragment;targets=1;parent=yes;transforms=2;sig=rsa-sha256;digest=sha256;c14n=exclusive-c14n
```

The embedded certificate fingerprint matched the configured trust anchor and
the Authentik metadata certificate. The assertion had a single fragment
reference to its parent, two expected transforms, RSA-SHA256, SHA-256 digest,
and exclusive canonicalization. The top-level Response had no direct XMLDSIG
signature.

The diagnostic implementation reports only bounded structural categories,
algorithm labels, reference counts, target shape, and certificate candidate
count. It does not become a second production verifier.

## 8. Root cause

Fastify creates the Node-SAML strategy with both response and assertion
signatures required. Node-SAML 5.1.0 validates the direct Response signature
before accepting the assertion. The dedicated Authentik provider signed only
the assertion, so Node-SAML correctly rejected the response at
`validation:document_signature`.

The failure was therefore a provider signing-placement mismatch, not a trust
certificate mismatch, digest mismatch, canonicalization mismatch, or reason
to weaken XML signature verification.

## 9. Minimal remediation

The dedicated provider was changed so Authentik signs both:

1. the top-level SAML Response; and
2. the Assertion.

No application-side signature requirement was disabled. No certificate
validation was bypassed. No permissive parser was introduced. The backend
change is limited to safe rejection diagnostics and runtime dependency
declaration.

## 10. Real SAML acceptance

A real browser flow against `sso.dream.test` was executed using the existing
authorized administrative browser session and the dedicated SAML provider.
The flow reached Authentik login and consent, returned to the Fastify ACS,
and was processed by the backend.

After the provider correction, the Fastify result was the stable
`saml_identity_link_required` response. This is evidence that the response and
assertion passed Node-SAML signature validation and reached external identity
resolution. It is not evidence of a completed local session: the external
identity was intentionally not linked to the local non-administrator account.

The Chrome page displayed a client-side blocked-page error at the final ACS
navigation, but the server-side ACS request was received and reached identity
resolution. The browser page error was therefore not treated as a successful
login or as a signature failure.

## 11. Explicit identity link

The existing opaque link-challenge boundary was preserved. No administrator
identity was linked to the dedicated non-administrator local account, and no
link by email or username coincidence was attempted.

The existing non-administrator federation test identity required a protected
credential that was not available in the repository or approved local secret
store. The credential was not guessed, brute-forced, reset, or written to any
file. Consequently the following acceptance steps remain not verified:

- administrator reauthentication and CSRF-protected link completion;
- transactional mapping creation for the intended test identity;
- second real SAML login for the linked non-administrator identity;
- `/auth/me` and role enforcement for that real session;
- real logout and session persistence for that identity.

## 12. Browser and session security

The existing backend tests continue to cover the local security boundaries:

- request correlation and RelayState binding;
- signed response and assertion requirements;
- issuer, audience, destination, recipient, and temporal checks;
- duplicate and replay rejection;
- opaque identity-link challenges;
- CSRF-protected administrative operations;
- logout/session invalidation;
- RBAC enforcement.

The real post-fix administrative browser flow did not create an application
session because identity linking was deliberately not completed. Full real
browser session acceptance is therefore `NOT_VERIFIED`, not passed by
inference.

## 13. Negative SAML tests

Focused SAML regression tests passed:

```text
pnpm --dir backend exec vitest run \
  tests/saml.test.ts tests/edge-federation.test.ts tests/federation-foundation.test.ts
```

Result: 3 test files passed, 14 tests passed.

The covered cases include tampered signatures, missing browser correlation,
unsolicited callbacks, replay, issuer mismatch, audience mismatch,
destination mismatch, recipient mismatch, temporal mismatch, certificate
overlap/retirement, and signed edge callbacks.

## 14. OIDC regression

Synthetic OIDC regression coverage passed in the backend suite, including
discovery, PKCE, nonce, signing-key overlap, invalid signature, unknown
identity, disabled account, and browser-binding cases.

The prior M5.4.10 real OIDC flow remains the last real-browser evidence. A
fresh real OIDC browser flow after the SAML provider mutation was not completed
because the same protected non-administrator federation credential was
unavailable. No OIDC provider or mapping was changed.

## 15. Persistence and restart

The isolated Fastify and Next.js containers were healthy after the runtime
verification. The API readiness endpoint reported available database,
canonical storage, and a held writer lease. Public unauthenticated GET/HEAD
observations on the isolated storefront and discovery endpoint returned
successfully with expected security headers.

Persistence of the intended SAML identity mapping is `NOT_VERIFIED` because
the explicit link was intentionally not performed. Existing local database,
provider records, and OIDC mapping were preserved.

## 16. Automated validation

Executed results:

| Command/check | Result |
| --- | --- |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run build` | PASS |
| backend Vitest, default timeout | one backup test exceeded the 5s default timeout |
| backend Vitest, `--testTimeout=15000` | PASS — 56 files, 278 tests |
| focused SAML Vitest | PASS — 3 files, 14 tests |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS on repeat — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS — Next.js 16.4.0 |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests; Docker network acceptance included |
| Python pytest with test secret | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| candidate Compose config | PASS |
| operational Compose config with required non-secret test placeholders | PASS |
| standalone Compose config with required non-secret test placeholders | PASS |
| `git diff --check` | PASS |
| independent backup-v4 verification | PASS — `verification_state=complete` |

The first frontend run had one transient CatalogBrowser loading failure; the
immediate repeat passed all 65 tests. The first backend run hit the existing
5-second timeout in one password-protected backup test; rerunning with a
15-second test timeout passed all 278 tests.

The first CLI attempt was blocked while Docker Desktop had no builder space
available during dependency symlink creation. After the operator freed space
and removed the build cache, the complete command was rerun successfully. The
successful run built the operational backend image, ran the disposable
Fastify/CLI integration, and passed the private Docker-DNS/TLS network
acceptance. No Docker cleanup operation was performed by this task.

## 17. Files changed for M5.4.11

Repository changes attributable to this milestone:

- `backend/src/saml/signature-diagnostics.ts` — bounded structural diagnostics.
- `backend/src/saml/service.ts` — safe diagnostic audit context on rejected
  SAML validation, without changing acceptance rules.
- `backend/package.json` — runtime declaration for `xml-crypto`.
- `backend/pnpm-lock.yaml` — lockfile update matching the runtime dependency.
- `docs/modernization/139-saml-signature-interoperability-m5-4-11.md` — this
  report.

The worktree also contains unrelated prior milestone changes and local
untracked runtime/test artifacts. They were not reset, cleaned, committed, or
included in this report as M5.4.11 changes.

## 18. Remaining blockers

1. Obtain the protected credential for the existing dedicated
   non-administrator federation test identity through an approved secure
   channel.
2. Complete the opaque challenge link to that existing local account.
3. Repeat real SAML login and verify `/auth/me`, non-admin RBAC, CSRF,
   logout, replay, and restart persistence.
4. Repeat real OIDC browser regression after the provider correction.
None of these blockers authorizes public cutover or Flask removal.

## 19. Compatibility assessment

The correction preserves the existing generic OIDC/SAML API contracts,
provider identifiers, opaque link challenge behavior, session boundaries,
CSRF behavior, and strict XML signature requirements. No firmware-facing
contract changed. No raw identity value is emitted in the externally visible
error envelope.

## 20. Rollback considerations

The provider-only correction can be reverted by restoring the dedicated
provider's `Sign responses` setting to its prior value, but doing so would
deliberately restore the demonstrated interoperability failure. The backend
diagnostic code is independently removable without changing the accepted
SAML security policy.

The preserved encrypted backup remains the pre-change canonical data recovery
point. Authentik provider configuration is external to that SQLite backup and
must be recorded or reverted separately by an authorized operator.

## 21. Operational readiness decisions

The isolated technical diagnosis and provider correction are complete, but
the operational acceptance gate is not complete. The application must not be
made authoritative for public traffic, and Flask must not be retired.

The public origins remain unchanged:

- `store.prg32.dream.test`
- `api.prg32.dream.test`

No cutover, deployment, routing mutation, or shared Authentik change was
performed.

## 22. Next phase and final decisions

The next authorized action should be a short, credential-gated federation
acceptance pass: use the existing non-administrator test identity, complete
the existing opaque link challenge, run the real SAML and OIDC browser
regressions, and record session/RBAC/CSRF/logout/restart evidence. Do not
create a new provider or test account.

Final status:

```text
M5411_SAML_INTEROPERABILITY_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```
