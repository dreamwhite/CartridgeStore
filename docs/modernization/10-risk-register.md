# Migration risk register

Likelihood and impact are qualitative: Low, Medium, High. Rollback assumes the current Flask/Jinja release remains deployable until the relevant React milestone is accepted.

| ID | Risk | Likelihood | Impact | Mitigation | Verification | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Auth/session or CSRF regression blocks users or permits cross-site mutation | High | Critical | Security stage first; same-origin client; explicit cookie policy; contract tests | Browser auth matrix and Playwright CSRF tests | Route switch back to Jinja; restore prior image |
| R-02 | Fixed bootstrap credential remains exploitable during rollout | High | Critical | Replace bootstrap flow before React protected screens | Fresh-data deployment test and forced-change test | Disable new rollout; restore auth release with backup |
| R-03 | API field/status/error drift breaks firmware/tools | Medium | Critical | Freeze fixtures; add fields only; contract test every legacy route | Existing pytest plus compatibility fixture suite | Keep Flask API unchanged; revert frontend adapter |
| R-04 | Download URL/MIME/bytes or architecture selection changes | Medium | Critical | Treat `esp32c6`, `qemu`, query params, filename, and MIME as ABI | Download byte/hash and firmware-client tests | Keep existing download route and link generation |
| R-05 | ZIP bomb or metrics flood exhausts resources | High | High | Entry/size/count limits, rate limiting, staged extraction | Adversarial fixture and controlled resource test | Disable upload UI/new endpoints; retain old route under limits |
| R-06 | Catalog index and SQLite submission state diverge | Medium | High | Reconciliation tool, idempotency, failure-injection tests | Kill-point tests around publish/verify | Restore pre-migration backup or re-run reconciliation |
| R-07 | Database migration/Drizzle schema loses constraints or data | Low initially, High if attempted | Critical | Defer; introspect copy; backup; dry-run; dual comparison | Table/row/FK/index diff and restore rehearsal | Restore database/filesystem backup; retain Python writer |
| R-08 | React omits partial/multi-route behavior such as OIDC, SAML, tokens, or admin fallback | Medium | High | Functional inventory and per-feature acceptance gates | E2E route matrix and manual external-auth rehearsal | Keep feature on Jinja pages |
| R-09 | Metrics samples/reports expose other users' data | High | High | Unified authorization on JSON/CSV/Markdown; explicit anonymous-run policy | owner/other/admin/anonymous tests | Keep export routes server-side while patch is deployed |
| R-10 | Backup archive leaks provider/SMTP secrets or restore deletes current data | Medium | Critical | Redaction/encryption, staged restore, pre-restore archive, CSRF | Backup content inspection and failed-restore test | Disable restore UI; restore pre-restore archive |
| R-11 | Performance regresses from duplicated fetching or oversized JS | Medium | Medium | Query ownership rules, route splitting, baselines, browser measurements | Lighthouse/trace and API request assertions | Revert route to Jinja and prior asset build |
| R-12 | Accessibility regressions in new component library | Medium | High | Primitive acceptance rules, keyboard tests, automated/manual audit | axe/Playwright plus keyboard review | Keep old screen until fixed |
| R-13 | Docker/reverse-proxy/WebSocket deployment diverges | Medium | High | Keep port/data/WebSocket contracts; rehearse Docker and proxy | `docker compose config`, build, health/WebSocket smoke test | Deploy previous image/config |
| R-14 | Dependency drift or vulnerable frontend package enters build | Medium | Medium/High | Lockfile, update review, audit/SBOM, minimal dependencies | CI install from lockfile and security scan | Rebuild prior locked artifact |

## Release gate ordering

R-01 through R-05 and R-09 must be resolved before protected React workflows. R-06, R-07, and R-10 must be resolved before any database or backup format change. R-11 through R-14 must be verified before production cutover.
