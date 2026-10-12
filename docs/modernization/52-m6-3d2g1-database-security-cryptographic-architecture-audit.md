# M6.3d.2g.1 — Database Security & Cryptographic Architecture Audit

## 1. Executive summary

This milestone is an audit and architecture decision only. No encryption,
schema migration, data migration, dependency, Flask behavior, deployment
route, or production data was changed.

The current system has useful containment already in the isolated Fastify
profile: passwords use a Werkzeug-compatible scrypt format, API and
registration tokens are stored as SHA-256 hashes, the read shadow database is
opened read-only, backup archives can use AES-256-GCM with scrypt, and the
administrative writer uses isolated disposable storage. These controls are not
a complete database confidentiality architecture.

The main confirmed issue is that the legacy `store_settings` table is a
plaintext key/value store and its Flask contract permits reversible secrets
such as `smtp_password`, `oidc_client_secret`, and `saml_idp_x509cert` to be
stored there. The current Flask registration fallback can also log a complete
registration link when SMTP is not configured. A backup export is allowed to
be unencrypted when the administrator does not supply a password.

Decision: approve application-level envelope encryption for narrowly defined
reversible secret values in the future TypeScript writer, with an externally
managed, versioned key-encryption key. Do not encrypt password/token hashes,
do not introduce SQLCipher in this phase, and do not make Fastify a production
writer until the key, rotation, restore, and observability controls have been
implemented and tested.

## 2. Scope and operating constraints

Inspected sources include the current Flask schema and auth/settings code,
Fastify database/auth/backup/settings/admin code, the Drizzle schema
description, Dockerfiles, the single root `docker-compose.yml`, and the
modernization reports 13, 31, and 43–51.

This audit is constrained to:

- SQLite data at rest, filesystem stores, backup artifacts, logs, and Docker
  boundaries;
- password, API-token, registration-token, session, settings, SMTP, and
  administrative-audit material;
- compatibility with existing public identifiers, firmware contracts, and
  Flask-authoritative production behavior.

The following are explicitly out of scope: implementing encryption, changing
SQLite schema, moving data, changing Flask or firmware, adding SMTP delivery,
deploying, changing Traefik routing, or starting M6.3d.2g.2.

## 3. Threat model

Assets are the SQLite database, cartridge files, pending submissions,
publication journals, backup archives, credentials, token-verification
material, session material, audit records, and firmware-facing telemetry.

Relevant adversaries are:

1. An attacker obtaining a database or backup file from a host, volume,
   snapshot, or accidental artifact.
2. A compromised application process or container attempting to read data
   outside its intended writer boundary.
3. A low-privilege authenticated user attempting horizontal or administrative
   privilege escalation.
4. A malicious or compromised administrator exporting, restoring, or copying
   sensitive data.
5. A malicious archive or request attempting resource exhaustion or path
   traversal.
6. A log/observability consumer who should not receive credentials, tokens,
   registration links, or raw exception data.
7. A backup operator restoring to a different host, an older version, or a
   host without the decryption key.

This audit does not assume that application-level encryption protects a fully
compromised running process: a process with the active key can decrypt values.
It protects offline database copies and limits the blast radius of accidental
file disclosure.

## 4. SQLite schema inventory

The operational schema is the union of the idempotent Flask initializers and
the compatibility schema used by Fastify. No triggers were found. Foreign-key
enforcement is enabled by Flask and by the current Fastify database open
paths; the read shadow additionally enables `query_only`.

| Table | Important columns and content | Constraints / indexes |
|---|---|---|
| `users` | `id`, `username`, `email`, `password_hash`, `role`, `external_id`, `external_provider`, `created_at`, `last_login` | Unique username/email; external-provider index |
| `api_tokens` | `id`, `user_id`, `token_hash`, `label`, `created_at`, `last_used` | Unique token hash; user FK `CASCADE`; owner index |
| `groups` | `id`, `name`, `created_at` | Unique group name |
| `user_groups` | `user_id`, `group_id` | Composite PK; both FKs `CASCADE` |
| `registration_tokens` | `id`, `email`, `token_hash`, `created_at`, `expires_at`, `used_at` | Unique token hash; email/status/expiry index |
| `store_settings` | `key`, `value` | Primary key on key; legacy string values |
| `runs` | run identity, board/firmware/game metadata, timestamps, `submitted_by`, `user_id` | Primary key `run_id`; user FK in current compatibility schema |
| `samples` | per-frame timing, heap, input, FPS and queue fields | FK to runs `CASCADE`; unique `(run_id, frame)`; two run indexes |
| `scores` | `game`, `player`, `score`, `created_at`, `submitted_by` | Game/score ordering index |
| `download_events` | game/version/architecture, optional `user_id`, `ip_hash`, `user_agent`, timestamp | Game/date and architecture indexes; current `user_id` has no FK |
| `cartridge_submissions` | game/version/status, submitter/reviewer IDs and labels, pending path, JSON metadata/architectures, timestamps | Submitter/reviewer FKs `SET NULL`; status index |

`backend/src/db/schema.ts` is a type/schema description for compatibility;
Drizzle is not being selected as the runtime migration mechanism in this
milestone. SQLite internal tables and auto-created unique indexes are not
application data tables and are excluded from the inventory.

## 5. Sensitive-data classification

| Class | Examples | Required treatment |
|---|---|---|
| Public | Catalog metadata, public theme values, aggregate non-identifying statistics | Integrity and access control; confidentiality generally not required |
| Internal | Roles, group membership, operational settings, board and firmware metadata, audit outcomes | Access control, bounded exposure, least-privilege backups |
| Secret but one-way | `password_hash`, `api_tokens.token_hash`, `registration_tokens.token_hash` | Keep one-way; protect database and logs; never return raw values |
| Secret and reversible | `smtp_password`, OIDC client secret, SAML private/certificate material if configured, future provider credentials | Application envelope encryption plus external key management |
| Personal / identifying | Email, username, optional user linkage, IP hash, user agent, player and submitter labels | Minimize, authorize, retain only as needed, protect backups |
| High-integrity operational | Publication paths, pending files, database and backup journals | Atomicity, permissions, integrity checks, anti-symlink and recovery controls |

## 6. Password storage assessment

Flask uses Werkzeug password hashing and Fastify verifies the compatible
`scrypt:32768:8:1$...` representation. Fastify’s new hash generator uses
Node `scryptSync` with `N=32768`, `r=8`, `p=1`, a random 16-byte salt, and a
64-byte digest. The compatibility tests verify recognition of the Flask
format.

Password hashes must not be reversibly encrypted. Their security depends on
the work factor, salt, password policy, rate limiting, and database access
control. A future migration may rehash after successful authentication when a
stronger policy is approved, but must preserve the current verifier and public
login behavior during transition.

Risks are offline cracking if the database is copied and the possibility that
legacy Werkzeug parameters may age. These are not reasons to add reversible
database encryption around the hash or to change the Flask contract now.

## 7. API-token assessment

Fastify generates high-entropy random bearer tokens with a `prg32_` prefix and
stores only `SHA-256(token)` in `api_tokens.token_hash`. Flask uses the same
hash-at-rest compatibility approach. Token plaintext is returned only at
creation, not in list responses, and lookup compares the derived hash through
the indexed database value.

This is the correct one-way storage model. Encryption would make a database
copy more useful to an attacker if the decryption key were available and is
not required for verification. Remaining controls are TLS, short operational
exposure of the creation response, revocation, audit, rate limiting, and
ensuring request/header logs never capture the bearer value.

## 8. Registration-token assessment

Registration tokens are generated from 32 random bytes, represented as
base64url, and stored as a SHA-256 hash. Flask and Fastify enforce pending,
unused, and expiration conditions; completion is transactionally serialized
and consumes the token.

The email address is identifying data and remains plaintext for workflow
lookup. The token itself is not recoverable from the database. The main
remaining risks are delivery-channel leakage, link leakage in logs, and the
legacy Flask behavior that creates/commits the token before SMTP delivery is
confirmed.

## 9. Session security assessment

Flask uses a signed session cookie protected by `SECRET_KEY`, with
`HttpOnly=True` and configurable `Secure` and `SameSite` attributes. Its CSRF
token is stored in the session and checked for browser mutations.

Fastify uses an opaque 32-byte process-local session identifier, an HMAC-SHA256
signature keyed by a secret of at least 32 characters, an in-memory session
map, a per-session CSRF token, `HttpOnly`, configurable `Secure`, and
`SameSite` defaulting to `lax`. Login rotates the session; logout and security
transitions invalidate sessions.

The process-local map is a migration limitation, not a database encryption
solution: restart invalidates sessions, multiple replicas do not share them,
and the active session secret is deployment material. It is acceptable only
inside the isolated writer profile until a deliberate distributed-session or
sticky-session decision is approved. Session cookies and CSRF tokens must not
be persisted in SQLite or logs.

## 10. Store settings assessment

`store_settings(key, value)` is a plaintext legacy compatibility table. The
current Flask defaults and accepted keys include public branding, internal
policy, mDNS, SMTP, OIDC, and SAML settings. Fastify’s settings definitions
correctly exclude SMTP/OIDC/SAML secret values from its administrative API, but
the legacy rows can still exist in the authoritative database.

The table has no type, purpose, key-version, encryption marker, or integrity
metadata. Any process able to read the SQLite file can read every value. The
future encrypted representation must preserve the setting key and public
behavior while making the secret value self-describing and versioned.

## 11. SMTP credential architecture

Flask resolves SMTP host, port, sender, user, password, and TLS from
environment overrides or legacy `store_settings`. Therefore the current
architecture permits `smtp_password` in SQLite. Fastify M6.3d.2f deliberately
does not implement delivery and states that credentials remain
deployment-managed.

The approved target is deployment-managed provider configuration, preferably
an external secret reference. If a product requirement requires storing a
credential in SQLite for portability, only the credential value should be
envelope-encrypted; host, port, sender, TLS mode, and provider identifiers are
not automatically secret. The delivery service must redact connection
configuration and never log message links or credentials.

## 12. Application-level encryption assessment

Application-level field encryption is feasible without a SQLite schema change:
the existing `value TEXT` column can hold a versioned textual envelope. It is
portable across SQLite, backup export, restore, and future Fastify deployment,
and it allows non-secret legacy settings to remain byte-compatible.

It does not protect data from a running process that has the active key, and it
does not provide blind equality search. Secret settings are not used as
searchable identifiers, so this limitation is acceptable. The implementation
must reject malformed envelopes, distinguish unavailable keys from bad
ciphertext, and avoid fallback to plaintext once a value is marked encrypted.

## 13. Key-management design

The recommended root is an externally injected key-encryption key (KEK), not a
database row or a file inside `/data`. In development it may come from an
explicit local secret file excluded from Git; in production it must come from
the deployment secret manager or an equivalent protected Docker secret.

Required properties:

- at least 256 bits of random key material;
- explicit key identifier and active version;
- no default or generated-at-startup production key;
- no key material in environment dumps, logs, backups, or API responses;
- startup fail-closed when encrypted values exist but the required key is
  unavailable;
- separate operational permission to read the key and to read the database;
- documented escrow and recovery ownership.

The application should derive independent subkeys by purpose using HKDF or use
fresh random data-encryption keys (DEKs) wrapped by the KEK. A purpose label
must prevent an SMTP secret key from being reused for another domain.

## 14. Key-rotation design

Rotation must be versioned, not an in-place overwrite. A key registry belongs
to the secret-management system and contains active and decrypt-only previous
versions. Each encrypted value names the key version used for its DEK/record.

The migration sequence is: add the new key as decrypt-capable, write new
values with it, re-encrypt existing values in bounded batches, verify counts
and decryptability, then retire the old key only after backup retention and
restore testing satisfy policy. Reads may support lazy rewrite, but a bounded
administrative rewrap job is still required for completion evidence.

Rotation failure must leave the old ciphertext intact and must not silently
write plaintext. Metrics should count encrypted values by key version without
logging values.

## 15. SQLCipher assessment

SQLCipher would provide broad database-file encryption and may be attractive
for offline copies, but it introduces a native SQLite replacement, migration
and tooling constraints, key lifecycle coupling to database open, and backup
compatibility work. It also does not encrypt filesystem cartridge artifacts,
logs, or an already compromised process, and it does not replace secret
management.

Decision: do not introduce SQLCipher in M6.3d.2g.2. Prefer application-level
encryption for reversible settings and rely on deployment/storage encryption
for whole-volume protection. Revisit SQLCipher only after a measured
requirement for transparent full-database confidentiality and an explicit
native dependency/support decision.

## 16. Filesystem security assessment

Fastify backup staging, recovery, writer roots, audit directories, and files
use restrictive modes, reject symlinks, validate paths, and use atomic writes
where documented. Backup extraction bounds archive size, entries, expansion,
entry size, path depth/length, compression ratio, duplicate normalized paths,
manifest size, and unsupported file types before materialization.

The cartridge store remains a separate filesystem concern and must not be
placed in SQLite. Current Docker writer profiles use named volumes and a
read-only root filesystem with `no-new-privileges` and dropped capabilities.
The Flask production profile uses a host `./data:/data` bind mount; the image
user is non-root, but the compose service does not add the stronger writer
profile hardening controls. Host filesystem permissions and backup handling
therefore remain part of the deployment threat model.

## 17. Backup encryption assessment

Fastify’s optional encrypted backup format is currently a streaming
AES-256-GCM wrapper over the ZIP archive. It uses a random 16-byte salt, random
12-byte IV, scrypt with `N=32768`, `r=8`, `p=1`, authenticates the JSON header
as AAD, and appends a 16-byte authentication tag. Wrong passwords and
tampering are rejected. The archive itself has integrity inventory and schema
checks.

This is suitable as a password-protected portable backup primitive, but it is
not a site key-management system: password strength/escrow is external,
there is no key ID or rotation registry, and export is intentionally possible
without a password. The next implementation must define policy for mandatory
encryption, operational key wrapping, retention, and restore key availability.

## 18. Logging and audit assessment

The Fastify admin audit log is bounded JSONL, created with mode `0600` under a
mode `0700` directory, fsynced, and limited in record/file size. It records
actor, target, action, outcome, and request ID, not secrets. It is not
cryptographically chained or remotely immutable, and local rotation/retention
is not a complete tamper-evidence control.

The Flask registration fallback logs the full registration link when SMTP is
not configured. That link contains a bearer registration token and is a
confirmed secret-leak path. Server diagnostics should retain error causes
only in protected logs and must redact passwords, bearer tokens, session
cookies, CSRF tokens, backup passwords, registration links, and decrypted
settings.

## 19. Docker/deployment security assessment

The repository uses a single compose file with profiles. The Fastify and
frontend images use Node 24 bookworm-slim multistage builds; the Flask image
uses a Python slim multistage build. Writer containers run non-root, use
read-only roots, tmpfs for `/tmp`, `no-new-privileges`, and `cap_drop: ALL`.

The `dev` profile connects Flask and Next to the external `${DREAM_EDGE_NETWORK}`
network and labels the domains `api.prg32.dream.test` and
`store.prg32.dream.test`; this is operationally separate from cryptographic
key storage. The `prod` Flask profile exposes port 5080 directly and uses the
host data bind mount. No production route was changed by this audit.

Secrets currently appear as environment inputs in compose for the transitional
profiles. Compose interpolation and container inspection can expose such
values to operators. Production key material should move to Docker/host secret
delivery or an external secret manager before encrypted values are enabled.

## 20. Sensitive-data exposure matrix

| Material | Current storage | Current exposure | Decision |
|---|---|---|---|
| Password hash | SQLite `users.password_hash` | Offline database cracking; not plaintext | Keep one-way; improve policy later |
| API token hash | SQLite `api_tokens.token_hash` | Offline token guessing only | Keep one-way; never encrypt reversibly |
| Registration token hash | SQLite `registration_tokens.token_hash` | Offline guessing only | Keep one-way; suppress link logging |
| Email/username | SQLite and responses | Identifying data | Minimize and authorize |
| Session ID/CSRF | Cookie / process memory | Cookie theft or process compromise | Secure cookie, CSRF, rotation, no persistence |
| SMTP password | Legacy `store_settings` or env | Plaintext DB / env inspection | Envelope encryption or deployment secret |
| OIDC client secret | Legacy `store_settings` | Plaintext DB if configured | Envelope encryption or deployment secret |
| SAML certificate material | Legacy `store_settings` | Plaintext DB if configured | Classify exact private material; encrypt secret part |
| Backup password | Request header / operator input | TLS/proxy/log handling risk | Redact, no query strings, define mandatory policy |
| Backup archive | ZIP or AES-GCM archive | Plaintext when no password | Require protected export by policy |
| Admin audit | `admin-audit.jsonl` | Local readers/tampering | 0600, retention and external integrity sink |
| Cartridge binaries | Filesystem data store | Volume/backup access | Separate permissions and backup encryption |

## 21. Architecture decision record

**ADR M6.3d.2g.1:** use application-level envelope encryption for reversible
secret settings in the future TypeScript writer; keep one-way authentication
material one-way; defer SQLCipher.

**Accepted because:** it requires no SQLite schema change, preserves setting
keys and public identifiers, is portable to Fastify and backup/restore, and
limits the scope of key access to values that need reversibility.

**Rejected alternatives:** reversible encryption of password/token hashes is
unnecessary; plaintext settings are not acceptable for secrets; SQLCipher is
deferred because of native dependency and operational migration cost; storing
the master key beside the database defeats the threat model.

**Guardrail:** Fastify remains non-production and non-authoritative until
implementation, rotation, restore, and operational evidence are complete.

## 22. Migration feasibility

The migration is feasible without changing public API identifiers or firmware
contracts. Existing `store_settings.value` can carry an envelope string, and
legacy non-secret values can stay unchanged. Secret rows require a controlled
read/convert/write operation with an explicit inventory and rollback snapshot.

The main compatibility concern is whether Flask must read encrypted values
during a dual-runtime period. If Flask remains the production reader, either
the secret remains deployment-managed until cutover or a narrowly scoped
compatible decryptor must be designed and tested in Python. A Fastify-only
encrypted value cannot be introduced into the authoritative database while
Flask still needs that value in plaintext.

## 23. Proposed ciphertext envelope

The proposed textual format is versioned and self-describing, for example:

```text
prg32enc:v1:<base64url(JSON envelope)>
```

The authenticated envelope should contain only non-secret metadata and
ciphertext fields, such as:

```json
{
  "v": 1,
  "purpose": "store-setting:smtp-password",
  "key_id": "prg32-db-kek-2026-01",
  "kdf": "hkdf-sha256",
  "cipher": "aes-256-gcm",
  "nonce": "base64url",
  "ciphertext": "base64url",
  "tag": "base64url"
}
```

The exact implementation must choose either a purpose-derived DEK or a random
DEK wrapped by the external KEK. A 12-byte unique nonce per AES-GCM key and
authenticated purpose/key-version metadata are mandatory. Plaintext fallback
is allowed only for explicitly inventoried legacy values during a migration
read, never after a value is marked `prg32enc:v1`.

## 24. Backup/restore key compatibility

Encrypted database values and encrypted backup archives are different layers.
Restoring a backup does not restore the KEK. A restore target must have access
to the key versions named by the restored envelopes before the database is
made authoritative.

The backup manifest should record non-secret encryption metadata: encryption
mode, required key IDs/versions, and whether a portable password wrapper is
present. It must not contain the KEK or a plaintext secret. Restore must stage,
validate, and decrypt-read-check all encrypted secret rows before replacement;
missing key material must fail closed and preserve the live database.

Retention policy must keep old KEK versions for all retained backups or perform
a verified rewrap before retiring a key. Cross-host restore tests are required
for same-key, rotated-key, missing-key, wrong-key, and tampered-ciphertext
cases.

## 25. Security test plan

M6.3d.2g.2 should add tests for:

- envelope round-trip, wrong key, wrong purpose, malformed metadata, nonce
  reuse rejection, authentication-tag failure, and oversized values;
- no plaintext secret in SQLite after migration, API responses, logs, audit
  records, crash output, or backup manifests;
- legacy-to-encrypted conversion idempotence and rollback;
- key rotation with old-key decrypt/new-key write and retirement failure;
- restore with available, missing, rotated, wrong, and tampered keys;
- concurrent reads/writes and interrupted rewrap batches;
- password/token/registration hashes remaining one-way and compatible;
- mandatory encrypted backup policy and redaction of backup passwords;
- Flask compatibility if dual-runtime secret reads are required;
- Docker secret injection, file permissions, non-root operation, and no key
  material in image layers or `docker inspect` output;
- audit-log redaction and external integrity/retention behavior.

## 26. Baseline verification results

Executed on 2026-10-12 with Node 24 selected through `nvm use 24`:

| Check | Result |
|---|---|
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && (cd backend && pnpm run check)` | PASS — typecheck, ESLint, 19 files / 105 tests, build |
| `source "$HOME/.nvm/nvm.sh" && nvm use 24 && (cd frontend && FLASK_PROXY_TARGET=http://flask:5080 pnpm run check)` | PASS — typecheck, ESLint, 4 files / 10 tests, Next production build |
| `.venv313/bin/python -m py_compile app.py cartridge_store/*.py` | PASS |
| `.venv313/bin/python -m pytest -q` | 63 passed, 1 failed — pre-existing mDNS test without `SECRET_KEY` and with `TESTING=False` |
| `docker compose config` | PASS; no profile active means normalized services are empty |
| `docker compose --profile dev --profile backend --profile writer --profile writer-init --profile prod config` | PASS — all configured profiles normalize |
| `git diff --check` | PASS |

The report itself made no application behavior change. Multistage Docker
image build and disposable Docker E2E results remain recorded in the preceding
M6.3d.2f roadmap/report evidence and were not treated as new cryptographic
implementation evidence.

## 27. Confirmed vulnerabilities

1. **High — reversible secrets may be plaintext in `store_settings`.** The
   legacy Flask settings contract includes SMTP, OIDC, and SAML secret fields
   without encryption-at-rest.
2. **High — Flask may log a complete registration bearer link.** When SMTP is
   not configured, `_send_registration_email` logs the link containing the
   registration token.
3. **Medium — backup encryption is optional.** An administrator can export a
   plaintext ZIP when no password is provided.
4. **Medium — key lifecycle is undefined.** The current password-protected
   backup primitive has no external key registry, rotation, escrow, or
   restore-key preflight.
5. **Medium — local audit is not tamper-evident or centrally retained.** The
   bounded JSONL file is protected by permissions and fsync but has no chain or
   remote append-only sink.

These findings are documented; they were not changed in this audit because
the authorized scope forbids implementation and Flask changes.

## 28. Architectural limitations

- Application encryption cannot protect a running process that has the active
  key.
- A process-local Fastify session store does not support replica sharing.
- SQLite file permissions depend on host/volume configuration.
- The legacy Flask settings model cannot safely consume a Fastify-only
  ciphertext without a dual-runtime compatibility decision.
- Backup encryption with an operator password depends on password strength and
  recovery procedures.
- Current administrative audit storage is local and bounded, not a complete
  compliance audit pipeline.

## 29. Required remediation

Before production cutover, the next implementation must:

- remove registration-link logging and add a redaction regression test;
- inventory existing secret-bearing settings without exposing values;
- define deployment-managed KEK delivery, IDs, rotation, escrow, and access;
- implement the approved envelope only for reversible secrets;
- add migration, rollback, rotation, and restore-key preflight workflows;
- define whether Flask must read encrypted settings during the transition;
- make encrypted backup policy explicit and protect backup key/password paths;
- add secret/log/audit redaction and operational retention controls;
- retain the existing hash and firmware/API compatibility behavior.

## 30. Proposed M6.3d.2g.2 implementation scope

**Objective:** implement and verify the approved secret-at-rest boundary in the
isolated TypeScript writer without making it production-authoritative.

**Likely files:** `backend/src/config/env.ts`, a new focused crypto/envelope
module, settings service/definitions, backup manifest/restore validation,
admin audit redaction, tests, compose development secret wiring, and a new
implementation report. Flask files change only if the dual-runtime decision
explicitly requires a compatible decryptor.

**Data:** only inventoried reversible secret setting values are converted;
password/token/registration hashes are not converted. No public identifier,
firmware payload, cartridge binary, or API response shape changes.

**Schema:** no new SQLite table or column is required for the first envelope
implementation. The existing `value TEXT` field is retained. A schema change
would require a separate authorization.

**Guarantees:** authenticated ciphertext, purpose/key-version binding,
fail-closed missing-key behavior, bounded conversion, idempotence, rollback,
and restore compatibility across retained key versions.

**Failure behavior:** malformed or unauthenticated ciphertext is a stable
configuration/data error; no plaintext fallback after conversion; missing key
blocks startup or the affected operation; interrupted batches leave the last
verified value intact.

**Tests:** the complete section 25 plan, existing backend/frontend checks,
Flask differential baseline, profiled compose config, and disposable Docker
secret/restore tests.

**Rollback:** snapshot the affected rows and key-version inventory, stop the
isolated writer, restore the pre-conversion values, verify hashes and settings,
and retain the old key until all relevant backups are handled. No production
rollback is authorized in this milestone.

**Dependencies:** approval of KEK source and ownership, dual-runtime read
decision, backup key policy, logging remediation boundary, and an explicit
authorization for M6.3d.2g.2.

## 31. Open decisions requiring approval

1. Is deployment-managed secret storage mandatory, or may encrypted values be
   portable across hosts with a separately transferred KEK?
2. Must Flask read encrypted settings before production cutover, or are all
   secret-bearing settings moved to deployment configuration first?
3. Are SMTP/OIDC/SAML secret rows all in scope, and is `saml_idp_x509cert`
   public certificate material or private key material in this deployment?
4. Should backups without encryption be rejected, or only restricted to a
   local operator mode?
5. What are the retention, escrow, rotation interval, and incident-revocation
   requirements for KEK versions?
6. Is a remote append-only audit sink required before production cutover?

## 32. GO/NO-GO recommendation

**GO for M6.3d.2g.2 design implementation in the isolated Fastify profile.**
The data model and existing backup boundary are sufficient to implement the
approved envelope without a schema migration.

**NO-GO for production encryption rollout or Fastify production write.** The
plaintext legacy settings risk, registration-link log leak, optional backup
encryption, and undefined key lifecycle remain unresolved. M6.3d.2g.1 is
complete as an audit/architecture gate; M6.3d.2g.2 remains pending and was not
started.
