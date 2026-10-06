/**
 * Ce que l'analyse sait de chaque langue source : son écriture, les modèles de
 * lecture qui la lisent, le sens d'écriture le plus courant et le format de
 * lecture qui va le plus souvent avec elle.
 *
 * Un modèle est un fichier de `public/scan-studio-ocr/lang/`, copié par
 * `scripts/copy-ocr-assets.ts`. Le navigateur ne charge que ceux de la langue
 * du chapitre analysé, et le modèle des colonnes seulement quand une zone est
 * écrite de haut en bas. Fonctions pures, sans DOM.
 */

import type { ReadingFormat, SourceLanguage } from "../types";

/** `latin` : mots séparés par des espaces ; les trois autres : signes pleins, écrits en lignes ou en colonnes. */
export type Script = "latin" | "japanese" | "chinese" | "korean";

/** Sens d'écriture d'un texte : en lignes, ou en colonnes lues de haut en bas et de droite à gauche. */
export type WritingDirection = "horizontal" | "vertical";

export interface ReadingLanguage {
  script: Script;
  /** Modèle du texte en lignes. */
  horizontal: string;
  /** Modèle du texte en colonnes ; `null` si la langue ne s'écrit pas ainsi. */
  vertical: string | null;
  /** Sens retenu quand la disposition des signes ne tranche pas. */
  prefer: WritingDirection;
  /** La langue porte des furigana : de petits signes de lecture à côté des kanji. */
  ruby: boolean;
}

const LANGUAGES: Record<SourceLanguage, ReadingLanguage> = {
  en: { script: "latin", horizontal: "eng", vertical: null, prefer: "horizontal", ruby: false },
  // La détection automatique n'existe pas encore : elle lit comme l'anglais.
  auto: { script: "latin", horizontal: "eng", vertical: null, prefer: "horizontal", ruby: false },
  ja: { script: "japanese", horizontal: "jpn", vertical: "jpn_vert", prefer: "vertical", ruby: true },
  "zh-Hans": { script: "chinese", horizontal: "chi_sim", vertical: "chi_sim_vert", prefer: "horizontal", ruby: false },
  "zh-Hant": { script: "chinese", horizontal: "chi_tra", vertical: "chi_tra_vert", prefer: "horizontal", ruby: false },
  ko: { script: "korean", horizontal: "kor", vertical: "kor_vert", prefer: "horizontal", ruby: false },
};

/** Ce que l'analyse sait d'une langue source ; l'anglais pour une langue inconnue. */
export function readingLanguage(language: SourceLanguage | undefined): ReadingLanguage {
  return (language && LANGUAGES[language]) || LANGUAGES.en;
}

/** La langue s'écrit-elle en signes pleins (japonais, chinois, coréen) ? */
export function isCjkLanguage(language: SourceLanguage | undefined): boolean {
  return readingLanguage(language).script !== "latin";
}

/** Modèle qui lit un texte de cette langue, écrit dans ce sens. */
export function readingModel(language: SourceLanguage | undefined, direction: WritingDirection): string {
  const entry = readingLanguage(language);
  return direction === "vertical" && entry.vertical ? entry.vertical : entry.horizontal;
}

/** Tous les modèles de lecture, pour qui doit les copier ou les vérifier. */
export function allReadingModels(): string[] {
  const models = new Set<string>();
  for (const entry of Object.values(LANGUAGES)) {
    models.add(entry.horizontal);
    if (entry.vertical) models.add(entry.vertical);
  }
  return [...models];
}

/**
 * Format de lecture qui va le plus souvent avec une langue source : manga pour
 * le japonais (pages lues de droite à gauche, texte en colonnes), webtoon pour
 * le coréen (une bande, texte en lignes), manhua pour le chinois. `null` quand
 * la langue ne dit rien du format : l'anglais traduit tous les formats.
 */
export function suggestedFormat(language: SourceLanguage): ReadingFormat | null {
  if (language === "ja") return "manga";
  if (language === "ko") return "webtoon";
  if (language === "zh-Hans" || language === "zh-Hant") return "manhua";
  return null;
}
