import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createApprovalGate,
  deleteApprovalGate,
  listVersionApprovalGates,
  setGateFulfillment,
  type VersionGateFulfillment,
} from "../lib/projectsApi";

interface ApprovalGateChecklistProps {
  projectId: string;
  versionId: string;
  /** Admin/owner only — matches canConfigureGates() server-side. An
   * approver or member can still check off a gate (toggling isn't a review
   * action) but can't add/remove gate definitions. */
  canConfigure: boolean;
  /** Called after any change that could shift the satisfied/total count
   * shown elsewhere (e.g. the version row's "2/3 gates" badge). */
  onChanged?: () => void;
}

// Gates only apply to versions finalized after the gate was created (see
// seedGateFulfillments() in apps/api/src/routes/versions.ts) — a version
// finalized before a gate existed simply has no fulfillment row for it, so
// it won't appear in this version's checklist even though it appears in
// newer ones. That's intentional per the plan, not a bug.
export default function ApprovalGateChecklist({ projectId, versionId, canConfigure, onChanged }: ApprovalGateChecklistProps) {
  const { t } = useTranslation();
  const [gates, setGates] = useState<VersionGateFulfillment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const result = await listVersionApprovalGates(projectId, versionId);
    if (result.success) setGates(result.data);
    setIsLoading(false);
  }

  useEffect(() => {
    setIsLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, versionId]);

  async function handleToggle(gateId: string, satisfied: boolean) {
    // Optimistic — this is a low-stakes checkbox, not worth a loading spinner.
    setGates((prev) => prev.map((g) => (g.id === gateId ? { ...g, satisfied } : g)));
    const result = await setGateFulfillment(projectId, versionId, gateId, satisfied);
    if (!result.success) {
      setGates((prev) => prev.map((g) => (g.id === gateId ? { ...g, satisfied: !satisfied } : g)));
      setError(result.error);
      return;
    }
    onChanged?.();
  }

  async function handleAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setIsAdding(true);
    const result = await createApprovalGate(projectId, trimmed);
    setIsAdding(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNewLabel("");
    // The version this checklist is showing was finalized before this gate
    // existed, so it has no fulfillment row yet — nothing to refetch here;
    // the new gate only shows up on versions finalized from now on.
  }

  async function handleRemove(gateId: string) {
    const result = await deleteApprovalGate(projectId, gateId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setGates((prev) => prev.filter((g) => g.id !== gateId));
    onChanged?.();
  }

  if (isLoading) return null;
  if (gates.length === 0 && !canConfigure) return null;

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
        {t("approvalGates.title")}
      </p>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      <div className="mt-2 space-y-1.5">
        {gates.map((gate) => (
          <div key={gate.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gate.satisfied}
              onChange={(event) => void handleToggle(gate.id, event.target.checked)}
              className="h-3.5 w-3.5 shrink-0 rounded border-ink-600 bg-ink-950 accent-accent-500"
            />
            <span className={gate.satisfied ? "text-ink-300 line-through decoration-ink-600" : "text-ink-200"}>
              {gate.label}
            </span>
            {canConfigure && (
              <button
                type="button"
                onClick={() => void handleRemove(gate.id)}
                title={t("approvalGates.removeTooltip")}
                className="ml-auto shrink-0 text-ink-600 hover:text-red-400"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {gates.length === 0 && <p className="text-xs text-ink-500">{t("approvalGates.none")}</p>}
      </div>
      {canConfigure && (
        <div className="mt-2.5 flex gap-1.5 border-t border-ink-800 pt-2.5">
          <input
            type="text"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleAdd();
            }}
            placeholder={t("approvalGates.addPlaceholder")}
            maxLength={200}
            className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-200 placeholder:text-ink-600"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={isAdding || !newLabel.trim()}
            className="shrink-0 rounded border border-ink-700 px-2 py-1 text-xs text-ink-200 hover:border-ink-500 disabled:opacity-50"
          >
            {t("approvalGates.add")}
          </button>
        </div>
      )}
    </div>
  );
}
