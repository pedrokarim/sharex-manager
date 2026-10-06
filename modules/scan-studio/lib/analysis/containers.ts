/**
 * Le contenant d'un texte : la bulle ou le cartouche qui le porte.
 *
 * Dans une bande dessinée, le texte tient presque toujours dans une plage
 * unie fermée par un trait : le blanc d'une bulle, le noir d'un cartouche. Le
 * repérage s'appuie sur cette structure :
 *  - deux lettres ne vont ensemble que si la même plage les entoure : deux
 *    cartouches accolés, séparés par un simple trait, restent deux zones, et
 *    une zone ne déborde jamais sur le dessin voisin ;
 *  - la plage dit aussi la place dont dispose le texte traduit, plus grande
 *    que le texte d'origine, et jusqu'où le masque peut aller sans mordre sur
 *    le contour.
 *
 * Fonctions pures sur des tableaux de pixels : ni DOM, ni moteur.
 */

import type { PixelData } from "../mask-color";
import type { Point } from "../types";
import { labelBackground, toBitmap, type Polarity } from "./ink";
import { boxHeight, boxWidth, unionBox, type Box, type PageSize } from "./words";

/** Plage de fond qui entoure des lettres, en pixels de la page. */
export interface Container extends Box {
  id: number;
  /** `dark` : plage claire à l'encre sombre ; `light` : plage sombre à l'encre claire. */
  polarity: Polarity;
  /** Surface de la plage, lettres non comprises. */
  area: number;
  /** Seuil de fond et réduction de l'image au moment du repérage : la mesure les reprend. */
  threshold: number;
  factor: number;
}

/** Part de la page qu'une bulle ne dépasse pas : au-delà, c'est le papier ou le fond d'une case. */
const MAX_PAGE_SHARE = 0.2;
/** Part de sa boîte qu'une bulle remplit au moins : en dessous, la plage serpente dans le dessin. */
const MIN_SOLIDITY = 0.5;
/** Part d'une bande que des pixels étrangers peuvent occuper sans arrêter la mesure : une poussière, pas un trait. */
const STRIP_TOLERANCE = 0.02;
/** Part du rectangle commun à deux blocs qui peut sortir du contenant sans empêcher de les réunir. */
export const MAX_FOREIGN_SHARE = 0.08;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * La plage a-t-elle la forme d'une bulle ou d'un cartouche ? Assez ramassée,
 * et bien plus petite que la page. Le papier entre les cases, le fond d'une
 * case ou un blanc qui serpente entre les traits du dessin n'en sont pas.
 */
export function isEnclosure(container: Container, page: PageSize): boolean {
  const width = boxWidth(container);
  const height = boxHeight(container);
  if (width <= 0 || height <= 0) return false;
  // Une bande de webtoon est jugée sur une hauteur d'écran, pas sur ses milliers de pixels.
  const pageArea = page.width * Math.min(page.height, page.width * 1.5);
  if (container.area > pageArea * MAX_PAGE_SHARE) return false;
  if (width >= page.width * 0.95 || height >= Math.min(page.height, page.width * 1.5) * 0.95) return false;
  return container.area / (width * height) >= MIN_SOLIDITY;
}

/** Place trouvée autour d'un bloc de texte, dans son contenant. */
export interface ContainerSurvey {
  /**
   * Part du rectangle commun aux blocs, hors des blocs eux-mêmes, qui n'est
   * pas dans le contenant : proche de 0 quand le texte tient dans un seul
   * rectangle de la bulle, élevée quand le contenant fait un coude entre eux.
   */
  foreign(blocks: Box[]): number;
  /**
   * Plus grand rectangle du contenant autour de `block`, en pixels de la page :
   * il s'arrête au contour, aux autres blocs (`others`) et à `reach` pixels du
   * bloc au plus.
   */
  room(block: Box, others: Box[], reach: number): Box;
}

export interface SurveyOptions {
  polarity: Polarity;
  threshold: number;
  factor: number;
  /** Points de la page connus pour être dans le contenant : un par lettre repérée. */
  anchors: Point[];
}

/**
 * Relève le contenant d'un texte sur les pixels qui l'entourent. `offset` est
 * le coin de `pixels` dans la page. Rend `null` si aucun point d'ancrage ne
 * tombe sur du fond : l'appelant garde alors la boîte du texte telle quelle.
 */
export function surveyContainer(pixels: PixelData, offset: Point, options: SurveyOptions): ContainerSurvey | null {
  const factor = Math.max(1, Math.round(options.factor));
  const bitmap = toBitmap(pixels, factor);
  const { width, height } = bitmap;
  const map = labelBackground(bitmap, options.polarity, options.threshold);

  // La plage est celle que désignent le plus de points d'ancrage.
  const votes = new Map<number, number>();
  for (const anchor of options.anchors) {
    const x = Math.floor((anchor.x - offset.x) / factor);
    const y = Math.floor((anchor.y - offset.y) / factor);
    let label = 0;
    // L'image n'est pas réduite sur la même grille qu'au repérage : on regarde aussi les voisins.
    for (let radius = 0; radius <= 2 && label === 0; radius++) {
      for (let dy = -radius; dy <= radius && label === 0; dy++) {
        for (let dx = -radius; dx <= radius && label === 0; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) label = map.labels[ny * width + nx];
        }
      }
    }
    if (label !== 0) votes.set(label, (votes.get(label) ?? 0) + 1);
  }
  let target = 0;
  let best = 0;
  for (const [label, count] of votes) {
    if (count > best) {
      best = count;
      target = label;
    }
  }
  if (target === 0) return null;

  // Table de sommes : nombre de pixels hors du contenant dans n'importe quel rectangle, en temps constant.
  const stride = width + 1;
  const sums = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      if (map.labels[y * width + x] !== target) row++;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const outside = (x0: number, y0: number, x1: number, y1: number) =>
    x1 <= x0 || y1 <= y0 ? 0 : sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];

  /** Boîte de la page ramenée sur la grille de l'image réduite. */
  const toGrid = (box: Box): Box => ({
    x0: clamp(Math.floor((box.x0 - offset.x) / factor), 0, width),
    y0: clamp(Math.floor((box.y0 - offset.y) / factor), 0, height),
    x1: clamp(Math.ceil((box.x1 - offset.x) / factor), 0, width),
    y1: clamp(Math.ceil((box.y1 - offset.y) / factor), 0, height),
  });

  return {
    foreign(pageBlocks) {
      if (pageBlocks.length < 2) return 0;
      const blocks = pageBlocks.map(toGrid);
      const union = unionBox(blocks);
      let free = boxWidth(union) * boxHeight(union);
      let strangers = outside(union.x0, union.y0, union.x1, union.y1);
      // Dans un bloc, ce qui n'est pas du fond est du texte : on ne le compte pas.
      for (const block of blocks) {
        free -= boxWidth(block) * boxHeight(block);
        strangers -= outside(block.x0, block.y0, block.x1, block.y1);
      }
      return free > 0 ? clamp(strangers / free, 0, 1) : 0;
    },
    room(block, others, reach) {
      const seed = toGrid(block);
      const blockers = others.map(toGrid);
      const limit = Math.max(0, Math.floor(reach / factor));
      let { x0, y0, x1, y1 } = seed;
      const blocked = (bx0: number, by0: number, bx1: number, by1: number) => {
        const length = Math.max(bx1 - bx0, by1 - by0);
        if (outside(bx0, by0, bx1, by1) > Math.max(1, Math.floor(length * STRIP_TOLERANCE))) return true;
        return blockers.some((other) => bx0 < other.x1 && bx1 > other.x0 && by0 < other.y1 && by1 > other.y0);
      };
      // Chaque côté avance d'un pixel à son tour, tant que la bande gagnée est dans le contenant.
      const open = [true, true, true, true];
      while (open.some(Boolean)) {
        if (open[0] && (x0 <= 0 || seed.x0 - x0 >= limit || blocked(x0 - 1, y0, x0, y1))) open[0] = false;
        if (open[0]) x0--;
        if (open[1] && (x1 >= width || x1 - seed.x1 >= limit || blocked(x1, y0, x1 + 1, y1))) open[1] = false;
        if (open[1]) x1++;
        if (open[2] && (y0 <= 0 || seed.y0 - y0 >= limit || blocked(x0, y0 - 1, x1, y0))) open[2] = false;
        if (open[2]) y0--;
        if (open[3] && (y1 >= height || y1 - seed.y1 >= limit || blocked(x0, y1, x1, y1 + 1))) open[3] = false;
        if (open[3]) y1++;
      }
      // Le rectangle ne rend jamais moins que le bloc dont il part.
      return {
        x0: Math.min(block.x0, offset.x + x0 * factor),
        y0: Math.min(block.y0, offset.y + y0 * factor),
        x1: Math.max(block.x1, offset.x + x1 * factor),
        y1: Math.max(block.y1, offset.y + y1 * factor),
      };
    },
  };
}

/** Rétrécit une boîte de `margin` pixels de chaque côté, sans jamais passer sous `core`. */
export function insetAround(box: Box, margin: number, core: Box): Box {
  return {
    x0: Math.min(core.x0, box.x0 + margin),
    y0: Math.min(core.y0, box.y0 + margin),
    x1: Math.max(core.x1, box.x1 - margin),
    y1: Math.max(core.y1, box.y1 - margin),
  };
}
