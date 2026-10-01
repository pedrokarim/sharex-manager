/**
 * Marques d'origine des images d'un dossier du serveur : la galerie, ou les
 * rendus d'un module.
 *
 * La lecture se fait côté serveur : les fichiers y sont déjà, et le navigateur
 * n'a pas à télécharger plusieurs mégaoctets pour afficher un badge.
 * L'original n'est jamais réécrit : la version sans métadonnées est produite
 * à la volée, en mémoire.
 */

import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import { inspectImage, sniffFormat, stripMetadata, summarize } from "./inspect";
import { cleanFileName, type CleanResult, type ProvenanceReport, type ProvenanceSummary } from "./types";

/** Images inspectées en un appel : une page de grille, largement. */
const MAX_BATCH = 240;
/**
 * Au-delà, un fichier n'est pas lu pour un simple badge : les marques
 * d'origine concernent des images, pas des archives ou des vidéos.
 */
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_CACHE = 2000;

const MIME_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

interface CacheEntry {
  /** Taille et date du fichier : un fichier remplacé est relu. */
  stamp: string;
  report: ProvenanceReport;
  clean?: CleanResult | null;
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

/**
 * Lecteur des marques d'origine d'un dossier. `directory` est une fonction :
 * le dossier peut dépendre d'une configuration lue plus tard.
 */
export function createProvenanceReader(directory: () => string) {
  const cache = new Map<string, CacheEntry>();

  /** Chemin d'une image du dossier. Un nom simple, jamais un chemin. */
  const imagePath = (file: unknown): string => {
    if (typeof file !== "string" || !file || file !== path.basename(file) || file.startsWith(".")) {
      throw new Error("Nom d'image invalide.");
    }
    return path.join(directory(), file);
  };

  const load = (file: unknown): { name: string; entry: CacheEntry; buffer: () => Buffer } => {
    const fullPath = imagePath(file);
    const name = file as string;
    let stats: fs.Stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      throw new Error("Image introuvable.");
    }
    if (!stats.isFile()) throw new Error("Image introuvable.");
    const stamp = `${stats.size}:${stats.mtimeMs}`;
    let buffer: Buffer | null = null;
    const read = () => (buffer ??= fs.readFileSync(fullPath));

    let entry = cache.get(name);
    if (!entry || entry.stamp !== stamp) {
      entry = {
        stamp,
        report:
          stats.size > MAX_BYTES
            ? { format: null, status: "unsupported", bytes: stats.size, carriers: [], removable: false }
            : inspectImage(read()),
      };
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
      cache.set(name, entry);
    }
    return { name, entry, buffer: read };
  };

  return {
    /** Indicateur d'origine de plusieurs images, en un seul appel. */
    inspectMany(files: unknown): Record<string, ProvenanceSummary> {
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
    },

    /** Détail d'une image : ce qui a été lu, et ce que donnerait le retrait. */
    async inspectOne(file: unknown): Promise<{ report: ProvenanceReport; clean: CleanResult | null }> {
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
    },

    /** La version sans métadonnées, prête à être téléchargée. L'original reste intact. */
    async cleanCopy(file: unknown): Promise<{ fileName: string; mimeType: string; b64: string; clean: CleanResult }> {
      const { name, entry, buffer } = load(file);
      const original = buffer();
      const format = sniffFormat(original);
      if (!format) throw new Error(entry.report.removableReason ?? "Format non géré pour le retrait.");
      const { output, result } = await cleanOf(original);
      entry.clean = result;
      return { fileName: cleanFileName(name), mimeType: MIME_TYPES[format], b64: output.toString("base64"), clean: result };
    },
  };
}
