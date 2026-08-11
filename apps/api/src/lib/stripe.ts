import Stripe from "stripe";

let cached: Stripe | null | undefined;

/** Returns null (not throws) when unconfigured, so callers can respond 500
 * instead of crashing — same pattern as getSupabase(). */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

/** Where Stripe should send the browser back to after Checkout/the Billing
 * Portal — defaults to the local dev server so this works without any env
 * setup, same convention as PORT's default in index.ts. */
export function getFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:5173";
}
