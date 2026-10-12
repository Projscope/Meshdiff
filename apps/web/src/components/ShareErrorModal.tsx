interface ShareErrorModalProps {
  message: string;
  onDismiss: () => void;
}

export default function ShareErrorModal({ message, onDismiss }: ShareErrorModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-semibold text-red-400">Couldn't open this share link</p>
        <p className="mt-2 text-sm text-ink-300">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 w-full rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-ink-50 hover:bg-blue-500"
        >
          Start a new diff
        </button>
      </div>
    </div>
  );
}
