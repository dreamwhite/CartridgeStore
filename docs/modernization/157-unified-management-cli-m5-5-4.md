# PRG32 Cartridge Store — M5.5.4 Unified Management CLI

Status: implemented and verified for the disposable/self-hosted management boundary.

This report is the sole new M5.5.4 modernization report. The worktree already
contained unrelated, previously accumulated changes from M5.4 and M5.5.3;
those changes were preserved and were not reset.

## 1. Executive summary

M5.5.4 adds an executable repository-root `./manage.sh` for the Fastify +
Next.js runtime. It uses Node.js 24 for safe argument parsing and process
orchestration, Docker Compose v2 for runtime lifecycle, the existing encrypted
backup-v4 wrapper for backup operations, and the existing storage-v2 audit for
database checks.

The disposable candidate acceptance passed for image build, explicit deploy,
status, backend health/readiness, frontend health, logs, database integrity,
backup creation/verification/list/status, deploy dry-run, and stop. A
standalone installation fixture passed twice without replacing its data or
key registry.

Update apply is intentionally fail-closed. No trusted update source,
migration compatibility proof, or safe automatic rollback contract is inferred
from Git or a registry. Operational deploy is explicitly blocked in this
milestone.

## 2. Scope and constraints

Implemented:

- root management entry point and command parser;
- standalone, candidate and operational Compose profile selection;
- lifecycle, status, health, logs, doctor and database checks;
- install/setup/configuration checks;
- backup-v4 integration;
- fail-closed update check/apply behavior;
- guarded deploy dry-run/apply behavior for disposable profiles;
- build, test and CI commands;
- stable JSON output and exit codes;
- management locking and hostile-input tests;
- maintained operator documentation.

Not performed:

- no Flask change or removal;
- no operational deploy or cutover;
- no operational data, backup, secret, Traefik, Authentik or Dream-network
  mutation;
- no public routing change;
- no commit or push;
- no Backend Freeze declaration.

## 3. Existing tooling inventory

The implementation reuses these existing boundaries:

| Existing component | Use in M5.5.4 |
| --- | --- |
| `cli/src/local-backup.ts` and `prg32-store` | Existing administrative and local backup CLI contract; no second application CLI was created. |
| `deploy/operations/backup/prg32-backup.mjs` | Existing lock, marker, archive inventory, online snapshot and independent verification wrapper. |
| `backend/src/storage-v2/backup-v4-cli.ts` | Existing encrypted backup-v4 implementation. |
| `backend/src/storage-v2/backup-v4.ts` | Existing encryption, key registry, verification and restore primitives. |
| `backend/src/storage-v2/integrity.ts` | Existing canonical object/schema/relationship audit. |
| `deploy/standalone/compose.yaml` | Default infrastructure-independent Fastify + Next runtime. |
| `deploy/candidate/compose.yaml` | Disposable two-service acceptance target. |
| `deploy/operational/compose.yaml` | Explicitly inspected and guarded; not started or deployed. |

The only new backend runtime-facing helper is a thin read-only integrity CLI
that calls `openTargetStorage` and `auditStorage`; it does not interpret the
schema independently.

## 4. Management architecture

`manage.sh` is a small POSIX-friendly shell entry point. It terminates Node
option parsing with `--` and invokes `scripts/manage.mjs`, preventing values
such as `--env-file` or leading-dash paths from being interpreted by Node.

`scripts/manage.mjs` provides:

1. fixed command/profile parsing;
2. explicit path and environment-file validation;
3. `child_process.execFile`/`spawn` only, with no `eval` or shell command
   interpolation;
4. bounded subprocess timeouts;
5. redacted diagnostics;
6. stable JSON output;
7. Compose project isolation;
8. management locks for install and deploy.

The application runtime remains container-native. Lifecycle operations invoke
Docker Compose and never require a host Node process inside the Fastify or
Next.js runtime. Host Node.js 24 is a prerequisite for the management tool's
development/CI orchestration and local backup/database commands.

## 5. Command reference

```text
./manage.sh help
./manage.sh version
./manage.sh install
./manage.sh setup
./manage.sh config check
./manage.sh start [--with-scheduler]
./manage.sh stop
./manage.sh restart
./manage.sh status
./manage.sh logs [--service backend|frontend|scheduler] [--tail N] [--follow]
./manage.sh health
./manage.sh doctor
./manage.sh db check [--root PATH]
./manage.sh backup create
./manage.sh backup list
./manage.sh backup verify --archive PATH
./manage.sh backup status
./manage.sh update check
./manage.sh update apply --dry-run
./manage.sh update apply
./manage.sh deploy --dry-run
./manage.sh deploy --apply
./manage.sh build
./manage.sh test
./manage.sh ci check
```

`--with-scheduler` is only meaningful for the standalone profile. Scheduler
selection never becomes an additional application service.

## 6. Global flags and profiles

Supported global flags are `--help`, `--json`, `--non-interactive`,
`--dry-run`, `--profile`, `--env-file`, and `--timeout`.

Profiles are a fixed allow-list:

| Profile | Compose project | Runtime services | Mutation policy |
| --- | --- | --- | --- |
| `standalone` | `prg32-standalone` | `fastify`, `next`, optional `backup-scheduler` | Safe default. |
| `candidate` | `prg32-candidate` | `fastify`, `next` | Explicit `--profile candidate` required for mutation. |
| `operational` | `prg32-operational-template` | `fastify`, `next` | Explicit selection is required and deploy apply is blocked in M5.5.4. |

No arbitrary profile value is interpolated into a command. Standalone is the
default and the operational template is never selected implicitly.

## 7. Configuration contract

The manager uses the existing Compose contract. It does not introduce a
competing configuration file format.

Standalone requires the existing values `PRG32_DATA_DIR`,
`PRG32_KEY_REGISTRY_FILE`, canonical read/write authorizations,
`PRG32_SESSION_SECRET`, `PRG32_BOOTSTRAP_TOKEN`, `PRG32_TRUST_PROXY`,
`PRG32_FRONTEND_PUBLIC_ORIGIN`, `PRG32_API_PUBLIC_ORIGIN`, and
`PRG32_WS_PUBLIC_URL`.

An env file is parsed as literal `KEY=value` assignments without expansion or
command execution. It must be a regular non-symlink file and not be
group/world-readable. Key registries are checked as protected regular files;
their contents are never read or printed by the manager.

`install` creates only explicitly configured missing data and backup
directories. It never generates, replaces or copies secret files and never
starts services automatically.

## 8. Fresh installation

The staged flow is:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
./manage.sh install --env-file /protected/prg32/standalone.env
./manage.sh config check --env-file /protected/prg32/standalone.env
./manage.sh setup --env-file /protected/prg32/standalone.env
./manage.sh start --env-file /protected/prg32/standalone.env
./manage.sh health --env-file /protected/prg32/standalone.env
```

The existing application Setup Wizard remains responsible for bootstrap and
administrator creation. The shell interface only reports the setup URL and
does not bypass its authorization checks.

Disposable evidence: a synthetic standalone env file and protected key
registry passed `install` twice. Both runs returned `installed: true`,
`started: false`, and Compose configuration accepted. No data or key registry
was replaced.

## 9. Lifecycle operations

`start`, `stop` and `restart` invoke Compose only for the selected project.
They use `up -d`, `stop` and `restart`; they do not use `down -v`, Docker
prune, volume deletion, network deletion, or global container operations.

The candidate acceptance used `deploy --apply` as the explicitly authorized
disposable lifecycle operation, then `stop`. It left unrelated containers and
Dream infrastructure untouched.

## 10. Status and health

`status` uses `docker compose ps --all --format json` and reports actual
service state, status and health. `health` distinguishes Compose container
state from application probes:

- Fastify `/health`;
- Fastify `/ready`;
- Next.js `/health`;
- Compose health state;
- optional scheduler presence/state.

The candidate successful health result was:

```json
{"ok":true,"command":"health","profile":"candidate","checks":{"containers_running":true,"containers_healthy":true,"backend_http_health":true,"backend_readiness":true,"frontend_http_health":true}}
```

Health waits only within the configured bounded timeout and returns exit code
5 when services are stopped, unhealthy or not ready.

## 11. Doctor and database checks

`doctor` performs read-only checks for Node 24, Docker/Compose, selected
profile, config presence, data path, key registry presence, Compose service
observability and optional backup destination. It classifies results as
`PASS`, `WARN`, `FAIL` or `NOT_APPLICABLE` and never prints key contents.

`db check` invokes the new `backend/src/storage-v2/integrity-cli.ts`, which
opens the explicit root read-only, runs SQLite `integrity_check`, runs
`foreign_key_check`, and calls the existing canonical storage audit. It does
not acquire a writer lease or modify the database.

The disposable database result was:

```json
{"command":"storage:integrity","ok":true,"sqlite_integrity":"ok","foreign_key_violations":0,"audit":{"ok":true}}
```

## 12. Backup integration

Management backup commands reuse `deploy/operations/backup/prg32-backup.mjs`
and `backend/dist/storage-v2/backup-v4-cli.js`. No second archive format,
encryption implementation, retention implementation or writer lock was added.

The manager requires explicit source/destination/key-registry paths and
authorization for operations that need them. `backup create` passes the
configured snapshot mode, defaults to `online`, delegates the existing backup
lock and writer-lease behavior, and requires wrapper verification before
reporting success.

`backup list` is a bounded filename/marker listing. `backup verify` delegates
to the existing independent verifier. `backup status` delegates to the
existing wrapper inventory and retention dry-run report. No retention deletion
or transfer marker mutation is exposed.

## 13. Update check

`update check` is read-only. It reports the repository package versions and
returns `NO_UPDATE_SOURCE_CONFIGURED` when no trusted update source exists.
It does not run `git pull`, fetch remote code, execute scripts from a registry,
or claim that an update is available.

Example actual result:

```json
{"ok":true,"command":"update check","status":"NO_UPDATE_SOURCE_CONFIGURED","available":false,"source":null}
```

## 14. Update dry-run

`update apply --dry-run` is non-mutating. It does not create a backup, replace
images, recreate containers, change routing, or touch persistent data. It
returns exit code 8 and status `BLOCKED` when no explicit trusted target image
is configured.

The dry-run reports the required preflight, backup, staging, apply and verify
phases without pretending that those phases were executed.

## 15. Update apply and rollback policy

`update apply` is intentionally fail-closed in M5.5.4 and returns exit code 8
with `update_apply_blocked`. Even if target image variables are supplied, the
manager does not perform an unproven database/image update.

This avoids promising automatic rollback across schema, canonical data,
publication, metrics, scores or session changes. Any later implementation
must preserve a verified encrypted backup, prove image/mount/schema
compatibility, verify readiness, and define post-write reconciliation.

## 16. Deploy dry-run/apply

`deploy --dry-run` validates Compose and reports the selected services, mount
preservation and routing invariants without starting containers.

`deploy --apply` requires the explicit disposable authorization
`PRG32_MANAGE_DEPLOY_AUTHORIZATION=I_UNDERSTAND_DISPOSABLE_DEPLOYMENT`, uses a
management lock, invokes Compose for the selected project, and waits for
health/readiness. Operational deploy is rejected with exit code 8 before any
Compose mutation.

The candidate apply completed with status `APPLIED`; both application services
were healthy and the post-apply health command returned exit code 0.

## 17. Build/test/CI integration

`build` invokes Compose build for the selected Fastify/Next images. It does
not start or replace containers. The disposable candidate build completed for
both `prg32-cartridge-store-fastify:candidate` and
`prg32-cartridge-store-next:candidate`.

`test` reuses the existing scripts in backend, frontend and CLI, followed by
the Python regression suite. Python receives only the synthetic test
`SECRET_KEY` required by the existing legacy test fixture.

`ci check` is noninteractive and runs the same checks, synthetic Compose
configuration validation for root/candidate/standalone/operational files, and
`git diff --check`. It starts no operational service and uses no production
secret.

## 18. JSON output and exit codes

JSON mode writes exactly one JSON value to stdout. Diagnostics are written to
stderr, and known secret values are redacted from subprocess diagnostics.

Stable exit codes:

| Code | Meaning |
| ---: | --- |
| 0 | Success. |
| 2 | Usage or invalid argument. |
| 3 | Missing Docker/Compose/Node dependency. |
| 4 | Invalid or incomplete configuration. |
| 5 | Service unavailable or unhealthy. |
| 6 | Authorization/permission required. |
| 7 | Backup or integrity failure. |
| 8 | Update/deploy operation blocked by safety policy. |
| 9 | Operation/subprocess failure. |
| 10 | Timeout. |

Actual failure examples:

```text
./manage.sh --json config check                 -> exit 4
./manage.sh --json update apply --dry-run       -> exit 8
./manage.sh --json --profile operational deploy --dry-run -> exit 8
./manage.sh --json --profile candidate health   -> exit 5 when stopped
```

## 19. Locking and idempotence

Install and deploy acquire an atomic per-profile management lock under
`.local/management` by default or `PRG32_MANAGE_STATE_DIR` when explicitly
configured. Lock creation uses exclusive file creation and does not delete a
lock merely because its PID appears stale. A conflicting lock fails closed.

Backup locking remains owned by the existing backup wrapper. The management
lock is not used as a replacement for the backup lock.

Repeated config/status/health/doctor/list/check/dry-run operations are
read-only. Repeated install preserves existing paths. Repeated start/stop is
delegated to idempotent Compose operations.

## 20. Security review

The shell entry point has `set -eu` and no `eval`. The Node implementation
uses fixed executable names and argument arrays. Profile, service, numeric,
path and env-file inputs are validated before use. Compose is invoked through
`execFile`, not a shell.

The tests cover invalid profiles, service-name metacharacters, unknown options,
invalid numeric tail values, missing environment files, JSON output, and
fail-closed update behavior. Symlinked key registries and unsafe permissions
are rejected.

Logs remain operator-sensitive because application logs can contain request
diagnostics. The manager does not inspect or print Compose environment values,
Docker secret contents, tokens, cookies, passwords or key material.

## 21. Disposable Docker acceptance

The acceptance was run on macOS with Docker Desktop:

- Docker Engine: `29.8.0`;
- Docker Compose: `5.5.1`;
- Node.js: 24.x selected with `nvm use 24`;
- candidate storage initialized with storage-v2 schema tuple;
- candidate Fastify and Next images built;
- candidate `deploy --apply` completed with `APPLIED`;
- `status` observed both containers running and healthy;
- `health` observed backend health/readiness and frontend health;
- bounded backend logs returned successfully;
- `db check` passed before and after stop;
- encrypted backup-v4 create, verify, list and status passed;
- deploy dry-run passed;
- candidate stop passed.

The synthetic backup was written outside the repository source tree under an
ignored disposable path. The observed archive was 580815 bytes, had a
completion and verified marker, and returned `verification_state: complete`.

No operational Compose project, operational volume or Dream network was
selected or changed.

## 22. Failure injection

Executed failure cases:

| Scenario | Result |
| --- | --- |
| Missing standalone configuration | Exit 4, structured config failures. |
| Missing env file | Exit 4, `path_unavailable`; no Compose operation. |
| Invalid profile | Exit 2 before Docker invocation. |
| Invalid service/metacharacter input | Exit 2 before Docker invocation. |
| Invalid numeric tail | Exit 2. |
| Stopped candidate health | Exit 5 with explicit container/probe failures. |
| Update dry-run without target | Exit 8, `BLOCKED`, no mutation. |
| Operational deploy dry-run | Exit 8, explicit policy block. |
| Deploy without disposable authorization | Exit 6. |

Docker-daemon-unavailable and Compose-plugin-unavailable paths are implemented
with exit code 3 but were not simulated by stopping the user's shared Docker
Desktop. Host-level interruption and image-pull failure were not injected
against operational resources.

## 23. Regression validation

The final `./manage.sh --timeout 600 test` result was:

| Suite | Result |
| --- | --- |
| Backend typecheck | PASS |
| Backend lint | PASS |
| Backend tests | 59 files, 295 passed |
| Backend build | PASS |
| Frontend typecheck | PASS |
| Frontend lint | PASS |
| Frontend tests | 22 files, 65 passed |
| Frontend build | PASS |
| CLI typecheck | PASS |
| CLI lint | PASS |
| CLI tests | 9 passed |
| CLI build | PASS |
| Python regression | 64 passed |

The final `./manage.sh --timeout 600 ci check` result was PASS for all of the
above, candidate/standalone/operational Compose configuration, root
`docker compose --profile dev config --quiet`, and `git diff --check`.

The dedicated manager test was:

```text
node --test scripts/manage.test.mjs
6 passed, 0 failed
```

`bash -n manage.sh` passed. ShellCheck was not available on this host and was
not fabricated as a result.

## 24. Documentation changes

Created exactly one new modernization report:

```text
docs/modernization/157-unified-management-cli-m5-5-4.md
```

Updated the maintained `docs/operations.md` page with the unified interface,
profile selection, installation flow, backup/update/deploy behavior and
fail-closed policy. Historical modernization reports were not rewritten.

## 25. Files changed

M5.5.4 files added or changed:

- `manage.sh` — root executable entry point;
- `scripts/manage.mjs` — management implementation;
- `scripts/manage.test.mjs` — parser, JSON, safety and fail-closed tests;
- `backend/src/storage-v2/integrity-cli.ts` — thin read-only canonical audit
  command;
- `backend/package.json` — `storage:integrity` script;
- `docs/operations.md` — maintained operator instructions;
- this report.

Previously dirty files, historical reports, ignored local fixtures and
unrelated changes were preserved.

## 26. Known limitations

1. `update apply` is deliberately unsupported/fail-closed until a trusted
   image source and compatibility/rollback contract are separately approved.
2. `deploy --apply` is intended for explicitly authorized disposable or
   standalone self-hosting use; operational profile deploy remains blocked.
3. The management tool requires host Node.js 24 for its orchestration and
   local backup/database commands. The Fastify/Next runtime itself remains
   containerized and does not use a host Node runtime.
4. Host backup commands require a built backend CLI, explicit filesystem paths,
   an external protected key registry and explicit backup authorization.
5. Linux was not used for the live Docker acceptance in this turn. The command
   path is designed for Linux Docker Engine and macOS Docker Desktop, but a
   Linux host acceptance remains an operator responsibility.
6. No browser-opening behavior was added; setup reports a URL and remains
   usable over SSH/non-graphical sessions.

## 27. Backend Freeze implications

M5.5.4 supplies management and CI foundations but does not freeze the backend.
The remaining freeze work must consolidate security, compatibility, backup and
restore, monitoring, deployment independence, operational blockers, and the
cutover/Flask-retirement prerequisites.

The existing architectural decisions remain unchanged: Fastify is the future
backend, Next.js is the frontend, SQLite is authoritative, Compose owns
runtime lifecycle, and Flask remains transitional.

## 28. Final decision

M5.5.4 disposable/self-hosted management tooling: GO.

The update apply path is GO for safety because it fails closed; it is not a
claim that automated updates are available.

Final markers:

```text
M554_MANAGEMENT_INTERFACE_GO
M554_STANDALONE_INSTALL_GO
M554_BACKUP_INTEGRATION_GO
M554_UPDATE_SAFETY_GO
M554_CI_INTERFACE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
BACKEND_FREEZE_NOT_DECLARED
```

Next authorized milestone: M5.5.5 Final Backend Freeze & Readiness. No later
milestone was started by this implementation.
