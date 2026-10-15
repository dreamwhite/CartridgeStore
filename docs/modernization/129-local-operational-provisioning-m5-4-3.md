# PRG32 Cartridge Store — M5.4.3 Local Operational Provisioning & Acceptance

Decision: `M543_LOCAL_OPERATIONAL_ACCEPTANCE_GO`

Mandatory decisions:

- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

Assessment date: 2026-10-15

## 1. Executive summary

M5.4.3 provisioned a persistent, local-only Cartridge Store installation in
`.local/operational-m543/` and accepted it with the actual operational Node.js
24 images. The standalone project contains exactly two application services:
`fastify` and `next`.

The canonical SQLite root was initialized explicitly, the setup wizard created
the first synthetic administrator, local authentication and CSRF/RBAC were
verified, a synthetic cartridge was submitted/reviewed/published, firmware
metrics and scores were accepted, and state survived a controlled restart.

An encrypted authenticated backup-v4 was created, independently verified and
restored into a separate fresh root. The final restore preserved the published
release, a pending private submission and its staging bytes, administrator and
setup state, runs, samples and scores. The restored target passed SQLite and
canonical storage audits.

The installation is independent of Dream infrastructure. It is not attached to
Traefik, Authentik, Mailpit, `dream_edge`, `dream_mail`, public ports or public
routing. The production contract continues to reserve
`store.prg32.dream.test` and `api.prg32.dream.test`; this acceptance used
synthetic HTTPS origins to avoid touching the Dream environment.

## 2. Scope and safety

Performed:

- created one dedicated local provisioning root;
- generated synthetic local-only secret material;
- built and ran the existing operational Fastify and Next.js images;
- bootstrapped a fresh canonical storage-v2 root;
- completed first installation and local application acceptance;
- created and verified encrypted backup-v4 archives;
- restored into fresh local roots and independently audited them;
- ran controlled restarts of only the M5.4.3 Compose project;
- ran the requested regressions and Compose configuration checks.

Not performed:

- no Dream container, network, Traefik, Authentik, Mailpit, DNS, TLS or
  public route was changed or restarted;
- no legacy Flask data, transitional writer data or university content was
  read or migrated;
- no production secret or real provider credential was created or reused;
- no public cutover, Flask retirement, deployment, commit or push was done.

All persistent M5.4.3 writes were confined to the ignored local root below.

## 3. Baseline

The starting checkpoint was `8760f70f75251f47844dcd6fc18737ec94717ad7`.
The worktree already contained the untracked M5.3/M5.4 reports, standalone
deployment files, dependency artifacts and test results from prior authorized
work. They were preserved. No tracked source change was required by M5.4.3.

Node.js was selected explicitly with `nvm use 24` and reported `v24.20.0`;
pnpm reported `12.5.1`.

## 4. Local filesystem provisioning

Provisioning root:

```text
.local/operational-m543/
├── data/canonical/
├── secrets/
├── backups/
├── restore-tests/
└── runtime/
```

The path was absent before provisioning, is covered by the repository
`.gitignore` rule for `.local/`, contains no symlinks and is on the local
workspace filesystem. The root and its persistent subdirectories are mode
`0700`; the canonical SQLite/object root is not shared with Flask or any
transitional writer.

The root remained in place after acceptance for diagnosis and local use. It was
not reset or deleted.

## 5. Permissions and ownership

The generated key registry is mode `0600`, with a mode `0700` parent. Runtime
containers run as the non-root `node` user with a read-only root filesystem,
`no-new-privileges`, all Linux capabilities dropped and `unless-stopped`
restart policy. Only the canonical bind mount is writable by the application.

No secret values, passwords, tokens or private authentication payloads were
printed or included in this report.

## 6. Local secret registry

The existing secret-registry format was used; no new cryptographic format was
introduced.

- Registry file: `.local/operational-m543/secrets/key-registry.json`
- Local Compose environment: `.local/operational-m543/secrets/standalone.env`
- Synthetic key identifier: `m543-local-backup-key`
- Backup cipher: existing AES-256-GCM backup-v4 implementation
- Registry permissions: verified `0600`

Synthetic session, bootstrap, canonical-read and canonical-write values were
generated for this installation only. They are persisted in the ignored local
`standalone.env` file with mode `0600` so the installation can be restarted
without regenerating its identity/session configuration. They were not reused
from Dream or Authentik.

## 7. Standalone Compose runtime

The existing `deploy/standalone/compose.yaml` was used without activating the
Dream overlay. Compose project: `prg32-m543-local`.

| Service | Image | Persistence | Network |
|---|---|---|---|
| `fastify` | `prg32-cartridge-store-fastify:standalone` | bind-mounted `/data/canonical` | internal `app_private` |
| `next` | `prg32-cartridge-store-next:standalone` | none | internal `app_private` |

There were exactly two application containers. The network is marked
`internal: true`; both containers had no published host ports and no Traefik
labels. The Dream overlay was rendered separately for compatibility but never
activated. Next reached Fastify through the internal service name and its
`/api/games` proxy returned HTTP 200.

## 8. HTTPS acceptance boundary

The operational runtime retained secure-cookie and HTTPS-origin configuration.
No global security control was disabled. Because the standalone base contract
does not publish ports and no test-only TLS edge was added, browser-level TLS
acceptance against the isolated containers was not claimed.

Internal HTTP contract checks, setup security, local authentication, CSRF,
canonical workflows, proxy behavior and runtime security configuration were
verified. Real Dream TLS, DNS, Traefik and generic OIDC/SAML provider login
remain separate integration gates.

## 9. Canonical storage bootstrap

The explicit operational bootstrap command initialized only:

```text
.local/operational-m543/data/canonical/
```

The bootstrap output reported:

```text
application=prg32-cartridge-store
schema_version=2
storage_layout_version=2
publication_journal_version=1
backup_format_version=3
state=ready
```

Fastify readiness then reported database and canonical storage available with
the writer lease held. No legacy SQLite, `index.json` or university content was
copied.

## 10. First installation

The setup wizard was executed against the fresh root with synthetic identity
data. Verified steps:

- infrastructure readiness;
- one-time bootstrap authorization;
- setup session and CSRF;
- first administrator and password hash creation;
- initial `editors` group/RBAC state;
- store, registration, security and review settings;
- SMTP disabled;
- generic OIDC disabled;
- generic SAML disabled;
- WebAuthn disabled;
- mDNS disabled;
- final review and completion.

The final state was `INSTALLATION_COMPLETE`. Reusing the bootstrap token after
completion returned HTTP 409 and did not create a second installation.

## 11. Local authentication

The local acceptance exercised:

- anonymous CSRF issuance;
- failed local login returning HTTP 401;
- successful local administrator login;
- authenticated `/auth/me`;
- administrator-protected API reads;
- mutation rejection without CSRF returning `csrf_failed`/HTTP 403;
- successful CSRF-protected administrative mutation;
- logout and session invalidation.

The authenticated session and administrator survived the controlled restart.
No real Authentik credential or external identity was used.

## 12. Catalog/workflow acceptance

The initial catalog listing returned HTTP 200 with no published content. A
synthetic `org.m543.acceptance` cartridge, version `1.0.0`, was then:

1. uploaded through `/api/publish/bundle`;
2. retained as a pending submission;
3. reviewed by the local `editors` group;
4. published through the canonical workflow;
5. read through catalog detail, download and icon routes.

The download and icon responses returned HTTP 200. Canonical object rows
contained the expected artifact/media hashes and sizes. A second synthetic
`org.m543.pending` submission remained `pending_review` so that private staging
was included in the final backup and restore.

Firmware-shaped acceptance also verified:

- anonymous run creation and finish;
- two metrics samples;
- score submission and public scoreboard read;
- authenticated run detail, CSV and Markdown exports;
- multiplayer status endpoint.

No synthetic content was exposed through the Dream Store.

## 13. Persistence and restart

Only `prg32-m543-local` was restarted. Before and after restart the following
were preserved:

- canonical metadata tuple `2/2/1/3`;
- `INSTALLATION_COMPLETE` setup state;
- one administrator;
- one published release;
- one pending submission with private staging;
- one run and two samples;
- one score;
- immutable artifact/media identities.

After restart, Fastify `/ready`, Next `/health`, setup status and the published
game endpoint all returned HTTP 200. The writer lease remained exclusive and
the storage metadata remained `ready`.

## 14. Backup-v4 creation

The first backup was created while the application writer was explicitly
quiesced. Because the final acceptance also included pending staging, a second
non-overwriting archive was created from the final canonical state:

```text
.local/operational-m543/backups/m543-canonical-with-pending.backup4
```

The existing command was used with explicit source, output, key registry and
operational backup authorization. The archive reported:

- backup format: `prg32-cartridge-store-backup-4.0`;
- backup ID: `7fbf16b3-71c5-4162-a6f6-c63a20dc0ac6`;
- archive size: `583951` bytes;
- verification state: `complete`;
- key identifier: `m543-local-backup-key`.

The archive was encrypted/authenticated by the existing backup-v4 code. The
key was kept outside the archive.

## 15. Backup-v4 verification

Independent CLI verification succeeded and recomputed the archive hash:

```text
archive_sha256=bd8bdb178383baacb37dbda1f874eaab80a1c12e44367e421467f35c0e03fe4e
verification_state=complete
```

The completion marker was present with restrictive permissions. The manifest
and canonical snapshot checks were performed by the existing independent
verifier; no plaintext secret values appeared in its output.

## 16. Fresh-root restore

The final archive was restored to the previously empty root:

```text
.local/operational-m543/restore-tests/canonical-restored-with-pending/
```

Restore state was `completed`. Independent source/restore comparison showed:

- metadata tuple equal and `state=ready`;
- setup state equal and complete;
- administrator identity/role preserved;
- one published release preserved;
- two submissions preserved;
- pending submission ID `2` preserved as `pending_review`;
- staging key, SHA-256, size and bytes equal;
- one run, two samples and one score preserved;
- restored canonical audit `ok=true`, findings `0`.

The source root was not overwritten or merged. The earlier fresh-root restore
without pending staging also completed successfully.

## 17. Negative security tests

The following local-only adversarial checks were executed against copies or
separate disposable paths:

| Case | Result |
|---|---|
| wrong backup key registry | rejected, `backup_v4_key_unknown` |
| corrupted backup envelope | rejected, `backup_v4_incomplete` |
| truncated backup envelope | rejected, `backup_v4_incomplete` |
| second local Compose project using the same canonical root | rejected by
  Fastify with `canonical_writer_lock_held`; the disposable second project was
  removed and the source project remained intact |
| source preservation after rejection | passed |
| no partial corrupt restore target | passed |

The full backend suite additionally covered missing/invalid secret registries,
permissions, explicit storage roots, uninitialized/incompatible storage,
authorization mismatches, writer lease conflicts, storage failure rollbacks,
origin validation, WebAuthn configuration and mDNS production restrictions.

## 18. External integration boundaries

The installation intentionally did not require or contact:

- Authentik or any real OIDC/SAML provider;
- SMTP or Mailpit;
- Dream Traefik, DNS or TLS certificates;
- mDNS multicast;
- university infrastructure.

The application still preserves generic provider contracts for a later
authorized integration. The production hostnames remain
`store.prg32.dream.test` and `api.prg32.dream.test`; assigning them to the
new runtime requires a separate edge ownership and cutover milestone.

## 19. Operational diagnostics

Observed local runtime:

- Fastify: healthy and ready;
- Next.js: healthy;
- writer lease: held exclusively while running;
- canonical SQLite: integrity and foreign-key checks passed through backup and
  restore verification;
- canonical audit: passed on restored root;
- network: one internal private `app_private` bridge only;
- published ports: none;
- Traefik labels: none;
- container user: `node` for both services;
- root filesystem: read-only for both services;
- capabilities: `ALL` dropped;
- privilege escalation: disabled;
- restart policy: `unless-stopped`.

No Dream monitoring configuration was changed and no monitoring service was
added.

## 20. Regression results

All required checks executed with Node.js 24 where applicable:

| Command/check | Result |
|---|---|
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 55 files, 276 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| root dev Compose config | PASS |
| candidate Compose config | PASS |
| operational template Compose config | PASS |
| standalone base/test/Dream-overlay config rendering | PASS |
| `git diff --check` | PASS |
| operational Fastify/Next image build | PASS |

The Next build temporarily regenerated `frontend/next-env.d.ts`; it was
restored exactly to its pre-existing content. No tracked source change remains.

## 21. Files changed

New tracked-scope deliverable:

```text
docs/modernization/129-local-operational-provisioning-m5-4-3.md
```

No application source, Docker Compose contract, Dockerfile, database schema or
production configuration was modified for M5.4.3. The local provisioning root,
synthetic environment, key registry and backup/restore fixtures are ignored by
Git. Existing untracked files from previous milestones were preserved and not
staged.

## 22. Remaining blockers

No unresolved M5.4.3 P0/P1 defect was found. The following remain blockers for
operational cutover and are intentionally outside this milestone:

- writer quiescence and ownership handover from Flask/transitional services;
- canonical migration of real legacy data and independent reconciliation;
- production custody/rotation of the key registry and session/bootstrap
  secrets;
- real TLS/DNS/Traefik ownership for the two Dream hostnames;
- generic OIDC/SAML provider registration and identity continuity decision;
- approved SMTP sender/relay configuration;
- WebAuthn RP/origin and enrollment decision;
- telemetry, scores, metrics and WebSocket ownership during cutover;
- backup destination, monitoring, rollback window and accepted data-loss
  policy.

The local installation is not authoritative for public traffic.

## 23. Final decisions

```text
M543_LOCAL_OPERATIONAL_ACCEPTANCE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

M5.4.3 is accepted for the dedicated local installation only. This result is
not evidence of real-provider, public-edge, production-secret or operational
cutover readiness.

## 24. Recommended next phase

The next authorized phase should be a narrowly scoped operational handover
preflight using operator-supplied production storage and secrets, with an
explicit maintenance window, legacy snapshot, writer-quiescence proof,
edge-ownership plan, identity continuity decision and rollback/data-loss
approval. Do not attach this local project to Dream networks or retire Flask
until those gates are separately approved and verified.
