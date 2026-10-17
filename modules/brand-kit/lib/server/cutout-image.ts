/**
 * Détourage d'une image de pose sur le disque : décodage et réencodage par
 * sharp autour du calcul pur de `../cutout.ts`. Le réencodage en PNG ne
 * garde que les pixels : métadonnées et signatures (C2PA) ne passent pas.
 */

import sharp from "sharp";
import { cutOutPose, type CutoutMethod } from "../cutout";

/** Au-delà, l'image est réduite avant le calcul : une pose n'a pas besoin de plus. */
const MAX_SIDE = 2048;

export interface CutoutResult {
  buffer: Buffer;
  method: CutoutMethod;
  width: number;
  height: number;
}

/**
 * Détoure une pose (fond vert, ou lueur d'un fond transparent) et la recadre.
 * Une image sans fond reconnu revient telle quelle (`none`), sans réencodage.
 */
export async function cutOutImage(input: Buffer): Promise<CutoutResult> {
  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { image, method } = cutOutPose({ data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height });
  if (method === "none") return { buffer: input, method, width: info.width, height: info.height };
  const buffer = await sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.length), { raw: { width: image.width, height: image.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { buffer, method, width: image.width, height: image.height };
}
