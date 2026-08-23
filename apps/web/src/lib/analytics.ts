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
  if (!import.meta.env.PROD) return;

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
