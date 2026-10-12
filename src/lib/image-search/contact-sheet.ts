/**
 * Planche contact : jusqu'à quatre images côte à côte, numérotées de 1 à 4,
 * pour qu'un modèle qui voit (Codex) désigne la meilleure d'un seul coup
 * d'œil, sans recevoir quatre fichiers.
 *
 * Les numéros sont dessinés en segments (des rectangles), pas en texte :
 * aucune police n'est nécessaire, la planche sort pareille sur toutes les
 * machines, conteneur compris.
 */

import sharp, { type OverlayOptions } from "sharp";

export const CONTACT_SHEET = {
  /** Côté d'une case, en pixels. */
  cell: 512,
  gap: 8,
  maxImages: 4,
  background: "#141414",
} as const;

/** Segments allumés pour chaque chiffre (a en haut, puis dans le sens horaire, g au milieu). */
const DIGITS: Record<number, string> = { 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc" };

/** Pastille numérotée, en SVG : un disque clair et un chiffre à segments. */
function badge(number: number): Buffer {
  const size = 96;
  const [x, y, w, h, t] = [36, 26, 24, 44, 7];
  const half = h / 2;
  const segments: Record<string, [number, number, number, number]> = {
    a: [x, y, w, t],
    b: [x + w - t, y, t, half],
    c: [x + w - t, y + half, t, half],
    d: [x, y + h - t, w, t],
    e: [x, y + half, t, half],
    f: [x, y, t, half],
    g: [x, y + half - t / 2, w, t],
  };
  const rects = [...(DIGITS[number] ?? "")]
    .map((id) => {
      const [rx, ry, rw, rh] = segments[id];
      return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#111111"/>`;
    })
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="48" cy="48" r="40" fill="#ffd400" stroke="#111111" stroke-width="5"/>${rects}</svg>`
  );
}

/**
 * Assemble 1 à 4 images (2 colonnes au plus) et rend un PNG. Chaque image
 * garde ses proportions dans sa case, la pastille en haut à gauche porte son
 * numéro, dans l'ordre reçu.
 */
export async function buildContactSheet(images: Buffer[]): Promise<Buffer> {
  if (images.length === 0) throw new Error("Aucune image pour la planche contact.");
  const list = images.slice(0, CONTACT_SHEET.maxImages);
  const { cell, gap } = CONTACT_SHEET;
  const columns = Math.min(2, list.length);
  const rows = Math.ceil(list.length / columns);
  const width = columns * cell + (columns + 1) * gap;
  const height = rows * cell + (rows + 1) * gap;

  const layers: OverlayOptions[] = [];
  for (const [index, image] of list.entries()) {
    const left = gap + (index % columns) * (cell + gap);
    const top = gap + Math.floor(index / columns) * (cell + gap);
    const tile = await sharp(image, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: cell, height: cell, fit: "contain", background: CONTACT_SHEET.background })
      .png()
      .toBuffer();
    layers.push({ input: tile, left, top });
    layers.push({ input: badge(index + 1), left: left + 8, top: top + 8 });
  }

  return sharp({ create: { width, height, channels: 3, background: CONTACT_SHEET.background } })
    .composite(layers)
    .png()
    .toBuffer();
}
