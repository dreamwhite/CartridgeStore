# M4.4 — Write-Isolation Security Remediation

**Date:** 2026-10-12
**Status:** remediation implemented and verified; M5 not started and not
approved

## 1. Decision

M4.4 closes the M4.3-confirmed path-alias bypass for the isolated
authentication writer. Symlink aliases and hardlink aliases to the operational
SQLite file are rejected, valid disposable databases remain usable, and unsafe
or incomplete configurations fail closed.

This does not authorize a public authentication cutover or any M5 write. The
remaining TOCTOU and mount-provenance limitations are explicit deployment
boundaries and remain M5 prerequisites.

No Flask behavior, SQLite schema, production database, Traefik route, frontend
UI, or deployment was changed.

## 2. Root cause

M4.1 compared only `path.resolve()` strings for
`PRG32_BACKEND_DB` and `PRG32_BACKEND_AUTH_WRITE_DB`. That normalized `.` and
`..` components but did not establish physical file identity. A symlink or
hardlink could therefore present a different path while opening the same
operational inode.

The writer also had no approved disposable-root requirement. A mode value such
as `test` was not evidence that the target was disposable.

## 3. Implemented remediation

### 3.1 Configuration boundary

When auth writes are enabled, configuration now requires all of:

```text
PRG32_BACKEND_AUTH_WRITE_ENABLED=true
PRG32_BACKEND_AUTH_WRITE_MODE=test
PRG32_BACKEND_AUTH_WRITE_DB=/absolute/path/to/disposable/auth.sqlite
PRG32_BACKEND_AUTH_DISPOSABLE_ROOT=/absolute/path/to/disposable
PRG32_BACKEND_SESSION_SECRET=<local-only-secret>
```

The root and writer database must already exist. The implementation does not
create directories or database files. Auth writes remain disabled by default.
SQLite URI syntax (`file:`, `?mode=`, and `&mode=` forms) is rejected rather
than passed to the driver.

### 3.2 Canonical path and root validation

The writer validation:

1. requires the disposable root to be an existing regular directory and not a
   symlink itself;
2. canonicalizes the root and target with `realpath` for containment checks;
3. rejects writer symlinks and symlink components between the approved root
   and the writer/sidecar paths;
4. requires the writer to be an existing regular file inside the canonical
   root;
5. rejects configurations where the canonical disposable root contains the
   operational database;
6. rejects missing, directory, URI, and otherwise ambiguous targets.

System-level symlinked ancestors outside the approved root (for example the
macOS `/var` layout) are canonicalized and do not count as an escape. Symlink
indirection inside the configured disposable tree is rejected.

### 3.3 Device/inode identity

The operational database must exist as a regular file. The writer and
operational files are compared using `st_dev` and `st_ino` from `fs.statSync`.
This rejects hardlinks even when the writer path is inside the approved root.
The same physical identity check is repeated after the database path is
opened. Direct textual equality remains an early, clear configuration error,
but is no longer the security control.

### 3.4 SQLite sidecars

Existing `-wal`, `-shm`, and `-journal` files next to the writer must be
regular files, must not be symlinks, and must remain inside the disposable
root. SQLite may create sidecars during a valid write, so the root must be a
writable disposable location. The operational database is never opened as a
writer by this code.

The main database identity check does not treat a sidecar as the database
itself. Sidecar placement is therefore constrained by the root and mount
configuration, and must be included in container backup/cleanup procedures.

## 4. Race and driver limitations

Validation occurs before opening and is repeated after `better-sqlite3` opens
the configured path. A deterministic replacement with a symlink, hardlink, or
different regular file between those checks is detected and the connection is
closed. A target replacement performed after the final validation cannot be
prevented by this path-based API.

`better-sqlite3` accepts a path and opens it internally; this implementation
cannot pass an already validated `O_NOFOLLOW` file descriptor or perform a
single atomic `openat` plus SQLite attach through the current API. Therefore it
does not claim protection against an attacker who can modify the disposable
directory concurrently or alter its permissions/mounts. The required boundary
is a trusted, access-controlled disposable directory or container mount that
the application process can write but untrusted processes cannot modify.

## 5. Docker isolation assessment

The normal `backend` Compose profile:

- does not set auth-write enablement, mode, writer path, disposable root, or
  session-secret variables;
- mounts the fixture directory at `/fixtures` read-only;
- binds port 5090 to loopback only;
- has no Traefik labels and no edge network;
- cannot create a missing writer database because the implementation requires
  an existing file and existing root.

Consequently, environment variables alone cannot enable an operational writer
in the normal profile. The profile is not a complete security boundary if an
operator changes the Compose file, adds a writable operational mount, or gives
an untrusted process access to the disposable root. That provenance decision
belongs to deployment/container policy and remains outside this milestone.

## 6. Regression test matrix

All cases use synthetic temporary directories and SQLite files. No production
path or data is referenced.

| Case | Expected result | Result |
| --- | --- | --- |
| Same database path | Reject | PASS |
| Relative path alias | Reject | PASS |
| Absolute normalized path alias | Reject | PASS |
| Symlink alias to operational DB | Reject | PASS |
| Hardlink alias to operational DB | Reject by device/inode | PASS |
| SQLite URI | Reject | PASS |
| Missing writer database | Reject | PASS |
| Directory instead of writer DB | Reject | PASS |
| Symlink escape from disposable root | Reject | PASS |
| Writer outside disposable root | Reject by containment | PASS |
| Dangling SQLite sidecar symlink | Reject by `lstat` | PASS |
| Valid disposable DB and schema | Open successfully | PASS |
| Writer disabled | Reject as not enabled | PASS |
| Missing required configuration | Reject at config load | PASS |
| Missing required auth schema | Reject before service use | PASS |
| Target replaced by operational hardlink before open | Reject | PASS |

The validation is synchronous, so a true scheduler-controlled mid-call race is
not deterministic to reproduce in a unit test. The implementation's post-open
identity check and its limitation are documented above.

## 7. Authentication compatibility

The existing auth regression suite remains green after the remediation:

- login and username/email lookup;
- bootstrap and concurrent one-time creation;
- session rotation, expiry, logout, and CSRF;
- registration and compatible Werkzeug scrypt password generation;
- scrypt/PBKDF2 verification fixtures;
- API-token list/create/rename/revoke lifecycle;
- owner-scoped token operations;
- role hierarchy and `editors` group checks;
- read-only/default-disabled behavior.

No HTTP response shape or authentication route was changed. The new root
requirement applies only when the isolated test writer is explicitly enabled.

## 8. Verification results

Executed with Node 24 via `nvm use 24` and pnpm:

| Command | Result |
| --- | --- |
| `pnpm run typecheck` in `backend/` | PASS |
| `pnpm run lint` in `backend/` | PASS |
| `pnpm run test` in `backend/` | PASS — 7 files, 41 tests |
| `pnpm run build` in `backend/` | PASS |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 63 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| Frontend typecheck | PASS |
| Frontend ESLint | PASS |
| Frontend tests | PASS — 2 files, 5 tests |
| Frontend production build | PASS |
| `docker compose --profile dev config` | PASS |
| `docker compose --profile backend config` | PASS |
| `SECRET_KEY=compose-prod-check docker compose --profile prod config` | PASS |
| `docker compose --profile backend build backend` | PASS — Node 24 multistage image |
| `git diff --check` | PASS |

The frontend test run retains Vite's non-failing config-loader warning. The
secret-injected Flask test command is the authoritative result; the separate
unqualified invocation without `SECRET_KEY` retains the previously documented
mDNS setup failure.

## 9. Files changed

- `backend/src/config/env.ts` — disposable-root configuration and URI guard;
- `backend/src/db/readonly.ts` — canonical containment, symlink, identity,
  sidecar, and post-open validation;
- `backend/tests/auth.test.ts` — isolated fixture updated for the disposable
  root and operational shadow file;
- `backend/tests/write-isolation.test.ts` — deterministic M4.4 regression
  matrix;
- `backend/README.md` — isolated writer configuration and boundary;
- `docs/modernization/19-revised-migration-roadmap.md` — M4.4 evidence and M5
  dependency;
- `docs/modernization/26-m4-4-write-isolation-remediation-report.md` — this
  report.

No Flask source, production configuration, Docker Compose routing, SQLite
schema, production data, or frontend UI was changed.

## 10. Remaining risks and M5 entry decision

Remaining risks:

1. `better-sqlite3` path opening cannot provide an atomic no-follow file
   descriptor guarantee through this integration;
2. filesystem permissions, bind-mount provenance, and concurrent directory
   access remain deployment trust boundaries;
3. the TypeScript authentication session store and rate limiter remain
   process-local;
4. route-level authorization parity and public auth cutover are incomplete;
5. Flask remains the sole operational writer.

**M5 entry decision: NO.** M4.4 is complete for its authorized remediation
scope and its unsafe configurations now fail closed, but M5 remains blocked
until the deployment trust boundary, remaining auth hardening, and route-level
authorization/cutover gates are separately reviewed. No M5 work was started.
