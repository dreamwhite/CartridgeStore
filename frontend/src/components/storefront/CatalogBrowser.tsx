"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo } from "react";
import Link from "next/link";

import { getCatalog } from "../../lib/api/catalog";
import type { Game } from "../../lib/api/contracts";
import { CatalogEmpty, CatalogError, CatalogLoading } from "./CatalogState";
import { GameCard } from "./GameCard";

type SortMode = "title" | "updated";

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function setUrl(router: ReturnType<typeof useRouter>, pathname: string, values: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const suffix = query.toString();
  router.push(`${pathname}${suffix ? `?${suffix}` : ""}`);
}

function compareGames(left: Game, right: Game, mode: SortMode): number {
  if (mode === "updated") return String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")) || left.title.localeCompare(right.title);
  return left.title.localeCompare(right.title);
}

export function CatalogBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryText = searchParams.get("q") ?? "";
  const architecture = searchParams.get("architecture") ?? "";
  const sort = searchParams.get("sort") === "updated" ? "updated" : "title";
  const page = parsePage(searchParams.get("page"));

  const query = useQuery({
    queryKey: ["catalog", queryText, page],
    queryFn: () => getCatalog({ q: queryText, page, perPage: 100 }),
    staleTime: 30_000,
  });

  const architectures = useMemo(() => Array.from(new Set((query.data?.games ?? []).flatMap((game) => game.architectures))).sort(), [query.data?.games]);
  const visibleGames = useMemo(() => {
    const filtered = architecture ? query.data?.games.filter((game) => game.architectures.includes(architecture)) ?? [] : query.data?.games ?? [];
    return [...filtered].sort((left, right) => compareGames(left, right, sort));
  }, [architecture, query.data?.games, sort]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const searchInput = String(form.get("q") ?? "").trim();
    setUrl(router, pathname, { q: searchInput || undefined, architecture: architecture || undefined, sort: sort === "title" ? undefined : sort, page: undefined });
  }

  function clearFilters() {
    setUrl(router, pathname, {});
  }

  const isFiltered = Boolean(queryText || architecture);

  return (
    <>
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">PRG32 Storefront</p>
            <div className="mt-3 grid gap-7 lg:grid-cols-[1fr_24rem] lg:items-end">
            <div>
              <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Play. Code. Learn.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--color-text-muted)]">Discover published cartridges, inspect their metadata, and download the exact binary for your PRG32 hardware or QEMU.</p>
              <div className="mt-6 flex flex-wrap gap-3"><Link className="inline-flex min-h-10 items-center rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" href="#catalog">Browse cartridges</Link><Link className="inline-flex min-h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" href="/docs/getting-started">Learn PRG32</Link></div>
            </div>
            <form className="flex flex-col gap-2" onSubmit={submit} role="search">
              <label className="text-sm font-semibold" htmlFor="catalog-search">Search cartridges</label>
              <div className="flex gap-2">
                <input key={queryText} id="catalog-search" name="q" defaultValue={queryText} placeholder="Title, author, tag, or ID" className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-600" />
                <button className="min-h-11 rounded-md bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" type="submit">Search</button>
              </div>
            </form>
          </div>
          </div>
        </div>
      </section>

      <main id="catalog" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold">Published cartridges</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]" aria-live="polite">{query.data ? `${query.data.pagination.total} cartridge${query.data.pagination.total === 1 ? "" : "s"} found` : "Loading the catalog"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm"><span className="font-semibold">Architecture</span><select aria-label="Filter by architecture" value={architecture} onChange={(event) => setUrl(router, pathname, { q: queryText || undefined, architecture: event.target.value || undefined, sort: sort === "title" ? undefined : sort, page: undefined })} className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2"><option value="">All</option>{architectures.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm"><span className="font-semibold">Sort</span><select aria-label="Sort cartridges" value={sort} onChange={(event) => setUrl(router, pathname, { q: queryText || undefined, architecture: architecture || undefined, sort: event.target.value === "title" ? undefined : event.target.value, page: undefined })} className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2"><option value="title">Title</option><option value="updated">Recently updated</option></select></label>
            {isFiltered && <button type="button" onClick={clearFilters} className="min-h-9 px-2 text-sm font-semibold text-violet-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600">Clear</button>}
          </div>
        </div>

        {query.isPending && <CatalogLoading />}
        {query.isError && <CatalogError onRetry={() => void query.refetch()} />}
        {query.isSuccess && visibleGames.length === 0 && <CatalogEmpty filtered={isFiltered} />}
        {query.isSuccess && visibleGames.length > 0 && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleGames.map((game) => <GameCard key={game.id} game={game} />)}</div>}
        {query.isSuccess && query.data.pagination.total > query.data.games.length && <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">Showing up to 100 results per page. Refine your search to find a specific cartridge.</p>}
        {query.isSuccess && query.data.pagination.pages > 1 && <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Catalog pages"><button type="button" disabled={!query.data.pagination.has_prev} onClick={() => setUrl(router, pathname, { q: queryText || undefined, architecture: architecture || undefined, sort: sort === "title" ? undefined : sort, page: String(page - 1) })} className="min-h-10 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-40">Previous</button><span className="text-sm text-[var(--color-text-muted)]">Page {query.data.pagination.page} of {query.data.pagination.pages}</span><button type="button" disabled={!query.data.pagination.has_next} onClick={() => setUrl(router, pathname, { q: queryText || undefined, architecture: architecture || undefined, sort: sort === "title" ? undefined : sort, page: String(page + 1) })} className="min-h-10 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-40">Next</button></nav>}
      </main>
    </>
  );
}
