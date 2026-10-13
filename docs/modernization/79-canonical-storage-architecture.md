# PRG32 Cartridge Store — M5.2 canonical storage architecture

Date: 2026-10-14
Status: target design only. No operational database, filesystem, routing, or
deployment state was changed.

## 1. Executive decision

The definitive Fastify backend will use a normalized SQLite database as the
authoritative catalog and relationship store. The filesystem will contain
immutable binary objects, media objects, staging data, and recovery material;
it will not determine which cartridges are visible.

The final runtime will not read or write the legacy `index.json` as a catalog
authority. During the migration window it will be accepted as a legacy import
source and, if needed, emitted as a generated compatibility export. It will
never be a second mutable store of catalog truth.

The selected design is deliberately small-team oriented:

- stable public `game_id`, version, and architecture identifiers remain
  unchanged;
- SQLite rows describe cartridges, releases, artifacts, media, submissions,
  reviews, publication operations, and download relationships;
- immutable filesystem objects are addressed by server-generated opaque object
  IDs and verified with SHA-256 hashes;
- one publication operation owns the database/file transition, with a durable
  SQLite journal and append-only transition events;
- the existing Flask schema and files remain operationally untouched until a
  separately authorized migration and cutover;
- no PostgreSQL, Redis, S3, queue, or distributed transaction service is
  introduced.

This is a design milestone. It is **GO for target architecture and migration
specifications**, **NO-GO for operational migration, Fastify public cutover,
Flask retirement, schema application, deployment, or M6.3d.2h.12**.

## 2. Current architecture and limitations

### 2.1 Current Flask implementation

Flask currently owns the operational database and filesystem. Its `GameStore`
uses `PRG32_STORE_DATA`, reads and writes `index.json`, and resolves files at:

```text
<data>/cartridges/<game_id>/<version>/<architecture>.prg32
```

The index contains game metadata, versions, architectures, relative filenames,
sizes, hashes, media flags, and publication metadata. The database contains
the legacy users, groups, tokens, scores, runs, samples, download events,
settings, and `cartridge_submissions` tables, but not normalized catalog rows.

Branding uploads are currently written to `data/static/logo.<ext>` or
`favicon.<ext>` after byte-based PNG/JPEG/SVG detection, with a URL saved in
`store_settings`; this is also a filesystem/settings coupling that the target
`site_assets` relationship removes.

Publishing writes a binary and then replaces the JSON index. Submission
staging writes `pending/<submission_id>/<architecture>.prg32`. Review approval
rebuilds metadata and compensates ordinary errors with index/file backups, but
the Flask path has no durable cross-process publication journal.

Downloads resolve the index and binary first, insert a `download_events` row,
then return `send_file`. The event is counted before streaming and therefore
represents a resolved download request, not a confirmed complete transfer.

Flask backups use SQLite's backup API for a copied database and archive the
database plus the data tree. The legacy archive ABI is
`prg32-cartridge-store-backup-1.0`.

### 2.2 Current Fastify implementation

Fastify currently maps the eleven legacy tables in `backend/src/db/schema.ts`
and opens the operational/shadow database read-only by default. Its isolated
writer profiles add authentication, submissions, review, administration,
backup, and federation behavior only below disposable roots.

The current catalog implementation reads the legacy `index.json` and resolves
relative files. Its publication implementation has useful staged writes,
hash checks, atomic replacements, fault injection, reconciliation, and
publication/review journals, but those journals still describe the legacy
index/filesystem model and are not the target schema.

Fastify backup code supports legacy v1 and v2 archives, inventory hashes,
SQLite validation, bounded extraction, optional encryption, and recovery. It
must be adapted to the target object layout; it is not an operational migration
tool today.

### 2.3 Responsibility map

| Responsibility | Current Flask | Current Fastify | Target Fastify |
| --- | --- | --- | --- |
| Catalog identity and metadata | `index.json` | read-only index reader | SQLite `cartridges` and `releases` |
| Version selection | index `latest_version`/versions map | same index | SQLite release state and publication order |
| Architecture artifacts | index variant rows plus files | same index plus safe path resolution | SQLite `artifacts` -> `storage_objects` |
| Icons/screenshots | embedded in `.prg32`, parsed on request | embedded parser | extracted immutable media objects with DB references; binary remains intact |
| Colophon | embedded in `.prg32`, parsed on request | embedded parser | release `colophon_json`, regenerated/verified from binary |
| Branding/custom assets | `data/static/<kind>.<ext>` plus settings URL | isolated settings asset API | `site_assets` -> immutable object |
| Submission staging | `pending/<id>` and JSON columns | isolated pending root and JSON columns | `submissions` + `submission_artifacts` + staging objects |
| Publication | file/index updates and compensation | journaled file/index updates | journaled object promotion plus one DB visibility commit |
| Review | `cartridge_submissions` row/status | isolated review service | normalized submission and review decision rows |
| Download telemetry | legacy `download_events` before response | not written by read-only catalog | artifact FK event inserted after resolution, before stream |
| Backup | copied SQLite + data tree | v1/v2 archive service | consistent DB backup + object/media/journal inventory |
| Recovery | ordinary-error compensation | disposable journal reconciliation | target publication journal recovery, fail closed |

## 3. Target architecture

```text
HTTP/API contract
       |
       v
Fastify application services
       |
       +-- catalog query service ------ SQLite canonical rows
       |                                  |
       |                                  +-- cartridges
       |                                  +-- releases
       |                                  +-- artifacts
       |                                  +-- media
       |                                  +-- publication/review/download rows
       |
       +-- object delivery service ----- storage_objects -> immutable file
       |
       +-- publication coordinator ----- SQLite journal + atomic object rename
       |
       +-- integrity/recovery service -- read-only audit by default
       |
       +-- backup service -------------- SQLite backup + object inventory
```

The database is authoritative for existence, visibility, identity,
relationships, selected versions, architecture availability, checksums,
media references, submissions, review, and download relationships. A file that
exists without a row is an orphan, not a cartridge. A row whose object is
missing is a storage-integrity failure and is not served.

The final public catalog query joins only rows with a published release,
published artifact, available object, and valid relationship. Directory
enumeration is never used to create catalog rows.

## 4. Canonical ownership model

| Resource | Canonical source | Derived material | Final writer |
| --- | --- | --- | --- |
| Cartridge identity | `cartridges` | API game records | Fastify catalog service |
| Public version/release | `releases` | latest/version API fields | publication coordinator |
| Architecture support | `artifacts` | API architecture arrays | publication coordinator |
| Binary bytes | object file referenced by `artifacts` | download stream | object writer during publication only |
| Icon/screenshot bytes | object file referenced by `media` | HTTP media response | publication/media service |
| Colophon/metadata | release JSON columns | ABI response and export | publication/review service |
| Submission ownership | `submissions` and user FK | workspace response | submission service |
| Review decision | `review_decisions` | submission status | review service |
| Publication progress | `publication_operations` and events | logs/recovery report | publication coordinator |
| Download event | `download_events` with artifact FK | aggregate statistics | download service |
| Auth/users/runs/scores | existing compatible tables | existing API responses | their existing services |
| Compatibility index | no canonical source; generated only | optional export | explicit export job |

No service may infer publication from a filename, directory, archive entry,
or compatibility index. A target startup must fail rather than silently create
a new empty store when a target marker is missing or incompatible.

## 5. Canonical data model summary

The complete table and column specification is in
[`79-storage-schema-specification.md`](79-storage-schema-specification.md).
The model has these relationships:

```text
cartridges 1 ──── * releases 1 ──── * artifacts * ──── 1 storage_objects
                         |
                         +──── * media * ──────────── 1 storage_objects
                         |
                         +──── * submissions ──── * submission_artifacts
                         |
                         +──── * publication_operations ─── * operation_items

submissions 1 ──── * review_decisions * ──── 1 users
artifacts 1 ───── * download_events * ───── 0..1 users
```

### 5.1 Stable identifiers

- `cartridge_id` remains the existing public `game_id` string. It is validated
  with the current safe identifier grammar and is never derived from a title.
- `version` remains the public metadata version string and is not silently
  converted to semantic-version ordering.
- `release_id`, `artifact_id`, `media_id`, `object_id`, and `operation_id` are
  server-generated opaque IDs. UUIDv7 or another sortable random ID is
  acceptable; the exact generator is an implementation detail and must not be
  exposed as a replacement for `game_id` or version.
- `architecture` remains exactly `esp32c6` or `qemu` in canonical rows and
  public responses. Existing accepted aliases are normalized at the API edge.
- `revision` allows a new immutable release record when the same public
  `cartridge_id` and `version` need replacement. The API still exposes the
  public version string; it does not expose revision unless an administrative
  response needs it.

### 5.2 Metadata preservation

The normalized columns needed for queries (`title`, `summary`, tags,
authors, publisher and timestamps) are stored alongside lossless
`metadata_json` and `colophon_json`. The JSON is stored in SQLite, not in a
filesystem index, so preserving extensible ABI fields does not create a second
authority. Every artifact is parsed and validated against
`prg32-metadata-1.0` and `prg32-colophon-1.0` before publication.

## 6. Filesystem layout

The target root is one configurable data root. Derived paths are not separately
configured unless a deployment deliberately places backups on another volume.

```text
<PRG32_DATA_ROOT>/
├── store.sqlite
├── store.sqlite-wal                 # SQLite-managed when WAL is active
├── store.sqlite-shm                 # SQLite-managed when WAL is active
├── storage/
│   ├── objects/
│   │   ├── artifacts/<object-id>.prg32
│   │   ├── media/<object-id>.<safe-extension>
│   │   └── site-assets/<object-id>.<safe-extension>
│   ├── staging/
│   │   ├── submissions/<submission-id>/artifacts/<architecture>.prg32
│   │   └── operations/<operation-id>/
│   └── quarantine/<finding-id>/      # explicit recovery/audit quarantine
├── journal/
│   └── publications/<operation-id>/  # optional immutable plan copy
├── backups/                          # local only when explicitly configured
└── compatibility/                    # generated exports, never catalog input
```

The database may remain at the root for operational familiarity, but the
`storage/` boundary prevents object files from being mistaken for database
state. A deployment may bind mount the entire root at `/data`; it does not
need anonymous volumes or separate production mounts for each subdirectory.

`journal/publications` is a recovery aid and audit copy. The authoritative
operation state is in SQLite. If the file copy and row disagree, recovery
fails closed and reports the mismatch.

## 7. Artifact identity and storage strategy

### 7.1 Options considered

| Strategy | Benefits | Costs | Decision |
| --- | --- | --- | --- |
| Human-readable game/version paths | easy manual inspection, close to Flask | user-controlled path concerns, overwrite risk, metadata is duplicated in names | reject as authority |
| Stable-ID hierarchy | simple, immutable, portable, easy rollback and GC | no automatic deduplication, IDs are not human-readable | **selected** |
| Content-addressed objects | deduplication and strong identity from hash | reference counting/GC complexity, migration changes paths, hash must be known before object identity | defer |
| Hybrid stable ID plus hash metadata | stable operational paths and integrity checks; optional future dedupe | slightly more metadata | selected in practice |

Every object receives an opaque server ID and a SHA-256 recorded in SQLite.
The storage key is generated from that ID and a fixed kind-specific suffix;
user-controlled titles, filenames, and architecture strings never form a
path component. The original upload filename is metadata only.

The target intentionally does not deduplicate by hash in M5.2. A later
implementation may reuse an existing object only after comparing kind, size,
media type, and SHA-256 inside the same transaction. It must not alter
artifact identity or delete the previous object.

### 7.2 Object resolution

The database lookup is:

```text
game_id + requested version/selected release + architecture
    -> releases.release_id
    -> artifacts.artifact_id/object_id
    -> storage_objects.storage_key
    -> safe path under <DATA_ROOT>/storage/objects
```

The service checks the resolved path stays below the object root, rejects
symlinks, checks a regular file and expected size, and returns a controlled
missing-object error. Full hash verification runs in integrity checks and
publication verification; a configurable sampled/on-demand verification may
be added later, but a missing or invalid object is never served silently.

### M5.2a refinement: canonical physical metadata

The implementation gate makes `storage_objects` the sole authority for
physical object metadata: `storage_key`, `sha256`, `size_bytes`, and
`media_type`. `artifacts`, `media`, and `site_assets` contain only their
relationship-specific identity, lifecycle, dimensions/compatibility, and
foreign-key fields. `submission_artifacts` is the intentional exception: its
hash and size describe bytes still in submission staging, before an object has
been promoted into the canonical object store.

`object_kind` is enforced both by the SQLite domain checks and by application
relationship validation. SQLite foreign keys prove that an object ID exists;
the service and read-only audit additionally prove that an artifact points to
an `artifact` object, media to `media`, and a site asset to `site_asset`.

## 8. Media strategy

Icons and screenshots are immutable filesystem objects referenced by `media`
rows. Media is associated with a release and optionally an architecture
(`architecture = ''` means release-wide). This preserves current behavior when
different architecture binaries carry different embedded media while allowing
one shared image when the bytes are identical.

Colophon remains structured JSON on the release because it is small, returned
as JSON, and has the `prg32-colophon-1.0` contract. It is not a media file.

Rules:

- accepted kinds are `icon` and `screenshot` in M5.2;
- MIME is detected from bytes and must match the allowed image formats; the
  upload-declared MIME is advisory;
- each media relationship resolves size, MIME type, and SHA-256 through its
  `storage_objects` row, with bounded dimensions/bytes;
- filenames are generated from `object_id`, not accepted from the user;
- replacing media creates a new object and new row/revision; published bytes
  are immutable;
- orphan media is reported by audit and retained until an explicit, reviewed
  GC operation;
- public media routes remain `/api/games/<id>/icon` and `/screenshot`, with
  the same version and architecture selectors.

Each publication operation item identifies one expected object. Its database
identity is `UNIQUE (operation_id, expected_object_id)`, with an explicit
`target_role` (`artifact`, `icon`, `screenshot`, or `site_asset`) and a
relationship check for valid kind/architecture combinations. This permits an
operation to contain multiple media objects, including icon and screenshot
items for both `esp32c6` and `qemu`; `(item_kind, architecture)` is not a
unique key.

Branding and custom site assets are separate `site_assets` rows pointing at
`storage_objects` with `object_kind = 'site_asset'`. Their logical keys are
bounded server-defined values such as `branding.logo`, `branding.favicon`, or
an administrator-approved custom asset key; the key is not a filesystem path.
Existing `/static/custom/<filename>` compatibility delivery can be backed by
a generated lookup from this table, but filenames never become catalog
identity.

## 9. Submission and staging lifecycle

```text
UPLOAD_RECEIVED -> VALIDATED -> PENDING_REVIEW
PENDING_REVIEW -> APPROVED -> PUBLISHED
PENDING_REVIEW -> REJECTED
any pre-publication state -> RECOVERY_REQUIRED
RECOVERY_REQUIRED -> PENDING_REVIEW | REJECTED | FAILED (operator decision)
```

Uploads are first streamed to a private submission staging directory with
archive limits, safe ZIP names, duplicate detection, hash calculation and
PRG32 parsing. The database then records a submission and one
`submission_artifacts` row per architecture. Staging paths are internal and
never returned as public URLs.

Approval creates a publication operation. It does not mutate a published
artifact in place. Rejection changes only the submission/review rows; staged
files are marked for cleanup and may be quarantined if cleanup fails.

Cleanup is retryable and idempotent. A process interruption never causes a
partial staging directory to become visible. A stale directory without a
database row is an audit finding; automatic deletion is not the default.

## 10. Publication transaction and recovery design

### 10.1 Visibility rule

A release becomes visible only after one SQLite commit makes all of the
following true:

1. the release is `published`;
2. every published artifact row references an available object with the
   expected size and hash;
3. required media rows reference available objects;
4. the publication operation is at least `DATABASE_COMMITTED`;
5. review/submission state records the approval.

Catalog queries filter on these states. There is no catalog visibility between
filesystem rename and the final commit.

### 10.2 Protocol

1. **Pre-validate:** parse the bundle, enforce limits, normalize architecture,
   validate metadata/colophon, compute hashes, and reject unsafe input.
2. **Stage:** write each upload to a private temporary file, `fsync`, atomically
   rename into the submission staging directory, and verify size/hash.
3. **Prepare transaction:** `BEGIN IMMEDIATE`; create or load the submission,
   create a unique publication operation and operation items, allocate object
   IDs, and record expected hashes. Commit the journal before public object
   writes.
4. **Promote objects:** copy/rename staged bytes to temporary files below the
   object root, `fsync` file and directory, atomically rename to the generated
   object key, and verify size/hash. Never overwrite an existing object.
5. **Verify:** record `OBJECTS_VERIFIED` only after every object and media
   object exists and matches the operation plan.
6. **Publish transaction:** `BEGIN IMMEDIATE`; insert the release/artifact/media
   rows, mark objects available, mark the release published, supersede the
   prior revision if applicable, append the review decision and set the
   operation `DATABASE_COMMITTED`; commit.
7. **Cleanup:** remove or quarantine staging only after the commit. Mark the
   operation `COMPLETED` in a follow-up transaction.

### 10.3 States

Target publication states are:

```text
PREPARED -> OBJECTS_STAGED -> OBJECTS_VERIFIED -> DATABASE_COMMITTED
          -> CLEANUP_PENDING -> COMPLETED

any state before COMPLETED -> RECOVERY_REQUIRED
RECOVERY_REQUIRED -> COMPLETED | COMPENSATING -> COMPENSATED | FAILED
```

Each transition is append-only in `publication_events`, includes an operation
ID and timestamp, and is guarded by the current state. Replaying a completed
operation is a no-op; replaying an incomplete operation first rechecks hashes
and database state.

### 10.4 Crash matrix

| Crash point | Expected state | Recovery action | Visibility |
| --- | --- | --- | --- |
| before staging | no operation or `PREPARED` | remove/quarantine unreferenced temp files | not visible |
| during staging | submission absent or pending with incomplete stage | verify each staged hash; retry or mark recovery | not visible |
| after staging | `PREPARED` | resume promotion or reject | not visible |
| before object commit | `OBJECTS_STAGED` | verify objects; resume or quarantine | not visible |
| after object verification | `OBJECTS_VERIFIED` | repeat final DB transaction idempotently | not visible |
| after database commit | `DATABASE_COMMITTED` | retain public rows; retry cleanup | visible only if all rows/objects pass query |
| before cleanup | `CLEANUP_PENDING` | remove staging, never published objects | visible |
| during recovery | `RECOVERY_REQUIRED` | operator chooses resume/compensate after audit | fail closed until resolved |

Compensation never deletes an object referenced by a committed release. An
unreferenced object is quarantined first; explicit GC may delete it later.

## 11. Download delivery and telemetry

The target request path is:

```text
HTTP request
 -> validate game_id, version and architecture
 -> SELECT published release + published artifact + available object
 -> validate safe object path, regular file, expected size
 -> INSERT download_events (legacy counting point)
 -> stream object bytes
```

The public paths, query parameters, architecture identifiers, MIME type
`application/vnd.prg32.cartridge`, attachment filename convention, and
observable not-found/unsupported-architecture behavior remain compatible. The
target must explicitly verify the following delivery surface against Flask's
`send_file` behavior and the M3 compatibility fixture:

- `GET` streams the exact object bytes and returns the object size as
  `Content-Length`;
- `Content-Type` remains `application/vnd.prg32.cartridge` and
  `Content-Disposition` remains an attachment with the existing
  `<game>-<version>-<architecture>.prg32` naming convention;
- framework-supported `HEAD` returns the same resolution/status/headers as
  `GET` without a body;
- ETag, conditional requests, `Last-Modified`, and byte ranges are preserved
  where the existing Flask/runtime contract and tests demonstrate them. A
  target ETag may be derived from the stored SHA-256 only after the
  compatibility fixture records that value as an allowed change;
- a range or conditional request is still one resolved download request and
  follows the legacy telemetry decision below.

The design does not claim additional range or conditional behavior merely
because the object service could implement it.

Telemetry preserves Flask semantics: once a valid artifact has been resolved,
an event is inserted before streaming begins. A failed lookup records nothing.
Partial transfers, client disconnects, and downstream stream failures still
count because the legacy event is already committed. A repeated valid request
creates a repeated event. Anonymous users have a null user FK, a privacy-safe
hash of the remote address if that legacy policy remains enabled, and a
bounded user-agent value. Failed telemetry insertion is fail-closed for the
download rather than silently serving without statistics.

The event references `artifact_id`, `release_id`, `cartridge_id`, and
architecture, while retaining legacy projection fields for statistics and
migration compatibility. It never accepts client-supplied IDs.

## 12. `index.json` retirement

The current dependencies classify as follows:

| Consumer | Classification | Target treatment |
| --- | --- | --- |
| Flask `GameStore` reads/writes | INTERNAL_LEGACY | remains unchanged during migration; removed when Flask retires |
| Fastify `ReadonlyCatalog` | INTERNAL_LEGACY | replace with SQL catalog service |
| Flask/Fastify publication/review | INTERNAL_LEGACY | target journal writes DB/object rows, not index |
| Backup archive `data/index.json` | BACKUP_DEPENDENCY | import as legacy input; target backup includes SQL/object inventory |
| Admin/tests using index fixture | TEST_ONLY / INTERNAL_LEGACY | replace with target fixtures; retain legacy import tests |
| Host tooling and firmware | NOT A DEPENDENCY | they consume HTTP APIs, not server paths |
| `.well-known` discovery | PUBLIC_API_DEPENDENCY | remains JSON HTTP contract; it does not expose index storage |
| Documentation examples | INTERNAL_LEGACY | update after target implementation, not in M5.2 runtime |

Decision: **C during migration, then A in final runtime**. The migration tool
may read `index.json` as a source because the legacy database lacks catalog
rows. A compatibility export may be generated under `compatibility/` for
diagnostics or a short-lived Flask bridge, with an explicit generated marker,
source schema fingerprint, and timestamp. It is never read back by Fastify and
never edited manually. After the final HTTP cutover and Flask retirement, the
export is optional and can be removed.

## 13. Configuration and Docker persistence

The target should derive paths from one root:

| Variable | Meaning | Target default |
| --- | --- | --- |
| `PRG32_DATA_ROOT` | canonical persistent root | deployment-provided; required in production |
| `PRG32_DATABASE_PATH` | optional explicit DB path | `${PRG32_DATA_ROOT}/store.sqlite` |
| `PRG32_BACKUP_ROOT` | optional backup destination | `${PRG32_DATA_ROOT}/backups` |
| `PRG32_READ_ONLY` | prohibit publication and repair writes | `false` for target service, `true` for shadow |
| `PRG32_STORAGE_LAYOUT_VERSION` | expected layout marker | `2` for this target design |

`storage/`, `journal/`, `compatibility/`, and staging paths derive from the
canonical root. Production startup requires an existing compatible marker or a
deliberate initialization command; it must not initialize an empty store over
an incompatible root. Test and dev use temporary or `.local/` roots only.

The existing single Compose file and external Dream Traefik model remain valid:
one target backend container can mount one persistent `/data` bind. Dev keeps
Flask and Fastify roots separate until cutover. The target container runs as a
non-root user where the host bind permissions allow it, uses `0700` directories
and `0600` objects/DB, and keeps backup output on an explicit path. No
anonymous Docker volume is required.

No Compose, Traefik, Authentik/provider, or active runtime configuration change
is part of M5.2.

## 14. Backup and restore model

The target backup contains:

- a consistent SQLite backup created through the SQLite backup API, not a live
  file copy;
- schema, storage-layout, journal-format and application versions;
- the complete object/media/journal inventory with size and SHA-256;
- staging/quarantine only when an administrator explicitly requests an
  incident snapshot;
- settings, users, scores, runs, samples, submissions and review history;
- optional encrypted secret material using the existing key lifecycle rules.

SQLite WAL/journal files are not independently treated as a consistent backup.
The backup API produces a stable database image; the filesystem snapshot is
then copied while publication is quiesced or from a storage snapshot with a
matching operation watermark. The manifest records the operation watermark
and every referenced object hash. A backup is valid only when the DB backup,
object inventory, foreign keys, and publication state all agree.

Restore is two-phase: validate into a new temporary root, run SQLite integrity
and foreign-key checks, verify every referenced object, and only then atomically
rename the prepared root into place while the service is stopped. Existing
Flask v1 archives remain importable through a dedicated legacy adapter that
maps `data/index.json` and old relative paths into the target model. The v1
archive is never rewritten in place and unsupported/ambiguous records stop the
import rather than being discarded.

## 15. Integrity checking and garbage collection

The default `audit` command is read-only and reports:

- missing object files for published artifact/media rows;
- size or SHA-256 mismatches;
- invalid media MIME/signature or malformed ABI JSON;
- orphan object files and duplicate object references;
- releases with no valid artifact or mixed publication state;
- foreign-key violations and invalid lifecycle combinations;
- incomplete publication operations/events;
- staging directories without a matching submission or operation;
- unsafe symlinks, path escapes, permissions, and unexpected files.

Repair is a separate explicit command with a dry-run plan, operator approval,
operation ID, backup requirement, and immutable audit event. It may reconcile a
known journal operation or move an unreferenced file to quarantine. It never
deletes an orphan merely because it appears unreferenced. GC may delete only
objects that have no DB reference, are outside any active/recoverable
operation, are beyond a retention period, and are named in an approved
deletion manifest.

## 16. Security model

- Normalize and validate every user-controlled identifier before use.
- Generate all object paths; never interpolate titles or uploaded filenames.
- Reject absolute paths, `..`, NUL bytes, separators in components, symlinks,
  hard-link surprises, and TOCTOU path changes.
- Perform ZIP limits and entry validation before extraction/materialization.
- Verify magic bytes and bounded MIME/image dimensions; do not trust a MIME
  header or extension.
- Write temp files with exclusive create, restrictive permissions, fsync, and
  atomic rename; never overwrite an immutable object.
- Recheck file identity and size before serving; fail closed on mismatch.
- Protect journal, DB, backup and staging paths from public static serving.
- Keep backup encryption keys outside the archive and redact secrets from
  errors/logs.
- Enforce the existing authentication, CSRF, bearer-token, ownership, editor,
  and administrator policies at the service boundary.
- Use bounded request, archive, media, and export sizes; rate-limit or
  aggregate anonymous download telemetry where operational policy requires it.

## 17. Versioning and fail-safe startup

The target stores one singleton `storage_metadata` row and a durable
`schema_migrations` history. The supported tuple is:

```text
schema_version = 2
storage_layout_version = 2
publication_journal_version = 1
backup_format_version = 3
```

These are proposed target versions, not active repository migrations. The
backend refuses to start in write mode when the tuple is missing, newer than
the supported implementation, marked incomplete, or points at a non-empty
legacy root without an explicit import mode. Read-only audit mode may inspect
an unsupported root but may not create tables or move files.

An interrupted migration is identified by a manifest and target marker with
`state = running` or `recovery_required`; normal service startup refuses it.
An explicit resume or rollback command must resolve it.

## 18. Compatibility summary

The compatibility matrix in
[`79-storage-compatibility-matrix.md`](79-storage-compatibility-matrix.md)
lists every required externally observable capability. The target changes
internal storage only. Public paths, JSON ABI identifiers, `game_id`, version,
architecture strings, binary bytes, discovery, score/metrics, publishing,
auth, admin, backup, WebSocket, and mDNS contracts remain gates for later
implementation.

## 19. Testing and validation strategy

The next implementation milestones use disposable temporary directories and
SQLite databases only. No test opens the operational `data/` root for writes.
The validation layers are:

1. target schema initialization, version-marker refusal, foreign keys and
   integrity checks;
2. deterministic legacy fixtures covering one/multiple versions, both
   architectures, media, pending/rejected/verified submissions, users, scores,
   runs, samples, download events, malformed index entries, missing files,
   orphans, duplicates, unsupported architectures and hash mismatches;
3. legacy import and target object migration with exact hash/size mapping,
   resumable manifest checkpoints and idempotent reruns;
4. SQL-only catalog response comparisons proving no index read or directory
   enumeration, followed by detail/media/download byte/header/error comparison;
5. download telemetry comparison for valid, repeated, anonymous, range,
   conditional, failed-resolution and interrupted-stream cases;
6. publication/review fault injection at every journal state, including
   process termination and recovery from a fresh process;
7. backup/restore inventory, WAL-safe SQLite backup, legacy v1 import,
   target restore validation, encryption/redaction and rollback rehearsal;
8. firmware/host contract fixtures for mDNS, discovery, metadata/colophon,
   architecture selection, URL encoding, `Content-Length`, raw binary bytes,
   score/metrics POSTs, publishing and WebSocket ownership;
9. read-only audit and explicit repair/GC dry-run tests, including symlink,
   traversal, MIME spoofing, object substitution and TOCTOU cases.

Playwright/browser E2E infrastructure is intentionally outside this storage
milestone. HTTP injection, deterministic fixture tests and read-only runtime
checks are sufficient for the storage boundary; browser acceptance remains a
separate UI concern.

## 20. Trade-offs and remaining risks

The design chooses SQLite plus a local immutable object store because the
project is a small classroom service with one host, bounded artifacts, and
existing bind-mounted persistence. It avoids distributed infrastructure and
keeps backups portable. The cost is that publication coordination, integrity
audits, object GC, and migration tooling must be implemented carefully.

Important risks remain:

1. Legacy `index.json` is the only current catalog metadata source, so import
   must halt on malformed or conflicting entries rather than guess.
2. Flask and Fastify session formats are incompatible; storage migration alone
   does not provide browser session continuity.
3. Existing backups contain the legacy layout and need a tested import adapter.
4. Download telemetry currently has only game/version/architecture identity;
   historical events need deterministic artifact mapping or an explicitly
   preserved legacy-null relationship.
5. Replacing a same-version publication requires a revision policy that keeps
   old artifacts available for rollback without changing the public version
   string.
6. mDNS and multiplayer remain single-owner process concerns independent of
   the catalog model.

## 21. Next implementation milestone

The next milestone should be **M5.2a — disposable target schema and storage
foundation**. It may create a new temporary SQLite database, target schema
initializer, object-store resolver, and read-only integrity fixture. It must
not point at Flask `data/`, enable operational Fastify writes, import real
data, change routes, or begin M6.3d.2h.12.

The migration tool, differential API/firmware validation, recovery/rollback
rehearsal, and operational handover remain separate gated milestones.
