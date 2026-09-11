import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import {
  getTeam,
  getTeamPendingVersions,
  getTeamAuditLog,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  approveVersion,
  rejectVersion,
  openBillingPortal,
  type TeamDetail,
  type TeamPendingVersion,
  type TeamAuditLogEntry,
} from "../lib/projectsApi";
import ApprovalBadge from "../components/ApprovalBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import RejectVersionModal from "../components/RejectVersionModal";
import TeamDashboardTour from "../components/TeamDashboardTour";

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

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink-50">{value}</p>
    </div>
  );
}

export default function TeamDashboardPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [pending, setPending] = useState<TeamPendingVersion[] | null>(null);
  const [activity, setActivity] = useState<TeamAuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "approver" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; email: string | null } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<{ projectId: string; id: string; versionNumber: number } | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [activityMember, setActivityMember] = useState("all");
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;

  function refresh() {
    if (!teamId) return;
    getTeam(teamId).then((result) => {
      if (result.success) setTeam(result.data);
      else setError(result.error);
    });
    getTeamPendingVersions(teamId).then((result) => {
      if (result.success) setPending(result.data);
    });
    getTeamAuditLog(teamId).then((result) => {
      if (result.success) setActivity(result.data);
    });
  }

  useEffect(() => {
    setTeam(null);
    setPending(null);
    setActivity(null);
    setError(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId || !team) return;

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const alreadyMember = team.members.some((member) => member.email?.toLowerCase() === normalizedEmail);
    if (alreadyMember) {
      setInviteError("That person is already on the team");
      return;
    }

    setIsInviting(true);
    setInviteError(null);
    const result = await addTeamMember(teamId, inviteEmail, inviteRole);
    setIsInviting(false);
    if (!result.success) {
      setInviteError(result.error);
      return;
    }
    setInviteEmail("");
    refresh();
  }

  async function handleConfirmRemove() {
    if (!teamId || !pendingRemove) return;
    setIsRemoving(true);
    const result = await removeTeamMember(teamId, pendingRemove.userId);
    setIsRemoving(false);
    setPendingRemove(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleRoleChange(userId: string, role: "admin" | "approver" | "member") {
    if (!teamId) return;
    setChangingRoleUserId(userId);
    setRoleChangeError(null);
    const result = await updateTeamMemberRole(teamId, userId, role);
    setChangingRoleUserId(null);
    if (!result.success) {
      setRoleChangeError(result.error);
      return;
    }
    refresh();
  }

  async function handleApprove(projectId: string, versionId: string) {
    const result = await approveVersion(projectId, versionId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleConfirmReject(reason?: string) {
    if (!pendingReject) return;
    setIsRejecting(true);
    const result = await rejectVersion(pendingReject.projectId, pendingReject.id, reason);
    setIsRejecting(false);
    setPendingReject(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleManageBilling() {
    const result = await openBillingPortal();
    if (result.success) {
      window.location.href = result.data.url;
    } else {
      setError(result.error);
    }
  }

  const activityActors = useMemo(() => {
    const set = new Set<string>();
    for (const entry of activity ?? []) {
      if (entry.actorEmail) set.add(entry.actorEmail);
    }
    return [...set].sort();
  }, [activity]);

  const filteredActivity = useMemo(() => {
    if (!activity) return null;
    return activity.filter((entry) => {
      if (activityMember !== "all" && entry.actorEmail !== activityMember) return false;
      const entryDate = entry.createdAt.slice(0, 10);
      if (activityDateFrom && entryDate < activityDateFrom) return false;
      if (activityDateTo && entryDate > activityDateTo) return false;
      return true;
    });
  }, [activity, activityMember, activityDateFrom, activityDateTo]);

  const activityTotalPages = filteredActivity
    ? Math.max(1, Math.ceil(filteredActivity.length / ACTIVITY_PAGE_SIZE))
    : 1;
  const activityPageClamped = Math.min(activityPage, activityTotalPages);
  const pagedActivity = filteredActivity
    ? filteredActivity.slice(
        (activityPageClamped - 1) * ACTIVITY_PAGE_SIZE,
        activityPageClamped * ACTIVITY_PAGE_SIZE,
      )
    : null;
  const activityFiltersActive = activityMember !== "all" || activityDateFrom !== "" || activityDateTo !== "";

  function clearActivityFilters() {
    setActivityMember("all");
    setActivityDateFrom("");
    setActivityDateTo("");
    setActivityPage(1);
  }

  if (error && !team) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="text-sm text-ink-500">Loading…</div>
      </div>
    );
  }

  const canManageMembers = team.isOwner || team.myRole === "admin";
  const canReview = team.isOwner || team.myRole === "admin" || team.myRole === "approver";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <TeamDashboardTour />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">{team.name}</h1>
          <p className="mt-1 text-sm text-ink-400">Team dashboard</p>
        </div>
        {team.isOwner && (
          <button
            type="button"
            onClick={() => void handleManageBilling()}
            className="shrink-0 rounded border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
          >
            Manage billing
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Seats" value={team.seats ? `${team.seats.used} of ${team.seats.purchased}` : "—"} />
        <StatCard label="Members" value={team.members.length} />
        <StatCard label="Pending Approvals" value={pending === null ? "…" : pending.length} />
      </div>

      <div className="mt-6 rounded-lg border border-ink-800 bg-ink-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Members</p>
        {roleChangeError && (
          <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {roleChangeError}
          </div>
        )}
        <ul data-tour="teamMembers" className="mt-3 flex flex-col gap-2">
          {team.members.map((member) => {
            const isSelf = member.userId === user?.id;
            const canEditRole = canManageMembers && !isSelf && !member.isOwner;
            return (
              <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink-300">{member.email ?? member.userId}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {canEditRole ? (
                    <select
                      value={member.role}
                      disabled={changingRoleUserId === member.userId}
                      onChange={(event) =>
                        void handleRoleChange(member.userId, event.target.value as "admin" | "approver" | "member")
                      }
                      className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-ink-300 disabled:opacity-50"
                    >
                      <option value="admin">Admin</option>
                      <option value="approver">Approver</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-ink-400">
                      {member.isOwner ? "Owner" : member.role}
                    </span>
                  )}
                  {canManageMembers && !isSelf && !member.isOwner && (
                    <button
                      type="button"
                      onClick={() => setPendingRemove({ userId: member.userId, email: member.email })}
                      title="Remove from team"
                      className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        {canManageMembers && (
          <form
            data-tour="teamInvite"
            onSubmit={handleInvite}
            className="mt-4 flex flex-col gap-2 border-t border-ink-800 pt-4 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Invite a member</label>
              <input
                type="email"
                required
                placeholder="them@company.com"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  if (event.target.value === "") setInviteError(null);
                }}
                className="mt-1 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "admin" | "approver" | "member")}
              className="rounded border border-ink-700 bg-ink-950 px-2 py-2 text-sm text-ink-200"
            >
              <option value="member">Member</option>
              <option value="approver">Approver</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={isInviting}
              className="rounded bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {isInviting ? "Inviting…" : "Invite"}
            </button>
          </form>
        )}
        {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
      </div>

      <div data-tour="teamPendingApprovals" className="mt-6 rounded-lg border border-ink-800 bg-ink-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Pending Approvals</p>
        {pending === null ? (
          <p className="mt-3 text-sm text-ink-500">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">Nothing waiting on review.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-2 text-sm">
                <ApprovalBadge status={version.approvalStatus} />
                <Link
                  to={`/projects/${version.projectId}/versions/${version.id}`}
                  className="min-w-0 flex-1 truncate text-ink-300 hover:text-ink-50"
                >
                  {version.projectName} — v{version.versionNumber} {version.fileName}
                </Link>
                <span className="shrink-0 text-xs text-ink-500">{formatDate(version.createdAt)}</span>
                {canReview && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleApprove(version.projectId, version.id)}
                      className="shrink-0 rounded border border-accent-700 px-2.5 py-1 text-xs text-accent-fg-400 hover:border-accent-500"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingReject({ projectId: version.projectId, id: version.id, versionNumber: version.versionNumber })
                      }
                      className="shrink-0 rounded border border-red-800 px-2.5 py-1 text-xs text-red-400 hover:border-red-600"
                    >
                      Reject
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Activity</p>
          {activity !== null && activity.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-ink-500">From</span>
                <input
                  type="date"
                  value={activityDateFrom}
                  onChange={(event) => {
                    setActivityDateFrom(event.target.value);
                    setActivityPage(1);
                  }}
                  className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-300"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-ink-500">To</span>
                <input
                  type="date"
                  value={activityDateTo}
                  onChange={(event) => {
                    setActivityDateTo(event.target.value);
                    setActivityPage(1);
                  }}
                  className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-300"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-ink-500">Member</span>
                <select
                  value={activityMember}
                  onChange={(event) => {
                    setActivityMember(event.target.value);
                    setActivityPage(1);
                  }}
                  className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-300"
                >
                  <option value="all">All members</option>
                  {activityActors.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </label>
              {activityFiltersActive && (
                <button
                  type="button"
                  onClick={clearActivityFilters}
                  className="rounded border border-ink-700 px-2.5 py-1 text-xs text-ink-400 hover:border-ink-500 hover:text-ink-200"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {activity === null ? (
          <div className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-10 text-center text-sm text-ink-500">
            Loading…
          </div>
        ) : activity.length === 0 ? (
          <div className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-10 text-center text-sm text-ink-500">
            No activity yet.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-ink-800">
              <div className="grid grid-cols-[110px_1fr_200px_110px] gap-4 border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                <span className="text-center">Date</span>
                <span className="text-center">Action</span>
                <span className="text-center">Member</span>
                <span className="text-center">Type</span>
              </div>

              {pagedActivity !== null && pagedActivity.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-ink-500">
                  No activity matches these filters.
                </div>
              ) : (
                pagedActivity?.map((entry) => {
                  const actor = entry.actorEmail
                    ? team.members.find((member) => member.email === entry.actorEmail)
                    : undefined;
                  return (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[110px_1fr_200px_110px] items-center gap-4 border-b border-ink-800 bg-ink-950 px-4 py-3 text-sm last:border-b-0"
                    >
                      <span className="whitespace-nowrap text-xs text-ink-500" title={formatDate(entry.createdAt)}>
                        {timeSince(entry.createdAt)}
                      </span>
                      <span className="min-w-0 truncate text-ink-300" title={entry.summary}>
                        {entry.summary}
                      </span>
                      <span className="whitespace-nowrap text-right text-xs text-ink-400">
                        {entry.actorEmail ?? "Someone"}
                      </span>
                      <span className="justify-self-end rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-ink-400">
                        {actor?.isOwner ? "Owner" : (actor?.role ?? "—")}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {filteredActivity !== null && filteredActivity.length > 0 && (
              <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                <span>
                  Showing {(activityPageClamped - 1) * ACTIVITY_PAGE_SIZE + 1}–
                  {Math.min(activityPageClamped * ACTIVITY_PAGE_SIZE, filteredActivity.length)} of{" "}
                  {filteredActivity.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={activityPageClamped <= 1}
                    onClick={() => setActivityPage(activityPageClamped - 1)}
                    className="rounded border border-ink-700 px-2.5 py-1 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-700"
                  >
                    Previous
                  </button>
                  <span>
                    Page {activityPageClamped} of {activityTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={activityPageClamped >= activityTotalPages}
                    onClick={() => setActivityPage(activityPageClamped + 1)}
                    className="rounded border border-ink-700 px-2.5 py-1 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {pendingRemove && (
        <ConfirmDialog
          title="Remove member?"
          message={`${pendingRemove.email ?? "This member"} will lose access to this team's projects.`}
          confirmLabel="Remove"
          isDestructive
          isConfirming={isRemoving}
          onConfirm={() => void handleConfirmRemove()}
          onCancel={() => setPendingRemove(null)}
        />
      )}

      {pendingReject && (
        <RejectVersionModal
          versionLabel={`v${pendingReject.versionNumber}`}
          isSubmitting={isRejecting}
          onConfirm={(reason) => void handleConfirmReject(reason)}
          onCancel={() => setPendingReject(null)}
        />
      )}
    </div>
  );
}
