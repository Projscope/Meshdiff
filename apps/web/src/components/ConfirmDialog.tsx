interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDestructive = false,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    // z-[9999] rather than a lower Tailwind step — this needs to reliably
    // sit above drei's <Html> 3D overlays (e.g. CommentPopover), whose
    // zIndexRange can assign inline z-index values up to 100 depending on
    // camera depth, well past a plain z-50.
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-neutral-400">{message}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`flex-1 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              isDestructive ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {isConfirming ? "Working…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
