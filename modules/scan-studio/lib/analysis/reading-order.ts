/**
 * Ordre de lecture des zones d'une page, selon le format du chapitre (§ 6.4) :
 * manga de droite à gauche puis de haut en bas, manhua de gauche à droite,
 * webtoon de haut en bas.
 *
 * L'ordre calculé n'est qu'une proposition : il se corrige dans l'atelier.
 */

import type { ReadingFormat } from "../types";
import type { Box } from "./words";

/** Sens dans lequel se lisent les bulles d'une même rangée. */
export type RowDirection = "rtl" | "ltr";

/** Sens de lecture d'une rangée de bulles, pour chaque format. */
export function rowDirection(format: ReadingFormat): RowDirection {
  return format === "manga" ? "rtl" : "ltr";
}

/**
 * Part de la plus petite de deux zones qui doit être à la même hauteur que
 * l'autre pour qu'elles forment une rangée. Une page de manga ou de manhua se
 * lit par rangées de cases : la moitié suffit. Une bande de webtoon est une
 * seule colonne lue en descendant : deux bulles n'y forment une rangée que si
 * elles sont vraiment côte à côte (les trois quarts) ; sinon la plus haute
 * passe d'abord, où qu'elle soit dans la largeur.
 */
function rowOverlap(format: ReadingFormat): number {
  return format === "webtoon" ? 0.75 : 0.5;
}

/**
 * Range les zones en rangées (celles qui partagent une même bande
 * horizontale), puis chaque rangée dans le sens du format.
 */
export function sortByReadingOrder<T extends Box>(items: T[], format: ReadingFormat): T[] {
  const byTop = [...items].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const share = rowOverlap(format);

  const rows: T[][] = [];
  for (const item of byTop) {
    const row = rows[rows.length - 1];
    // La rangée se mesure à sa première zone, la plus haute : une zone la
    // rejoint si une part suffisante de la plus petite des deux est à la même hauteur.
    const anchor = row?.[0];
    if (anchor) {
      const overlap = Math.min(anchor.y1, item.y1) - Math.max(anchor.y0, item.y0);
      const smallest = Math.min(anchor.y1 - anchor.y0, item.y1 - item.y0);
      if (smallest > 0 && overlap >= smallest * share) {
        row.push(item);
        continue;
      }
    }
    rows.push([item]);
  }
  const direction = rowDirection(format) === "rtl" ? -1 : 1;
  return rows.flatMap((row) =>
    row.sort((a, b) => direction * ((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) || a.y0 - b.y0),
  );
}
