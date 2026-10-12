import { ModuleHooks } from "@/types/modules";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import sharp from "sharp";

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface WatermarkOptions {
  text: string;
  position: WatermarkPosition;
  /** 0 à 1. */
  opacity: number;
  /**
   * Taille du texte pour une image de 1 000 px de large, mise à l'échelle de
   * l'image réelle : le filigrane garde la même place sur une petite capture
   * et sur une photo de 4 000 px, comme dans l'aperçu de l'interface.
   */
  fontSize: number;
  color: string;
  /** Marge au bord, à la même échelle que la taille. */
  padding: number;
}

/** Largeur de référence des tailles du filigrane. */
export const REFERENCE_WIDTH = 1000;

const DEFAULTS: WatermarkOptions = {
  text: "© ShareX Manager",
  position: "bottom-right",
  opacity: 0.7,
  fontSize: 24,
  color: "#ffffff",
  padding: 20,
};

const POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** Le texte vient de l'utilisateur : il ne doit jamais casser le SVG. */
function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) =>
    character === "<" ? "&lt;" : character === ">" ? "&gt;" : character === "&" ? "&amp;" : character === '"' ? "&quot;" : "&apos;"
  );
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  // `null` ou une chaîne vide valent « non réglé » : `Number(null)` donnait 0.
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** Réglages reçus (module.json, interface) ramenés à des valeurs sûres. */
export function normalizeOptions(input: Partial<WatermarkOptions> | undefined): WatermarkOptions {
  const options = { ...DEFAULTS, ...(input ?? {}) };
  const text = String(options.text ?? "").trim().slice(0, 200);
  if (!text) throw new Error("Le texte du filigrane est vide.");
  const color = /^#[0-9a-f]{6}$/i.test(String(options.color)) ? String(options.color) : DEFAULTS.color;
  return {
    text,
    position: POSITIONS.includes(options.position) ? options.position : DEFAULTS.position,
    opacity: clamp(options.opacity, 0.05, 1, DEFAULTS.opacity),
    fontSize: clamp(options.fontSize, 8, 400, DEFAULTS.fontSize),
    color,
    padding: clamp(options.padding, 0, 500, DEFAULTS.padding),
  };
}

/**
 * Ajoute un filigrane texte. Le texte est posé sur un calque transparent de
 * la taille de l'image, ancré selon la position : aucun calcul de décalage
 * ne peut sortir de l'image, même petite.
 *
 * En cas de problème, l'erreur remonte : rendre l'image intacte faisait
 * croire que le filigrane avait été appliqué.
 */
export async function addWatermark(imageBuffer: Buffer, input?: Partial<WatermarkOptions>): Promise<Buffer> {
  const options = normalizeOptions(input);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error("Dimensions de l'image illisibles.");

  const scale = width / REFERENCE_WIDTH;
  // Une taille trop grande pour l'image est ramenée à un tiers de sa hauteur.
  const fontSize = Math.round(Math.max(8, Math.min(options.fontSize * scale, height / 3, width / 4)));
  const padding = Math.min(options.padding * scale, width / 4, height / 4);
  const [vertical, horizontal] = options.position.split("-") as ["top" | "middle" | "bottom", "left" | "center" | "right"];

  const anchor = horizontal === "left" ? "start" : horizontal === "right" ? "end" : "middle";
  const x = horizontal === "left" ? padding : horizontal === "right" ? width - padding : width / 2;
  // Ligne de base : le haut des capitales se trouve à environ 0,72 fois la taille.
  const y =
    vertical === "top" ? padding + fontSize * 0.8 : vertical === "bottom" ? height - padding - fontSize * 0.22 : height / 2 + fontSize * 0.35;

  const text = escapeXml(options.text);
  const shadow = Math.max(1, Math.round(fontSize / 18));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <g font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="${anchor}">
    <text x="${x + shadow}" y="${y + shadow}" fill="#000000" fill-opacity="${(options.opacity * 0.45).toFixed(3)}">${text}</text>
    <text x="${x}" y="${y}" fill="${options.color}" fill-opacity="${options.opacity.toFixed(3)}">${text}</text>
  </g>
</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toBuffer();
}

// ─── Logo d'une image de marque ──────────────────────────────────

export type WatermarkSource = "text" | "brand";

/** Coin du filigrane enregistré dans une image de marque. */
export type BrandAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Réglages de la source « Image de marque ». Chaque valeur absente reprend
 * celle de la marque : position, taille, opacité et marge ne sont que des
 * retouches pour une image.
 */
export interface BrandWatermarkOptions {
  kitId: string;
  /** Absente : le coin de la marque. */
  position?: WatermarkPosition;
  /** Largeur du logo, relative au petit côté de l'image. */
  size?: number;
  /** 0 à 1. */
  opacity?: number;
  /** Marge au bord, relative au petit côté de l'image. */
  margin?: number;
}

/**
 * Réglages reçus par `processImage` : sans `source`, c'est du texte. `null`
 * vaut « reprendre la valeur de la marque » (réglages enregistrés).
 */
export type WatermarkSettings = Partial<WatermarkOptions> & {
  source?: WatermarkSource;
  kitId?: string;
  size?: number | null;
  margin?: number | null;
};

/** Ce que rend `getWatermarkImage` du module `brand-kit`. */
export interface BrandWatermarkImage {
  kitId: string;
  name: string;
  image: Buffer;
  anchor: BrandAnchor;
  size: number;
  opacity: number;
  margin: number;
  updatedAt: number;
}

const BRAND_MODULE = "brand-kit";

/** Bornes des réglages de la marque, les mêmes que l'interface. */
export const BRAND_LIMITS = {
  size: { min: 0.02, max: 0.8 },
  margin: { min: 0, max: 0.25 },
} as const;

/** Réglages de la source marque ramenés à des valeurs sûres. */
export function normalizeBrandOptions(input: WatermarkSettings | undefined): BrandWatermarkOptions {
  const kitId = typeof input?.kitId === "string" ? input.kitId.trim() : "";
  if (!kitId) throw new Error("Aucune image de marque n'est choisie pour le filigrane.");
  const optional = (value: unknown, min: number, max: number) => {
    const number = clamp(value, min, max, Number.NaN);
    return Number.isNaN(number) ? undefined : number;
  };
  return {
    kitId,
    position: input?.position && POSITIONS.includes(input.position) ? input.position : undefined,
    size: optional(input?.size, BRAND_LIMITS.size.min, BRAND_LIMITS.size.max),
    opacity: optional(input?.opacity, 0.05, 1),
    margin: optional(input?.margin, BRAND_LIMITS.margin.min, BRAND_LIMITS.margin.max),
  };
}

/**
 * Logo du filigrane d'une marque, lu par le module `brand-kit`. Un module
 * absent ou désactivé rend `null` : l'erreur le dit plutôt que de laisser
 * passer une image sans filigrane.
 */
async function loadBrandWatermark(kitId: string): Promise<BrandWatermarkImage> {
  const brand = (await apiModuleManager.callModuleFunction(BRAND_MODULE, "getWatermarkImage", kitId)) as
    | BrandWatermarkImage
    | null;
  if (!brand) {
    throw new Error("Le module « Image de marque » est absent ou désactivé : le logo de la marque ne peut pas être posé.");
  }
  if (!Buffer.isBuffer(brand.image) || brand.image.length === 0) {
    throw new Error(`L'image de marque « ${brand.name ?? kitId} » n'a pas de logo pour le filigrane.`);
  }
  return brand;
}

interface ResizedLogo {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Logos déjà redimensionnés, par marque, version de la marque et largeur :
 * une rafale de captures de même taille ne redécode pas le logo à chaque
 * envoi. Une marque modifiée change de `updatedAt`, donc de clé.
 */
const logoCache = new Map<string, ResizedLogo>();
const LOGO_CACHE_LIMIT = 32;

/** Proportions des logos (largeur / hauteur), par marque et version. */
const ratioCache = new Map<string, number>();

/** Garde une entrée en fin de file et retire la plus ancienne au-delà de la limite. */
function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > LOGO_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return value;
}

async function logoRatio(brand: BrandWatermarkImage): Promise<number> {
  const key = `${brand.kitId}:${brand.updatedAt}`;
  const cached = ratioCache.get(key);
  if (cached) return cached;
  const { width, height } = await sharp(brand.image).metadata();
  if (!width || !height) throw new Error(`Le logo de l'image de marque « ${brand.name} » est illisible.`);
  return remember(ratioCache, key, width / height);
}

async function resizedLogo(brand: BrandWatermarkImage, width: number): Promise<ResizedLogo> {
  const key = `${brand.kitId}:${brand.updatedAt}:${width}`;
  const cached = logoCache.get(key);
  // Remis en fin de file : les logos servis souvent restent en mémoire.
  if (cached) return remember(logoCache, key, cached);
  const { data, info } = await sharp(brand.image)
    .ensureAlpha()
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return remember(logoCache, key, { data, width: info.width, height: info.height });
}

/** Vide les caches de logos (tests). */
export function clearBrandLogoCache() {
  logoCache.clear();
  ratioCache.clear();
}

/**
 * Pose le logo d'une image de marque. La largeur du logo et la marge sont
 * relatives au petit côté de l'image, comme dans Clip Studio : le logo garde
 * la même place sur une capture en largeur et sur une photo en hauteur.
 *
 * Une marque introuvable ou sans logo fait échouer le traitement : rendre
 * l'image intacte ferait croire que le filigrane a été posé.
 */
export async function addBrandWatermark(imageBuffer: Buffer, input?: WatermarkSettings): Promise<Buffer> {
  const options = normalizeBrandOptions(input);
  const brand = await loadBrandWatermark(options.kitId);

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error("Dimensions de l'image illisibles.");

  const position = options.position ?? (POSITIONS.includes(brand.anchor) ? brand.anchor : "bottom-right");
  const size = options.size ?? clamp(brand.size, BRAND_LIMITS.size.min, BRAND_LIMITS.size.max, 0.14);
  const opacity = options.opacity ?? clamp(brand.opacity, 0.05, 1, 0.85);
  const marginRatio = options.margin ?? clamp(brand.margin, BRAND_LIMITS.margin.min, BRAND_LIMITS.margin.max, 0.035);

  const shortSide = Math.min(width, height);
  const margin = Math.round(Math.min(marginRatio * shortSide, width / 4, height / 4));
  // Le logo tient toujours dans l'image, marges comprises, même très allongé.
  const ratio = await logoRatio(brand);
  const logoWidth = Math.max(1, Math.floor(Math.min(size * shortSide, width - 2 * margin, (height - 2 * margin) * ratio)));
  const logo = await resizedLogo(brand, logoWidth);

  // L'opacité s'applique au canal alpha, sur une copie : le logo en cache
  // sert à toutes les opacités.
  const pixels = Buffer.from(logo.data);
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = Math.round(pixels[index] * opacity);

  const [vertical, horizontal] = position.split("-") as ["top" | "middle" | "bottom", "left" | "center" | "right"];
  const left =
    horizontal === "left" ? margin : horizontal === "right" ? width - margin - logo.width : Math.round((width - logo.width) / 2);
  const top =
    vertical === "top" ? margin : vertical === "bottom" ? height - margin - logo.height : Math.round((height - logo.height) / 2);

  return sharp(imageBuffer)
    .composite([
      {
        input: pixels,
        raw: { width: logo.width, height: logo.height, channels: 4 },
        left: Math.max(0, Math.min(width - logo.width, left)),
        top: Math.max(0, Math.min(height - logo.height, top)),
      },
    ])
    .toBuffer();
}

/**
 * Point d'entrée du gestionnaire de modules. Sans `source`, le filigrane est
 * un texte, comme avant l'arrivée des images de marque.
 */
export async function processImage(imageBuffer: Buffer, data?: WatermarkSettings): Promise<Buffer> {
  if (data?.source === "brand") return addBrandWatermark(imageBuffer, data);
  return addWatermark(imageBuffer, data);
}

export const moduleHooks: ModuleHooks = {
  processImage,
};

export function initModule() {
  return moduleHooks;
}

export default moduleHooks;
