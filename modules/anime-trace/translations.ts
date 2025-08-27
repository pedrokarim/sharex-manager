import { ModuleTranslations } from "@/lib/i18n/types";

const translations: ModuleTranslations = {
  en: {
    title: "Anime Scene Search",
    description: "Search for the anime source of this image",
    start_message:
      "Click 'Analyze' to search for the anime source of this image",
    analyzing: "Analyzing image...",
    analyzing_button: "Analyzing...",
    analyze: "Analyze",
    cancel: "Cancel",
    unknown_title: "Unknown Anime",
    similarity: "Similarity: {{value}}%",
    episode: "Episode {{number}}",
    score: "Score: {{score}}%",
    view_scene: "View Scene",
    results_title: "Search Results",
    errors: {
      analysis_failed: "Failed to analyze the image",
      unknown: "An unknown error occurred",
      image_too_large: "Image is too large. Maximum size is 25MB.",
    },
  },
  fr: {
    title: "Recherche de scène d'anime",
    description: "Rechercher la source anime de cette image",
    start_message:
      "Cliquez sur 'Analyser' pour rechercher la source anime de cette image",
    analyzing: "Analyse de l'image en cours...",
    analyzing_button: "Analyse...",
    analyze: "Analyser",
    cancel: "Annuler",
    unknown_title: "Anime inconnu",
    similarity: "Similarité : {{value}}%",
    episode: "Épisode {{number}}",
    score: "Note : {{score}}%",
    view_scene: "Voir la scène",
    results_title: "Résultats de la recherche",
    errors: {
      analysis_failed: "Échec de l'analyse de l'image",
      unknown: "Une erreur inconnue est survenue",
      image_too_large:
        "L'image est trop volumineuse. La taille maximale est de 25MB.",
    },
  },
};

export default translations;
