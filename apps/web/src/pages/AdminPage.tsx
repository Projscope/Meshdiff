import { useEffect, useState } from "react";
import { listAdminUsers, type AdminUsersPage } from "../lib/adminApi";

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    listAdminUsers(page).then((result) => {
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="mt-1 text-sm text-neutral-400">All users and their subscription status</p>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {data === null && !error && <div className="mt-6 text-sm text-neutral-500">Loading…</div>}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Users" value={data.stats.totalUsers} />
            <StatCard label="Pro Subscribers" value={data.stats.proUsers} />
            <StatCard label="Conversion Rate" value={`${data.stats.conversionRate}%`} />
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-neutral-800">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              <span>Email</span>
              <span>Signed up</span>
              <span>Tier</span>
              <span>Status</span>
              <span>Period ends</span>
            </div>

            {data.users.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-neutral-500">No users yet.</div>
            )}

            {data.users.map((user) => (
              <div
                key={user.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-neutral-900 px-4 py-3 text-sm last:border-b-0"
              >
                <span className="truncate text-neutral-200">{user.email ?? "—"}</span>
                <span className="text-neutral-500">{formatDate(user.signupDate)}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    user.tier === "pro" ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {user.tier}
                </span>
                <span className="text-neutral-500">{user.status ?? "—"}</span>
                <span className="text-neutral-500">{user.currentPeriodEnd ? formatDate(user.currentPeriodEnd) : "—"}</span>
              </div>
            ))}
          </div>

          {data.total > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-neutral-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
