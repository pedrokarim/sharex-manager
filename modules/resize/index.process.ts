import { ModuleHooks } from "@/types/modules";
import sharp from "sharp";

export type FitMode = "inside" | "outside" | "cover" | "contain" | "fill";

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  /** Faux : l'image prend exactement la taille demandée, déformée au besoin. */
  maintainAspectRatio: boolean;
  /**
   * - inside : tient dans le cadre, sans rognage ni agrandissement ;
   * - outside : couvre au moins le cadre ;
   * - cover : remplit le cadre, l'excédent est rogné ;
   * - contain : tient dans le cadre, complété par des bandes transparentes ;
   * - fill : étiré à la taille exacte.
   */
  fitMode: FitMode;
  keepMetadata: boolean;
}

const DEFAULTS: ResizeOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 90,
  maintainAspectRatio: true,
  fitMode: "inside",
  keepMetadata: true,
};

const FIT_MODES: FitMode[] = ["inside", "outside", "cover", "contain", "fill"];

function dimension(value: unknown, fallback: number): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, 16_384) : fallback;
}

export function normalizeOptions(input: Partial<ResizeOptions> | undefined): ResizeOptions {
  const options = { ...DEFAULTS, ...(input ?? {}) };
  return {
    maxWidth: dimension(options.maxWidth, DEFAULTS.maxWidth),
    maxHeight: dimension(options.maxHeight, DEFAULTS.maxHeight),
    quality: Math.min(100, Math.max(1, Math.round(Number(options.quality) || DEFAULTS.quality))),
    maintainAspectRatio: options.maintainAspectRatio !== false,
    fitMode: FIT_MODES.includes(options.fitMode) ? options.fitMode : DEFAULTS.fitMode,
    keepMetadata: options.keepMetadata !== false,
  };
}

/**
 * Redimensionne l'image. Si elle tient déjà dans le cadre (mode « inside »),
 * une erreur le dit : renvoyer l'original faisait croire à un succès, et
 * réencoder pour rien dégradait chaque capture.
 */
export async function resizeImage(imageBuffer: Buffer, input?: Partial<ResizeOptions>): Promise<Buffer> {
  const options = normalizeOptions(input);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error("Dimensions de l'image illisibles.");

  const fit: FitMode = options.maintainAspectRatio ? options.fitMode : "fill";
  if (fit === "inside" && width <= options.maxWidth && height <= options.maxHeight) {
    throw new Error(`L'image fait déjà ${width} × ${height} px, dans la limite de ${options.maxWidth} × ${options.maxHeight}.`);
  }

  let pipeline = sharp(imageBuffer).resize(options.maxWidth, options.maxHeight, {
    fit,
    // On n'agrandit jamais une capture en mode « inside » : elle y perdrait en netteté.
    withoutEnlargement: fit === "inside",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (options.keepMetadata) pipeline = pipeline.keepMetadata();

  switch (metadata.format) {
    case "png":
      return pipeline.png().toBuffer();
    case "webp":
      return pipeline.webp({ quality: options.quality }).toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
    case "heif":
      return pipeline.avif({ quality: options.quality }).toBuffer();
    case "tiff":
      return pipeline.tiff({ quality: options.quality }).toBuffer();
    default:
      // Des bandes transparentes n'existent pas en JPEG : le mode « contain » passe en PNG.
      return fit === "contain" ? pipeline.png().toBuffer() : pipeline.jpeg({ quality: options.quality }).toBuffer();
  }
}

/** Point d'entrée du gestionnaire de modules. */
export async function processImage(imageBuffer: Buffer, data?: Partial<ResizeOptions>): Promise<Buffer> {
  return resizeImage(imageBuffer, data);
}

export const moduleHooks: ModuleHooks = {
  processImage,
};

export function initModule() {
  return moduleHooks;
}

export default moduleHooks;
