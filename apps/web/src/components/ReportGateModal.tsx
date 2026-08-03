import { useState } from "react";

interface ReportGateModalProps {
  onClose: () => void;
  onSubmit: (email: string) => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function ReportGateModal({
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: ReportGateModalProps) {
  const [email, setEmail] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm text-neutral-300">
          Enter your email to download the full diff report (JSON +
          screenshot) and subscribe to our news.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(email);
          }}
          className="mt-4 flex flex-col gap-2"
        >
          <input
            type="email"
            required
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? "Sending…" : "Get Report"}
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
      </div>
    </div>
  );
}
