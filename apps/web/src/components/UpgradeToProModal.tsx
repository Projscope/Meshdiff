import { useState } from "react";
import { startProCheckout } from "../lib/projectsApi";

export default function UpgradeToProModal({ onClose }: { onClose: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setIsSubmitting(true);
    setError(null);
    const result = await startProCheckout();
    if (result.success) {
      window.location.href = result.data.url;
      return;
    }
    setError(result.error);
    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
          Pro plan
        </span>
        <h3 className="mt-3 text-sm font-semibold text-white">Upgrade to Pro</h3>
        <p className="mt-2 text-sm text-neutral-400">
          Project workspaces, version history, comment pins on 3D models, and PDF diff reports.
        </p>

        {error && (
          <p className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={isSubmitting}
            className="flex-1 rounded bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isSubmitting ? "Redirecting…" : "Subscribe"}
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
