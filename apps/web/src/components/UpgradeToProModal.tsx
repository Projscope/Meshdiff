import { useEffect, useState } from "react";
import { startProCheckout, listActiveCoupons, type ActiveCoupon } from "../lib/projectsApi";

function describeCoupon(coupon: ActiveCoupon): string {
  const amount = coupon.percentOff !== null ? `${coupon.percentOff}% off` : `$${coupon.amountOff} off`;
  return coupon.durationMonths ? `${amount} for ${coupon.durationMonths} month${coupon.durationMonths > 1 ? "s" : ""}` : amount;
}

export default function UpgradeToProModal({ onClose }: { onClose: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCouponField, setShowCouponField] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [defaultCoupon, setDefaultCoupon] = useState<ActiveCoupon | null>(null);

  useEffect(() => {
    listActiveCoupons().then((result) => {
      if (result.success && result.data.length > 0) setDefaultCoupon(result.data[0]);
    });
  }, []);

  async function handleSubscribe() {
    setIsSubmitting(true);
    setError(null);
    const result = await startProCheckout(couponCode.trim() || undefined);
    if (result.success) {
      window.location.href = result.data.url;
      return;
    }
    setError(result.error);
    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
          Pro plan
        </span>
        <h3 className="mt-3 text-sm font-semibold text-white">Upgrade to Pro</h3>
        <p className="mt-2 text-sm text-neutral-400">
          Project workspaces, version history, comment pins on 3D models, and PDF diff reports.
        </p>

        {defaultCoupon && !showCouponField && (
          <p className="mt-4 rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
            🎉 {defaultCoupon.code} applied — {describeCoupon(defaultCoupon)}
          </p>
        )}

        {showCouponField ? (
          <input
            type="text"
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
            placeholder="Coupon code"
            autoFocus
            className="mt-4 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowCouponField(true)}
            className="mt-4 text-xs text-neutral-500 underline hover:text-neutral-300"
          >
            Have a coupon code?
          </button>
        )}

        {error && (
          <p className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={isSubmitting}
            className="flex-1 rounded bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isSubmitting ? "Redirecting…" : "Subscribe"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
