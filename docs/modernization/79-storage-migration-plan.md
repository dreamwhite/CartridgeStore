# PRG32 Cartridge Store — M5.2 storage migration plan

Date: 2026-10-14
Status: design only; no migration was executed.

This plan migrates a copy of the current Flask state into the target Fastify
schema and object layout. It never writes the source database or source
filesystem. The target is built in a new root, independently verified, and
only later considered for a single-writer handover.

## 1. Migration prerequisites

Before implementation begins, the operator must have:

- an approved maintenance window and explicit single-writer owner;
- a verified Flask backup using SQLite's backup API and a complete filesystem
  inventory;
- a read-only source schema fingerprint and source storage inventory;
- a clean, disposable target root with enough capacity for source plus target
  copies and temporary files;
- the target schema initializer and version markers;
- deterministic legacy fixtures including valid, missing, malformed, duplicate,
  unsupported-architecture, and orphan cases;
- a migration manifest writer/reader with bounded fields and no credentials;
- a rollback runbook that stops all writers before restoring anything;
- differential API, download, telemetry, firmware, backup, and recovery tests.

No prerequisite permits a live migration in this milestone.

## 2. Source inventory, read-only

The inventory phase opens the source database read-only and walks the source
data root without changing timestamps or files. It records:

1. source database path, schema fingerprint, `PRAGMA integrity_check`, foreign
   key violations, SQLite journal/WAL mode and table row counts;
2. all `index.json` entries, their ABI, game/version/architecture identifiers,
   declared relative paths, sizes, hashes, and metadata;
3. all referenced cartridge binaries, actual sizes and SHA-256 hashes;
4. all embedded metadata, icons, screenshots, signatures and colophons;
5. `pending/<submission_id>` files and their `cartridge_submissions` rows;
6. custom assets, settings, backup-relevant files, unexpected files and
   symlinks;
7. all users, groups, token metadata, scores, runs, samples, download events,
   and submissions counts without exporting secrets unnecessarily.

The inventory does not infer a missing row from a file. It reports a finding.
Source anomalies are classified:

| Finding | Migration behavior |
| --- | --- |
| DB row with no referenced file | stop that item, preserve exception, do not publish |
| file with no DB/index reference | preserve as orphan evidence/quarantine candidate |
| malformed index entry | stop affected game/release; do not guess |
| unsupported architecture | preserve in exception inventory; do not map to `qemu`/`esp32c6` |
| duplicate release/version | create explicit revision only when byte/metadata evidence proves replacement; otherwise stop |
| hash mismatch | stop item and require operator decision |
| partial pending submission | import as recovery-required submission if complete metadata exists; otherwise preserve staged evidence |
| symlink/path traversal | stop source inventory and report security finding |

## 3. Backup and source freeze

The future migration window begins with Flask still running as the sole writer.
For a consistent database image, call SQLite's backup API into a new temporary
database, run integrity/foreign-key checks, and capture the source WAL/journal
mode in the manifest. Do not copy a live `.sqlite` file by ordinary file copy.

The filesystem inventory and hashes are collected after the backup and within a
quiesced publication window, or from a filesystem snapshot with a documented
matching timestamp. If publication continues while the walk runs, the
migration is NO-GO because database and bytes may describe different states.

The source remains untouched. The migration reads from the backup database and
a read-only copy/snapshot of the source data.

## 4. Target initialization

1. Create a new empty target root outside the operational data directory.
2. Create the target `store.sqlite` with the schema in
   `79-storage-schema-specification.md`.
3. Initialize the target through the disposable storage-v2 initializer. It
   starts `ready`; the migration journal records `migration_running` phases
   without making a partially migrated target appear operational.
4. Create directories with restrictive permissions and verify root ownership,
   no symlink components, available capacity, and path length limits.
5. Record target schema fingerprint and migration checkpoint.

The initializer refuses a non-empty incompatible target root. A rerun must
resume the same migration ID or require an explicit operator-created new
target root.

## 5. Database transformation

Transformation order keeps foreign keys satisfiable:

1. Copy compatible auth/settings tables (`users`, `groups`, `user_groups`,
   `api_tokens`, `registration_tokens`, `store_settings`) without credentials
   in logs; validate uniqueness and FK counts.
2. Copy `scores`, `runs`, and `samples` unchanged, preserving IDs/timestamps,
   then run foreign-key and row-count checks.
3. Create `cartridges` from distinct legacy game IDs observed in valid catalog
   entries. A game ID is retained exactly after safe identifier validation.
4. Create releases from each valid game/version record. Preserve metadata JSON,
   title, summary, authors, tags, publisher, colophon and publication time.
   Assign a deterministic target release ID from the manifest mapping, not from
   a title or filename. Set `revision = 1` unless a verified replacement
   requires later revision mapping.
5. Create `storage_objects`, `artifacts`, and `media` only after actual source
   bytes are hashed and parsed. Database references are initially `staged`.
6. Transform submissions to `submissions` and each architecture entry to a
   `submission_artifacts` row. Preserve integer submission IDs and statuses;
   preserve old JSON in metadata fields if it contains fields not normalized.
7. Transform review history where source fields allow it. The legacy row has
   the final reviewer/status but not a complete decision history; create one
   decision event for that known decision and record history loss explicitly.
8. Map download events by `(game_id, version, architecture)` to the unique
   target published artifact. If no unique target exists, preserve the row in a
   migration exception table/archive and exclude it from target aggregates
   until manually resolved.
9. Set each cartridge's latest release by legacy publication/update order, not
   by semantic-version comparison.
10. Keep `storage_metadata.state = migration_running` until filesystem and
    independent verification pass.

Each phase commits in the target only, updates a manifest checkpoint, and is
idempotent by migration ID plus stable source key. The source remains read-only.

### M5.2a schema refinement applied to the mapping

Physical metadata is migrated once, into `storage_objects`:
`storage_key`, `sha256`, `size_bytes`, and `media_type`. The `artifacts`,
`media`, and `site_assets` target rows carry only relationship metadata and
their `object_id`; migration code must not copy those physical columns into
the relationship tables. `submission_artifacts.sha256` and
`submission_artifacts.size_bytes` remain valid because they describe staged
submission bytes before promotion.

Publication manifests keep expected hash and size as verification assertions.
The journal identity is `(operation_id, expected_object_id)`, with an explicit
target role, so one operation can contain multiple architecture-specific icon
and screenshot objects. The importer must validate `object_kind` in
application code; a foreign key alone is insufficient.

## 6. Filesystem transformation

For every valid legacy artifact:

1. validate the source path remains below the source root and is a regular file;
2. read the exact bytes in bounded chunks and compute SHA-256/size;
3. compare actual hash/size with the index declaration and parsed PRG32 data;
4. allocate an opaque target `object_id` and generated storage key;
5. copy to a same-filesystem temporary target path with restrictive mode;
6. flush the file and containing directory, atomically rename to the final
   object key, and verify hash/size after the rename;
7. update the target object/artifact mapping and manifest status;
8. extract icon/screenshot from the binary, validate MIME/limits, write media
   objects through the same protocol, and record media mappings;
9. never overwrite an existing target object; a rerun verifies and reuses the
   manifest mapping only when hash/size/kind match.

Pending submissions copy into `storage/staging/submissions/<id>/` using the
submission artifact mapping. Published artifacts never share a pending path.
Unexpected files are inventoried and left untouched in the source copy; they
are not silently copied as catalog objects.

## 7. Machine-readable migration manifest

The manifest is JSON, bounded, versioned, secret-free, and written atomically.
An implementation may use this shape:

```json
{
  "manifest_abi": "prg32-storage-migration-1.0",
  "migration_id": "mig_01J...",
  "state": "running",
  "source": {
    "schema_fingerprint": "sha256:...",
    "storage_root_fingerprint": "sha256:...",
    "backup_abi": "prg32-cartridge-store-backup-1.0",
    "database_backup": "source/database.sqlite",
    "inventory": {
      "files": 12,
      "bytes": 123456,
      "database_rows": {"users": 2, "cartridge_submissions": 1}
    }
  },
  "target": {
    "schema_version": 2,
    "storage_layout_version": 2,
    "database": "target/store.sqlite",
    "root": "target/"
  },
  "cartridges": [
    {
      "source_game_id": "org.example.game",
      "target_cartridge_id": "org.example.game",
      "releases": [
        {
          "source_version": "1.0.0",
          "target_release_id": "rel_01J...",
          "revision": 1,
          "artifacts": [
            {
              "architecture": "qemu",
              "source_path": "cartridges/org.example.game/1.0.0/qemu.prg32",
              "target_object_id": "obj_01J...",
              "target_storage_key": "storage/objects/artifacts/obj_01J...prg32",
              "size_bytes": 1234,
              "sha256": "...",
              "copy_status": "verified",
              "verification_status": "verified"
            }
          ],
          "media": []
        }
      ]
    }
  ],
  "submissions": [],
  "exceptions": [],
  "checkpoints": {"auth": "applied", "catalog": "running", "files": "pending"},
  "updated_at": "2026-10-14T00:00:00Z"
}
```

The real manifest must validate against limits: bounded strings, arrays,
entries and error text; no password hashes, token values, session cookies,
backup keys, or raw user data beyond stable IDs required for mapping.

## 8. Resumption and idempotency

Every copy is keyed by `migration_id + source relative path + source hash`.
On resume:

- an already verified target object with the same hash/size/kind is reused;
- a target object with a different hash is a hard conflict;
- a missing target object is recopied to a new temp path;
- a DB row with a missing target object is not marked public;
- a manifest checkpoint is advanced only after the row and bytes agree;
- a stale temp file is quarantined or safely removed only inside the target
  root and only after the manifest confirms it is not the final object.

Completed migration state is independently verifiable from the manifest,
target database, and object hashes. Re-running verification does not mutate
the target.

## 9. Failure recovery

The migration never attempts to repair the source automatically. Target
failures use these rules:

- before target commit: discard only the disposable target root after operator
  confirmation;
- after target DB row but before object: keep `staged` row and resume or mark
  recovery-required;
- after object but before DB row: object remains unreferenced and is
  quarantined/reused only after manifest verification;
- after public target commit: do not delete referenced objects; repair/restore
  only through the target publication/integrity procedure;
- ambiguous mappings stop the migration; no guessed game/version/architecture
  association is allowed.

## 10. Rollback and cutover

Before target cutover, rollback is simply abandoning the disposable target
root and leaving Flask operational ownership unchanged. After a future
cutover, rollback requires:

1. stop Fastify writes and confirm no operation is in flight;
2. stop traffic to the target owner;
3. validate the last pre-cutover Flask backup and filesystem inventory;
4. restore only through the documented restore procedure;
5. return route ownership to Flask without starting a second writer;
6. record the rollback event and preserve target diagnostics.

No rollback ever means pointing Flask and Fastify at the same root while the
state is uncertain.

## 11. Independent verification

The migration is **NO-GO** unless all are true:

- target `PRAGMA integrity_check` is `ok`;
- target foreign-key check returns no rows;
- source/target compatible table row counts and preserved IDs match;
- every published release has required artifact/object/hash/size agreement;
- every target object hash matches the manifest;
- every media object is valid and referenced exactly as expected;
- no target catalog query reads `index.json` or enumerates directories;
- API response differential passes for catalog, detail, versions, architecture,
  icon, screenshot, colophon and download bytes/headers/errors;
- download-event counts and legacy unmappable exceptions are reconciled;
- score/metrics/publishing/review/auth/admin contracts pass their own suites;
- firmware/host contract checks pass for mDNS, metadata ABI, architecture and
  download URL behavior;
- backup/restore and crash-recovery rehearsals pass on a copy;
- the operator has an accepted rollback window and one-writer declaration.

## 12. Proposed implementation milestones

| Milestone | Scope | Not authorized by M5.2 |
| --- | --- | --- |
| M5.2a | disposable schema initializer, object storage, read-only integrity fixtures | no source import or public route change |
| M5.2b | legacy inventory and manifest generator against copied fixtures | no operational data mutation |
| M5.2c | target database/filesystem transformation in a disposable root | no production cutover |
| M5.2d | differential catalog/download/telemetry and firmware validation | no write handover |
| M5.2e | recovery, backup/restore, rollback rehearsal | no live restore |
| M5.2f | explicit operational handover decision | only after all gates and separate authorization |

M6.3d.2h.12 is not started by any of these design milestones.

## M5.2d differential gate update

M5.2d consumed the M5.2b manifest and M5.2c disposable target without
changing the source snapshot. A real Flask test client was compared with a
read-only canonical projection for populated catalog, search, pagination,
detail/version, architecture, media, colophon, binary and error contracts.
The target projection resolves only canonical SQLite/object records and
preserves the legacy public variant fields needed for response compatibility.

The API gate is GO for disposable verification and NO-GO for operational
cutover. M5.2e remains required for backup/restore, rollback rehearsal,
fine-grained process-crash testing and live telemetry write ownership.
