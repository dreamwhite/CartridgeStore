"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ApiRequestError, ApiResponseValidationError } from "../../lib/api/client";
import { catalogDownloadPath, getGame } from "../../lib/api/catalog";
import type { Game } from "../../lib/api/contracts";
import { CartridgeArtwork } from "./CartridgeArtwork";
import { CatalogError, DetailMissing } from "./CatalogState";

function authorNames(game: Game): string[] {
  return game.authors.map((author) => typeof author === "string" ? author : author.name ?? "").filter(Boolean);
}

function scalarEntries(value: Record<string, unknown> | null): Array<[string, string]> {
  if (!value) return [];
  return Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item)).map(([key, item]) => [key, String(item)]);
}

export function GameDetail() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVersion = searchParams.get("version") ?? undefined;
  const [architectureOverride, setArchitectureOverride] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["game", params.gameId, requestedVersion],
    queryFn: () => getGame(params.gameId, requestedVersion),
    staleTime: 30_000,
  });

  const game = query.data?.game;
  const architecture = architectureOverride && game?.architectures.includes(architectureOverride) ? architectureOverride : game?.architectures[0];
  const variant = architecture && game ? game.variants[architecture] : undefined;
  const downloadUrl = game && architecture ? catalogDownloadPath(game.id, game.selected_version, architecture) : undefined;
  const metadata = useMemo(() => scalarEntries(game?.metadata ?? null), [game?.metadata]);
  const authors = game ? authorNames(game) : [];

  if (query.isPending) return <main className="mx-auto max-w-6xl px-6 py-14"><div className="h-96 animate-pulse rounded-2xl bg-[var(--color-surface-muted)]" aria-busy="true" aria-label="Loading cartridge details" /></main>;
  if (query.isError) {
    if (query.error instanceof ApiRequestError && query.error.status === 404) return <main className="mx-auto max-w-6xl px-6 py-14"><DetailMissing /></main>;
    if (query.error instanceof ApiResponseValidationError) return <main className="mx-auto max-w-6xl px-6 py-14"><CatalogError onRetry={() => void query.refetch()} /></main>;
    return <main className="mx-auto max-w-6xl px-6 py-14"><CatalogError onRetry={() => void query.refetch()} /></main>;
  }
  if (!game) return <main className="mx-auto max-w-6xl px-6 py-14"><DetailMissing /></main>;
  const currentGame = game;

  function chooseVersion(version: string) {
    const query = new URLSearchParams({ version });
    router.push(`/games/${encodeURIComponent(currentGame.id)}?${query.toString()}`);
    setArchitectureOverride(null);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-sm font-semibold text-violet-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600">← Back to catalog</Link>
      <section className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row">
            <CartridgeArtwork gameId={game.id} version={game.selected_version} kind="icon" alt={`${game.title} icon`} className="h-32 w-32 shrink-0 rounded-2xl" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Cartridge details</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">{game.title}</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-muted)]">{game.summary || "No description published."}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]"><span className="rounded-full border border-[var(--color-border)] px-2 py-1">{game.id}</span><span className="rounded-full border border-[var(--color-border)] px-2 py-1">v{game.selected_version}</span>{game.publisher && <span className="rounded-full border border-[var(--color-border)] px-2 py-1">{game.publisher}</span>}</div>
            </div>
          </div>
          {game.tags.length > 0 && <div className="flex flex-wrap gap-2">{game.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs">#{tag}</span>)}</div>}
          {variant?.has_screenshot === true && architecture && <CartridgeArtwork gameId={game.id} version={game.selected_version} kind="screenshot" architecture={architecture} alt={`${game.title} screenshot`} className="aspect-video w-full rounded-2xl" />}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h2 className="text-xl font-bold">Download this cartridge</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Choose a version and architecture. Downloads are served by the existing Store API and retain its download accounting.</p>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Available versions">{game.versions.map((version) => <button key={version} type="button" onClick={() => chooseVersion(version)} aria-pressed={version === game.selected_version} className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold aria-pressed:border-violet-700 aria-pressed:bg-violet-50 aria-pressed:text-violet-800 dark:aria-pressed:bg-violet-950/30">v{version}</button>)}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{game.architectures.map((item) => <button key={item} type="button" aria-label={`Select architecture ${item}`} onClick={() => setArchitectureOverride(item)} aria-pressed={item === architecture} className="flex min-h-16 items-center justify-between rounded-xl border border-[var(--color-border)] px-4 text-left hover:border-violet-600 aria-pressed:border-violet-700 aria-pressed:bg-violet-50 dark:aria-pressed:bg-violet-950/30"><span><span className="block font-semibold">{item}</span><span className="text-xs text-[var(--color-text-muted)]">{typeof game.variants[item]?.size === "number" ? `${Math.ceil(Number(game.variants[item]?.size) / 1024)} KB` : "Binary available"}</span></span><span aria-hidden="true">→</span></button>)}</div>
            {downloadUrl ? <a className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" href={downloadUrl}>Download {architecture}</a> : <p className="mt-5 text-sm text-[var(--color-text-muted)]" role="status">No downloadable architecture is available for this version.</p>}
          </div>
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-bold">Published information</h2>{authors.length > 0 || game.updated_at ? <dl>{authors.length > 0 && <div className="mt-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Authors</dt><dd className="mt-1 text-sm">{authors.join(", ")}</dd></div>}{game.updated_at && <div className="mt-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Updated</dt><dd className="mt-1 text-sm">{game.updated_at}</dd></div>}</dl> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">No additional publication metadata is available.</p>}</section>
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-bold">Metadata</h2>{metadata.length > 0 ? <dl className="mt-4 space-y-3">{metadata.map(([key, value]) => <div key={key}><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">No additional metadata published.</p>}</section>
        </aside>
      </section>
    </main>
  );
}
