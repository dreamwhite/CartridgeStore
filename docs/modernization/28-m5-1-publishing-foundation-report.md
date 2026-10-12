# M5.1 Publishing Foundation and Submission Lifecycle

Date: 2026-10-12
Status: implemented for isolated disposable resources only
Operational Flask writer: unchanged and authoritative

## 1. Scope and decision

M5.1 implements the first TypeScript publishing boundary without enabling an
operational or public write cutover. Fastify accepts authenticated submissions,
validates them, stores a pending row in the existing SQLite schema, and stages
pending cartridge files below the disposable writer root.

It does not implement review, approval, publication into the catalog, version
management, deletion, reconciliation, or a frontend. Flask remains the only
operational writer. No Flask source, firmware ABI, SQLite schema migration,
production route, or production data was changed.

## 2. Implemented routes

The TypeScript writer registers:

| Route | Authentication | Accepted request | Success behavior |
| --- | --- | --- | --- |
| `POST /publish` | Flask-equivalent authenticated session or bearer token; session requests require CSRF | `multipart/form-data` with `bundle` ZIP and optional `csrf_token` | `302 Location: /publish` |
| `POST /api/publish` | Same | Same | Flask JSON response plus `legacy_endpoint: true` |
| `POST /api/publish/bundle` | Same | Same | Flask-compatible pending JSON response |

Only bundle uploads are supported. The legacy per-field cartridge/icon form is
not silently reintroduced: Flask's current `publish_request` rejects it when
used on these API paths.

Stable JSON errors use the existing `ok: false` convention. Authentication,
CSRF, ZIP, binary, and storage failures do not expose exception text or paths.
The transitional TypeScript `/publish` error response is JSON because no
TypeScript HTML publishing UI is in scope; its successful redirect is retained.

## 3. Flask/Fastify compatibility matrix

| Concern | Flask behavior | Fastify M5.1 behavior | Decision |
| --- | --- | --- | --- |
| Authentication | `login_required`; session or bearer-compatible principal | Same principal lookup; bearer requests bypass browser CSRF, session requests require CSRF | Preserved |
| Multipart field | Required `bundle` upload | Required `bundle` file part | Preserved |
| Form field | `csrf_token` for browser sessions | `csrf_token` field or `X-CSRFToken`/`X-CSRF-Token` header | Preserved and compatible with existing auth foundation |
| Archive | ZIP, bounded by Flask M1.2a limits | ZIP, bounded before decompression and checked again after decompression | Preserved limits |
| Manifest | `manifest.json`, metadata ABI, assets, architectures | Same required fields and identifiers | Preserved |
| Binary variants | `.prg32` files named by manifest architecture entries | Same architecture aliases and required files | Preserved |
| Ownership | `submitted_by_user_id` and `submitted_by` from current principal | Same; no client ownership field is read | Preserved securely |
| Status | `pending` | `pending` | Preserved |
| Response | `{ok,status,review_required,submission_id,id,version,submitted}` | Same fields; `/api/publish` adds its existing `legacy_endpoint` field | Preserved |
| Pending path | `pending/<submission_id>/<architecture>.prg32` | Same relative path under the disposable root | Preserved |
| Catalog | Submission does not publish until review | Submission does not create `index.json` or published files | Preserved |
| API invalid request | `400 {ok:false,error:"invalid request",code:"invalid_request"}` | Stable typed submission errors; validation uses the same public envelope | Intentional security-safe implementation detail |

The sanitized contract fixture is
`backend/tests/fixtures/m5-1-submission-contract.json`. The Flask contract
test is `tests/test_m5_1_submission_contract.py`; Fastify equivalents are in
`backend/tests/submission.test.ts`. Existing Flask submission tests remain
unchanged and continue to exercise the authoritative implementation.

## 4. Modular publishing architecture

The implementation separates the responsibilities requested for the
migration:

- `backend/src/submission/routes.ts` parses/authenticates HTTP requests and
  serializes responses;
- `backend/src/submission/zip.ts` performs bounded ZIP inspection and
  decompression;
- `backend/src/submission/prg32.ts` validates the PRG32 binary and builds the
  pending metadata trailer compatibly;
- `backend/src/submission/storage.ts` owns pending filesystem staging and
  cleanup;
- `backend/src/submission/service.ts` coordinates validation, ownership,
  SQLite persistence, and compensation;
- `backend/src/submission/errors.ts` defines stable public error categories.

No review or publication service is called by the submission route.

## 5. ZIP security validation

Defaults match Flask M1.2a:

| Limit/invariant | Default |
| --- | ---: |
| Archive bytes | 64 MiB |
| Entries, including directories | 128 |
| Individual uncompressed entry | 32 MiB |
| Total uncompressed data | 128 MiB |
| Compression ratio | 100:1 |
| Manifest bytes | 256 KiB |

The multipart parser bounds the upload. The ZIP parser then rejects malformed
archives, unsafe absolute/drive/`.`/`..`/NUL paths, duplicate names, excessive
entry counts, invalid declared sizes, compression bombs, missing files, and
inconsistent decompressed byte counts. Actual output lengths are checked after
decompression; ZIP metadata is not treated as sufficient evidence.

The archive is decompressed into bounded in-memory buffers and is never
extracted into the final cartridge store. Only validated, rebuilt images are
written to a deterministic pending directory.

## 6. PRG32 binary validation

The TypeScript parser preserves the existing PRG32 decisions:

- `PRG2` magic and the 72-byte header baseline;
- header size and non-zero code payload bounds;
- optional `AUD0` block flag, magic, and length bounds;
- `PRG32META` trailer version, entry count, TLV bounds, and ASCII block IDs;
- META/COLO JSON decoding and metadata/colophon ABI validation;
- `esp32c6` and `qemu` architecture aliases;
- preservation of unknown trailer blocks when rebuilding a pending image.

Each manifest architecture must identify an existing `.prg32` entry. The raw
binary is validated before the pending image is built. Firmware ABI constants
and architecture identifiers were not changed.

## 7. Persistence and ownership

The existing `cartridge_submissions` table is used as-is. There is no migration
and no new column. A submission transaction:

1. derives `submitted_by_user_id` and `submitted_by` from the authenticated
   `Principal`;
2. inserts the metadata and a pending status;
3. stages validated images below `pending/<id>/`;
4. updates `pending_dir` and `architectures_json`;
5. commits the SQLite transaction.

Client-supplied IDs, versions, users, roles, or ownership fields are not used
for attribution. Duplicate submissions are accepted as Flask currently
accepts them; the later review/product policy must decide whether to add
idempotency.

## 8. Pending filesystem design

Pending storage is rooted at `PRG32_BACKEND_SUBMISSION_DISPOSABLE_ROOT`, which
is `/writer-store` in the M4.5 Compose writer. The service requires an existing
regular directory and rejects symlinked roots/components. It writes only:

```text
<disposable-root>/pending/<submission-id>/<architecture>.prg32
```

Files are written to exclusive temporary names and renamed into place. No
published directory or `index.json` is touched. Validation failures occur
before staging; persistence failures remove the staged directory and attempt
to delete the inserted row. Submission IDs provide deterministic isolation
for concurrent requests.

## 9. Failure, cleanup, and consistency

SQLite and filesystem operations are not one atomic transaction. The current
sequence and recovery behavior are explicit:

| Failure point | Behavior |
| --- | --- |
| Invalid ZIP/manifest/binary | Reject before DB mutation and before pending staging |
| SQLite insert failure | No filesystem staging is attempted |
| Pending directory or binary write failure | Roll back/delete the row and remove the pending directory best-effort |
| SQLite update/commit failure | Roll back and remove the pending directory best-effort |
| Process interruption during the sequence | A pending row or directory can remain; it must be found by a future reconciliation command |
| Duplicate/concurrent submission | Separate SQLite IDs and pending directories; no catalog mutation |

M5.1 does not claim atomic cross-resource behavior. A future reconciliation
tool must detect pending rows without files, pending directories without rows,
partial variant sets, and stale pending submissions before any operational
cutover. The current service does not auto-delete ambiguous artifacts.

## 10. Authorization matrix

Submission authorization follows the M4.5 Flask inventory:

| Principal | `POST /publish` and API routes |
| --- | --- |
| Anonymous | Denied with `401 login required` |
| Authenticated user | Allowed, ownership derived from principal |
| Publisher | Allowed, with the same owner derivation |
| Administrator | Allowed as an authenticated submitter; no implicit editor/reviewer behavior added |
| Bearer token | Allowed without browser CSRF, matching the existing Fastify auth foundation |
| Browser session | Requires the existing session and constant-time CSRF check |

No submitter listing or self-service detail API was added. Editor-only review
semantics remain a later milestone and are not broadened to administrators.

## 11. Disposable writer integration

The single root `docker-compose.yml` enables submission writes only in the
existing `writer` profile:

- `writer-init` creates the synthetic auth/shadow databases, including the
  existing `cartridge_submissions` schema, and the disposable store volume;
- `writer` mounts auth storage writable, shadow storage read-only, and the
  disposable cartridge root writable;
- root filesystem remains read-only, capabilities remain dropped, and
  `no-new-privileges` remains enabled;
- exposure remains loopback-only on port 5091;
- there are no Traefik labels, edge network, `/data` mount, operational
  database mount, or operational cartridge mount;
- normal `backend`, `dev`, and `prod` profiles are unchanged.

The submission gate requires `PRG32_BACKEND_SUBMISSION_WRITE_MODE=test`, an
explicit disposable root, and the isolated auth writer. It never falls back to
Flask paths.

## 12. Differential and regression evidence

Executed against synthetic disposable fixtures:

- Flask submission contract: success, anonymous rejection, invalid ZIP,
  pending response fields, and pending filesystem behavior;
- Fastify: success, alias response, authentication and CSRF rejection,
  malformed/unsafe/resource-exhausting ZIPs, invalid PRG32, DB failure
  compensation, and concurrent pending directories;
- existing Flask security/API tests and the TypeScript compatibility suite.

The final isolated writer smoke performed bootstrap, CSRF issuance, a real
multipart upload, and verified `submitted_by=smoke`, `status=pending`,
`pending/1/qemu.prg32`, and absence of `/writer-store/index.json`. Temporary
volumes and the smoke network were removed afterward. An earlier smoke caught
that the disposable init fixture lacked `cartridge_submissions`; that fixture
was corrected without changing the operational schema.

## 13. Verification commands and results

All local Node commands used Node 24 through `source "$HOME/.nvm/nvm.sh" &&
nvm use 24` and pnpm.

| Check | Result |
| --- | --- |
| `backend/pnpm run typecheck` | PASS |
| `backend/pnpm run lint` | PASS |
| `backend/pnpm run test` | PASS — 8 files, 48 tests |
| `backend/pnpm run build` | PASS |
| `SECRET_KEY=pytest-local-only ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| `python3 -m py_compile app.py cartridge_store/*.py tests/test_m5_1_submission_contract.py` | PASS |
| Frontend typecheck, lint, tests, production build | PASS — 5 tests; Next.js production build |
| `docker compose` profile config checks | PASS |
| Docker backend/writer multistage build | PASS |
| Isolated writer submission smoke | PASS after disposable fixture correction |
| `git diff --check` | PASS |

## 14. Remaining limitations and M5.2 prerequisites

M5.2 must not start automatically. Before review/publication work is
authorized, it must provide:

- editor-group authorization parity and explicit treatment of admins without
  the `editors` group;
- review metadata editing, approve/reject transitions, and exact response
  parity;
- publication/index/file compensation with kill-point and restart tests;
- a reconciliation command for orphaned rows, files, and stale pending data;
- backup/restore evidence for the write domain;
- a decision on duplicate/idempotency behavior and operation records;
- review of the remaining path-based TOCTOU and host-volume trust assumptions.

Operational cutover remains blocked by the M4.5 trust boundary, the lack of a
cross-resource reconciliation record, process-local sessions/rate limiting,
and the rule that Flask is still the sole operational writer. No public route
or deployment change is authorized by M5.1.
