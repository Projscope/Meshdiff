const KEY = "meshdiff_pending_pro_checkout";

/**
 * Call when routing a signed-out visitor to sign up specifically to
 * complete a Pro checkout — persists across that redirect, and (since
 * email confirmation is required — see LoginPage.tsx) across the whole
 * confirm-email round trip too, so the dashboard can resume the checkout
 * automatically once a real session exists.
 */
export function markPendingProCheckout(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // localStorage can throw in some environments (private mode, storage
    // disabled) — losing the "resume checkout" convenience isn't worth
    // crashing the click over.
  }
}

/** Reads and clears the flag in one step, so a checkout attempt is only ever resumed once. */
export function consumePendingProCheckout(): boolean {
  try {
    const pending = localStorage.getItem(KEY) === "1";
    if (pending) localStorage.removeItem(KEY);
    return pending;
  } catch {
    return false;
  }
}
