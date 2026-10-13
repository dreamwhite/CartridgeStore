import Link from "next/link";

import type { Game } from "../../lib/api/contracts";
import { catalogDownloadPath } from "../../lib/api/catalog";
import { CartridgeArtwork } from "./CartridgeArtwork";

function authorNames(game: Game): string {
  return game.authors
    .map((author) => typeof author === "string" ? author : author.name ?? "")
    .filter(Boolean)
    .join(", ");
}

export function GameCard({ game }: { game: Game }) {
  const author = authorNames(game);
  const architecture = game.architectures[0];
  const download = architecture && game.selected_version
    ? catalogDownloadPath(game.id, game.selected_version, architecture)
    : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-shadow hover:shadow-md">
        <Link aria-label={`Open ${game.title}`} href={`/games/${encodeURIComponent(game.id)}`} className="group block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet-600">
        <CartridgeArtwork gameId={game.id} version={game.selected_version} kind="icon" alt="" className="h-36 w-full" />
        <div className="space-y-2 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold group-hover:text-violet-700">{game.title}</h2>
            {game.selected_version && <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-2 py-1 text-xs font-semibold">v{game.selected_version}</span>}
          </div>
          <p className="line-clamp-3 text-sm leading-6 text-[var(--color-text-muted)]">{game.summary || "No description published."}</p>
          {author && <p className="text-xs text-[var(--color-text-muted)]">By {author}</p>}
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between gap-3 px-5 pb-5">
        <div className="flex flex-wrap gap-1.5" aria-label="Available architectures">
          {game.architectures.map((item) => <span key={item} className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium">{item}</span>)}
        </div>
        {download && <a className="shrink-0 text-sm font-semibold text-violet-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600" href={download}>Download</a>}
      </div>
      {game.tags.length > 0 && <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] px-5 py-3">{game.tags.slice(0, 4).map((tag) => <span key={tag} className="text-xs text-[var(--color-text-muted)]">#{tag}</span>)}</div>}
    </article>
  );
}
