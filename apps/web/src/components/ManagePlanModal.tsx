import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  startProCheckout,
  startTeamCheckout,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  type SubscriptionStatus,
} from "../lib/projectsApi";
import ConfirmDialog from "./ConfirmDialog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type PlanId = "free" | "pro" | "team";

interface ManagePlanModalProps {
  subscription: SubscriptionStatus;
  onClose: () => void;
  /** Merges into the parent's subscription state after a successful action,
   * so the sidebar reflects the change immediately without a full refetch. */
  onSubscriptionChange: (updates: Partial<SubscriptionStatus>) => void;
  onNotice: (notice: { type: "success" | "error" | "info"; message: string }) => void;
}

/**
 * Single dialog for every plan transition, replacing the old split of
 * UpgradeToProModal/UpgradeToTeamModal/the sidebar's inline Cancel confirm.
 * Shows the current plan and, for each other plan, the one correct action:
 * - Free/trialing -> Pro or Team: a brand-new Stripe Checkout session
 *   (startProCheckout/startTeamCheckout) — there's no existing subscription
 *   to modify yet.
 * - Pro <-> Team: changePlan() updates the EXISTING subscription's price in
 *   place (prorated) — using checkout here would create a second, duplicate
 *   subscription instead of switching the one that exists.
 * - Pro or Team -> Free: cancelSubscription() (unchanged endpoint) — access
 *   continues through the paid period, then the account becomes read-only,
 *   which the confirmation copy below says explicitly.
 */
export default function ManagePlanModal({ subscription, onClose, onSubscriptionChange, onNotice }: ManagePlanModalProps) {
  const { t } = useTranslation();
  const [pendingAction, setPendingAction] = useState<"downgrade-to-free" | "pro-to-team" | "team-to-pro" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planName: Record<PlanId, string> = {
    free: t("billing.freePlan"),
    pro: t("billing.proPlan"),
    team: t("billing.teamPlan"),
  };

  const PLANS: Array<{ id: PlanId; price: string; blurb: string }> = [
    { id: "free", price: "$0", blurb: t("managePlan.freeBlurb") },
    { id: "pro", price: "$15/mo", blurb: t("managePlan.proBlurb") },
    { id: "team", price: "$35/seat/mo", blurb: t("managePlan.teamBlurb") },
  ];

  const currentPlan: PlanId = subscription.tier;
  const readableCurrent = currentPlan === "team" ? planName.team : currentPlan === "pro" ? planName.pro : subscription.isTrialing ? t("billing.freeTrialPlan") : planName.free;

  async function handleUpgradeCheckout(tier: "pro" | "team") {
    setIsSubmitting(true);
    setError(null);
    const result = tier === "team" ? await startTeamCheckout() : await startProCheckout();
    if (result.success) {
      window.location.href = result.data.url;
      return;
    }
    setError(result.error);
    setIsSubmitting(false);
  }

  async function handleChangePlan(tier: "pro" | "team") {
    setIsSubmitting(true);
    setError(null);
    const result = await changePlan(tier);
    setIsSubmitting(false);
    setPendingAction(null);
    if (result.success) {
      onSubscriptionChange({ tier, accountStatus: "pro", cancelAtPeriodEnd: false });
      onNotice({ type: "success", message: t("managePlan.planActivatedNotice", { plan: planName[tier] }) });
      onClose();
    } else {
      setError(result.error);
    }
  }

  async function handleDowngradeToFree() {
    setIsSubmitting(true);
    setError(null);
    const result = await cancelSubscription();
    setIsSubmitting(false);
    setPendingAction(null);
    if (result.success) {
      onSubscriptionChange({ cancelAtPeriodEnd: true, currentPeriodEnd: result.data.currentPeriodEnd });
      onNotice({
        type: "info",
        message: t("managePlan.downgradeNotice", { plan: readableCurrent, date: formatDate(result.data.currentPeriodEnd) }),
      });
      onClose();
    } else {
      setError(result.error);
    }
  }

  async function handleResume() {
    setIsSubmitting(true);
    setError(null);
    const result = await resumeSubscription();
    setIsSubmitting(false);
    if (result.success) {
      onSubscriptionChange({ cancelAtPeriodEnd: false, currentPeriodEnd: result.data.currentPeriodEnd });
      onNotice({ type: "success", message: t("managePlan.resumedNotice", { plan: readableCurrent }) });
      onClose();
    } else {
      setError(result.error);
    }
  }

  function actionFor(plan: PlanId): { label: string; onClick: () => void } | null {
    if (plan === currentPlan) return null;
    if (plan === "free") {
      return { label: t("managePlan.downgradeToFree"), onClick: () => setPendingAction("downgrade-to-free") };
    }
    if (currentPlan === "free") {
      return {
        label: plan === "team" ? t("managePlan.upgradeToTeam") : t("managePlan.upgradeToPro"),
        onClick: () => void handleUpgradeCheckout(plan),
      };
    }
    // currentPlan is the other paid tier — switch the existing subscription.
    return {
      label: plan === "team" ? t("managePlan.upgradeToTeam") : t("managePlan.downgradeToPro"),
      onClick: () => setPendingAction(plan === "team" ? "pro-to-team" : "team-to-pro"),
    };
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ink-50">{t("managePlan.title")}</h3>
        <p className="mt-1 text-xs text-ink-500">
          {t("managePlan.currentPlanLabel")} <span className="font-medium text-ink-300">{readableCurrent}</span>
          {subscription.isTrialing &&
            ` — ${t("managePlan.trialDaysLeft", { count: subscription.trialDaysRemaining })}`}
          {subscription.cancelAtPeriodEnd &&
            subscription.currentPeriodEnd &&
            ` — ${t("managePlan.endsThenReadOnly", { date: formatDate(subscription.currentPeriodEnd) })}`}
        </p>

        {subscription.cancelAtPeriodEnd && (
          <button
            type="button"
            onClick={() => void handleResume()}
            disabled={isSubmitting}
            className="mt-3 w-full rounded border border-accent-700 px-3 py-1.5 text-xs font-medium text-accent-fg-400 hover:border-accent-500 disabled:opacity-50"
          >
            {t("managePlan.resumeButton", { plan: readableCurrent })}
          </button>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const action = actionFor(plan.id);
            return (
              <div
                key={plan.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  isCurrent ? "border-accent-700 bg-accent-950/20" : "border-ink-800"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-100">
                    {planName[plan.id]} <span className="text-ink-500">· {plan.price}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">{plan.blurb}</p>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 rounded bg-accent-500/15 px-2 py-1 text-[11px] font-semibold uppercase text-accent-fg-400">
                    {t("managePlan.current")}
                  </span>
                ) : (
                  action && (
                    <button
                      type="button"
                      onClick={action.onClick}
                      disabled={isSubmitting}
                      className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${
                        plan.id === "free"
                          ? "border-ink-700 text-ink-400 hover:border-red-700 hover:text-red-400"
                          : "border-accent-700 text-accent-fg-400 hover:border-accent-500 hover:bg-accent-500/10"
                      }`}
                    >
                      {action.label}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded border border-ink-700 px-4 py-2 text-center text-sm text-ink-300 hover:border-ink-500"
        >
          {t("managePlan.close")}
        </button>
      </div>

      {pendingAction === "downgrade-to-free" && (
        <ConfirmDialog
          title={t("managePlan.confirmDowngradeTitle")}
          message={
            subscription.currentPeriodEnd
              ? t("managePlan.confirmDowngradeMessageWithDate", {
                  plan: readableCurrent,
                  date: formatDate(subscription.currentPeriodEnd),
                })
              : t("managePlan.confirmDowngradeMessageNoDate", { plan: readableCurrent })
          }
          confirmLabel={t("managePlan.downgradeToFree")}
          cancelLabel={t("managePlan.keepPlan", { plan: readableCurrent })}
          isDestructive
          isConfirming={isSubmitting}
          onConfirm={() => void handleDowngradeToFree()}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction === "pro-to-team" && (
        <ConfirmDialog
          title={t("managePlan.confirmUpgradeTeamTitle")}
          message={t("managePlan.confirmUpgradeTeamMessage")}
          confirmLabel={t("managePlan.upgradeToTeam")}
          cancelLabel={t("common.cancel")}
          isConfirming={isSubmitting}
          onConfirm={() => void handleChangePlan("team")}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction === "team-to-pro" && (
        <ConfirmDialog
          title={t("managePlan.confirmDowngradeProTitle")}
          message={t("managePlan.confirmDowngradeProMessage")}
          confirmLabel={t("managePlan.downgradeToPro")}
          cancelLabel={t("managePlan.keepPlan", { plan: planName.team })}
          isDestructive
          isConfirming={isSubmitting}
          onConfirm={() => void handleChangePlan("pro")}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
