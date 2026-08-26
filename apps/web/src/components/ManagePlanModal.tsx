import { useState } from "react";
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

interface PlanRowConfig {
  id: PlanId;
  name: string;
  price: string;
  blurb: string;
}

const PLANS: PlanRowConfig[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "The Sample Project and the Live Diff tool only — existing projects stay in read-only mode.",
  },
  { id: "pro", name: "Pro", price: "$15/mo", blurb: "Project workspaces, version history, comment pins, PDF reports." },
  { id: "team", name: "Team", price: "$35/seat/mo", blurb: "Everything in Pro, plus shared projects and version approval." },
];

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
  const [pendingAction, setPendingAction] = useState<"downgrade-to-free" | "pro-to-team" | "team-to-pro" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlan: PlanId = subscription.tier;
  const readableCurrent = currentPlan === "team" ? "Team" : currentPlan === "pro" ? "Pro" : subscription.isTrialing ? "Free Trial" : "Free";

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
      onNotice({ type: "success", message: `You're now on the ${tier === "team" ? "Team" : "Pro"} plan.` });
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
        message: `Your ${readableCurrent} plan will end on ${formatDate(result.data.currentPeriodEnd)}, then the account becomes read-only until you resubscribe.`,
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
      onNotice({ type: "success", message: `Subscription resumed — your ${readableCurrent} plan will keep renewing.` });
      onClose();
    } else {
      setError(result.error);
    }
  }

  function actionFor(plan: PlanId): { label: string; onClick: () => void } | null {
    if (plan === currentPlan) return null;
    if (plan === "free") {
      return { label: "Downgrade to Free", onClick: () => setPendingAction("downgrade-to-free") };
    }
    if (currentPlan === "free") {
      return { label: `Upgrade to ${plan === "team" ? "Team" : "Pro"}`, onClick: () => void handleUpgradeCheckout(plan) };
    }
    // currentPlan is the other paid tier — switch the existing subscription.
    return {
      label: plan === "team" ? "Upgrade to Team" : "Downgrade to Pro",
      onClick: () => setPendingAction(plan === "team" ? "pro-to-team" : "team-to-pro"),
    };
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-ink-800 bg-ink-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ink-50">Manage plan</h3>
        <p className="mt-1 text-xs text-ink-500">
          Current plan: <span className="font-medium text-ink-300">{readableCurrent}</span>
          {subscription.isTrialing && ` — ${subscription.trialDaysRemaining} day${subscription.trialDaysRemaining === 1 ? "" : "s"} left`}
          {subscription.cancelAtPeriodEnd &&
            subscription.currentPeriodEnd &&
            ` — ends ${formatDate(subscription.currentPeriodEnd)}, then read-only`}
        </p>

        {subscription.cancelAtPeriodEnd && (
          <button
            type="button"
            onClick={() => void handleResume()}
            disabled={isSubmitting}
            className="mt-3 w-full rounded border border-accent-700 px-3 py-1.5 text-xs font-medium text-accent-400 hover:border-accent-500 disabled:opacity-50"
          >
            Resume — keep renewing on the {readableCurrent} plan
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
                    {plan.name} <span className="text-ink-500">· {plan.price}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">{plan.blurb}</p>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 rounded bg-accent-500/15 px-2 py-1 text-[11px] font-semibold uppercase text-accent-400">
                    Current
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
                          : "border-accent-700 text-accent-400 hover:border-accent-500 hover:bg-accent-500/10"
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
          Close
        </button>
      </div>

      {pendingAction === "downgrade-to-free" && (
        <ConfirmDialog
          title={`Downgrade to Free?`}
          message={
            subscription.currentPeriodEnd
              ? `You'll keep ${readableCurrent} access until ${formatDate(subscription.currentPeriodEnd)}. After that, your projects become read-only — you can still sign in and view or delete them, but not create, comment, or upload new versions — until you resubscribe.`
              : `You'll keep ${readableCurrent} access until the end of the current billing period. After that, your projects become read-only — you can still sign in and view or delete them, but not create, comment, or upload new versions — until you resubscribe.`
          }
          confirmLabel="Downgrade to Free"
          cancelLabel={`Keep ${readableCurrent}`}
          isDestructive
          isConfirming={isSubmitting}
          onConfirm={() => void handleDowngradeToFree()}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction === "pro-to-team" && (
        <ConfirmDialog
          title="Upgrade to Team?"
          message="Your subscription switches to Team ($35/seat/mo, 5 seats to start, prorated for the rest of this billing period). Adjust seat count any time via Manage billing."
          confirmLabel="Upgrade to Team"
          cancelLabel="Cancel"
          isConfirming={isSubmitting}
          onConfirm={() => void handleChangePlan("team")}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction === "team-to-pro" && (
        <ConfirmDialog
          title="Downgrade to Pro?"
          message="Your subscription switches to Pro ($15/mo, single seat, prorated for the rest of this billing period). Any team members riding your seats will lose access immediately — they'll need their own Pro subscription to keep using Meshdiff."
          confirmLabel="Downgrade to Pro"
          cancelLabel="Keep Team"
          isDestructive
          isConfirming={isSubmitting}
          onConfirm={() => void handleChangePlan("pro")}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
