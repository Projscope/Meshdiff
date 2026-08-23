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

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  }
  // Google's own official snippet always assigns this to window.gtag, not
  // just a local closure — some of Google's own tooling (Tag Assistant's
  // Consent report, at minimum) reads window.gtag directly rather than
  // inferring state purely from dataLayer's array contents. Confirmed via
  // Tag Assistant showing "Default consent state has not been set yet"
  // even though the consent/default push was visibly processed by the
  // container in the debugger's own event log.
  window.gtag = gtag;
  // Google Consent Mode v2 checks four signals — ad_storage, analytics_storage,
  // ad_user_data, ad_personalization. Leaving any of them unset (not even
  // explicitly "denied") makes the container treat consent as unresolved,
  // which silently skips the actual GA4 measurement tag entirely: gtag.js
  // still loads, still hooks into dataLayer, and still looks completely
  // healthy (confirmed via the GA Debugger extension — only the
  // consent-init bookkeeping tag fired, never the measurement tag), but no
  // hit ever reaches Google's servers. No ad/remarketing use here, so the
  // ad_* signals all stay denied; analytics_storage is granted since this
  // is plain traffic analytics with no separate cookie-consent banner.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
}
