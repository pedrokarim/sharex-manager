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
  /** Texte de la ligne tel que le moteur le rend, avec ses espaces. */
  text?: string;
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
  /** Un seul bloc de texte écrit en colonnes, de haut en bas (modèles « _vert »). */
  vertical: "5",
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
  let lineIndex = 0;
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const angle = angleOf(line);
        const rank = lineIndex++;
        // Où le moteur met-il des espaces ? Son découpage en mots ne le dit pas pour le coréen,
        // où chaque syllabe est un « mot » : on le relit dans le texte de la ligne.
        const lineText = typeof line.text === "string" ? line.text : null;
        let cursor = 0;
        for (const word of line.words ?? []) {
          const text = (word.text ?? "").trim();
          if (!text) continue;
          let spaced = true;
          if (lineText !== null) {
            const at = lineText.indexOf(text, cursor);
            if (at >= 0) {
              spaced = at > cursor && lineText.slice(cursor, at).trim() === "" && cursor > 0;
              cursor = at + text.length;
            }
          }
          words.push({
            text,
            confidence: Math.max(0, Math.min(1, (word.confidence ?? 0) / 100)),
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
            line: rank,
            spaced,
            ...(angle === undefined ? {} : { angle }),
          });
        }
      }
    }
  }
  return words;
}
