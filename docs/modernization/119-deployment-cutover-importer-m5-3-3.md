# PRG32 Cartridge Store — M5.3.3 Deployment Contract, Cutover Runbook & University Importer

## 1. Executive result

M5.3.3 is **GO for the implementation-ready deployment contract and
disposable university importer**.

The following decisions remain explicit:

| Decision | Result |
| --- | --- |
| M5.3.3 deployment contract | `M533_DEPLOYMENT_CONTRACT_GO` |
| Disposable importer | `GO` — offline dry-run and canonical unpublished import verified |
| Operational deployment | `OPERATIONAL_CUTOVER_NO_GO` |
| Real university-data import | `NO-GO` — no real source data was imported |
| Flask retirement | `FLASK_RETIREMENT_NO_GO` |
| Dream Traefik/AuthentiK/Mailpit mutation | `NO-GO` — none was performed |
| M5.3.4 | Not started |

This milestone creates a future operational Compose template and an importer
that is safe to exercise against synthetic or explicitly supplied source
material. It does not deploy the template, change public routing, migrate
operational data, or remove Flask.

## 2. Scope and safety boundary

Implemented in this milestone:

- a single future deployment template at
  `deploy/operational/compose.yaml`;
- a bounded university source manifest format;
- offline and allowlisted HTTPS source modes;
- PRG32 binary, metadata, architecture, version, media, path, symlink,
  hash, size, duplicate and redirect validation;
- dry-run validation with no canonical writes;
- explicit-authorization canonical import through
  `CanonicalWorkflowService.createFromBundle()`;
- default `pending_review` / `IMPORTED_UNPUBLISHED` behavior;
- idempotent retry detection for an existing canonical submission;
- synthetic adversarial and workflow tests;
- this single M5.3.3 report.

Not performed:

- no `docker compose up`, cutover, restart, stop, remove or deployment;
- no change to root Compose, Dream Traefik, Dream Authentik or Mailpit;
- no change to operational SQLite, cartridge storage, DNS or TLS;
- no account, password, session, API-token, OIDC/SAML identity, telemetry,
  score or historical counter import;
- no automatic crawl, bulk download or login to the university Store;
- no commit or push.

The repository was already substantially dirty before this milestone. Existing
unrelated changes were preserved and are not attributed to M5.3.3.

## 3. Deployment contract

The future runtime has exactly two application services:

| Service | Responsibility | Internal port | Future public origin |
| --- | --- | ---: | --- |
| `fastify` | canonical API, authentication, publishing, telemetry, scores, metrics, WebSocket and mDNS opt-in | 5080 | `https://api.prg32.dream.test` |
| `next` | Next.js storefront, same-origin browser surface and API proxy | 3000 | `https://store.prg32.dream.test` |

Traefik, Authentik and Mailpit are external Dream infrastructure. The
template does not define, own or recreate them.

### 3.1 Network contract

- `app_private` is an internal bridge used by Fastify and Next.js.
- Fastify attaches to `app_private`, external `dream_edge` and external
  `dream_mail`.
- Next.js attaches to `app_private` and external `dream_edge`.
- No application service is attached to a Dream network by this milestone.
- The template declares external network references only; it does not create
  or alter those networks.
- No host port is published by the template.

The template uses `${DREAM_EDGE_NETWORK:-dream_edge}` and
`${DREAM_MAIL_NETWORK:-dream_mail}` so it matches the existing Dream network
names without hard-coding a host-specific path.

### 3.2 Routing contract

The future labels are prepared but inactive because the file is not included
by the root Compose project:

- `store.prg32.dream.test` routes to Next.js port 3000;
- `api.prg32.dream.test` routes to Fastify port 5080;
- the existing WebSocket path remains `/api/multiplayer` on the API origin;
- the existing Flask/transitional bridge remains the public owner until a
  separately approved cutover.

The required future same-origin arrangement is therefore:

```text
browser -> store.prg32.dream.test -> Next.js :3000 -> Fastify :5080
firmware/tool -> api.prg32.dream.test -> Fastify :5080
WebSocket -> api.prg32.dream.test/api/multiplayer -> Fastify :5080
```

### 3.3 Persistence and image contract

- The only application bind mount is an operator-selected
  `${PRG32_OPERATIONAL_DATA_DIR}` mounted at `/data/canonical`.
- The image root is read-only; `/tmp` is a bounded tmpfs.
- Fastify and Next.js use Node.js 24 slim multi-stage images already used by
  the candidate build.
- Fastify owns one canonical SQLite writer and the canonical object store.
- No anonymous volume is part of the operational template.
- No key, password, session secret or token is embedded in the template.
- Required secrets are external environment/secret-provider inputs and are
  represented only by required placeholders.

The current backend still distinguishes disposable canonical modes from a
future operational mode. The template therefore requires an operator-selected
catalog/workflow mode rather than silently selecting disposable mode in
production. This is an intentional cutover gate, not a deployment claim.

### 3.4 Authentication and session contract

- Federation remains generic OIDC/SAML.
- Provider configuration remains outside this repository’s Compose template.
- The default planned session policy is `CONTROLLED_RELOGIN`.
- No email-only identity linking is allowed.
- Provider/subject is the identity key.
- Existing sessions are not assumed portable across the Flask/Fastify
  ownership boundary.
- A real cutover requires an explicit re-login/session-continuity decision.

### 3.5 SMTP contract

The M5.3.2 contract is retained:

- Fastify connects to `mailpit:1025` on `dream_mail`;
- no TLS is used on the internal Mailpit network;
- SMTP authentication is not required for the current internal Mailpit
  contract;
- the canonical application settings/API remain the settings authority;
- a second SMTP configuration authority is not introduced.

The operational template contains only host, port, sender and transport
placeholders. It does not change Mailpit or send a message.

### 3.6 Bootstrap and backup contract

Infrastructure bootstrap is separate from canonical application settings:

- infrastructure bootstrap: bind paths, public origins, proxy trust, external
  secret references, encryption master-key provider, backup-key provider,
  network ownership and optional mDNS;
- canonical settings: persisted in canonical SQLite and managed through the
  canonical admin API/UI after explicit initialization.

Backup-v4 remains the required operational format. It requires authenticated
encryption, external key custody, verified completion and restore, retention,
monitoring and an operator-approved RPO/RTO. M5.3.3 does not rotate keys or
run operational backups.

## 4. University source discovery

The intended source was inspected only with bounded, unauthenticated,
read-only requests:

- DNS for `store.prg32.uniparthenope.it` resolved to `192.167.9.46`.
- `HEAD /` returned `200` from Gunicorn.
- `HEAD /.well-known/prg32-store.json` returned `200` JSON.
- `HEAD /robots.txt` returned `404`.
- `HEAD /api/games?per_page=1` returned `200` JSON.
- one bounded `GET /api/games?per_page=1` was used to verify the public catalog
  shape; no binary or media was downloaded.

The public discovery response exposed the expected discovery ABI and the
legacy catalog/service shape, but announced direct HTTP/IP service URLs rather
than the desired HTTPS dual-origin URLs. This is recorded as a source
compatibility blocker. The importer does not trust those URLs automatically:
remote mode requires an explicitly supplied HTTPS base URL, an exact origin
allowlist and an explicit item list.

No credentials, cookies, tokens, private records or authentication flows were
used. No public source data was copied into the repository or a canonical
target.

## 5. Importer design

Implementation files:

- `backend/src/importers/university/index.ts`
- `backend/src/importers/university/cli.ts`
- `backend/tests/university-importer.test.ts`
- `backend/package.json` (`import:university` script)

The importer accepts a manifest with ABI
`prg32-university-import-1.0`:

```json
{
  "abi": "prg32-university-import-1.0",
  "source": "offline-university-snapshot",
  "items": [
    {
      "architecture": "qemu",
      "cartridge": "cartridges/example-qemu.prg32",
      "icon": "media/example.png",
      "screenshot": "media/example-screen.png",
      "metadata": "metadata/example.json",
      "sha256": "<64 lowercase hex characters>"
    }
  ]
}
```

The item identity is cross-checked against embedded PRG32 metadata. The
embedded metadata ABI remains `prg32-metadata-1.0`; the colophon ABI remains
`prg32-colophon-1.0`.

### 5.1 Source modes

Offline mode:

```bash
pnpm --dir backend run import:university -- \
  --manifest /path/to/manifest.json \
  --source-root /path/to/explicit-source \
  --dry-run
```

Remote mode is explicit and bounded:

```bash
pnpm --dir backend run import:university -- \
  --manifest /path/to/manifest.json \
  --remote-base-url https://approved.example.test/store/ \
  --dry-run
```

Remote mode rejects non-HTTPS URLs, non-allowlisted origins, redirects,
unexpected content types, oversized `Content-Length`, oversized streamed
responses and request timeouts. It never discovers additional catalog entries
implicitly.

### 5.2 Limits and validation

Defaults are intentionally bounded:

| Rule | Default |
| --- | ---: |
| Manifest items | 100 |
| Cartridge object | 128 MiB |
| Individual media object | 16 MiB |
| Total item bytes | 256 MiB |
| Remote request timeout | 5 seconds |
| Manifest JSON | 1 MiB |

The importer rejects:

- unsupported manifest ABI;
- duplicate `(id, version, architecture)` identities;
- duplicate or mismatched SHA-256 values;
- unsupported `esp32c6`/`qemu` architecture values;
- missing or inconsistent embedded metadata;
- malformed/truncated PRG32 binaries;
- non-PNG/JPEG icon and screenshot files;
- absolute paths, parent traversal, empty path components and Windows drive
  paths;
- symlink source components and non-regular files;
- archive/source size excess;
- remote redirects and disallowed content types.

### 5.3 Canonical write boundary

The importer does not write arbitrary SQLite rows. An authorized import calls
the existing canonical workflow:

1. validate the source files and embedded metadata;
2. build a bounded canonical submission bundle;
3. call `CanonicalWorkflowService.createFromBundle()`;
4. use canonical staging and canonical submission records;
5. leave the submission `pending_review`;
6. require the existing explicit reviewer approval flow before publication.

The importer never calls `approve()` and never creates a published release.
Pending submissions are not exposed by public catalog/download routes.

`--dry-run` does not instantiate a writable canonical workflow and does not
create a database, object, staging, publication or audit mutation.

Actual import requires `--authorize-import`, the exact disposable authorization
constant, an explicit `--actor-id`, an enabled canonical account and the
canonical workflow authorization. This authorization is not an operational
cutover authorization.

Retries are idempotent at the `(cartridge_id, version)` submission boundary:
an existing canonical submission is reported as `already_imported` and no
second staging or submission write is performed.

## 6. Disposable importer evidence

`backend/tests/university-importer.test.ts` passed all 4 tests:

1. offline dry-run validates a synthetic cartridge and confirms no canonical
   database is created;
2. authorized import uses the canonical workflow, creates `pending_review`,
   creates no release, and reports an idempotent retry;
3. hash mismatch, duplicate identity, traversal and symlink inputs fail before
   canonical writes;
4. remote mode requires HTTPS and an exact allowlisted origin.

The synthetic fixture includes PRG32 metadata, colophon, QEMU architecture,
icon and screenshot bytes. The implementation uses the existing PRG32 parser,
metadata validation, bundle validation, immutable staging and review workflow.

This is an asset importer, not a historical application-record importer. It
does not import accounts, password hashes, sessions, API tokens, federated
identities, scores, runs, samples, download counters or admin settings.

## 7. Firmware and HTTP compatibility

The following existing compatibility guarantees were re-run as part of the
full backend suite and remained green:

- discovery ABI `prg32-store-discovery-1.0`;
- metadata ABI `prg32-metadata-1.0`;
- colophon ABI `prg32-colophon-1.0`;
- architectures `esp32c6` and `qemu`;
- catalog/detail/media/download routes;
- unpublished catalog exclusion;
- canonical download object resolution;
- existing score, run, metrics, WebSocket and authentication contracts.

The importer does not modify `../PRG32`.

## 8. Disposable acceptance composition

The M5.3.3 acceptance evidence is composed from the disposable checks below;
there was no Dream-network attachment and no operational service restart:

- operational template Compose parsing with synthetic placeholders;
- candidate Compose parsing and multi-stage image build;
- existing disposable Fastify/Next health and proxy acceptance;
- existing synthetic OIDC and SAML callbacks;
- existing synthetic Mailpit SMTP acceptance;
- existing authenticated WebSocket acceptance;
- new importer dry-run/import/unpublished/idempotency tests;
- existing backup-v4 and restore test suites;
- existing migration, rollback and source-integrity suites;
- full Playwright disposable suite, 16/16.

The template was validated as configuration only. It was not started and was
not attached to `dream_edge` or `dream_mail`.

## 9. Operator-reviewed cutover runbook

This runbook is a future contract. Each phase requires an operator approval
record. No phase below was executed against production.

### Phase 0 — Change authorization

Preconditions: approved maintenance window, named operator, named reviewer,
change ticket, rollback decision owner and explicit authorization for data
migration/import.

Commands/checks: verify branch, worktree, image digests, template checksum,
secret-provider references and maintenance communication.

Expected: all versions and approvals recorded.

Abort: any missing approver, unknown image or unresolved source scope.

Rollback: no state change; Flask remains authoritative.

### Phase 1 — Source inventory and snapshot

Preconditions: Flask writer quiescence plan and read-only source access.

Commands/checks: create a consistent SQLite backup using SQLite backup APIs;
inventory cartridge/media objects; record hashes, sizes and source manifest;
verify `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.

Expected: immutable source snapshot and complete inventory.

Abort: open transaction ambiguity, missing object, changed hash or incomplete
inventory.

Rollback: discard only disposable artifacts.

### Phase 2 — Canonical target initialization

Preconditions: empty operator-approved bind mount; canonical schema v2,
storage layout v2, journal v1 and backup-v4 support available.

Commands/checks: explicit target initialization; no implicit empty startup.

Expected: target state `ready`, one writer lease, no public route.

Abort: target is not empty, incompatible metadata, wrong ownership or more than
one writer.

Rollback: destroy/discard the disposable target only after evidence capture.

### Phase 3 — Migration or asset import

Preconditions: verified source snapshot, importer manifest, explicit scope and
operator authorization.

Commands/checks: run importer dry-run; compare item count/hash/architecture;
run explicit import; verify every submission is `pending_review`.

Expected: canonical staging and submission records; zero automatic publication.

Abort: hash mismatch, duplicate identity conflict, unsafe path, transaction
failure or unexpected publication state.

Rollback: stop the disposable writer, preserve audit evidence, discard target or
follow recovery procedure; never delete source snapshot.

### Phase 4 — Canonical integrity gate

Checks: SQLite integrity, foreign-key check, storage version tuple, object
hash/size/kind, staging audit, migration exceptions, publication journal and
route visibility.

Expected: no error findings and no recovery-required state.

Abort: any error finding or incomplete journal.

### Phase 5 — Backup-v4 gate

Checks: encrypted backup-v4 creation, independent verification, retention
policy, external key-provider availability and restore into a fresh root.

Expected: verified archive and verified restore report.

Abort: missing key, wrong key acceptance, tampered archive acceptance,
incomplete marker or restore mismatch.

### Phase 6 — Candidate deployment

Checks: build pinned Fastify/Next images; validate the operational template;
start only the approved isolated deployment; verify Fastify/Next health and
private-network connectivity.

Expected: no public traffic and one canonical writer.

Abort: health failure, unexpected network attachment, multiple writer or
unexpected bind mount.

### Phase 7 — Edge transition preparation

Checks: review future Traefik labels and router rules for
`store.prg32.dream.test` and `api.prg32.dream.test`; verify certificate and
middleware policy.

Expected: a reversible edge change plan.

Abort: route collision, wrong service port, missing TLS or wrong network.

Rollback: do not activate labels; preserve current Flask route.

### Phase 8 — Federation and session policy

Checks: verify generic OIDC/SAML metadata, callback origins, provider/subject
mapping, controlled relogin policy and logout behavior.

Expected: no email-only linking and no session-secret assumption across runtimes.

Abort: issuer/audience/callback mismatch, provider ambiguity or unexpected
account linking.

### Phase 9 — Firmware and download gate

Checks: discovery, catalog listing, detail, architecture selection, exact
bytes, ETag, Range and media routes; verify unpublished submissions are not
visible.

Expected: firmware-compatible responses and exact immutable bytes.

Abort: changed identifier/field, byte mismatch, range failure or unpublished
visibility.

### Phase 10 — Publishing and review gate

Checks: submit, review, approve, reject, revision and publication recovery;
verify ownership and audit events.

Expected: publication only through the reviewer workflow.

Abort: direct publish path, missing audit event, ownership leak or incomplete
journal.

### Phase 11 — Telemetry, scores, metrics and WebSocket gate

Checks: download telemetry, runs/samples, scores, public statistics and
authenticated WebSocket relay against firmware-compatible contracts.

Expected: one canonical writer and no duplicate legacy writes.

Abort: write split, ownership ambiguity, contract mismatch or unauthorized
export.

### Phase 12 — SMTP gate

Checks: send one synthetic registration/reset message through `mailpit:1025`,
verify it in Mailpit, and verify no credentials or tokens appear in logs.

Expected: the canonical settings-backed SMTP contract works.

Abort: wrong network, unexpected external delivery, missing message or secret
leak.

### Phase 13 — Ownership handover

Preconditions: all previous phases approved and Flask writes quiesced.

Checks: assert exactly one writer; ensure Flask is read-only/stopped according
to the approved cutover plan; enable Fastify ownership only after the lock gate.

Expected: no simultaneous writer state.

Abort: any writer ambiguity or health loss.

### Phase 14 — Edge activation

Checks: activate the approved Traefik route change and verify both origins,
redirects, headers and WebSocket upgrade.

Expected: store origin reaches Next.js and API origin reaches Fastify.

Abort: wrong backend signature, 5xx, cookie boundary failure, auth callback
failure or route collision.

Rollback: use the state-specific rollback procedure below; never simply restart
Flask while Fastify may have accepted writes.

### Phase 15 — Observation window

Checks: monitor health, errors, authentication, publishing, downloads,
telemetry, scores, metrics, WebSocket and SMTP; compare expected rates.

Expected: stable service and no unauthorized write path.

Abort: agreed error threshold, data divergence, backup failure or writer split.

### Phase 16 — Post-cutover backup

Checks: create and independently verify an encrypted backup-v4 after the
observation window; restore into a fresh disposable root and compare catalog,
objects, submissions and journal state.

Expected: post-cutover recovery evidence.

Abort: failed archive, restore mismatch or missing key custody.

### Phase 17 — Flask retirement review

Checks: prove no public route, firmware client, admin function, telemetry path,
WebSocket, mDNS or recovery procedure still depends on Flask; verify rollback
window and retention.

Expected: a separate human-approved retirement decision.

Abort: any remaining dependency.

M5.3.3 does not execute Phases 13–17.

## 10. Rollback decision table

| State | Meaning | Default action |
| --- | --- | --- |
| A | Before edge activation | discard disposable target if needed; Flask remains authoritative |
| B | Edge active, no canonical writes accepted | restore prior edge route; keep target quarantined; verify Flask |
| C | Fastify accepted canonical writes | stop new writer, control traffic, reconcile post-cutover writes, then choose forward-fix or explicitly accepted data loss |

Restarting Flask is not a safe generic post-cutover rollback. Writes accepted
by Fastify may not exist in the pre-cutover Flask snapshot. The decision must
be recorded as one of:

- forward fix on Fastify;
- reconcile/export post-cutover writes before any legacy restoration;
- rollback with an explicitly accepted data-loss window.

No reverse migration is implemented by this milestone.

## 11. Files changed for M5.3.3

Created:

- `deploy/operational/compose.yaml`
- `backend/src/importers/university/index.ts`
- `backend/src/importers/university/cli.ts`
- `backend/tests/university-importer.test.ts`
- `docs/modernization/119-deployment-cutover-importer-m5-3-3.md`

Modified:

- `backend/package.json` — added the `import:university` developer CLI script.

No root Compose file, operational environment file, Docker volume, database,
Dream infrastructure file or `../PRG32` file was modified.

## 12. Commands and actual results

Node environment:

```text
nvm use 24
Node v24.20.0
pnpm 12.5.1
```

Passed commands:

```text
pnpm --dir backend run typecheck                         PASS
pnpm --dir backend run lint                             PASS
pnpm --dir backend run test                             PASS — 52 files, 268 tests
pnpm --dir backend run build                            PASS

pnpm --dir frontend run typecheck                       PASS
pnpm --dir frontend run lint                            PASS
pnpm --dir frontend run test                            PASS — 22 files, 65 tests
pnpm --dir frontend run build                           PASS
pnpm --dir frontend run test:e2e                        PASS — 16/16 disposable tests

SECRET_KEY=prg32-test-only-secret \
  ./.venv313/bin/python -m pytest -q                  PASS — 64 passed
./.venv313/bin/python -m py_compile app.py cartridge_store/*.py PASS

docker compose config --quiet                            PASS
docker compose -f deploy/candidate/compose.yaml config --quiet PASS
docker compose -f deploy/operational/compose.yaml config --quiet PASS
docker compose -f deploy/candidate/compose.yaml build     PASS
git diff --check                                         PASS
```

The operational template Compose check used synthetic placeholder values only.
No template service was started.

## 13. Remaining blockers

The following prevent operational cutover and Flask retirement:

1. The public Dream API observation still identifies Flask/Werkzeug as the API
   runtime at `api.prg32.dream.test`.
2. The root operational Compose topology still includes the Flask and
   transitional compatibility services; it was intentionally not changed.
3. The operational canonical catalog/workflow mode and its authorization
   provider need an approved implementation and secret-custody decision.
4. Real canonical data migration, source quiescence and writer handover were
   not authorized.
5. Traefik route activation and certificate/middleware review remain pending.
6. Authentik provider configuration and session continuity require a human
   decision; this milestone did not modify Authentik.
7. Operational backup schedule, encrypted-key custody, retention and RPO/RTO
   are not verified.
8. The university Store discovery document exposes legacy HTTP/IP service URLs;
   an operator must approve a canonical HTTPS source base and an explicit
   item manifest before any remote import.
9. University source assets have not been imported. The importer has only been
   exercised with synthetic data.
10. SMTP operational sender, DNS, delivery policy and Mailpit ownership remain
    infrastructure decisions.

## 14. M5.3.4 prerequisites

Before any next milestone or operational cutover:

- approve the operational Fastify catalog/workflow mode;
- define external secret and backup-key custody;
- produce a source inventory and operator-approved university item manifest;
- decide whether the imported items should remain unpublished until manual
  review (the importer default is yes);
- approve the one-writer handover and session continuity policy;
- approve exact Traefik route activation and rollback ownership;
- verify operational backup/restore and RPO/RTO;
- reconcile public discovery URLs with `store.prg32.dream.test` and
  `api.prg32.dream.test`;
- repeat the full pre-cutover runbook with real operator approvals.

## 15. Final acceptance

M5.3.3 is accepted for its authorized scope because:

- the future two-service deployment contract is represented by one validated
  template;
- the template preserves the required store/API origins and external Dream
  integration boundaries;
- no real secret or operational key is embedded;
- the importer uses bounded explicit source modes;
- dry-run performs no canonical writes;
- authorized synthetic import uses the canonical staging/workflow boundary;
- imported content remains unpublished by default;
- retry, hash, duplicate, path, symlink, size and remote-origin controls are
  tested;
- all backend, frontend, Python, Compose, candidate build and disposable E2E
  checks passed;
- no operational routing, data, Compose, Dream service or Flask behavior was
  changed.

This acceptance does not authorize operational deployment, real university
data import, cutover, Flask removal, M5.3.4 or any later milestone.
