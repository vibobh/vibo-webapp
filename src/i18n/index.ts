import en from "./en.json";
import ar from "./ar.json";

export type Lang = "en" | "ar";
export type Translations = typeof en;

const translations: Record<Lang, Translations> = { en, ar };

export function getTranslations(lang: Lang): Translations {
  return translations[lang] || translations.en;
}

export function isRTL(lang: Lang): boolean {
  return lang === "ar";
}
