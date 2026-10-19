import Link from "next/link";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Download,
  Gamepad2,
  Gauge,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import type { DownloadSeriesPoint, ScoreRecord } from "../../lib/api/contracts";
import { formatScoreDate } from "./formatters";
import { StatusMessage } from "../ui/status";

const numberFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

export function formatStatisticsNumber(value: number): string {
  return numberFormat.format(value);
}

export type DownloadRange = "week" | "month" | "year" | "all";

const downloadRangeOptions: Array<{ value: DownloadRange; label: string }> = [
  { value: "week", label: "1 Week" },
  { value: "month", label: "1 Month" },
  { value: "year", label: "1 Year" },
  { value: "all", label: "All" },
];

function formatChartDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

const accentStyles = {
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
} as const;

export function StatCard({
  label,
  value,
  detail,
  icon: Icon = Activity,
  accent = "violet",
}: {
  label: string;
  value: string;
  detail: string;
  icon?: LucideIcon;
  accent?: keyof typeof accentStyles;
}) {
  return (
    <article className="surface-card flex min-h-40 flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${accentStyles[accent]}`}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <div>
        <p className="mt-5 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{detail}</p>
      </div>
    </article>
  );
}

function EmptyChart({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div className={`grid min-h-64 place-items-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-8 text-center ${className}`}>
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
          <BarChart3 aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-4 text-sm font-semibold">No activity yet</p>
        <p className="mt-1 max-w-xs text-sm text-[var(--color-text-muted)]">{message}</p>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-[var(--color-surface-muted)] ${className}`} />;
}

export function DownloadTrendSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading download activity" className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SkeletonBlock className="h-4 w-14" />
        <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <SkeletonBlock className="h-7 w-14" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-7 w-14" />
          <SkeletonBlock className="h-7 w-10" />
        </div>
      </div>
      <div className="relative aspect-[820/286] overflow-hidden">
        <div className="absolute inset-x-5 top-1/4 border-t border-dashed border-[var(--color-border)]" />
        <div className="absolute inset-x-5 top-1/2 border-t border-dashed border-[var(--color-border)]" />
        <div className="absolute inset-x-5 top-3/4 border-t border-dashed border-[var(--color-border)]" />
        <SkeletonBlock className="absolute bottom-8 left-5 right-5 h-1/2 rounded-lg opacity-60" />
      </div>
    </div>
  );
}

export function TopGamesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading most downloaded games" className="min-h-0 flex-1 overflow-hidden pr-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--color-border)] py-4 first:pt-0 last:border-0">
          <SkeletonBlock className="h-4 w-6" />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-4 w-8" />
            </div>
            <SkeletonBlock className="h-2 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DownloadTrend({ series, range, onRangeChange }: { series: DownloadSeriesPoint[]; range: DownloadRange; onRangeChange: (range: DownloadRange) => void }) {
  const ordered = [...series].sort((left, right) => left.date.localeCompare(right.date));
  const width = 820;
  const height = 286;
  const plot = { left: 44, right: 20, top: 24, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maximum = ordered.length > 0 ? Math.max(...ordered.map((point) => point.downloads), 1) : 0;
  const points = ordered.map((point, index) => ({
    ...point,
    x: plot.left + (ordered.length === 1 ? plotWidth / 2 : (index / (ordered.length - 1)) * plotWidth),
    y: plot.top + plotHeight - (point.downloads / maximum) * plotHeight,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? plot.left},${plot.top + plotHeight} L ${points[0]?.x ?? plot.left},${plot.top + plotHeight} Z`;
  const labelIndexes = ordered.length <= 5
    ? ordered.map((_, index) => index)
    : [0, Math.floor((ordered.length - 1) / 2), ordered.length - 1];
  const gridRatios = [0, 0.5, 1];

  return (
    <div>
      <div className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Period</span>
          <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1" role="group" aria-label="Download period">
            {downloadRangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => onRangeChange(option.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${range === option.value ? "bg-[var(--color-primary)] text-white shadow-sm" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="download-chart-title download-chart-description">
          <title id="download-chart-title">Downloads by day</title>
          <desc id="download-chart-description">Daily download events for the selected period.</desc>
          <defs>
            <linearGradient id="download-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridRatios.map((ratio) => {
            const y = plot.top + plotHeight * ratio;
            return <g key={ratio}><line x1={plot.left} x2={width - plot.right} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="3 7" />{ordered.length > 0 && <text x={plot.left - 10} y={y + 4} fill="var(--color-text-muted)" fontSize="12" textAnchor="end">{formatStatisticsNumber(Math.round(maximum * (1 - ratio)))}</text>}</g>;
          })}
          <path d={areaPath} fill="url(#download-area-fill)" />
          <path d={linePath} fill="none" stroke="var(--color-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {points.map((point) => (
            <circle key={point.date} cx={point.x} cy={point.y} r="5" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="3">
              <title>{`${formatChartDate(point.date)}: ${formatStatisticsNumber(point.downloads)} downloads`}</title>
            </circle>
          ))}
          {labelIndexes.map((index) => {
            const point = points[index];
            if (!point) return null;
            return <text key={point.date} x={point.x} y={height - 14} fill="var(--color-text-muted)" fontSize="12" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{formatChartDate(point.date)}</text>;
          })}
        </svg>
        {ordered.length === 0 && <div className="pointer-events-none absolute inset-x-16 top-1/2 -translate-y-1/2 text-center"><p className="text-sm font-semibold">No activity yet</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">No download events are available for the selected period.</p></div>}
      </div>
      <table className="sr-only" aria-label="Download events by period">
        <caption>Download events by period</caption>
        <thead><tr><th>Period</th><th>Downloads</th></tr></thead>
        <tbody>{ordered.map((point) => <tr key={point.date}><th scope="row">{point.date}</th><td>{formatStatisticsNumber(point.downloads)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function TopGames({ games }: { games: Array<{ id: string; title: string; downloads: number }> }) {
  if (games.length === 0) {
    return <EmptyChart className="min-h-0 flex-1" message="No downloaded cartridges are recorded yet." />;
  }

  const maximum = Math.max(...games.map((game) => game.downloads), 1);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-2">
      <ol>
        {games.map((game, index) => (
          <li key={game.id} className="group relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--color-border)] py-4 first:pt-0 last:border-0">
            <span className={`pt-0.5 text-xs font-semibold tabular-nums ${index === 0 ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}>{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <Link className="min-w-0 truncate text-sm font-semibold transition-colors group-hover:text-[var(--color-primary-strong)]" href={`/games/${encodeURIComponent(game.id)}`}>{game.title}</Link>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatStatisticsNumber(game.downloads)}</span>
              </div>
              <div className="relative mt-3 h-2 overflow-visible rounded-full bg-[var(--color-surface-muted)]" aria-label={`${game.title}: ${formatStatisticsNumber(game.downloads)} downloads`}>
                <div className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300" style={{ width: `${Math.max((game.downloads / maximum) * 100, 4)}%` }} />
                <div role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+0.55rem)] left-1/2 z-10 -translate-x-1/2 translate-y-1 rounded-md bg-[var(--color-text)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-surface)] opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">{game.title} · {formatStatisticsNumber(game.downloads)} downloads</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RunHealth({ total, finished, active }: { total: number; finished: number; active: number }) {
  const completion = total > 0 ? Math.min((finished / total) * 100, 100) : 0;
  return (
    <div className="grid gap-7 sm:mx-auto sm:max-w-2xl sm:grid-cols-[7rem_minmax(0,24rem)] sm:items-center sm:justify-center sm:gap-10">
      <div className="grid size-28 place-items-center rounded-full border-[10px] border-[var(--color-surface-muted)]" style={{ background: `conic-gradient(var(--color-primary) ${completion}%, transparent 0)` }}>
        <div className="flex size-20 translate-y-1 flex-col items-center justify-center gap-1 rounded-full bg-[var(--color-surface)] text-center"><span className="text-xl font-bold leading-none tabular-nums">{Math.round(completion)}%</span><span className="text-[10px] leading-none text-[var(--color-text-muted)]">finished</span></div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />Completed runs</span><strong className="tabular-nums">{formatStatisticsNumber(finished)}</strong></div>
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Gauge aria-hidden="true" className="size-4 text-violet-600" />Total runs</span><strong className="tabular-nums">{formatStatisticsNumber(total)}</strong></div>
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Activity aria-hidden="true" className="size-4 text-blue-600" />Active in 7 days</span><strong className="tabular-nums">{formatStatisticsNumber(active)}</strong></div>
      </div>
    </div>
  );
}

export function RunHealthSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading run health" className="grid gap-7 sm:mx-auto sm:max-w-2xl sm:grid-cols-[7rem_minmax(0,24rem)] sm:items-center sm:justify-center sm:gap-10">
      <SkeletonBlock className="size-28 rounded-full" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="size-4 rounded-full" />
              <SkeletonBlock className="h-4 w-32" />
            </div>
            <SkeletonBlock className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScorePreview({ scores }: { scores: ScoreRecord[] }) {
  if (scores.length === 0) {
    return <EmptyChart message="No scores are available yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Top scores preview</caption>
        <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Game</th><th className="px-3 py-3">Player</th><th className="px-3 py-3 text-right">Score</th><th className="px-3 py-3 text-right">Submitted</th></tr></thead>
        <tbody>{scores.map((score, index) => <tr key={`${score.game}-${score.player}-${score.created_at}-${index}`} className="border-b border-[var(--color-border)] last:border-0"><td className="px-3 py-3 font-semibold text-[var(--color-text-muted)]">{String(index + 1).padStart(2, "0")}</td><th scope="row" className="px-3 py-3 font-semibold">{score.game}</th><td className="px-3 py-3 text-[var(--color-text-muted)]">{score.player}</td><td className="px-3 py-3 text-right font-bold tabular-nums">{formatStatisticsNumber(score.score)}</td><td className="px-3 py-3 text-right text-[var(--color-text-muted)]">{formatScoreDate(score.created_at)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function ScorePreviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading scoreboard pulse" className="overflow-hidden">
      <div className="mb-3 flex gap-3 border-b border-[var(--color-border)] pb-3">
        {Array.from({ length: 5 }, (_, index) => <SkeletonBlock key={index} className={`h-3 ${index === 0 ? "w-6" : index === 3 || index === 4 ? "w-16" : "w-20"}`} />)}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="grid grid-cols-[1.5rem_minmax(6rem,1fr)_minmax(5rem,0.8fr)_4rem_5rem] items-center gap-3">
            <SkeletonBlock className="h-4 w-5" />
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-4 w-12 justify-self-end" />
            <SkeletonBlock className="h-4 w-16 justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatisticsError({ label }: { label: string }) {
  return <StatusMessage tone="danger" className="rounded-xl p-4">{label} could not be loaded. The Store API may be temporarily unavailable.</StatusMessage>;
}

export { Download, Gamepad2 };
