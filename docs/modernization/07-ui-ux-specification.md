# UI/UX modernization specification

## Design intent

Cartridge Store should feel like a modern software catalog for experimental RISC-V hardware, not a nostalgia-themed game portal. Use restrained retro references through cartridge imagery, monospace metadata, and small pixel-art details; keep navigation, typography, forms, and accessibility conventional.

## Screens and supported content

### Storefront/catalog

- Hero: service name, educational/RISC-V positioning, primary search action.
- Featured/recent sections only if the backend provides an ordering rule; otherwise use “catalog” and “recently updated” based on `updated_at` with a documented rule.
- Search over current `q` behavior, then add tag/architecture filters only with backend contract support.
- Cards show title, summary, tags, latest version, architectures, screenshot/icon availability, and a clear detail action.
- Use paginated loading; do not silently change existing unpaginated compatibility behavior.

### Cartridge detail

- Overview: title, summary, authors/publisher, tags, metadata ABI, runtime, and compatibility.
- Media: icon/screenshot where the API reports them.
- Versions: current version list and architecture-specific download links.
- Colophon: developer, controls, license, and start prompt when present.
- Scores: leaderboard only when score data exists.
- Do not show source/changelog/reviews/rating tabs as live features without endpoints/data.

### Developer/publishing

- Current capability: upload one ZIP bundle, receive validation errors/submission id, manage API tokens.
- Planned dashboard: current user, owned/submitted records once ownership is formalized, pending submissions, token management, and clear review status.
- Separate “pending review” from “draft” in labels; they are not the same state.

### Review/admin

Use dense, keyboard-friendly tables for pending submissions, users/groups, settings, cartridges, and backup actions. Make destructive actions explicit, confirm them, and expose preconditions and rollback instructions.

### Statistics

Use cards/charts for verified metrics only: download totals/trends/top games/architectures, score leaderboards, and run summaries. Do not display active developers, ratings, or fabricated trend data because the current backend does not provide those metrics.

### Documentation/auth/profile

Keep getting-started/API/publishing documentation reachable from the app, but source it from versioned Markdown or a future docs site rather than duplicating content manually. Auth screens must explain registration email behavior and token one-time reveal. Profile pages should not expose more data than the backend authorization policy allows.

## Design tokens

These are proposed tokens, not current application behavior.

```css
:root {
  --color-bg: #f7f7fb;
  --color-surface: #ffffff;
  --color-surface-muted: #f0eff8;
  --color-text: #201d2b;
  --color-text-muted: #625d70;
  --color-border: #d9d5e5;
  --color-primary: #6d3fc0;
  --color-primary-hover: #572c9e;
  --color-accent: #b784ff;
  --color-success: #1f7a52;
  --color-warning: #9a6500;
  --color-danger: #b4233c;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 1rem;
  --shadow-card: 0 8px 24px rgb(37 23 67 / 8%);
}

[data-theme="dark"] {
  --color-bg: #17151e;
  --color-surface: #24202d;
  --color-surface-muted: #302a3c;
  --color-text: #f4efff;
  --color-text-muted: #c4bad3;
  --color-border: #4b4158;
  --color-primary: #b784ff;
  --color-primary-hover: #d0adff;
  --color-accent: #7d51d1;
}
```

Typography: use a readable UI sans-serif for prose and controls; reserve a monospace face for ids, versions, hashes, and protocol examples. Base size 16px, body line-height at least 1.5, headings with a clear scale, and no all-caps body text.

## Components and variants

Required primitives: `Button` (primary/secondary/danger/quiet), `TextField`, `Select`, `Textarea`, `FileDropzone`, `Card`, `Badge`, `Tabs`, `Table`, `Pagination`, `Alert`, `Dialog`, `Skeleton`, `EmptyState`, `ErrorState`, `ThemeToggle`, `AppShell`, and `Breadcrumbs`.

Components must expose visible focus, disabled, loading, validation-error, and reduced-motion states. Use semantic HTML before ARIA. Icons require accessible labels when not decorative; cartridge images require meaningful alt text where they convey content.

## Responsive behavior

- 0–639px: one-column cards, collapsible navigation, stacked forms, horizontal-scroll tables only when no better card representation exists.
- 640–1023px: two-column catalog/detail support, compact navigation.
- 1024px and above: persistent navigation, wider metadata/detail split, dashboard grids.

Avoid hover-only actions, fixed-width binary controls, and charts that cannot be read on mobile. Respect `prefers-reduced-motion` and provide a no-animation mode.

## Accessibility acceptance rules

- WCAG 2.2 AA target for contrast, focus, keyboard operation, labels, errors, and reflow.
- Every form control has a visible label and programmatic error association.
- Focus order follows the visual order; dialogs trap and restore focus.
- Async upload/review/download status is announced with a live region.
- Color is never the only compatibility/status signal.
- All primary journeys are keyboard-completable without pointer or animation.
