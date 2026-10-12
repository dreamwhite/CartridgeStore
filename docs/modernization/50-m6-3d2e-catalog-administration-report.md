# PRG32 Cartridge Store — M6.3d.2e Catalog Administration & Publication Consistency

**Status:** implemented and verified in the isolated Fastify/TypeScript writer
profile only.
**Date:** 2026-10-12

Flask remains the authoritative production backend and sole production writer.
This milestone does not deploy Fastify, modify Flask, change SQLite schema,
add a Next.js administration interface, alter Traefik routing, or start
M6.3d.2f.

## 1. Scope and decision

M6.3d.2e adds the missing Fastify administrative catalog read and mutation
boundary while reusing the existing M5.2a/M5.2b publication journal, lock,
staging, backup, atomic index replacement, compensation, and reconciliation
implementation. It does not create a second publishing pipeline.

The authoritative catalog remains the filesystem `index.json` plus published
cartridge files. No SQLite catalog table was introduced.

## 2. Executive summary

The isolated writer now exposes bounded administrative cartridge listing and
detail routes, allow-listed metadata PATCH, and architecture/version-aware
deletion. Direct catalog administration is authorized by the centralized
`catalog:metadata:write` permission: administrators and members of the
existing `editors` group are allowed; ordinary users, readers, players,
publishers, anonymous requests, and unknown groups are denied.

Metadata updates rebuild every selected published binary so embedded metadata,
colophon, index metadata, size, and SHA-256 remain synchronized. Deletions
remove files and index entries atomically through the same durable journal.

## 3. Existing catalog behavior preserved

The public read API remains unchanged:

- `GET /api/games`
- `GET /api/games/<id>`
- `GET /api/games/<id>/icon`
- `GET /api/games/<id>/screenshot`
- `GET /api/games/<id>/colophon`
- `GET /api/games/<id>/download`
- `GET /.well-known/prg32-store.json`

The implementation keeps the existing game IDs, version identifiers,
architecture identifiers (`qemu`, `esp32c6`), metadata ABI, colophon ABI,
published filenames, and public response fields. Jinja routes and Flask
behavior were not changed.

## 4. Administrative API inventory

Implemented routes:

- `GET /api/admin/cartridges`
- `GET /api/admin/cartridges/:cartridgeId`
- `PATCH /api/admin/cartridges/:cartridgeId`
- `DELETE /api/admin/cartridges/:cartridgeId`

Detail and mutation operations select a version with the required `version`
query parameter for writes and the optional parameter for reads. DELETE also
accepts an optional `architecture`; without it, all published architectures
for the selected version are deleted.

No duplicate `/api/publish` or review route was added. Submission review
continues to use the existing editors-only `/api/submissions/:id/verify`
workflow.

## 5. List contract

`GET /api/admin/cartridges` accepts only `page`, `limit`, `q`, `version`, and
`architecture`. Pagination is bounded to page `1..100000` and limit `1..100`;
results are ordered deterministically by normalized title and ID.

The response is:

```json
{
  "ok": true,
  "cartridges": [
    {
      "id": "org.example.game",
      "title": "Example Game",
      "summary": "Summary",
      "selected_version": "1.0.0",
      "versions": ["1.0.0"],
      "architectures": ["qemu", "esp32c6"],
      "publication_state": "published",
      "artifact_state": "available",
      "variants": {}
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 1
}
```

The projection deliberately omits internal filesystem filenames, absolute
paths, staging paths, backup paths, journal IDs, and database internals.

## 6. Detail contract

`GET /api/admin/cartridges/:cartridgeId` returns `{ "ok": true,
"cartridge": ... }` using the same safe projection as the list route. An
optional `version` selects a historical published version. A malformed ID or
version returns a stable `invalid_identifier` error; a missing cartridge
returns `catalog_not_found`.

Each variant exposes only architecture, size, SHA-256, media presence/MIME,
signature presence, and an updated timestamp. The service verifies the file
hash while building the projection and reports `inconsistent` or `unavailable`
artifact state without exposing path details.

## 7. RBAC policy

Catalog administration uses the centralized permission registry and
`permissionGuard`; the route does not perform an independent role comparison.

| Principal | Catalog list/detail/update/delete | Submission review |
| --- | --- | --- |
| administrator | allowed | denied unless also editors |
| editors group | allowed | allowed |
| ordinary user/reader/player/publisher | denied | denied |
| anonymous | denied | denied |

This preserves the existing separation: an administrator without editors is a
catalog administrator but cannot approve or reject submissions. The protected
`editors` group identity is unchanged.

## 8. Metadata allow-list and immutability

PATCH accepts only these fields, either directly or under a `metadata` object:

`title`, `summary`, `description`, `tags`, `license`, `homepage`, and
`repository`.

The implementation rejects unknown fields and bounds text, tag count, and tag
length. `id`, `version`, and `authors` are immutable. ABI identifiers,
architecture, binary payload, signature blocks, media identity, published
filenames, publication state, and integrity fields are derived or controlled
by the publication service and cannot be mass-assigned.

## 9. Metadata update semantics

An update reads the current index and every selected published binary, validates
the PRG32 structure, applies the same metadata validation used by review,
rebuilds the binary with the new metadata, updates the compatible colophon
title/version fields, and plans the new hashes and sizes.

The index update preserves existing variant fields such as publication
metadata while replacing only derived fields. The operation then stages,
verifies, backs up, replaces, hashes, and cleans up through the existing
publication state machine.

## 10. Deletion semantics

DELETE supports a whole-version deletion or one architecture variant. The
index is updated only after the file operation has a verified backup and the
current target hash still equals the preparation hash. Deleting one
architecture leaves all other architectures intact. Removing the last
architecture removes the version; removing the last version removes the game.

No historical download events, score rows, metrics rows, submissions, user
records, or firmware identifiers are rewritten. A completed catalog deletion
is recorded in the publication journal so reconciliation does not misclassify
an intentionally removed verified artifact as an accidental missing variant.

## 11. Filesystem safety

The operation validates safe game IDs, versions, and normalized architectures.
Published filenames must remain below `cartridges/`; all resolved paths are
checked against the disposable publication root, and symlink components are
rejected. Files must be regular files and valid bounded PRG32 cartridges.

Staging and backups remain below the existing private publication directories.
No unbounded archive or binary is loaded by this feature, and no uploaded
filesystem path is accepted from the administrative request.

## 12. Publication journal integration

Catalog operations use the existing `PublicationConsistencyService` and its
states:

`PREPARED -> STAGED -> VERIFIED -> FILES_REPLACED -> INDEX_REPLACED ->
DATABASE_UPDATED -> COMPLETED`.

Catalog operations are journaled with `operationKind: catalog` and
`catalogAction: update|delete`. Old submission journal records remain readable
because omitted `operationKind` continues to default to `submission`.

There is still one lock, one operation directory, one staging boundary, one
backup boundary, and one reconciliation implementation for review publication
and catalog administration.

## 13. Recovery and compensation

Catalog updates and deletions are resumable after a process interruption.
Backed-up binaries and `index.json` allow compensation when the operation has
not committed. Compensation refuses to overwrite targets that changed outside
the journal plan and returns a stable recovery-required condition.

The tests cover an interruption after index replacement during architecture
deletion and verify successful resume, removal of the selected file, and a
clean reconciliation report.

## 14. Concurrency and deterministic behavior

All catalog mutations acquire the existing publication lock. Preparation stores
the previous index hash and each target hash. Replacement rechecks both before
mutation, so an out-of-band change becomes an ambiguous/recovery result rather
than silent overwrite.

Pagination, version selection, architecture normalization, index serialization,
and variant ordering are deterministic. No process-local catalog cache was
introduced.

## 15. SQLite and schema boundary

Catalog mutations intentionally do not add or update a SQLite catalog table.
The existing `updateDatabase` journal phase transitions catalog operations
without executing a schema mutation. The existing database handle is retained
for the common service boundary and for compatibility with submission
publication.

No table, column, index, migration, trigger, ORM, or Drizzle integration was
added.

## 16. Public and firmware compatibility

The public catalog continues to read the same `index.json` structure and
published `.prg32` files. Binary downloads after a metadata update contain the
updated metadata and retain the same game ID, version, architecture, legacy
payload, icon, screenshot, and signature behavior.

No firmware ingestion, score, metrics, multiplayer, discovery, or download
request contract was changed. `qemu` and `esp32c6` remain canonical.

## 17. Backup and restore compatibility

The existing backup/restore implementation remains the authority for the
filesystem store and SQLite payload. Catalog journal, staging, and backup
objects remain under the same store root and are therefore covered by the
existing operational backup boundary. No new backup format, encryption
provider, restore route, or retention policy was added.

An incomplete catalog operation remains visible to reconciliation and must be
resolved before a future restore is considered operationally clean.

## 18. Audit and error handling

Mutations reuse the existing bounded `AdminAuditLog` and record attempted,
committed, failed, and rejected outcomes without writing credentials or
filesystem paths into the audit record. Audit preflight remains fail-closed.

Public responses use stable envelopes and codes such as
`catalog_not_found`, `catalog_inconsistent`, `catalog_metadata_invalid`,
`catalog_recovery_required`, `csrf_failed`, and
`admin_browser_session_required`. Raw exception strings and internal paths are
logged server-side only and are not returned to clients.

## 19. Tests added and compatibility evidence

New coverage is in:

- `backend/tests/admin-catalog.test.ts` — safe list/detail projection,
  metadata allow-list, embedded binary parity, CSRF, bearer mutation denial,
  centralized RBAC, audit evidence, and architecture-specific deletion;
- `backend/tests/consistency.test.ts` — catalog update/delete journal flow,
  recovery after index replacement interruption, and reconciliation.

The full isolated Fastify suite passed: **19 test files, 105 tests**.

## 20. Verification results

Executed checks:

| Check | Result |
| --- | --- |
| `nvm use 24 && pnpm run check` in `backend/` | PASS — typecheck, ESLint, 19 files/105 tests, build |
| `nvm use 24 && FLASK_PROXY_TARGET=http://flask:5080 pnpm run check` in `frontend/` | PASS — typecheck, ESLint, 2 files/5 tests, Next build |
| `python3 -m py_compile app.py cartridge_store/*.py` | PASS |
| `./.venv313/bin/python -m pytest -q` | 63 passed, 1 pre-existing mDNS failure |
| `docker compose config` | PASS |
| writer profile Compose config | PASS |
| multistage backend Docker build | PASS |
| disposable writer Docker E2E | PASS — bootstrap, catalog list, stable missing-cartridge mutation |
| `git diff --check` | PASS |

The Python failure is the known test setup issue: it calls
`create_app({"TESTING": False, ...})` without `SECRET_KEY`, and the existing
startup guard correctly raises. Flask was not changed to hide this failure.

## 21. Files modified and created

M6.3d.2e implementation files:

- `backend/src/admin/catalog-service.ts` — safe projection, validation, audit,
  and mutation service;
- `backend/src/admin/routes.ts` — four administrative catalog routes;
- `backend/src/app.ts` — shared publication service and route wiring;
- `backend/src/consistency/publication.ts` — catalog journal operation kind,
  update/delete planning, recovery, compensation, and reconciliation parity;
- `backend/tests/admin-catalog.test.ts` — route and RBAC coverage;
- `backend/tests/consistency.test.ts` — journal/recovery coverage;
- this report and the roadmap evidence section.

No Flask file, template, production compose routing, SQLite schema, or
companion `../PRG32` file was modified by this milestone.

## 22. Remaining risks and operational limits

- Fastify remains an isolated writer and is not production-authoritative.
- The public admin API currently exposes the required cartridge moderation
  boundary but has no Next.js consumer.
- The catalog still depends on the filesystem index and requires operational
  reconciliation after crash or manual file tampering.
- JSONL audit and filesystem publication are separate persistence systems; the
  existing documented post-commit audit I/O limitation remains.
- The Python baseline still has the pre-existing mDNS test failure.
- SMTP contract design, database sensitive-data encryption, and production
  cutover are not part of this milestone.

## 23. Gate decision and next milestone

**M6.3d.2e isolated implementation gate: GO.** The required Fastify catalog
administration routes, centralized RBAC, metadata allow-list, publication
consistency, recovery behavior, compatibility tests, Docker check, and
documentation evidence are present and verified.

**Production cutover gate: NO-GO.** Flask remains the only authorized
production writer and no deployment was performed.

The next milestones are explicitly planned, not implemented:

- **M6.3d.2f — Administrative API Integration & SMTP Contract Design:**
  integrate the administrative API with the Next.js admin consumer and define
  the SMTP/provider boundary, delivery observability, and compatibility tests.
- **M6.3d.2g — Database Security Hardening & Sensitive Data Encryption:**
  assess and implement approved encryption/key-management controls for
  sensitive database material without changing public identifiers or firmware
  contracts.

Stop condition satisfied: M6.3d.2f and M6.3d.2g were not started.
