/**
 * Conversion d'une image pour Instagram (dossier 07b, § 6) : JPEG seulement,
 * 8 Mio au plus, sRGB, largeur ramenée à 1 440 pixels, rapport largeur sur
 * hauteur de 4:5 à 1,91:1 pour une image publiée.
 *
 * L'image est toujours réencodée : l'orientation EXIF est appliquée, la
 * transparence posée sur du blanc, et les métadonnées (position GPS
 * comprise) ne partent pas chez Instagram. On ne recadre jamais en silence :
 * un rapport hors limites est refusé avec un message clair.
 */

import fs from "node:fs";
import sharp from "sharp";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MAX_WIDTH = 1440;
export const IMAGE_RATIO = { min: 0.8, max: 1.91 };
/** Écart toléré sur le rapport (1080 × 1350 doit passer pour 4:5), le même que la file. */
const RATIO_TOLERANCE = 0.005;
const QUALITIES = [90, 82, 74, 66, 58, 50];

export interface JpegResult {
  width: number;
  height: number;
  bytes: number;
}

const ratioLabel = (ratio: number) => ratio.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/**
 * Écrit dans `output` un JPEG accepté par Instagram. `checkRatio` : refuse un
 * rapport hors de 4:5 à 1,91:1 (image publiée ; une couverture de Reel est
 * recadrée par Instagram et n'est pas vérifiée).
 */
export async function toInstagramJpeg(input: string, output: string, options: { checkRatio: boolean }): Promise<JpegResult> {
  const meta = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error("Image illisible : dimensions inconnues.");
  // Orientation EXIF 5 à 8 : l'image affichée est tournée d'un quart de tour.
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  const ratio = width / height;
  if (options.checkRatio && (ratio < IMAGE_RATIO.min * (1 - RATIO_TOLERANCE) || ratio > IMAGE_RATIO.max * (1 + RATIO_TOLERANCE))) {
    throw new Error(`L’image est en ${width} × ${height} (rapport ${ratioLabel(ratio)}) : Instagram n’accepte que de 4:5 à 1,91:1.`);
  }
  for (const quality of QUALITIES) {
    const info = await sharp(input, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .jpeg({ quality, mozjpeg: true })
      .toFile(output);
    if (info.size <= IMAGE_MAX_BYTES) return { width: info.width, height: info.height, bytes: info.size };
  }
  fs.rmSync(output, { force: true });
  throw new Error("L’image reste au-dessus de 8 Mio même en JPEG compressé : réduisez-la avant de la publier.");
}
