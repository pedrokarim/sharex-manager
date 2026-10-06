/**
 * Couleur de fond d'une bulle, prélevée sur les pixels de la page.
 *
 * Les fonctions reçoivent des pixels bruts (`PixelData`), pas un canevas :
 * elles tournent telles quelles sous Node.
 */

import type { Rect } from "./geometry";

export interface PixelData {
  /** Octets RVBA, ligne par ligne, comme `ImageData.data`. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type Rgb = [number, number, number];

/** Au-delà de ce nombre d'échantillons, on n'en lit qu'un sur plusieurs. */
const MAX_SAMPLES = 6000;
/** Luminance sous laquelle un pixel est du trait noir, au-dessus de laquelle il est du blanc. */
const NEAR_BLACK = 70;
const NEAR_WHITE = 185;

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianColor(samples: Rgb[]): Rgb {
  return [0, 1, 2].map((channel) => median(samples.map((sample) => sample[channel]))) as Rgb;
}

function readPixel(image: PixelData, x: number, y: number): Rgb | null {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (y * image.width + x) * 4;
  // Un pixel transparent n'a pas de couleur à donner.
  if (image.data[offset + 3] < 8) return null;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

/**
 * Écarte le trait du dessin : si la majorité des pixels est claire, les pixels
 * presque noirs (contour de bulle, lettres voisines) sont ignorés, et
 * inversement pour une bulle sombre.
 */
function dropLineArt(samples: Rgb[]): Rgb[] {
  const lights = samples.filter((sample) => luminance(sample) >= 128).length;
  const mostlyLight = lights * 2 >= samples.length;
  const kept = samples.filter((sample) => (mostlyLight ? luminance(sample) > NEAR_BLACK : luminance(sample) < NEAR_WHITE));
  return kept.length > 0 ? kept : samples;
}

/**
 * Couleur du fond autour d'une zone : médiane des pixels d'un anneau de
 * `ring` pixels posé sur le bord du rectangle englobant, côté extérieur. Si la
 * zone touche les bords de l'image, l'anneau est pris côté intérieur.
 *
 * Rend `fallback` quand aucun pixel n'est lisible.
 */
export function sampleBackgroundColor(image: PixelData, bounds: Rect, options: { ring?: number; fallback?: string } = {}): string {
  const ring = Math.max(1, Math.round(options.ring ?? 3));
  const fallback = options.fallback ?? "#ffffff";
  const left = Math.round(bounds.x);
  const top = Math.round(bounds.y);
  const right = Math.round(bounds.x + bounds.width) - 1;
  const bottom = Math.round(bounds.y + bounds.height) - 1;
  if (right < left || bottom < top) return fallback;

  const collect = (inset: (depth: number) => number): Rgb[] => {
    const positions: [number, number][] = [];
    for (let depth = 1; depth <= ring; depth++) {
      const offset = inset(depth);
      const x0 = left - offset;
      const x1 = right + offset;
      const y0 = top - offset;
      const y1 = bottom + offset;
      if (x1 < x0 || y1 < y0) break;
      for (let x = x0; x <= x1; x++) positions.push([x, y0], [x, y1]);
      for (let y = y0 + 1; y < y1; y++) positions.push([x0, y], [x1, y]);
    }
    const stride = Math.max(1, Math.ceil(positions.length / MAX_SAMPLES));
    const samples: Rgb[] = [];
    for (let index = 0; index < positions.length; index += stride) {
      const pixel = readPixel(image, positions[index][0], positions[index][1]);
      if (pixel) samples.push(pixel);
    }
    return samples;
  };

  let samples = collect((depth) => depth);
  // Zone collée aux bords de l'image : on lit juste à l'intérieur du rectangle.
  if (samples.length === 0) samples = collect((depth) => 1 - depth);
  if (samples.length === 0) return fallback;
  return rgbToHex(medianColor(dropLineArt(samples)));
}

/** Couleur sous la pipette : médiane d'un petit carré autour du point, pour lisser la trame. */
export function sampleColorAt(image: PixelData, x: number, y: number, radius = 1): string | null {
  const samples: Rgb[] = [];
  const centerX = Math.floor(x);
  const centerY = Math.floor(y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const pixel = readPixel(image, centerX + dx, centerY + dy);
      if (pixel) samples.push(pixel);
    }
  }
  return samples.length > 0 ? rgbToHex(medianColor(samples)) : null;
}
