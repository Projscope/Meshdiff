import { Link } from "react-router-dom";

interface AlreadyProModalProps {
  onClose: () => void;
  /** Which tier the account is already on — drives the badge/copy below. */
  tier?: "pro" | "team";
}

export default function AlreadyProModal({ onClose, tier = "pro" }: AlreadyProModalProps) {
  const tierLabel = tier === "team" ? "Team" : "Pro";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rounded bg-accent-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-fg-400">
          {tierLabel} plan
        </span>
        <h3 className="mt-3 text-sm font-semibold text-ink-50">You already subscribed</h3>
        <p className="mt-2 text-sm text-ink-400">
          This account already has an active {tierLabel} subscription — head to your dashboard to manage it.
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            to="/projects"
            onClick={onClose}
            className="flex-1 rounded bg-accent-500 px-4 py-2 text-center text-sm font-medium text-chrome-950 hover:bg-accent-400"
          >
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
