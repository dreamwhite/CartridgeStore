# PRG32 Cartridge Store — M5.2d storage API parity implementation

Date: 2026-10-14
Status: disposable differential gate implemented; operational cutover NO-GO.

## 1. Executive result

M5.2d is **GO for the disposable read-only API compatibility gate**. The
developer-only harness creates one synthetic legacy snapshot, verifies it with
the M5.2b inventory, migrates it into a new M5.2c target, calls the actual
Flask handlers through a Flask test client, and compares those responses with a
projection that reads only canonical SQLite and immutable storage-v2 objects.

The gate passed 22 cases with zero target defects. It exercised nine
deterministic M5.2c interruption points, resumed each target successfully,
preserved three historical download events, refused a corrupted canonical
object, and confirmed that the legacy source fingerprint remained unchanged.

This does not authorize operational migration, public Fastify ownership,
Flask retirement, deployment, or M5.2e. Flask remains the operational owner.

## 2. Scope and safety boundary

The implementation is confined to `backend/src/storage-v2/differential/`, a
fixture-only Flask test-client helper, the existing isolated migration mapping,
tests, and modernization documentation.

- no public Fastify route or startup registration was added;
- the projection opens the target database with `query_only=ON`;
- target reads resolve objects through `storage_objects`, validate
  `object_kind`, reject symlinks/path escapes, and verify size plus SHA-256;
- target catalog reads never consult `index.json` or enumerate object folders;
- Flask download telemetry is observed only in a disposable copy because the
  real handler writes a legacy download event;
- the original synthetic source is never passed to a mutating Flask request;
- no production database, volume, route, deployment, Traefik, Authentik, or
  `../PRG32` state was changed.

## 3. Actual Flask routes compared

The harness executes the real handlers for:

| Contract | Cases |
| --- | --- |
| Catalog listing | `GET /api/games`, `q`, `search`, no-match, pagination first/later/boundary, invalid `per_page` |
| Cartridge detail | existing and unknown cartridge; explicit older version; latest version; unknown version |
| Media | icon, screenshot, missing screenshot |
| Colophon | `GET /api/games/<id>/colophon` |
| Binary | both `esp32c6` and `qemu`, older/latest versions, default architecture, unsupported architecture |
| Error behavior | unknown cartridge, unknown version, unknown architecture |

The real Flask app is loaded with `create_app(TESTING=True)` and requests are
issued through `app.test_client()`. No hand-built Flask response replaces a
handler call.

## 4. Firmware source contracts inspected

Read-only inspection of `../PRG32` covered:

- `prg32/store/store_api.py` catalog and download URL construction;
- `prg32/store/utils.py` discovery and metadata ABI constants;
- `tools/prg32_cartridge_format.py` metadata/colophon parsing and architecture
  profiles;
- store API documentation for `Content-Length`, binary streaming, and the
  `esp32c6`/`qemu` architecture identifiers.

The preserved observables are `prg32-store-discovery-1.0`,
`prg32-metadata-1.0`, `prg32-colophon-1.0`, public cartridge ID, version,
architecture, URL shape, status/error behavior, MIME type, attachment name,
and exact binary bytes. Firmware runtime execution was not attempted.

Evidence classification:

| Evidence | Result |
| --- | --- |
| Source-contract verified | discovery, metadata, colophon, architecture and host URL behavior |
| Differential HTTP verified | catalog/detail/media/colophon/download/error cases below |
| Binary verified | exact SHA-256 and byte equality for both architectures and an older version |
| Firmware runtime verified | not verified in this milestone |

## 5. Synthetic dataset

The fixture is deterministic and disposable. It contains two cartridges,
three versions for the first cartridge, both supported architectures, a latest
release with architecture-specific screenshot media, a release without a
screenshot, metadata, colophon, authors, tags, a pending submission, private
submission staging bytes, three historical download events, one score, one run,
and one metrics sample. All `.prg32` bytes are generated with the existing
PRG32 builder/parser; no operational cartridge artifact is copied.

Negative cases include an unknown cartridge, unknown version, unsupported
architecture, missing screenshot, and invalid pagination input.

## 6. Differential harness architecture

The developer command is:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend run storage:parity
```

The command creates isolated temporary roots, emits the structured
`prg32-storage-api-differential-1.0` result, and exits non-zero on any blocking
difference. It has no operational defaults and no running server dependency.

`flask-differential-helper.py` is invoked as a subprocess so the source
snapshot remains read-only; it uses a disposable copy because Flask's download
handler records legacy telemetry. `CanonicalReadProjection` is a pure test
adapter and is not imported by Fastify runtime startup.

Response normalization compares status, JSON field/value semantics, required
headers, exact binary body hash/size, and download filename. JSON
`Content-Length` is normalized because equivalent JSON objects can have
different key order. Flask's filesystem-derived ETag is normalized because it
contains disposable mtime/inode data and is not firmware-visible. No field,
status, architecture, filename, or binary byte is normalized away.

## 7. Canonical read-only projection

The projection uses SQL joins over published `cartridges`, `releases`,
`artifacts`, `media`, and `storage_objects`. It:

- selects the latest release by canonical publication order while preserving
  explicit legacy version selection;
- retains public variant fields, including the legacy filename, in the
  migration compatibility JSON without exposing target storage keys;
- resolves `esp32c6` and `qemu` artifacts independently;
- resolves icon/screenshot media by architecture with release-wide fallback;
- refuses unavailable, wrong-kind, missing, symlinked, path-escaping, or
  hash/size-corrupt objects;
- never reads `index.json`, source paths, staging submissions, or journal data
  to build a public response.

## 8. Parity results

| Area | Result |
| --- | ---: |
| Total differential cases | 22 |
| PASS / `PARITY` | 22 |
| `TARGET_DEFECT` | 0 |
| Catalog/search/pagination | PASS |
| Detail/version selection | PASS |
| Architecture selection | PASS |
| Binary SHA-256/byte equality | PASS |
| Media SHA-256/byte equality | PASS |
| Firmware-facing JSON/URL/header shape | source + differential verified |
| Unknown/error behavior | PASS |
| Private staging isolation | PASS by projection boundary and target schema tests |
| Corrupt object refusal | PASS, one explicit regression |

The binary cases compare `Content-Length`, MIME type, attachment filename,
SHA-256, byte count, and exact bytes. The media cases compare exact bytes and
MIME type; no image is regenerated, resized, or recompressed.

## 9. Telemetry and compatible data

The migration target preserves three mapped historical download events. The
read-only projection intentionally creates no target event. The legacy Flask
download side effect is therefore distinguished from response parity:

- read-only download response parity: **verified**;
- historical telemetry identity/count migration: **verified**;
- operational target telemetry write parity: **NOT_VERIFIED**;
- target delivery outcome semantics: **NOT_VERIFIED** beyond the existing
  M5.2c `unknown` mapping for legacy events.

Scores, runs, and samples are included in the synthetic source and migrated
through the existing compatible-table copy. Their identifiers and relationships
are checked by the M5.2c independent verifier. Full live score/metrics API
write parity remains covered by their separate milestones and is not claimed
here.

## 10. M5.2c recovery regression results

The harness injected and resumed at:

`after-initialize`, `after-compatible-table`, `after-artifact`, `after-media`,
`after-submission`, `after-telemetry`, `before-finalization`,
`after-finalization`, and `before-verification`.

All 9/9 disposable targets resumed to a verified completed state. The full
backend suite also re-runs the existing M5.2c authorization gate, source
mutation rejection, idempotent rerun, unmappable-event exception, and journal
status coverage. A completed target with a deliberately corrupted artifact is
detected and the projection fails closed. No source mutation, duplicate
logical entity, or private staging exposure was accepted.

The current executor exposes phase-level fault points rather than process
signals at every byte/SQLite instruction boundary. Fine-grained power-loss
simulation, backup/restore, and operational rollback remain M5.2e/f work.

## 11. Structured parity matrix

Each result contains `contractId`, legacy endpoint, target projection, fixture
case, expected/actual status, JSON/header/binary comparison flags, firmware
relevance, classification, blocking status, response hash, and response size.
The CLI emits every result; failures are not hidden in a summary count.

Only `PARITY` and `TARGET_DEFECT` were produced in this populated gate. The
following explicitly remain `NOT_VERIFIED`: firmware hardware/runtime
execution, operational download-event writes, conditional/range semantics not
used by the firmware client, live Fastify route registration, and backup/restore.

## 12. Files changed for M5.2d

- `backend/src/storage-v2/differential/types.ts`
- `backend/src/storage-v2/differential/normalize.ts`
- `backend/src/storage-v2/differential/projection.ts`
- `backend/src/storage-v2/differential/harness.ts`
- `backend/src/storage-v2/differential/cli.ts`
- `backend/src/storage-v2/legacy/types.ts`
- `backend/src/storage-v2/legacy/inventory.ts`
- `backend/src/storage-v2/migration/executor.ts`
- `backend/tests/fixtures/flask-differential-helper.py`
- `backend/tests/storage-v2-differential.test.ts`
- `backend/package.json` and its lockfile

The inventory/migration change preserves public legacy variant fields in target
compatibility metadata. It does not change schema, public routes, or runtime
Flask behavior.

## 13. Commands and results

Executed with Node 24 selected through `nvm use 24`:

- `pnpm --dir backend run storage:parity` — PASS: 22 cases, 9 recovery
  boundaries, 0 target defects;
- `pnpm --dir backend exec vitest run tests/storage-v2-differential.test.ts` —
  PASS: 1 file, 1 test;
- `pnpm --dir backend run typecheck` — PASS;
- `pnpm --dir backend run lint` — PASS;
- `pnpm --dir backend run test` — PASS: 33 files, 172 tests;
- `pnpm --dir backend run build` — PASS;
- `pnpm --dir frontend run typecheck` — PASS;
- `pnpm --dir frontend run lint` — PASS;
- `pnpm --dir frontend run test` — PASS: 20 files, 55 tests;
- `FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build` — PASS;
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m py_compile app.py cartridge_store/*.py` — PASS;
- `SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q` — PASS: 64 tests;
- `docker compose --profile dev config --quiet` — PASS;
- `git diff --check` — PASS.

The frontend test run emitted the existing Vite `configLoader: native`
deprecation warning only; it did not fail the check. Flask logs expected
warnings for the intentionally rejected missing-media and invalid-resource
cases in the differential fixture.

## 14. M5.2e prerequisites and decisions

M5.2e must still add backup/restore rehearsal, disposable rollback evidence,
fine-grained process-crash testing, live target telemetry write-boundary
decisions, and a one-writer operational plan. M5.2d does not authorize any of
those changes.

Decision: **GO for M5.2d disposable API, binary, media and recovery gate.**

Decision: **NO-GO for operational migration, public Fastify cutover, Flask
retirement, deployment, or production data mutation.**
