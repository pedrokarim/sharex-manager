/**
 * Lecture des images avec sharp : dimensions réelles, type réel, vignettes.
 *
 * L'extension d'un fichier ne prouve rien. Avant de devenir une page, une
 * image est ouverte : ce qui n'en est pas une, ou qui est trop grand pour
 * être travaillé dans un navigateur, est refusé.
 */

import fs from "fs";
import sharp, { type Metadata } from "sharp";
import type { AssetExtension } from "../store";

/** Au-delà, un canevas de navigateur ne suit plus. */
export const MAX_SIDE = 20_000;
export const MAX_PIXELS = 150_000_000;

const THUMB_WIDTH = 480;
/** Une bande de webtoon donnerait une vignette interminable : on n'en garde que le haut. */
const THUMB_MAX_HEIGHT = 1440;

const EXTENSIONS: Record<string, AssetExtension> = { png: "png", jpeg: "jpg", webp: "webp", gif: "gif" };

/**
 * sharp reçoit le contenu du fichier, pas son chemin : ouvert par son chemin, un
 * fichier peut rester tenu par la bibliothèque, et sous Windows il ne s'efface
 * plus. Les fichiers sont bornés par l'envoi (40 Mo) et lus un par un.
 */
const readImage = (file: string) => fs.promises.readFile(file);

export interface ImageInfo {
  /** Dimensions telles qu'un navigateur les affiche, orientation EXIF appliquée. */
  width: number;
  height: number;
  extension: AssetExtension;
}

/** Ouvre une image et rend ses dimensions. `label` nomme le fichier dans les messages d'erreur. */
export async function probeImage(file: string, label: string): Promise<ImageInfo> {
  let metadata: Metadata;
  try {
    metadata = await sharp(await readImage(file), { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new Error(`« ${label} » n'est pas une image lisible.`);
  }

  const extension = EXTENSIONS[metadata.format ?? ""];
  if (!extension || !metadata.width || !metadata.height) {
    throw new Error(`« ${label} » n'est pas une image acceptée (PNG, JPEG, WebP ou GIF).`);
  }

  // Orientations 5 à 8 : l'image est stockée couchée, le navigateur la redresse.
  const turned = (metadata.orientation ?? 1) >= 5;
  const width = turned ? metadata.height : metadata.width;
  const height = turned ? metadata.width : metadata.height;

  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new Error(
      `« ${label} » est trop grande (${width} × ${height} px) : ${MAX_SIDE} px de côté et ${MAX_PIXELS / 1_000_000} mégapixels au plus.`
    );
  }
  return { width, height, extension };
}

/** Écrit la vignette WebP d'une image, par fichier temporaire puis renommage. */
export async function writeThumbnail(source: string, target: string, info: ImageInfo): Promise<void> {
  const width = Math.min(THUMB_WIDTH, info.width);
  const height = Math.max(1, Math.min(Math.round((width * info.height) / info.width), THUMB_MAX_HEIGHT));
  const buffer = await sharp(await readImage(source), { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width, height, fit: "cover", position: "top" })
    .webp({ quality: 76 })
    .toBuffer();

  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, buffer);
  fs.renameSync(temporary, target);
}
