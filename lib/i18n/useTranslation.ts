import { useAtomValue } from "jotai";
import { translationsAtom } from "./atoms";
import { TranslationParams } from "./types";

/**
 * Récupère une valeur de traduction à partir d'une clé de chemin (ex: "common.welcome")
 */
const getNestedValue = (obj: any, path: string): string => {
  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result === undefined || result === null) {
      return path; // Retourne la clé si le chemin est invalide
    }
    result = result[key];
  }

  return typeof result === "string" ? result : path;
};

/**
 * Remplace les paramètres dans une chaîne de traduction
 * Exemple: "Hello {name}" avec params = { name: "John" } => "Hello John"
 */
const replaceParams = (text: string, params?: TranslationParams): string => {
  if (!params) return text;

  return Object.entries(params).reduce((acc, [key, value]) => {
    const regex = new RegExp(`{${key}}`, "g");
    return acc.replace(regex, String(value));
  }, text);
};

/**
 * Hook personnalisé pour utiliser les traductions
 */
export const useTranslation = () => {
  const translations = useAtomValue(translationsAtom);

  /**
   * Fonction pour traduire une clé
   * @param key - La clé de traduction (ex: "common.welcome")
   * @param params - Paramètres optionnels pour la substitution
   * @returns La traduction ou la clé si la traduction n'est pas trouvée
   */
  const t = (key: string, params?: TranslationParams): string => {
    const translation = getNestedValue(translations, key);
    return replaceParams(translation, params);
  };

  return { t };
};
