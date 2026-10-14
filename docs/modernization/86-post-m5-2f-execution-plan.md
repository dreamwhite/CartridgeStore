# PRG32 Cartridge Store — post-M5.2f execution plan

Date: 2026-10-14  
Status: **ordered plan; execution requires a separate milestone authorization**

## Critical path

### M5.2g — operational canonical target integration and pre-cutover rehearsal

This is the exact next implementation milestone. It must remain disposable
until its final gate. It should:

1. prepare a final read-only Flask source snapshot and complete inventory;
2. execute the existing deterministic migration into a fresh canonical root;
3. reconcile catalog, object, submission, review, telemetry, score, metrics,
   settings, account and group identities;
4. verify publication and migration journals, including incomplete states;
5. run the operationalized backup-v3 procedure with approved key and archive
   policy;
6. prove Fastify single-writer behavior with route-level write guards;
7. verify local auth re-login, bearer tokens and the required generic external
   OIDC/SAML callback/session behavior without embedding provider credentials;
8. verify public catalog/download response and telemetry behavior;
9. verify score/metrics firmware writes and reconciliation;
10. verify WebSocket upgrade/reconnect and mDNS lifecycle through the intended
    external runtime path;
11. rehearse abort before route switching and post-cutover rollback as a
    test-only state machine;
12. produce a signed/authorized operational readiness record before any real
    routing or writer change is considered.

M5.2g must not silently turn the disposable writer profile into an
operational writer.

## Parallel work after the gate is defined

These streams can proceed in isolated fixtures while the canonical integration
remains read-only:

- complete Fastify mDNS implementation and constant/port tests;
- complete public-origin WebSocket upgrade and reconnect verification;
- finish session/re-login and generic provider callback acceptance using the
  external `sso.dream.test` arrangement without storing credentials in code;
- finish score/metrics live-contract fixtures and reconciliation reports;
- finalize backup-v3 encryption, key custody, authenticity and retention
  decisions;
- implement Next.js pages required to replace remaining Jinja storefront/admin
  surfaces;
- prepare direct Traefik labels and health-check evidence without changing the
  current Compose file.

## Post-cutover work, only after explicit ownership approval

1. enter a maintenance window and quiesce Flask writes;
2. verify source snapshot and backup;
3. start exactly one canonical Fastify writer;
4. switch API/store traffic while preserving
   `api.prg32.dream.test` and `store.prg32.dream.test`;
5. keep Flask and its data available for the agreed rollback window;
6. monitor errors, telemetry, publication, scores, metrics, WebSocket and
   discovery health;
7. reconcile all writes before closing the window;
8. only then authorize Compose/service consolidation and Flask retirement.

## Rollback policy

Pre-cutover abort discards the disposable target and leaves Flask authoritative.
Post-cutover rollback requires stopping/quiescing Fastify, controlling traffic,
reconciling writes accepted after the switch, and then restoring a consistent
legacy-compatible state. Restarting Flask alone is not sufficient. The change
control record must choose between explicit accepted data loss, exporting and
reconciling post-cutover writes, or a forward fix.

No reverse migration is included in this plan.

## Optional/future work

- Compose simplification to one Fastify and one Next service plus external
  Traefik/provider;
- removal of nginx auth bridge and disposable initializer;
- removal/archival of Flask templates and Python runtime;
- production image slimming and final Docker cleanup;
- browser/e2e verification once the backend ownership gates are complete.

Generic OIDC/SAML is a required Fastify target capability, not a removable
legacy adapter. The provider remains external and generic; `sso.dream.test`
is only the local infrastructure origin used for provider verification.

These are not M5.2f actions. In particular, no Compose modification,
container cleanup, Flask deletion, routing change, deployment, commit or push
is authorized by this document.

## Readiness exit criteria

The plan can advance only when the machine-readable report has no unresolved
`LEGACY_DEPENDENT`, `MISSING` or operational `NOT_VERIFIED` gate for the
intended cutover scope, and when the following are approved: maintenance
window, session continuity, backup confidentiality/authenticity, retention,
telemetry reconciliation, rollback data-loss policy, monitoring, and one-
writer enforcement.
