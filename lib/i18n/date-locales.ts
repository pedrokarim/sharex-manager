import { fr, enUS } from "date-fns/locale";
import { useAtomValue } from "jotai";
import { languageAtom } from "../atoms/preferences";
import type { Locale } from "date-fns";

/**
 * Mapping des codes de langue vers les locales date-fns
 */
export const dateLocales: Record<string, Locale> = {
  fr,
  en: enUS,
};

/**
 * Hook pour obtenir la locale date-fns correspondant à la langue actuelle
 */
export const useDateLocale = (): Locale => {
  const language = useAtomValue(languageAtom);
  return dateLocales[language] || fr; // Fallback sur le français si la langue n'existe pas
};
