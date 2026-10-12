# M5.A — SQLite Schema Assessment

**Date:** 2026-10-12
**Operational rule:** Flask remains the sole writer; this document authorizes no schema change.

## Schema inventory

The current unified SQLite model contains 11 application tables. The same shape
is represented read-only in `backend/src/db/schema.ts:4-194`; Flask creates or
extends it in the modules listed below.

| Table | Key and important columns | Foreign keys/actions | Indexes/constraints | Creator/writers | Main readers |
| --- | --- | --- | --- | --- | --- |
| `users` | `id`; username, email, password/external identity, role, timestamps | none | UNIQUE username/email; `(external_provider, external_id)` | auth/bootstrap/admin | auth, admin, metrics ownership |
| `api_tokens` | `id`; `user_id`, token hash, timestamps | users CASCADE | UNIQUE token hash; user index | auth token routes | bearer authentication |
| `groups` | `id`; unique name, created_at | none | UNIQUE name | auth/admin | principal/group checks |
| `user_groups` | composite `(user_id,group_id)` | users/groups CASCADE | composite PK | auth/admin | principal group lookup |
| `registration_tokens` | `id`; email, token hash, expiry/use | none | UNIQUE hash; `(email,used_at,expires_at)` | auth registration | registration completion |
| `store_settings` | text `key` | none | PK key | setup/auth/catalog reads | settings/discovery |
| `runs` | text `run_id`; firmware metadata, timestamps, nullable `user_id` | users, no explicit delete action | PK run_id | metrics ingestion | metrics detail/list/stats |
| `samples` | `id`; `run_id`, frame and timing fields | runs CASCADE | UNIQUE `(run_id,frame)` plus explicit same-key index; `(run_id,frame_us)` | metrics ingestion | detail/CSV/Markdown/statistics |
| `scores` | `id`; game/player/score/created_at/submitted_by | none | `(game,score DESC,created_at ASC)` | score POST | score list/stats/UI |
| `download_events` | `id`; game/version/architecture, optional user/IP hash/UA, text time | no FKs | `(game_id,downloaded_at)`, architecture | Flask download route | stats/admin |
| `cartridge_submissions` | `id`; game/version/status, textual actor snapshots, JSON metadata/architectures, pending path | users SET NULL for submit/reviewer | `(status,created_at)` | publish/review and M5.1 isolated writer | review/admin/API |

There are no triggers, views, multiplayer tables, catalog tables, or
version-history tables in the inspected schema. SQLite foreign keys are enabled
on Flask connections (`cartridge_store/database.py:17`) and in the disposable
Fastify fixture (`backend/src/disposable-fixture.ts:11`).

## Relationship and integrity review

### Sound current relationships

* token ownership and group membership cascade from users/groups;
* samples cascade from runs, preventing sample orphans when a run is deleted;
* submission actor IDs use `SET NULL`, while actor names are retained as audit
  snapshots;
* unique run/frame prevents duplicate firmware samples.

### Gaps to retain as explicit risks

* `runs.user_id` and `download_events.user_id` are not declared with the same
  explicit action/relationship strength as samples and submissions in the Flask
  compatibility schema. Do not add actions without checking legacy deletion
  behavior.
* scores and download events refer to filesystem catalog identifiers as text.
  This is deliberate while the catalog is filesystem-authoritative; adding FKs to
  a new relational catalog would change backup and deletion semantics.
* `status`, `role`, and architecture values are text without SQLite CHECK
  constraints. Application validation is the current compatibility boundary.
* `metadata_json` and `architectures_json` are intentional workflow snapshots,
  not queryable relational catalog data. Parsing them into new tables would add
  migration and synchronization cost without a demonstrated current query need.
* timestamps mix ISO-like text (`users`, submissions, download events) and Unix
  integer seconds/milliseconds (`runs`, samples, scores). TypeScript must preserve
  the existing representation per table.

## Significant query audit

| Query family | Call site | Plan result on synthetic schema | Assessment |
| --- | --- | --- | --- |
| Score filter/order/limit | `cartridge_store/scores.py:55-65` | `SEARCH scores USING INDEX scores_game_score_idx (game=?)` | Existing index matches the filtered leaderboard; no speculative index |
| Samples by run/order frame | `metrics_report.py:38-49`, `users.py:58-70` | `SEARCH samples USING INDEX samples_run_frame_idx (run_id=?)` | Good access path; explicit index duplicates the unique key |
| Pending submissions | `review.py:140-157` | `SEARCH cartridge_submissions USING INDEX cartridge_submissions_status_idx (status=?)` | Existing index supports status queue; ordering may sort within status |
| Downloads by game/date | `stats.py:125-145` | Covering search using `(game_id,downloaded_at)` | Existing index matches main filter |
| Downloads by architecture | `stats.py:176-206` | Covering search using architecture index | Existing index matches main filter |
| User run summary | `users.py:94-117` | Filtered/grouped join plus one sample query per returned run | N+1 behavior; measure and consider bounded aggregation in M6 |

The plans above were generated with `sqlite3 ':memory:'` and synthetic DDL; no
operational database was touched. Since no production cardinality metrics are
available, no performance improvement is claimed.

## Index assessment

The explicit `samples_run_frame_idx` is structurally redundant with the unique
constraint's SQLite auto-index on `(run_id,frame)`. Removing it could reduce
insert/update amplification, but the operation requires a reviewed table rebuild
or migration and must compare plans before/after. It is therefore a M6
`MIGRATION_REQUIRED` candidate, not a M5.A edit.

No new index is justified by the inspected query plans. In particular, adding
indexes on `scores.player`, `runs.user_id`, or `download_events.version` is
speculative until real query frequency and cardinality are measured.

## Growth and retention

Potentially unbounded tables:

* `samples`: one row per accepted firmware sample;
* `runs`: one row per metrics run;
* `scores`: one row per accepted score;
* `download_events`: one row per public download;
* `registration_tokens`: expired/used tokens unless cleaned;
* `cartridge_submissions`: review history unless policy removes it.

The repository contains no scheduled cleanup or archive job for these tables.
The relevant scenarios are classroom-scale single-store operation and optional
profiling runs with up to the current request/queue limits; actual production
traffic is unavailable. M6 must define retention, export bounds, and WAL/file
growth monitoring before migrating these writers.

## Transactions and deletion behavior

Flask commits individual logical writes. Metrics batches use a database
transaction around run/sample work (`cartridge_store/metrics.py:193-270`).
Catalog publication uses filesystem compensation plus a later SQLite status
commit, not one atomic unit (`review.py:241-258`). Backup uses SQLite's backup
API and archives the filesystem separately (`app.py:847-920`). Restore replaces
operational files after temporary extraction and validation, so it requires
maintenance/recovery controls.

No destructive migration is authorized. Before any schema change, capture a
disposable schema snapshot, data compatibility fixture, and backup/restore proof.
