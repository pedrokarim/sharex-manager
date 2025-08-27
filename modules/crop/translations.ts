import { Language } from "@/lib/atoms/preferences";

// Import des fichiers de traduction JSON
import fr from "./locales/fr.json";
import en from "./locales/en.json";

/**
 * Traductions spécifiques au module de recadrage
 */
const translations: {
  [language in Language]?: Record<string, any>;
} = {
  fr,
  en,
};

export default translations;
