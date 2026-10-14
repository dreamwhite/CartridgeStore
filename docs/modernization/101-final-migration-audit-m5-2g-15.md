# PRG32 Cartridge Store — M5.2g.15 Final Migration Audit

Date: 2026-10-14  
Scope: source audit, disposable verification and pre-cutover readiness only

## 1. Executive result

The TypeScript/Fastify + Next.js candidate is technically coherent for the
disposable/candidate scope exercised by this milestone. The backend and
frontend suites pass, the candidate two-service Compose topology starts with
healthy services, canonical storage read/write workflows pass synthetic
verification, and the browser checks pass against the isolated candidate.

The operational handover remains **NO-GO**. Flask retirement remains
**NO-GO**. No public routing, operational database, Docker service, Traefik
configuration, Authentik configuration, DNS record or production data was
changed or accessed. M5.2g.16 and M6.3d.2h.12 were not started.

The principal unresolved cutover blocker is generic federation configuration:
legacy OIDC/SAML settings are preserved as legacy settings, but the migration
does not invent canonical `federation_providers` rows, secret references,
provider identifiers or redirect registrations. External identity mappings
are migrated only when a unique matching canonical provider already exists.
This is the correct fail-closed behavior, but it means operational federation
ownership has not been proven.

## 2. Scope and safety boundary

This audit used source inspection, synthetic/disposable roots, isolated
candidate containers, local protocol fixtures and the existing test suites.
The companion repository `../PRG32` was inspected read-only. Its only observed
changes are pre-existing untracked `docs/quickstart-qemu.md` and `run-qemu`;
this work did not modify that repository.

The following were deliberately not performed:

- no login to `sso.dream.test` or any real identity provider;
- no contact with real Traefik, DNS or operational origins;
- no POST/PATCH/PUT/DELETE against an external service;
- no operational container restart, removal or Compose mutation;
- no access to operational SQLite or cartridge volumes;
- no deployment, commit or push.

Accordingly, all external infrastructure status in this report is
`NOT_VERIFIED_OPERATIONAL`, even where an isolated equivalent passed.

## 3. Classification policy

Each capability is classified independently:

- `IMPLEMENTED_AND_VERIFIED`: implemented and verified in the applicable
  disposable, unit, integration or browser scope;
- `IMPLEMENTED_NOT_VERIFIED`: implementation exists but the required proof
  for the relevant boundary was not run;
- `PARTIALLY_IMPLEMENTED`: meaningful implementation exists, but parity or
  ownership is incomplete;
- `LEGACY_ONLY`: still owned by Flask/legacy storage or retained only for
  compatibility;
- `MISSING`: no implementation was found for the required boundary;
- `NOT_APPLICABLE`: intentionally outside this milestone;
- `NOT_VERIFIED_OPERATIONAL`: isolated evidence exists, but operational
  infrastructure or data was not observed.

## 4. Route and capability audit

| Capability | Fastify/Next state | Classification | Evidence or blocker |
|---|---|---|---|
| Catalog listing, detail, architecture, media, download | Canonical Fastify storage-v2 routes and Next.js catalog/detail pages | `IMPLEMENTED_AND_VERIFIED` in disposable scope; `NOT_VERIFIED_OPERATIONAL` externally | Contract, canonical HTTP, differential and browser checks; no public origin probe in this milestone |
| Discovery document and mDNS contract | Fastify discovery plus isolated mDNS/networking implementation | `IMPLEMENTED_AND_VERIFIED` synthetically; `NOT_VERIFIED_OPERATIONAL` | Firmware contract and discovery tests; LAN/Dream mDNS was not contacted |
| Local authentication, sessions, CSRF and logout | Canonical Fastify auth and Next.js account/login flows | `IMPLEMENTED_AND_VERIFIED` locally; `PARTIALLY_IMPLEMENTED` for handover | Local browser/CSRF tests pass; Flask signed cookies are not portable and controlled re-login is required |
| Generic OIDC | Provider-id Fastify flow with discovery, PKCE, state, nonce, issuer/audience and JWKS checks | `IMPLEMENTED_NOT_VERIFIED` operationally | Synthetic callback tests pass; provider configuration/secrets are not automatically migrated |
| Generic SAML | Provider-id Fastify flow with signed response/assertion and replay checks | `IMPLEMENTED_NOT_VERIFIED` operationally | Synthetic signed callback tests pass; real IdP metadata, certificates and registration were not verified |
| Publishing and submission workflow | Canonical submission, staging, review and publication journal | `IMPLEMENTED_AND_VERIFIED` in disposable scope; `PARTIALLY_IMPLEMENTED` for ownership | HTTP workflow and interruption recovery pass; operational writer ownership remains Flask-owned until cutover |
| Review and approval | Fastify review routes and canonical publication workflow | `IMPLEMENTED_AND_VERIFIED` synthetically; `PARTIALLY_IMPLEMENTED` operationally | Review tests pass; legacy review history and live writer transfer remain open |
| Scores | Canonical Fastify score routes and database | `IMPLEMENTED_AND_VERIFIED` in isolated fixtures; `NOT_VERIFIED_OPERATIONAL` | Score tests and canonical telemetry tests pass; firmware write reconciliation is not proven |
| Runs, samples and metrics | Canonical Fastify metrics routes, limits and exports | `IMPLEMENTED_AND_VERIFIED` in isolated fixtures; `NOT_VERIFIED_OPERATIONAL` | Metrics tests pass; live firmware ownership, volume and reconciliation are open |
| Statistics and profiles | Fastify statistics/profile routes and Next.js pages | `IMPLEMENTED_NOT_VERIFIED` for complete browser parity | Unit/integration coverage exists; not every legacy user-facing path was browser-exercised |
| Multiplayer HTTP/WebSocket | Fastify relay on the application port | `IMPLEMENTED_AND_VERIFIED` synthetically; `NOT_VERIFIED_OPERATIONAL` | Differential and authenticated WSS/relay tests pass; real edge termination was not observed |
| Administrative API | Fastify settings, users, groups, roles, catalog and federation administration | `PARTIALLY_IMPLEMENTED` | API/security tests pass; complete legacy HTML administration parity and operational ownership are not accepted |
| Backup and restore | Storage-v2 backup-v3 payload and encrypted backup-v4 envelope | `IMPLEMENTED_AND_VERIFIED` for disposable scope | Backup-v4, restore, corruption and recovery tests pass; operational key custody/retention remains open |
| Legacy Jinja/PWA HTML, setup and static routes | Flask route family remains present; Next.js has modern equivalents and selected compatibility mappings | `LEGACY_ONLY` / `PARTIALLY_IMPLEMENTED` | Exact URL and rendered-HTML parity is not complete; Flask cannot be retired on this evidence |
| Public `/api/storage-v2/*` surface | Not registered intentionally | `NOT_APPLICABLE` | Storage-v2 is an internal canonical implementation/tooling boundary, not a public API contract |

The Flask route inventory contains 77 normalized paths across catalog, HTML
administration, authentication, publishing, review, telemetry, statistics,
multiplayer and discovery. Fastify covers the canonical API families, but
route ownership is not equivalent to proving every legacy HTML/static URL,
cookie behavior or production reverse-proxy mapping.

## 5. Canonical data and migration audit

The verified canonical version tuple is:

| Field | Value |
|---|---:|
| Canonical schema | 2 |
| Storage layout | 2 |
| Publication journal | 1 |
| Backup payload format | 3 |
| Encrypted backup envelope | 4 |

The encrypted backup-v4 envelope wraps the approved storage-v2 backup-v3
payload. These are distinct versions and must not be conflated during
handover.

| Data domain | Canonical handling | Classification |
|---|---|---|
| Cartridges, releases and architecture mappings | Canonical SQLite relationships plus immutable filesystem objects | `IMPLEMENTED_AND_VERIFIED` in disposable migration and differential fixtures |
| Artifact, media and site-asset bytes | Inventory by reference, kind, size and SHA-256; exact bytes restored | `IMPLEMENTED_AND_VERIFIED` in disposable scope |
| Users and compatible account fields | Common legacy fields copied; `disabled_at` now represented in canonical schema and migration verification | `IMPLEMENTED_AND_VERIFIED` in synthetic migration scope |
| Groups and memberships | Compatible tables copied and asserted | `IMPLEMENTED_AND_VERIFIED` in synthetic migration scope |
| API tokens | Token rows and hashes are preserved as sensitive database data; values are not written to manifests/logs | `IMPLEMENTED_AND_VERIFIED` in synthetic migration scope |
| Settings | Compatible settings copied, including Unicode values | `IMPLEMENTED_AND_VERIFIED` in synthetic migration scope |
| Scores, runs and samples | Canonical tables and relationships exercised by telemetry fixtures | `IMPLEMENTED_AND_VERIFIED` in disposable scope; live ownership open |
| Download events and migration exceptions | Canonical event/exception records are migrated and verified | `IMPLEMENTED_AND_VERIFIED` in disposable scope; operational reconciliation open |
| Submissions and private staging | Submission identity/status/owner/reviewer, staged hashes and private paths are preserved; no pending submission is promoted during restore | `IMPLEMENTED_AND_VERIFIED` in synthetic migration and restore scope |
| Review decisions and publication journal | Canonical journal material and incomplete-operation evidence are retained; incomplete operations do not auto-publish | `IMPLEMENTED_AND_VERIFIED` in disposable recovery tests |
| OIDC/SAML provider configuration and secrets | No unsafe automatic transformation from generic legacy settings; secret references require explicit canonical provisioning | `PARTIALLY_IMPLEMENTED`, cutover blocker |
| Sessions and signed cookies | Not copied across Flask and Fastify session formats | `IMPLEMENTED_NOT_VERIFIED` for operational continuity; controlled re-login required |

The migration verification change made compatible-table comparison column-aware:
source columns common to the target are compared, so additive canonical
columns such as `users.disabled_at` do not create a false mismatch while still
detecting differences in shared data. The disposable migration fixture now
covers disabled users, groups, memberships, API token metadata, Unicode
settings, pending/rejected/approved submissions and a Unicode site asset.

## 6. Firmware and host contract audit

The companion `../PRG32` repository was inspected read-only. The following
contracts remain aligned:

- mDNS service type `_prg32store._tcp` and default port `5080`;
- discovery ABI `prg32-store-discovery-1.0`;
- metadata ABI `prg32-metadata-1.0`;
- colophon ABI `prg32-colophon-1.0`;
- physical architecture `esp32c6`;
- QEMU architecture `qemu`;
- catalog query shape `GET /api/games?limit=100`;
- architecture/version download selection used by the firmware store client.

The local firmware contract, discovery and storage differential tests pass.
This proves source-level and disposable compatibility, not DNS, TLS, edge
proxy or real-device reachability.

## 7. Authentication and federation findings

The Fastify federation implementation has a generic provider model rather than
an Authentik-specific provider. It supports OIDC and SAML protocol mechanics,
including bounded metadata/certificate behavior, state/nonce/PKCE or signed
assertion validation, replay protection and session rotation in synthetic
tests. The intended deployment provider remains external and generic; no
Authentik-specific assumption was introduced.

The migration boundary is deliberately conservative:

1. legacy generic provider settings are not sufficient evidence to construct a
   canonical provider ID, client secret reference, SAML certificate reference,
   redirect URI or issuer registration;
2. legacy `external_id`/`external_provider` user mappings migrate only when a
   unique configured canonical provider matches;
3. ambiguous or unconfigured mappings remain unresolved rather than being
   assigned to a guessed provider;
4. real provider setup and browser acceptance must be completed as a separate,
   authorized operational gate.

This leaves federation provisioning and identity continuity as a P0/P1
handover blocker. It is not safe to claim that existing user sessions will
survive the Flask-to-Fastify transition.

## 8. Next.js parity and workflow audit

The frontend includes modern routes/pages for catalog, game detail and media,
authentication/account, publishing/review/workspace, runs, scores, statistics,
profiles, documentation, administration, federation administration and PWA
assets. The compatibility layer maps selected legacy setup/auth/editor/profile
paths to modern destinations and retains an explicit legacy fallback path.

| Frontend area | Classification | Assessment |
|---|---|---|
| Public catalog/detail/download/media | `IMPLEMENTED_AND_VERIFIED` | Browser candidate checks pass |
| Local login/register/account/CSRF/logout | `IMPLEMENTED_AND_VERIFIED` | Browser candidate checks pass |
| OIDC/SAML callback UI | `IMPLEMENTED_NOT_VERIFIED` operationally | Synthetic provider callbacks pass; no real provider login was attempted |
| Publish/review/workspace | `IMPLEMENTED_NOT_VERIFIED` | Pages and API workflows exist; complete browser workflow is not the acceptance gate used here |
| Scores/runs/stats/profiles/docs/PWA | `IMPLEMENTED_NOT_VERIFIED` | Pages and API tests exist; full browser matrix remains incomplete |
| Admin/settings/users/groups/catalog/federation | `IMPLEMENTED_NOT_VERIFIED` | API/security tests exist; exact legacy HTML administration parity is open |
| Legacy Jinja/setup/editor/static URL parity | `PARTIALLY_IMPLEMENTED` / `LEGACY_ONLY` | Modern equivalents and redirects do not prove byte-for-byte or URL-complete parity |

## 9. Runtime and dependency audit

The candidate Compose file contains two application services:

- one Fastify backend service, built with a Node 24 multi-stage image;
- one Next.js frontend service, built with a Node 24 multi-stage image.

The candidate runtime images are Node-based and do not run a Flask/Python
service. The isolated candidate smoke built both images, started both services,
and received HTTP 200 from both readiness endpoints. The readiness payload
reported the database, canonical storage and writer lease as available.

Flask-specific compatibility code remains in the source tree for the
transitional and rollback boundary. The frontend also retains an explicit
legacy Flask proxy option; it is not selected by the standard candidate build.
This is intentional until cutover acceptance is complete.

An architecture deviation remains: `drizzle-orm` is present in the backend
dependency graph and is used by `backend/src/db/readonly.ts`, despite the
earlier “Drizzle ORM deferred” decision. It was not expanded in this
milestone. Before Flask retirement, either explicitly approve this use or
remove it in a separately authorized migration task.

## 10. Required handover sequence

The minimum safe handover remains a single-writer protocol:

1. authorize a maintenance window and freeze/quiesce legacy writes;
2. capture and independently verify the legacy snapshot and complete inventory;
3. migrate into a fresh canonical root;
4. verify relationships, object hashes, staging, journal state and all
   compatibility domains;
5. create and independently verify an encrypted canonical backup;
6. provision and verify federation providers and decide session continuity;
7. start exactly one canonical writer and prove all write domains;
8. switch public routing only after edge, TLS, WebSocket and mDNS gates pass;
9. observe the rollback window with explicit ownership and data-loss policy;
10. retire Flask only after the acceptance matrix is signed off.

No step above was executed against operational data or routing in this
milestone.

## 11. Remaining blockers

### P0 — blocks operational handover

- No authorized operational access or observation was performed, so the real
  `store.prg32.dream.test`, `api.prg32.dream.test` and `sso.dream.test`
  behavior is not verified.
- Generic OIDC/SAML provider configuration, secrets, certificates and
  redirect registrations have not been provisioned and reconciled in the
  canonical model.
- There is no operational single-writer ownership switch; Flask remains the
  legacy owner.
- Public routing, TLS termination, WebSocket forwarding and external edge
  behavior are not accepted from isolated tests alone.

### P1 — blocks Flask retirement or requires an explicit operational decision

- Firmware score, metrics, run/sample and download-event writes need a live
  reconciliation and ownership proof.
- Existing sessions/cookies require a controlled re-login or a separately
  approved continuity strategy.
- Backup key custody, rotation, retention, restore authorization and recovery
  exercises need an operational runbook.
- Legacy HTML/setup/admin/editor parity and deprecation scope are not fully
  accepted.
- Optional LDAP/legacy authentication deployment status needs an explicit
  decision.
- The Drizzle usage versus the deferred architecture decision needs closure.
- Post-cutover rollback must define whether writes are reconciled, explicitly
  lost, or handled by forward repair; restarting Flask alone is not a safe
  rollback guarantee.

## 12. Verification record

Commands executed in this continuation and their results:

| Command/check | Result |
|---|---|
| `source "$HOME/.nvm/nvm.sh" && nvm use 24` | PASS — Node `v24.20.0`; pnpm `12.5.1` |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 48 test files, 238 tests |
| `pnpm --dir backend run build` | PASS |
| targeted storage migration regression | PASS — 1 file, 4 tests |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 test files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `pnpm --dir frontend run test:e2e` | PASS — 5 tests |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| Python byte compilation | PASS |
| `docker compose --profile dev config --quiet` | PASS |
| candidate Compose config validation | PASS |
| isolated candidate image build and smoke | PASS — two healthy services; both readiness endpoints HTTP 200 |
| `git diff --check` | PASS |
| `git -C ../PRG32 diff --check` | PASS; companion worktree otherwise unchanged by this work |

The backend test output includes an existing diagnostic about an output path
being inside a snapshot; it did not fail the command and is not an operational
backup result.

No current-turn public infrastructure probe was run. Historical observations
in earlier milestone reports are not treated as M5.2g.15 operational evidence.

## 13. Files changed for M5.2g.15

The implementation correction and test expansion in this milestone are limited
to:

- `backend/src/db/schema.ts` — canonical `users.disabled_at` mapping;
- `backend/src/storage-v2/schema.ts` — compatible schema column;
- `backend/src/storage-v2/migration/verification.ts` — additive-column-aware
  compatible-table fingerprinting;
- `backend/tests/compatibility.test.ts` — schema mapping expectation;
- `backend/tests/storage-v2-migration.test.ts` — synthetic compatible-data,
  review-state and site-asset coverage;
- this report.

The repository contains substantial pre-existing dirty and untracked work from
earlier milestones. Those files were preserved and are not attributed to this
milestone. No generated `frontend/test-results` directory was retained.

## 14. Final decisions

| Decision | Result |
|---|---|
| Disposable canonical migration/read/write/backup evidence | `GO` within disposable scope |
| Candidate two-service runtime | `GO` for isolated candidate smoke |
| Public operational handover | `NO-GO` |
| Flask retirement | `NO-GO` |
| Real federation/session continuity | `NO-GO` / `NOT_VERIFIED_OPERATIONAL` |
| Operational backup/restore readiness | `NO-GO` until key custody, authorization and recovery policy are accepted |
| M5.2g.16 | Not started |
| M6.3d.2h.12 | Not started |

M5.2g.15 is therefore complete as a final pre-cutover audit, but it does not
authorize cutover. The next milestone must close the explicitly listed
operational gates; it must not treat the isolated candidate evidence as a
substitute for a controlled handover.
