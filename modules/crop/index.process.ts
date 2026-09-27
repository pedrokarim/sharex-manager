import { ModuleHooks } from "@/types/modules";
import sharp, { type Sharp } from "sharp";

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * « % » : relatif à l'image (ce qu'envoie l'interface, qui affiche une
   * version réduite de l'image) ; « px » : pixels de l'image d'origine.
   */
  unit: "%" | "px";
}

export interface CropOptions {
  crop?: CropArea;
  circularCrop?: boolean;
  quality?: number;
}

async function encode(pipeline: Sharp, format: string | undefined, quality: number, needsAlpha: boolean): Promise<Buffer> {
  // Un masque circulaire a besoin de transparence : le JPEG n'en a pas.
  if (needsAlpha && (format === "jpeg" || format === "jpg" || !format)) return pipeline.png().toBuffer();
  switch (format) {
    case "png":
      return pipeline.png().toBuffer();
    case "webp":
      return pipeline.webp({ quality }).toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
    case "avif":
      return pipeline.avif({ quality }).toBuffer();
    case "tiff":
      return pipeline.tiff({ quality }).toBuffer();
    default:
      return pipeline.jpeg({ quality }).toBuffer();
  }
}

/** Zone demandée, convertie en pixels de l'image et bornée à celle-ci. */
export function toPixelArea(crop: CropArea, width: number, height: number) {
  const scaleX = crop.unit === "%" ? width / 100 : 1;
  const scaleY = crop.unit === "%" ? height / 100 : 1;
  const left = Math.max(0, Math.round(Number(crop.x) * scaleX));
  const top = Math.max(0, Math.round(Number(crop.y) * scaleY));
  const areaWidth = Math.min(Math.round(Number(crop.width) * scaleX), width - left);
  const areaHeight = Math.min(Math.round(Number(crop.height) * scaleY), height - top);
  if (!Number.isFinite(areaWidth + areaHeight) || areaWidth < 1 || areaHeight < 1) {
    throw new Error("La zone de recadrage est vide ou hors de l'image.");
  }
  return { left, top, width: areaWidth, height: areaHeight };
}

/**
 * Recadre l'image. Une erreur remonte au lieu de rendre l'original, sans quoi
 * l'application annonçait un recadrage qui n'avait pas eu lieu.
 */
export async function cropImage(imageBuffer: Buffer, options?: CropOptions): Promise<Buffer> {
  if (!options?.crop) throw new Error("Sélectionnez la zone à garder.");
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Dimensions de l'image illisibles.");

  const area = toPixelArea(options.crop, metadata.width, metadata.height);
  if (area.width === metadata.width && area.height === metadata.height && !options.circularCrop) {
    throw new Error("La zone choisie couvre toute l'image : rien à recadrer.");
  }

  let pipeline = sharp(imageBuffer).extract(area);
  if (options.circularCrop) {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${area.width}" height="${area.height}"><ellipse cx="${area.width / 2}" cy="${area.height / 2}" rx="${area.width / 2}" ry="${area.height / 2}" fill="#fff"/></svg>`
    );
    // L'extraction doit être rendue avant d'appliquer le masque à sa taille.
    pipeline = sharp(await pipeline.png().toBuffer()).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]);
  }
  const quality = Math.min(100, Math.max(1, Math.round(Number(options.quality) || 90)));
  return encode(pipeline, metadata.format, quality, Boolean(options.circularCrop));
}

/** Point d'entrée du gestionnaire de modules. */
export async function processImage(imageBuffer: Buffer, data?: CropOptions): Promise<Buffer> {
  return cropImage(imageBuffer, data);
}

export const moduleHooks: ModuleHooks = {
  processImage,
};

export function initModule() {
  return moduleHooks;
}

export default moduleHooks;
