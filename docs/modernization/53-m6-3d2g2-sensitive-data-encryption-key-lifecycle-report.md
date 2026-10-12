# M6.3d.2g.2 — Sensitive Data Encryption & Key Lifecycle Implementation Report

## 1. Executive summary

M6.3d.2g.2 is implemented for the isolated Fastify/TypeScript writer. The
implementation uses Node 24 standard cryptographic APIs, keeps the existing
`store_settings(key, value)` schema, and does not modify Flask, firmware,
production data, production routing, SMTP delivery, or SQLite schema.

The implementation provides AES-256-GCM authenticated encryption with HKDF-
SHA256 purpose-separated keys, an explicit `prg32enc:v1:` envelope, an
external protected key registry, explicit plaintext migration, encrypted
transactional migration snapshots, key rotation, backup key metadata, restore
preflight, and fail-closed behavior. Ordinary settings, password hashes, API
token hashes, registration-token hashes, public metadata, and cartridge files
are not encrypted by this feature.

The isolated writer was verified in Docker with a disposable key registry
mounted read-only, a plaintext migration, a key rotation retaining the old
key as decrypt-only, and a healthy restart. Production cutover remains closed.

## 2. Final TypeScript-only architecture

New functionality is implemented only under `backend/src/secrets` and the
existing Fastify settings/backup boundaries. The target runtime remains:

- Fastify and TypeScript on Node 24;
- Next.js frontend, with no secret key material in frontend environment or
  bundles;
- SQLite for application data;
- external key-registry file for encryption key material;
- existing Fastify backup journal/recovery pipeline;
- Flask still transitional and untouched.

The secrets service is independent of future SMTP transport. No OIDC, SAML,
SMTP endpoint, or Python cryptographic adapter was added.

## 3. Cryptographic design

Each encryption operation uses:

- AES-256-GCM;
- a 32-byte key derived with Node `crypto.hkdfSync("sha256", ...)`;
- a fresh 96-bit random nonce;
- a 128-bit GCM authentication tag;
- UTF-8 plaintext encoded as the ciphertext payload.

The HKDF salt is a fixed application-domain label. The info value contains the
application identifier, database-secret domain, envelope version, setting
purpose, and key identifier. A fresh nonce is generated for every operation;
nonce uniqueness is therefore probabilistic at the 96-bit random-nonce
security bound and is never reused intentionally with a derived key.

## 4. Envelope format

The persisted value is:

```text
prg32enc:v1:<base64url(canonical JSON)>
```

The canonical JSON allow-list is:

```json
{
  "v": 1,
  "purpose": "store-setting:smtp-password",
  "key_id": "key-version",
  "kdf": "hkdf-sha256",
  "cipher": "aes-256-gcm",
  "nonce": "base64url",
  "ciphertext": "base64url",
  "tag": "base64url"
}
```

Envelope validation rejects unknown fields, unsupported versions/algorithms,
invalid key IDs or purposes, non-canonical serialization, invalid base64url,
wrong nonce/tag lengths, and values above 8192 bytes. The authenticated
additional data contains the setting key, purpose, version, key ID, KDF, and
cipher identifiers. Consequently ciphertext for `smtp_password` cannot be
transplanted to another setting key and successfully decrypt.

## 5. Key derivation

The registry supplies the 256-bit root key material. HKDF-SHA256 derives a
separate AES key from the root using the domain-separated tuple:

```text
prg32-cartridge-store / database-secret / v1 / purpose / key_id
```

No user password, session secret, or backup password is used as a database
encryption key. The derived key and root material never enter SQLite, logs,
HTTP responses, audit records, image layers, or backup manifests.

## 6. Key-file injection

`backend/src/secrets/registry.ts` implements a bounded external registry. The
JSON registry contains a version, one active key ID, and up to 32 unique key
records with `active` or `decrypt-only` status. Each key is exactly 32 bytes
of strict base64url material.

The loader rejects missing/unreadable files, symlinked registry files,
non-regular files, oversized files, permissive mode bits, malformed JSON,
duplicate IDs, missing/ambiguous active keys, invalid IDs, and invalid key
material. The configured path must be absolute and outside the application
data root.

`backend/src/secrets/keygen.ts` provides an explicit no-overwrite generator;
it never runs at startup and never creates a replacement key automatically.

## 7. Key registry

Every envelope records the key ID used for encryption. New writes use the
registry’s single active key. Historical `decrypt-only` keys remain available
for decryption. An unknown or unavailable declared key produces a stable
failure and never falls back to another key.

The registry is external to SQLite and is mounted read-only in the isolated
writer. The registry is not copied into application backups. Key retirement is
manual and was not automated.

## 8. Secret classification

The centralized registry in `backend/src/secrets/service.ts` classifies:

| Setting | Classification | Behavior |
|---|---|---|
| `smtp_password` | definite secret | Explicitly migrated and encrypted |
| `oidc_client_secret` | definite secret | Explicitly migrated and encrypted |
| `saml_idp_x509cert` | ambiguous legacy material | Not automatically migrated; public X.509 certificates are not assumed secret |

`smtp_user`, SMTP host/port/from/TLS, OIDC identifiers, and ordinary settings
remain outside the reversible-secret set. Password hashes, API-token hashes,
and registration-token hashes remain one-way values. Obsolete OIDC/SAML
behavior was not implemented or removed.

## 9. Secret persistence

The administrative settings PATCH allow-list still excludes all secret keys.
Generic settings reads still omit excluded secret values. The secret service
offers only explicit classified-key encryption/decryption to backend code;
there is no generic “encrypt arbitrary setting” route.

When `PRG32_BACKEND_SECRET_ENCRYPTION_ENABLED=true`, application startup
fails closed if the required registry is missing, encrypted values cannot be
authenticated, or definite secret rows remain legacy plaintext. Migration is
explicit and must precede enabling the feature. With the feature disabled,
existing legacy databases retain their compatibility behavior; backup
preflight still rejects encrypted rows whose keys cannot be loaded.

## 10. Legacy migration

The package scripts are:

```bash
pnpm secrets:keygen -- --output /protected/path/prg32-key-registry.json --id key-2026-01
pnpm secrets:migrate -- --database /path/auth.sqlite \
  --key-registry /protected/path/prg32-key-registry.json \
  --application-data /path/store \
  --snapshot /protected/path/migration.snapshot.json --confirm
```

Migration is never automatic at startup. It enumerates only the two definite
secret keys, leaves ambiguous/public and unrelated rows untouched, validates
the registry, uses `BEGIN IMMEDIATE`, compares expected legacy values, writes
encrypted values, decrypts each result for verification, and commits only
after all rows pass. It is bounded to 16 classified rows by default and is
idempotent: already-encrypted values are reported and not rewritten.

The command emits only operation metadata, key ID, categories, counts, and
stable error categories. It does not print plaintext or full ciphertext.

## 11. Migration rollback

For disposable environments migration writes a mode-0600 snapshot containing
only encrypted representations of the original values and the expected
post-migration ciphertext. The snapshot is outside application data and does
not contain plaintext. A failed transaction removes the snapshot and restores
the original database state through SQLite rollback.

Explicit rollback is available only with confirmation:

```bash
pnpm secrets:rollback -- --database /path/auth.sqlite \
  --key-registry /protected/path/prg32-key-registry.json \
  --application-data /path/store \
  --snapshot /protected/path/migration.snapshot.json --confirm
```

Rollback uses `BEGIN IMMEDIATE`, verifies the database identity and every
expected ciphertext, rejects conflicting changes, decrypts the protected
snapshot in memory, restores plaintext only in the explicitly confirmed
disposable operation, verifies the update, commits, and removes the snapshot.
It never provides an unrestricted plaintext export command.

## 12. Key rotation

Rotation is explicit and uses the registry’s active key. The operator first
adds the new key as active and retains the old key as decrypt-only, then runs:

```bash
pnpm secrets:rotate -- --database /path/auth.sqlite \
  --key-registry /protected/path/prg32-key-registry.json \
  --application-data /path/store
```

The command validates the registry, decrypts each declared historical value,
encrypts it under the active key, verifies the new ciphertext, records source
key counts, and commits transactionally. An active-key value is not rewritten,
so repeated rotation is idempotent. Old keys are never deleted automatically.
Interrupted or fault-injected rotation rolls back all writes.

## 13. Backup encryption policy

The existing Fastify backup AES-GCM wrapper and ZIP format remain unchanged.
When secret encryption is enabled, administrative export without a password is
rejected with `backup_encryption_required`. A supplied password still uses the
existing `PRG32-BACKUP-ENC-1` format, scrypt password derivation, AES-256-GCM,
authenticated header, and authentication tag.

Backup passwords are accepted from the existing request header/form path, are
not stored in SQLite, and are not logged. Partial output cleanup and existing
backup limits remain authoritative. Legacy unencrypted backup compatibility is
preserved when the secret-encryption feature is disabled.

## 14. Backup manifest changes

V2 manifests now optionally include bounded non-secret metadata:

```json
{
  "secret_encryption": {
    "envelope_version": 1,
    "required_key_ids": ["key-2026-01"],
    "encrypted_settings": 2
  }
}
```

No root key, derived key, plaintext credential, session secret, or backup
password is recorded. Existing V1 and V2 manifests without this optional
metadata remain accepted when no encrypted settings are present.

## 15. Restore-key preflight

The existing staged restore pipeline now inspects the staged SQLite database
before any authoritative replacement. It validates the archive, manifest,
schema, filesystem references, envelope metadata, declared key IDs, and GCM
authentication. Manifest metadata must match the staged database.

Missing keys, wrong keys, malformed/unsupported envelopes, and tag failures
produce a stable backup preflight failure before database or filesystem
replacement. The existing restore journal, recovery point, atomic replacement,
rollback, and post-restore integrity checks remain authoritative.

## 16. Restore compatibility

Covered compatibility cases include current-key decryption, historical-key
decryption, post-rotation restore, missing/wrong key failure, tampered and
malformed ciphertext failure, unsupported envelope version failure, and legacy
databases without encrypted secrets.

Cross-host restore requires the target to receive the retained registry key
versions through an independent protected channel before restore. Keys are
never packaged into application backups. Flask restore behavior was not
changed.

## 17. Filesystem hardening

Registry files are external, bounded, non-symlink regular files with restrictive
permissions. Migration snapshots are mode 0600, written through an exclusive
temporary file and rename, and rejected inside the application data root.

The Docker writer mounts the registry read-only at
`/run/secrets/prg32-key-registry.json`; writer root is read-only, the runtime is
non-root, `/tmp` is tmpfs, capabilities are dropped, and
`no-new-privileges` remains enabled. `.secrets` is ignored by Git and Docker
build context.

## 18. Logging redaction

New paths log no secret values, keys, plaintext, backup passwords, snapshots,
or full envelopes. Migration and rotation summaries expose only safe metadata
and counts. Encryption failures use stable categories without embedding
plaintext. The existing Flask registration-link logging vulnerability remains
documented and intentionally unchanged; it is a pre-cutover remediation item.

## 19. Docker integration

The single root `docker-compose.yml` received only isolated writer wiring:

- `PRG32_BACKEND_SECRET_ENCRYPTION_ENABLED`, defaulting to `false`;
- fixed in-container registry path;
- configurable host registry file via
  `PRG32_SECRET_KEY_REGISTRY_FILE`, mounted read-only.

No production Flask service, Traefik route, frontend environment, public
environment variable, image build argument, or production writer path was
changed. The registry is not copied into the multistage backend image.

## 20. Security tests

`backend/tests/secrets.test.ts` covers:

- round-trip, Unicode, empty values, nonce uniqueness;
- wrong purpose/setting, tampered ciphertext, malformed base64url, unsupported
  version, and bounded envelopes;
- duplicate IDs, invalid active selection, permissive permissions, and key
  registry validation;
- plaintext migration, encrypted persistence, ambiguous-key preservation,
  idempotence, transactional interruption rollback, encrypted rollback,
  rotation, old-key decryption, and missing-key fail-closed behavior.

`backend/tests/backup.test.ts` covers mandatory encrypted export, absence of
plaintext secret in the encrypted artifact, manifest key metadata, existing
password-protected backup behavior, and legacy backup behavior.

## 21. Regression tests

The full Fastify suite preserves authentication, token and registration
lifecycle, RBAC, settings, catalog, publication, metrics, scores, backup,
restore, and read-only compatibility behavior. No public API response or
firmware contract was changed. No SQLite table, column, index, or trigger was
added.

## 22. E2E evidence

Disposable Docker evidence on 2026-10-12:

1. Built `backend/Dockerfile` using Node 24 bookworm-slim multistage image.
2. Created a temporary registry with `secrets:keygen`; it was mode 0600 and
   never committed.
3. Initialized unique writer volumes under project
   `prg32-m632g2-e2e`.
4. Inserted one disposable plaintext `smtp_password` and ran the containerized
   migration; output reported one converted setting and no secret value.
5. Started the writer with encryption enabled and the registry read-only;
   `/health` returned HTTP 200 and the container became healthy.
6. Confirmed the image did not contain `/run/secrets/prg32-key-registry.json`.
7. Confirmed Docker identity `1000:1000` and registry mount `rw=false`.
8. Replaced the external registry with an old decrypt-only key plus a new
   active key; containerized rotation reported one value rotated.
9. Recreated the writer with the new registry; `/health` again returned 200.
10. Removed the disposable containers, network, volumes, and temporary key
    files.

## 23. Operational key-generation procedure

Generate keys outside the repository, application data, and backup root:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
cd backend
pnpm secrets:keygen -- \
  --output /protected/prg32/prg32-key-registry.json \
  --id key-2026-01
chmod 600 /protected/prg32/prg32-key-registry.json
```

The runtime identity must be able to read the file; on a Linux Docker host
this normally means assigning ownership to the container UID/GID used by the
writer. Do not place the file under `/data`, do not add it to Git, and do not
pass it through a Docker build argument or frontend variable.

## 24. Operational key-rotation procedure

Create a new registry offline containing the previous key as `decrypt-only`
and a fresh 32-byte key as the sole `active` key. Validate mode 0600 and path
placement, mount the new registry read-only, run `secrets:rotate`, inspect the
redacted key-version/count summary, and restart the isolated writer. Retain
the old key while any backup can still contain its envelopes. Never overwrite
or delete a historical key automatically.

## 25. Cross-host restore procedure

Before restoring on another host, identify `secret_encryption.required_key_ids`
from the staged manifest, obtain those exact registry versions through the
independent secret-management channel, verify file identity and permissions,
and mount the registry read-only outside application data. Run the normal
Fastify restore; preflight must complete before replacement. If any key is
missing or fails authentication, keep the live database and filesystem
unchanged. After restore, retain all required historical keys for backup
retention.

## 26. Files changed

Implementation files:

- `backend/src/secrets/envelope.ts`
- `backend/src/secrets/registry.ts`
- `backend/src/secrets/service.ts`
- `backend/src/secrets/cli.ts`
- `backend/src/secrets/keygen.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/settings/service.ts`
- `backend/src/backup/format.ts`
- `backend/src/backup/service.ts`
- `backend/package.json`
- `docker-compose.yml`
- `.dockerignore`
- `.gitignore`

Tests:

- `backend/tests/secrets.test.ts`
- `backend/tests/backup.test.ts`

Documentation:

- this report;
- the M6.3d.2g.1 and roadmap documents were updated separately as milestone
  evidence.

No Flask, frontend, firmware, companion-repository, SQLite schema, or
production data file was modified for this milestone.

## 27. Remaining risks

- Flask can still log registration bearer links when SMTP is unavailable;
  this remains a pre-cutover remediation.
- The key registry is a protected-file provider, not a full external KMS or
  HSM integration.
- Key retention/escrow ownership and automated backup-retention evaluation are
  operational responsibilities, not automated by the command.
- `saml_idp_x509cert` requires an explicit product decision if the stored
  value is private key material rather than a public certificate.
- Fastify sessions remain process-local as documented in prior milestones.
- Existing Flask production data has not been migrated and Flask cannot consume
  these TypeScript envelopes; cutover sequencing must address that boundary.

## 28. Cutover prerequisites

Before production cutover, approve and verify:

1. external secret-manager or protected-host ownership for registry versions;
2. Flask-to-TypeScript secret-read transition, or move all active legacy
   secret configuration to deployment-managed inputs;
3. registration-link log remediation;
4. key escrow, rotation interval, incident revocation, and backup retention;
5. cross-host restore rehearsal with missing/wrong/tampered-key failure;
6. production writer authorization and canary plan;
7. explicit classification of any SAML certificate/private-key material.

## 29. GO/NO-GO recommendation

**GO for M6.3d.2g.2 in the isolated Fastify/TypeScript writer.** The approved
application-level encryption, external key registry, migration, rollback,
rotation, backup policy, restore preflight, tests, and Docker evidence are
implemented without schema or public-contract changes.

**NO-GO for production cutover.** Flask remains the production authority,
legacy plaintext settings and registration-link logging remain in the
transitional service, and operational key escrow/retention decisions remain
open. This milestone must not be interpreted as authorization to deploy or to
make Fastify the production writer.
