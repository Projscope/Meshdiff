import { useEffect, useState } from "react";
import { createTeam, getTeam, addTeamMember, removeTeamMember, type TeamDetail } from "../lib/projectsApi";
import { useAuth } from "../lib/AuthProvider";
import ConfirmDialog from "./ConfirmDialog";

interface TeamModalProps {
  /** When set, opens in "manage" mode for that team. When null, opens in "create" mode. */
  teamId: string | null;
  onClose: () => void;
  onCreated: (team: { id: string; name: string }) => void;
}

export default function TeamModal({ teamId, onClose, onCreated }: TeamModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "approver" | "member">("member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; email: string | null } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    getTeam(teamId).then((result) => {
      if (result.success) setTeam(result.data);
      else setError(result.error);
    });
  }, [teamId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await createTeam(name);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onCreated(result.data);
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId) return;
    setIsSubmitting(true);
    setError(null);
    const result = await addTeamMember(teamId, inviteEmail, inviteRole);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setInviteEmail("");
    const refreshed = await getTeam(teamId);
    if (refreshed.success) setTeam(refreshed.data);
  }

  async function handleConfirmRemove() {
    if (!teamId || !pendingRemove) return;
    setIsRemoving(true);
    setError(null);
    const result = await removeTeamMember(teamId, pendingRemove.userId);
    setIsRemoving(false);
    setPendingRemove(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const refreshed = await getTeam(teamId);
    if (refreshed.success) setTeam(refreshed.data);
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
          onClick={(event) => event.stopPropagation()}
        >
          {!teamId ? (
            <>
              <h3 className="text-sm font-semibold text-white">New Team</h3>
              <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Team name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating…" : "Create Team"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
                  >
                    Cancel
                  </button>
                </div>
                {error && <span className="text-xs text-red-400">{error}</span>}
              </form>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-white">{team?.name ?? "Team"}</h3>
              {team?.seats && (
                <p className="mt-1 text-xs text-neutral-500">
                  {team.seats.used} of {team.seats.purchased} seats used
                  {team.seats.used >= team.seats.purchased && (
                    <span className="ml-1 text-amber-400">— increase seats in Billing to invite more</span>
                  )}
                </p>
              )}
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Members</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {team?.members.map((member) => {
                  const isSelf = member.userId === user?.id;
                  // Invite/remove are owner-or-admin; the owner row itself is
                  // never removable (by anyone, including the owner).
                  const canManageMembers = team.isOwner || team.myRole === "admin";
                  return (
                    <li key={member.userId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-neutral-300">{member.email ?? member.userId}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-400">
                          {member.role}
                        </span>
                        {canManageMembers && !isSelf && !member.isOwner && (
                          <button
                            type="button"
                            onClick={() => setPendingRemove({ userId: member.userId, email: member.email })}
                            title="Remove from team"
                            className="rounded px-1 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {team && (team.isOwner || team.myRole === "admin") && (
                <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Invite a member</p>
                  <input
                    type="email"
                    required
                    placeholder="them@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                  />
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as "admin" | "approver" | "member")}
                      className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-neutral-200"
                    >
                      <option value="member">Member</option>
                      <option value="approver">Approver</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 rounded bg-emerald-500 px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {isSubmitting ? "Inviting…" : "Invite"}
                    </button>
                  </div>
                  {error && <span className="text-xs text-red-400">{error}</span>}
                </form>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
              >
                Close
              </button>
            </>
          )}
        </div>
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
    </>
  );
}
