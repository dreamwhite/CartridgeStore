# PRG32 Cartridge Store — UI.5 Semantic Design System & Component Consolidation

Date: 2026-10-16  
Scope: semantic frontend tokens, shared primitives, status presentation,
form associations, and design-system cleanup.  
Backend/API changes: none.  Operational cutover: **NO-GO**.  Flask retirement:
**NO-GO**.

## 1. Executive summary

UI.5 is complete for the authorized design-system scope. The frontend now has
semantic light/dark tokens for success, warning, danger, input borders, and
focus rings. Repeated status message styling is centralized in
`StatusMessage`; `WorkflowMessage`, catalog errors, account feedback,
authentication feedback, metrics/profile errors, admin notices, and federation
notices consume the same semantic vocabulary.

The shared `Button`, `Badge`, `Field`, `Input`, `Textarea`, `Select`, and
dialog interaction styles were consolidated without changing API calls,
query ownership, authentication ceremonies, publishing mutations, routes, or
backend behavior. A duplicate `destructive` button variant and obsolete
unconsumed badge variants were removed. The active `published` badge label is
retained because the cartridge detail surface still consumes it, but it uses
the semantic success palette.

Decision markers:

```text
UI5_SEMANTIC_TOKENS_GO
UI5_DARK_LIGHT_TOKENS_GO
UI5_SHARED_PRIMITIVES_GO
UI5_FORM_CONSISTENCY_GO
UI5_STATUS_PRESENTATION_GO
UI5_LEGACY_CLEANUP_GO
UI5_ACCESSIBILITY_GO
UI5_RESPONSIVE_GO
UI5_VISUAL_REGRESSION_GO
UI5_FRONTEND_REGRESSION_GO
UI5_DESIGN_SYSTEM_GO

M555_BACKEND_FREEZE_GO
OPERATIONAL_CUTOVER_NO_GO
FLASK_RETIREMENT_NO_GO
```

## 2. Scope and authorization

Implemented only UI.5. Existing working-tree changes from earlier milestones
were preserved. No reset, cleanup, deployment, Docker restart, database
change, backend change, Authentik change, Traefik change, or sibling-repository
change was performed. No commit or push was performed.

The roadmap was not rewritten because UI.5 explicitly requested one new
milestone report and prohibited unrelated documentation changes.

## 3. Starting design-system inventory

The existing system already used `frontend/src/styles/index.css` as its CSS
custom-property source and used Tailwind 4 arbitrary values such as
`var(--color-surface)` and `var(--color-primary)`. The inventory found:

- background, surface, text, border, primary, focus, shadow, radius, and
  layout tokens;
- no first-class success, warning, danger, input, or ring token family;
- raw rose/amber/emerald utilities in authentication, account, workflow,
  federation, metrics, statistics, and admin surfaces;
- duplicate `danger`/`destructive` Button API names;
- duplicated Badge palette implementations for published, verified, pending,
  rejected, and neutral states;
- a `Field` primitive whose id fallback depended on `name`, which left
  nameless fields without a reliable label association;
- repeated status markup with inconsistent roles, dark-mode overrides, and
  spacing;
- direct HTML controls still present in some legacy/workflow surfaces.

## 4. Semantic token architecture

The established `--color-*` convention was extended, rather than introducing
a Tailwind configuration or another token framework.

Added token categories:

| Category | Tokens |
| --- | --- |
| Action | `--color-primary-foreground` |
| Status success | `--color-success`, `--color-success-foreground`, `--color-success-soft` |
| Status warning | `--color-warning`, `--color-warning-foreground`, `--color-warning-soft` |
| Status danger | `--color-danger`, `--color-danger-foreground`, `--color-danger-soft` |
| Controls | `--color-input`, `--color-ring` |

`frontend/src/styles/index.css` defines light and dark values for every new
token. The existing active `--color-focus` selectors in the documentation and
scoreboard legacy markup use a CSS alias to `--color-ring`; the shared
primitives and migrated consumers use `--color-ring` directly. Removing those
last two raw selectors is remaining design-system debt, not a new dependency.

## 5. Light/dark token mapping

Light mode uses restrained green/amber/red status colors over very light
subtle surfaces. Dark mode uses brighter foregrounds and deep tinted surfaces
so status remains readable without returning to large decorative panels.

The ring is violet in both themes, with a lighter dark-mode value. Input
borders are distinct from structural borders while remaining compatible with
the existing neutral/purple identity. Primary foreground switches from white
in light mode to the dark brand foreground in dark mode.

The `StatusMessage` and semantic Badge classes consume these variables, so
theme switching does not depend on runtime color calculation.

## 6. Shared primitive changes

### `StatusMessage`

Added `frontend/src/components/ui/status.tsx` with tones `muted`, `info`,
`success`, `warning`, and `danger`. Default live-region behavior is:

- `danger` → `role="alert"`;
- `success` and `warning` → `role="status"`;
- `muted` and `info` → no forced live-region role.

Callers may override the role where an existing contract requires it, such as
provider discovery failure in the login panel.

### Button

`frontend/src/components/ui/button.tsx` now uses semantic primary/danger/ring
tokens and has one destructive action variant: `danger`. The unused
`destructive` alias was removed. Existing size, loading, disabled, `asChild`,
keyboard, and submit behavior remain intact.

### Badge

`frontend/src/components/ui/badge.tsx` now exposes semantic `success`,
`warning`, and `danger` variants. Published/verified/pending/rejected styling
was consolidated into semantic status colors. Product/domain variants such as
`game`, `version`, `architecture`, and `utility` remain where they have real
consumers.

### Field and controls

`frontend/src/components/ui/input.tsx` now:

- generates a stable id with `useId()` when `id` and `name` are absent;
- renders a separate `<label htmlFor>` instead of including help/error text in
  the label's accessible name;
- links help and error text with `aria-describedby`;
- exposes `aria-errormessage` and `aria-invalid` for invalid fields;
- uses the semantic input/ring/danger tokens;
- preserves controlled/uncontrolled HTML input behavior and autocomplete.

The shared Radix Select trigger uses the input and ring tokens. Existing
Radix keyboard behavior was retained.

## 7. Button consolidation

Active consumers continue to use primary, secondary, outline, ghost, icon, and
danger actions. The development showcase was updated from `destructive` to
`danger`. Loading state continues to expose `aria-busy`, render a spinner, and
disable the action. No action callback, navigation, form submission, or
mutation was changed.

## 8. Field and form consistency

The improved `Field` primitive is now used in login, account security,
administrator reauthentication, and the existing account/token surfaces. The
login username/password controls now have explicit semantic labels through the
shared primitive. The reauthentication password field is also associated with
its label while retaining password-manager semantics.

Legacy direct controls remain in several large pre-existing workspace forms
(notably registration, scoreboard filters, setup, and portions of admin and
review). Their behavior was not rewritten in this milestone. They remain
follow-up candidates for a focused form pass because replacing them wholesale
would expand UI.5 into orchestration and security-sensitive workflow work.

## 9. Status presentation consolidation

Migrated surfaces include:

- catalog load errors and missing workflow states;
- login/session/provider/passkey feedback;
- account session, password, token, and passkey feedback;
- protected-route and federation authorization feedback;
- federation/admin success and error notices;
- publishing completion and bundle errors;
- creator submission ownership/status states;
- metrics and profile errors;
- statistics errors.

Status is not communicated through color alone: messages retain readable text,
semantic live-region roles, and explicit action labels. The catalog error keeps
its lightweight border treatment instead of becoming a large card.

## 10. Feature migration inventory

| Feature group | Result |
| --- | --- |
| Storefront/catalog | Catalog error and missing-state presentation uses semantic primitives; download/detail behavior unchanged. |
| Authentication | Login feedback and controls use shared status/field primitives; auth requests and ceremonies unchanged. |
| Account/security | Session, password, token, and passkey feedback uses semantic status; token/passkey mutations unchanged. |
| Creator workflow | Ownership notice, submission statuses, bundle errors, and completion feedback use semantic status/badges. |
| Review/admin | Admin notices and federation/re-auth feedback use semantic primitives; review/admin orchestration unchanged. |
| Metrics/profile/statistics | Error presentation uses the shared danger tone. |
| Layout/foundation | Focus ring references were migrated in active layout primitives and the development showcase reflects the consolidated variants. |

## 11. Legacy code removed

Removed within UI.5 scope:

- the unconsumed `destructive` Button variant;
- unconsumed duplicate Badge variants for `demo`, `verified`, `draft`,
  `pending`, and `rejected`;
- repeated status color combinations from the migrated consumers;
- nameless `Field` id ambiguity.

No route compatibility component, API client, authentication adapter, query
key, or backend compatibility code was removed.

## 12. Accessibility verification

Implemented/verified:

- explicit label/control association for shared `Field` controls;
- error descriptions linked to controls;
- invalid state exposed with `aria-invalid` and `aria-errormessage`;
- alert/status roles differentiated by urgency;
- loading buttons expose `aria-busy` and disabled state;
- existing keyboard-capable Radix Select/Dialog/Dropdown primitives retained;
- visible focus ring now uses a theme-aware semantic token;
- status messages retain understandable text independent of icon/color.

Automated component tests cover Button loading/danger behavior, Field
association/error metadata, and StatusMessage alert/status behavior.

## 13. Responsive verification

A read-only Playwright browser check used the existing declared
`@playwright/test` dependency against the local public Explore route at:

```text
375, 768, 1024, 1440, 1920 px
```

At every width, `document.documentElement.scrollWidth` matched the viewport;
no horizontal overflow was observed. The check also toggled the theme at each
width. A second 375px route sweep verified no overflow for `/`, `/explore`,
`/login`, `/docs`, and `/games/org.example.missing`.

This was read-only public browsing. No authentication, mutation, form
submission, provider login, or private data access was performed.

## 14. Dark-theme visual verification

The live Explore route was inspected in the local Dream runtime and toggled to
dark mode. The screenshot showed the existing PRG32 technical preview,
neutral/purple surfaces, borders, input control, and status accents remaining
readable. The browser check confirmed theme state changes at all required
breakpoints.

## 15. Light-theme visual verification

The same live Explore route was inspected in light mode after restoring the
theme. The page retained the approved restrained purple, neutral surfaces,
thin borders, compact geometry, and full-width composition. No visual redesign
or replacement component library was introduced.

## 16. Functional regression checks

No backend files, API contracts, database files, routes, query keys, auth
ceremonies, publishing mutations, or Docker/Traefik/Auth provider files were
changed by UI.5. Existing login tests continued to require the prior provider
error role and local-login behavior; the semantic migration preserved both.

## 17. Tests added or updated

Added/extended:

- `frontend/src/components/ui/status.test.tsx` — semantic tones and roles;
- `frontend/src/components/ui/input.test.tsx` — generated ids, labels,
  invalid state, error association, and typing;
- `frontend/src/components/ui/button.test.tsx` — danger and loading states.

The frontend suite now contains **35 Vitest files and 87 passing tests**.
The UI.4 baseline was 33 files and 82 tests; no meaningful existing test was
deleted.

## 18. Validation commands and results

Executed with Node.js 24 via `nvm use 24` (local version observed:
24.20.0):

```text
pnpm --dir frontend run typecheck  PASS
pnpm --dir frontend run lint       PASS
pnpm --dir frontend run test -- --run  PASS — 35 files, 87 tests
pnpm --dir frontend run build      PASS — Next.js 16.4.0; 40 static generation units
git diff --check                  PASS
```

Browser verification command:

```text
pnpm --dir frontend exec node --input-type=module -e '... @playwright/test ...'
```

The final corrected command passed for all five widths and five public routes.
The first exploratory import used the undeclared package name `playwright`;
it failed without changing the repository, then the declared
`@playwright/test` package was used successfully.

## 19. Files changed

UI.5 implementation files:

- `frontend/src/styles/index.css`;
- `frontend/src/components/ui/button.tsx` and `button.test.tsx`;
- `frontend/src/components/ui/input.tsx` and `input.test.tsx`;
- `frontend/src/components/ui/status.tsx` and `status.test.tsx`;
- `frontend/src/components/ui/badge.tsx`, `select.tsx`, and the development
  showcase;
- migrated auth/account/workflow/admin/federation/storefront/metrics/profile
  consumers listed in sections 9 and 10.

The worktree contained many pre-existing modified and untracked frontend files
from earlier milestones. They were preserved and not reclassified as UI.5
changes merely because they appear in `git status`.

## 20. Remaining design-system debt

- Two large legacy JSX lines (`DocumentationIndex` and `Scoreboard`) still
  reference the existing `--color-focus` name through a CSS alias to the new
  ring token.
- Registration, setup, scoreboard, review, and portions of admin still contain
  direct HTML controls; they retain existing labels and behavior but should be
  migrated in a dedicated form-consistency pass.
- Some feature headings and links still use intentional purple accent utilities
  rather than status tokens. They are brand/decorative uses, not status colors.
- The `published` Badge label remains as an active domain consumer while its
  palette is semantic success.

These are bounded follow-ups and do not require a new UI library or runtime
theme system.

## 21. Deferred architecture work

Explicitly deferred:

- TanStack Query key/schema/client consolidation;
- WebAuthn adapter extraction;
- Admin/Login/Account/Review orchestration splitting;
- broad directory restructuring;
- new E2E infrastructure or Fumadocs;
- backend, Flask, Fastify, database, Docker, Traefik, and Authentik work;
- deployment or operational cutover.

## 22. Next milestone readiness

The frontend is ready for a later focused form migration or feature-owned
workspace refactoring. The next milestone should choose one bounded area,
preferably completing direct-control migration in registration/review/admin,
without combining it with query ownership or authentication architecture.

## 23. Final decision

`UI5_DESIGN_SYSTEM_GO`.

UI.5 acceptance is satisfied for the authorized semantic design-system scope:
tokens exist in both themes, primitives use them, major status surfaces are
consistent, core form associations are covered, obsolete variants were
removed, responsive/theme checks passed, and frontend typecheck/lint/tests/build
all passed.

This decision does not authorize operational migration, production routing
changes, Flask removal, backend changes, or deployment.
