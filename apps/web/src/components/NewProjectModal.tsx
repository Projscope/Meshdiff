import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createProject, type ProjectSummary } from "../lib/projectsApi";

export default function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: ProjectSummary) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await createProject(name, description);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onCreated(result.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ink-50">{t("newProjectModal.title")}</h3>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <input
            type="text"
            required
            autoFocus
            placeholder={t("newProjectModal.namePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
          />
          <textarea
            placeholder={t("newProjectModal.descriptionPlaceholder")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {isSubmitting ? t("newProjectModal.creating") : t("newProjectModal.create")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500"
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
