# M6.3c.2 — Application Backup & Recoverable Restore Report

**Date:** 2026-10-12
**Status:** implemented and verified in the isolated Fastify disposable writer
**Operational writer:** Flask remains authoritative for production
**Production backup routes:** disabled by default; no public routing cutover
**Schema migration:** none
**Next milestone:** M6.3d, only after an explicit decision on production exposure, retention, and operational key handling

## 1. Executive summary

M6.3c.2 adds an application-level backup and recoverable restore system to the
isolated Fastify backend. It supports:

- safe import of legacy Flask v1 archives;
- versioned v2 export/import with an inventory, sizes, SHA-256 hashes, and
  schema compatibility metadata;
- optional portable password protection using scrypt and AES-256-GCM;
- SQLite-consistent export snapshots through the existing better-sqlite3
  backup API;
- bounded ZIP validation and streaming extraction into a private staging tree;
- filesystem/catalog/reference validation;
- administrator-only download and browser-session/CSRF-only restore routes;
- a durable restore journal, pre-restore recovery points, rollback, and
  restart recovery.

The implementation is intentionally isolated. It does not modify Flask,
firmware, Next.js, the SQLite schema, production Traefik routing, or production
data. The feature requires both PRG32_BACKEND_BACKUP_ENABLED=true and the
explicit disposable PRG32_BACKEND_BACKUP_MODE=test setting. The default remains
disabled.

**Recommendation:** GO for isolated disposable use and continued compatibility
testing. NO-GO for production exposure or public routing cutover until the
operational key/retention policy, multi-process writer deployment assumption,
and large-export memory behavior are separately approved.

## 2. Files changed

Added:

- backend/src/backup/format.ts
- backend/src/backup/archive.ts
- backend/src/backup/service.ts
- backend/src/backup/routes.ts
- backend/tests/backup.test.ts
- docs/modernization/44-m6-3c2-application-backup-restore-report.md

Modified:

- backend/src/app.ts
- backend/src/config/env.ts
- docker-compose.yml
- docs/modernization/19-revised-migration-roadmap.md

The backend directory and modernization documentation were already untracked
work from earlier milestones; no unrelated changes were discarded.

## 3. Application backup scope

The v2 exporter includes:

- a consistent SQLite database snapshot;
- index.json and all regular application-managed files below the store root;
- published cartridge files;
- pending submission files;
- static and uploaded application assets;
- per-file sizes and SHA-256 hashes.

It excludes:

- SQLite -wal, -shm, and -journal sidecars;
- publication locks, publication journals, publication staging/backups;
- backup staging, recovery points, and backup journals;
- absolute installation paths, host/container identifiers, source code,
  dependencies, build caches, and environment-only secrets.

Symlinks, unsupported file types, and unsafe store files fail export rather than
being silently followed. Empty directories are not serialized because the
application recreates required directory structure.

Legacy Flask v1 archives are accepted with the exact existing ABI and root
names:

- manifest.json
- database.sqlite
- data/

Legacy archives do not need v2 inventory metadata. Database sidecars found under
legacy data are not restored as independent SQLite artifacts.

## 4. V2 archive specification

The v2 manifest uses:

- ABI: prg32-cartridge-store-backup-2.0
- format_version: 2
- created_at: portable ISO timestamp
- database: database.sqlite
- data_dir: data/
- application: prg32-cartridge-store
- inventory: archive path, byte size, SHA-256
- schema: fingerprint and table names

Inventory covers database.sqlite and data/* files. manifest.json is validated
but is not self-listed in its own inventory.

Archive paths are canonical portable relative POSIX paths. The importer rejects:

- traversal, absolute, drive-qualified, NUL, empty, dot, and dot-dot paths;
- duplicate normalized paths;
- unexpected root entries;
- symlink, device, and unsupported Unix file types;
- encrypted ZIP entries and unsupported compression methods;
- ZIP64 archives in this initial implementation;
- missing or incompatible manifest/database entries.

The exporter scans its own generated archive using the same limits as the
importer before returning it. This prevents the exporter from producing an
archive that its supported importer rejects.

## 5. Optional password encryption

An administrator may request password protection with the
X-PRG32-Backup-Password header during export, or the backup_password multipart
field during restore.

The encrypted artifact contains:

- a small plaintext format header;
- a random 16-byte salt;
- a random 12-byte AES-GCM nonce;
- scrypt KDF metadata;
- AES-256-GCM ciphertext and authentication tag.

The password is never stored or logged. The original Flask SECRET_KEY,
Fastify session secret, host path, and installation identity are not needed for
decryption. A compatible installation needs only the archive and password.

Incorrect passwords and tampering return the stable
backup_decryption_failed category. Live SQLite and cartridge files remain
unencrypted; encryption applies only to exported artifacts.

Unencrypted archives are explicitly sensitive. They can contain user records,
password hashes, token hashes, scores, metrics, settings, and cartridge data.

## 6. Resource limits

The initial disposable defaults are configurable through the backend
environment:

| Limit | Default |
| --- | ---: |
| Compressed archive | 1 GiB |
| Expanded archive | 4 GiB |
| Expanded single entry | 2 GiB |
| Manifest | 256 KiB |
| ZIP entries | 50,000 |
| Normalized path length | 1,024 bytes |
| Path depth | 32 components |
| Compression ratio | 200:1 |

The ZIP central directory is scanned before extraction. Actual extracted bytes
are counted while fflate streams entries into staging files. Archive, entry,
manifest, expanded-total, path, entry-count, and compression-ratio failures
have stable categories.

Restore also checks free filesystem space before creating the recovery point.
The check reserves space for the current store, staged data, and configured
expanded limit. This is intentionally conservative for a local installation.

The exporter currently builds the final ZIP with fflate zipSync, so the output
is bounded by configured archive/expanded limits but can still require
substantial process memory for a large export. This remains a production
capacity risk and should be replaced with a fully streaming ZIP writer before
large production stores are supported.

## 7. SQLite consistency

Export uses better-sqlite3 Connection.backup() and never copies an active WAL
file as the database snapshot.

Before restore, the staged database must pass:

- PRAGMA integrity_check;
- PRAGMA foreign_key_check;
- required table presence;
- schema fingerprint validation for v2;
- full table/column/index/foreign-key compatibility against the target
  installation.

Restore does not run migrations. It attaches the validated database and copies
all application tables into the existing writable schema in one SQLite
transaction, preserving identifiers and sqlite_sequence values. This avoids
replacing the inode behind the long-lived Fastify connection.

## 8. Filesystem and catalog consistency

Backup and restore use the existing publication.lock filename as a local
maintenance gate. The Fastify backup operation holds that filesystem lock across
the asynchronous SQLite snapshot or restore replacement. Existing publication
code uses the same lock path.

This is sufficient only for the current single-writer disposable deployment
assumption. Multiple Fastify instances or another writer process must not share
the store without a separately approved coordination mechanism.

Staged validation checks:

- catalog JSON shape and ABI;
- every published catalog variant resolves to a regular file inside the store;
- pending submission paths and referenced variant files;
- archive inventory sizes and hashes;
- no symlink escape or unsafe reference.

The design does not claim joint atomicity between SQLite and independent
filesystem files. Recovery artifacts provide a recoverable old state instead.

## 9. Restore and recovery design

The restore sequence is:

1. Receive the upload into a private 0700 temporary directory.
2. Enforce compressed upload limits.
3. Decrypt, if applicable, into private staging.
4. Scan ZIP structure and central-directory metadata.
5. Stream-extract to a private staging tree.
6. Validate manifest, inventory, hashes, SQLite, catalog, and references.
7. Check available storage.
8. Acquire the local maintenance gate.
9. Create a durable pre-restore recovery point.
10. Journal recovery creation.
11. Replace database contents transactionally.
12. Replace managed filesystem data from staging.
13. Re-run integrity and reference checks.
14. Mark the operation COMPLETED.
15. Release the maintenance gate and clean temporary upload/staging files.

The journal lives below backup-operations and records states including
RECEIVED, STAGED, VALIDATED, RECOVERY_CREATED, DB_REPLACED,
FILESYSTEM_REPLACED, VERIFYING, COMPLETED, ROLLBACK_REQUIRED,
ROLLED_BACK, and ROLLBACK_FAILED.

A recovery point contains a SQLite backup and a filesystem snapshot below
.prg32-backup-recovery. Recovery points and journals are not included in new
application archives. Completed recovery artifacts are retained; automatic
retention/deletion is intentionally not implemented.

Failures after recovery creation trigger rollback. On process restart,
BackupService.recoverIncomplete() detects non-terminal journal states and
restores the previous recovery point. A rollback failure is recorded as
ROLLBACK_FAILED and fails closed with a manual-recovery category.

## 10. Authorization and error behavior

Implemented routes, registered only when the feature flag is enabled:

- GET /admin/backup/download
- POST /admin/backup/restore

Download requires an authenticated administrator. Restore additionally
requires:

- an authenticated browser session;
- administrator role;
- a valid session CSRF token from header or multipart field.

Bearer-only restore is explicitly rejected with
backup_bearer_restore_disabled. No new token scope or authentication model was
introduced.

Public responses use stable categories and do not expose raw SQLite, ZIP,
filesystem, or cryptographic exception text. Detailed exception causes remain
server-side error causes/log context.

Temporary exported files are removed after the response stream closes or fails.
Uploaded archives and decrypted staging files are removed after the operation.

## 11. Test evidence

Fastify command:

    source "$HOME/.nvm/nvm.sh" && nvm use 24
    cd backend
    pnpm run check

Result: PASS.

- 15 test files
- 86 tests passed
- TypeScript typecheck passed
- ESLint passed
- production TypeScript build passed

The dedicated backup tests cover:

- feature disabled by default;
- v2 export and manifest/inventory;
- v1 Flask-compatible import;
- cross-installation v2 restore using isolated stores;
- Unicode filename and binary preservation;
- unencrypted and password-protected round trips;
- wrong password and tamper detection;
- anonymous, non-session, and CSRF boundaries;
- bearer-only restore rejection;
- traversal, duplicate normalized path, symlink metadata, unsupported
  compression, missing manifest, corrupt database, and missing cartridge;
- failed post-filesystem restore rollback;
- incomplete journal detection and restart recovery.

Flask regression:

    SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q
    ./.venv313/bin/python -m py_compile app.py cartridge_store/*.py tests/compatibility/generate_*.py

Result: PASS. 64 pytest tests passed and Python compilation passed.

Frontend regression under Node 24:

    source "$HOME/.nvm/nvm.sh" && nvm use 24
    cd frontend
    pnpm run typecheck
    pnpm run lint
    pnpm run test
    FLASK_PROXY_TARGET=https://api.prg32.dream.test pnpm run build

Result: PASS. Two frontend test files and 5 tests passed. The existing Vite
configLoader native warning remains non-fatal.

## 12. Docker E2E evidence

The final E2E used a fresh Compose project and three uniquely named disposable
volumes under the writer profile. No production volume, Flask service, Traefik
route, or host data directory was mounted.

The test verified:

- disposable Fastify writer startup;
- administrator bootstrap;
- unencrypted export;
- unencrypted restore: HTTP 200;
- password-protected export;
- password-protected restore: HTTP 200;
- wrong password: HTTP 400;
- corrupt archive: HTTP 400;
- SQLite PRAGMA integrity_check: ok;
- mounts limited to /writer-data, /writer-shadow, and /writer-store.

The disposable resources were stopped and removed after the run. The first
diagnostic attempt used a deliberately short test bootstrap token and failed at
configuration validation; rerunning with the required 32-character disposable
secret passed. This was an E2E harness input correction, not an application
behavior change.

Docker checks:

    docker compose --profile writer config
    docker build -t prg32-cartridge-store-backend:m63c2 ./backend
    docker build -t prg32-cartridge-store:m63c2 .
    docker build -t prg32-cartridge-store-frontend:m63c2 ./frontend

All passed. Images remain multistage and use Node 24 slim for TypeScript
backend/frontend runtimes.

## 13. Remaining risks and explicit incomplete items

- The new implementation is deliberately restricted to the disposable
  Fastify writer. It is not production-routed.
- Export ZIP creation is bounded but not fully streaming in memory.
- A shared filesystem lock is not a distributed coordinator.
- Recovery-point retention and deletion policy require a separate operational
  decision.
- Password handling is local application-level encryption; key rotation,
  operator secret storage, and backup custody remain runbook decisions.
- A failed rollback path is recorded and fails closed, but no production
  incident-repair workflow is provided.
- The Docker disposable fixture starts with no published cartridge. Populated
  cartridge/hash preservation is covered by the isolated unit round trips, not
  by the empty-container E2E.
- No host OS, Docker volume, or cloud backup system is included.

These limitations prevent production cutover but do not block the approved
isolated M6.3c.2 scope.

## 14. Acceptance assessment

| Criterion | Result |
| --- | --- |
| Legacy Flask v1 safely imports | PASS |
| Versioned v2 export/import | PASS |
| Full tested application state preserved | PASS |
| Cross-installation portability | PASS |
| Optional password encryption | PASS |
| No installation-specific secret required | PASS |
| Resource limits enforced | PASS |
| Unsafe archives rejected | PASS |
| SQLite integrity verified | PASS |
| Filesystem references verified | PASS |
| Restore staging | PASS |
| Recovery points | PASS |
| Rollback tested | PASS |
| Interrupted restore detected | PASS |
| Administrator authorization | PASS |
| Browser-session CSRF | PASS |
| Bearer-only restore rejected | PASS |
| No production data modified | PASS |
| No public routing change | PASS |
| Regression tests | PASS |
| Docker E2E | PASS |
| Production-ready large export behavior | NOT YET; memory risk remains |

## 15. Final recommendation

M6.3c.2 is complete for the isolated, disposable Fastify implementation and
compatibility gate.

**GO:** local disposable backup/restore testing, fixture migration testing, and
continued Fastify development.

**NO-GO:** production exposure, public Traefik routing, Flask writer cutover,
automatic retention/deletion, or claims of joint SQLite/filesystem atomicity.

The next milestone should decide production backup custody, retention,
large-export streaming, and the supported single-writer deployment topology.
M6.3d is not started by this report.
