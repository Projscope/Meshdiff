import { IS_DESKTOP } from "./runtime";

const GA_MEASUREMENT_ID = "G-YYCQHG6EW5";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Loads Google Analytics only in production builds — `npm run dev`
 * (import.meta.env.DEV) never fires it, so local testing doesn't pollute
 * real traffic/conversion numbers. */
export function initAnalytics(): void {
  if (!import.meta.env.PROD || IS_DESKTOP) return;

  window.dataLayer = window.dataLayer ?? [];
  function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  }
  window.gtag = gtag;

  // Matches Google's canonical snippet order exactly: consent default,
  // then js/config, all queued into dataLayer BEFORE the gtag.js <script>
  // tag is even inserted into the page — not after, which is what this
  // file did previously. Despite the array-based queue nominally being
  // order-independent, Tag Assistant's Consent report kept reporting
  // "Default consent state has not been set yet" with the old order even
  // after confirming window.gtag was assigned and the consent/default
  // push was visibly processed in the debugger's own event log — so
  // something about gtag.js's actual bootstrapping is order-sensitive
  // here in a way the array-queue theory alone doesn't cover.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Self-hosted, cookie-less pageview beacon — runs alongside GA for now
 * (see plan "Self-hosted privacy-friendly analytics"), not a replacement
 * yet. Fire-and-forget: never blocks navigation, and the caller doesn't
 * need to know whether it succeeded. `sendBeacon` survives the page
 * unloading immediately after (e.g. on a route change), which a plain
 * fetch can't reliably guarantee without `keepalive`. */
const OWNER_FLAG_KEY = "meshdiff_no_track";

/** Remembers that this browser belongs to an admin so its public-page visits
 * stop counting — IP filtering would break on a dynamic IP. Survives sign-out
 * on purpose; clear localStorage to start counting this browser again. */
export function markBrowserAsOwner(): void {
  try {
    localStorage.setItem(OWNER_FLAG_KEY, "1");
  } catch {
    // Storage blocked — worst case the admin's own visits keep counting.
  }
}

function isOwnerBrowser(): boolean {
  try {
    return localStorage.getItem(OWNER_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function trackPageview(): void {
  if (!import.meta.env.PROD || IS_DESKTOP) return;
  if (isOwnerBrowser()) return;

  const payload = JSON.stringify({
    path: window.location.pathname,
    referrer: document.referrer,
    language: navigator.language,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/.netlify/functions/track", blob);
  } else {
    fetch("/.netlify/functions/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Best-effort only — a dropped pageview beacon is never worth
      // surfacing to the user or retrying.
    });
  }
}
