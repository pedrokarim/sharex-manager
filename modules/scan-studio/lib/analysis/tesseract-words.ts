/**
 * Passage du résultat de Tesseract aux mots de la chaîne d'analyse.
 *
 * Les types sont décrits ici par leur seule forme : ce fichier n'importe pas
 * le moteur, et sert tel quel au navigateur, au banc d'essai et aux tests.
 */

import type { WordBox } from "./words";

interface EngineBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface EngineWord {
  text: string;
  confidence: number;
  bbox: EngineBox;
}

interface EngineLine {
  words: EngineWord[];
  bbox: EngineBox;
  baseline?: EngineBox | null;
}

export interface EngineBlock {
  paragraphs: { lines: EngineLine[] }[];
}

/** Réglages de segmentation de Tesseract (`tessedit_pageseg_mode`). */
export const PAGE_SEGMENTATION = {
  /** Un seul bloc de texte uniforme. */
  block: "6",
  /** Texte épars, sans ordre : tout ce qui se lit, où que ce soit. */
  sparse: "11",
} as const;

/** Inclinaison d'une ligne, d'après sa ligne de base ; indéfinie si la ligne est trop courte pour en juger. */
function angleOf(line: EngineLine): number | undefined {
  const baseline = line.baseline;
  if (!baseline) return undefined;
  const dx = baseline.x1 - baseline.x0;
  const dy = baseline.y1 - baseline.y0;
  const height = line.bbox.y1 - line.bbox.y0;
  if (dx <= 0 || Math.hypot(dx, dy) < height * 2.5) return undefined;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Mots d'une lecture, à plat, avec leur confiance ramenée entre 0 et 1. */
export function wordsFromBlocks(blocks: EngineBlock[] | null | undefined): WordBox[] {
  const words: WordBox[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const angle = angleOf(line);
        for (const word of line.words ?? []) {
          const text = (word.text ?? "").trim();
          if (!text) continue;
          words.push({
            text,
            confidence: Math.max(0, Math.min(1, (word.confidence ?? 0) / 100)),
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
            ...(angle === undefined ? {} : { angle }),
          });
        }
      }
    }
  }
  return words;
}
