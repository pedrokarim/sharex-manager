"use client";

/**
 * Polices des textes, embarquées avec l'application : aucune requête vers un
 * service tiers, et l'export dispose exactement des mêmes polices que
 * l'aperçu.
 */

import "@fontsource/anton/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/bangers/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/700.css";
import "@fontsource/inter/600.css";

export const FONTS: { family: string; weights: number[]; label: string }[] = [
  { family: "Montserrat", weights: [600, 800], label: "Montserrat" },
  { family: "Anton", weights: [400], label: "Anton" },
  { family: "Bebas Neue", weights: [400], label: "Bebas Neue" },
  { family: "Poppins", weights: [500, 700], label: "Poppins" },
  { family: "Bangers", weights: [400], label: "Bangers" },
  { family: "Inter", weights: [600], label: "Inter" },
];

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
        font.weights.map((weight) =>
          document.fonts.load(`${weight} 48px "${font.family}"`).catch(() => [])
        )
      )
    ).then(() => undefined);
  }
  return ready;
}
