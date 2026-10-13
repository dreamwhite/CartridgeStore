# M6.3d.2h.5a — Playwright Connectivity Recovery & Reliable Federation E2E

Status: **COMPLETE for the disposable integration gate; NO-GO for production
federation or Flask retirement**.

This remediation resumes the previous M6.3d.2h.5 run after its browser
container navigation blocker. It validates the generic OIDC/SAML provider
boundary using a disposable Authentik instance only. It does not connect to
the operator's real Authentik deployment, use real credentials, change
Traefik, or expose any host port.

## Scope completed

- Recovered browser-container DNS, TCP, TLS, and HTTP connectivity.
- Added explicit disposable CA trust for Node, Chromium, Firefox NSS, and
  WebKit through the Playwright container.
- Pinned the runner to Node `v24.21.0` and retained Chromium, Firefox, and
  WebKit from the official Playwright image.
- Added a bounded preflight diagnostic covering proxy environment presence,
  DNS, TCP, TLS authorization/protocol/subject/issuer, and HTTP readiness.
- Added health-gated Compose dependencies for Authentik and Fastify writer
  proxies.
- Stabilized Authentik flow interaction around Lit flow rendering and used
  keyboard input for the password stage so a rerender cannot silently discard
  the value.
- Made the disposable lifecycle command fail nonzero on browser failure and
  clean its named volumes, containers, and network on both success and
  failure.
- Kept generated credentials in a mode-0600 runtime file and removed that
  file at process exit.

## Diagnostic matrix

| Check | Evidence | Result |
|---|---|---|
| Node runtime | Browser container reported `v24.21.0` | PASS |
| Proxy environment | No HTTP/S proxy variables present in the browser container; only presence is reported | PASS |
| DNS | `authentik.test` and `writer.test` resolved on the isolated network | PASS |
| TCP | Both TLS endpoints accepted connections on port 8443 | PASS |
| TLS | Certificate chains authorized with the disposable CA; TLS 1.3; expected subjects | PASS |
| HTTP readiness | Authentik `/-/health/ready/` and writer `/health` returned 200 | PASS |
| Browser startup | Chromium, Firefox, and WebKit launched from the Playwright image | PASS |
| Smoke navigation | `run.sh smoke` completed for all three engines | PASS |
| OIDC federation | Authorization Code + PKCE reached Fastify `/auth/me` for all three engines | PASS, 3/3 |
| SAML federation | SP-initiated flow, Authentik consent, POST ACS, and Fastify `/auth/me` completed | PASS, 3/3 |
| SAML cookies | Correlation cookie observed and cleared in every engine; ACS redirect/session evidence passed | PASS, 3/3 |
| Linked identity | `/auth/me` returned the pre-linked disposable username | PASS, 6/6 |
| RBAC | Federation and account-state boundaries remain covered by backend Vitest fixtures; no browser admin surface was added | PASS in backend scope |
| Negative/replay | OIDC/SAML signature, identity, disabled-account, binding, and replay regressions remain covered by backend tests | PASS in backend scope |
| Reporting | Runner emitted `/reports/authentik-e2e.json` with status-only results | PASS |
| Cleanup | Lifecycle removed disposable resources after the full run | PASS |

For WebKit, Playwright does not expose the ACS `Cookie` request header through
the request-inspection API even though the server callback succeeds. The
runner therefore accepts the WebKit ACS result only when all three independent
signals are present: the SAML correlation cookie was set with the required
attributes, the ACS returned the expected redirect, and the correlation cookie
was cleared after the authenticated session was established. Chromium and
Firefox additionally exposed the ACS request cookie directly.

## Commands and results

All local Node commands were run after `source "$HOME/.nvm/nvm.sh" && nvm use
24`. The lifecycle commands use the single root `docker-compose.yml` and the
`authentik-e2e` profile:

```text
./tests/integration/authentik/run.sh diagnose  PASS
./tests/integration/authentik/run.sh smoke     PASS (Chromium/Firefox/WebKit)
PRG32_E2E_ENGINES=chromium ./tests/integration/authentik/run.sh oidc PASS
PRG32_E2E_ENGINES=chromium ./tests/integration/authentik/run.sh saml PASS
./tests/integration/authentik/run.sh saml     PASS (3/3)
./tests/integration/authentik/run.sh run      PASS (6/6)
```

The final full run reported:

- Chromium OIDC: passed;
- Chromium SAML: passed;
- Firefox OIDC: passed;
- Firefox SAML: passed;
- WebKit OIDC: passed;
- WebKit SAML: passed.

The prior failure was a browser-to-service navigation blocker, not an
accepted authentication result. During recovery, a transient Authentik API
500 occurred while provisioning an application; the subsequent disposable
run provisioned successfully and the final full matrix passed. This remains
an operational flake to monitor, not a production acceptance claim.

## Files changed for the recovery

- `docker-compose.yml`: health gates, CA mounts/trust setup, Node 24 browser
  diagnostics, writer trust configuration, and isolated service wiring;
- `tests/integration/authentik/diagnose.mjs`: disposable network/TLS/HTTP
  preflight diagnostics;
- `tests/integration/authentik/run.sh`: Node 24 lifecycle, scoped cleanup,
  generated runtime secrets, and nonzero failure propagation;
- `tests/integration/authentik/run-e2e.mjs`: all-engine smoke/federation
  runner, flow synchronization, cookie/session assertions, and JSON report;
- `tests/integration/authentik/playwright-node24.Dockerfile`: `certutil` and
  Node 24 runner support;
- `.gitignore`: ignored disposable reports and screenshots;
- this report and the M6.3d.2h.5a roadmap evidence below.

No Flask route, Jinja template, production routing, operational database,
production filesystem store, companion `../PRG32` repository, deployment, or
authentication behavior was changed.

## Remaining risks and next milestone

- The disposable CA is regenerated per run; certificate rollover,
  revocation, and multi-certificate trust overlap are not part of this gate.
- The WebKit ACS cookie assertion necessarily uses server-result evidence as
  described above because of Playwright inspection limits.
- Browser-level negative/replay UI journeys were not added; protocol-level
  negative/replay coverage remains in backend tests.
- The profile validates the generic OIDC/SAML contract with Authentik as a
  real disposable IdP. It does not certify any production provider
  configuration, credentials, DNS, or Traefik integration.
- Production federation, frontend login, public routing cutover, and Flask
  retirement remain explicitly closed.

The recommended next milestone is a separately authorized certificate
rollover/revocation and provider-operations gate (M6.3d.2h.5b), followed by an
independent security review. No automatic transition was performed.

