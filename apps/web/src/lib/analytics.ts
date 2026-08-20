const GA_MEASUREMENT_ID = "G-YYCQHG6EW5";

declare global {
  interface Window {
    dataLayer?: unknown[];
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
  // Google Consent Mode: without an explicit "granted" signal, gtag.js
  // silently discards every hit and never sets its cookies — it loads,
  // hooks itself into dataLayer, and looks completely healthy, but
  // nothing ever reaches Google's servers. No ad/remarketing use here,
  // so ad_storage stays denied; analytics_storage is granted since this
  // is plain traffic analytics with no separate cookie-consent banner.
  gtag("consent", "default", { ad_storage: "denied", analytics_storage: "granted" });
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
}
