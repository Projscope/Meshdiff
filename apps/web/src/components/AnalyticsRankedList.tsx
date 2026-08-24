import type { AnalyticsBreakdownEntry } from "../lib/adminApi";

/** A simple ranked list with a proportional bar behind each value — no new
 * dependency, reuses the same accent-tint fill convention as the rest of
 * the admin UI (e.g. AnalyticsTrendChart.tsx's bars). */
export default function AnalyticsRankedList({ title, entries }: { title: string; entries: AnalyticsBreakdownEntry[] }) {
  const max = Math.max(1, ...entries.map((entry) => entry.count));

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{title}</p>
      <div className="mt-3 flex flex-col gap-2">
        {entries.length === 0 && <p className="text-sm text-ink-600">No data yet</p>}
        {entries.map((entry) => (
          <div key={entry.value} className="relative overflow-hidden rounded">
            <div
              className="absolute inset-y-0 left-0 bg-accent-500/15"
              style={{ width: `${(entry.count / max) * 100}%` }}
            />
            <div className="relative flex items-center justify-between px-2 py-1 text-sm">
              <span className="truncate text-ink-200">{entry.value}</span>
              <span className="shrink-0 pl-2 font-medium text-ink-400">{entry.count.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
