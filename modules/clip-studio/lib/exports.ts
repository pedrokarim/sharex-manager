/**
 * Exports côté serveur (dossier 01 ter, § 5 et § 7) : couverture,
 * sous-titres, crédits, textes de publication tirés de la marque.
 *
 * Aucun chemin ne vient du navigateur : un fichier déposé par la route
 * d'upload est désigné par son nom simple, relu, contrôlé et réécrit sous un
 * nom neuf à côté de la vidéo.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { getAbsoluteUploadPath } from "@/lib/config";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import type { TemplateLink } from "@/lib/connections/templates";
import type { ClipExport, ClipProject } from "../engine/types";
import { projectCredits } from "./credits";
import { hashtagRulesOf, postFromBrand, projectSummary, type BrandPostSettings } from "./post-texts";
import type { ExportCover, ExportPost, HashtagRule } from "./post-types";
import { ASSETS_DIR, EXPORTS_DIR, assertFileName, assertId, readExports, writeExports } from "./store";

// ─── Lecture et écriture ─────────────────────────────────────────

export function findExport(id: unknown): ClipExport {
  assertId(id, "Identifiant d'export");
  const entry = readExports().find((item) => item.id === id);
  if (!entry) throw new Error("Export introuvable");
  return entry;
}

/** Modifie un export et réécrit la liste ; rend l'export modifié. */
export function changeExport(id: string, mutate: (entry: ClipExport) => ClipExport): ClipExport {
  assertId(id, "Identifiant d'export");
  const exports = readExports();
  const index = exports.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Export introuvable");
  const next = mutate(structuredClone(exports[index]));
  exports[index] = next;
  writeExports(exports);
  return next;
}

/** Nom d'un fichier lié à la vidéo : même base, suffixe et extension propres. */
export function siblingName(videoFile: string, suffix: string, extension: string): string {
  const base = videoFile.replace(/\.[a-z0-9]+$/i, "").slice(0, 80);
  const name = `${base}-${suffix}.${extension}`;
  assertFileName(name);
  return name;
}

/** Chemin contrôlé d'un fichier rangé dans `exports/`. */
export function exportPath(file: string): string {
  assertFileName(file);
  const full = path.join(EXPORTS_DIR, file);
  if (path.dirname(full) !== EXPORTS_DIR) throw new Error("Nom de fichier invalide");
  return full;
}

/** Supprime les fichiers rangés avec un export : vidéo, couverture, sous-titres. */
export function removeExportFiles(entry: ClipExport) {
  for (const file of [entry.file, entry.cover?.file, entry.subtitles?.file]) {
    if (!file) continue;
    try {
      fs.rmSync(exportPath(file), { force: true });
    } catch {
      // Un nom invalide n'a pas pu être écrit par ce module : rien à supprimer.
    }
  }
}

// ─── Couverture ──────────────────────────────────────────────────

const COVER_FORMATS = new Set(["png", "jpeg", "webp"]);
const COVER_MAX_SIDE = 1920;
/** Poids au plus d'une miniature YouTube ; les autres services acceptent davantage. */
const COVER_MAX_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Réencode une image en JPEG au cadre de la vidéo (centré, rogné), 1 920 px
 * au plus sur le grand côté, 2 Mo au plus : la même couverture convient à
 * chaque service, au rapport de la vidéo.
 */
export async function encodeCover(input: Buffer | string, frame: { width: number; height: number }): Promise<{ data: Buffer; width: number; height: number }> {
  const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
  const meta = await image.metadata().catch(() => null);
  if (!meta?.format || !COVER_FORMATS.has(meta.format)) throw new Error("Couverture refusée : PNG, JPEG ou WebP seulement.");
  const ratio = frame.width > 0 && frame.height > 0 ? frame.width / frame.height : (meta.width ?? 1) / (meta.height ?? 1);
  const width = Math.round(ratio >= 1 ? COVER_MAX_SIDE : COVER_MAX_SIDE * ratio);
  const height = Math.round(ratio >= 1 ? COVER_MAX_SIDE / ratio : COVER_MAX_SIDE);
  const target = { width: Math.max(16, Math.min(width, frame.width || width)), height: Math.max(16, Math.min(height, frame.height || height)) };
  for (const quality of [88, 78, 68, 55]) {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ ...target, fit: "cover", position: "attention" })
      .flatten({ background: "#000000" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= COVER_MAX_BYTES || quality === 55) return { data, width: info.width, height: info.height };
  }
  throw new Error("Couverture impossible à réencoder.");
}

/** Nom simple d'un fichier de la galerie : jamais un chemin. */
function assertGalleryName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(name) || name.includes("..")) {
    throw new Error("Fichier de la galerie invalide");
  }
}

export type CoverInput = { file: string; atMs?: number } | { galleryFile: string };

/**
 * Lit la source d'une couverture : un fichier déposé par la route d'upload
 * du module (image du clip au curseur, rendue par le navigateur), ou une
 * image de la galerie. Le dépôt est retiré une fois lu.
 */
export function readCoverSource(input: CoverInput): { buffer: Buffer; atMs?: number; cleanup: () => void } {
  if (input && "galleryFile" in input) {
    assertGalleryName(input.galleryFile);
    const uploads = getAbsoluteUploadPath();
    const full = path.join(uploads, input.galleryFile);
    if (path.resolve(path.dirname(full)) !== path.resolve(uploads) || !fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error("Image de la galerie introuvable");
    return { buffer: fs.readFileSync(full), cleanup: () => undefined };
  }
  const file = (input as { file?: unknown })?.file;
  assertFileName(file);
  const full = path.join(ASSETS_DIR, file);
  if (path.dirname(full) !== ASSETS_DIR || !fs.existsSync(full)) throw new Error("Image de couverture introuvable");
  const atMs = Number((input as { atMs?: unknown }).atMs);
  return {
    buffer: fs.readFileSync(full),
    atMs: Number.isFinite(atMs) && atMs >= 0 ? Math.round(atMs) : undefined,
    cleanup: () => fs.rmSync(full, { force: true }),
  };
}

/** Range la couverture d'un export à côté de la vidéo, sous un nom neuf. */
export async function storeCover(entry: ClipExport, input: CoverInput): Promise<ExportCover> {
  const source = readCoverSource(input);
  try {
    const encoded = await encodeCover(source.buffer, { width: entry.width, height: entry.height });
    const file = siblingName(entry.file, `cover-${randomBytes(3).toString("hex")}`, "jpg");
    fs.writeFileSync(exportPath(file), encoded.data);
    const atMs = source.atMs !== undefined && entry.durationMs > 0 ? Math.min(source.atMs, entry.durationMs) : undefined;
    return { file, width: encoded.width, height: encoded.height, ...(atMs !== undefined ? { atMs } : {}) };
  } finally {
    source.cleanup();
  }
}

// ─── Petits contrôles ────────────────────────────────────────────

export const isKitId = (value: unknown): value is string => typeof value === "string" && /^kit-[a-z0-9]{6,32}$/.test(value);
export const isLanguage = (value: unknown): value is string => typeof value === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value);

/** Volume mesuré : LUFS intégrés et crête, dans des bornes réalistes. */
export function cleanLoudness(value: unknown): { lufs: number; peakDb: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { lufs, peakDb } = value as Record<string, unknown>;
  const l = Number(lufs);
  const p = Number(peakDb);
  if (!Number.isFinite(l) || !Number.isFinite(p) || l < -70 || l > 0 || p < -70 || p > 6) return undefined;
  return { lufs: Math.round(l * 10) / 10, peakDb: Math.round(p * 10) / 10 };
}

// ─── Marque ──────────────────────────────────────────────────────

/** Champs de la fiche `brand-kit` lus ici. */
export interface ExportBrand {
  id: string;
  name: string;
  tagline?: string;
  language?: string;
  callToAction?: string;
  /** Ton de la marque et ton des scripts, pour l'assistant. */
  tone?: string;
  scriptTone?: string;
  rules?: { always: string[]; never: string[] };
  publishing: BrandPostSettings;
}

/** Marque d'un export, lue par le module `brand-kit` ; `null` s'il est absent ou si elle a disparu. */
export async function loadExportBrand(kitId: string | undefined): Promise<ExportBrand | null> {
  if (!isKitId(kitId)) return null;
  try {
    const record = (await apiModuleManager.callModuleFunction("brand-kit", "getKit", kitId)) as {
      kit?: {
        id: string;
        name: string;
        tagline?: string;
        language?: string;
        tone?: string;
        rules?: { always?: string[]; never?: string[] };
        ai?: { scriptTone?: string };
        endCard?: { callToAction?: string };
        publishing?: BrandPostSettings & { links?: TemplateLink[] };
      };
    } | null;
    const kit = record?.kit;
    if (!kit?.publishing) return null;
    return {
      id: kit.id,
      name: kit.name,
      tagline: kit.tagline,
      language: kit.language,
      callToAction: kit.endCard?.callToAction,
      tone: kit.tone,
      scriptTone: kit.ai?.scriptTone,
      rules: { always: kit.rules?.always ?? [], never: kit.rules?.never ?? [] },
      publishing: kit.publishing,
    };
  } catch {
    return null;
  }
}

/** Jeu de textes tiré de la marque pour un export (« Reprendre la marque »). */
export function postForExport(entry: ClipExport, project: ClipProject | null, brand: ExportBrand | null, now = Date.now()): ExportPost {
  const language = brand?.language ?? "fr";
  return postFromBrand(
    brand?.publishing ?? null,
    {
      title: project?.name || entry.projectName,
      hook: brand?.tagline,
      summary: projectSummary(project),
      cta: brand?.callToAction,
      credits: entry.credits ?? projectCredits(project, language),
      brand: brand?.name,
      language,
      date: now,
    },
    now
  );
}

/** Règles des hashtags choisies par la marque d'un export, par service. */
export function brandHashtagRules(brand: ExportBrand | null): Record<string, HashtagRule> {
  return hashtagRulesOf(brand?.publishing ?? null);
}
