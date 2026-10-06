/**
 * Des groupes de texte aux zones de l'atelier : contour, type deviné, masque.
 *
 * Les zones sont construites par `createRegion`, comme celles tracées à la
 * main : elles ont exactement la même forme. Fonctions pures, sans DOM.
 */

import { createRegion } from "../region-edit";
import { DEFAULT_MASK, type Point, type RegionKind, type ScanRegion } from "../types";
import { cleanReading, type CleanOptions } from "./clean-text";
import { insetAround } from "./containers";
import type { TextGroup } from "./grouping";
import type { WritingDirection } from "./languages";
import type { Box, PageSize } from "./words";

/** Identifiant du moteur de lecture, porté par chaque zone qu'il a lue. */
export const READING_ENGINE = "tesseract";

/** Inclinaison à partir de laquelle un texte est tenu pour une onomatopée, en degrés. */
const SFX_ANGLE = 6;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Luminance d'une couleur `#rrggbb`, de 0 à 255. */
export function luminanceOf(color: string): number {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? parseInt(color.slice(1), 16) : 0xffffff;
  return 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
}

/** Le fond est-il sombre, donc le texte clair ? */
export function isDarkBackground(color: string): boolean {
  return luminanceOf(color) < 100;
}

/** Marge laissée autour du texte, selon la taille du lettrage. */
export function outlinePadding(lineHeight: number): number {
  return Math.round(clamp(lineHeight * 0.3, 4, 20));
}

/** Rectangle englobant du texte, élargi d'une marge et ramené dans la page. */
export function paddedOutline(box: Box, padding: number, page: PageSize): Point[] {
  const x0 = clamp(Math.floor(box.x0 - padding), 0, page.width);
  const y0 = clamp(Math.floor(box.y0 - padding), 0, page.height);
  const x1 = clamp(Math.ceil(box.x1 + padding), 0, page.width);
  const y1 = clamp(Math.ceil(box.y1 + padding), 0, page.height);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export interface KindHints {
  page: PageSize;
  /** Taille médiane du lettrage sur la page : ce qui la dépasse de loin est une onomatopée. */
  medianLineHeight: number;
  /** Couleur du fond autour du texte. */
  background: string;
}

/**
 * Type d'une zone, deviné simplement : un texte clair sur un cartouche sombre
 * est un récitatif, un texte très grand ou penché une onomatopée, le reste un
 * dialogue.
 */
export function guessKind(group: Pick<TextGroup, "lineHeight" | "angle">, hints: KindHints): RegionKind {
  const width = Math.min(hints.page.width, hints.page.height);
  const huge = group.lineHeight >= width * 0.06;
  const oversized = group.lineHeight >= width * 0.035 && hints.medianLineHeight > 0 && group.lineHeight >= hints.medianLineHeight * 2.5;
  if (huge || oversized || Math.abs(group.angle) >= SFX_ANGLE) return "sfx";
  if (isDarkBackground(hints.background)) return "narration";
  return "dialogue";
}

export interface BuildOptions extends CleanOptions {
  page: PageSize;
  medianLineHeight: number;
  background: string;
  /**
   * Place dont le texte dispose dans sa bulle ou son cartouche, relevée sur
   * les pixels. Absente : le texte est posé sur le dessin, ou la zone vient
   * d'ailleurs que du repérage.
   */
  room?: Box;
}

/** Marge gardée entre le texte traduit et le contour de sa bulle. */
export function roomMargin(lineHeight: number): number {
  return Math.round(clamp(lineHeight * 0.25, 2, 10));
}

const toPoints = (box: Box): Point[] => [
  { x: box.x0, y: box.y0 },
  { x: box.x1, y: box.y0 },
  { x: box.x1, y: box.y1 },
  { x: box.x0, y: box.y1 },
];

/**
 * Zone prête pour l'atelier. Les onomatopées et le texte du décor ne sont pas
 * masqués par défaut (§ 6.1) : les effacer abîme le dessin.
 *
 * Quand la bulle du texte est connue (`room`), la zone en garde la forme :
 *  - le contour reste celui du texte d'origine, sa marge s'arrêtant au bord
 *    de la bulle ;
 *  - le masque couvre ce contour sans jamais mordre sur le trait de la bulle ;
 *  - la boîte du texte traduit prend la place libre de la bulle, moins une
 *    marge : elle est plus grande que le texte d'origine.
 */
export function buildRegion(id: string, group: TextGroup & { direction?: WritingDirection }, options: BuildOptions): ScanRegion {
  const kind = guessKind(group, options);
  const padding = outlinePadding(group.lineHeight);
  const room = options.room;
  let outline = paddedOutline(group, padding, options.page);
  let grow: number | null = null;
  let box: Box | null = null;
  if (room) {
    // La marge du contour ne dépasse pas la bulle, et le contour ne passe jamais sous le texte.
    const fitted: Box = {
      x0: Math.min(group.x0, Math.max(outline[0].x, Math.ceil(room.x0))),
      y0: Math.min(group.y0, Math.max(outline[0].y, Math.ceil(room.y0))),
      x1: Math.max(group.x1, Math.min(outline[2].x, Math.floor(room.x1))),
      y1: Math.max(group.y1, Math.min(outline[2].y, Math.floor(room.y1))),
    };
    outline = toPoints(fitted);
    const slack = Math.min(fitted.x0 - room.x0, fitted.y0 - room.y0, room.x1 - fitted.x1, room.y1 - fitted.y1);
    grow = clamp(Math.floor(slack), 0, DEFAULT_MASK.grow);
    box = insetAround(room, roomMargin(group.lineHeight), fitted);
  }
  const region = createRegion(id, outline, options.background, kind);
  const maxSize = referenceTextSize(group.lineHeight, options.medianLineHeight);
  return {
    ...region,
    // Sens d'écriture du texte d'origine : en colonnes pour un texte lu de haut en bas.
    direction: group.direction ?? region.direction,
    reading: {
      raw: group.raw,
      clean: cleanReading(group.raw, options),
      confidence: Math.round(clamp(group.confidence, 0, 1) * 100) / 100,
      engine: READING_ENGINE,
      edited: false,
    },
    translation: { text: "", status: "todo", history: [] },
    mask: {
      ...region.mask,
      kind: kind === "sfx" || kind === "background" ? "none" : "fill",
      ...(grow === null ? {} : { grow }),
    },
    text: {
      ...(box ? { ...region.text, box: { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0, rotation: 0 } } : region.text),
      ...(maxSize ? { maxSize } : {}),
    },
  };
}

/** Part de la taille d'une police que prend la hauteur d'une ligne de capitales, à peu près. */
const CAPITALS_SHARE = 0.72;

/**
 * Taille que le texte traduit ne dépassera pas : celle du lettrage d'origine.
 * La hauteur des lignes d'une zone est ramenée près de celle de la page (un cri
 * reste plus gros, une note plus petite, mais sans écart démesuré), puis
 * convertie en taille de police. `undefined` quand rien n'a été mesuré.
 */
export function referenceTextSize(lineHeight: number, medianLineHeight: number): number | undefined {
  const median = medianLineHeight > 0 ? medianLineHeight : lineHeight;
  if (!(median > 0)) return undefined;
  const own = lineHeight > 0 ? lineHeight : median;
  return Math.round((clamp(own, median * 0.8, median * 1.5) / CAPITALS_SHARE) * 10) / 10;
}
