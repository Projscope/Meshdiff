import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "../lib/projectsApi";

export default function EditWorkspaceModal({
  initialName,
  onClose,
  onSaved,
}: {
  initialName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await updateWorkspace(name);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved(result.data.name);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ink-50">{t("editWorkspaceModal.title")}</h3>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <input
            type="text"
            required
            autoFocus
            placeholder={t("editWorkspaceModal.namePlaceholder")}
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
              {isSubmitting ? t("editWorkspaceModal.saving") : t("editWorkspaceModal.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
            >
              {t("common.cancel")}
            </button>
          </div>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </form>
      </div>
    </div>
  );
}
