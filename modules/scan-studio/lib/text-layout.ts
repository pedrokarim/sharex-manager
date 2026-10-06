/**
 * Mise en lignes du texte traduit dans sa boîte.
 *
 * La mesure des glyphes est injectée (`Measure`) : dans le navigateur c'est un
 * canevas, dans les tests une simple règle. Ce fichier ne dépend donc ni du
 * DOM ni de React.
 */

import type { TextStyle } from "./types";

/** Largeur, en pixels, d'un texte d'une seule ligne dans un style et une taille donnés. */
export type Measure = (text: string, style: TextStyle, size: number) => number;

/** Taille sous laquelle un lettrage n'est plus lisible, quelle que soit la page. */
export const MIN_READABLE_SIZE = 10;

/** Taille minimale lisible pour une page de cette largeur : environ 1 % de la largeur. */
export function minReadableSize(pageWidth: number): number {
  return Math.max(MIN_READABLE_SIZE, Math.round(pageWidth * 0.01));
}

/** Tolérance sur les comparaisons de largeur : les mesures sont des flottants. */
const EPSILON = 0.01;

/**
 * Texte tel qu'il sera dessiné : fins de ligne unifiées, lignes vides de tête
 * et de queue retirées, capitales appliquées. Les espaces insécables sont
 * conservées : elles font partie de la typographie.
 */
export function prepareText(text: string, uppercase: boolean): string {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
  return uppercase ? normalized.toUpperCase() : normalized;
}

export interface WrapResult {
  lines: string[];
  /** Largeur de la ligne la plus longue. */
  width: number;
  /** Un mot trop long a dû être coupé au milieu. */
  brokenWord: boolean;
}

/**
 * Coupe un mot plus large que la ligne : d'abord après ses traits d'union,
 * puis, s'il le faut, caractère par caractère.
 */
function splitLongWord(word: string, fits: (text: string) => boolean): { pieces: string[]; broken: boolean } {
  const pieces: string[] = [];
  let broken = false;
  let current = "";
  for (const segment of word.split(/(?<=-)/)) {
    if (fits(current + segment)) {
      current += segment;
      continue;
    }
    if (current) pieces.push(current);
    current = "";
    if (fits(segment)) {
      current = segment;
      continue;
    }
    broken = true;
    for (const character of Array.from(segment)) {
      // Une ligne porte toujours au moins un caractère, même trop large.
      if (current && !fits(current + character)) {
        pieces.push(current);
        current = character;
      } else {
        current += character;
      }
    }
  }
  if (current) pieces.push(current);
  return { pieces, broken };
}

/**
 * Met un texte en lignes de `maxWidth` pixels au plus. Les retours à la ligne
 * saisis sont respectés ; la coupure se fait aux espaces ordinaires, jamais
 * aux espaces insécables.
 */
export function wrapText(text: string, style: TextStyle, size: number, maxWidth: number, measure: Measure): WrapResult {
  const prepared = prepareText(text, style.uppercase);
  if (!prepared) return { lines: [], width: 0, brokenWord: false };

  const widthOf = (value: string) => measure(value, style, size);
  const fits = (value: string) => widthOf(value) <= maxWidth + EPSILON;
  const lines: string[] = [];
  let brokenWord = false;

  for (const paragraph of prepared.split("\n")) {
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (line && fits(`${line} ${word}`)) {
        line = `${line} ${word}`;
        continue;
      }
      if (line) lines.push(line);
      if (fits(word)) {
        line = word;
        continue;
      }
      const { pieces, broken } = splitLongWord(word, fits);
      brokenWord = brokenWord || broken;
      lines.push(...pieces.slice(0, -1));
      line = pieces[pieces.length - 1] ?? "";
    }
    if (line) lines.push(line);
  }

  return { lines, width: lines.reduce((widest, line) => Math.max(widest, widthOf(line)), 0), brokenWord };
}

export interface TextLayout {
  /** Taille retenue, en pixels de la page. */
  size: number;
  lines: string[];
  /** Hauteur d'une ligne, en pixels. */
  lineHeight: number;
  /** Largeur et hauteur du bloc de lignes. */
  width: number;
  height: number;
  /** `false` : le texte déborde de sa boîte à la taille retenue. */
  fits: boolean;
}

export interface LayoutOptions {
  /** Cherche la plus grande taille qui tient, au lieu d'utiliser celle du style. */
  autoFit: boolean;
  /** Sous cette taille on renonce : le texte est signalé plutôt que rétréci. */
  minSize?: number;
  /** Plafond de la recherche ; par défaut la hauteur de la boîte. */
  maxSize?: number;
  /** Marge gardée libre de chaque côté de la boîte. */
  padding?: number;
  /** Pas de la recherche, en pixels. */
  step?: number;
}

interface Box {
  width: number;
  height: number;
}

function layoutAt(text: string, style: TextStyle, size: number, inner: Box, measure: Measure): TextLayout {
  const wrapped = wrapText(text, style, size, inner.width, measure);
  const lineHeight = size * style.lineHeight;
  const height = wrapped.lines.length * lineHeight;
  return {
    size,
    lines: wrapped.lines,
    lineHeight,
    width: wrapped.width,
    height,
    fits: !wrapped.brokenWord && wrapped.width <= inner.width + EPSILON && height <= inner.height + EPSILON,
  };
}

/**
 * Plus grande taille à laquelle le texte tient dans la boîte sans couper de
 * mot. Si même la taille minimale déborde, le résultat est rendu à cette
 * taille avec `fits: false` : à l'appelant de le signaler.
 */
export function autoFit(text: string, style: TextStyle, box: Box, measure: Measure, options: Omit<LayoutOptions, "autoFit"> = {}): TextLayout {
  return layoutText(text, style, box, measure, { ...options, autoFit: true });
}

/** Met le texte en lignes dans la boîte, à la taille du style ou à la taille ajustée. */
export function layoutText(text: string, style: TextStyle, box: Box, measure: Measure, options: LayoutOptions): TextLayout {
  const padding = Math.max(0, options.padding ?? 0);
  const inner = { width: Math.max(1, box.width - 2 * padding), height: Math.max(1, box.height - 2 * padding) };
  if (!options.autoFit) return layoutAt(text, style, style.size, inner, measure);

  const minSize = options.minSize ?? MIN_READABLE_SIZE;
  const step = options.step ?? 0.5;
  const maxSize = Math.max(minSize, options.maxSize ?? inner.height);

  const smallest = layoutAt(text, style, minSize, inner, measure);
  if (!smallest.fits || smallest.lines.length === 0) return smallest;

  // Recherche par dichotomie sur les pas : `low` tient toujours, `high` jamais.
  let low = 0;
  let high = Math.floor((maxSize - minSize) / step) + 1;
  let best = smallest;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const candidate = layoutAt(text, style, minSize + middle * step, inner, measure);
    if (candidate.fits) {
      low = middle;
      best = candidate;
    } else {
      high = middle;
    }
  }
  return best;
}
