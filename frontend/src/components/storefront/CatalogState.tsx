import Link from "next/link";

import { Button } from "../ui/button";

export function CatalogLoading() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading cartridges">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-72 animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]" />
      ))}
    </div>
  );
}

export function CatalogEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
      <p className="text-lg font-semibold">{filtered ? "No cartridges match this search." : "The catalog is empty."}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {filtered ? "Try a different title, author, tag, or game identifier." : "Published cartridges will appear here when they are available."}
      </p>
    </div>
  );
}

export function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">
      <p className="text-lg font-semibold">The catalog could not be loaded.</p>
      <p className="mt-2 text-sm">The Store API may be unavailable. Try again in a moment.</p>
      <Button type="button" variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>
    </div>
  );
}

export function DetailMissing() {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
      <p className="text-lg font-semibold">Cartridge not found</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">This cartridge may be unpublished or no longer available.</p>
      <Link className="mt-5 inline-flex min-h-10 items-center rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" href="/">Back to the catalog</Link>
    </div>
  );
}
