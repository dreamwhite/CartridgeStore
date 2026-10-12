# M4.5 — Trusted Write Boundary and Publishing Readiness

**Date:** 2026-10-12
**Status:** implemented and verified for disposable development/testing; M5
not started and not approved

## 1. Executive summary

M4.5 establishes an explicit disposable writer environment for the isolated
Fastify/TypeScript authentication foundation. The normal `backend` profile is
unchanged: read-only fixture data, loopback-only access, no Traefik labels,
and auth writes disabled by default.

The new `writer-init` and `writer` profiles use separate named volumes for:

- a writable auth SQLite database and its sidecars;
- a read-only synthetic shadow SQLite database;
- a disposable cartridge filesystem.

The writer container has a read-only root filesystem, dropped capabilities,
`no-new-privileges`, no Docker socket, no host-root bind mount, no operational
mount, and no public hostname. It is started only after an explicit init
command.

Authentication hardening also now requires 32-character session and bootstrap
secrets and compares CSRF/bootstrap values with `crypto.timingSafeEqual`.

M5 remains rejected. Publishing and review endpoints were not implemented.

## 2. Threat model and trust assumptions

| Threat | In scope? | Boundary/decision |
| --- | --- | --- |
| Accidental operator path or environment misconfiguration | Yes | Fail-closed config, disposable-root containment, URI rejection, regular-file checks, and device/inode comparison. |
| Malicious HTTP request | Yes | Requests cannot select database paths; auth and CSRF controls remain active. The writer exposes only the existing isolated auth routes. |
| Compromised Fastify process | Partially | Container filesystem and mount separation limit access to disposable resources. A compromised process can still modify its writer volumes. |
| Untrusted process able to access the disposable directory/volume | No complete protection | The driver is path-based and cannot provide an atomic `O_NOFOLLOW` descriptor guarantee. Such access violates the trusted-boundary assumption. |
| Privileged host administrator or Docker daemon operator | No | They can replace mounts, inspect/modify volumes, or alter Compose. No protection is claimed. |
| Docker configuration changes | Partially | The committed writer profile is constrained and does not mount operational storage; an operator who changes it is outside the application guarantee. |
| Host filesystem symlink/hardlink aliasing | Yes | M4.4 validation rejects symlink indirection and compares device/inode identity. |
| Container mount aliasing | Partially | The profile uses distinct named volumes and a read-only shadow mount. Docker/host mount provenance remains a deployment trust assumption. |

The trusted writer assumption is therefore: the container image and Compose
definition are controlled, only the explicitly managed init/writer processes
can modify their three disposable volumes, and no untrusted process shares
those volumes. This is a development/testing boundary, not a hostile-host
security boundary.

## 3. Dedicated disposable writer design

The single `docker-compose.yml` now contains two explicit profiles:

1. `writer-init` — a one-shot setup container running as the runtime UID that
   creates only synthetic auth/shadow databases and the disposable store
   directory;
2. `writer` — the Fastify service using those pre-existing resources.

The required workflow is:

```bash
docker compose --profile writer-init run --rm auth-writer-init
docker compose --profile writer up --build auth-writer
```

The main writer does not initialize missing databases. The init step is
explicit and separate from normal startup. Volume names can be isolated for a
smoke run with `PRG32_WRITER_VOLUME_PREFIX`.

The writer uses:

```text
127.0.0.1:5091 -> container:5090
/writer-data/auth.sqlite       writable auth DB and disposable root
/writer-shadow/shadow.sqlite   read-only synthetic shadow DB
/writer-store                  writable disposable cartridge root
```

It has no Traefik labels, no `dream_edge` network, no public hostname, and no
operational `/data` or cartridge mount. The normal `backend` service and its
read-only `/fixtures` mount were not behaviorally changed.

## 4. Filesystem and container boundary

The writer root `/writer-data` is an explicit disposable root satisfying the
M4.4 application checks. The init script runs as the runtime UID, creates
directories with disposable permissions, and creates only the synthetic auth
schema. The application still refuses missing roots/files and never falls back
to `PRG32_BACKEND_DB` as a writer.

Container restrictions in the writer profile:

- runtime user `1000:1000` (`node`);
- `read_only: true` root filesystem;
- a 64 MiB `/tmp` tmpfs for runtime temporary files;
- `cap_drop: [ALL]`;
- `security_opt: no-new-privileges:true`;
- no privileged mode;
- no Docker socket;
- no broad host bind mount;
- only three named volumes, with the shadow volume mounted `:ro`;
- loopback-only host port publishing.

SQLite WAL/SHM/journal sidecars remain in `/writer-data` and are covered by
M4.4 sidecar validation. The writable root must therefore remain writable to
the runtime UID, while the shadow database volume is never writable by the
writer.

This design does not claim that Docker named volumes are inaccessible to a
host administrator or another process with Docker volume access.

## 5. Operational database exclusion

The following protections are independent and are not conflated:

| Mechanism | Evidence | What it proves |
| --- | --- | --- |
| Application validation | 16 write-isolation tests, including path aliases, symlink, hardlink, URI, root escape, missing schema, sidecars, and valid disposable DB | Unsafe configured targets are rejected before service use. |
| Filesystem permissions | Writer smoke test: shadow mount reports `RW=false`; writer root is separate named volume | The runtime writer cannot write through the configured shadow mount under the tested container configuration. |
| Container isolation | `docker inspect` reports read-only rootfs, `CapDrop=[ALL]`, `no-new-privileges`, three separate volumes, and no operational bind mount | The tested Compose service does not receive operational writable storage. |

The smoke test used only the synthetic writer volumes. It did not mount or
open the Flask operational database. The image build alone is not treated as
filesystem isolation evidence.

An unexpected operational bind mount was not introduced into the committed
Compose definition; smoke inspection found only the three declared named
volumes. This is configuration evidence, not protection against a privileged
operator adding a different mount.

The profile cannot be made operationally writable by environment variables
alone: its writer files must already exist, the shadow volume is read-only,
and the service has no operational mount. A changed Compose file or Docker
daemon policy can defeat that boundary and is outside this claim.

## 6. TOCTOU reassessment

M4.4 validates the writer and operational identities before opening the path
and repeats the checks after `better-sqlite3` opens it. This catches a
deterministic replacement with a symlink, hardlink, or different regular file
between those checks.

The current driver integration still opens by path. It cannot accept an already
validated file descriptor with an atomic no-follow/openat guarantee. A process
that can modify `/writer-data` concurrently, or a host administrator that can
replace the volume/mount, remains outside the trust model. The trusted Compose
boundary makes that threat acceptable for disposable local development/testing
because no unrelated process is expected to share the volumes; it does not
mathematically eliminate TOCTOU.

The application process can modify its own disposable auth database and
cartridge root by design. HTTP requests cannot influence any database path or
mount. Paths are validated at writer startup and on each writer open; runtime
database replacement after the final validation is not fully preventable with
the current driver.

## 7. Authentication hardening

Implemented without new infrastructure:

- auth write session secrets require at least 32 characters;
- configured bootstrap tokens, when present, require at least 32 characters;
- CSRF comparison uses length checking plus `crypto.timingSafeEqual`;
- bootstrap header comparison uses the same constant-time helper;
- existing auth response shapes, session rotation, bearer behavior, and CSRF
  rules remain unchanged.

The session store and rate limiter remain process-local. A distributed session
store and distributed rate limiter are public-cutover prerequisites unless the
deployment explicitly adopts a single-instance policy with trusted edge rate
limiting.

## 8. Publishing authorization readiness matrix

No publishing or review endpoint was added. The matrix below is extracted from
the current Flask implementation and is the acceptance baseline for M5.

| Operation | Existing Flask route | Principal/role/group | Ownership | DB effects | Filesystem effects | Response/tests |
| --- | --- | --- | --- | --- | --- | --- |
| Cartridge submission/upload | `POST /publish`, `POST /api/publish`, `POST /api/publish/bundle` | Authenticated user (`login_required`); bearer token accepted by Flask auth | `submitted_by_user_id` and `submitted_by` are recorded from current principal | Inserts `cartridge_submissions`, then updates pending metadata | Creates `DATA_DIR/pending/<submission_id>` and one `.prg32` per architecture | HTML redirect for form; JSON pending payload for API; `tests/test_services.py`, `tests/test_api_contracts.py`, `tests/test_security_m1_2a.py` |
| Submission listing | `GET /editor/submissions`, `GET /api/submissions` | `editors` group via `editor_required` | No submitter self-list route | Read-only query | Reads pending metadata | HTML or JSON; review tests in `tests/test_services.py` |
| Submission detail | `GET /editor/submissions/<id>`, `GET /api/submissions/<id>` | `editors` group | No owner-specific access | Read-only query | Reads metadata only | 404 when absent; review tests |
| Review metadata edit | POST verify routes | `editors` group | No ownership restriction; reviewer may edit only approved metadata fields | Updates metadata/status on approval | Rebuilds cartridge images before publication | Redirect or JSON; metadata immutability tests |
| Review approval | `/editor/submissions/<id>/verify`, `/api/submissions/<id>/verify` | `editors` group | No owner restriction | Marks submission `verified`, reviewer ID/name/time | Publishes versions and removes pending directory; compensating file/index rollback on publish failure | Redirect or `{ok,submission}`; review tests |
| Review rejection | `/editor/submissions/<id>/reject`, `/api/submissions/<id>/reject` | `editors` group | No owner restriction | Marks `rejected`, reviewer ID/name/time | Removes pending directory | Redirect or JSON; review tests |
| Publication/version management | `GameStore.publish` through approval and legacy publish paths | Submission path requires login; review path requires `editors` | Version is from submitted metadata and immutable during review | Stores submission/status; catalog index is filesystem-backed | Writes `<game>/<version>/<architecture>.prg32` and `index.json` | Store and review tests |
| Metadata modification | `POST /admin/cartridges/<game>/<version>` | Authenticated admin or `editors` group | No ownership check | None directly | Rewrites catalog `index.json` metadata | Redirect; `tests/test_services.py` |
| Cartridge deletion | `DELETE/POST /admin/cartridges/<game>/<version>/delete` | Authenticated admin or `editors` group | No ownership check | None directly | Deletes one architecture or full version and rewrites `index.json` | JSON for DELETE, redirect for form; service tests |

Unclear/inconsistent behavior requiring explicit M5 treatment:

1. Review uses `editor_required`, which checks the `editors` group only. An
   administrator without that group cannot review, while cartridge admin
   routes allow admin role or editors group. Bootstrap adds the group to the
   first admin, but existing/admin-created accounts may differ.
2. Submitters have ownership recorded but no owner-specific submission listing
   or detail route; editor access is the only review visibility control.
3. Publication has filesystem/index side effects but no unified database
   operation record; M5 must preserve the current behavior while adding the
   planned reconciliation/kill-point evidence.

These are documented compatibility decisions, not changed in M4.5.

## 9. Legacy authentication compatibility decisions

| Item | Classification | M4.5 decision |
| --- | --- | --- |
| `PRG32_USERS` configured-user fallback | Required for existing firmware/tool/multiplayer clients that still use configured tokens; not needed for DB-backed browser auth | Keep operational in Flask. Do not implement in isolated TypeScript auth until a product/firmware migration decision exists. |
| `/auth/tokens/<id>/update` and `/revoke` form aliases | Required for existing Flask HTML frontend compatibility; not a firmware contract | Keep Flask aliases. Add TypeScript aliases only if browser cutover requires them. |
| HTML login/register pages and redirects | Required for the existing Flask frontend; not required by the API-only TypeScript foundation | Keep Flask HTML behavior. Next.js must replace browser UX before TypeScript ownership. |
| Process-local sessions | Public security/cutover prerequisite; not a firmware bearer-token requirement | No distributed store in M4.5. Require single-instance policy or shared-store design before public session cutover. |
| Process-local rate limiting | Public security prerequisite | No distributed limiter in M4.5. Require trusted edge/shared limiter or explicit single-instance policy before public exposure. |

No deprecated Flask behavior was removed.

## 10. Verification evidence

Executed with Node 24 via `nvm use 24` and pnpm:

| Command/check | Result |
| --- | --- |
| Backend `pnpm run typecheck` | PASS |
| Backend `pnpm run lint` | PASS |
| Backend `pnpm run test` | PASS — 7 files, 42 tests |
| Backend `pnpm run build` | PASS |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 63 tests |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| Frontend typecheck | PASS |
| Frontend lint | PASS |
| Frontend tests | PASS — 2 files, 5 tests |
| Frontend production build | PASS |
| `docker compose --profile dev config` | PASS |
| `docker compose --profile backend config` | PASS |
| `docker compose --profile writer-init --profile writer config` | PASS |
| `SECRET_KEY=compose-prod-check docker compose --profile prod config` | PASS |
| Docker backend/writer multistage build | PASS |
| `git diff --check` | PASS |
| Disposable writer init + runtime smoke | PASS |

The runtime smoke used a temporary volume prefix and verified:

- `/health` returned 200;
- `/auth/csrf` returned a token;
- bootstrap returned 201 and created a synthetic admin;
- `ReadonlyRootfs=true`;
- `CapDrop=[ALL]`;
- `no-new-privileges:true`;
- shadow mount `RW=false`;
- auth and cartridge mounts were separate writable named volumes;
- no operational bind mount was present.

The temporary smoke containers, network, and volumes were removed with
`docker compose ... down -v` after verification. An initial init attempt
exposed an incompatible `chown` under `cap_drop: ALL`; the init was corrected
to use explicit disposable permissions without adding runtime capabilities,
then the clean smoke run passed.

The frontend test run retains the existing non-failing Vite config-loader
warning. No production database or cartridge filesystem was mounted.

## 11. Files changed

- `backend/src/config/env.ts` — minimum secret-strength validation;
- `backend/src/auth/routes.ts` — constant-time CSRF/bootstrap comparisons;
- `backend/src/disposable-fixture.ts` — explicit synthetic writer environment
  provisioning;
- `backend/Dockerfile` — runtime-owned disposable mount points in the
  multistage image;
- `backend/tests/auth.test.ts` — secret and comparison regression coverage;
- `docker-compose.yml` — explicit `writer-init` and `writer` profiles with
  isolated volumes and container restrictions;
- `backend/README.md` and `docs/docker.md` — writer profile workflow and trust
  boundary;
- `docs/modernization/19-revised-migration-roadmap.md` — M4.5 status and M5
  dependency;
- `docs/modernization/27-m4-5-trusted-write-boundary-report.md` — this report.

No Flask source, production routing, schema, production data, or frontend UI
was changed.

## 12. Remaining security risks

1. A privileged host administrator or Docker daemon operator can alter mounts,
   inspect volumes, or replace files.
2. A process that can access the writer volume can still exploit the residual
   path-based TOCTOU limitation.
3. Sessions and rate limiting are process-local.
4. The TypeScript backend does not yet implement business-route authorization
   or publishing/review parity.
5. The publishing workflow has filesystem/index side effects without a single
   operation record; M5 must address reconciliation and kill points.
6. Flask remains the public backend and sole operational writer.

## 13. M5 entry decision

**Rejected for now.** M4.5 establishes the trusted disposable development
boundary and publishing authorization baseline, but it does not authorize M5.
M5 entry requires all of the following:

- a reviewed deployment boundary preserving the writer-volume assumptions;
- explicit acceptance of the residual driver TOCTOU limitation;
- a decision on single-instance versus shared sessions and rate limiting;
- route-level TypeScript authorization tests matching the matrix above;
- publication reconciliation, backup, kill-point, and rollback evidence;
- a controlled one-writer cutover plan that keeps Flask authoritative until
  acceptance is complete.

## 14. Public-cutover prerequisites

Before any public Fastify auth or publishing route is enabled:

1. Use only a controlled deployment profile with no operational writable mount
   exposed to the TypeScript writer.
2. Keep the disposable writer profile local-only and never attach it to
   Traefik or the public edge network.
3. Use high-entropy secrets of at least 32 characters and rotate them outside
   source control.
4. Adopt a shared session/rate-limit design or formally enforce a single
   instance behind a trusted edge limiter.
5. Complete browser cookie/CSRF/forwarded-scheme tests through the intended
   edge.
6. Resolve the editor/admin group inconsistency and owner-visibility decisions
   without inventing permissions.
7. Complete M5 write reconciliation and rollback evidence before granting any
   operational filesystem or SQLite write authority.
