import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en";
import de from "../locales/de";
import nl from "../locales/nl";
import da from "../locales/da";
import es from "../locales/es";
import fr from "../locales/fr";

// Covers only the signed-in Projects workspace (sidebar, project list,
// shared modals, and — as more pages are migrated — version/compare
// views). The public marketing site/blog and the admin panel are
// deliberately untranslated: those are SEO-owned, prerendered, or
// internal-only surfaces, not part of this rollout. See language.ts for
// the persisted-preference hook (useLanguage()) that drives this.
void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    nl: { translation: nl },
    da: { translation: da },
    es: { translation: es },
    fr: { translation: fr },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18next;
