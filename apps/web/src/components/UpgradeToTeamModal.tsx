import { useState } from "react";
import { startTeamCheckout } from "../lib/projectsApi";

export default function UpgradeToTeamModal({ onClose }: { onClose: () => void }) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setIsStarting(true);
    setError(null);
    const result = await startTeamCheckout();
    if (result.success) {
      window.location.href = result.data.url;
    } else {
      setIsStarting(false);
      setError(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
          Team plan
        </span>
        <h3 className="mt-3 text-sm font-semibold text-white">Upgrade to create a team</h3>
        <p className="mt-2 text-sm text-neutral-400">
          Teams — with shared projects, member roles, and version approval workflows — are available on
          the Meshdiff Team plan. Seat count is adjustable at checkout.
        </p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void handleUpgrade()}
            disabled={isStarting}
            className="flex-1 rounded bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isStarting ? "Redirecting…" : "Upgrade to Team"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
