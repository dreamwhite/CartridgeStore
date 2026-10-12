# ADR M6.2b — Anonymous Score Ingestion

Date: 2026-10-12
Status: approved product decision for isolated implementation; production enablement still requires the M8 cutover gate.

## Decision

PRG32 score submission is intentionally anonymous. `POST /api/scores` in the isolated Fastify backend must not require:

- user accounts or browser sessions;
- Bearer, API, or device tokens;
- device enrollment, device identifiers, signatures, or hardware attestation;
- CSRF tokens for anonymous firmware requests.

The public leaderboard remains `GET /api/scores`. The existing `scores` table, columns, and indexes remain authoritative. Firmware payload and success response compatibility are mandatory:

```json
{"game":"breakout","player":"PLAYER","score":1200}
```

```json
{"ok":true}
```

`player` is an unverified display nickname. A leaderboard row is a community-submitted score and must not be represented as authenticated gameplay or proof of score integrity. Anonymous Fastify writes use the neutral server value `submitted_by = "anonymous"`; client-supplied `submitted_by` is ignored.

## Security and operational constraints

Anonymous writes require proportionate controls: strict request validation, bounded body size, process-local bounded rate limiting, deterministic capacity admission in the disposable writer, parameterized SQL, stable error envelopes, and transaction rollback on failure. No automatic score deletion or heuristic duplicate suppression is allowed.

Firmware compatibility takes priority over exact Flask authentication parity. Flask's current authenticated POST behavior is intentionally different and remains unchanged. Flask remains the sole operational writer. Fastify writes are disposable-only, disabled by default, and have no public routing or Traefik exposure in this milestone.

HTTP development firmware remains supported; HTTPS is recommended for integrity/confidentiality but is not introduced as a breaking requirement in M6.2b. Anonymous transport means TLS does not protect a credential, but it still protects payload integrity and privacy in transit.

## Consequences

- Existing firmware can submit to the isolated Fastify endpoint without changes, credentials, or CSRF.
- At-least-once delivery remains: a timeout after insertion can create a duplicate on retry.
- Device identity, anti-cheat guarantees, and verified player ownership are intentionally out of scope.
- IP/source rate limits are imperfect for multiple consoles behind one NAT; the implementation must document this and avoid aggressive defaults.
- Row-count capacity admission bounds configured historical rows but does not cap every WAL/filesystem growth mode; M6.3/M6.5 must address retention and capacity operations.
- Public leaderboard response shape and historical rows remain compatible.

## Superseded alternative

The scoped device-credential proposal in `37-m6-2a-score-authentication-adr.md` is explicitly **SUPERSEDED — NOT APPROVED** for this product decision. It must not be implemented or reintroduced implicitly by M6.2b.

## Approval boundary

This ADR authorizes isolated Fastify score implementation and disposable tests only. It does not authorize production database writes, production routing, Flask modification, firmware changes, deployment, or the M8 cutover. Production enablement requires a separate explicit decision.
