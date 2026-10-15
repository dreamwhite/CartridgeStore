# PRG32 Cartridge Store — M5.4.4a Disposable CLI End-to-End Acceptance

Assessment date: 2026-10-15
Decision: `M544_ADMINISTRATIVE_CLI_PARTIAL`
Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`
Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive summary

The administrative CLI was exercised as a compiled Node.js 24 process against
an actual Fastify server using a fresh canonical storage-v2 fixture. The live
HTTP workflow passed for public catalog reads, cartridge validation and upload,
review approval/rejection, administrative user listing/detail, authentication
failures, stable JSON output, backup safety, encrypted backup verification and
fresh-root restore.

The milestone remains `PARTIAL`, not GO, because the Docker image could be
started and reported its version, but the Docker Desktop `--network host`
container could not reach the host loopback Fastify process. The CLI correctly
returned network exit code `6`; no workaround bypassing the local network
boundary was introduced.

No operational data, M5.4.3 installation, Dream Traefik, Authentik, DNS, TLS,
Compose services or public routes were changed. No commit, push or staging was
performed.

## 2. Scope and safety

The acceptance used only synthetic identities, synthetic PRG32 bundles, a new
canonical SQLite root and a synthetic encryption-key registry. The exact
disposable root was `.local/cli-m544a/`; it was checked for absence, regular
filesystem status, Git ignore coverage and free space before creation, then
removed after the run.

The protected `.local/operational-m543/` root was not opened, reused, changed
or mounted. The M5.4.3 containers and persistent volumes were not started,
stopped, restarted or removed.

## 3. Baseline

The test environment used:

```text
Node.js 24 selected with: source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm 12.5.1
Fastify canonical workflow in disposable mode
SQLite storage-v2 schema and object store
```

The CLI was rebuilt before the process-boundary run. The production Docker
image was also rebuilt from `cli/Dockerfile`.

## 4. Disposable environment

The integration test created:

```text
.local/cli-m544a/
├── data/canonical/
├── secrets/
├── backups/
├── restores/
├── fixtures/
└── runtime/
```

The canonical root was initialized with `initializeDisposableStorage`. A
separate disposable shadow database was created because the backend safety
contract forbids using the repository root or the canonical database as the
shadow database. The application process temporarily used the disposable
runtime directory as its current directory while constructing Fastify; the
CLI child process continued to run from the repository root.

mDNS, federation, SMTP and WebAuthn were disabled. The Fastify server listened
only on an ephemeral `127.0.0.1` port.

## 5. Canonical bootstrap

The fixture used the existing canonical workflow and storage-v2 schema. The
Fastify server held the canonical writer lease while the CLI was exercised.
Publishing was enabled through the supported disposable administrative settings
route. No direct SQLite token or user inserts were used.

After restore, the test opened the new root read-only and ran the existing
`auditStorage` integrity audit. Counts and `submission_id/status` relationships
for submissions, publication operations, review decisions and storage metadata
matched the source disposable target.

## 6. Identities and tokens

The fixture created these synthetic identities through the supported bootstrap,
login, user administration, group assignment and token APIs:

| Identity | Use | Evidence |
| --- | --- | --- |
| `cli-admin` | bootstrap, settings, user administration, admin token | created through `/auth/bootstrap` and `/auth/tokens` |
| `cli-reviewer` | submission list/show/approve/reject | created through admin API and assigned `editors` through the admin API |
| `cli-ordinary` | cartridge upload | created through admin API with ordinary user permissions |

Plaintext token values remained in test process memory and a mode-0600
disposable runtime file only. They were not printed, committed or included in
this report.

## 7. Actual CLI executable

All acceptance operations crossed a real child-process boundary using the
compiled entrypoint:

```text
cli/dist/main.js
```

The command was invoked with Node.js 24, not through an in-process mock or a
direct Fastify handler call. The CLI used native `fetch`, bearer authentication,
bounded JSON responses, manual redirect rejection and explicit loopback HTTP
handling.

## 8. Catalog

The following commands passed against the live Fastify HTTP server:

```text
prg32-store status --json
prg32-store doctor --json
prg32-store games list --json
prg32-store games search --q cli --json
```

The catalog was empty before publication. After approval, `games show` and
search returned the newly published synthetic cartridge. The missing-game
probe returned the existing Fastify `invalid_request`/400 contract and was
mapped to CLI exit code 1. The backend response was not changed to manufacture
a 404 semantics that it does not currently expose.

## 9. Cartridge validation

The test generated a valid ZIP bundle containing `manifest.json`, `icon.png`
and a valid PRG2-compatible QEMU cartridge. The real local validator passed
the bundle and verified:

- archive and entry bounds;
- duplicate central-directory names;
- safe paths and non-symlink entries;
- manifest size and object shape;
- supported `qemu` architecture;
- referenced binary presence;
- manifest SHA-256 reporting.

The missing-file validation command returned usage/input exit code `2`.

## 10. Authenticated upload

The ordinary synthetic user uploaded the bundle through:

```text
POST /api/publish/bundle
```

The CLI received a pending submission identifier. The CLI did not auto-publish,
retry the mutation or bypass the server-side archive and ownership checks.

## 11. Review and publication

The reviewer token successfully executed:

```text
submissions list
submissions show <id>
submissions approve <id> --metadata '{"title":"CLI Approved Cartridge"}'
submissions reject <id> --note "synthetic rejection"
```

The approved submission became visible through the canonical catalog. A second
synthetic submission was rejected and did not become public. Existing reviewer
permissions and canonical publication journaling remained authoritative.

## 12. User administration

The admin token successfully executed `users list` and `users show`. The test
also confirmed that no-token and invalid-token user-list requests returned exit
code `3` without leaking a token value.

The CLI remains read-only for user administration. Browser-session-plus-CSRF
mutations such as role, group, password, status and deletion were not exposed
as bearer-token shortcuts.

## 13. JSON output and exit codes

Successful `--json` commands produced one JSON value on stdout and no stderr
output. The exercised negative categories were:

| Scenario | Result |
| --- | ---: |
| missing cartridge input | exit `2` |
| missing/invalid user authorization | exit `3` |
| missing catalog item using existing backend contract | exit `1` |
| active canonical writer during backup | exit `5` |
| non-empty restore target | exit `5` |
| restore without `--yes`/`--confirm` | exit `2` |
| wrong encryption key | exit `7` |
| corrupt/truncated backup | exit `7` |
| Docker-to-host network failure | exit `6` |

The M5.4.4a fix to `cli/src/local-backup.ts` parses structured backup errors
from stderr and preserves integrity, key, conflict and authorization exit
categories instead of collapsing them to a generic exit `1`.

## 14. Transport

The disposable server was loopback-only HTTP. This is permitted by the CLI
development transport policy. The test confirmed that remote authenticated HTTP
is still rejected by the CLI policy; non-loopback authenticated operations
require HTTPS. No redirects, cookies or public authentication sessions were
used by the CLI.

## 15. Backup create

While the Fastify canonical writer lease was held, `backup create` failed
closed with conflict exit `5`; no completion marker was created.

After Fastify was closed and the writer was quiesced, the CLI delegated to the
existing encrypted backup-v4 implementation and successfully created a fresh
backup outside the canonical source root. The backup used the synthetic
mode-0600 key registry and the explicit disposable authorization required by
the backend.

## 16. Backup list

`backup list --directory <disposable-backups>` passed and reported the completed
archive only when its `.complete.json` marker existed. The active-writer failed
attempt did not appear as a completed backup.

## 17. Backup verify

Independent CLI verification passed for the completed archive. The following
negative cases were also executed against copies only:

- wrong key registry;
- corrupted ciphertext/archive bytes;
- truncated archive.

Each failed with integrity exit `7`. The source canonical root was not modified
by verification.

## 18. Fresh-root restore

Restore without explicit confirmation returned exit `2`. Restore with `--yes`
created a new empty root, verified the encrypted archive, restored the
canonical SQLite snapshot and immutable objects, and passed the canonical
storage audit and SQLite relationship comparisons.

Restoring into a non-empty root returned conflict exit `5` and preserved the
sentinel file. No existing target was merged or overwritten.

## 19. Writer safety

The test demonstrated the intended single-writer boundary:

1. Fastify acquired the canonical writer lease.
2. Backup creation was refused while that lease was active.
3. Fastify was closed explicitly.
4. Backup creation succeeded only after quiescence.

No simultaneous writer state was accepted, and no operational writer was
involved.

## 20. Docker CLI

The multi-stage `cli/Dockerfile` was rebuilt successfully as
`prg32-store-cli:local`. The final image is Node 24 slim, runs as the `node`
user and contains the remote-only CLI; it does not bundle Python, SQLite or a
second backend service.

This passed:

```text
docker run --rm prg32-store-cli:local --version
```

The image returned `0.1.0`. The live remote command using Docker
`--network host` returned network exit `6` because Docker Desktop did not expose
the host loopback Fastify listener to the container. This is `NOT_VERIFIED`,
not a successful remote Docker acceptance. No insecure host-network workaround
or production network change was introduced.

## 21. CI

The disposable test exercised non-interactive environment-based URL/token
execution with JSON capture and no TTY. The existing `cli/ci.example.yml`
continues to reference tokens through environment variables only. No real CI
provider was contacted and no secret was stored.

## 22. Automated integration tests

Created:

```text
cli/tests/integration/cli-fastify.test.ts
```

It uses the actual Fastify app, actual canonical SQLite/object storage,
synthetic API identities, actual compiled CLI child processes, encrypted
backup-v4 commands and a fresh restore root. The final CLI suite passed:

```text
Test Files: 4 passed
Tests:      8 passed
```

The Docker reachability limitation is intentionally represented as a
non-GO observation inside the integration scenario rather than hidden or
converted into a false pass.

## 23. Defects corrected

The following narrowly scoped defects were corrected:

1. `cli/src/local-backup.ts` now reads structured backup errors from both
   stdout and stderr and maps integrity, key, conflict and authorization
   categories to stable exit codes.
2. The new integration fixture uses a separate disposable shadow database and
   temporarily changes only the test process working directory, satisfying the
   backend disposable-root safety checks without weakening them.

No Flask behavior, database schema, authentication behavior or operational
Docker configuration was changed.

## 24. Regression results

Executed with Node.js 24 selected through `nvm use 24`:

| Check | Result |
| --- | --- |
| `pnpm --dir cli run check` | PASS — 4 files, 8 tests |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 55 files, 276 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `docker build -f cli/Dockerfile -t prg32-store-cli:local .` | PASS |
| `docker run --rm prg32-store-cli:local --version` | PASS |
| `git diff --check` | PASS |

The frontend build regenerated `frontend/next-env.d.ts`; it was restored to
the pre-existing tracked content after verification. The disposable root was
removed after the test.

## 25. Files changed

New or changed for M5.4.4a:

```text
cli/src/local-backup.ts
cli/tests/integration/cli-fastify.test.ts
docs/modernization/131-disposable-cli-acceptance-m5-4-4a.md
```

The pre-existing M5.4.4 CLI package and prior untracked modernization
artifacts were preserved. No unrelated files were cleaned, reset or staged.

## 26. Blockers

The blocking acceptance issue is Docker-to-host reachability for the disposable
Fastify server on this Docker Desktop environment. The image itself builds and
runs, but the required remote operation cannot be claimed without a reachable
isolated endpoint.

Additional operational blockers remain unchanged:

- no operational cutover authorization;
- no real deployment rehearsal through Dream Traefik;
- no production Authentik session or provider change;
- no real data migration or writer handover;
- Flask remains authoritative for the protected installation;
- no decision to retire the legacy route owner.

## 27. Decisions

The decision is:

```text
M544_ADMINISTRATIVE_CLI_PARTIAL
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

The live Fastify/CLI and backup/restore evidence is accepted as disposable
evidence. Docker remote reachability remains open. No backend behavior was
weakened to make the Docker criterion pass.

## 28. Next phase

The next authorized work should first provide a disposable network arrangement
where the Docker CLI can reach a non-operational Fastify endpoint without
relaxing the CLI HTTPS/loopback policy. Then repeat only the Docker remote
acceptance and update the milestone decision.

After that, a separate authorization is required for any operational handover,
real data migration, public routing change, Flask retirement or Compose
cleanup. M5.4.4a does not authorize those actions.
