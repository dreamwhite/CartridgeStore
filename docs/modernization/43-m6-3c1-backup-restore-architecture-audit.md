# M6.3c.1 — Backup/Restore Architecture & Security Audit

**Date:** 2026-10-12
**Status:** assessment and design only
**Implementation:** none
**Operational writer:** Flask remains the only writer
**Production cutover:** not authorized
**Next milestone:** M6.3c.2, only after the decisions and acceptance criteria in this document are approved

## 1. Scope and conclusion

This milestone reviewed the existing Flask backup and restore implementation,
the SQLite and filesystem boundaries, the Fastify foundation, the M5.2a
publication journal, and the M6.3b capacity/resilience evidence.

No backup or restore service, route, dependency, schema change, deployment
change, or operational database action was introduced.

**Conclusion: NO-GO for implementing production restore or cutover. GO for a
controlled M6.3c.2 implementation design once the product decisions below are
approved.** The current Flask workflow is usable as a compatibility reference,
but it is not a safe recovery mechanism for a TypeScript production service.

The central boundary is not SQLite alone. A Cartridge Store backup contains a
SQLite database plus a filesystem catalog and cartridge tree. SQLite can make a
consistent database snapshot, but it cannot atomically commit that snapshot with
independent filesystem files. A safe future workflow therefore needs explicit
quiescence, staging, validation, a pre-restore recovery point, replacement
journaling, and post-restore verification.

## 2. Evidence inspected

The assessment used:

- docs/modernization/19-revised-migration-roadmap.md;
- docs/modernization/40-m6-3-discovery-and-implementation-plan.md;
- docs/modernization/41-m6-3a-statistics-parity-report.md;
- docs/modernization/42-m6-3b-sqlite-capacity-resilience-report.md;
- Flask routes and helpers in cartridge_store/app.py;
- Flask authentication and CSRF enforcement in cartridge_store/auth/;
- catalog, publication, settings, and metrics storage code;
- the Fastify backend foundation and existing auth/error/database services;
- the isolated M5.2a publication journal and its tests;
- existing backup, admin, API-contract, and service tests;
- the companion ../PRG32 repository read-only.

The M6.3b report records a successful SQLite backup while a disposable writer
added rows. That is evidence for a coherent SQLite snapshot only; it does not
establish a coherent snapshot of the catalog files and SQLite together.

## 3. Current Flask contract and behavior

### 3.1 Publicly reachable admin operations

The existing routes are:

| Method | Route | Current authorization | Current result |
| --- | --- | --- | --- |
| GET | /admin/backup | administrator | HTML backup page |
| GET | /admin/backup/download | administrator | ZIP attachment named prg32-cartridge-store-backup.zip |
| POST | /admin/backup/restore | administrator | multipart upload, then redirect to /admin/backup |

GET /admin/backup/restore is not accepted by the route and returns 405.

Browser-session POSTs require the existing CSRF token. The global Flask policy
allows an authenticated bearer-only request to bypass the browser-session CSRF
check; this is existing behavior and must be an explicit TypeScript product
decision rather than an accidental side effect.

Unauthenticated HTML requests follow the existing login behavior and non-admin
principals receive the existing forbidden response. There is no separate
backup-specific authorization or audit record.

### 3.2 Export format observed in code

The current exporter creates a ZIP with this shape:

    manifest.json
    database.sqlite
    data/
      <every regular file found below DATA_DIR, except the configured main DB>

The manifest currently contains only:

    {
      "abi": "prg32-cartridge-store-backup-1.0",
      "database": "database.sqlite",
      "data_dir": "data/"
    }

The database is copied with SQLite's Connection.backup() API after the Flask
connection is committed. Files are then added from DATA_DIR using relative POSIX
paths. The archive uses ZIP_DEFLATED. The current implementation does not write
per-file hashes, source database metadata, schema version, creation time, or an
explicit backup format version.

The data tree can contain index.json, published cartridges, pending
submissions, custom static assets, and other files placed below the configured
data directory. SQLite -wal, -shm, or journal sidecars are not explicitly
excluded if they are present below that directory. A configured database outside
DATA_DIR is excluded by resolved-path equality only.

The exporter creates its archive in the system temporary directory. The current
route returns it with send_file, but there is no explicit cleanup callback in the
reviewed helper, so temporary archive lifecycle is an operational risk.

### 3.3 Restore behavior observed in code

The current restore reads the complete uploaded request into memory, writes it
to a temporary ZIP, checks only that database.sqlite is present, extracts the
archive using a resolved-path traversal check, and opens the extracted database
with SQLite. It does not validate the manifest, ABI, schema, integrity result,
foreign keys, entry limits, compression ratio, duplicate names, file types,
symlinks, or cross-references between the database and catalog.

After that limited validation it closes the Flask database connection, deletes
all current children of DATA_DIR except the configured database path, copies the
extracted data tree, and copies the extracted database into place.

Those operations are not one transaction. A process failure or copy error can
leave an empty, partially restored, or mixed database/filesystem state. There is
no pre-restore recovery snapshot, durable restore journal, rollback path, or
post-restore cross-reference validation. copytree(..., dirs_exist_ok=True) is
used after the current tree has already been deleted.

Malformed ZIPs and lower-level extraction/SQLite errors are not normalized into
a dedicated restore error contract. StoreError cases are rendered through the
existing Flask error behavior; other exceptions can become a generic 500. The
upload is bounded by the general 8 MiB Flask request limit, but there is no
backup-specific streaming, staging, or archive-size policy. This can reject a
valid backup larger than 8 MiB while still allowing unbounded expansion inside
that request relative to the upload limit.

## 4. Data and security boundary assessment

### 4.1 What a full current archive can contain

The SQLite copy contains the unified application data, including password
hashes, API-token hashes, registration-token hashes, user identifiers and
roles, score/run/metric data, and store settings. Settings may contain
configured provider or SMTP secret fields. The code does not include environment
variables or the Flask SECRET_KEY itself, and API tokens are stored as hashes,
not plaintext tokens; however, the database remains sensitive.

The filesystem portion can contain published and pending cartridge bytes,
catalog metadata, branding/static assets, and any other file placed below the
configured data directory. The exporter has no allowlist that prevents a
sensitive operator file from being included if it is placed there.

Flask sessions are client-side signed cookies rather than database session rows,
so the current archive does not contain an active server-side session store.
Possession of a database backup still exposes material useful for offline
password-hash or token-hash attacks and may expose stored provider
configuration.

### 4.2 Filesystem/catalog consistency

index.json is the catalog authority for published cartridge metadata and
variant paths. Published bytes live below the cartridge tree. Pending files are
referenced by submission metadata and paths under pending/. Publication can
update files/index and SQLite status in one process with compensation logic, but
these are still separate persistence systems.

A backup can therefore observe:

- a database snapshot taken before or after a publication status change;
- an index.json written between two file copies;
- a cartridge file replaced while it is being copied;
- pending metadata with a file tree from a different point in time; or
- a SQLite snapshot with WAL activity and filesystem files from another point.

The risk is greater with multiple processes or containers. The current
single-writer Flask deployment reduces, but does not eliminate, the race.

## 5. Security invariants for the future Fastify implementation

These rules are implementation-independent acceptance criteria. They should be
carried into the Fastify/TypeScript design and later into the Next.js operator
workflow without relying on Flask internals.

### Archive protocol invariants

1. The archive must be a recognized PRG32 Cartridge Store backup ABI.
2. There must be exactly one normalized manifest.json and exactly one
   database.sqlite at the archive root.
3. All other entries must be below data/; no absolute path, drive-qualified
   path, NUL byte, .. component, path alias, or extraction escape is allowed.
4. Duplicate raw or normalized filenames must be rejected.
5. Only regular files are allowed. Symlinks, hard-link metadata, device files,
   directories with ambiguous type bits, and unsupported ZIP features must be
   rejected or converted through a reviewed safe policy.
6. The manifest must declare the ABI, format version, fixed entry names, and
   integrity metadata required by the selected format. Unknown mandatory fields
   or incompatible versions must fail closed.
7. Archive bytes, entry count, manifest bytes, per-entry expanded bytes, total
   expanded bytes, path length, and compression ratio must be bounded before
   materialization.
8. Hashes and sizes must be verified while staged. Metadata must not be trusted
   merely because it appears in the ZIP central directory.

### Restore invariants

9. Restore must stage into a private directory owned by the service and must
   never extract directly over the live store.
10. The staged database must pass SQLite integrity checks, expected schema and
    compatibility checks, and any required foreign-key checks before live data
    is touched.
11. Staged catalog and cartridge references must be checked for missing files,
    unexpected files, unsafe paths, size/hash mismatches, and pending-submission
    consistency according to the approved format policy.
12. A validated pre-restore recovery point must exist before replacement starts.
13. Replacement must be journaled and recoverable at every boundary. A failed
    or interrupted restore must leave either the old complete store or the new
    complete store, or a clearly recoverable recovery point; it must not claim
    success for a mixed state.
14. A restore must quiesce publication, review, catalog writes, and other
    backup/restore operations. A process-local mutex is insufficient if more
    than one application instance can write the store.
15. Post-restore checks must run before the operation is reported successful.
    Failed verification must trigger rollback or an operator-visible recovery
    state.

### Authorization and observability invariants

16. Backup export and restore are administrator-only operations enforced in the
    backend, never only in the Next.js UI.
17. Browser-session mutations require a valid CSRF token. If bearer-admin
    restore is retained for automation, it must be an explicit documented
    policy with token scope, audit, and transport requirements.
18. Error responses expose stable categories and correlation identifiers, not
    ZIP, filesystem, SQL, stack, secret, or exception strings.
19. Every export, validation failure, restore start, replacement transition,
    rollback, and completion records an operator/audit event without recording
    credentials or archive contents.
20. Temporary archives, staged trees, recovery points, and logs have bounded
    lifetime, permissions, and cleanup behavior. Cleanup failure is observable.
21. Sensitive backup bytes are encrypted at rest under an operator-controlled
    key policy, or the backup format is explicitly redacted and its lost-data
    consequences are accepted.

## 6. Proposed limits and validation policy

The exact numeric limits require an operational decision in M6.3c.2. They must
be configurable, observable, and measured against real free space. The limits
below are the required policy dimensions, not an implementation claim or a
license to silently reject existing valid bundles.

| Limit | Required behavior | Compatibility note |
| --- | --- | --- |
| Compressed archive bytes | Reject before or during staging when the configured maximum is exceeded | Must exceed every supported export size, including cartridge bytes |
| ZIP entries | Bound total entries and reject duplicates | Count directories as well if the selected parser exposes them |
| Manifest bytes | Small fixed limit, validated before JSON parse | Prevents oversized metadata allocation |
| Per-entry expanded bytes | Reject before writing beyond the limit | Must accommodate the largest supported cartridge/database/file |
| Total expanded bytes | Enforce a cumulative bound during extraction | Must leave room for staging and a recovery snapshot |
| Compression ratio | Reject suspicious declared or observed expansion | Avoid integer overflow and zero-size denominator errors |
| Path length/components | Reject NUL, absolute, traversal, aliases, and excessive depth/length | Use one canonical POSIX policy in Flask fixtures and Fastify |
| Database bytes | Bound staged database.sqlite independently | Validate after copy and before opening with write access |
| Staging/recovery space | Require bounded free-space headroom before replacement | Include main DB, WAL/SHM behavior, data tree, and rollback copy |
| Operation time | Make long validation/replacement observable and cancellable at safe boundaries | Never cancel halfway through an unjournaled replacement |

The M6.3b large synthetic database was 141.90 MiB and was deliberately
disposable. It is useful evidence for sizing tests, not a production limit.
Initial staging policy should be derived from the largest supported real store,
compressed size, temporary expansion, and the required pre-restore recovery
point. A restore limit lower than the exporter can produce is a compatibility
defect.

Validation must be streaming or bounded. It must not call an equivalent of
upload.read() for an unbounded request and must not trust ZIP metadata without
counting bytes actually written.

## 7. Proposed Fastify architecture (design only)

The smallest safe target is a dedicated backup boundary, not a general storage
refactor. A future implementation can be organized as:

    backend/src/backup/
      format.ts       // ABI, manifest, normalized entry policy
      limits.ts       // bounded configuration and validation errors
      archive.ts      // streaming export/import and hashes
      validation.ts   // staged SQLite/filesystem/catalog checks
      recovery.ts     // recovery point and durable restore journal
      service.ts      // quiescence, replacement, verification, rollback
      routes.ts       // admin-only HTTP boundary

This is a design sketch only; none of these files is created by M6.3c.1.

The service should:

1. acquire an exclusive backup/publication/restore gate;
2. create a SQLite-consistent snapshot using the existing better-sqlite3
   capability and a controlled connection lifecycle;
3. snapshot the filesystem while the same gate prevents publication changes;
4. write a versioned manifest containing sizes, hashes, ABI, schema/data
   compatibility information, and the selected security policy;
5. stage and validate imports in a private directory with restrictive
   permissions;
6. create and verify a pre-restore recovery point;
7. journal each replacement step and retain enough information to roll back;
8. replace the database and filesystem according to an approved ordering;
9. run post-restore integrity and cross-reference checks; and
10. mark completion only after verification, otherwise enter rollback/recovery.

The existing M5.2a journal is useful evidence for explicit state transitions,
but it is disposable publication scaffolding and is not a production backup
journal. The M6.3b backup experiment demonstrates SQLite snapshot behavior but
does not replace the quiescence and filesystem protocol above.

The first TypeScript implementation should remain a single operational writer.
If multiple backend instances are later allowed, the gate must become a shared
file/lease or a separately approved coordination mechanism; an in-memory mutex
cannot protect the mounted /data volume across containers.

## 8. Product decision matrix

| Decision | Options | Security | Compatibility | Operational complexity | Recommendation | Cost of deferring |
| --- | --- | --- | --- | --- | --- | --- |
| Archive format | Keep v1 only; versioned v2; v1 import plus v2 export | Versioned validation is strongest | v1 import preserves existing Flask archives | Medium | Preserve v1 import under controlled validation; design a versioned v2 export | Future archives remain ambiguous and hard to evolve |
| Secret handling | Full plaintext DB; redact sensitive settings; encrypt full archive | Encryption gives best recovery fidelity; redaction reduces exposure | Redaction can lose provider configuration | Medium/high | Encrypt full operational backups with deployment-managed keys; never embed the key | Existing v1 archives remain sensitive and need restricted handling |
| Restore semantics | In-place overwrite; staged replace; staged replace plus recovery point | In-place is unsafe; recovery point limits blast radius | Staged replace preserves old data on failure | High | Staged validation, pre-restore snapshot, journal, rollback | Every restore remains a potentially destructive manual operation |
| Concurrent writers | Best effort; process mutex; exclusive maintenance gate | Best effort can mix DB/filesystem | Gate preserves snapshot coherence | Medium | One writer plus shared maintenance gate for backup/publication/restore | Backups can remain internally inconsistent |
| Recovery guarantee | No guarantee; operator copy; journaled rollback | Journaled recovery is strongest | No public contract is broken | High | Recoverable old or new complete store, never claim joint atomicity | Failures can require filesystem/database forensic repair |
| Archive limits | Fixed hardcoded; configurable bounded; unlimited | Bounded prevents resource exhaustion | Configurable limits can fit valid bundles | Low/medium | Configurable bounded defaults, tested against largest supported store | DoS and disk exhaustion risks remain |
| Admin authentication | UI-only; session admin; bearer admin; both | Backend enforcement is required | Existing Flask supports session and bearer | Low/medium | Backend admin role; preserve session+CSRF; make bearer restore explicit | Automation or firmware tooling may silently diverge |
| CSRF | Disable; browser token; route-specific bearer exception | Browser token prevents cross-site restore | Existing Flask has bearer-only bypass | Low | Require CSRF for sessions; allow bearer only under an explicit scoped policy | Ambiguous automation behavior or accidental cross-site exposure |
| Retention | No retention; operator-managed; automatic deletion | Automatic deletion can destroy recovery points | No current retention contract | Medium | Operator-managed encrypted retention first; separate deletion milestone | Storage growth continues and recovery policy stays informal |
| Operator recovery | Ad hoc shell repair; documented maintenance runbook; UI restore | Runbook with audit is safer | Does not alter API contracts | Medium | Document maintenance, verification, rollback, and escalation steps | Incidents depend on undocumented knowledge |
| Database portability | Raw SQLite copy; SQLite backup API; logical export | API snapshot avoids inconsistent live pages | Raw copy is not safe with WAL | Low/medium | SQLite backup API plus integrity/schema validation | WAL and open-connection behavior can corrupt or omit data |
| Filesystem integrity | Copy tree; manifest hashes; content-addressed store | Hashes detect drift | Hashes preserve existing bytes | Medium | Manifest sizes/hashes plus safe paths; no storage rewrite yet | Silent cartridge/index drift remains difficult to detect |

## 9. Compatibility and migration strategy

The target must preserve the existing public backup route behavior only where
that behavior is intentionally approved. The safer migration strategy is:

1. Treat the observed Flask v1 archive as a legacy import format, including its
   exact root names and ABI, but validate it with the new bounded reader.
2. Keep v1 import offline/admin-controlled until adversarial fixtures prove
   traversal, duplicate, oversized, corrupt-database, symlink, and partial-copy
   behavior is safe.
3. Introduce a versioned export format only after its manifest, secret policy,
   and recovery semantics are approved. Do not silently change the meaning of
   prg32-cartridge-store-backup-1.0.
4. Compare restored catalog identifiers, version and architecture names,
   binary hashes, submission paths, and relevant database rows against the
   source fixture before any operational use.
5. Do not use a Next.js route as the authority for backup or restore. Next.js
   may provide an operator UI later; Fastify must enforce the boundary.
6. Keep Flask as the authoritative writer until the backup/restore path has
   passed isolated and disposable end-to-end tests. There is no reason to
   migrate the Flask backup helper into a broad Python refactor.

## 10. Required M6.3c.2 implementation sequence

M6.3c.2 should not begin until the decision matrix and numeric limits are
approved. The recommended order is:

1. Add format, limit, error, and path-policy definitions without routes.
2. Build a bounded reader and importer for legacy v1 fixtures.
3. Add adversarial archives: traversal, absolute paths, duplicates, symlinks,
   oversized manifest/entry/archive, compression bomb, corrupt SQLite, missing
   manifest, wrong ABI, unknown fields, and mixed catalog/database fixtures.
4. Build disposable export/import round trips and compare hashes/identifiers.
5. Add the shared writer gate and durable restore state machine with injected
   fail points.
6. Add pre-restore recovery snapshots, rollback, and post-restore verification.
7. Add admin routes behind a disabled or explicitly disposable feature boundary.
8. Run Docker Compose profile tests on /data with non-production fixtures and
   verify that no deployment/Traefik change is required.
9. Review the operator runbook, retention, key management, and incident
   evidence before considering any production exposure.

This sequence must stop before public routing cutover and before Flask
retirement.

## 11. Test and evidence gaps

Existing tests prove the basic Flask happy path: an administrator can download
a ZIP and submit it to restore a disposable store. Existing contract tests also
verify the download response shape and attachment headers. The repository does
not currently prove:

- invalid ZIP, manifest, ABI, or schema rejection;
- duplicate normalized names or symlink/hard-link rejection;
- archive expansion, compression-ratio, request, or staging limits;
- database integrity_check, foreign-key, schema, and catalog/file validation;
- recovery-point creation and rollback at each replacement boundary;
- concurrent publication/backup/restore coordination;
- secret redaction/encryption and backup-file permission policy;
- durable audit events and stable restore error envelopes;
- operator recovery after process termination; or
- compatibility of a bounded Fastify importer with real Flask v1 archives.

These are deliberate M6.3c.2 gaps, not failures of the read-only M6.3c.1
assessment.

## 12. Verification performed for this milestone

The current turn made no application, schema, Docker, Traefik, database, or
firmware changes. No production backup was created, imported, or restored.
The inspection was read-only; any future archive tests must use disposable
temporary directories and isolated fixtures.

The repository retained its pre-existing dirty state. The only intended
addition from this milestone is this document. The companion ../PRG32
repository was inspected read-only and was not modified.

Before reporting this milestone, the following repository checks were run:

    git diff --check                         PASS
    git status --short                       PASS (pre-existing changes retained)
    git -C ../PRG32 status --short           PASS (unchanged by this milestone)

The Python, Fastify, frontend, Compose, and Docker results cited by this audit
are the executed evidence recorded in the M6.3a and M6.3b reports. This audit
did not claim a new application test pass because it added no executable code.

## 13. Final assessment

The existing Flask backup is a compatibility reference and a useful starting
point for fixtures, not a production-grade cross-system recovery protocol.
SQLite snapshot support is adequate for the database portion when used with the
proper connection lifecycle, but filesystem quiescence, bounded archive
validation, sensitive-data handling, rollback, and post-restore verification
are still missing.

M6.3c.1 is complete as an architecture and security audit. The next authorized
step is M6.3c.2 implementation of the approved bounded, staged, recoverable
workflow. No M6.3c.2 code has been started here.
