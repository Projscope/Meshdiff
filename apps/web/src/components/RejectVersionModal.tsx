import { useState } from "react";

interface RejectVersionModalProps {
  versionLabel: string;
  isSubmitting?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export default function RejectVersionModal({ versionLabel, isSubmitting, onConfirm, onCancel }: RejectVersionModalProps) {
  const [reason, setReason] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onConfirm(reason.trim() ? reason.trim() : undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white">Reject {versionLabel}?</h3>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <label className="text-xs text-neutral-400">Reason (optional)</label>
          <textarea
            autoFocus
            placeholder="e.g. Wall thickness fails print tolerance"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isSubmitting ? "Rejecting…" : "Reject"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
