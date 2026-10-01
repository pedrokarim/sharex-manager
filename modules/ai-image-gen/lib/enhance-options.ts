/**
 * Options de l'assistant d'écriture, partagées entre le compositeur et le
 * serveur (aucune dépendance Node).
 */

export type EnhanceLevel = 1 | 2 | 3;

export const ENHANCE_LEVELS: { level: EnhanceLevel; label: string; description: string }[] = [
  {
    level: 1,
    label: "Corriger",
    description: "Orthographe, grammaire et ponctuation. Vos mots et vos idées restent les mêmes.",
  },
  {
    level: 2,
    label: "Enrichir",
    description: "Corrige, puis ajoute quelques détails visuels : lumière, cadrage, ambiance.",
  },
  {
    level: 3,
    label: "Sublimer",
    description: "Réécrit un prompt complet et soutenu, fidèle à votre idée : sujet, décor, composition, lumière, style.",
  },
];

export interface EnhanceBooster {
  id: string;
  label: string;
  /** Ce que le renfort demande, transmis tel quel à l'assistant. */
  hint: string;
}

/** Renforts d'ambiance, à la manière des mots-clés qu'on ajoute sur Midjourney. */
export const ENHANCE_BOOSTERS: EnhanceBooster[] = [
  { id: "spectacular", label: "Spectaculaire", hint: "une scène spectaculaire, à grande échelle, qui impressionne" },
  { id: "dazzling", label: "Éblouissant", hint: "un rendu éblouissant : lumière éclatante, reflets, éclat" },
  { id: "cinematic", label: "Cinématique", hint: "un cadrage et une lumière de cinéma, faible profondeur de champ" },
  { id: "photoreal", label: "Photoréaliste", hint: "un rendu photographique réaliste, textures crédibles" },
  { id: "detailed", label: "Ultra-détaillé", hint: "une grande finesse de détails et de textures" },
  { id: "dramatic", label: "Lumière dramatique", hint: "un éclairage dramatique, contrastes marqués, clair-obscur" },
  { id: "vivid", label: "Couleurs vives", hint: "des couleurs vives et saturées" },
  { id: "dark", label: "Sombre", hint: "une ambiance sombre et mystérieuse" },
  { id: "dreamy", label: "Onirique", hint: "une atmosphère onirique, douce et irréelle" },
  { id: "epic", label: "Épique", hint: "un souffle épique, composition monumentale" },
  { id: "minimal", label: "Minimaliste", hint: "une composition épurée, peu d'éléments, beaucoup d'espace" },
  { id: "vintage", label: "Argentique", hint: "un rendu de pellicule argentique, grain, couleurs d'époque" },
];

export const MAX_ENHANCE_PROMPT = 4000;
export const MAX_ENHANCE_INSTRUCTION = 500;

export interface EnhanceRequest {
  prompt: string;
  level: EnhanceLevel;
  /** Identifiants de `ENHANCE_BOOSTERS`. */
  boosters?: string[];
  /** Demande libre : « ajoute un chat roux », « version de nuit »… */
  instruction?: string;
}

/** Préférences de l'assistant retenues par le compte. */
export const WRITING_PREFERENCE_SCOPE = "ai-image-gen.writing";

export interface WritingPreference {
  level?: number;
  boosters?: string[];
  [key: string]: unknown;
}
