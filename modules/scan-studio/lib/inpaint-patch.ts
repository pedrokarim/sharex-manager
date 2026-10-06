/**
 * Fond reconstruit d'une zone : le calcul, sans rien de React. La scène de
 * l'atelier (`components/editor/use-inpaint.ts`) et l'export en lot
 * (`page-export.ts`) passent par ici : ce qu'on voit est ce qu'on exporte.
 */

import type { Rect } from "./geometry";
import { fingerprint, inpaint, inpaintWindow } from "./inpaint";
import type { PixelData } from "./mask-color";
import { paintMask, type InpaintPatch } from "./render";
import { boundsOf, type Point, type ScanRegion } from "./types";

/** Où en est le fond reconstruit d'une zone. */
export type InpaintStatus =
  | { state: "pending" }
  | { state: "ready"; grain: boolean }
  /** Le calcul a renoncé : la zone garde son aplat, et `message` dit pourquoi. */
  | { state: "failed"; message: string };

export type ReadPixels = (rect: Rect) => { pixels: PixelData; offset: Point } | null;

/** Rectangle qui contient tout le masque : sa forme, sa marge, ses retouches au pinceau. */
function maskBounds(region: ScanRegion): Rect {
  const outline = boundsOf(region.outline);
  // L'ellipse déborde du rectangle englobant, d'un facteur √2 au plus.
  const reach = region.mask.shape === "ellipse" ? Math.max(outline.width, outline.height) * 0.21 : 0;
  const grow = Math.max(0, region.mask.grow) * (region.mask.shape === "outline" ? 3 : 1) + reach;
  let left = outline.x - grow;
  let top = outline.y - grow;
  let right = outline.x + outline.width + grow;
  let bottom = outline.y + outline.height + grow;
  for (const stroke of region.mask.strokes) {
    const half = stroke.width / 2;
    for (const point of stroke.points) {
      left = Math.min(left, point.x - half);
      top = Math.min(top, point.y - half);
      right = Math.max(right, point.x + half);
      bottom = Math.max(bottom, point.y + half);
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Ce dont le fond reconstruit dépend : dès que cela change, il est à refaire. */
export function maskKey(region: ScanRegion): string {
  const { shape, grow, strokes } = region.mask;
  return fingerprint(JSON.stringify([region.outline, shape, grow, strokes.map((stroke) => [stroke.width, stroke.points])]));
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Lecteur des pixels d'une page : un rectangle de l'image d'origine, et le
 * coin où il commence. Seule cette portion est décodée.
 */
export function createPixelReader(image: HTMLImageElement, page: { width: number; height: number }): ReadPixels {
  return (rect) => {
    const x = clamp(Math.floor(rect.x), 0, page.width - 1);
    const y = clamp(Math.floor(rect.y), 0, page.height - 1);
    const width = clamp(Math.ceil(rect.x + rect.width) - x, 1, page.width - x);
    const height = clamp(Math.ceil(rect.y + rect.height) - y, 1, page.height - y);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      const scaleX = image.naturalWidth / page.width;
      const scaleY = image.naturalHeight / page.height;
      ctx.drawImage(image, x * scaleX, y * scaleY, width * scaleX, height * scaleY, 0, 0, width, height);
      return { pixels: ctx.getImageData(0, 0, width, height), offset: { x, y } };
    } catch {
      // Zone trop grande pour un canevas : l'appelant garde sa couleur de repli.
      return null;
    }
  };
}

/**
 * Calcule le fond reconstruit d'une zone, dans le navigateur. Rend l'image à
 * poser, ou la raison pour laquelle la zone garde son aplat.
 */
export async function computeInpaintPatch(
  region: ScanRegion,
  page: { width: number; height: number },
  readPixels: ReadPixels,
  signal: AbortSignal,
): Promise<{ status: InpaintStatus; patch: InpaintPatch | null }> {
  const failed = (message: string) => ({ status: { state: "failed", message } as InpaintStatus, patch: null });
  const window = inpaintWindow(maskBounds(region), page);
  if (window.width < 1 || window.height < 1) return failed("Le masque ne couvre aucun pixel de la page.");

  const read = readPixels(window);
  if (!read) return failed("Les pixels de cette zone n’ont pas pu être lus : l’aplat de couleur est gardé.");
  const { pixels, offset } = read;

  // Silhouette du masque, dessinée par la fonction qui dessine le masque lui-même.
  const silhouette = document.createElement("canvas");
  silhouette.width = pixels.width;
  silhouette.height = pixels.height;
  const ctx = silhouette.getContext("2d", { willReadFrequently: true });
  if (!ctx) return failed("Le navigateur n’a pas pu préparer la reconstruction : l’aplat de couleur est gardé.");
  ctx.translate(-offset.x, -offset.y);
  paintMask(ctx, region, "#000000");
  const alpha = ctx.getImageData(0, 0, pixels.width, pixels.height).data;
  const mask = new Uint8Array(pixels.width * pixels.height);
  for (let index = 0; index < mask.length; index++) mask[index] = alpha[index * 4 + 3] >= 128 ? 1 : 0;

  const result = await inpaint(pixels, mask, { signal });
  if (!result.ok) return failed(result.message);

  // Le fond reconstruit est transparent hors du masque : il ne recouvre rien d'autre.
  const output = new ImageData(pixels.width, pixels.height);
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    output.data[index * 4] = result.data[index * 4];
    output.data[index * 4 + 1] = result.data[index * 4 + 1];
    output.data[index * 4 + 2] = result.data[index * 4 + 2];
    output.data[index * 4 + 3] = 255;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixels.width, pixels.height);
  ctx.putImageData(output, 0, 0);
  return { status: { state: "ready", grain: result.grain }, patch: { image: silhouette, x: offset.x, y: offset.y } };
}
