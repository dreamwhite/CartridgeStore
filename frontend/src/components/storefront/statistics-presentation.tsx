import { StatusMessage } from "../ui/status";

const numberFormat = new Intl.NumberFormat("en-US");

/** Formats public statistics using the storefront locale. */
export function formatStatisticsNumber(value: number): string {
  return numberFormat.format(value);
}

/** Displays one aggregate statistic with its supporting detail. */
export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm font-semibold text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">{detail}</p>
    </div>
  );
}

/** Renders the bounded daily download series returned by the Store API. */
export function DownloadTrend({
  series,
}: {
  series: Array<{ date: string; downloads: number }>;
}) {
  const maximum = Math.max(
    ...series.map((point) => point.downloads),
    1,
  );
  if (series.length === 0) {
    return (
      <p
        className={
          "rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm " +
          "text-[var(--color-text-muted)]"
        }
      >
        No download events are available for the selected period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <caption className="sr-only">Download events by period</caption>
        <thead
          className={
            "border-b border-[var(--color-border)] text-xs uppercase " +
            "tracking-wide text-[var(--color-text-muted)]"
          }
        >
          <tr>
            <th className="px-3 py-2 font-semibold">Period</th>
            <th className="px-3 py-2 font-semibold">Downloads</th>
            <th className="px-3 py-2 font-semibold">Relative volume</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr
              key={point.date}
              className="border-b border-[var(--color-border)] last:border-0"
            >
              <th scope="row" className="px-3 py-3 font-medium">
                {point.date}
              </th>
              <td className="px-3 py-3 tabular-nums">
                {formatStatisticsNumber(point.downloads)}
              </td>
              <td className="px-3 py-3">
                <div
                  aria-label={
                    `${formatStatisticsNumber(point.downloads)} downloads`
                  }
                  className="h-2 min-w-28 rounded-full bg-[var(--color-surface-muted)]"
                >
                  <div
                    className="h-2 rounded-full bg-violet-700"
                    style={{
                      width: `${Math.max(
                        (point.downloads / maximum) * 100,
                        2,
                      )}%`,
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Displays one stable error state for an unavailable statistics query. */
export function StatisticsError({ label }: { label: string }) {
  return (
    <StatusMessage tone="danger" className="rounded-lg p-4">
      {label} could not be loaded. The Store API may be temporarily unavailable.
    </StatusMessage>
  );
}
