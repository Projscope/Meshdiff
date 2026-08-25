import { useEffect, useState } from "react";
import type { AnalyticsBreakdownEntry } from "../lib/adminApi";

const PAGE_SIZE = 15;

/** A simple ranked list with a proportional bar behind each value — no new
 * dependency, reuses the same accent-tint fill convention as the rest of
 * the admin UI (e.g. AnalyticsTrendChart.tsx's bars).
 *
 * Paginates client-side over the already-fetched `entries` (no extra
 * network round trip, no page reload) since the backend already returns a
 * generous top-N per dimension (see TOP_N in analyticsStats.ts). */
export default function AnalyticsRankedList({
  title,
  entries,
  formatValue,
}: {
  title: string;
  entries: AnalyticsBreakdownEntry[];
  /** Renders a friendlier label than the raw stored value, e.g. a country
   * or language name instead of its code. The raw value is still shown as
   * a title tooltip and used as the React key. */
  formatValue?: (value: string) => string;
}) {
  const [page, setPage] = useState(1);
  // Reset to page 1 whenever the underlying data changes (e.g. the
  // Last 30 days / Last 6 months toggle swaps in a new array).
  useEffect(() => {
    setPage(1);
  }, [entries]);

  const max = Math.max(1, ...entries.map((entry) => entry.count));
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const visible = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex h-full flex-col rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{title}</p>
      <div className="mt-3 flex flex-col gap-2">
        {entries.length === 0 && <p className="text-sm text-ink-600">No data yet</p>}
        {visible.map((entry) => (
          <div key={entry.value} className="relative overflow-hidden rounded" title={entry.value}>
            <div
              className="absolute inset-y-0 left-0 bg-accent-500/15"
              style={{ width: `${(entry.count / max) * 100}%` }}
            />
            <div className="relative flex items-center justify-between px-2 py-1 text-sm">
              <span className="truncate text-ink-200">{formatValue ? formatValue(entry.value) : entry.value}</span>
              <span className="shrink-0 pl-2 font-medium text-ink-400">{entry.count.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-auto flex items-center justify-center gap-2 pt-3 text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-ink-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
