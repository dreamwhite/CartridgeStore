# PRG32 Cartridge Store — M5.4.7 Local Operational Provisioning & Release Preparation

Assessment date: 2026-10-15

Decision: `M547_LOCAL_PROVISIONING_PARTIAL`

Operational cutover: `OPERATIONAL_CUTOVER_NO_GO`

Flask retirement: `FLASK_RETIREMENT_NO_GO`

## 1. Executive result

The new local operational root was provisioned successfully and is isolated
from the M5.4.3 root. Fastify and Next.js run as two containers in the
`prg32-local-operational` Compose project, both as the unprivileged `node`
user. The canonical SQLite/object-storage root, key registry, first admin
credentials and backup destination are bind-mounted or stored under
`.local/operational/`.

The local application, authentication, setup wizard, catalog, publication,
telemetry, CLI and encrypted backup-v4 workflows passed their authorized
checks. The result remains PARTIAL because direct host loopback forwarding was
not observable from this Docker Desktop environment, SMTP was intentionally
left disabled without an approved sender, real provider callbacks were not
authorized, and public Dream routing was not changed or cut over.

## 2. Scope and authorization

This work stayed within M5.4.7. It provisioned a new local installation,
performed synthetic application workflows, created and restored a local
encrypted backup, checked Compose contracts and prepared release artifacts.

No Flask service was stopped or modified. No operational Flask data, M5.4.3
root, Dream Traefik, Authentik, Mailpit, DNS, public routing or unrelated
container was changed. No public authentication session was created.

## 3. Preconditions and worktree state

The repository was on branch `development`. The pre-existing worktree was
not clean and contained generated/cache artifacts and prior uncommitted
modernization material. Those unrelated files were preserved. Node.js 24 was
selected with `source "$HOME/.nvm/nvm.sh" && nvm use 24` for all JavaScript
checks.

The M5.4.3 root `.local/operational-m543/` was inspected and not reused.

## 4. Provisioned root layout

The new root is:

```text
.local/operational/
├── backups/
├── data/canonical/
├── restore-tests/
├── runtime/
└── secrets/
    ├── first-admin-credentials.txt
    ├── key-registry.json
    └── standalone.env
```

The root and secret directories use restrictive local permissions. The
populated environment, key registry, generated admin password, fixture,
backup archive and restore target are ignored by Git and were not staged.
Secret values are not reproduced in this report.

## 5. Secret custody

Four fresh random local secret values were generated for canonical read/write
authorization, the session secret and the one-time setup token. A fresh
backup key registry was generated with key id `key-20261015-01` and mode
0600. First admin credentials were generated for the local-only
`local-admin` account and retained in the protected local credentials file.

The initial bootstrap command was executed through a package wrapper that
echoed its arguments. The exposed bootstrap authorization was immediately
rotated before the container was started. The current runtime uses the
rotated value; no exposed value is recorded here.

The backup key registry remains outside the archive. Backup integrity,
authenticity and confidentiality are provided by the existing encrypted
backup-v4 implementation; a SHA-256 value is not treated as an authenticity
proof.

## 6. Container topology

The provisioned project starts exactly two application containers:

```text
prg32-local-operational-fastify-1  Fastify API, SQLite/object writer
prg32-local-operational-next-1     Next.js storefront and API proxy
```

They share only the Compose private application network. Fastify receives the
canonical bind mount and read-only key registry. Next.js has no persistent
data mount. No Dream external network or reverse-proxy label was activated.

## 7. Container health and isolation

Fastify `/health` and `/ready` returned HTTP 200 after startup. Next.js
reported healthy. Both application processes run as uid/gid 1000 (`node`).
The local project has no attachment to `dream_edge`, `dream_mail` or
`dream_sso`.

The direct overlay declares loopback ports 15080 and 13000. Docker Compose
reported the bindings, but TCP connections to those host ports were refused
by the local Docker Desktop forwarding layer. Acceptance therefore used a
disposable Node 24 client on the private application network and did not
work around that boundary. Host-port reachability is `NOT_VERIFIED`.

## 8. First-installation wizard

The actual HTTP setup flow completed against the new Fastify container:

- administrator: local-only `local-admin`;
- store name and local description;
- registration disabled;
- secure session policy and publishing policy persisted;
- SMTP disabled;
- generic OIDC disabled;
- generic SAML disabled;
- mDNS disabled;
- final review completed.

The resulting state was `INSTALLATION_COMPLETE` with all expected setup steps
recorded. No direct SQLite mutation was used.

## 9. Local authentication

The local administrator login returned HTTP 200 and `/auth/me` returned the
expected administrator identity. CSRF protection was exercised. A first token
attempt using a stale anonymous CSRF token returned HTTP 403 after session
rotation; the retry using the authenticated session CSRF token returned HTTP
200. Token listing, revocation and logout also returned HTTP 200.

A temporary CLI acceptance token was created through the API, used for a
read-only user listing, revoked and removed from the protected runtime file.
No acceptance token remains in the local runtime.

## 10. Catalog and publication workflow

A synthetic PRG32 bundle was uploaded through `POST /api/publish/bundle`.
The bundle contained a synthetic `org.example.m547.local` cartridge, qemu
architecture, icon bytes and a valid PRG2-compatible artifact. The flow
covered authenticated upload, submission listing/detail, administrator
verification, canonical publication, catalog detail, icon and binary reads.

Observed results:

- upload: HTTP 200;
- submission mine/detail: HTTP 200;
- verification/publication: HTTP 200;
- catalog detail: HTTP 200;
- binary download: HTTP 200, 593 bytes;
- range download: HTTP 206, 4 bytes;
- icon: HTTP 200, 8 bytes;
- matching `If-None-Match`: HTTP 304.

The synthetic published cartridge and telemetry rows are local acceptance
fixtures in the new canonical root only.

## 11. Scores, runs and metrics

Anonymous firmware-shaped score ingestion returned HTTP 200. The same
endpoint correctly returned HTTP 403 when called with a browser session but
without its current CSRF token. A run was created, two samples were accepted,
the run was finished, and detail, CSV and Markdown exports returned HTTP 200.

This exercised the canonical database path and preserved the firmware
ingestion contract. No Flask or legacy database was used by the new runtime.

## 12. CLI status and doctor

The CLI was run in the Fastify container network namespace. `status` and
`doctor` returned healthy/readiness evidence and the expected public origin
metadata. The authenticated `users list` operation returned the single local
administrator. The temporary token was revoked after the check.

## 13. Multiplayer and mDNS

`GET /api/multiplayer/status` and the discovery document both returned HTTP
200. A real WebSocket upgrade was accepted, and an unauthenticated join was
rejected with the expected `player role required` error because board-user
authentication is disabled in this fresh local installation. Authenticated
board relay acceptance is therefore `NOT_VERIFIED` and remains a setup/config
decision.

mDNS was deliberately disabled. No UDP 5353 registration or external network
change was attempted.

## 14. SMTP and Mailpit

SMTP remained disabled because an approved sender address was not supplied for
this installation. The Dream overlay was syntax-checked with a placeholder
sender but was not activated. Mailpit was not attached, queried or modified.

SMTP local capture integration is `NOT_VERIFIED` pending an explicit sender
and the separately authorized Mailpit connection decision.

## 15. OIDC and SAML

The provider model and callback routes remain generic OIDC/SAML. No Authentik
configuration, credentials, provider record, callback or public login was
changed. The first-installation flow persisted both providers as disabled.

Real OIDC and SAML callbacks are `NOT_VERIFIED` and intentionally deferred
until provider metadata, client credentials/certificate material, redirect
URIs and operator approval are available for this new local root.

## 16. Public origins and routing

The local configuration is prepared for:

```text
https://store.prg32.dream.test
https://api.prg32.dream.test
wss://api.prg32.dream.test/api/multiplayer
```

The Dream integration overlay preserves those hostnames and expected proxy
labels, but it was not started. No public routing, DNS, TLS certificate,
Traefik configuration or Authentik setting was changed. Public acceptance is
therefore `NOT_VERIFIED`.

## 17. Backup-v4 creation

After quiescing only the newly provisioned Fastify writer, the existing CLI
created an encrypted backup-v4 archive at the local ignored backup path.

Evidence:

- backup id: `f8ded368-4fa9-4ad0-9a36-3f3881b8a570`;
- archive size: 582811 bytes;
- key id: `key-20261015-01`;
- completion state: `complete`;
- archive SHA-256: `3bba4e24ea20311747b827083931f05bd0c74eeb1ed094ea89e84b0daf511336`.

No operational Flask writer was quiesced. The Fastify container was restarted
after backup and returned healthy.

## 18. Backup verification

Independent CLI verification passed. The verifier authenticated the encrypted
envelope with the external key registry, checked the completion marker,
payload hash, manifest hash and canonical storage-v2 contents. No key or
secret material was logged.

## 19. Fresh restore

The archive was restored into the previously empty
`.local/operational/restore-tests/m547-restore/` root. Restore completed with
state `completed` and created a fresh SQLite database, object directories,
staging directories and recovery metadata. The live canonical root was not
overwritten or merged.

## 20. Independent restored-target audit

The restored target passed the canonical storage audit with zero error
findings. SQLite foreign keys and schema/version checks passed. The source and
restored database table counts matched for users, settings, catalog,
publication, review, objects, submissions, scores, runs, samples, downloads,
and migration state. The restored object inventory contained the same artifact
and media objects and the same bytes as the source.

## 21. Backup/restore recovery boundary

The existing backup-v4 and canonical storage-v2 implementations enforce a
writer lease, explicit authorization, fresh disposable restore roots,
authenticated archives, completion markers and non-ready interrupted restore
states. The dedicated backend suite exercised wrong keys, tampering,
truncation, interrupted encryption, writer-lock conflicts and interrupted
restore phases.

Operational backup HTTP routes remain disabled. Backup and restore are local
maintenance operations only.

## 22. Transfer and system snapshot preparation

The repository contains the operator-controlled bind-mount and external key
registry contracts needed for a future transfer. No external host transfer,
filesystem snapshot or system-level SQLite snapshot was executed in this
milestone. Those items are `NOT_VERIFIED` and require an operator-owned
maintenance window, quiescence confirmation and destination validation.

## 23. Monitoring and observability preparation

The local health/readiness endpoints, Compose health checks, CLI doctor output,
backup completion marker and restore state file provide the minimum local
signals. Production alert routing, log aggregation, backup retention policy,
disk thresholds and provider/mail monitoring remain to be connected by the
operator without changing the existing Dream infrastructure.

## 24. Rollback preparation

The local layout preserves the legacy Flask root and keeps the new canonical
root separate. A pre-cutover abort is therefore represented by leaving Flask
authoritative and discarding only the disposable/local target through a
separately approved cleanup procedure.

No real traffic or writer ownership was changed. No post-cutover rollback was
performed.

## 25. Rollback limitations

After a future cutover, rollback is not a blind Flask restart. The new writer
must be stopped or quiesced, traffic must be controlled, and writes accepted
after cutover must be reconciled or explicitly accepted as a data-loss window.
The choices are: export/reconcile post-cutover writes, rollback with explicit
accepted loss, or perform a forward fix. A reverse migration was not
implemented or implied.

## 26. Docker Compose verification

The following read-only configuration checks passed with exit code 0:

- `docker compose --profile dev config --quiet`;
- candidate Compose;
- operational template with placeholder local inputs;
- standalone base;
- standalone direct loopback overlay;
- standalone Dream integration overlay with placeholder sender;
- standalone external-proxy overlay;
- `git diff --check` for the reviewed release changes.

No Compose file was changed during provisioning, and no `down`, volume prune,
system prune or operational cleanup command was run.

## 27. Release artifacts

The reviewed release artifacts are grouped by domain:

- `cli/`: administrative status, doctor, users, cartridge and backup commands,
  tests, Docker image and CI example;
- `deploy/standalone/`: two-service runtime, direct diagnostic overlay, proxy
  overlay and disposable test overlay;
- `deploy/integrations/dream/`: inactive Dream Traefik/Mailpit integration
  contract;
- `deploy/examples/standalone.env.example`: secret-safe operator template;
- modernization reports 124–134: prior reviewed evidence, including the
  M5.4.1 provisioning report.

## 28. Git checkpoint

The reviewed domains were committed on `development` using Conventional
Commits:

```text
39da1a3 feat(cli): add store administration and backup commands
ee5ff82 feat(deploy): add standalone application runtime contracts
0e27d2d docs(modernization): record operational handover evidence
```

This M5.4.7 report is the final documentation checkpoint for the milestone
and is committed with the reviewed release evidence after the secret scan and
diff checks. The branch is then pushed with a normal fast-forward push to
`origin development`. No force-push or rebase is authorized.

## 29. Validation commands and results

Executed successfully:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 24
pnpm --dir cli run check                         PASS: 5 files, 9 tests
pnpm --dir backend run typecheck                 PASS
pnpm --dir backend run lint                      PASS
pnpm --dir backend run test                     PASS: 55 files, 276 tests
pnpm --dir backend run build                     PASS
pnpm --dir frontend run typecheck                PASS
pnpm --dir frontend run lint                     PASS
pnpm --dir frontend run test                     PASS: 22 files, 65 tests
pnpm --dir frontend run build                    PASS
FLASK_PROXY_TARGET=http://flask:5080 pnpm --dir frontend run build
                                                   PASS
SECRET_KEY=prg32-test-only-secret ./.venv313/bin/python -m pytest -q
                                                   PASS: 64 tests
docker compose ... config --quiet                 PASS for all listed variants
git diff --check                                  PASS for reviewed staged changes
```

The frontend Vitest configuration uses the supported worker isolation setting
(`pool: 'vmThreads'`) and does not rely on the earlier per-file fixture
failure. No browser Playwright run was required for this backend/local
provisioning milestone.

## 30. Remaining blockers and risks

- direct host forwarding for 15080/13000 is not verified in this Docker
  Desktop session;
- approved SMTP sender and Mailpit attachment are still missing;
- real generic OIDC/SAML provider metadata and callback acceptance remain
  pending;
- authenticated board-user WebSocket relay needs an approved local board-user
  configuration;
- WebAuthn and mDNS remain intentionally disabled;
- external backup transfer, system snapshot and production retention are not
  verified;
- public Dream routing, TLS and DNS remain unchanged and unverified;
- the legacy Flask root remains authoritative.

## 31. Final decisions and next milestone

`M547_LOCAL_PROVISIONING_PARTIAL` is the correct local result. The new
Fastify+Next installation is usable for controlled local development and
maintenance validation, but it is not a public operational cutover.

`OPERATIONAL_CUTOVER_NO_GO` and `FLASK_RETIREMENT_NO_GO` remain mandatory.

The next milestone should be an operator-approved integration closure: decide
the host-port/proxy path, supply the approved SMTP sender, provision the
generic OIDC/SAML contracts, configure board WebSocket identity if required,
perform external backup/snapshot transfer rehearsal, and only then prepare a
separately authorized maintenance-window cutover. Do not remove Flask or
change Dream routing as part of this report.
