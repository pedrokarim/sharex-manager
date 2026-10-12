/**
 * Limites de publication déclarées par un connecteur (`Connector.limits`) :
 * vérification et description lisible. Fonctions pures, importées par la
 * file de publication (refus côté serveur) et par la fenêtre de publication
 * d'un module (refus avant l'envoi) : aucune ne cite un service.
 */

import type { MediaLimits, PublishLimits, PublishMediaItem, PublishPricing, PublishSource, TextCount } from "./types";

/** Écart toléré sur le rapport largeur / hauteur : 1080 × 1350 doit passer pour 4:5. */
const RATIO_TOLERANCE = 0.005;

/** Longueur maximale absolue d'un texte, quel que soit le service. */
export const TEXT_HARD_LIMIT = 100_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Type MIME d'un nom de fichier, d'après son extension ; `undefined` si elle est inconnue. */
export function mimeTypeOfName(name: string): string | undefined {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] : undefined;
}

/** Longueur d'un texte comptée en points de code (un émoji simple compte pour un). */
export function textLength(text: string): number {
  return Array.from(text).length;
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
/** Adresse web, comptée pour 23 dans la mesure pondérée (approximation : http(s)://… et www.…). */
const URL_PATTERN = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/giu;
const LINK_LENGTH = 23;
/** Plages de poids 1 de la mesure pondérée ; tout le reste pèse 2. */
const LIGHT_RANGES: [number, number][] = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

/** Graphèmes d'un texte (un émoji composé en est un seul). */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/** Longueur d'un texte selon la mesure du service (voir `TextCount`). */
export function countText(text: string, mode: TextCount = "characters"): number {
  if (mode === "characters") return textLength(text);
  if (mode === "emoji-bytes") {
    return graphemes(text).reduce((sum, part) => sum + (EMOJI.test(part) ? utf8Length(part) : Array.from(part).length), 0);
  }
  let used = 0;
  const rest = text.replace(URL_PATTERN, () => {
    used += LINK_LENGTH;
    return "";
  });
  for (const part of graphemes(rest)) {
    if (EMOJI.test(part)) {
      used += 2;
      continue;
    }
    for (const char of part) {
      const code = char.codePointAt(0) ?? 0;
      used += LIGHT_RANGES.some(([from, to]) => code >= from && code <= to) ? 1 : 2;
    }
  }
  return used;
}

/** Ce qu'un compteur affiche : longueur mesurée et maximum du service. */
export function measureText(text: string, limits: PublishLimits["text"] | undefined): { used: number; max: number } {
  return { used: countText(text, limits?.count), max: Math.min(limits?.maxLength ?? TEXT_HARD_LIMIT, TEXT_HARD_LIMIT) };
}

/** Le texte contient-il une adresse web (surcoût de certains services) ? */
export function containsLink(text: string): boolean {
  URL_PATTERN.lastIndex = 0;
  const found = URL_PATTERN.test(text);
  URL_PATTERN.lastIndex = 0;
  return found;
}

/**
 * Coût estimé d'une publication d'après la table du connecteur ; `null` pour
 * un service gratuit. `text` : ce qui sera publié (message ou légende), pour
 * le surcoût d'une adresse.
 */
export function estimatePublishCost(
  pricing: PublishPricing | undefined,
  kind: PublishSource["kind"],
  text = ""
): { amount: number; currency: string; asOf: string; withLink: boolean } | null {
  if (!pricing) return null;
  const base = pricing.perPublish[kind] ?? 0;
  const withLink = Boolean(pricing.linkSurcharge) && containsLink(text);
  const amount = Math.round((base + (withLink ? pricing.linkSurcharge! : 0)) * 10_000) / 10_000;
  return { amount, currency: pricing.currency, asOf: pricing.asOf, withLink };
}

/** Montant lisible : « 0,015 $ US ». */
export function formatCost(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 4 }).format(amount);
  } catch {
    return `${amount.toLocaleString("fr-FR")} ${currency}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  return `${Math.ceil(bytes / 1024).toLocaleString("fr-FR")} Ko`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${String(rest).padStart(2, "0")}` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** Rapport sous forme lisible : 0,5625 → « 9:16 », 1,91 → « 1,91:1 ». */
export function formatRatio(ratio: number): string {
  const known: [number, string][] = [
    [9 / 16, "9:16"],
    [4 / 5, "4:5"],
    [1, "1:1"],
    [4 / 3, "4:3"],
    [16 / 9, "16:9"],
    [3 / 4, "3:4"],
    [2 / 3, "2:3"],
  ];
  const match = known.find(([value]) => Math.abs(value - ratio) < 0.01);
  return match ? match[1] : `${ratio.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}:1`;
}

const MIME_LABELS: Record<string, string> = {
  "video/mp4": "MP4",
  "video/quicktime": "MOV",
  "video/webm": "WebM",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/gif": "GIF",
};

/** Taille bornée : « 1920 × 1080 px », ou un seul côté quand l'autre ne l'est pas (jamais « 1920 × ? »). */
function sizeText(width: number | undefined, height: number | undefined): string {
  if (width && height) return `${width} × ${height} px`;
  return width ? `${width} px de large` : `${height} px de haut`;
}

/** Description courte des limites d'un format : « 3 min au plus · 9:16 à 16:9 · 1 Go au plus · MP4 ». */
export function describeMediaLimits(limits: MediaLimits | undefined): string {
  if (!limits) return "";
  const parts: string[] = [];
  if (limits.minDurationMs && limits.maxDurationMs) parts.push(`de ${formatDuration(limits.minDurationMs)} à ${formatDuration(limits.maxDurationMs)}`);
  else if (limits.maxDurationMs) parts.push(`${formatDuration(limits.maxDurationMs)} au plus`);
  else if (limits.minDurationMs) parts.push(`${formatDuration(limits.minDurationMs)} au moins`);
  if (limits.aspectRatio) {
    const { min, max } = limits.aspectRatio;
    parts.push(Math.abs(min - max) < 0.001 ? `format ${formatRatio(min)}` : `formats ${formatRatio(min)} à ${formatRatio(max)}`);
  }
  if (limits.minWidth || limits.minHeight) parts.push(`${sizeText(limits.minWidth, limits.minHeight)} au moins`);
  if (limits.maxWidth || limits.maxHeight) parts.push(`${sizeText(limits.maxWidth, limits.maxHeight)} au plus`);
  if (limits.maxBytes) parts.push(`${formatBytes(limits.maxBytes)} au plus`);
  if (limits.mimeTypes?.length) parts.push(limits.mimeTypes.map((type) => MIME_LABELS[type] ?? type).join(", "));
  return parts.join(" · ");
}

/**
 * Ce qui, dans un fichier, dépasse les limites du service. Une dimension
 * inconnue (largeur, durée…) n'est pas vérifiée : le service tranchera.
 */
export function checkMediaLimits(limits: MediaLimits | undefined, media: Omit<PublishMediaItem, "file"> & { file?: string }): string[] {
  if (!limits) return [];
  const problems: string[] = [];
  const noun = media.kind === "video" ? "La vidéo" : "L’image";
  const mimeType = media.mimeType ?? (media.file ? mimeTypeOfName(media.file) : undefined);
  if (limits.mimeTypes?.length && mimeType && !limits.mimeTypes.includes(mimeType)) {
    problems.push(`${noun} est au format ${MIME_LABELS[mimeType] ?? mimeType} : formats acceptés ${limits.mimeTypes.map((type) => MIME_LABELS[type] ?? type).join(", ")}.`);
  }
  if (limits.maxBytes && media.bytes > limits.maxBytes) {
    problems.push(`${noun} pèse ${formatBytes(media.bytes)} : ${formatBytes(limits.maxBytes)} au plus.`);
  }
  if (media.kind === "video" && media.durationMs !== undefined && media.durationMs > 0) {
    if (limits.maxDurationMs && media.durationMs > limits.maxDurationMs) {
      problems.push(`${noun} dure ${formatDuration(media.durationMs)} : ${formatDuration(limits.maxDurationMs)} au plus.`);
    }
    if (limits.minDurationMs && media.durationMs < limits.minDurationMs) {
      problems.push(`${noun} dure ${formatDuration(media.durationMs)} : ${formatDuration(limits.minDurationMs)} au moins.`);
    }
  }
  if (media.width && media.height) {
    if (limits.aspectRatio) {
      const ratio = media.width / media.height;
      const { min, max } = limits.aspectRatio;
      if (ratio < min * (1 - RATIO_TOLERANCE) || ratio > max * (1 + RATIO_TOLERANCE)) {
        const accepted = Math.abs(min - max) < 0.001 ? formatRatio(min) : `de ${formatRatio(min)} à ${formatRatio(max)}`;
        problems.push(`${noun} est en ${media.width} × ${media.height} (${formatRatio(ratio)}) : format accepté ${accepted}.`);
      }
    }
    if ((limits.minWidth && media.width < limits.minWidth) || (limits.minHeight && media.height < limits.minHeight)) {
      problems.push(`${noun} est trop petite (${media.width} × ${media.height}) : ${sizeText(limits.minWidth, limits.minHeight)} au moins.`);
    }
    if ((limits.maxWidth && media.width > limits.maxWidth) || (limits.maxHeight && media.height > limits.maxHeight)) {
      problems.push(`${noun} est trop grande (${media.width} × ${media.height}) : ${sizeText(limits.maxWidth, limits.maxHeight)} au plus.`);
    }
  }
  return problems;
}

/**
 * Tout ce qui empêche de publier cette source chez ce service ; vide si elle
 * convient. `measure` : mesure du texte propre au connecteur (serveur).
 */
export function checkPublishLimits(
  limits: PublishLimits | undefined,
  source: PublishSource,
  options: { measure?: (text: string) => { used: number; max: number } } = {}
): string[] {
  if (source.kind === "text") {
    if (typeof source.text !== "string" || !source.text.trim()) return ["Le message est vide."];
    const { used, max } = options.measure ? options.measure(source.text) : measureText(source.text, limits?.text);
    const cap = Math.min(max, TEXT_HARD_LIMIT);
    return used > cap ? [`Le message fait ${used.toLocaleString("fr-FR")} caractères : ${cap.toLocaleString("fr-FR")} au plus.`] : [];
  }
  if (source.kind === "carousel") {
    const problems: string[] = [];
    const min = limits?.carousel?.minItems ?? 2;
    const max = limits?.carousel?.maxItems ?? 10;
    if (source.items.length < min) problems.push(`Un carrousel compte ${min} éléments au moins.`);
    if (source.items.length > max) problems.push(`Un carrousel compte ${max} éléments au plus.`);
    source.items.forEach((item, index) => {
      for (const problem of checkMediaLimits(item.kind === "video" ? limits?.video : limits?.image, item)) problems.push(`Élément ${index + 1} : ${problem}`);
    });
    return problems;
  }
  const problems = checkMediaLimits(source.kind === "video" ? limits?.video : limits?.image, source);
  // Une couverture a ses propres limites (9:16 pour un format court…), jamais celles d'une image publiée.
  if (source.cover) for (const problem of checkMediaLimits(limits?.cover, source.cover)) problems.push(`Couverture : ${problem}`);
  return problems;
}
