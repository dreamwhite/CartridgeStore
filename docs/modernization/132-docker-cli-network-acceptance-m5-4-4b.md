# PRG32 Cartridge Store — M5.4.4b Docker CLI Network Acceptance

## 1. Executive summary

M5.4.4b is **GO for the administrative CLI acceptance scope**. The actual
`prg32-store-cli:local` image reached an actual Fastify container through a
fresh private Docker bridge network, resolved Fastify through Docker DNS, and
completed the public catalog and authenticated administrative flows over a
synthetic HTTPS proxy.

The acceptance was disposable-only. No operational service, Dream network,
Authentik instance, production secret, persistent database, public route, or
Flask runtime was changed.

Final decisions:

- `M544_ADMINISTRATIVE_CLI_GO`
- `OPERATIONAL_CUTOVER_NO_GO`
- `FLASK_RETIREMENT_NO_GO`

## 2. Scope and safety

This milestone covered Docker-network execution of the already implemented
administrative CLI. It did not implement a cutover or change the deployment
topology.

The test uses only the ignored disposable root `.local/cli-m544b/`. The root is
required to be absent before setup, created with restrictive permissions, and
removed in teardown. The test refuses to reuse an existing root. The root was
absent after the final run.

The test creates and removes only resources with the `prg32-m544b-` prefix. It
does not use `--network host`, host port publishing, `dream_edge`,
`dream_mail`, `docker compose down`, or global Docker cleanup commands.

## 3. Baseline

The repository was checked without resetting or cleaning unrelated work. The
worktree contained earlier modernization artifacts and an existing modified
`frontend/next-env.d.ts`; those changes were preserved. No operational file was
modified by this milestone.

Node.js 24 was selected with `nvm use 24`. The repository `.local` directory is
ignored by Git. `git diff --check` passed after the implementation.

## 4. Disposable Docker environment

The acceptance test is
`cli/tests/integration/docker-network.test.ts`.

It prepares these disposable areas:

- `canonical/`: canonical SQLite and immutable object storage;
- `secrets/`: synthetic key registry and runtime bootstrap material;
- `certificates/`: synthetic CA and server certificate material;
- `runtime/`: temporary Nginx configuration and non-production test state;
- `fixtures/`: disposable fixture space.

The test initializes the canonical store through the supported backend
bootstrap/session/token APIs. It does not insert token hashes directly into
SQLite. The resulting administrator and ordinary-user tokens are used only
inside the disposable test and are not printed.

## 5. Network topology

Each run creates a uniquely named private bridge network using the pattern
`prg32-m544b-private-<pid>-<timestamp>`. The network is internal to Docker and
is removed by teardown.

The runtime topology is:

```text
CLI container ── Docker DNS ──> Nginx TLS terminator ──> Fastify container
```

The Fastify container has the Docker DNS aliases `fastify` and
`fastify.m544b.test`. Nginx has aliases for `fastify.m544b.test` and
`wrong.m544b.test`. No container publishes a host port and no host-network
mode is used.

## 6. Synthetic TLS configuration

The test creates a one-day synthetic CA and a server certificate whose SAN is
`fastify.m544b.test`. Nginx is the disposable TLS terminator. The CLI receives
only the CA certificate through `NODE_EXTRA_CA_CERTS`; the CA private key and
server private key are not mounted into the CLI container or embedded in its
image. Nginx receives only the server certificate and server private key that it
needs.

The successful path therefore verifies both certificate trust and hostname
validation. The real production origins remain unchanged and were not used as
test aliases:

- storefront: `store.prg32.dream.test`;
- API/federation: `api.prg32.dream.test`.

## 7. Fastify fixture

The test builds and starts the actual backend image from
`backend/Dockerfile.operational`, tagged `prg32-cartridge-store-fastify:m544b`.
It runs canonical operational mode against the disposable SQLite root and uses
the disposable key registry. The only proxy-specific setting is the
disposable `TRUST_PROXY=true` required because Nginx is the sole ingress inside
the private test network.

The backend readiness probe is executed inside the container against
`http://127.0.0.1:5080/ready`, with a bounded timeout. Failure collection is
limited to redacted container diagnostics.

## 8. Actual CLI Docker image

The test builds the actual CLI image from `cli/Dockerfile`, tagged
`prg32-store-cli:local`, and executes the image for every assertion. It does
not call the CLI through a host-installed Node process for the network gate.

The image reports version `0.1.0`. Successful commands produce JSON output and
exit zero. Stable CLI exit codes are asserted for authorization, transport,
TLS, and network failures.

## 9. Docker DNS/TCP reachability

The following path passed from the actual CLI image:

1. CLI resolves `fastify.m544b.test` using the disposable Docker network DNS.
2. CLI connects to Nginx on the private network.
3. Nginx terminates TLS and proxies to Fastify on port 5080.
4. Fastify responds through the operational HTTP routes.

The direct HTTP non-loopback attempt is rejected by the CLI before it can be
used as an insecure substitute. The `--network none` case fails as expected.

## 10. TLS validation

The positive TLS case passed with the correct hostname and CA. The following
negative cases were also exercised and failed closed:

- untrusted/default CA;
- wrong hostname (`wrong.m544b.test`);
- missing CA file;
- explicit missing `NODE_EXTRA_CA_CERTS` path.

Each TLS rejection returned CLI exit code 6. No fallback to plaintext or
certificate verification bypass was observed.

## 11. Public catalog acceptance

The actual CLI image successfully executed the unauthenticated public commands
against the disposable Fastify runtime:

- `status`;
- `doctor`;
- `games list`.

The commands used the synthetic HTTPS origin and returned exit code 0. This
validates the CLI transport, JSON response handling, Docker DNS path, TLS
trust, and public Fastify catalog boundary together.

## 12. Authenticated API acceptance

The supported disposable bootstrap flow created an administrator and an
ordinary user. `users list` succeeded with the administrator token and failed
with both no token and the ordinary-user token.

The negative authenticated cases returned the stable authorization exit code
3. The test therefore verifies that the CLI sends the bearer token through the
real Docker path and that Fastify enforces the administrative boundary.

## 13. Negative TLS tests

The negative TLS matrix passed with no unexpected success:

| Case | Result | Exit code |
| --- | --- | ---: |
| Correct CA and hostname | accepted | 0 |
| Untrusted CA | rejected | 6 |
| Wrong hostname | rejected | 6 |
| Missing CA | rejected | 6 |
| Explicit missing CA path | rejected | 6 |

The server certificate was not accepted solely because it was reachable on the
private Docker network.

## 14. Negative network tests

The network and endpoint matrix passed:

| Case | Result | Exit code |
| --- | --- | ---: |
| `--network none` | rejected by transport | 6 |
| HTTP non-loopback URL | rejected by CLI policy | 2 |
| Missing/unreachable server | controlled failure | 2 |
| No token for `users list` | unauthorized | 3 |
| Ordinary token for `users list` | forbidden | 3 |

The test did not publish a host port to make any of these cases pass
accidentally through the host loopback interface.

## 15. JSON and exit codes

The successful CLI paths were invoked with `--json`; the test checks command
success and the version output. Failure paths are checked through stable exit
codes rather than raw exception text. The integration test does not treat a
Docker command's successful process launch as application success: it waits for
Fastify readiness and checks each CLI result.

No tokens, passwords, private keys, or key-registry contents are written to the
report or test output.

## 16. Automated acceptance

The dedicated test passed:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

The full CLI suite passed:

```text
Test Files  5 passed (5)
Tests       9 passed (9)
```

The full CLI check also passed typecheck, ESLint, Vitest, and the production
TypeScript build. The Docker acceptance runs the actual CLI and Fastify image
builds and removes its disposable containers, bridge network, and root during
teardown.

## 17. Defects corrected

During the gate, the following disposable-test defects were corrected:

- the backend image is now built from the actual operational Dockerfile before
  the test starts Fastify;
- the Fastify fixture explicitly enables the proxy trust setting required for
  canonical operational mode behind the disposable Nginx proxy;
- the synthetic secret key registry is mounted for the encrypted operational
  fixture;
- the Nginx certificate/key paths match the generated server key;
- Vitest setup and teardown have bounded extended timeouts for Docker builds;
- certificate mounts were narrowed so the CLI sees only the CA certificate.

These corrections are limited to the acceptance fixture. They do not alter
production runtime configuration.

## 18. Regression results

All requested checks passed on Node.js 24:

| Command/group | Result |
| --- | --- |
| `pnpm --dir cli run check` | PASS — 5 files, 9 tests |
| `pnpm --dir backend run typecheck` | PASS |
| `pnpm --dir backend run lint` | PASS |
| `pnpm --dir backend run test` | PASS — 55 files, 276 tests |
| `pnpm --dir backend run build` | PASS |
| `pnpm --dir frontend run typecheck` | PASS |
| `pnpm --dir frontend run lint` | PASS |
| `pnpm --dir frontend run test` | PASS — 22 files, 65 tests |
| `pnpm --dir frontend run build` | PASS |
| `SECRET_KEY=... ./.venv313/bin/python -m pytest -q` | PASS — 64 tests |
| Root `docker compose --profile dev config --quiet` | PASS |
| Candidate Compose config | PASS |
| Operational Compose config with disposable values | PASS |
| Standalone Compose config with disposable values | PASS |
| Standalone plus Dream overlay config | PASS; not activated |
| `git diff --check` | PASS |

The Python suite completed with `64 passed in 15.63s`. No public
authentication, OIDC, SAML, Traefik, Authentik, or Dream infrastructure
operation was performed.

## 19. Files changed

New milestone files:

- `cli/tests/integration/docker-network.test.ts` — disposable Docker DNS,
  TLS, authentication, negative-network, and cleanup acceptance test;
- this report.

No Compose file, Dockerfile, public route, database schema, production
environment file, Dream integration file, Authentik configuration, or Flask
application file was modified for M5.4.4b. Existing unrelated untracked
artifacts and the pre-existing frontend worktree modification were preserved.

## 20. Remaining blockers

The following remain outside this milestone and block operational cutover:

- operator-approved canonical data migration and production snapshot;
- production single-writer ownership and rollback authorization;
- live Traefik route and certificate acceptance for
  `store.prg32.dream.test` and `api.prg32.dream.test`;
- live generic OIDC/SAML provider and session-continuity acceptance;
- production SMTP, secret registry, backup, and persistent-storage review;
- final operational verification on the target host;
- explicit decision and runbook for post-cutover writes and rollback data loss;
- remaining Flask retirement and legacy dependency removal approvals.

The successful local Docker gate does not prove any of these external or
operational properties.

## 21. Final decisions

`M544_ADMINISTRATIVE_CLI_GO`: **GO**. The CLI works in a real disposable
Fastify Docker network with synthetic HTTPS, DNS, public catalog access,
administrator authorization, and fail-closed negative paths.

`OPERATIONAL_CUTOVER_NO_GO`: **NO-GO**. This milestone performed no real
cutover and did not verify live infrastructure ownership.

`FLASK_RETIREMENT_NO_GO`: **NO-GO**. Flask remains present and no retirement
or reverse-compatibility operation was authorized here.

## 22. Recommended next phase

Keep this acceptance as the local Docker-network gate for future CLI changes.
The next authorized work should address only the remaining operational
preconditions, using the existing two-service Fastify/Next.js deployment
contract and the external Dream reverse-proxy arrangement. It should not
promote this disposable network, synthetic TLS material, tokens, or fixture
database into an operational environment.

No later milestone was started by this report.
