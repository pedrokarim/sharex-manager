/**
 * Boîtes rendues par le détecteur de bulles et de texte : tri, dédoublonnage,
 * appariement d'un texte avec sa bulle, découpe des longues bandes.
 *
 * Fonctions pures, sans navigateur ni modèle : ce sont elles que les tests
 * exercent. Le modèle lui-même est appelé dans `detector.ts`.
 */

import type { Rect } from "../geometry";
import type { Box, PageSize } from "./words";

/** Ce que le modèle sait reconnaître, dans l'ordre de ses étiquettes. */
export const DETECTOR_CLASSES = ["bubble", "text_bubble", "text_free"] as const;
export type DetectorClass = (typeof DETECTOR_CLASSES)[number];

export interface DetectedBox extends Box {
  kind: DetectorClass;
  /** Confiance du modèle, de 0 à 1. */
  score: number;
}

/** Texte repéré, avec la bulle qui le porte quand il y en a une. */
export interface DetectedText extends Box {
  score: number;
  /** Bulle ou cartouche autour du texte ; absente pour un texte posé sur le dessin. */
  bubble?: Box;
}

/** En dessous, une boîte n'est pas gardée. */
export const DETECTOR_THRESHOLD = 0.4;
/** Côté de l'image que le modèle reçoit. */
export const DETECTOR_INPUT = 640;

const area = (box: Box) => Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);

function intersection(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}

/** Part de la plus petite des deux boîtes que l'autre recouvre. */
export function coverage(a: Box, b: Box): number {
  const smallest = Math.min(area(a), area(b));
  return smallest > 0 ? intersection(a, b) / smallest : 0;
}

/**
 * Lit les trois sorties du modèle (étiquettes, boîtes, confiances) et rend les
 * boîtes gardées, en pixels de la page, bornées à elle. Une boîte vide, hors
 * page ou d'une étiquette inconnue est écartée.
 */
export function readDetections(
  labels: ArrayLike<number | bigint>,
  boxes: ArrayLike<number>,
  scores: ArrayLike<number>,
  page: PageSize,
  threshold = DETECTOR_THRESHOLD
): DetectedBox[] {
  const found: DetectedBox[] = [];
  const count = Math.min(labels.length, scores.length, Math.floor(boxes.length / 4));
  for (let index = 0; index < count; index++) {
    const score = Number(scores[index]);
    if (!(score >= threshold)) continue;
    const kind = DETECTOR_CLASSES[Number(labels[index])];
    if (!kind) continue;
    const x0 = Math.max(0, Math.min(page.width, Number(boxes[index * 4])));
    const y0 = Math.max(0, Math.min(page.height, Number(boxes[index * 4 + 1])));
    const x1 = Math.max(0, Math.min(page.width, Number(boxes[index * 4 + 2])));
    const y1 = Math.max(0, Math.min(page.height, Number(boxes[index * 4 + 3])));
    if (!(x1 - x0 >= 2 && y1 - y0 >= 2)) continue;
    found.push({ kind, score, x0, y0, x1, y1 });
  }
  return found;
}

/**
 * Retire les doublons : deux boîtes de la même sorte posées sur la même chose.
 * La plus sûre reste. Un texte et sa bulle ne sont pas des doublons.
 */
export function dropDuplicates(boxes: DetectedBox[], overlap = 0.7): DetectedBox[] {
  const kept: DetectedBox[] = [];
  const isText = (box: DetectedBox) => box.kind !== "bubble";
  for (const box of [...boxes].sort((a, b) => b.score - a.score)) {
    if (kept.some((other) => isText(other) === isText(box) && coverage(box, other) > overlap)) continue;
    kept.push(box);
  }
  return kept;
}

/**
 * Rend les textes, chacun avec sa bulle : la plus petite bulle qui le contient
 * presque en entier. Un texte sans bulle est un texte posé sur le dessin.
 */
export function pairTexts(boxes: DetectedBox[]): DetectedText[] {
  const bubbles = boxes.filter((box) => box.kind === "bubble");
  return boxes
    .filter((box) => box.kind !== "bubble")
    .map((text) => {
      let best: Box | undefined;
      for (const bubble of bubbles) {
        if (area(text) === 0 || intersection(text, bubble) / area(text) < 0.8) continue;
        if (!best || area(bubble) < area(best)) best = bubble;
      }
      const paired: DetectedText = { x0: text.x0, y0: text.y0, x1: text.x1, y1: text.y1, score: text.score };
      if (best) paired.bubble = { x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 };
      return paired;
    });
}

/**
 * Tranches d'une longue bande (webtoon). Le modèle ramène ce qu'il reçoit à un
 * carré : une bande entière y serait écrasée. Chaque tranche est à peu près
 * aussi haute qu'une page de manga, et recouvre la suivante pour qu'une bulle
 * coupée par une frontière soit vue entière dans l'une des deux.
 */
export function detectorTiles(page: PageSize): Rect[] {
  const tileHeight = Math.round(page.width * 1.5);
  if (page.height <= tileHeight * 1.4) return [{ x: 0, y: 0, width: page.width, height: page.height }];
  const overlap = Math.round(page.width * 0.35);
  const step = tileHeight - overlap;
  const tiles: Rect[] = [];
  for (let y = 0; y < page.height; y += step) {
    const height = Math.min(tileHeight, page.height - y);
    tiles.push({ x: 0, y, width: page.width, height });
    if (y + height >= page.height) break;
  }
  // Un dernier reste trop mince est rattaché à la tranche précédente.
  const last = tiles[tiles.length - 1];
  if (tiles.length > 1 && last.height < overlap * 1.2) {
    tiles.pop();
    const previous = tiles[tiles.length - 1];
    previous.height = page.height - previous.y;
  }
  return tiles;
}

/**
 * Réunit les boîtes de plusieurs tranches, remises dans les pixels de la page.
 * Une boîte collée à une frontière intérieure y est peut-être coupée : celle de
 * la tranche voisine, où elle est entière, est préférée.
 */
export function mergeTileDetections(perTile: { tile: Rect; boxes: DetectedBox[] }[], page: PageSize): DetectedBox[] {
  const edge = Math.max(2, Math.round(page.width * 0.01));
  const all: (DetectedBox & { cut: boolean })[] = [];
  for (const { tile, boxes } of perTile) {
    for (const box of boxes) {
      const y0 = box.y0 + tile.y;
      const y1 = box.y1 + tile.y;
      const cutTop = tile.y > 0 && box.y0 <= edge;
      const cutBottom = tile.y + tile.height < page.height && box.y1 >= tile.height - edge;
      all.push({ ...box, x0: box.x0 + tile.x, x1: box.x1 + tile.x, y0, y1, cut: cutTop || cutBottom });
    }
  }
  // Une boîte coupée perd contre une boîte entière qui la recouvre, quelle que soit sa confiance.
  const ranked = all.sort((a, b) => Number(a.cut) - Number(b.cut) || b.score - a.score);
  const kept: (DetectedBox & { cut: boolean })[] = [];
  const isText = (box: DetectedBox) => box.kind !== "bubble";
  for (const box of ranked) {
    if (kept.some((other) => isText(other) === isText(box) && coverage(box, other) > 0.6)) continue;
    kept.push(box);
  }
  return kept.map(({ cut: _cut, ...box }) => box);
}
