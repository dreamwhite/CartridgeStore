# M5.2g.10 — Integrated Pre-Cutover Validation & Legacy Retirement Readiness

Date: 2026-10-14

## Executive result

The isolated two-service candidate was built and exercised with real Fastify and
Next.js containers, a synthetic migrated canonical root, and disposable
encrypted backup/restore roots.

Milestone decision: **PARTIAL GO for disposable candidate integration**.

Operational cutover and Flask retirement remain **NO-GO**. No operational Compose
project, persistent volume, database, route, Traefik configuration,
authentication provider, or ../PRG32 file was changed.

The result is partial because generic OIDC/SAML HTTP boundaries were exercised,
including provider administration, SAML metadata/login initiation, and stable
OIDC failure handling, but a real external IdP callback and the Dream Traefik
edge were not exercised. Those require an authorized external integration
window and must not be inferred from disposable tests.

## Scope and safety boundary

The candidate used deploy/candidate/compose.yaml and contains exactly two
application services:

| Service | Responsibility | Persistent data |
| --- | --- | --- |
| fastify | TypeScript API, canonical SQLite writer, object storage, WebSocket relay | Explicit disposable bind mount at /data/canonical |
| next | Next.js storefront and HTTP proxy to Fastify | None |

The project network is private and candidate-specific. Host ports are loopback
only. No external network, named volume, operational bind mount, Flask/Python
service, nginx, legacy writer, Authentik service, or Traefik service is part of
the candidate topology.

The canonical fixture came from the existing M5.2d disposable harness. It
included published catalog versions, artifact/media objects, private staging,
compatible users/groups, scores, runs/samples, download telemetry, migration
metadata, and a pending submission. The legacy source fixture was not an
active runtime data source.

## Candidate runtime verification

- Local Node.js: v24.20.0, selected with nvm use 24.
- Candidate containers use Node 24 slim, multi-stage production images.
- Fastify and Next readiness reported the canonical database, storage, and
  writer lease as available.
- Restarting Fastify after publication and backup succeeded.
- Stopping Fastify caused the Next proxy to fail closed with HTTP 500; starting
  Fastify again restored readiness and catalog access.
- The active data root was <candidate-root>/store.sqlite plus canonical objects,
  staging, journal, and recovery material.
- Runtime image inspection found no Python executable, Flask files, or
  index.json. Python/build tooling exists only in the Fastify dependency build
  stage for native package compilation.
- Candidate mDNS was explicitly disabled.

The source tree still contains legacy and migration modules for compatibility,
historical audit, and disposable migration tests. Those modules are not active
candidate data sources; candidate catalog, workflow, auth, telemetry, and
readiness use the canonical root.

## Defects found and corrected

The real-container exercise found and corrected these defects:

1. Next pages at /auth/login and /auth/register shadowed POST API calls.
   Candidate browser-auth calls now use an unambiguous /api/auth/* proxy
   namespace. OIDC/SAML/provider paths retain their /api/auth/oidc,
/api/auth/saml, and /api/auth/providers contracts.
2. Candidate federation configuration lacked an explicit public origin. The
   candidate now defaults to https://store.prg32.dream.test, with a disposable
   environment override. Provider redirect/ACS validation remains HTTPS and
   origin-bound.
3. The staging audit required files for already promoted artifacts after a
   successful publication. It now requires bytes only for staged and validated
   rows; promoted/quarantined history remains in SQLite and its final location
   is audited separately.
4. Backup inventory included promoted staging rows whose private bytes had
   correctly moved during publication. Backup and independent verification now
   inventory only recoverable staged/validated submission bytes.
5. The Next health check used loopback inside the container although the
   standalone server was bound to the container hostname. It now probes the
   container hostname reliably.
6. Discovery proxied through Next exposed internal fastify:5090 URLs. Candidate
   mode now builds discovery URLs from the configured public origin; operational
   request-host behavior is unchanged.

Each correction was followed by targeted tests and a rebuilt candidate image.

## HTTP integration coverage

### Catalog and binary compatibility

Verified through Fastify direct HTTP and the Next proxy:

- Catalog listing, pagination, search, detail, version, and architecture.
- Icon, screenshot, colophon, and binary download.
- ETag conditional request returning 304.
- Byte range request returning 206 with a 16-byte range from a 936-byte
  synthetic artifact.
- Stable JSON error envelope for an unknown cartridge.

The initial fixture exposed two catalog entries; after the real publish/review
flow, the candidate exposed three. The source fixture remained disposable.

### Authentication, CSRF, tokens, RBAC, and groups

Verified through Next-to-Fastify HTTP proxy calls:

- CSRF session issuance and Set-Cookie preservation.
- Disposable admin bootstrap, admin login, and publisher login.
- /auth/me session resolution.
- CSRF-protected admin user creation and group creation.
- Publisher role authorization and admin listing.
- API token creation with one-time token response.
- Anonymous rejection for protected metrics detail/export routes.

No real credential, session, API token, password hash, or production identity
was included in this report.

### Publishing and review

A synthetic ZIP bundle was uploaded through the Next proxy, producing a real
pending submission. The admin reviewed and verified it through canonical HTTP
routes. The resulting publication was visible through canonical catalog detail
and download routes. A candidate restart after publication succeeded.

### Scores, metrics, and statistics

Verified public score listing, CSRF-protected score write, firmware-shaped run
ingestion, protected run detail/CSV/Markdown authorization, download
statistics, per-game statistics, score statistics, run statistics, and the
metrics endpoint discovery response. Existing firmware request/response tests
were included in the full backend and Python suites.

### Generic OIDC/SAML boundaries

The candidate admin API created synthetic generic OIDC and SAML provider
records without Authentik-specific assumptions. Provider listing was visible
through the Next proxy.

Verified:

- SAML metadata returned 200 with application/samlmetadata+xml.
- SAML login initiation returned a correlation cookie and an IdP redirect.
- OIDC reached the protocol boundary and returned stable 503
  oidc_provider_unavailable for the intentionally unreachable synthetic IdP.
- Invalid/missing provider conditions remained JSON and did not expose raw
  exception strings.

Not verified:

- A callback from a live generic OIDC provider.
- A signed callback from a live generic SAML provider.
- Browser traversal through sso.dream.test or the external Dream Traefik edge.

The candidate has no Authentik-specific runtime dependency. The provider model
remains generic OIDC/SAML.

### Next.js pages and proxy behavior

The actual Next container returned successful responses for storefront, catalog
detail, login/register, account, workspace, publish, review, scores,
statistics, runs, profile, admin, federation, documentation, manifest, static
assets, health, and readiness routes.

Cookie, CSRF, JSON, streaming download, ETag, and range behavior were checked
through the proxy. The candidate proxy failure test returned HTTP 500 while
Fastify was stopped, then recovered after Fastify restart.

### WebSocket, discovery, and firmware constants

The direct TCP WebSocket endpoint accepted a bearer-authenticated synthetic
join and returned a welcome message. Multiplayer status reported the
authenticated relay state.

The discovery document returned ABI prg32-store-discovery-1.0, HTTPS URLs under
store.prg32.dream.test, and a WSS multiplayer URL under the same host. mDNS
was disabled; no LAN advertisement was claimed. The firmware repository was
inspected read-only and not modified.

## Backup and restore

Encrypted backup-v4 was exercised against disposable roots only.

Candidate-root round trip:

- Backup completed with an encrypted archive of 495,974 bytes.
- Independent verification recomputed archive and object/database hashes.
- Restore completed into a new empty disposable root.
- Restored database was present and storage_metadata.state was ready.
- Restored immutable object files: 13.

A fresh canonical fixture round trip also completed with a 395,515-byte
encrypted archive. The key registry stayed outside the archive and was not
logged. Backup correctly refused to run while the candidate writer lease was
held; after candidate-only quiescence it completed.

Interrupted backup, truncated/corrupt archive, unsafe archive, and interrupted
restore behavior is covered by the storage-v2 backup suites and passed in the
targeted and full runs.

## Fault and recovery evidence

Covered by containers and process-level tests:

- Fastify stop/start and writer-lease reacquisition.
- Next proxy behavior while Fastify is unavailable.
- Restart after completed publication and backup.
- Backup refusal without writer quiescence.
- Backup quarantine/no-completion-marker behavior on injected failure.
- Restore non-ready state after injected extraction/verification failure.
- Corrupt and truncated archive rejection.
- Source fixture immutability and canonical relationship verification.

No partial target was treated as ready and no partial archive was treated as
complete.

## Legacy dependency and retirement assessment

| Domain | Candidate owner | Result |
| --- | --- | --- |
| Catalog/media/download | Fastify canonical read | Verified disposable HTTP |
| Auth/session/CSRF/API tokens | Fastify canonical writer | Verified disposable HTTP |
| Publishing/review | Fastify canonical workflow | Verified disposable HTTP |
| Scores/metrics/statistics | Fastify canonical SQLite | Verified disposable HTTP |
| Multiplayer | Fastify WebSocket relay | Direct TCP verified |
| Storefront/routes | Next.js | Real container routes verified |
| OIDC/SAML protocol | Fastify generic adapters | Boundary verified; external callback open |
| mDNS | Fastify disabled in candidate | Not claimed operationally |
| Public edge/TLS | External infrastructure | Not exercised |

Flask remains the operational owner. Open gates are live route/data ownership,
legacy-to-canonical delta reconciliation, session continuity or controlled
re-login, external OIDC/SAML callbacks, Dream Traefik/TLS, production backup
key custody/retention, single-writer traffic control, monitoring, and rollback
policy.

## Docker topology assessment

The candidate topology has exactly two services and one private bridge network,
explicit disposable bind-mounted storage, no anonymous volumes, and multi-stage
Node 24 slim images. The operational Compose file and existing service/profile
topology were inspected read-only and remained unchanged.

The candidate is a future hypothesis, not an operational deployment. Flask,
auth-writer, auth-writer-init, auth-writer-edge-proxy, existing Traefik, and
external generic authentication infrastructure must not be removed until the
ownership and rollback gates close.

Smoke measurements after readiness, not load-test evidence:

- Fastify: approximately 274.6 MiB resident, 1.29% CPU.
- Next.js: approximately 53.48 MiB resident, 0.00% CPU.
- Direct readiness curl: approximately 0.01 s.
- Next proxy catalog curl: approximately 0.01 s.

## Commands and results

Executed with Node 24 selected through nvm:

- pnpm --dir backend run typecheck — PASS.
- pnpm --dir backend run lint — PASS.
- pnpm --dir backend run test — PASS, 45 files and 225 tests.
- pnpm --dir backend run build — PASS.
- pnpm --dir frontend run typecheck — PASS.
- pnpm --dir frontend run lint — PASS.
- pnpm --dir frontend run test — PASS, 21 files and 59 tests.
- FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build — PASS.
- SECRET_KEY=synthetic ./.venv313/bin/python -m pytest -q — PASS, 64 tests.
- python3 -m py_compile app.py cartridge_store/*.py — PASS.
- docker compose --profile dev config --quiet — PASS.
- docker compose -f deploy/candidate/compose.yaml config --quiet — PASS.
- git diff --check — PASS.

Additional targeted suites passed:

- Candidate runtime: 6 tests.
- Canonical read HTTP: 4 tests.
- Canonical workflow HTTP: 5 tests.
- Storage backup-v3: 8 tests.
- Storage encrypted backup-v4: 5 tests.
- Discovery: 7 tests.
- Combined targeted run: 16 tests, all passed.

Candidate images were built and run:

- prg32-cartridge-store-fastify:candidate
- prg32-cartridge-store-next:candidate

No operational image, container, network, volume, or builder cache was removed.

## Remaining risks and P0/P1 gates

P0 before operational cutover:

- Verify live generic OIDC/SAML callbacks through the configured provider and
  real sso.dream.test/Traefik edge.
- Decide Flask/Fastify session continuity and controlled re-login.
- Freeze writers, reconcile post-snapshot deltas, and prove one-writer traffic
  ownership for every write domain.
- Verify production TLS, cookie flags, proxy headers, WebSocket upgrades, and
  store.prg32.dream.test/api.prg32.dream.test routing.
- Establish production backup key custody, restore authorization, retention,
  monitoring, and rollback data-loss policy.

P1 after P0:

- Run representative load/failure tests with production-like limits.
- Reassess image size and memory under realistic catalog/object volume.
- Complete legacy route/HTML retirement inventory and remove compatibility
  services only after ownership evidence is accepted.

## Decision and next milestone

- Disposable M5.2g.10 candidate integration: **PARTIAL GO**.
- Operational migration/cutover: **NO-GO**.
- Flask retirement: **NO-GO**.
- M5.2g.11: not started.
- M6.3d.2h.12: not started.

The next milestone should be a separately authorized external-edge and
provider-interoperability gate, followed by controlled operational ownership
cutover planning. Do not remove Flask or modify operational Compose before
those gates are explicitly accepted.

