import { ModuleHooks } from "@/types/modules";
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

/** Point d'entrée du gestionnaire de modules. */
export async function processImage(imageBuffer: Buffer, data?: Partial<WatermarkOptions>): Promise<Buffer> {
  return addWatermark(imageBuffer, data);
}

export const moduleHooks: ModuleHooks = {
  processImage,
};

export function initModule() {
  return moduleHooks;
}

export default moduleHooks;
