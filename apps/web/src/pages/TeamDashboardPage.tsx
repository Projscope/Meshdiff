import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import {
  getTeam,
  getTeamPendingVersions,
  addTeamMember,
  removeTeamMember,
  approveVersion,
  rejectVersion,
  openBillingPortal,
  type TeamDetail,
  type TeamPendingVersion,
} from "../lib/projectsApi";
import ApprovalBadge from "../components/ApprovalBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import RejectVersionModal from "../components/RejectVersionModal";

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

export default function TeamDashboardPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [pending, setPending] = useState<TeamPendingVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "approver" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; email: string | null } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [pendingReject, setPendingReject] = useState<{ projectId: string; id: string; versionNumber: number } | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  function refresh() {
    if (!teamId) return;
    getTeam(teamId).then((result) => {
      if (result.success) setTeam(result.data);
      else setError(result.error);
    });
    getTeamPendingVersions(teamId).then((result) => {
      if (result.success) setPending(result.data);
    });
  }

  useEffect(() => {
    setTeam(null);
    setPending(null);
    setError(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId) return;
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
        <div className="text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  const canManageMembers = team.isOwner || team.myRole === "admin";
  const canReview = team.isOwner || team.myRole === "admin" || team.myRole === "approver";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{team.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">Team dashboard</p>
        </div>
        {team.isOwner && (
          <button
            type="button"
            onClick={() => void handleManageBilling()}
            className="shrink-0 rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
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

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Members</p>
        <ul className="mt-3 flex flex-col gap-2">
          {team.members.map((member) => {
            const isSelf = member.userId === user?.id;
            return (
              <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-300">{member.email ?? member.userId}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-400">
                    {member.role}
                  </span>
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
          <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Invite a member</label>
              <input
                type="email"
                required
                placeholder="them@company.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "admin" | "approver" | "member")}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-neutral-200"
            >
              <option value="member">Member</option>
              <option value="approver">Approver</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={isInviting}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {isInviting ? "Inviting…" : "Invite"}
            </button>
          </form>
        )}
        {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
      </div>

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Pending Approvals</p>
        {pending === null ? (
          <p className="mt-3 text-sm text-neutral-500">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nothing waiting on review.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-2 text-sm">
                <ApprovalBadge status={version.approvalStatus} />
                <Link
                  to={`/projects/${version.projectId}/versions/${version.id}`}
                  className="min-w-0 flex-1 truncate text-neutral-300 hover:text-white"
                >
                  {version.projectName} — v{version.versionNumber} {version.fileName}
                </Link>
                <span className="shrink-0 text-xs text-neutral-500">{formatDate(version.createdAt)}</span>
                {canReview && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleApprove(version.projectId, version.id)}
                      className="shrink-0 rounded border border-emerald-700 px-2.5 py-1 text-xs text-emerald-400 hover:border-emerald-500"
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
