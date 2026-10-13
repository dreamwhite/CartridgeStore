# PRG32 Cartridge Store — M2.1 Developer Ownership API and Disposable Workflow Integration

Date: 2026-10-14
Status: **GO for isolated M2.1 workflow; NO-GO for operational Fastify cutover or Flask retirement**

## Executive result

M2.1 is implemented and verified against the disposable Fastify writer:

- the unhealthy writer environment was repaired without deleting volumes or
  data;
- `GET /api/submissions/mine` now returns only submissions owned by the
  authenticated server-side principal;
- the Next.js Developer Workspace renders real ownership-scoped submission
  data and actual backend statuses;
- the complete developer-to-reviewer lifecycle was exercised over HTTP using
  synthetic identities, a valid ZIP bundle, disposable SQLite, and disposable
  filesystem storage;
- Flask remains the operational owner and public routing was not changed.

No production data, operational Flask SQLite/filesystem state, persistent
Authentik state, Traefik configuration, database schema, firmware repository,
deployment, commit, or push was changed.

## 1. Docker diagnosis and repair

Initial state:

- `auth-writer` was `Up` but unhealthy and had no listening Fastify process;
- its `tsx watch` process failed importing `@fastify/websocket` from
  `/app/src/multiplayer/routes.ts`;
- the host bind mount
  `.local/backend/node_modules:/app/node_modules` did not contain the package;
- the `dev-hot` image layer was also older than the dependency addition, so
  rebuilding alone would not repair the already-mounted host dependency tree;
- `auth-writer-edge-proxy` was unhealthy because nginx returned 502 while its
  `auth-writer:5090` upstream refused connections;
- the two health failures were causally related, not an nginx or Traefik
  routing problem.

Targeted repair performed:

```text
docker compose --profile backend run --rm --no-deps backend pnpm install --frozen-lockfile
docker compose --profile dev up -d --force-recreate auth-writer auth-writer-edge-proxy
```

The install refreshed only the reproducible disposable dependency mount and
installed `@fastify/websocket` `11.3.4` plus its declared development
dependencies. No Docker volume prune, `down -v`, system prune, database
deletion, cartridge deletion, or external-network change was performed.

The Compose lifecycle was also corrected so future dependency changes are not
masked by the bind mount: `auth-writer` now runs
`pnpm install --frozen-lockfile && pnpm dev` on each start. The production
multi-stage image remains unchanged.

Final writer evidence:

- `auth-writer`: container running and **healthy**;
- `auth-writer-edge-proxy`: container running and **healthy**;
- `GET http://127.0.0.1:5091/health`: HTTP 200;
- `@fastify/websocket`: resolved inside the running writer as `11.3.4`;
- `PRG32_BACKEND_AUTH_WRITE_ENABLED=true`, submission write enabled in `test`
  mode and rooted at disposable `/writer-store`;
- score and metrics write gates remained `false`;
- Flask remained healthy and its public routing was not changed.

These states are reported separately: running, healthy, HTTP reachable, and
workflow writer enabled are not treated as equivalent.

## 2. Ownership model and API contract

Ownership already existed in the server-controlled field
`cartridge_submissions.submitted_by_user_id`. `SubmissionService` writes it
from `Principal.id` during `POST /api/publish/bundle`. The implementation does
not infer ownership from title, author metadata, username input, or a caller
parameter.

New route:

```text
GET /api/submissions/mine[?status=pending|verified|rejected|all&page=1&per_page=25]
```

Authorization:

- unauthenticated session/bearer: HTTP 401, `login required`;
- authenticated principal without `catalog:submit`: HTTP 403,
  `permission_denied`;
- authenticated principal with a null identity: HTTP 403,
  `ownership_unavailable`;
- no CSRF is required because this is read-only;
- `user_id` is ignored as a selector and cannot override the authenticated
  principal;
- editor review permissions are neither required nor granted by this route.

Response:

```json
{
  "ok": true,
  "submissions": [
    {
      "id": 1,
      "game_id": "org.example.demo",
      "title": "Demo",
      "version": "1.0.0",
      "status": "pending",
      "created_at": "2026-10-14 00:00:00",
      "reviewed_at": null
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 25,
    "total": 1,
    "pages": 1,
    "has_next": false,
    "has_prev": false,
    "next_page": null,
    "prev_page": null
  }
}
```

The response deliberately excludes `pending_dir`, stored paths, reviewer
identity, raw metadata, architectures, and journal fields. The existing
reviewer queue and detail routes retain their existing contracts and RBAC.
There is no review-feedback column or contract in the current schema, so no
feedback is fabricated. Supported submission statuses remain exactly
`pending`, `verified`, and `rejected`; no `draft` or `published` state was
introduced.

The query filters in SQLite with `submitted_by_user_id = principal.id`, orders
by `created_at DESC, id DESC`, counts separately, and applies bounded
pagination (`per_page` maximum 100). There is currently no owner index; this
is documented performance debt rather than a silent schema migration.

## 3. Next.js workspace integration

The existing `/__workflow-fastify/*` rewrite remains the only frontend
boundary. The browser never receives the Fastify target and there is no Flask
fallback or BFF.

`/workspace` now displays:

- the authenticated principal, role, groups, and effective permissions;
- real ownership-scoped submissions;
- title, stable submission ID, game ID, version, timestamp, and status;
- accessible status badges for Pending review, Verified, and Rejected;
- an empty state and unavailable/authentication/permission errors;
- navigation to submit another cartridge.

Developer-owned detail and review-feedback routes do not exist in the backend
contract, so the workspace does not fabricate links or fields for them.

Frontend response validation was added for the new envelope. Component tests
cover authenticated data, empty ownership, and pending/verified/rejected
status rendering.

## 4. Disposable publishing and review smoke

The smoke used only `.local/writer/auth-data`, `.local/writer/shadow`, and
`.local/writer/store`, synthetic users/tokens, and a synthetic valid PRG32 ZIP.
It did not use Flask's database or filesystem.

Executed lifecycle:

1. developer A authenticated through Fastify login and CSRF;
2. developer A submitted a valid ZIP and received a pending submission;
3. developer A listed `/api/submissions/mine` and saw exactly their record;
4. developer B authenticated and saw zero records;
5. a caller-supplied `user_id=2` did not change developer A's result;
6. invalid ZIP returned the existing stable validation error;
7. reviewer authenticated and loaded the global pending queue;
8. reviewer inspected the submission detail;
9. approval without CSRF returned `csrf_failed` HTTP 403;
10. reviewer approved with CSRF through the existing review service;
11. developer A's ownership list with `status=verified` showed the final
    authoritative state;
12. the expected cartridge artifact existed under the disposable published
    store.

Final HTTP evidence after writer recreation also showed:

```text
developer_a_visible=1
developer_b_visible=0
reviewer_queue_visible=true
csrf_enforced=true
final_status=verified
disposable_artifact=true
```

The existing review service and publication consistency service performed the
approval. No submission row, publication journal, or binary was manually
updated to force the result.

## 5. Tests and verification

Node checks used Node `24.20.0` through `nvm use 24`.

| Check | Result |
| --- | --- |
| Fastify typecheck | PASS |
| Fastify ESLint | PASS |
| Fastify tests | PASS — 28 files, 142 tests |
| Fastify production build | PASS |
| Frontend typecheck | PASS |
| Frontend ESLint | PASS |
| Frontend tests | PASS — 14 files, 40 tests |
| Next.js production build | PASS — `/workspace`, `/publish`, `/review` |
| Flask pytest with synthetic test secret | PASS — 64 tests |
| `docker compose --profile dev config --quiet` | PASS |
| `git diff --check` | PASS |

New backend coverage is in `backend/tests/ownership.test.ts` and covers
anonymous/invalid sessions, owner isolation, ignored ownership overrides,
empty lists, status filtering, stable ordering, bounded pagination, invalid
pagination, and separation from the editor queue. New frontend coverage is in
`frontend/src/components/workflow/DeveloperWorkspace.test.tsx`.

## 6. Remaining limitations and decisions

- The owner query has no dedicated `submitted_by_user_id` index. It remains a
  documented SQLite capacity concern and should be addressed only in an
  explicitly authorized schema milestone.
- Review feedback is not represented by the current schema/API.
- Fastify submission/review remains disposable and isolated; Flask remains the
  public operational owner.
- The live HTTP smoke was intentionally local to port 5091 and did not use
  `api.prg32.dream.test`, Traefik, Flask, or persistent Authentik.
- Browser Playwright/E2E remains removed and was not reintroduced.
- `M6.3d.2h.12` was not defined or started.

## Final decision

**M2.1 isolated workflow: GO.** The ownership API, workspace integration,
writer recovery, CSRF/RBAC behavior, disposable publishing, review, and final
publication state are demonstrated with real HTTP requests and isolated data.

**Operational Flask-to-Fastify retirement: NO-GO.** No public route ownership,
database ownership, production filesystem ownership, deployment, or cutover
decision changed.
