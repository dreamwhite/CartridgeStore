# Architecture audit

## Severity scale

Critical blocks a safe modernization or risks material compromise/data loss. High can cause security, compatibility, or integrity failures in normal operation. Medium limits scale or maintainability. Low is a quality improvement. Informational records a fact or constraint.

## Findings

### A-01 — High: catalog and database are separate consistency domains

**Description.** Published binary files and `index.json` are the source of catalog truth, while submissions, users, scores, metrics, and stats are SQLite records. There is no transaction spanning them.

**Evidence.** [GameStore.publish](../../cartridge_store/store.py:75-157) writes the artifact and then the JSON index. Review verification calls `_publish_prepared`, then updates the submission row ([review.py](../../cartridge_store/review.py:209-258)).

**Impact.** Process termination, concurrent writers, or disk failure can leave a verified row, pending files, index, and artifacts out of sync. A frontend cannot fix this at the API layer.

**Remediation.** First add reconciliation/repair diagnostics and publish idempotency. Define a commit order and recovery record before any frontend migration. Longer term, decide whether the catalog belongs in SQLite or remains a deliberately separate artifact index.

**Complexity/dependencies.** Medium; requires backup fixtures and failure-injection tests. No migration is required for the first React stage.

### A-02 — High: runtime schema setup is not a release migration system

**Description.** Tables and compatibility columns are initialized on requests through several module hooks.

**Evidence.** `register_auth_routes`, `register_settings`, `register_score_routes`, `register_metrics_routes`, `register_stats_routes`, and `register_review_routes` each register `before_request` initialization. `add_column_if_missing` performs dynamic `ALTER TABLE` ([database.py](../../cartridge_store/database.py:22-35)).

**Impact.** Startup/request latency, ordering coupling, limited rollback visibility, and multi-version deployment ambiguity. A TypeScript/Drizzle process would not share this implicit migration contract.

**Remediation.** Introduce an explicit, tested Python migration command/table before changing schema. Keep migrations idempotent and document backup/rollback. Do not run migrations as part of this audit.

**Complexity/dependencies.** Medium; requires a schema snapshot and production backup rehearsal.

### A-03 — High: route registration and business logic are coupled to the app factory

**Description.** `cartridge_store/app.py` owns HTML routes, API routes, form parsing, backup implementation, and orchestration, while service modules register routes directly on the Flask app.

**Evidence.** The factory registers eight service modules and also defines catalog, admin, discovery, and publish routes ([app.py](../../cartridge_store/app.py:152-648)).

**Impact.** A React client can consume the APIs, but backend changes are harder to isolate and unit-test. A backend rewrite would require porting a broad implicit module contract.

**Remediation.** Before any rewrite, extract application services and typed boundary objects behind existing routes. Preserve route names and response shapes. Avoid blueprints or abstractions that do not reduce a measured coupling problem.

**Complexity/dependencies.** Medium/high; test baseline must remain green.

### A-04 — Medium: catalog reads scale with the complete JSON index

**Description.** Listing, search, and pagination load and transform all games in Python.

**Evidence.** [GameStore.list_games](../../cartridge_store/store.py:159-165) loads every record, filters via `_matches_query`, and sorts in memory; [app.py](../../cartridge_store/app.py:546-574) paginates afterward.

**Impact.** Latency and memory grow with catalog size. It is reasonable for classroom-scale data but has no measured capacity boundary.

**Remediation.** Establish a catalog-size/latency baseline. If needed, add a read index or SQLite-backed catalog projection while preserving API output. Do not move binaries into SQLite.

**Complexity/dependencies.** Medium; requires representative non-production fixtures and response-equivalence tests.

### A-05 — Medium: concurrency policy is implicit

**Description.** SQLite connections are per request, but no timeout/WAL/worker policy is configured; the WebSocket hub is in-memory and process-local.

**Evidence.** [database.py](../../cartridge_store/database.py:11-19) opens a default SQLite connection. [multiplayer.py](../../cartridge_store/multiplayer.py:48-58) stores rooms in a process-local dictionary. Docker runs Gunicorn with threads but no explicit worker count ([Dockerfile](../../Dockerfile:39-44)).

**Impact.** Multiple processes would not share multiplayer rooms; simultaneous index writers can lose updates; SQLite lock behavior is not an explicit operational contract.

**Remediation.** Document single-process limits, set a tested deployment profile, add SQLite busy handling, and explicitly reject multi-worker WebSocket scaling until an external relay is justified.

**Complexity/dependencies.** Medium; depends on the intended classroom/production topology.

### A-06 — Medium: API contracts are documented but not machine-checked

**Description.** JSON shapes and routes are handwritten in Markdown and tests, with no OpenAPI schema or generated client types.

**Evidence.** [docs/api.md](../api.md:1) and the existing `ROUTES_REFERENCE.txt` document shapes; tests assert selected fields ([tests/test_api.py](../../tests/test_api.py:116-317)).

**Impact.** React implementation can accidentally change pagination, auth, error, binary, or compatibility fields.

**Remediation.** Add a versioned contract document generated from or tested against the current API. Generate TypeScript types only after deciding whether they are hand-authored or schema-derived.

**Complexity/dependencies.** Low/medium; no backend rewrite required.

### A-07 — Low: reproducibility and CI are incomplete

**Description.** Requirements are ranged, not locked; there is no CI workflow or frontend toolchain.

**Evidence.** [requirements.txt](../../requirements.txt:1-9), root file inventory, and local validation results.

**Impact.** A clean environment can resolve different dependency versions; regressions are detected locally rather than automatically.

**Remediation.** Add a lock strategy, dependency update policy, CI checks, security scanning, and later Node lockfile only when the React stage begins.

**Complexity/dependencies.** Low/medium.

## Strengths to retain

- Parameterized SQL is used for data values in service queries.
- Filesystem paths for game ids, versions, variants, custom assets, and backup extraction are guarded.
- PRG32 parsing validates headers, trailer lengths, JSON blocks, metadata ABI, colophon ABI, and image signatures ([prg32_format.py](../../cartridge_store/prg32_format.py:223-333)).
- Unknown metadata TLV blocks are preserved during rebuild ([prg32_format.py](../../cartridge_store/prg32_format.py:354-403)).
- The review flow preserves identity/version/authors while permitting descriptive metadata edits ([review.py](../../cartridge_store/review.py:194-206)).
- Existing tests cover compatibility-critical journeys and should become the backend contract suite, not be replaced by frontend tests.
