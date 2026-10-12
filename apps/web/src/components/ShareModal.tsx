import { useState } from "react";

export type ExpiresInDays = 1 | 3 | 7;

interface ShareModalProps {
  onClose: () => void;
  onSubmit: (expiresInDays: ExpiresInDays) => void;
  isSubmitting: boolean;
  error: string | null;
  shareUrl: string | null;
}

const EXPIRATION_OPTIONS: { value: ExpiresInDays; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
];

export default function ShareModal({
  onClose,
  onSubmit,
  isSubmitting,
  error,
  shareUrl,
}: ShareModalProps) {
  const [expiresInDays, setExpiresInDays] = useState<ExpiresInDays>(3);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context); the
      // link is still visible and selectable in the input either way.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {shareUrl ? (
          <>
            <p className="text-sm text-ink-300">
              Anyone with this link can view the diff until it expires.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(event) => event.target.select()}
                className="flex-1 rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-ink-50 hover:bg-blue-500"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-sm border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-300">
              Create a link so someone else can see this exact diff — same
              two models, same tolerance, same view.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit(expiresInDays);
              }}
              className="mt-4 flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-ink-400">Link expires after</span>
                <div className="flex overflow-hidden rounded-sm border border-ink-700 text-sm">
                  {EXPIRATION_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setExpiresInDays(value)}
                      className={`flex-1 px-3 py-1.5 ${
                        expiresInDays === value
                          ? "bg-ink-700 text-ink-50"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-ink-50 hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating…" : "Create Link"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-sm border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
                >
                  Cancel
                </button>
              </div>
              {error && <span className="text-xs text-red-400">{error}</span>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
