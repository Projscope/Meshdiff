/** True only in the Electron desktop renderer (set by vite.desktop.config.ts).
 * The desktop app makes no network calls from the renderer: no analytics, no
 * tracking beacons, no CDN assets. */
export const IS_DESKTOP = import.meta.env.VITE_DESKTOP === "true";
