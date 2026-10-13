"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getDownloadStats, getRunStats, getScoreStats } from "../../lib/api/statistics";
import { formatScoreDate } from "./formatters";

const numberFormat = new Intl.NumberFormat("en-US");

function number(value: number): string {
  return numberFormat.format(value);
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">{detail}</p>
    </div>
  );
}

function DownloadTrend({ series }: { series: Array<{ date: string; downloads: number }> }) {
  const maximum = Math.max(...series.map((point) => point.downloads), 1);
  if (series.length === 0) {
    return <p className="rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">No download events are available for the selected period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <caption className="sr-only">Download events by period</caption>
        <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-3 py-2 font-semibold">Period</th><th className="px-3 py-2 font-semibold">Downloads</th><th className="px-3 py-2 font-semibold">Relative volume</th></tr></thead>
        <tbody>
          {series.map((point) => <tr key={point.date} className="border-b border-[var(--color-border)] last:border-0"><th scope="row" className="px-3 py-3 font-medium">{point.date}</th><td className="px-3 py-3 tabular-nums">{number(point.downloads)}</td><td className="px-3 py-3"><div aria-label={`${number(point.downloads)} downloads`} className="h-2 min-w-28 rounded-full bg-[var(--color-surface-muted)]"><div className="h-2 rounded-full bg-violet-700" style={{ width: `${Math.max((point.downloads / maximum) * 100, 2)}%` }} /></div></td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function StatisticsError({ label }: { label: string }) {
  return <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">{label} could not be loaded. The Store API may be temporarily unavailable.</p>;
}

export function StatisticsPage() {
  const downloads = useQuery({ queryKey: ["statistics", "downloads"], queryFn: () => getDownloadStats({ granularity: "day", limit: 30 }), staleTime: 30_000, retry: false });
  const scores = useQuery({ queryKey: ["statistics", "scores"], queryFn: () => getScoreStats(5), staleTime: 30_000, retry: false });
  const runs = useQuery({ queryKey: ["statistics", "runs"], queryFn: getRunStats, staleTime: 30_000, retry: false });

  const loading = downloads.isPending || scores.isPending || runs.isPending;
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Store telemetry</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Statistics</h1><p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">Public aggregates returned by the Store API. Empty sections mean that the backend has no data for them, not that values were estimated.</p></div>
        <Link className="text-sm font-semibold text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-violet-600" href="/scores">Open scoreboard →</Link>
      </header>
      {loading && <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-busy="true">Loading published statistics…</div>}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="mb-4 text-xl font-bold">Store overview</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {downloads.isError ? <StatisticsError label="Download statistics" /> : <StatCard label="Recorded downloads" value={downloads.data ? number(downloads.data.total) : "—"} detail="Within the requested download-event range" />}
          {runs.isError ? <StatisticsError label="Run statistics" /> : <StatCard label="Metrics runs" value={runs.data ? number(runs.data.total) : "—"} detail={runs.data ? `${number(runs.data.finished)} finished` : "Aggregate run count"} />}
          {runs.isError ? <StatisticsError label="Recent run activity" /> : <StatCard label="Active in 7 days" value={runs.data ? number(runs.data.active_last_7_days) : "—"} detail="Runs created in the last seven days" />}
        </div>
      </section>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="downloads-heading"><div className="mb-5"><h2 id="downloads-heading" className="text-xl font-bold">Download activity</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Daily event counts returned by <code>/api/stats/downloads</code>.</p></div>{downloads.isError ? <StatisticsError label="Download activity" /> : downloads.data ? <DownloadTrend series={downloads.data.series} /> : null}</section>
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="top-games-heading"><h2 id="top-games-heading" className="text-xl font-bold">Most downloaded</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">The API returns up to ten games.</p>{downloads.isError ? <StatisticsError label="Top games" /> : downloads.data?.top_games.length ? <ol className="mt-5 space-y-3">{downloads.data.top_games.map((game) => <li key={game.id} className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3 last:border-0"><div className="min-w-0"><Link className="font-semibold hover:text-violet-700 hover:underline" href={`/games/${encodeURIComponent(game.id)}`}>{game.title}</Link><p className="truncate text-xs text-[var(--color-text-muted)]">{game.id}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{number(game.downloads)}</span></li>)}</ol> : <p className="mt-5 rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">No downloaded cartridges are recorded yet.</p>}</section>
      </div>
      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="score-activity-heading"><div className="flex flex-wrap items-baseline justify-between gap-3"><div><h2 id="score-activity-heading" className="text-xl font-bold">Score activity</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">A bounded preview of the highest scores; see the scoreboard for filters.</p></div><Link className="text-sm font-semibold text-violet-700 hover:underline" href="/scores">Browse all returned scores</Link></div>{scores.isError ? <div className="mt-5"><StatisticsError label="Score activity" /></div> : scores.data?.scores.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><caption className="sr-only">Top scores preview</caption><thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-3 py-2">Game</th><th className="px-3 py-2">Player</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Submitted</th></tr></thead><tbody>{scores.data.scores.map((score, index) => <tr key={`${score.game}-${score.player}-${score.created_at}-${index}`} className="border-b border-[var(--color-border)] last:border-0"><th scope="row" className="px-3 py-3 font-medium">{score.game}</th><td className="px-3 py-3">{score.player}</td><td className="px-3 py-3 font-semibold tabular-nums">{number(score.score)}</td><td className="px-3 py-3 text-[var(--color-text-muted)]">{formatScoreDate(score.created_at)}</td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">No scores are available yet.</p>}</section>
      <p className="mt-6 text-xs text-[var(--color-text-muted)]">Metrics run details and samples remain subject to the API’s owner/admin authorization boundary. This public page displays only the documented aggregate run counters.</p>
    </main>
  );
}
