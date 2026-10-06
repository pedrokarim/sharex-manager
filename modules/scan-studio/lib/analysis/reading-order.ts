/**
 * Ordre de lecture des zones d'une page, selon le format du chapitre (§ 6.4) :
 * manga de droite à gauche puis de haut en bas, manhua de gauche à droite,
 * webtoon de haut en bas.
 *
 * L'ordre calculé n'est qu'une proposition : il se corrige dans l'atelier.
 */

import type { ReadingFormat } from "../types";
import type { Box } from "./words";

/**
 * Range les zones en rangées (celles qui partagent une même bande
 * horizontale), puis chaque rangée dans le sens du format.
 */
export function sortByReadingOrder<T extends Box>(items: T[], format: ReadingFormat): T[] {
  const byTop = [...items].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  if (format === "webtoon") return byTop;

  const rows: T[][] = [];
  for (const item of byTop) {
    const row = rows[rows.length - 1];
    // La rangée se mesure à sa première zone, la plus haute : une zone la
    // rejoint si la moitié de la plus petite des deux est à la même hauteur.
    const anchor = row?.[0];
    if (anchor) {
      const overlap = Math.min(anchor.y1, item.y1) - Math.max(anchor.y0, item.y0);
      const smallest = Math.min(anchor.y1 - anchor.y0, item.y1 - item.y0);
      if (smallest > 0 && overlap >= smallest * 0.5) {
        row.push(item);
        continue;
      }
    }
    rows.push([item]);
  }
  const direction = format === "manga" ? -1 : 1;
  return rows.flatMap((row) =>
    row.sort((a, b) => direction * ((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) || a.y0 - b.y0),
  );
}
