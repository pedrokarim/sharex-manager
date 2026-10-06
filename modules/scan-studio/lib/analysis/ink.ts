/**
 * Repérage du lettrage par ses pixels : les lettres sont de petites taches
 * d'encre isolées sur un fond uni (le blanc d'une bulle, le noir d'un
 * cartouche).
 *
 * C'est la méthode géométrique dont parle le § 3 du dossier : elle trouve les
 * bulles nettes et rate le texte posé sur le dessin. Elle ne lit rien : elle
 * dit seulement où regarder, et c'est le moteur de lecture qui confirme.
 *
 * Fonctions pures sur des tableaux de pixels : ni DOM, ni moteur.
 */

import type { PixelData } from "../mask-color";
import type { Box } from "./words";

/** Image en niveaux de gris, un octet par pixel. */
export interface Bitmap {
  data: Uint8Array;
  width: number;
  height: number;
}

/** `dark` : encre sombre sur fond clair ; `light` : encre claire sur fond sombre. */
export type Polarity = "dark" | "light";

export interface GlyphLimits {
  /** Plus grande dimension minimale d'une lettre, en pixels de l'image. */
  minSize: number;
  maxWidth: number;
  maxHeight: number;
}

export interface InkBoxes {
  /** Taches de la taille d'une lettre. */
  glyphs: InkBox[];
  /** Taches plus petites : points, virgules, apostrophes, mais aussi grains de trame. */
  marks: InkBox[];
}

/** Tache d'encre, avec la plage de fond qui l'entoure quand le fond a été découpé. */
export interface InkBox extends Box {
  /** Numéro de la plage de fond, dans le `BackgroundMap` donné à `findGlyphs`. */
  container?: number;
  /** Pixel de fond posé juste au-dessus de la tache : un point sûr de cette plage. */
  anchor?: { x: number; y: number };
}

/**
 * Fond d'une image découpé en plages d'un seul tenant : l'intérieur d'une
 * bulle ou d'un cartouche en est une, fermée par son contour.
 */
export interface BackgroundMap {
  width: number;
  height: number;
  /** Numéro de plage de chaque pixel, à partir de 1 ; 0 pour l'encre. */
  labels: Int32Array;
  /** Surface de chaque plage, en pixels ; l'indice 0 ne sert pas. */
  areas: number[];
  /** Boîte de chaque plage. */
  boxes: Box[];
}

/** Écart de luminance exigé entre le fond et le cœur d'une lettre. */
const MIN_CONTRAST = 70;
/** Part minimale de sa boîte qu'une lettre remplit : en dessous, c'est un trait. */
const MIN_FILL = 0.08;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Niveaux de gris d'une image RVBA, réduite d'un facteur entier par moyenne.
 * Un pixel transparent compte comme du blanc.
 */
export function toBitmap(pixels: PixelData, factor = 1): Bitmap {
  const step = Math.max(1, Math.round(factor));
  const width = Math.max(1, Math.floor(pixels.width / step));
  const height = Math.max(1, Math.floor(pixels.height / step));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let total = 0;
      let count = 0;
      for (let dy = 0; dy < step; dy++) {
        const row = (y * step + dy) * pixels.width;
        for (let dx = 0; dx < step; dx++) {
          const offset = (row + x * step + dx) * 4;
          if (offset + 3 >= pixels.data.length) continue;
          const alpha = pixels.data[offset + 3] / 255;
          const value = 0.2126 * pixels.data[offset] + 0.7152 * pixels.data[offset + 1] + 0.0722 * pixels.data[offset + 2];
          total += value * alpha + 255 * (1 - alpha);
          count++;
        }
      }
      data[y * width + x] = count > 0 ? Math.round(total / count) : 255;
    }
  }
  return { data, width, height };
}

/**
 * Seuils de fond de l'image : au-dessus du premier un pixel est du papier,
 * au-dessous du second du noir plein. Ils suivent la page : un scan jauni a un
 * blanc plus sombre qu'une page numérique.
 */
export function backgroundThresholds(bitmap: Bitmap): { light: number; dark: number } {
  const histogram = new Uint32Array(256);
  const stride = Math.max(1, Math.floor(bitmap.data.length / 200_000));
  let samples = 0;
  for (let index = 0; index < bitmap.data.length; index += stride) {
    histogram[bitmap.data[index]]++;
    samples++;
  }
  const percentile = (share: number) => {
    let seen = 0;
    for (let value = 0; value < 256; value++) {
      seen += histogram[value];
      if (seen >= samples * share) return value;
    }
    return 255;
  };
  return { light: clamp(percentile(0.9) - 40, 140, 200), dark: clamp(percentile(0.1) + 40, 40, 90) };
}

/**
 * Taches d'encre de la taille d'une lettre. Une tache est un ensemble de
 * pixels voisins qui ne sont pas du fond ; on garde celles qui ont la taille
 * d'une lettre, assez de contraste, et qui ne touchent pas le bord de l'image.
 * Tout le reste (cases, contours de bulles, dessin, hachures reliées au cadre)
 * forme des taches bien plus grandes, écartées d'office. Les taches trop
 * petites pour une lettre sont rendues à part : ce sont peut-être des points.
 */
export function findGlyphs(bitmap: Bitmap, polarity: Polarity, threshold: number, limits: GlyphLimits, background?: BackgroundMap): InkBoxes {
  const { data, width, height } = bitmap;
  const isInk = polarity === "dark" ? (value: number) => value < threshold : (value: number) => value > threshold;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const glyphs: InkBox[] = [];
  const marks: InkBox[] = [];

  for (let start = 0; start < data.length; start++) {
    if (visited[start] || !isInk(data[start])) continue;
    let size = 0;
    stack[size++] = start;
    visited[start] = 1;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let area = 0;
    let extreme = data[start];
    while (size > 0) {
      const index = stack[--size];
      const x = index % width;
      const y = (index - x) / width;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const value = data[index];
      if (polarity === "dark" ? value < extreme : value > extreme) extreme = value;
      // Huit voisins : une lettre fine reste d'un seul tenant.
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || (dx === 0 && dy === 0)) continue;
          const next = ny * width + nx;
          if (visited[next] || !isInk(data[next])) continue;
          visited[next] = 1;
          stack[size++] = next;
        }
      }
    }
    const boxWidth = x1 - x0 + 1;
    const boxHeight = y1 - y0 + 1;
    if (x0 === 0 || y0 === 0 || x1 === width - 1 || y1 === height - 1) continue;
    if (boxWidth > limits.maxWidth || boxHeight > limits.maxHeight) continue;
    if (area / (boxWidth * boxHeight) < MIN_FILL) continue;
    const contrast = polarity === "dark" ? threshold - extreme : extreme - threshold;
    if (contrast < MIN_CONTRAST) continue;
    const box: InkBox = { x0, y0, x1: x1 + 1, y1: y1 + 1 };
    // Le pixel posé au-dessus du premier pixel de la tache est du fond, et de la plage qui l'entoure.
    if (background) {
      box.container = background.labels[start - width];
      box.anchor = { x: start % width, y: y0 - 1 };
    }
    if (Math.max(boxWidth, boxHeight) >= limits.minSize) glyphs.push(box);
    else if (Math.max(boxWidth, boxHeight) >= 2) marks.push(box);
  }
  return { glyphs: dropContainers(glyphs), marks };
}

/** Écarte les taches qui en entourent d'autres : une petite bulle n'est pas une lettre. */
function dropContainers<T extends Box>(glyphs: T[]): T[] {
  return glyphs.filter((glyph) => {
    let inside = 0;
    for (const other of glyphs) {
      if (other === glyph) continue;
      const cx = (other.x0 + other.x1) / 2;
      const cy = (other.y0 + other.y1) / 2;
      if (cx > glyph.x0 && cx < glyph.x1 && cy > glyph.y0 && cy < glyph.y1 && ++inside >= 3) return false;
    }
    return true;
  });
}

/**
 * Inclinaison d'une ligne de lettres, en degrés (positive quand la ligne
 * descend vers la droite) : pente de la droite qui passe au mieux par le
 * centre des lettres. Rend 0 sous quatre lettres : trop peu pour en juger.
 */
export function estimateAngle(glyphs: Box[]): number {
  if (glyphs.length < 4) return 0;
  let sumX = 0;
  let sumY = 0;
  for (const glyph of glyphs) {
    sumX += (glyph.x0 + glyph.x1) / 2;
    sumY += (glyph.y0 + glyph.y1) / 2;
  }
  const meanX = sumX / glyphs.length;
  const meanY = sumY / glyphs.length;
  let covariance = 0;
  let variance = 0;
  for (const glyph of glyphs) {
    const dx = (glyph.x0 + glyph.x1) / 2 - meanX;
    covariance += dx * ((glyph.y0 + glyph.y1) / 2 - meanY);
    variance += dx * dx;
  }
  return variance > 0 ? (Math.atan2(covariance, variance) * 180) / Math.PI : 0;
}

/**
 * Découpe le fond en plages d'un seul tenant. Le fond est le contraire de
 * l'encre de `findGlyphs`, au même seuil ; deux pixels de fond ne se touchent
 * que par un côté, jamais par un coin : un trait d'un pixel suffit donc à
 * séparer deux cartouches accolés, et chaque tache d'encre est entourée d'une
 * seule plage.
 */
export function labelBackground(bitmap: Bitmap, polarity: Polarity, threshold: number): BackgroundMap {
  const { data, width, height } = bitmap;
  const isInk = polarity === "dark" ? (value: number) => value < threshold : (value: number) => value > threshold;
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const areas: number[] = [0];
  const boxes: Box[] = [{ x0: 0, y0: 0, x1: 0, y1: 0 }];

  for (let start = 0; start < data.length; start++) {
    if (labels[start] !== 0 || isInk(data[start])) continue;
    const label = areas.length;
    let size = 0;
    stack[size++] = start;
    labels[start] = label;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let area = 0;
    while (size > 0) {
      const index = stack[--size];
      const x = index % width;
      const y = (index - x) / width;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      // Quatre voisins seulement : le fond ne passe pas par les coins.
      if (x > 0 && labels[index - 1] === 0 && !isInk(data[index - 1])) {
        labels[index - 1] = label;
        stack[size++] = index - 1;
      }
      if (x < width - 1 && labels[index + 1] === 0 && !isInk(data[index + 1])) {
        labels[index + 1] = label;
        stack[size++] = index + 1;
      }
      if (y > 0 && labels[index - width] === 0 && !isInk(data[index - width])) {
        labels[index - width] = label;
        stack[size++] = index - width;
      }
      if (y < height - 1 && labels[index + width] === 0 && !isInk(data[index + width])) {
        labels[index + width] = label;
        stack[size++] = index + width;
      }
    }
    areas.push(area);
    boxes.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
  }
  return { width, height, labels, areas, boxes };
}
