"use client";

import { FormEvent, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { getScores } from "../../lib/api/scores";
import { formatScoreDate } from "./formatters";

function limitValue(value: string | null): number {
  return value === "50" || value === "100" ? Number(value) : 20;
}

function setUrl(router: ReturnType<typeof useRouter>, pathname: string, values: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const suffix = query.toString();
  router.push(`${pathname}${suffix ? `?${suffix}` : ""}`);
}

export function Scoreboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const game = params.get("game") ?? "";
  const player = params.get("player") ?? "";
  const limit = limitValue(params.get("limit"));
  const query = useQuery({ queryKey: ["scores", game, player, limit], queryFn: () => getScores({ game, player, limit }), staleTime: 15_000, retry: false });
  const rows = useMemo(() => query.data ?? [], [query.data]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextGame = String(form.get("game") ?? "").trim();
    const nextPlayer = String(form.get("player") ?? "").trim();
    const nextLimit = String(form.get("limit") ?? "20");
    setUrl(router, pathname, { game: nextGame || undefined, player: nextPlayer || undefined, limit: nextLimit === "20" ? undefined : nextLimit });
  }

  return <main className="mx-auto max-w-6xl px-6 py-10"><header className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">PRG32 scores</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Scoreboard</h1><p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">Scores are returned by the Store API in its established order: score descending, then oldest timestamp first. The position shown here is the position within this bounded response.</p></header><form className="mb-6 grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={submit}><label className="text-sm font-semibold">Game<input name="game" aria-label="Filter scores by game" defaultValue={game} className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-violet-600" placeholder="All games" /></label><label className="text-sm font-semibold">Player<input name="player" aria-label="Filter scores by player" defaultValue={player} className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-violet-600" placeholder="All players" /></label><label className="text-sm font-semibold">Rows<select name="limit" aria-label="Scoreboard rows" defaultValue={String(limit)} className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-violet-600"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label><button className="min-h-10 rounded-md bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600" type="submit">Apply filters</button></form>{query.isPending && <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-busy="true">Loading scores…</div>}{query.isError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert"><h2 className="font-semibold">The scoreboard could not be loaded.</h2><p className="mt-2 text-sm">The score API may be temporarily unavailable. Try again in a moment.</p><button type="button" className="mt-4 rounded-md border border-current px-3 py-2 text-sm font-semibold" onClick={() => void query.refetch()}>Try again</button></div>}{query.isSuccess && rows.length === 0 && <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center"><h2 className="font-semibold">No scores match these filters.</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Try another game or player, or clear the filters.</p></div>}{query.isSuccess && rows.length > 0 && <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="score-table-heading"><div className="mb-5 flex flex-wrap items-baseline justify-between gap-3"><div><h2 id="score-table-heading" className="text-xl font-bold">Returned scores</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">{rows.length} row{rows.length === 1 ? "" : "s"}; maximum requested rows: {limit}.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm"><caption className="sr-only">PRG32 scoreboard results</caption><thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-3 py-2">Position</th><th className="px-3 py-2">Game</th><th className="px-3 py-2">Player</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Submitted</th></tr></thead><tbody>{rows.map((score, index) => <tr key={`${score.game}-${score.player}-${score.created_at}-${index}`} className="border-b border-[var(--color-border)] last:border-0"><th scope="row" className="px-3 py-3 font-semibold tabular-nums">{index + 1}</th><td className="px-3 py-3">{score.game}</td><td className="px-3 py-3">{score.player}</td><td className="px-3 py-3 font-semibold tabular-nums">{score.score.toLocaleString("en-US")}</td><td className="px-3 py-3 text-[var(--color-text-muted)]">{formatScoreDate(score.created_at)}</td></tr>)}</tbody></table></div></section>}</main>;
}
