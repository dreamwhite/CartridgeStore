# PRG32 Cartridge Store — M5.2g.8 operational backup, encryption, authenticity and restore readiness

Date: 2026-10-14  
Decision: **GO for isolated disposable backup/restore readiness; NO-GO for
operational backup activation, cutover and Flask retirement**

## 1. Executive result

M5.2g.8 adds an authenticated encrypted backup-v4 envelope around the existing
canonical storage-v2 backup-v3 payload. The implementation is developer-only,
explicitly disposable, and not connected to Fastify startup or an HTTP route.
It provides:

- AES-256-GCM authenticated encryption with a random per-backup data key and
  random content and key-wrap nonces;
- a provider-neutral external key interface, a `KeyRegistry` adapter and a
  disposable in-memory provider for rotation/recovery tests;
- historical-key restore, retired-key refusal and wrong/missing-key failure;
- streaming encryption/decryption with bounded header, payload and envelope
  limits;
- independent envelope and payload verification before restore;
- fresh-root restore through the existing v3 state machine and canonical audit;
- writer-lease coordination, atomic output/marker promotion and retention
  dry-run/apply tooling;
- deterministic encryption interruption and restore interruption coverage.

No operational database, storage root, backup, key, provider, Compose service,
Traefik route, Flask behavior or `../PRG32` file was changed.

## 2. Scope and safety boundary

The new code is in `backend/src/storage-v2/backup-v4.ts` and
`backend/src/storage-v2/backup-v4-cli.ts`. Creation requires explicit source,
output, writer-quiescence and authorization values. The source must be an
initialized disposable storage-v2 root; the output cannot be inside that root.
Restore requires an explicit new disposable target and refuses existing
non-empty targets. There is no operational default path, server startup hook,
public route, scheduler activation or production key lookup.

M5.2e v3 remains available and unchanged as the canonical payload producer,
SQLite snapshot implementation, object inventory and restore state machine.
M5.2g.8 does not claim that v3 plaintext archives are operationally safe.

## 3. Version tuple and backup format

The verified target tuple remains:

| Field | Value |
| --- | ---: |
| Schema version | 2 |
| Storage layout version | 2 |
| Publication journal version | 1 |
| Payload backup format | 3 |
| Encrypted envelope ABI | `prg32-cartridge-store-backup-4.0` |

The v4 file layout is bounded and deterministic in structure:

```text
magic(16) + header_length(4, big-endian) + canonical_header(JSON)
          + AES-256-GCM ciphertext(payload-v3 ZIP) + auth_tag(16)
```

The header contains only metadata: ABI/version tuple, backup and payload
identities, payload size/hash, payload manifest hash, cipher identifiers,
key ID, wrapped data key, wrap nonce/tag, content nonce and tag size. Key
material, credentials, password hashes, tokens, provider private keys and
private user payloads are never placed in the header or marker.

The encrypted payload is the already independently verified v3 archive. It
therefore retains the v3 manifest classifications for required objects,
staging and recovery material without creating a second catalog authority.

## 4. Encryption, integrity and authenticity

The implementation uses Node's `aes-256-gcm` primitive. Each backup gets a
fresh random 256-bit data key and 96-bit content nonce. The data key is wrapped
with the active external 256-bit provider key using a separate random nonce.
The canonical header is authenticated as GCM AAD, and the key-wrap metadata
has its own authenticated AAD. The verifier recomputes the GCM tags and the
decrypted payload SHA-256 before invoking the independent v3 verifier.

These properties are intentionally distinguished:

- GCM tags provide authenticated integrity and tamper detection;
- the external key provider supplies confidentiality and key custody;
- the archive format does not claim non-repudiation or a digital signature;
- SHA-256 fields identify content and detect accidental corruption, but are
  not treated as authenticity proofs.

Wrong keys, unknown keys, retired keys, modified headers, modified ciphertext,
truncation and payload metadata mismatches fail closed. There is no plaintext
downgrade path.

## 5. Key provider, rotation and lifecycle

`BackupKeyProvider` exposes only `active()` and historical `resolve(keyId)`.
The `KeyRegistryBackupKeyProvider` adapts the existing protected registry
without copying its material into application data. `active` keys can create
backups; `decrypt-only` keys can restore historical backups; `retired` keys
are refused. The disposable `InMemoryBackupKeyProvider` supports explicit
rotation and retirement for tests and rehearsals.

The tested lifecycle is:

1. create and verify with key A;
2. rotate to active key B while retaining A as decrypt-only;
3. create and verify with B;
4. restore both A and B backups;
5. retire A and prove that A restoration is refused.

Production key custody, KMS/HSM integration, key escrow, access audit and
scheduled rotation remain deployment decisions and were not implemented.

## 6. SQLite and filesystem consistency

The existing v3 writer remains authoritative for consistency:

- checks SQLite integrity, foreign keys, required tables, version tuple and
  canonical storage audit before snapshot;
- uses `better-sqlite3`'s supported `Database.backup()` mechanism rather than
  copying an active SQLite file;
- derives object inventory from the snapshot's `storage_objects` rows;
- rechecks object kind-derived storage keys, byte sizes and SHA-256 values;
- preserves referenced artifact, media, site-asset and submission-staging
  bytes plus publication/recovery material;
- refuses symlinks, unsafe storage keys, duplicate archive identities and
  source mutation while streaming;
- records incomplete publication/migration state as recovery-required and does
  not turn it into a ready operational target.

The v4 writer acquires the existing `CanonicalWriterLease` before producing
the payload. This proves coordination with the canonical workflow's writer
boundary. It is still an offline/quiesced protocol; hot backup under arbitrary
legacy writes, object garbage collection or telemetry writes is not claimed.

## 7. Independent verifier and restore

`verifyEncryptedBackup()` independently validates the envelope magic, bounded
header, version tuple, key metadata, exact ciphertext length, authentication
tag, plaintext hash and payload manifest before calling
`verifyCanonicalBackup()` on a temporary file. Verification is read-only.
The completion marker is required, and interrupted output is quarantined or
rejected as incomplete.

`restoreEncryptedBackup()` verifies and decrypts into a private temporary
location, then delegates to the existing v3 restore state machine. The target
is fresh and disposable only. Existing roots, non-empty roots, unsafe members,
corrupt payloads, incompatible schema and incomplete targets cannot be
overwritten or made ready. The v3 states remain the durable state machine:
`preparing`, `restoring_database`, `restoring_objects`,
`restoring_staging`, `restoring_journals`, `verifying`, `completed` and
`recovery_required`.

## 8. Maintenance commands and retention

With Node 24 selected, the isolated command is:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend run storage:backup-v4 --help
```

The command supports explicit `backup`, `verify`, `inspect`, `restore`,
`rotate-key-registry` and `retention` operations. Backup/restore require `--source`/`--archive`,
`--output`/`--target`, `--key-registry` and the exact disposable authorization.
Retention is dry-run unless `--apply` and the explicit disposable retention
authorization are supplied. It supports keep-newest, max-age and protected
backup IDs. Incomplete files without a completion marker are not treated as
retention candidates.

No scheduler or production maintenance route is enabled.

## 9. Fault injection and adversarial coverage

The dedicated v4 suite exercises:

- key A/B rotation, historical restore and retired-key rejection;
- missing/unknown/wrong keys;
- modified ciphertext, truncation and missing completion marker;
- output interruption before envelope finalization;
- writer lease contention;
- restore interruption after SQLite restore, leaving a non-ready target;
- non-empty destination refusal;
- retention dry-run and explicitly authorized disposable apply.

The existing v3 adversarial suite remains the payload safety gate for
truncated/corrupt SQLite and objects, missing/unexpected/duplicate members,
path traversal, absolute paths, symlinks, unsupported entry types, archive
limits and interrupted restore phases. V4 cannot bypass that verifier because
it authenticates and then verifies the exact payload archive before restore.

## 10. Disposable disaster-recovery and rollback assessment

The existing synthetic storage-v2 fixture and rollback state machine remain
the only rehearsal boundary. M5.2g.8 adds encrypted backup creation,
independent verification, historical-key restore and interrupted-target
evidence on that disposable data. The source SQLite hash remains unchanged;
no real Flask or Fastify root is opened.

Pre-cutover abort remains safe: discard the disposable target and keep Flask
authoritative. A post-cutover rollback is not a restart operation. It requires
quiescing the new writer, controlling traffic, reconciling writes accepted
after cutover and choosing explicit accepted data loss, export/reconciliation
or forward repair. No reverse migration is implemented.

## 11. Read-only Compose inventory

The current Compose file was inspected without starting or modifying services.
It contains seven service definitions and six named profiles (`prod`,
`backend`, `writer-init`, `writer`, `dev`, `dual-origin`), no named Docker
volumes, bind-mounted application/data paths, one internal app network and the
external `dream_edge` network.

| Service | Current classification | Evidence/decision |
| --- | --- | --- |
| `cartridge-store` | `REMOVE_AFTER_CUTOVER` | Transitional Flask production runtime; keep until handover and rollback window close |
| `flask` | `DEV_ONLY` / `REMOVE_AFTER_CUTOVER` | Legacy API owner and local proxy target; not removable before operational parity |
| `backend` | `DEV_ONLY` | Isolated Fastify read-only profile; candidate to merge into final backend service |
| `auth-writer-init` | `DEV_ONLY` | Disposable bind-mounted SQLite/key bootstrap; remove only after writer startup owns safe initialization |
| `auth-writer` | `DEV_ONLY` / `MERGE` | Fastify writer candidate; currently separate to enforce disposable auth/write boundaries |
| `auth-writer-edge-proxy` | `DEV_ONLY` / `REMOVE_AFTER_CUTOVER` | Nginx dual-origin bridge; external Traefik should route directly to the final Fastify service after validation |
| `next` | `KEEP` | Final storefront runtime; preserves `store.prg32.dream.test` and HMR in dev |

`sso.dream.test`/generic OIDC-SAML provider and Dream Traefik are external.
The Compose file still preserves `api.prg32.dream.test`,
`store.prg32.dream.test`, the external edge network and WebSocket path. No
Compose simplification, volume deletion, image cleanup or routing change is
part of this milestone. The concrete future topology remains documented in
`docs/modernization/85-docker-compose-simplification-plan.md`.

## 12. Verification commands and results

The final report records only commands actually executed:

- `source "$HOME/.nvm/nvm.sh"; nvm use 24` — PASS, Node 24.20.0;
- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS: 44 files, 219 tests;
- `pnpm --dir backend run build` — PASS;
- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS: 21 files, 59 tests;
- `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` — PASS;
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` —
  PASS: 64 tests;
- `python3 -m py_compile app.py cartridge_store/*.py` — PASS;
- `docker compose --profile dev config --quiet` — read-only configuration
  validation;
- `git diff --check` — PASS;
- disposable v4 creation, independent verification, rotation, restore,
  interruption, adversarial and retention tests — PASS.

No operational Docker command, database write, key access, provider change,
deployment, commit or push was performed.

## 13. Remaining risks and M5.2f prerequisites

Open gates are operational key custody and authenticity policy, encrypted
backup access control/audit, retention scheduling, final source snapshot and
writer quiescence, authentication/session continuity, publication/review
ownership, download telemetry, scores, metrics, WebSocket, mDNS, public
Traefik routing, monitoring and an approved rollback data-loss policy.

M5.2f must not be considered operationally complete merely because a
disposable encrypted restore passes. The target remains isolated and Flask
remains the authoritative operational owner.

Decision: **GO for isolated disposable M5.2g.8 implementation.**  
Decision: **NO-GO for operational backup activation, Fastify cutover or Flask
retirement.**
