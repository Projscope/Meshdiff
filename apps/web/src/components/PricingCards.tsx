import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "@phosphor-icons/react";
import { useCountdown } from "../hooks/useCountdown";
import { LAUNCH_OFFER_DEADLINE } from "../lib/featureFlags";
import { supabase } from "../lib/supabaseClient";
import { getSubscription } from "../lib/projectsApi";
import { markPendingCheckout } from "../lib/pendingCheckout";
import AlreadyProModal from "./AlreadyProModal";

interface PricingTier {
  name: string;
  price: string;
  /** Struck through next to price when set — e.g. the pre-discount price. */
  originalPrice?: string;
  period: string | null;
  audience: string;
  cta: { label: string; to: string } | { label: string; scroll: true } | { label: string; checkout: "pro" | "team" };
  highlighted: boolean;
  features: string[];
  /** Small promo pill shown above the tier name, e.g. a launch discount. */
  badge?: string;
  /** Small urgency line shown under the price, e.g. a launch-offer deadline. */
  urgency?: string;
}

/** Pro/Team's launch-offer price/badge/urgency only apply while
 * LAUNCH_OFFER_DEADLINE hasn't passed yet — once it has, both tiers fall
 * back to their normal price with no discount styling. Kept as a function
 * (not a static array) so it can be recomputed each render as the
 * countdown ticks past zero, without a page reload. */
function getPricingTiers(offerActive: boolean): PricingTier[] {
  return [
    {
      name: "Community",
      price: "Free",
      period: null,
      audience: "For makers exploring Meshdiff — 14-day free trial of Pro features, no card required",
      cta: { label: "Sign Up", to: "/login?mode=signup" },
      highlighted: false,
      badge: "No credit card required",
      features: [
        "Compare OBJ, STL, and 3MF files",
        "Measure distances and radiuses tools",
        "Voxel diff, added and removed",
        "Adjustable tolerance and cross-section",
        "Shareable links, 1, 3, or 7 days",
      ],
    },
    {
      name: "Pro",
      price: offerActive ? "$7.50" : "$15.00",
      originalPrice: offerActive ? "$15.00" : undefined,
      period: "/mo",
      audience: "For individual engineers and designers",
      cta: { label: "Subscribe to Pro", checkout: "pro" },
      highlighted: true,
      badge: offerActive ? "Early Subscriber Offer (50% OFF × 1 months)" : undefined,
      urgency: offerActive ? "Launch offer: 50% off first month. Ends Sunday at midnight." : undefined,
      features: [
        "Everything in Community",
        "Project workspaces",
        "Version history for every model",
        "Comment pins on 3D models",
        "PDF diff reports for client review",
      ],
    },
    {
      name: "Team",
      price: offerActive ? "$17.50" : "$35.00",
      originalPrice: offerActive ? "$35.00" : undefined,
      period: "/seat/mo",
      audience: "For teams reviewing and approving physical designs",
      cta: { label: "Subscribe to Team", checkout: "team" },
      highlighted: false,
      badge: offerActive ? "Early Subscriber Offer (50% OFF × 1 months)" : undefined,
      urgency: offerActive ? "Launch offer: 50% off first month. Ends Sunday at midnight." : undefined,
      features: [
        "Everything in Pro",
        "Shared projects with team members",
        "Comment threads with review states",
        "Version approval workflow",
        "Slicer profile snapshots and print logs",
        "Centralized billing and roles",
      ],
    },
  ];
}

/**
 * The tier card grid shared between the homepage's #pricing section
 * (LandingPage.tsx) and the standalone /pricing page (PricingPage.tsx) —
 * single source of truth for tier data, prices, and checkout behavior so
 * the two pages can't drift apart.
 */
export default function PricingCards() {
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [alreadySubscribedTier, setAlreadySubscribedTier] = useState<"pro" | "team" | null>(null);
  const proOfferCountdown = useCountdown(LAUNCH_OFFER_DEADLINE);
  // useCountdown ticks every second, so this is re-evaluated each render —
  // the moment the deadline passes, both tiers fall back to normal price
  // with no reload needed (mirrors AnnouncementBar's own expiry check).
  const offerActive = Date.now() < LAUNCH_OFFER_DEADLINE.getTime();
  const pricingTiers = getPricingTiers(offerActive);

  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
  }

  // Three outcomes depending on who's clicking:
  //  - Signed out: nowhere to check out into yet — send to sign-up (not
  //    sign-in; someone clicking "Subscribe" is very likely a new visitor)
  //    and remember the intent so the dashboard can resume checkout
  //    automatically once a session exists (see ProjectsLayout.tsx —
  //    handles both the immediate-session and confirm-email-first cases,
  //    since the flag survives that whole round trip in localStorage).
  //  - Signed in, already on this tier: nothing to sell them — a plain
  //    "you're already subscribed" modal instead of a pointless second
  //    Checkout session.
  //  - Signed in, not yet on this tier: same "resume on the dashboard"
  //    flag, then straight to /projects — ProjectsLayout raises the real
  //    Checkout redirect from there once it's confirmed the tier itself.
  async function handleCheckout(tier: "pro" | "team") {
    setIsCheckingOut(true);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      markPendingCheckout(tier);
      navigate("/login?mode=signup");
      return;
    }

    const subscriptionResult = await getSubscription();
    if (subscriptionResult.success && subscriptionResult.data.tier === tier) {
      setIsCheckingOut(false);
      setAlreadySubscribedTier(tier);
      return;
    }

    markPendingCheckout(tier);
    navigate("/projects");
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {pricingTiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-xl border p-6 ${
              tier.highlighted ? "border-accent-500 bg-ink-900" : "border-ink-800 bg-ink-900"
            }`}
          >
            {tier.badge && (
              <span className="absolute -top-3 left-6 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-chrome-950">
                {tier.badge}
              </span>
            )}
            <h3 className={`text-sm font-semibold ${tier.highlighted ? "text-accent-400" : "text-ink-300"}`}>
              {tier.name}
            </h3>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-ink-50">{tier.price}</span>
              {tier.originalPrice && <span className="text-sm text-ink-400 line-through">{tier.originalPrice}</span>}
              {tier.period && <span className="text-xs text-ink-400">{tier.period}</span>}
            </div>
            <p className="mt-1 text-xs text-ink-400">{tier.audience}</p>
            {tier.urgency && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-purple-400">
                <span className="rounded-full bg-purple-400" />
                *{tier.urgency}
                <span className="font-mono tabular-nums">{proOfferCountdown}</span>
              </p>
            )}

            {"to" in tier.cta ? (
              <Link
                to={tier.cta.to}
                className="mt-4 block w-full rounded-lg bg-accent-500 py-2 text-center text-sm font-medium text-chrome-950 transition hover:bg-accent-400"
              >
                {tier.cta.label}
              </Link>
            ) : "checkout" in tier.cta ? (
              (() => {
                const checkoutTier = tier.cta.checkout;
                return (
                  <button
                    type="button"
                    onClick={() => void handleCheckout(checkoutTier)}
                    disabled={isCheckingOut}
                    className="mt-4 w-full rounded-lg border border-accent-500/40 bg-accent-500/10 py-2 text-sm font-medium text-accent-400 transition hover:bg-accent-500/15 disabled:opacity-50"
                  >
                    {isCheckingOut ? "Redirecting…" : tier.cta.label}
                  </button>
                );
              })()
            ) : (
              <button
                type="button"
                onClick={scrollToEarlyAccess}
                className={`mt-4 w-full rounded-lg py-2 text-sm font-medium transition ${
                  tier.highlighted
                    ? "border border-accent-500/40 bg-accent-500/10 text-accent-400 hover:bg-accent-500/15"
                    : "border border-ink-700 text-ink-300 hover:border-ink-500"
                }`}
              >
                {tier.cta.label}
              </button>
            )}
            <ul className="mt-5 flex flex-col gap-2 text-xs text-ink-400">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-accent-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {alreadySubscribedTier && (
        <AlreadyProModal tier={alreadySubscribedTier} onClose={() => setAlreadySubscribedTier(null)} />
      )}
    </>
  );
}
