# PRG32 Cartridge Store — M5.4.4 Administrative CLI & CI Automation

Assessment date: 2026-10-15
Decision: `M544_ADMINISTRATIVE_CLI_PARTIAL`
Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`
Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive summary

M5.4.4 implemented the official `prg32-store` TypeScript/Node.js 24 CLI as a
client of the existing Fastify API and as a safe host-side wrapper around the
existing backup-v4 maintenance CLI. It does not start another backend, open a
second SQLite writer, or bypass Fastify authorization.

The implementation is usable for local development, CI integration and
isolated remote administration. CLI unit tests, the backup-v4 read-only
verification against the protected M5.4.3 archive, the full backend/frontend/
Python regressions, the Docker image build and the Docker `--version` smoke
test passed.

The milestone remains `PARTIAL`: no live remote Fastify token was used, no
remote upload/review operation was performed, and no CLI backup create or
restore was run because the M5.4.3 installation and its persistent data are
explicitly protected by this milestone. A disposable end-to-end run against a
new Fastify fixture is therefore still required before a GO decision.

## 2. Scope and safety

Implemented within scope:

- Dedicated `cli/` package with executable name `prg32-store`.
- Node.js 24 and pnpm 12.5.1 package contract.
- Bounded HTTP client with timeout, bounded JSON responses, bearer tokens and
  redirect rejection.
- Remote status, diagnostics, catalog, cartridge upload and submission/review
  commands.
- Read-only administrative user list/detail commands.
- Local backup-v4 list/create/verify/restore wrapper with explicit paths and
  explicit restore confirmation.
- Generic CI example with secret references only.
- Slim one-shot Docker client image.

Not performed:

- No M5.4.3 database, storage root, backup archive or secret registry was
  modified or overwritten.
- No Dream Traefik, Authentik, DNS, TLS, public route or operational Compose
  service was changed.
- No credentials, browser cookies, sessions or production tokens were used.
- No commit, push, deployment, cutover or Flask removal.
- No additional modernization report, JSON evidence file or CSV evidence file.

## 3. Architecture

The CLI has three boundaries:

1. `StoreClient` performs authenticated HTTP calls to Fastify.
2. Command handlers map user intent to documented Fastify routes and preserve
   server-side RBAC, audit and workflow rules.
3. The local backup adapter delegates to
   `backend/src/storage-v2/backup-v4-cli.ts`; it does not import or reimplement
   SQLite or backup-v4 storage logic.

The CLI is not registered in `backend/src/app.ts`, is not a server route, and
is not a runtime Compose service. The Docker image is an isolated one-shot
client and does not add a third application container.

## 4. CLI package structure

The package is located at:

```text
cli/
├── src/main.ts             argument parsing and process exit
├── src/commands.ts         command mapping
├── src/config.ts           precedence, URL and token-file policy
├── src/http.ts             bounded Fastify HTTP client
├── src/cartridge.ts        bounded local ZIP preflight
├── src/local-backup.ts     existing backup-v4 CLI adapter
├── src/errors.ts           stable CLI errors and exit codes
├── tests/                  unit and transport tests
├── Dockerfile              remote one-shot Node 24 image
└── README.md               maintained user documentation
```

Generated `dist/` and `node_modules/` are ignored. `cli/pnpm-lock.yaml` is the
tracked dependency lockfile.

## 5. Distribution model

The supported development distribution is:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir cli install --frozen-lockfile
pnpm --dir cli dev -- --help
```

The compiled executable is `cli/dist/main.js` and the package exposes the
`prg32-store` bin name. No npm publication or standalone binary claim was made.

The Docker distribution is a slim Node 24 image built with:

```bash
docker build -f cli/Dockerfile -t prg32-store-cli:local .
docker run --rm prg32-store-cli:local --version
```

The image is remote-operation-only. Host-side backup maintenance intentionally
uses the backend's native backup-v4 runtime so `better-sqlite3`, storage locks
and existing recovery checks are not duplicated in the client image.

## 6. Configuration

Precedence is explicit CLI option, environment variable, protected config,
then no default. Supported values include:

- `--server` then `PRG32_STORE_URL`, then protected config
  `~/.config/prg32-store/config.json`.
- `--token-env` selects the environment variable; default is
  `PRG32_STORE_TOKEN`.
- `--token-file` then `PRG32_STORE_TOKEN_FILE`, then protected config.
- `--timeout`, `--json`, `--quiet`, `--no-color`, `--yes` and `--confirm`.

Protected config and token files must be regular, non-symlink files with no
group/other permission bits. There is no Dream, university, localhost
production or database-path default. HTTP is accepted only for loopback
development; authenticated non-loopback operations require HTTPS.

## 7. Authentication

Remote authentication uses only `Authorization: Bearer <token>`. The CLI does
not login through browser forms, read cookies, create tokens, use a bootstrap
secret, or follow an authentication redirect. Token values are never included
in output or error messages.

The existing Fastify token resolver remains authoritative for identity and
permissions. A live token acceptance test was not run because no credential
was authorized for this milestone.

## 8. HTTP transport

`StoreClient` uses the Node 24 native `fetch` implementation with:

- default 10-second timeout, bounded to 100ms–120s;
- `AbortController` cancellation;
- an 8 MiB response limit;
- no automatic retries, especially for mutations;
- manual redirect rejection so bearer credentials cannot be forwarded;
- stable error codes mapped from HTTP status;
- multipart upload bounded by local file size (64 MiB) before transmission.

The server remains authoritative for archive limits, manifest validation,
ownership, staging, publication and audit.

## 9. Output and exit codes

Successful `--json` output is one JSON value on stdout. Errors are JSON on
stderr when `--json` is selected and never include raw exception strings from
the backend.

Exit codes:

| Code | Meaning |
| ---: | --- |
| 0 | success |
| 1 | general/validation failure |
| 2 | invalid usage or input |
| 3 | authentication/authorization/token failure |
| 4 | not found |
| 5 | conflict or precondition failure |
| 6 | network, timeout or rejected redirect |
| 7 | integrity failure |

The CI example is non-interactive. Restore requires `--yes` or `--confirm` and
never prompts.

## 10. Status and diagnostics

`status` performs unauthenticated GET requests to `/health` and `/ready` and
reports health separately from readiness. A non-ready response is represented
without hiding the readiness failure.

`doctor` checks `/health`, `/ready` and the public discovery document. It does
not probe private routes or integrations. `version` reports the CLI version
without contacting the server.

## 11. Catalog commands

Implemented commands:

```text
prg32-store games list [--q TEXT] [--page N] [--per_page N] [--version V] [--architecture A]
prg32-store games search --q TEXT
prg32-store games show ID
```

They map to `GET /api/games` and `GET /api/games/:game_id` and preserve the
Fastify response envelope. Filters are passed only when the existing route
supports them.

## 12. Cartridge validation/upload

`cartridges validate FILE` performs a bounded ZIP preflight: regular-file
check, archive size, entry count, duplicate central-directory names, unsafe
paths, symlink entries, manifest size/shape, supported architecture IDs and
referenced `.prg32` files. It reports a manifest SHA-256 for diagnostics.

`cartridges upload FILE` performs that preflight and then sends the bytes once
to `POST /api/publish/bundle`. Fastify remains the final parser and enforces
the existing PRG32 binary, manifest, resource-limit, ownership, staging and
review contracts. The CLI does not auto-publish or retry a failed mutation.

A live authenticated upload was not executed in this milestone, so upload
acceptance is a remaining gate rather than claimed evidence.

## 13. Submission/review commands

Implemented mappings:

```text
prg32-store submissions list [--status STATUS]  -> GET /api/submissions
prg32-store submissions show ID                -> GET /api/submissions/:id
prg32-store submissions approve ID              -> POST /api/submissions/:id/verify
prg32-store submissions reject ID               -> POST /api/submissions/:id/reject
```

Bearer-only review operations are accepted by the existing review route and
therefore retain its `submissions:read`, `submissions:review` and
`submissions:reject` permission checks and audit behavior. The CLI does not
send a browser CSRF token or attempt to turn a browser-only route into a
bearer route.

No live approval or rejection was run against a real or protected dataset.

## 14. User administration

The CLI implements only non-mutating operations already compatible with API
token authentication:

```text
prg32-store users list [--limit N] -> GET /api/admin/users
prg32-store users show ID          -> GET /api/admin/users/:userId
```

Suspend, activate, delete, role, group, password and token-revocation
mutations remain unavailable to the CLI because the existing Fastify routes
require a browser session plus CSRF for those mutations. This is intentional;
there is no bearer-token bypass or admin backdoor.

## 15. Publication management

Publication is exposed through the existing submission upload and review
workflow only. The CLI has no direct catalog publication, SQLite, filesystem
promotion or journal command. This preserves publication ownership, reviewer
RBAC, audit evidence and recovery semantics in Fastify.

## 16. Backup-v4 commands

Implemented local commands:

```text
prg32-store backup create  --source ROOT --output ARCHIVE --key-registry FILE
prg32-store backup list    --directory DIR
prg32-store backup verify  --archive ARCHIVE --key-registry FILE
prg32-store backup restore --yes --archive ARCHIVE --target ROOT --key-registry FILE
```

Create, verify and restore delegate to the existing
`backend/src/storage-v2/backup-v4-cli.ts`. The adapter passes explicit
authorization and paths, and never chooses the M5.4.3 root or a Dream path by
default. `list` scans only regular `.backup4` files in one explicit directory
and reports a completion marker without treating it as cryptographic proof.

## 17. Backup safety

The backend backup-v4 implementation remains responsible for AES-GCM
confidentiality/integrity, external key custody, writer quiescence, completion
markers, archive verification, fresh-root restore and storage locks. The CLI
does not log key material and never embeds a key in an archive.

The CLI verified the existing M5.4.3 archive read-only:

- backup ID: `9f92893a-c7f4-421e-aa43-52b1bcbedd23`;
- archive size: 582869 bytes;
- verification state: `complete`;
- archive SHA-256 matched the previously recorded value.

CLI backup create and restore were deliberately not run against the protected
M5.4.3 installation. A new disposable backup/restore acceptance is required.

## 18. Docker execution

The final `cli/Dockerfile` uses Node 24 slim, installs only the CLI production
dependency in the runtime stage, runs as the non-root `node` user and creates
no Compose service. The successful smoke command was:

```bash
docker run --rm prg32-store-cli:local --version
```

An earlier draft attempted to bundle the backend native dependency in this
image and was rejected by the local Docker daemon because its Debian apt
metadata had invalid signatures. That draft was removed; no GPG bypass was
introduced. The final image builds successfully and remains remote-only.

## 19. CI/CD integration

`cli/ci.example.yml` documents a provider-neutral sequence:

1. select Node 24 and install the frozen lockfile;
2. run CLI checks;
3. run `doctor` with `PRG32_STORE_URL` and a CI secret environment variable;
4. validate and upload a release archive;
5. keep JSON on stdout and token values in the CI secret store.

No provider-specific workflow, repository secret, npm publication or
production deployment was added.

## 20. API contract mapping

| CLI operation | HTTP contract | Auth/RBAC | Mutation |
| --- | --- | --- | --- |
| status | `GET /health`, `GET /ready` | public | no |
| doctor | health/readiness/discovery GETs | public | no |
| games list/show/search | `GET /api/games[/:id]` | public | no |
| cartridge upload | `POST /api/publish/bundle` | `catalog:submit`, owner | yes; no retry |
| submissions list/show | `GET /api/submissions[/:id]` | reviewer/owner | no |
| approve/reject | `POST /api/submissions/:id/{verify,reject}` | reviewer permissions | yes; no retry |
| users list/show | `GET /api/admin/users[/:id]` | admin/users:read | no |
| backup create/verify/restore | existing local backup-v4 CLI | explicit local authorization/lock | local maintenance |

Unsupported administrative mutations are not simulated by generic HTTP
requests. The CLI does not expose direct SQL or a generic admin-execute
command.

## 21. Security validation

Covered by implementation and tests:

- token-file regular-file, symlink and permission checks;
- HTTPS enforcement outside loopback;
- no credential forwarding on redirects;
- bounded response and archive input sizes;
- duplicate/unsafe ZIP member checks;
- no shell interpolation for the backup child process;
- no mutation retries;
- explicit restore confirmation;
- stable public CLI errors without raw exception leakage;
- no token or secret output.

The Fastify test suite remains the authority for CSRF, RBAC, audit,
publication, backup integrity, path traversal and storage-lock behavior.

## 22. Unit tests

CLI-specific result:

```text
pnpm --dir cli run check
3 test files passed
7 tests passed
typecheck passed
lint passed
build passed
```

The tests cover cartridge acceptance/rejection, unsafe archive paths, missing
binary references, bearer transport, authorization error mapping, HTTPS
policy and safe backup directory listing.

## 23. Disposable E2E acceptance

A live remote Fastify E2E was not executed. The current M5.4.3 containers and
data are protected, and no new disposable server/token fixture was authorized
or created in this run. The transport tests use an isolated local HTTP server,
not a fake response inside `StoreClient`, and prove header, bounded parsing,
status mapping and transport policy.

Required follow-up evidence before GO:

- fresh disposable Fastify app and synthetic user/API token;
- `games list/show` through actual HTTP;
- upload through actual `POST /api/publish/bundle`;
- unauthorized mutation rejection;
- reviewer approve/reject with audit evidence;
- CLI JSON and exit-code assertions;
- backup create, verify and fresh-root restore through the CLI adapter.

## 24. Regression results

Executed with Node.js 24 selected through `nvm use 24`:

| Check | Result |
| --- | --- |
| CLI typecheck/lint/unit/build | PASS; 7 tests |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS; 55 files, 276 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS; 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| Python pytest | PASS; 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |
| CLI Docker build | PASS; `prg32-store-cli:local` |
| CLI Docker `--version` | PASS; `0.1.0` |
| CLI backup-v4 verify | PASS; protected M5.4.3 archive, read-only |

The Next.js build regenerated `frontend/next-env.d.ts`; it was restored to its
pre-checkout content and is not part of this milestone.

## 25. Files changed

New implementation and documentation files:

- `cli/package.json`
- `cli/pnpm-lock.yaml`
- `cli/pnpm-workspace.yaml`
- `cli/tsconfig.json`
- `cli/tsconfig.eslint.json`
- `cli/eslint.config.mjs`
- `cli/vitest.config.mjs`
- `cli/src/*.ts`
- `cli/tests/*.test.ts`
- `cli/Dockerfile`
- `cli/README.md`
- `cli/ci.example.yml`
- `cli/.gitignore`
- this report

No tracked backend, frontend, Docker Compose, Flask or operational data file
was changed by M5.4.4.

## 26. Remaining blockers

No P0/P1 implementation defect was observed in the executed checks. The
following acceptance blockers remain:

- No live disposable Fastify API/token/upload/review E2E.
- No CLI-driven disposable backup create/restore evidence.
- No operator decision on which API token permissions are allowed for CI.
- User/catalog mutation commands remain unavailable because existing routes
  require browser session plus CSRF.
- Local cartridge validation is intentionally a bounded preflight; Fastify is
  the authoritative full PRG32 validator.

These are acceptance gaps, not permission to bypass existing security
boundaries.

## 27. Final decisions

```text
M544_ADMINISTRATIVE_CLI_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

M5.4.4 cannot be marked GO under its own criteria because live remote API
transport, upload, RBAC workflow and disposable CLI backup/restore evidence
were not executed.

## 28. Recommended next phase

Authorize one narrowly scoped disposable CLI acceptance phase. It should
create a fresh Fastify root, synthetic admin/reviewer/token fixtures and a
synthetic cartridge, run the remote command matrix, create and restore a
backup-v4 archive through `prg32-store`, and preserve machine-readable results
inside that phase's single report. It must not touch M5.4.3, Dream
infrastructure, public routing or Flask ownership.

Operational cutover and Flask retirement remain separately unauthorized.
