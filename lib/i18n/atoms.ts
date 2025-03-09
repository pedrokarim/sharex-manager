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

// Atome pour stocker les traductions des modules
export const moduleTranslationsAtom = atom<{
  [moduleName: string]: {
    [language in Language]?: Record<string, any>;
  };
}>({});

// Atome dérivé qui combine la langue actuelle, les données de traduction et les traductions des modules
export const translationsAtom = atom((get) => {
  const language = get(languageAtom);
  const localeData = get(localeDataAtom);
  const moduleTranslations = get(moduleTranslationsAtom);

  // Créer une copie profonde des traductions de base
  const baseTranslations = JSON.parse(
    JSON.stringify(localeData[language] || localeData.fr)
  );

  // Fusionner les traductions des modules
  Object.entries(moduleTranslations).forEach(([moduleName, translations]) => {
    const moduleTranslation = translations[language] || translations.fr;
    if (moduleTranslation) {
      // Si le module a une section dans les traductions de base, fusionner avec celle-ci
      if (baseTranslations.modules && baseTranslations.modules[moduleName]) {
        baseTranslations.modules[moduleName] = {
          ...baseTranslations.modules[moduleName],
          ...moduleTranslation,
        };
      }
      // Sinon, ajouter les traductions du module
      else if (baseTranslations.modules) {
        baseTranslations.modules[moduleName] = moduleTranslation;
      }
    }
  });

  return baseTranslations;
});
