# PRG32 Cartridge Store — M5.2f operational handover readiness

Date: 2026-10-14  
Status: **GO for planning/readiness evidence; NO-GO for operational cutover and Flask retirement**

## 1. Executive result

M5.2f rebuilt the route and ownership inventory from the current Flask and
Fastify source, identified the remaining canonical-storage integration gates,
and produced a dependency-ordered handover plan. It does not switch routing,
start a canonical operational writer, modify Compose, remove Flask, or touch
operational data.

The machine-readable report is emitted by:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm --dir backend run readiness:report
```

Its ABI is `prg32-operational-handover-readiness-1.0`. The report is static,
source-backed and developer-only; it has no HTTP route and no runtime startup
integration.

## 2. Evidence boundary and baseline

The inventory used the current source files, a disposable Flask `url_map`
inspection, Fastify route registration modules, `backend/src/storage-v2/`, the
M5.2d/e evidence, the current `docker-compose.yml`, and the sibling `../PRG32`
repository read-only. No operational database, cartridge store, Docker
container/volume, external Dream Traefik, Authentik/provider, or `../PRG32`
file was modified.

The verified canonical tuple remains schema `2`, storage layout `2`,
publication journal `1`, backup format `3`. The current Compose file expands
to seven services and six profiles, has no named Docker volumes, and uses the
external `dream_edge` network by default. The public host contracts remain
`store.prg32.dream.test` and `api.prg32.dream.test`.

## 3. Route ownership inventory

The complete grouped inventory is executable data in
`backend/src/readiness/inventory.ts`. It covers discovery; catalog, version,
architecture, media and downloads; legacy Jinja/PWA pages; local auth and
tokens; generic OIDC/SAML; publishing; review; metrics/runs/exports; scores;
statistics; administration/settings/assets; federation administration;
backup/restore; multiplayer; health; mDNS; and the intentionally absent public
storage-v2 API.

| Contract family | Current owner | Fastify evidence | Classification | Main blocker |
| --- | --- | --- | --- | --- |
| Discovery/catalog/media/download | Flask | Read-only routes and M5.2d differential projection | `ISOLATED_READY` | public ownership and download telemetry writes |
| Legacy HTML/PWA/admin pages | Flask | Next page tree is separate | `LEGACY_DEPENDENT` | Jinja/page parity and removal decision |
| Local auth/session/token | Flask | `backend/src/auth/routes.ts` | `PARTIAL` | incompatible cookies and operational writer |
| Generic OIDC/SAML | Flask public adapter plus isolated Fastify implementation | `backend/src/oidc/`, `backend/src/saml/` | `PARTIAL` | callback/session continuity and external-provider acceptance |
| Publishing/submission | Flask | `backend/src/submission/` | `PARTIAL` | publication ownership and promotion recovery |
| Review/approval | Flask | `backend/src/review/` | `PARTIAL` | live review state and publication parity |
| Metrics/runs/samples | Flask | `backend/src/metrics/` | `PARTIAL` | firmware write ownership and reconciliation |
| Scores/leaderboard | Flask | `backend/src/scores/` | `PARTIAL` | score writer and rate-limit continuity |
| Statistics | Flask | `backend/src/stats/` | `ISOLATED_READY` | telemetry source remains Flask-owned |
| Admin/settings/assets | Flask | `backend/src/admin/`, `settings/` | `PARTIAL` | shared DB ownership and UI parity |
| Federation administration | isolated Fastify writer | `backend/src/federation/admin-routes.ts` | `ISOLATED_READY` | not operational public owner |
| Backup/restore | Flask operational route; Fastify isolated route/tooling | `backend/src/backup/`, `storage-v2/backup.ts` | `PARTIAL` | v3 operational cryptography, retention and maintenance window |
| Multiplayer/WebSocket | Flask public; Fastify isolated relay is registered | `backend/src/multiplayer/routes.ts` | `PARTIAL` | external routing and live firmware acceptance |
| mDNS | Flask | `cartridge_store/mdns.py` | `MISSING` | Fastify lifecycle is not implemented/verified |
| Public storage-v2 routes | none | no route registration | `MISSING` | explicitly deferred until operational ownership gate |

The earlier M5.2d text that described Fastify multiplayer as absent is a
historical snapshot. Current source evidence shows an isolated Fastify
WebSocket route; that is not evidence of public or operational ownership.

## 4. Canonical storage integration gaps

M5.2d proves disposable read projection and compatibility. M5.2e proves
disposable v3 backup/restore and rollback rehearsal. Neither changes the live
Flask database/filesystem boundary. Before canonical storage can become an
operational owner, the following gates must pass:

1. Freeze and inventory the unchanged Flask source/database/filesystem.
2. Migrate to a fresh canonical target and independently verify every
   relationship, object and private staging byte.
3. Reconcile download telemetry, scores, runs and samples with explicit
   unmappable-event policy.
4. Verify pending/rejected submissions and review history without promotion.
5. Prove publication journal recovery and object promotion with one writer.
6. Run the verified backup-v3 procedure with approved confidentiality,
   authenticity, key custody and retention controls.
7. Register only one public writer after all route-family gates pass.

No public storage-v2 route is registered by this milestone.

## 5. Authentication and session decision

The approved decision is controlled browser re-login at handover. Flask's
signed `session` cookie is not translated into Fastify's
`prg32_ts_session`; attempting to accept both as equivalent would create an
unverified security and ownership boundary. Existing bearer/API tokens remain
the compatibility path and must be verified against the final operational
token tables before switching token-protected firmware clients.

OIDC/SAML is a required final Fastify capability, implemented generically for
external providers. The external provider is outside this repository and is
represented by the user's `sso.dream.test` arrangement; no provider
credentials are stored in this report or Compose file, and no Authentik-
specific assumptions are introduced. The Fastify protocol implementation and
administration tests are isolated evidence only. Browser callback, identity
mapping, session creation, logout, failure, and rollback behavior through the
external provider remain open gates. No browser SSO acceptance is claimed,
and OIDC/SAML must not be removed as part of Flask retirement.

## 6. Publication, review and telemetry blockers

Fastify has isolated submission, review and canonical publication services.
The live Flask service still owns pending submissions, review decisions,
published files and download-event side effects. A handover must define one
writer for each of these domains and verify recovery after process failure.

Metrics and scores have compatible Fastify route modules and tests, but the
M5.2d gate was read-only. It does not prove live write parity. The cutover
plan therefore treats score writes, metrics ingestion, run completion,
download telemetry and exports as separate reconciliation gates. Anonymous
firmware behavior and owner/admin export authorization must remain unchanged.

## 7. Firmware, WebSocket and mDNS readiness

The firmware-facing discovery, catalog, binary/media, score, metrics and
multiplayer contracts remain owned by Flask until a live endpoint test is
accepted. The Fastify WebSocket route uses the same `/api/multiplayer` path
and protocol shape in isolation, but Traefik upgrade handling, reconnect
behavior, authentication, room limits and firmware runtime acceptance have
not been verified through the public origin.

The canonical constants remain `_prg32store._tcp.local`, discovery ABI
`prg32-store-discovery-1.0`, port `5080` by default, and architectures
`esp32c6`/`qemu`. Flask still owns mDNS. Fastify must implement failure-
tolerant registration and deregistration before Flask retirement.

## 8. Backup-v3 operationalization blockers

M5.2e v3 is developer-only, disposable, quiesced and plaintext. It provides
integrity checks, not authenticity. Operational use requires an approved
encrypted archive format/key lifecycle, secret injection outside the archive,
key custody and rotation, retention/deletion policy, access audit, monitoring,
restore maintenance window, and a completed restore drill against a final
canonical snapshot. The developer-only backup tool must not be exposed as an
operational HTTP route by this milestone.

## 9. Single-writer handover protocol

The protocol is fail-closed:

1. Announce the maintenance window and stop accepting new legacy writes.
2. Verify Flask source/database/filesystem immutability and complete inventory.
3. Produce and independently verify the canonical target and backup.
4. Start exactly one canonical writer on the verified target.
5. Verify health, auth/session decision, catalog, publication, review,
   telemetry, scores, metrics, WebSocket, mDNS and both public origins.
6. Switch routing and record the ownership timestamp and artifact hashes.
7. Keep Flask data available read-only or offline for the rollback window.
8. On abort, quiesce the canonical writer first; never start Flask as a second
   writer while Fastify is still accepting writes.
9. Reconcile post-switch writes before deciding between accepted data loss,
   export/reconciliation, or forward fix.

Abort conditions include source mutation, missing/corrupt referenced object,
unfinished journal, failed authentication continuity, any second writer,
unverified public WebSocket/mDNS, telemetry mismatch, backup verification
failure, or a missing rollback decision.

## 10. Compose readiness

The current seven-service/six-profile topology and the future two-application
target are documented in `85-docker-compose-simplification-plan.md`. The
target remains one Fastify service plus one Next.js service on the external
Dream Traefik network, preserving `store.prg32.dream.test`,
`api.prg32.dream.test`, `/api` behavior, and WebSocket routing. Authentik/generic
OIDC/SAML remains external. No Compose file, label, network, volume, image or
container was changed in M5.2f.

## 11. Decision

- M5.2f readiness planning: **GO**.
- Operational Fastify ownership/cutover: **NO-GO**.
- Flask retirement: **NO-GO**.
- Compose simplification: **NOT AUTHORIZED in M5.2f**.

The next implementation milestone is **M5.2g — operational canonical target
integration and pre-cutover rehearsal**, requiring separate authorization and
an approved maintenance window. It must close the writer, session, telemetry,
publication, WebSocket, mDNS and backup operational gates before any routing
switch.
