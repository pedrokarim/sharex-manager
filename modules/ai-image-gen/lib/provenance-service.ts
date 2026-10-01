/**
 * Marques d'origine des images du module, lues sur le disque.
 *
 * La lecture se fait côté serveur : les fichiers y sont déjà, et le navigateur
 * n'a pas à télécharger plusieurs mégaoctets pour afficher un badge.
 * L'original n'est jamais réécrit : la version sans métadonnées est produite
 * à la volée, en mémoire.
 */

import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import { inspectImage, sniffFormat, stripMetadata, summarize } from "./provenance";
import { cleanFileName, type CleanResult, type ProvenanceReport, type ProvenanceSummary } from "./provenance-types";
import { IMAGES_DIR } from "./store";

/** Images inspectées en un appel : une page de la grille, largement. */
const MAX_BATCH = 240;

const MIME_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

interface CacheEntry {
  /** Taille et date du fichier : un fichier remplacé est relu. */
  stamp: string;
  report: ProvenanceReport;
  clean?: CleanResult | null;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 2000;

/** Chemin d'une image du module. Un nom simple, jamais un chemin. */
function imagePath(file: unknown): string {
  if (typeof file !== "string" || !file || file !== path.basename(file) || file.startsWith(".")) {
    throw new Error("Nom d'image invalide.");
  }
  return path.join(IMAGES_DIR, file);
}

function load(file: unknown): { name: string; entry: CacheEntry; buffer: () => Buffer } {
  const fullPath = imagePath(file);
  const name = file as string;
  let stats: fs.Stats;
  try {
    stats = fs.statSync(fullPath);
  } catch {
    throw new Error("Image introuvable.");
  }
  const stamp = `${stats.size}:${stats.mtimeMs}`;
  let buffer: Buffer | null = null;
  const read = () => (buffer ??= fs.readFileSync(fullPath));

  let entry = cache.get(name);
  if (!entry || entry.stamp !== stamp) {
    entry = { stamp, report: inspectImage(read()) };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(name, entry);
  }
  return { name, entry, buffer: read };
}

/** Indicateur d'origine de plusieurs images, en un seul appel. */
export function inspectMany(files: unknown): Record<string, ProvenanceSummary> {
  const summaries: Record<string, ProvenanceSummary> = {};
  if (!Array.isArray(files)) return summaries;
  for (const file of files.slice(0, MAX_BATCH)) {
    try {
      const { name, entry } = load(file);
      summaries[name] = summarize(entry.report);
    } catch {
      // Fichier absent ou nom refusé : pas d'indicateur pour celui-là.
    }
  }
  return summaries;
}

/** Vrai si les deux fichiers portent exactement les mêmes pixels. */
export async function samePixels(before: Buffer, after: Buffer): Promise<boolean> {
  const { default: sharp } = await import("sharp");
  const digest = async (file: Buffer) => {
    // `animated` : toutes les images d'un fichier animé comptent, pas la première seule.
    const { data, info } = await sharp(file, { animated: true }).raw().toBuffer({ resolveWithObject: true });
    return createHash("sha256")
      .update(`${info.width}x${info.height}x${info.channels}:`)
      .update(data)
      .digest("hex");
  };
  return (await digest(before)) === (await digest(after));
}

/**
 * Retire les métadonnées et **prouve** que les pixels n'ont pas bougé. Si la
 * preuve échoue, rien n'est rendu : mieux vaut pas de version propre qu'une
 * version abîmée.
 */
async function cleanOf(original: Buffer): Promise<{ output: Buffer; result: CleanResult }> {
  const { output, removed } = stripMetadata(original);
  const pixelsIdentical = await samePixels(original, output);
  if (!pixelsIdentical) {
    throw new Error("Le retrait des métadonnées a modifié les pixels : la version propre n'est pas proposée.");
  }
  return {
    output,
    result: { bytes: output.length, savedBytes: original.length - output.length, removed, pixelsIdentical },
  };
}

/** Détail d'une image : ce qui a été lu, et ce que donnerait le retrait. */
export async function inspectOne(file: unknown): Promise<{ report: ProvenanceReport; clean: CleanResult | null }> {
  const { entry, buffer } = load(file);
  if (entry.clean === undefined) {
    entry.clean = null;
    if (entry.report.removable && entry.report.carriers.length > 0) {
      try {
        entry.clean = (await cleanOf(buffer())).result;
      } catch {
        entry.clean = null;
      }
    }
  }
  return { report: entry.report, clean: entry.clean };
}

/** La version sans métadonnées, prête à être téléchargée. L'original reste intact. */
export async function cleanCopy(
  file: unknown
): Promise<{ fileName: string; mimeType: string; b64: string; clean: CleanResult }> {
  const { name, entry, buffer } = load(file);
  const original = buffer();
  const format = sniffFormat(original);
  if (!format) throw new Error(entry.report.removableReason ?? "Format non géré pour le retrait.");
  const { output, result } = await cleanOf(original);
  entry.clean = result;
  return { fileName: cleanFileName(name), mimeType: MIME_TYPES[format], b64: output.toString("base64"), clean: result };
}
