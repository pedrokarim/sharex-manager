"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { moduleTranslationsAtom } from "./atoms";
import { Language } from "../atoms/preferences";

/**
 * Hook personnalisé pour enregistrer les traductions d'un module
 * @param moduleName - Le nom du module
 * @param translations - Les traductions du module par langue
 */
export function useModuleTranslations(
  moduleName: string,
  translations: {
    [language in Language]?: Record<string, any>;
  }
) {
  const setModuleTranslations = useSetAtom(moduleTranslationsAtom);

  useEffect(() => {
    // Enregistrer les traductions du module
    setModuleTranslations((prev) => ({
      ...prev,
      [moduleName]: translations,
    }));

    // Nettoyer les traductions lorsque le composant est démonté
    return () => {
      setModuleTranslations((prev) => {
        const newTranslations = { ...prev };
        delete newTranslations[moduleName];
        return newTranslations;
      });
    };
  }, [moduleName, translations, setModuleTranslations]);
}
