# ADR M6.2a — Scoped Credentials for Firmware Score Ingestion

Date: 2026-10-12
Status: SUPERSEDED — NOT APPROVED by the M6.2b product decision.

Historical note: this ADR records the M6.2a security recommendation. It is
preserved for traceability and is not the current product decision.

## Context

PRG32 firmware score synchronization posts JSON to `POST /api/scores` without an authentication header. Flask requires an authenticated principal. Existing API tokens are bearer-compatible and revocable by deletion, but are general user credentials with no scope, expiry, device identity, or replay protection. The firmware has persistent NVS for local scores and the store URL, but no credential provisioning or TLS-specific score configuration.

## Historical decision

Use a dedicated scoped score-device credential for future authenticated firmware submissions while preserving the `/api/scores` path and current success response. Store only a token hash in an explicit device entity, support revocation/expiry/rotation, apply per-credential rate limits, and keep device-to-user ownership nullable and explicit.

Require HTTPS with certificate validation before provisioning production credentials. Keep public leaderboard reads unchanged. Do not infer player identity or score integrity from device authentication.

## Consequences

- New firmware must send a bearer credential and support secure provisioning.
- A reviewed SQLite schema addition is required for device credentials; the existing `scores` table can remain unchanged initially.
- Existing firmware remains offline/local-score compatible but cannot securely authenticate remote writes without a firmware update.
- Existing general user tokens may be used only as a short-lived HTTPS laboratory fallback, not as production firmware credentials.
- Exactly-once delivery remains deferred until firmware supplies a stable submission identifier.
- Flask remains the sole operational writer until the explicit cutover gate.

## Rejected alternatives

- Anonymous writes: rejected because abuse controls do not authenticate the source or protect leaderboard integrity.
- General user bearer tokens as the primary design: rejected because compromise has broad route scope and no device lifecycle.
- Signed requests now: deferred because they add provisioning, replay state, and firmware cryptography without proving that a client-generated score is genuine.
- A new route without a new credential model: rejected because path separation alone does not provide authentication.

## Approval gate

M6.2b may begin only after approval of the device entity, provisioning channel, HTTPS/certificate strategy, rate limits, Flask compatibility mode, and whether idempotency is included in the first implementation slice.
