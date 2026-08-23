const KEY = "meshdiff_pending_checkout_tier";

/**
 * Call when routing a signed-out visitor to sign up specifically to
 * complete a Pro or Team checkout — persists across that redirect, and
 * (since email confirmation is required — see LoginPage.tsx) across the
 * whole confirm-email round trip too, so the dashboard can resume the
 * checkout automatically once a real session exists.
 */
export function markPendingCheckout(tier: "pro" | "team"): void {
  try {
    localStorage.setItem(KEY, tier);
  } catch {
    // localStorage can throw in some environments (private mode, storage
    // disabled) — losing the "resume checkout" convenience isn't worth
    // crashing the click over.
  }
}

/** Reads and clears the flag in one step, so a checkout attempt is only ever resumed once. */
export function consumePendingCheckout(): "pro" | "team" | null {
  try {
    const pending = localStorage.getItem(KEY);
    if (pending === "pro" || pending === "team") {
      localStorage.removeItem(KEY);
      return pending;
    }
    return null;
  } catch {
    return null;
  }
}
