/**
 * Contrat de l'analyse d'une page : repérage des zones de texte et lecture,
 * dans le navigateur. `index.ts` l'implémente ; les pages du module ne
 * dépendent que de ce fichier pour les types.
 */

import type { ChapterSettings, ScanRegion } from "../types";

export type AnalysisStep = "preparing" | "reading" | "saving" | "done" | "skipped" | "error";

export interface AnalysisProgress {
  pageId: string;
  step: AnalysisStep;
  /** Avancement de la page, de 0 à 1. */
  progress: number;
  message?: string;
}

export interface AnalyzePagesOptions {
  /**
   * Faux (défaut) : les zones existantes sont conservées et seules les
   * nouvelles s'ajoutent. Vrai : les zones non retouchées à la main sont
   * remplacées ; une zone corrigée à la main n'est jamais écrasée.
   */
  replace?: boolean;
  onProgress?: (progress: AnalysisProgress) => void;
  signal?: AbortSignal;
}

export interface AnalyzePagesResult {
  analyzed: number;
  /** Zones ajoutées au total. */
  regions: number;
  failed: { pageId: string; error: string }[];
  /**
   * Pages analysées qui semblent n'avoir rien à traduire (couverture, bannière,
   * illustration). Une suggestion : rien n'est décidé à la place de l'utilisateur.
   */
  untranslatable: string[];
}

/** Zones lues sur une image, dans l'ordre de lecture du format du chapitre. */
export type AnalyzeImage = (
  image: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
  settings: ChapterSettings,
  onProgress?: (progress: number) => void,
) => Promise<ScanRegion[]>;

/** Analyse des pages enregistrées : lit chaque page, pose ses zones et l'enregistre. */
export type AnalyzePages = (pageIds: string[], options?: AnalyzePagesOptions) => Promise<AnalyzePagesResult>;
