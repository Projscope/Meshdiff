import { Fragment, useEffect, useState } from "react";
import {
  listAdminUsers,
  setUserDemoStatus,
  setUserGrantedTier,
  extendUserTrial,
  type AdminUsersPage,
} from "../lib/adminApi";
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
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

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

  // Refetches (rather than patching local state) so the stat widgets above
  // — which exclude demo accounts from their counts — stay in sync with
  // this row's new flag, not just the row itself.
  async function handleToggleDemo(userId: string, nextIsDemo: boolean) {
    setTogglingUserId(userId);
    const result = await setUserDemoStatus(userId, nextIsDemo);
    if (result.success) {
      const refreshed = await listAdminUsers(page);
      if (refreshed.success) setData(refreshed.data);
    }
    setTogglingUserId(null);
  }

  // Same refetch-rather-than-patch reasoning as handleToggleDemo above —
  // this can also shift the stat widgets' Free/Trialing/Pro/Team split.
  async function handleChangeGrant(userId: string, tier: "free" | "pro" | "team") {
    setTogglingUserId(userId);
    const result = await setUserGrantedTier(userId, tier);
    if (result.success) {
      const refreshed = await listAdminUsers(page);
      if (refreshed.success) setData(refreshed.data);
    }
    setTogglingUserId(null);
  }

  // Same refetch-rather-than-patch reasoning as handleToggleDemo above —
  // this can also shift the stat widgets' Trialing count.
  async function handleExtendTrial(userId: string, days: number | null) {
    setTogglingUserId(userId);
    const result = await extendUserTrial(userId, days);
    if (result.success) {
      const refreshed = await listAdminUsers(page);
      if (refreshed.success) setData(refreshed.data);
    }
    setTogglingUserId(null);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-50">Users</h1>
        <p className="mt-1 text-sm text-ink-400">All users and their subscription status</p>
      </div>

      {error && (
        <div className="mt-6 rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
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
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center">
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
              <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Demo
              </span>

              {data.users.length === 0 && (
                <div className="col-span-7 px-4 py-10 text-center text-sm text-ink-500">No users yet.</div>
              )}

              {data.users.map((user, i) => {
                const rowBorder = i === data.users.length - 1 ? "" : "border-b border-ink-900";
                return (
                  <Fragment key={user.id}>
                    <span
                      className={`truncate px-4 py-3 text-sm ${user.isDemo ? "text-ink-500" : "text-ink-200"} ${rowBorder}`}
                    >
                      {user.email ?? "—"}
                    </span>
                    <span className={`flex items-center gap-1.5 px-4 py-3 text-sm ${rowBorder}`}>
                      {user.isAdmin ? (
                        <span className="rounded-sm bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-400">
                          team
                        </span>
                      ) : (
                        <select
                          value={user.adminGrantedTier ?? "free"}
                          onChange={(event) =>
                            handleChangeGrant(user.id, event.target.value as "free" | "pro" | "team")
                          }
                          disabled={togglingUserId === user.id}
                          title="Manually grant Pro/Team access, independent of billing — 'Free' just clears the grant, it never cancels a real subscription."
                          className={`rounded border-none px-1.5 py-0.5 text-[10px] font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-40 ${
                            user.tier === "team"
                              ? "bg-violet-500/15 text-violet-400"
                              : user.tier === "pro"
                                ? "bg-accent-500/15 text-accent-fg-400"
                                : user.isTrialing
                                  ? "bg-amber-500/15 text-amber-fg-400"
                                  : "bg-ink-800 text-ink-400"
                          }`}
                        >
                          <option value="free">{user.isTrialing ? "trial" : "free"}</option>
                          <option value="pro">pro</option>
                          <option value="team">team</option>
                        </select>
                      )}
                      {user.adminGrantedTier && (
                        <span title="Manually granted by an admin, not a real subscription" className="text-[10px] text-ink-600">
                          granted
                        </span>
                      )}
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      <div className="flex items-center gap-1.5">
                        <span>
                          {user.isTrialing
                            ? `${user.trialDaysRemaining} day${user.trialDaysRemaining === 1 ? "" : "s"} left`
                            : user.tier === "free"
                              ? "trial ended"
                              : (user.status ?? "—")}
                        </span>
                        {user.trialExtendedTo && (
                          <span title="Trial end date set by an admin" className="text-[10px] text-ink-600">
                            (extended)
                          </span>
                        )}
                      </div>
                      {!user.isAdmin && user.tier === "free" && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleExtendTrial(user.id, 7)}
                            disabled={togglingUserId === user.id}
                            title="Extend trial by 7 days from today (or from its current end date, whichever is later)"
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            +7d
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExtendTrial(user.id, 30)}
                            disabled={togglingUserId === user.id}
                            title="Extend trial by 30 days from today (or from its current end date, whichever is later)"
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            +30d
                          </button>
                          {user.trialExtendedTo && (
                            <button
                              type="button"
                              onClick={() => handleExtendTrial(user.id, null)}
                              disabled={togglingUserId === user.id}
                              title="Clear the extension and revert to the default 14-day trial"
                              className="text-[10px] text-ink-600 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              clear
                            </button>
                          )}
                        </div>
                      )}
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      {formatDate(user.signupDate)}
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      {timeSince(user.signupDate)}
                    </span>
                    <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>
                      {user.lastSignInAt ? timeSince(user.lastSignInAt) : "Never"}
                    </span>
                    <span className={`px-4 py-3 text-sm ${rowBorder}`}>
                      <button
                        type="button"
                        onClick={() => handleToggleDemo(user.id, !user.isDemo)}
                        disabled={togglingUserId === user.id}
                        title="Excludes this account from the stat widgets and signups chart above — no effect on its own access."
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          user.isDemo
                            ? "bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25"
                            : "bg-ink-800 text-ink-500 hover:bg-ink-700 hover:text-ink-300"
                        }`}
                      >
                        {togglingUserId === user.id ? "…" : user.isDemo ? "Demo" : "Mark demo"}
                      </button>
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
                className="rounded-sm border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded-sm border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
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
