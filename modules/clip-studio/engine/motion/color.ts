/**
 * Couleurs des pistes : lecture et mélange en OKLab.
 *
 * Un mélange en RVB passe par des teintes ternes (du rouge au vert, on
 * traverse un brun) ; OKLab suit la perception, et le milieu d'un dégradé a
 * la clarté que l'œil attend.
 */

export interface Rgba {
  /** Canaux de 0 à 255. */
  r: number;
  g: number;
  b: number;
  /** Opacité, de 0 à 1. */
  a: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Lit `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (virgules ou
 * espaces, canaux en nombres ou en pourcentages) et `transparent`. Rend
 * `null` pour le reste : l'appelant garde alors la couleur précédente.
 */
export function parseColor(input: string): Rgba | null {
  const text = input.trim().toLowerCase();
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (text.startsWith("#")) {
    const hex = text.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = [...hex].map((digit) => parseInt(digit + digit, 16));
      return { r, g, b, a: hex.length === 4 ? a / 255 : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16);
      return { r: channel(0), g: channel(2), b: channel(4), a: hex.length === 8 ? channel(6) / 255 : 1 };
    }
    return null;
  }
  const call = /^rgba?\(([^)]*)\)$/.exec(text);
  if (!call) return null;
  const parts = call[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (part: string) =>
    part.endsWith("%") ? (parseFloat(part) / 100) * 255 : parseFloat(part);
  const alpha = (part: string | undefined) =>
    part === undefined ? 1 : part.endsWith("%") ? parseFloat(part) / 100 : parseFloat(part);
  const [r, g, b] = parts.slice(0, 3).map(channel);
  const a = alpha(parts[3]);
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
}

export function formatColor({ r, g, b, a }: Rgba): string {
  const channel = (value: number) => Math.round(clamp(value, 0, 255));
  const alpha = Math.round(clamp(a, 0, 1) * 1000) / 1000;
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${alpha})`;
}

// ─── OKLab ───────────────────────────────────────────────────────

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const fromLinear = (value: number) => {
  const c = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(Math.max(0, value), 1 / 2.4) - 0.055;
  return c * 255;
};

export function rgbToOklab({ r, g, b }: Rgba): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, A, B]: [number, number, number]): Omit<Rgba, "a"> {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/**
 * Couleur à mi-chemin `t` (0 à 1, au-delà pour un dépassement) entre deux
 * couleurs, mélangée en OKLab ; l'opacité se mélange linéairement. Une
 * couleur illisible laisse l'autre s'appliquer d'un bloc.
 */
export function mixColors(from: string, to: string, t: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return t < 1 ? from : to;
  if (t <= 0) return formatColor(a);
  if (t >= 1) return formatColor(b);
  // Une couleur transparente n'a pas de teinte à elle : on prend celle de
  // l'autre, sinon un fondu depuis « transparent » passerait par le noir.
  const labA = rgbToOklab(a.a === 0 ? b : a);
  const labB = rgbToOklab(b.a === 0 ? a : b);
  const lab: [number, number, number] = [
    labA[0] + (labB[0] - labA[0]) * t,
    labA[1] + (labB[1] - labA[1]) * t,
    labA[2] + (labB[2] - labA[2]) * t,
  ];
  return formatColor({ ...oklabToRgb(lab), a: a.a + (b.a - a.a) * t });
}
