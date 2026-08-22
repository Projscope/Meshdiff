import { Fragment, useEffect, useState } from "react";
import { listAdminUsers, type AdminUsersPage } from "../lib/adminApi";
import AdminStatsGrid from "../components/AdminStatsGrid";

const PAGE_SIZE = 25;

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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function AdminUsersPage() {
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
        <h1 className="text-2xl font-bold text-ink-50">Users</h1>
        <p className="mt-1 text-sm text-ink-400">All users and their subscription status</p>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {data === null && !error && <div className="mt-6 text-sm text-ink-500">Loading…</div>}

      {data && (
        <>
          <div className="mt-6">
            <AdminStatsGrid stats={data.stats} />
          </div>

          {/* One grid container for header + every row (not a grid per row)
              — CSS Grid's `auto` column tracks size against ALL children of
              the SAME grid, so splitting rows into separate grids made each
              row compute its own column widths independently, misaligning
              columns whenever content length differed row to row. */}
          <div className="mt-6 overflow-hidden rounded-lg border border-ink-800">
            {/* No gap-x here — a real CSS Grid gap is transparent, so it
                showed the page background through the header's bg-ink-900
                as visible stripes. Column spacing comes from each cell's own
                px-4 padding instead, so backgrounds/borders stay flush. */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center">
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Email
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Tier
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Status
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Signed up
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Registered
              </span>
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Last sign in
              </span>

              {data.users.length === 0 && (
                <div className="col-span-6 px-4 py-10 text-center text-sm text-ink-500">No users yet.</div>
              )}

              {data.users.map((user, i) => {
                const rowBorder = i === data.users.length - 1 ? "" : "border-b border-ink-900";
                return (
                  <Fragment key={user.id}>
                    <span className={`truncate px-4 py-3 text-sm text-ink-200 ${rowBorder}`}>
                      {user.email ?? "—"}
                    </span>
                    <span className={`px-4 py-3 text-sm ${rowBorder}`}>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          user.tier === "team"
                            ? "bg-violet-500/15 text-violet-400"
                            : user.tier === "pro"
                              ? "bg-accent-500/15 text-accent-400"
                              : "bg-ink-800 text-ink-400"
                        }`}
                      >
                        {user.tier}
                      </span>
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>{user.status ?? "—"}</span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      {formatDate(user.signupDate)}
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      {timeSince(user.signupDate)}
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      {user.lastSignInAt ? timeSince(user.lastSignInAt) : "Never"}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
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
