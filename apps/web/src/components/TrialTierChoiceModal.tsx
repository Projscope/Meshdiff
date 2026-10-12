import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "@phosphor-icons/react";
import { setTrialTier } from "../lib/projectsApi";
import { setTrialTierModalDismissed } from "../lib/trialTierChoiceModal";
import { getTeamTourStage, setTeamTourStage } from "../lib/teamTour";
import { useAccountStatus } from "./ProjectsLayout";

/**
 * Lets a free-tier trial user pick which plan to trial — Pro (the default)
 * or Team — with a real functional difference, not just messaging: picking
 * Team actually unlocks team-tier gating for the rest of the trial (see
 * getUserTier()'s trial_tier_choice fallback in subscription.ts). One
 * component serves both the first-time auto-shown intro and the later
 * "switch" control in ProjectsLayout.tsx — same content either way, only
 * the entry point differs.
 */
export default function TrialTierChoiceModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { tier, refreshSubscription } = useAccountStatus();
  const [isSaving, setIsSaving] = useState<"pro" | "team" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTeamSelected = tier === "team";

  function handleClose() {
    setTrialTierModalDismissed(true);
    onClose();
  }

  async function handleChoose(choice: "pro" | "team") {
    if ((choice === "team") === isTeamSelected) {
      handleClose();
      return;
    }
    setIsSaving(choice);
    setError(null);
    const result = await setTrialTier(choice);
    if (result.success) {
      // First-ever pick of Team starts the team-creation/roles walkthrough
      // (TeamCreateSpotlight.tsx -> TeamDashboardTour.tsx), which hands off
      // to the existing Sample Project tour once it's done. A later
      // re-pick (already past "unseen") doesn't restart it.
      if (choice === "team" && getTeamTourStage() === "unseen") {
        setTeamTourStage("awaiting-team");
      }
      refreshSubscription();
      handleClose();
    } else {
      setIsSaving(null);
      setError(result.error);
    }
  }

  return (
    // z-110: matches UpgradeToTeamModal.tsx — the 3D viewer's comment
    // pins render via drei's <Html> with zIndexRange={[100, 0]}, so a plain
    // z-50 here would let an open comment popover render on top.
    <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/70 p-4" onClick={handleClose}>
      <div
        className="w-full max-w-2xl rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-50">{t("trialTierChoice.title")}</h2>
            <p className="mt-1 text-sm text-ink-400">{t("trialTierChoice.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title={t("trialTierChoice.close")}
            className="shrink-0 rounded-sm px-1 text-sm leading-none text-ink-500 hover:text-ink-200"
          >
            ✕
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div
            className={`rounded-lg border p-5 ${!isTeamSelected ? "border-accent-500 bg-ink-950/40" : "border-ink-800"}`}
          >
            <h3 className={`text-sm font-semibold ${!isTeamSelected ? "text-accent-fg-400" : "text-ink-300"}`}>
              {t("trialTierChoice.proTitle")}
            </h3>
            <p className="mt-1 text-xs text-ink-400">{t("trialTierChoice.proTagline")}</p>
            <ul className="mt-4 flex flex-col gap-2 text-xs text-ink-400">
              {[
                t("trialTierChoice.proFeature1"),
                t("trialTierChoice.proFeature2"),
                t("trialTierChoice.proFeature3"),
                t("trialTierChoice.proFeature4"),
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-accent-fg-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void handleChoose("pro")}
              disabled={isSaving !== null}
              className={`mt-5 w-full rounded-lg py-2 text-sm font-medium transition disabled:opacity-50 ${
                !isTeamSelected
                  ? "border border-ink-700 text-ink-300"
                  : "border border-accent-500/40 bg-accent-500/10 text-accent-fg-400 hover:bg-accent-500/15"
              }`}
            >
              {!isTeamSelected ? t("trialTierChoice.currentlyTrying") : isSaving === "pro" ? t("trialTierChoice.saving") : t("trialTierChoice.selectPro")}
            </button>
          </div>

          <div
            className={`rounded-lg border p-5 ${isTeamSelected ? "border-accent-500 bg-ink-950/40" : "border-ink-800"}`}
          >
            <h3 className={`text-sm font-semibold ${isTeamSelected ? "text-accent-fg-400" : "text-ink-300"}`}>
              {t("trialTierChoice.teamTitle")}
            </h3>
            <p className="mt-1 text-xs text-ink-400">{t("trialTierChoice.teamTagline")}</p>
            <ul className="mt-4 flex flex-col gap-2 text-xs text-ink-400">
              {[
                t("trialTierChoice.teamFeature1"),
                t("trialTierChoice.teamFeature2"),
                t("trialTierChoice.teamFeature3"),
                t("trialTierChoice.teamFeature4"),
                t("trialTierChoice.teamFeature5"),
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-accent-fg-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void handleChoose("team")}
              disabled={isSaving !== null}
              className={`mt-5 w-full rounded-lg py-2 text-sm font-medium transition disabled:opacity-50 ${
                isTeamSelected
                  ? "border border-ink-700 text-ink-300"
                  : "border border-accent-500/40 bg-accent-500/10 text-accent-fg-400 hover:bg-accent-500/15"
              }`}
            >
              {isTeamSelected ? t("trialTierChoice.currentlyTrying") : isSaving === "team" ? t("trialTierChoice.saving") : t("trialTierChoice.selectTeam")}
            </button>
          </div>
        </div>

        <p className="mt-5 text-[11px] text-ink-500">{t("trialTierChoice.footerNote")}</p>
      </div>
    </div>
  );
}
