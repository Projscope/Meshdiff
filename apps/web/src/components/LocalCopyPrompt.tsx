import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CopyVerification } from "../lib/verifyLocalCopy";

export type LocalCopyProblem = Extract<CopyVerification, { success: false }>["reason"] | "load_failed";

interface LocalCopyPromptProps {
  fileName: string;
  /** True while the dropped file is being hashed and parsed. */
  isChecking: boolean;
  problem: LocalCopyProblem | null;
  /** Overrides the standard text for `problem` (the desktop app gets its wording from the file store). */
  problemMessage?: string | null;
  onFile: (file: File) => void;
}

/**
 * Shown over the viewport of a version whose model is kept on its owner's
 * computer. The reviewer can still read the stats and comments; dropping in
 * their own copy (checked against the stored SHA-256, never uploaded) turns the
 * 3D view and comment pins on.
 */
export default function LocalCopyPrompt({ fileName, isChecking, problem, problemMessage, onFile }: LocalCopyPromptProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !isChecking) onFile(file);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink-950/90 p-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center ${
          isDragging ? "border-accent-400 bg-ink-900" : "border-ink-700 bg-ink-900/60"
        }`}
      >
        <h2 className="text-sm font-semibold text-ink-50">{t("versionDetail.localModelTitle")}</h2>
        <p className="text-xs leading-relaxed text-ink-400">{t("versionDetail.localModelBody", { fileName })}</p>

        <input
          ref={inputRef}
          type="file"
          accept=".stl,.obj,.3mf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
        <button
          type="button"
          disabled={isChecking}
          onClick={() => inputRef.current?.click()}
          className="rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400 disabled:cursor-wait disabled:opacity-60"
        >
          {isChecking ? t("versionDetail.localModelChecking") : t("versionDetail.localModelChoose")}
        </button>
        <p className="text-[11px] text-ink-500">{t("versionDetail.localModelDropHint")}</p>

        {(problem || problemMessage) && (
          <div role="alert" className="w-full rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
            {problemMessage ?? (problem ? t(`versionDetail.localModelProblem.${problem}`) : null)}
          </div>
        )}
      </div>
    </div>
  );
}
