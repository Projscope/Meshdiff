import { useState } from "react";
import { createTeam } from "../lib/projectsApi";

interface TeamModalProps {
  onClose: () => void;
  onCreated: (team: { id: string; name: string }) => void;
}

/** Create-only — managing an existing team (roster, invites, pending
 * approvals) lives at /teams/:teamId now (see TeamDashboardPage.tsx),
 * which the sidebar navigates to directly once a team exists. */
export default function TeamModal({ onClose, onCreated }: TeamModalProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ink-50">New Team</h3>
        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2">
          <input
            type="text"
            required
            autoFocus
            placeholder="Team name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {isSubmitting ? "Creating…" : "Create Team"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
            >
              Cancel
            </button>
          </div>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </form>
      </div>
    </div>
  );
}
