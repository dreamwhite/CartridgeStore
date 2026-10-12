# M5.A — Data Architecture Optimization Plan

**Date:** 2026-10-12
**Decision type:** sequencing and go/no-go guidance; no implementation authorization

## Before M5.2 — mandatory gates

1. Define the filesystem/SQLite publication state machine and durable operation
   identity. It must survive process restart and distinguish staged, verified,
   filesystem-replaced, index-replaced, database-updated, and compensated states.
2. Add a read-only reconciliation command over a disposable copy first. It must
   detect orphan binaries, missing index entries, hash mismatches, stale pending
   directories, submission status mismatches, and incomplete operations.
3. Add kill-point tests around file replacement, index replacement, SQLite commit,
   and restart. Keep Flask as the only operational writer while these tests are
   developed.
4. Preserve the M5.1 disposable writer boundary. Do not mount operational data or
   add production Traefik routing to it.
5. Freeze the current catalog source of truth: `index.json` and published
   filesystem files. Do not add a second catalog authority as a prerequisite.

**Go:** isolated pending staging and reconciliation design.
**No-go:** public TypeScript publication/review writer or route cutover.

## Before M6 — domain migration gates

1. Resolve M5A-002 with a coordinated PRG32 score-auth decision and fixtures.
2. Preserve firmware metrics ingestion as an unauthenticated compatible contract
   while keeping anonymous run ownership null and exports admin-only.
3. Produce a versioned schema fingerprint/migration plan; do not infer migrations
   from Drizzle declarations alone.
4. Define retention/archival policy for samples, runs, scores, downloads,
   registration tokens, and submissions. Bound export work and verify report
   output before changing query shape.
5. Measure the user-runs N+1 path and the redundant samples index with synthetic
   volumes representative of the classroom workload. Only then decide whether a
   migration is worthwhile.
6. Freeze the role/group matrix, including the known difference between editor
   review routes and cartridge admin routes.

**Go:** read-only parity plus isolated domain fixtures and one approved writer per
domain.
**No-go:** dual-writing Flask and Fastify to the same operational database.

## Before M7 — WebSocket gate

1. Preserve join/state/leave wire fields, peer cap, token behavior, and close/error
   semantics.
2. Decide whether deployment remains single-process. SQLite is not a multiplayer
   state bus and should not be used as one.
3. Verify Traefik upgrade headers, same-port routing at `api.prg32.dream.test`,
   idle timeouts, message limits, and restart behavior.

**Go:** single-process parity with explicit operational limits.
**No-go:** multi-replica WebSocket claims without a separate relay/state design.

## Before M8 — cutover gate

1. Take a known-good SQLite + filesystem snapshot and rehearse restore.
2. Run the complete API, binary, firmware score/metrics, auth, publishing,
   reconciliation, backup, and WebSocket evidence suite through the real Compose
   and Traefik topology.
3. Confirm one writer per domain and record the exact route switch/rollback
   commands.
4. Monitor errors, latency, memory, SQLite lock/busy events, filesystem/index
   divergence, and firmware retry behavior during a bounded canary.

**Go:** only after all domain acceptance criteria are green.
**No-go:** removing Flask or changing public routing merely because Fastify builds.

## Safely deferred

* a relational catalog replacing `index.json`;
* Drizzle migrations against operational data;
* multiplayer persistence in SQLite;
* broad Flask refactoring;
* OIDC/SAML migration;
* speculative indexes and normalization of JSON metadata snapshots;
* score/metrics contract redesign;
* production deployment or data migration.

## Dependency ordering

```text
M5.A audit
  -> publication reconciliation + kill-point evidence
  -> score-auth decision + firmware fixture
  -> schema fingerprint + retention decision
  -> M5.2 review/publication parity
  -> M6 scores/metrics/admin writers
  -> M7 WebSocket parity
  -> M8 controlled canary/cutover
  -> M9 Flask removal
```

## Compatibility and rollback

The safest rollback remains route-level: Flask keeps public authority while
Fastify is isolated or shadowed. For filesystem workflows, rollback requires
quiescing writes, running reconciliation, and restoring the pre-operation
SQLite/filesystem snapshot if compensation cannot prove consistency. Do not
delete old files or invalidate existing Bearer tokens as a shortcut.

Any future schema change must be classified before implementation:

| Change | Classification |
| --- | --- |
| New read-only TypeScript query over existing schema | SAFE if no mutation occurs |
| Reconciliation metadata/operation record | MIGRATION_REQUIRED; review backup/rollback first |
| Removing redundant index | MIGRATION_REQUIRED; compare plans and write cost |
| New relational catalog authority | MIGRATION_REQUIRED, high risk |
| Changing score authentication or metrics ownership | BREAKING unless coordinated with PRG32 and clients |
| SQLite multiplayer state | DEFER |

## Final recommendation

Proceed only with M5.2 consistency design, synthetic failure testing, and the
cross-repository score-auth decision. Keep the current hybrid storage model and
Flask sole-writer rule. Do not begin M6 implementation automatically from this
audit.
