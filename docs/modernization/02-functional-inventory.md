# Functional inventory

Legend: **Existing** means verified in source; **Partial** means a related capability exists but not the requested product behavior; **Missing** means not evidenced; **Proposed** is a modernization enhancement and is not current functionality.

| Feature | Existing | Location | Dependencies | Migration priority | Risk |
| --- | --- | --- | --- | --- | --- |
| Public catalog listing | Existing | `GET /`, `GET /api/games`; [app.py](../../cartridge_store/app.py:179-189), [app.py](../../cartridge_store/app.py:546-574) | JSON index, Jinja | P0 | Low |
| Search | Existing | `q` / `search` query; [store.py](../../cartridge_store/store.py:159-165) | In-memory index | P0 | Medium |
| Categories | Partial | Tags are displayed and searched; no category resource/filter | Metadata tags | P2 | Medium |
| Filtering | Partial | Search only; no platform/tag filter query | JSON index | P1 | Medium |
| Sorting | Partial | Alphabetical title sort only | JSON index | P1 | Low |
| Pagination | Existing | Page/per-page/limit for HTML/API | In-memory list | P0 | Low |
| Cartridge detail | Existing | `/games/<id>`, `/api/games/<id>` | JSON index, parsed artifact | P0 | Medium |
| Icons/screenshots | Existing | Binary API endpoints; PNG/JPEG validation | Filesystem artifact | P0 | Medium |
| Version selection | Existing | `version` query and version list | JSON index | P0 | High |
| Architecture selection | Existing | `esp32c6`, `qemu`, aliases and variant download | PRG32 metadata | P0 | High |
| Binary download | Existing | `/api/games/<id>/download`; event recorded | Filesystem, stats table | P0 | High |
| Metadata/colophon | Existing | PRG32 `META`/`COLO` blocks; ABI validation | `prg32_format.py` | P0 | High |
| Source repository link | Partial | Metadata field is retained/displayed only in review/admin paths | Bundle metadata | P2 | Low |
| Changelog/release history | Missing | Version list exists; no changelog model or endpoint | None | P3 | Medium |
| Ratings | Missing | No rating table/route/template | None | P3 | Low |
| Auth login/logout | Existing | Local forms and session cookie | SQLite users, Flask session | P0 | High |
| Registration | Existing | Email verification flow; SMTP or logged development link | Registration tokens, SMTP | P1 | High |
| API tokens | Existing | Create/list/rename/revoke; token hashes stored | SQLite `api_tokens` | P0 | High |
| OIDC | Partial | Optional Authlib adapter | Authlib, provider config | P2 | High |
| SAML | Partial | Optional python3-saml adapter | IdP config/certificate | P2 | High |
| LDAP | Partial | Configuration warning only; interactive login not implemented | Optional `ldap3` | P3 | Medium |
| Publishing | Existing | Authenticated ZIP upload | ZIP, PRG32 parser, pending files | P0 | Critical |
| Upload validation | Existing/partial | Size, ZIP, manifest, image, architecture, metadata checks | `zipfile`, format validators | P0 | Critical |
| Editor review | Existing | Browser/API verify/reject; editors group | Submission table, filesystem | P0 | High |
| Drafts | Missing | Pending review is not a user-editable draft system | None | P3 | Medium |
| Release management | Partial | Admin/editor can edit descriptive metadata or delete variant/version | JSON index | P1 | High |
| Ownership verification | Partial | Submission records submitter; no per-cartridge owner authorization model | Users/submissions | P1 | High |
| Developer dashboard | Partial | Publish page, tokens, public profile, user run pages; no publication overview | Multiple existing routes | P1 | Medium |
| Download stats | Existing | Per-download event, trend/top-game/architecture reports | `download_events` | P1 | Medium |
| Scores/leaderboard | Existing | API and browser scoreboard, detail chart | `scores`, SVG charts | P0 | Medium |
| Metrics ingestion | Existing | Runs, batches, finish, CSV/report/JSON | `runs`, `samples`, Matplotlib export | P1 | High |
| Multiplayer relay | Existing | WebSocket rooms keyed by cartridge signature | Flask-Sock, in-memory hub | P0 | High |
| Admin users/groups/roles | Existing | `/admin/*` pages and mutations | SQLite auth tables | P1 | High |
| Backup/restore | Existing | Full ZIP backup and restore | SQLite backup, filesystem | P1 | Critical |
| Documentation | Existing | Setup, deployment, API, operations, game development | Markdown docs | P1 | Low |
| PWA install/offline shell | Existing/partial | Manifest and service worker cache | Static assets | P2 | Medium |
| Dark/light theme | Partial | Admin-configurable colors and CSS; fixed light `color-scheme` | Settings table, CSS | P1 | Medium |
| React client | Missing | No package/build source | None | P0 | Medium |

## User journeys to preserve

1. Anonymous user opens the catalog, searches, opens a cartridge, inspects metadata/screenshot/colophon, and downloads the appropriate architecture.
2. Authenticated developer logs in or completes email registration, creates a token, uploads a ZIP bundle, and receives a pending submission id.
3. An editor inspects the submission, changes only descriptive fields, verifies or rejects it, and the verified artifact becomes public.
4. A board/tool client uses discovery, Bearer/legacy token auth, scores, metrics, and multiplayer without browser assumptions.
5. An administrator manages users/groups/settings, downloads a full backup, and restores it after a rehearsal.

## Explicitly unsupported in the first React release

Do not present ratings, comments, category browsing, drafts, source browsing, changelogs, or per-developer cartridge ownership as current features. The backend does not provide them. They should be separate product decisions with data models and API contracts before implementation.
