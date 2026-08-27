import { useEffect, useState } from "react";
import i18n from "./i18n";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands" },
  { code: "da", label: "Dansk" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const STORAGE_KEY = "meshdiff_language";
// Same "localStorage + custom event" pattern as shadingMode.ts/showGrid.ts
// — a single global preference, kept in sync across every component on the
// page (the sidebar's LanguageSelect isn't the only consumer of i18next's
// active language) without needing localStorage's own cross-tab-only
// "storage" event. This is a per-browser preference by design, not synced
// to the account — same scope as the existing theme/shading-mode toggles.
const CHANGE_EVENT = "meshdiff:language-change";

function isSupported(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

function readStored(): LanguageCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && isSupported(stored) ? stored : "en";
}

export function setLanguage(code: LanguageCode): void {
  localStorage.setItem(STORAGE_KEY, code);
  void i18n.changeLanguage(code);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Applies the stored language to i18next once at startup — call this
 * before the app renders (see main.tsx), same as the inline theme script
 * in index.html applying the stored theme before first paint. */
export function initLanguage(): void {
  const stored = readStored();
  if (stored !== "en") void i18n.changeLanguage(stored);
}

/** The active UI language for the signed-in dashboard, shared across every
 * component that reads it (and persisted across visits) — same pattern as
 * useShadingMode()/useShowGrid(). Public marketing pages and the admin
 * panel are untranslated by design and don't use this. */
export function useLanguage(): [LanguageCode, (code: LanguageCode) => void] {
  const [language, setLanguageState] = useState<LanguageCode>(() => readStored());

  useEffect(() => {
    const onChange = () => setLanguageState(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [language, setLanguage];
}
