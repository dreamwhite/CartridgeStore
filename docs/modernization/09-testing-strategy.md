# Testing strategy

## Current baseline

The original repository baseline contained 39 pytest tests. The remediated
repository now has **53 passing backend tests**, including API contract
fixtures and a real WebSocket integration test. The frontend has Vitest,
React Testing Library, strict TypeScript, ESLint, a production build, and a
repeatable development HMR probe. Browser E2E, coverage reporting, and CI
remain future work.

## Test layers

### Backend unit tests

- `safe_game_id`/`safe_version` and path containment.
- Metadata/colophon ABI and shape validation.
- Cartridge header/trailer/TLV parsing and unknown-block preservation.
- ZIP manifest filenames, architecture normalization, image signatures, and resource limits.
- Pagination, query matching, stats date/granularity, and error-code mapping.
- Auth role/group/token ownership and registration token expiry.
- Backup path validation and staged restore logic.

### Backend integration tests

- Fresh app schema initialization and legacy DB path fallback.
- Full publish → pending → verify → catalog → version/architecture download journey.
- Failed publish/verify rollback leaves no orphan index/file/submission state.
- Session, Bearer, legacy token, OIDC/SAML adapter boundaries, CSRF, and cookie flags.
- Run creation/batch/finish/detail/CSV/report for anonymous, owner, other user, and admin.
- Scores, download events, public stats, and rate/size limits.
- Multiplayer join/state/leave and configured role behavior.

### Frontend unit/component tests

Use Vitest and React Testing Library once the frontend exists:

- API response adapters and Zod schemas.
- Query key/invalidation behavior.
- Cards/badges/buttons/forms/tables/dialogs and loading/error/empty states.
- Theme and reduced-motion preference persistence.
- Upload validation display without trusting client validation.
- Keyboard navigation and accessible names for primary components.

### Contract tests

Build fixtures from the current Flask test client. For each endpoint, assert method/path/query, status, content type, required legacy fields, auth behavior, and representative error shapes. Run the same fixtures against the React API adapter; React tests must not invent fields absent from the fixture.

### End-to-end tests

Use Playwright against a provisioned Flask app and built frontend:

1. Browse/search/paginate/open a cartridge.
2. Select version/architecture and download a binary; verify bytes and filename.
3. Register/login/logout; validate protected routes and CSRF.
4. Create/revoke a token; ensure the secret is not shown later.
5. Upload ZIP, see validation errors, see pending submission.
6. Editor verifies/rejects; public catalog changes accordingly.
7. Admin manages users/groups/settings and performs a backup rehearsal.
8. View scores/stats/runs using only real seeded test data.
9. Check mobile viewport, keyboard flow, reduced motion, and an accessibility scan.

## Functional-equivalence gate

For each migrated screen, run the same fixture set against the old Jinja route and React data layer. Equivalence means: same resource ids, versions, architecture availability, download URL/bytes, auth outcome, error status, and supported actions. Pixel equality is not required; semantic and behavioral equality is.

## Performance and accessibility measurement

Measure before setting budgets:

- Flask API latency for catalog/detail/download metadata at current and representative catalog sizes.
- Built JS/CSS transfer size and route-level chunk sizes.
- Largest Contentful Paint, Interaction to Next Paint, and cumulative layout shift on a representative mobile/desktop environment.
- Database query count/time for stats, runs, and admin tables.
- Upload validation duration and peak memory for accepted/rejected bundles.

Acceptance criteria should be relative to the recorded baseline: no P0 journey regression, no unbounded increase in catalog payloads, route-level JS loaded only when needed, and WCAG 2.2 AA checks passing for migrated screens. Do not set arbitrary numeric budgets before measurement.
