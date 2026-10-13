# Security model and operational invariants

This document is the implementation-independent security summary. The
security rules are acceptance criteria for the future Fastify migration and do
not depend on Flask internals.

## Trust boundaries

1. Public browsers and firmware clients are untrusted inputs.
2. Flask is the current compatibility authority for legacy catalog, firmware,
   score, metrics, and multiplayer behavior.
3. The TypeScript backend is a separate migration boundary. Its default mode
   is read-oriented; writable profiles use disposable data and test mode.
4. The Next.js browser is presentation code. It must not duplicate Flask
   business rules or make a second authority for identifiers and response
   shapes.
5. Traefik terminates external TLS and routes exact hosts. The application
   still validates configured origins and must not trust arbitrary forwarded
   headers.

## Authentication and federation

- Session cookies are HttpOnly and use the configured Secure/SameSite policy.
- Browser mutations require a session-bound CSRF token.
- Session and token changes revoke or rotate durable access as required by the
  auth service.
- Authentication rate limits and recent re-authentication are enforced at the
  backend boundary.
- OIDC and SAML are provider-neutral protocols. Provider records contain
  configured metadata and encrypted secrets, not assumptions about a specific
  identity platform.
- OIDC callbacks require a pending correlation transaction, trusted issuer and
  redirect validation, and a valid identity mapping.
- SAML flows require bounded input, correlation state, issuer/audience/
  destination/recipient/time validation, and signature validation.
- Federation administration requires local admin authorization, CSRF, and
  recent password re-authentication for sensitive actions.
- Anonymous or public data must not expose identifying run/export information;
  run detail and exports use the same authorization policy.

The application does not require or contact the persistent infrastructure
provider at `https://sso.dream.test` as part of normal tests. A deployment may
configure any compatible OIDC or SAML provider.

## Input and resource containment

Cartridge and backup archives are rejected before extraction/materialization
when possible. The limits cover archive bytes, entry count, individual and
total expanded bytes, compression ratio, manifest size, duplicate names, path
traversal, unsafe absolute/drive paths, symlinks, unsupported file types, and
derived-file policy.

Metrics ingestion bounds payload size, sample count, database work, nesting,
and invalid structures. Errors are stable JSON envelopes; raw exception text
and secrets are not returned to clients.

Uploads never execute cartridge code. Cartridge binaries remain on the
filesystem; SQLite stores metadata and service records.

## Write isolation

The following invariants must remain true during the migration:

- no TypeScript writable boundary may use the authoritative Flask production
  database or data root;
- write modes are explicit and validated as `test` with disposable roots;
- publication and backup workflows validate references before mutation;
- publication journal states and backup recovery points compensate for the
  absence of a single atomic transaction across SQLite and the filesystem;
- secret encryption requires an explicit key registry and migration state;
- production CORS is not enabled by an unreviewed wildcard or arbitrary
  origin allowlist.

## Production checklist

Before exposing a deployment:

- set high-entropy Flask and Fastify session secrets outside Git;
- use HTTPS and Secure cookies;
- keep Fastify test/write flags disabled unless the isolated deployment model
  has been reviewed;
- configure exact frontend/API origins and reverse-proxy WebSocket support;
- configure SMTP without putting credentials in Compose or documentation;
- protect the backup/key-registry paths and test restore procedures;
- keep `/data` on durable storage with restricted ownership;
- review mDNS exposure and disable it when classroom discovery is not needed;
- run backend/frontend checks and `docker compose config` before release;
- do not claim browser federation acceptance from API-only tests.

## Incident response baseline

When an upload, restore, or federation operation fails:

1. preserve the server-side structured log and request ID;
2. do not expose or paste raw exception strings, cookies, tokens, assertions,
   registration links, or key material into an issue;
3. inspect `/health` and `/ready`, then the relevant service logs;
4. for publication/restore failures, preserve the journal/recovery evidence
   until reconciliation completes;
5. rotate affected secrets/tokens through the supported admin or secret
   lifecycle path rather than editing SQLite manually.

