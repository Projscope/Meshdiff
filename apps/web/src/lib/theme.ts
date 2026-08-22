import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "meshdiff_theme";
// Same "localStorage + custom event" pattern as diffPalette.ts/
// shadingMode.ts — a single global preference, kept in sync across every
// consumer on the page (and applied to <html data-theme> directly, since
// the whole app's color scale reacts to it via CSS custom properties, not
// per-component dark:/light: classes — see index.css).
const CHANGE_EVENT = "meshdiff:theme-change";

function readStored(): Theme {
  // Guarded for the build-time SSR/prerender pass (see scripts/prerender.mjs):
  // modern Node ships a partial/non-functional global `localStorage` stub
  // in some configurations, so `typeof localStorage === "undefined"` alone
  // isn't a reliable check — wrap in try/catch instead. The inline script
  // in index.html sets the real theme before hydration in the browser.
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f5f7fb" : "#15181e");
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => readStored());

  useEffect(() => {
    apply(theme);
    const onChange = () => setThemeState(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [theme]);

  return [theme, setTheme];
}
