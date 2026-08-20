import type { AdminStats } from "../lib/adminApi";

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink-50">{value}</p>
    </div>
  );
}

/** Shared by the Admin Dashboard and Users pages so the two never drift on
 * which numbers are shown or how they're formatted. */
export default function AdminStatsGrid({ stats }: { stats: AdminStats }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Pro Subscribers" value={stats.proUsers} />
        <StatCard label="Conversion Rate" value={`${stats.conversionRate}%`} />
      </div>

      {/* Grouped by the sharer's subscription tier at the moment they
          shared (see migration 0016) — community is the anonymous public
          Live Diff tool, free/pro are signed-in project shares. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Community Shares" value={stats.communityShares} />
        <StatCard label="Free-Tier Shares" value={stats.freeShares} />
        <StatCard label="Pro Shares" value={stats.proShares} />
      </div>
    </>
  );
}
