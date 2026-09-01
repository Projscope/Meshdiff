import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, useLanguage, type LanguageCode } from "../lib/language";

/** Dashboard-only language toggle — see language.ts for the persisted
 * preference this reads/writes (localStorage, per-browser, same pattern as
 * the theme toggle) and i18n.ts for what's actually translated so far. */
export default function LanguageSelect() {
  const { t } = useTranslation();
  const [language, setLanguage] = useLanguage();

  return (
    <label className="flex items-center justify-between gap-2 text-xs text-ink-400">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-ink-600">
        {t("language.label")}
      </span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as LanguageCode)}
        className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-300 hover:border-ink-500 focus:border-accent-500 focus:outline-none"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
