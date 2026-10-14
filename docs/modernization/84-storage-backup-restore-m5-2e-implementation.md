# PRG32 Cartridge Store — M5.2e canonical backup, restore and rollback rehearsal

Date: 2026-10-14  
Status: **GO for disposable storage-v2 backup/restore rehearsal; NO-GO for operational handover**

## 1. Executive result

M5.2e implements an isolated storage-v2 backup format v3, an independent
archive verifier, restore into a new disposable root, deterministic backup and
restore fault points, adversarial archive checks, and a test-only single-writer
rollback rehearsal.

The implementation is not imported by Fastify startup, does not add an HTTP
route, does not change Flask, and does not open or modify an operational root.
The operational cutover remains NO-GO. Flask remains the operational owner.

## 2. Scope and safety guarantees

The implementation is under `backend/src/storage-v2/backup.ts` and is guarded
by all of the following:

- explicit source root, output path, target root, and the exact disposable
  authorization `PRG32_STORAGE_V2_DISPOSABLE_BACKUP`;
- required writer quiescence for backup creation;
- an initialized `.prg32-storage-v2` marker and disposable-path checks;
- output refusal when a completed archive already exists;
- new, empty disposable restore roots only;
- regular-file and symlink rejection;
- atomic archive promotion plus a separate durable completion marker;
- persistent restore state, with interrupted targets left non-ready and
  conflicting reruns refused;
- no production path defaults and no public backup/restore route.

## 3. Canonical versions and format

The verified target tuple is:

| Field | Value |
| --- | ---: |
| Schema version | 2 |
| Storage layout version | 2 |
| Publication journal version | 1 |
| Backup format version | 3 |

The archive ABI is `prg32-cartridge-store-backup-3.0`. The ZIP writer uses
stored entries and writes each database/object/staging byte stream in bounded
chunks. It does not use `zipSync` for canonical backup creation. The existing
Fastify v2 AES-256-GCM/scrypt envelope remains available for the older
application backup route; v3 developer tooling deliberately does not accept a
password and therefore cannot silently downgrade an encrypted request to
plaintext. A v3 archive is sensitive and is authorized only for disposable
work. Cryptographic checksums provide integrity, not authenticity.

## 4. SQLite consistency protocol

The writer first checks `PRAGMA integrity_check`, `PRAGMA foreign_key_check`,
the complete compatible/target table set, the version tuple, storage state, and
the canonical storage audit. It then creates the database copy with
`better-sqlite3`'s supported `Database.backup()` mechanism. The snapshot is
opened independently and checked again before its SHA-256/size is placed in
the manifest.

This is a quiesced-writer backup protocol. Hot backup under concurrent
publication, retirement, garbage collection, or telemetry writes is not
claimed. An incomplete publication or migration is represented as
`recovery_required`; it is never silently reported as a completed operational
state.

## 5. Filesystem consistency protocol

The object inventory is derived from the SQLite snapshot's
`storage_objects` rows, not from directory enumeration. Every object is
checked against its canonical kind-derived storage key, database size and
SHA-256 before it is streamed. Submission staging is derived from
`submission_artifacts` and retains its private key, identity, and bytes.

Recovery material under publication/migration journals, operation staging,
quarantine, and compatibility evidence is retained and classified. The
source files are re-read during streaming and a changed source fails the
backup. The database snapshot and all referenced objects must pass
independent verification before the completion marker is written.

## 6. Manifest and archive inventory

`manifest.json` contains the ABI, format, backup ID, snapshot identity and
hash, version tuple, schema fingerprint, bounded inventory, object counts and
kinds, staging count, recovery state, recovery-material list, aggregate byte
counts, canonical inventory hash, canonical manifest hash, and verification
state. `manifest.sha256` is a sidecar for independent accidental-corruption
detection.

Manifest entries contain archive/source keys, kind, object identity where
applicable, size, SHA-256 and classification. They contain no absolute host
paths, credentials, password hashes, bearer/session tokens, encryption keys,
or private user payloads. The SQLite snapshot can contain sensitive account
rows, so the archive itself must be treated as sensitive.

## 7. Independent verifier

`verifyCanonicalBackup()` uses the existing bounded ZIP scanner/extractor only
for archive mechanics, then independently checks the manifest, sidecar,
inventory set, version tuple, manifest hash, inventory hash, SQLite hash and
the canonical storage audit. It recomputes every object/staging checksum and
rejects duplicate identities, missing/unexpected entries, unsafe paths,
symlinks, unsupported ZIP entry types, truncation, excessive member/size/
compression limits, schema incompatibility, and incomplete state.

The verifier is read-only. A checksum is not treated as a signature; an
authenticity/key-management policy remains a pre-cutover gate.

## 8. Restore and state machine

`restoreCanonicalBackup()` verifies the archive first, initializes a fresh
disposable root, restores the SQLite snapshot, restores objects/staging/
journals without overwrites, and runs database plus filesystem checks. The
durable restore state is one of `preparing`, `restoring_database`,
`restoring_objects`, `restoring_staging`, `restoring_journals`, `verifying`,
`completed`, `recovery_required`, or `failed` (the journal records the
relevant phase and error code).

The restored database is held in `recovery_required` while it is incomplete.
Only after final verification does a clean restore become `ready`. An archive
whose source carried incomplete publication/migration state remains
`recovery_required` and is not made operationally ready. A repeated restore
against a non-empty or interrupted root is refused; the safe recovery action
is a new disposable root.

## 9. Preserved data and relationships

The backup includes the canonical SQLite snapshot, compatible account/group/
token/settings tables, catalog and release relationships, immutable artifact,
media and site-asset objects, submission/review rows, private staging,
publication operations/items/events, download telemetry, scores, runs,
samples, migration exceptions, journals, quarantine and compatibility
material. Restore tests verify object bytes, staging bytes, pending status,
settings, publication relationships, SQLite integrity, foreign keys, and the
canonical audit. Pending submissions are never promoted and rejected
submissions are never published.

## 10. Fault injection and adversarial results

The dedicated suite covers 8 tests (including the machine-readable rollback
rehearsal) and injects all requested backup and restore boundaries:

- backup: before/after snapshot, during inventory, during streaming, before
  finalization, and after finalization;
- restore: before target initialization, after SQLite restore, object
  extraction, staging, journals, before final verification, and after
  verification before completion.

Interrupted backup runs have no completion marker and any finalized-but-not-
completed output is quarantined. Interrupted restore runs leave a persistent
non-ready state and cannot overwrite or reuse the target.

The adversarial suite rejects truncated and corrupt archives, missing and
unexpected members, unsafe relative/absolute paths, manifest/database
corruption, and archive size-limit violations. The pre-existing independent
Fastify archive suite additionally covers duplicate members, symlinks,
unsupported entry types, wrong encryption passwords, inventory mismatch and
restore rollback behavior. Those v2 route tests remain compatibility evidence;
they are not retroactively described as v3 functionality.

## 11. Disposable rollback rehearsal

`runRollbackRehearsal()` emits
`prg32-storage-v2-rollback-rehearsal-1.0` evidence for the following test-only
sequence:

`legacy_authoritative → target_prepared → target_verified → target_authoritative
→ target_failed → target_relinquished → legacy_restored → completed`.

The sequence requires unchanged source evidence, M5.2b inventory, M5.2c
migration, M5.2d parity, verified backup, verified restore, and detected
failure. It rejects simultaneous legacy/canonical writers. No route,
Traefik target, Flask process, Fastify process, or container is changed.

## 12. Rollback limitations

Pre-cutover abort is simple: discard the disposable target and retain Flask as
authoritative. A post-cutover rollback requires stopping/quiescing the new
writer, controlling traffic, reconciling writes accepted after cutover, and
only then restoring legacy ownership. Restarting Flask alone is not a safe
rollback. Post-cutover writes may not exist in the pre-cutover Flask snapshot;
the decision must explicitly choose accepted data loss, export/reconciliation,
or a forward fix. No reverse migration is implemented.

## 13. Operational readiness assessment

The following remain open gates: a real source maintenance window and writer
quiescence, complete source inventory, target verification against the final
data, authentication/session continuity, publication/review ownership,
download telemetry ownership, score/metrics ownership, multiplayer WebSocket
ownership, mDNS ownership, public routing, backup retention and authenticity,
rollback data-loss policy, and monitoring/alerting. Therefore the target is
not operationally ready, Fastify is not public owner, and Flask retirement is
NO-GO.

## 14. Commands and results

Executed with Node 24 selected through `nvm use 24`:

- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run build` — PASS;
- `pnpm --dir backend run test` — PASS: 34 files, 180 tests;
- `pnpm --dir backend exec vitest run tests/storage-v2-backup.test.ts` — PASS:
  8 tests;
- the suite's disposable backup, independent verification, restore,
  interruption and rollback operations — PASS;
- `pnpm --dir frontend run typecheck` — PASS (run after the Next generated
  `.next/types` files existed);
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS: 20 files, 55 tests;
- `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` — PASS;
- `pnpm --dir frontend run build` without the required proxy variable —
  EXPECTED FAIL: the existing `next.config.ts` guard refuses a production
  build without an explicit reachable Flask proxy target;
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m py_compile
  app.py cartridge_store/*.py` — PASS;
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` —
  PASS: 64 tests;
- `docker compose --profile dev config --quiet` — PASS (read-only);
- `git diff --check` — PASS.

The full backend/frontend/Python suites and the Compose config check are run
again as the final gate and recorded in the final task report. No operational
Compose command, volume mutation, deployment, commit, or push is part of
M5.2e.

## 15. M5.2f prerequisites and decisions

M5.2f still requires an explicit operational ownership/cutover decision,
final backup retention and authenticity/key policy, writer quiescence,
session continuity, route and WebSocket ownership, telemetry reconciliation,
monitoring, and an approved rollback data-loss policy.

Decision: **GO for disposable M5.2e backup/restore and rollback rehearsal.**  
Decision: **NO-GO for operational migration, public Fastify ownership, or Flask
retirement.**
