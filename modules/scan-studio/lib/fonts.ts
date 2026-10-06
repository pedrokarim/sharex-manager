"use client";

/**
 * Polices de lettrage, embarquées avec l'application : aucune requête vers un
 * service tiers, et l'export dispose exactement des mêmes polices que
 * l'aperçu. Toutes sont sous licence libre (OFL).
 */

import "@fontsource/comic-neue/400.css";
import "@fontsource/comic-neue/400-italic.css";
import "@fontsource/comic-neue/700.css";
import "@fontsource/comic-neue/700-italic.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/bangers/400.css";
import "@fontsource/anton/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/800.css";

export interface LetteringFont {
  family: string;
  weights: number[];
  /** La police a une vraie italique ; sinon le navigateur la penche. */
  italic: boolean;
  /** À quoi elle sert le plus souvent. */
  usage: string;
}

export const FONTS: LetteringFont[] = [
  { family: "Comic Neue", weights: [400, 700], italic: true, usage: "Dialogue" },
  { family: "Patrick Hand", weights: [400], italic: false, usage: "Pensée, récitatif" },
  { family: "Bangers", weights: [400], italic: false, usage: "Cri, onomatopée" },
  { family: "Anton", weights: [400], italic: false, usage: "Titre, onomatopée" },
  { family: "Montserrat", weights: [600, 800], italic: false, usage: "Texte du décor" },
];

/** Graisse disponible la plus proche de celle demandée. */
export function nearestWeight(family: string, weight: number): number {
  const font = FONTS.find((entry) => entry.family === family);
  if (!font) return weight;
  return font.weights.reduce((best, candidate) => (Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best));
}

let ready: Promise<void> | null = null;

/**
 * Un canevas ne déclenche pas le chargement d'une police : il dessine avec la
 * police de repli tant qu'elle n'est pas prête. On les charge donc toutes
 * explicitement avant le premier rendu.
 */
export function ensureFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(
      FONTS.flatMap((font) =>
        font.weights.flatMap((weight) => [
          document.fonts.load(`${weight} 48px "${font.family}"`).catch(() => []),
          ...(font.italic ? [document.fonts.load(`italic ${weight} 48px "${font.family}"`).catch(() => [])] : []),
        ]),
      ),
    ).then(() => undefined);
  }
  return ready;
}
