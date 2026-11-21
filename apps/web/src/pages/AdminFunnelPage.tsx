import { useEffect, useState } from "react";
import { getAdminFunnel, type AdminFunnel, type FunnelUserRow } from "../lib/adminApi";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function timeSince(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function TrialBadge({ row }: { row: FunnelUserRow }) {
  if (row.trial === "paying") {
    return <span className="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-fg-400">Paying</span>;
  }
  if (row.trial === "ended") return <span className="text-ink-600">Ended</span>;
  const days = `${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"} left`;
  return (
    <span className="text-ink-400">
      {days}
      {row.trial === "trialing_not_started" && <span className="text-ink-600"> · no upload yet</span>}
    </span>
  );
}

const HEADERS = ["Email", "Signed up", "Trial", "Uploads", "Comments", "Shares", "Paywall views", "Last seen", "Last activity"];

/** Where signups drop off, plus what each account actually did. Excludes
 * demo accounts and admins. Data comes from apps/api/src/lib/adminFunnel.ts. */
export default function AdminFunnelPage() {
  const [data, setData] = useState<AdminFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminFunnel().then((result) => {
      if (result.success) setData(result.data);
      else setError(result.error);
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink-50">Funnel</h1>
      <p className="mt-1 text-sm text-ink-400">
        Where signups drop off and what each account did. Excludes demo accounts and admins.
      </p>

      {error && (
        <div className="mt-6 rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}
      {data === null && !error && <div className="mt-6 text-sm text-ink-500">Loading…</div>}

      {data && (
        <>
          <section className="mt-6 rounded-lg border border-ink-800 bg-ink-900 p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Signups to first review</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {data.steps.map((step) => (
                <li key={step.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-200">{step.label}</span>
                    <span className="tabular-nums text-ink-400">
                      <span className="font-semibold text-ink-50">{step.count}</span>
                      <span className="ml-2 text-xs text-ink-500">
                        {percent(step.shareOfSignups)} of signups
                        {step.shareOfPrevious !== null && ` · ${percent(step.shareOfPrevious)} of previous step`}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-accent-500/70"
                      style={{ width: `${Math.max(step.shareOfSignups * 100, step.count > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-ink-800 pt-3 text-sm">
              <span className="text-ink-200">Paying (any stage)</span>
              <span className="tabular-nums text-ink-400">
                <span className="font-semibold text-ink-50">{data.paying.count}</span>
                <span className="ml-2 text-xs text-ink-500">{percent(data.paying.shareOfSignups)} of signups</span>
              </span>
            </div>
          </section>

          <section className="mt-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
              Since tracking began{data.tracked.since ? ` (${formatDate(data.tracked.since)})` : ""}
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              {data.tracked.since
                ? "Only activity recorded after tracking started, so these understate earlier behaviour."
                : "Nothing tracked yet — these fill in as people use the app."}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Seen in last 7 days", data.tracked.activeLast7d],
                ["Saw a paywall", data.tracked.paywallViewers],
                ["Created a share", data.tracked.sharers],
                ["Used a Pro feature", data.tracked.proFeatureUsers],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-ink-50">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Per user</h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-ink-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-900">
                  <tr>
                    {HEADERS.map((h) => (
                      <th key={h} className="whitespace-nowrap border-b border-ink-800 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={HEADERS.length} className="px-4 py-10 text-center text-ink-500">No users yet.</td>
                    </tr>
                  )}
                  {data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-ink-900 last:border-b-0">
                      <td className="max-w-[16rem] truncate px-4 py-3 text-ink-200">{row.email ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDate(row.signedUp)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><TrialBadge row={row} /></td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-300">
                        {row.uploads}
                        {row.sampleOnly && <span className="ml-1 text-[10px] text-ink-600">sample only</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-300">{row.comments}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-300">{row.shares}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-300">{row.paywallViews}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-500">{row.lastSeenAt ? timeSince(row.lastSeenAt) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-500">{row.lastActivityAt ? timeSince(row.lastActivityAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.rowsTruncated && (
              <p className="mt-2 text-xs text-ink-500">Showing the 200 most recent signups.</p>
            )}
            <p className="mt-2 text-xs text-ink-600">
              Shares, paywall views and last seen count from when tracking began; uploads, comments and trial state are full history.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
