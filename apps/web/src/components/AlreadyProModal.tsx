import { Link } from "react-router-dom";

export default function AlreadyProModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
          Pro plan
        </span>
        <h3 className="mt-3 text-sm font-semibold text-white">You already subscribed</h3>
        <p className="mt-2 text-sm text-neutral-400">
          This account already has an active Pro subscription — head to your dashboard to manage it.
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            to="/projects"
            onClick={onClose}
            className="flex-1 rounded bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
