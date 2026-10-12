/**
 * Téléchargement contrôlé d'une image trouvée (Openverse, ou adresse rendue
 * par une recherche web).
 *
 * L'adresse n'est jamais suivie par le navigateur : c'est le serveur qui la
 * télécharge, par `fetchRemoteImage` (HTTP(S) seulement, aucune adresse
 * interne, redirections revérifiées, 20 Mo). Ce qui revient est ensuite lu
 * par sharp, qui juge sur le contenu et non sur ce que le site annonce :
 * PNG, JPEG, WebP ou GIF fixe, jamais de SVG, assez grand pour un clip et de
 * taille bornée. L'image est enfin réencodée : métadonnées retirées (EXIF,
 * position GPS), orientation appliquée, et rien d'autre que des pixels dans
 * le fichier gardé.
 */

import sharp, { type Metadata } from "sharp";
import { fetchRemoteImage, type RemoteImage } from "@/lib/remote-image";

export const DOWNLOAD_LIMITS = {
  /** Petit côté minimal par défaut, en pixels. */
  minShortSide: 640,
  /** Pixels décodés au plus : une image démesurée épuiserait la mémoire. */
  maxPixels: 50_000_000,
  /** Grand côté de l'image gardée : un clip ne dépasse pas 1920 pixels. */
  maxLongSide: 2560,
} as const;

export type DownloadedFormat = "png" | "jpeg" | "webp";

export interface DownloadedImage {
  buffer: Buffer;
  format: DownloadedFormat;
  /** Extension du fichier à écrire, sans point. */
  extension: "png" | "jpg" | "webp";
  mimeType: string;
  width: number;
  height: number;
}

export interface DownloadOptions {
  minShortSide?: number;
  maxPixels?: number;
  /** Téléchargement, remplaçable par les tests. */
  fetchImage?: (url: string) => Promise<RemoteImage>;
}

const ACCEPTED = new Set(["png", "jpeg", "webp", "gif"]);

/**
 * Contrôle et réencode une image déjà en mémoire. Lève une erreur en
 * français, montrable telle quelle, si elle ne convient pas.
 */
export async function checkImage(input: Buffer, options: Omit<DownloadOptions, "fetchImage"> = {}): Promise<DownloadedImage> {
  const minShortSide = options.minShortSide ?? DOWNLOAD_LIMITS.minShortSide;
  const maxPixels = options.maxPixels ?? DOWNLOAD_LIMITS.maxPixels;

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: maxPixels, animated: true }).metadata();
  } catch {
    throw new Error("Ce fichier n'est pas une image lisible.");
  }
  const format = String(metadata.format ?? "");
  if (format === "svg") throw new Error("Les images SVG ne sont pas acceptées.");
  if (!ACCEPTED.has(format)) throw new Error("Type d'image refusé (PNG, JPEG, WebP ou GIF fixe seulement).");
  if ((metadata.pages ?? 1) > 1) throw new Error("Les images animées ne sont pas acceptées.");

  // Hauteur d'une page : pour une image fixe, c'est la hauteur de l'image.
  const rawWidth = metadata.width ?? 0;
  const rawHeight = metadata.pageHeight ?? metadata.height ?? 0;
  if (!rawWidth || !rawHeight) throw new Error("Dimensions de l'image illisibles.");
  if (rawWidth * rawHeight > maxPixels) throw new Error("Image trop grande.");
  if (Math.min(rawWidth, rawHeight) < minShortSide) {
    throw new Error(`Image trop petite (${rawWidth} × ${rawHeight}, ${minShortSide} px au moins sur le petit côté).`);
  }

  // Le JPEG reste un JPEG, le reste devient PNG ou WebP sans perte de transparence.
  const output: DownloadedFormat = format === "jpeg" ? "jpeg" : format === "webp" ? "webp" : "png";
  const pipeline = sharp(input, { limitInputPixels: maxPixels })
    .rotate()
    .resize({ width: DOWNLOAD_LIMITS.maxLongSide, height: DOWNLOAD_LIMITS.maxLongSide, fit: "inside", withoutEnlargement: true });
  const encoded =
    output === "jpeg"
      ? pipeline.jpeg({ quality: 90, mozjpeg: true })
      : output === "webp"
        ? pipeline.webp({ quality: 90 })
        : pipeline.png({ compressionLevel: 8 });
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    format: output,
    extension: output === "jpeg" ? "jpg" : output,
    mimeType: `image/${output}`,
    width: info.width,
    height: info.height,
  };
}

/** Télécharge puis contrôle une image distante. */
export async function downloadImage(url: string, options: DownloadOptions = {}): Promise<DownloadedImage> {
  const remote = await (options.fetchImage ?? fetchRemoteImage)(url);
  return checkImage(Buffer.from(remote.b64, "base64"), options);
}
