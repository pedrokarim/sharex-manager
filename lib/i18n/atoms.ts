import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { Language, languageAtom } from "../atoms/preferences";
import { LocaleData } from "./types";

// Import des fichiers de traduction
import fr from "./locales/fr.json";
import en from "./locales/en.json";

// Données de traduction
export const localeDataAtom = atom<LocaleData>({
  fr,
  en,
});

// Atome dérivé qui combine la langue actuelle et les données de traduction
export const translationsAtom = atom((get) => {
  const language = get(languageAtom);
  const localeData = get(localeDataAtom);
  return localeData[language] || localeData.fr; // Fallback sur le français si la langue n'existe pas
});
