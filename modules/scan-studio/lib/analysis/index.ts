"use client";

/**
 * Analyse automatique d'une page, dans le navigateur : premier niveau de
 * l'échelle de recours (§ 3 du dossier). Texte source anglais, japonais,
 * chinois ou coréen, lu localement, sans IA générative et sans rien envoyer à
 * un service.
 *
 * Ce fichier fait le lien entre le navigateur (canevas, moteur de lecture,
 * fonctions serveur) et la chaîne d'analyse de `pipeline.ts`, qui ne connaît
 * ni l'un ni l'autre. Il implémente `contract.ts`.
 */

import { api, newId } from "../client";
import type { Rect } from "../geometry";
import type { ChapterSettings, ScanRegion } from "../types";
import type { AnalyzeImage, AnalyzePages, AnalyzePagesResult, AnalysisProgress } from "./contract";
import { createBrowserReader, sizeOf, type Surface } from "./browser-reader";
import { mergeRegions } from "./merge";
import { detectTexts } from "./detector";
import { analyzeWithBoxes, analyzeWithReader, readZone, type ZoneReading } from "./pipeline";
import type { PageSize } from "./words";

export type * from "./contract";
export type { ZoneReading } from "./pipeline";
export { REVIEW_CONFIDENCE } from "./words";
export { isProtectedRegion, mergeRegions, needsReview } from "./merge";
export { READING_ENGINE } from "./regions";
export { releaseEngine } from "./engine";
export { suggestedFormat } from "./languages";
import { looksUntranslatable } from "./untranslatable";

export { isTranslatableRegion, looksUntranslatable } from "./untranslatable";

/** Pourquoi ce chapitre ne peut pas être analysé automatiquement ; `null` s'il le peut. */
export function analysisBlocker(settings: ChapterSettings): string | null {
  if (settings.maxLevel < 1) {
    return "Ce chapitre est réglé sur le niveau 0 (tout à la main) : l’analyse automatique y est coupée. Le niveau se change dans les réglages du chapitre.";
  }
  return null;
}

interface RunOptions {
  /** Taille de la page ; par défaut celle de l'image. */
  size?: PageSize;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

async function run(image: Surface, settings: ChapterSettings, options: RunOptions = {}): Promise<ScanRegion[]> {
  const blocker = analysisBlocker(settings);
  if (blocker) throw new Error(blocker);
  const size = options.size ?? sizeOf(image);
  if (!(size.width > 0 && size.height > 0)) throw new Error("L’image de cette page n’est pas encore chargée");
  const reader = createBrowserReader(image, size, settings.sourceLanguage);

  // Le détecteur de bulles et de texte d'abord, s'il est installé et choisi.
  const detector = await detectorChoice();
  const modelUrl = detector.url;
  if (modelUrl) {
    try {
      // Le repérage compte pour un cinquième de l'avancement, la lecture pour le reste.
      const texts = await detectTexts(image, size, modelUrl, { signal: options.signal, onProgress: (value) => options.onProgress?.(value * 0.2) });
      const regions = await analyzeWithBoxes(reader, texts, settings, {
        createId: newId,
        onProgress: (value) => options.onProgress?.(0.2 + value * 0.8),
        signal: options.signal,
      });
      lastDetection = { used: "detector", found: texts.length };
      return regions;
    } catch (error) {
      if (isAbort(error)) throw error;
      // Le détecteur n'a pas pu tourner sur ce navigateur : l'analyse continue par les pixels, et on le dit.
      lastDetection = { used: "pixels", reason: error instanceof Error && error.message ? error.message : "le détecteur n’a pas pu démarrer" };
      console.info(`[scan-studio] détecteur indisponible, repérage par les pixels : ${lastDetection.reason}`);
    }
  } else {
    // Choisi mais pas encore téléchargé sur le serveur : on le dit, l'atelier propose de l'installer.
    lastDetection = detector.missing ? { used: "pixels", missing: true, reason: "son modèle n’est pas encore installé sur le serveur" } : { used: "pixels" };
  }
  return analyzeWithReader(reader, settings, {
    createId: newId,
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

/** Comment la dernière page a été repérée : par le détecteur, ou par les pixels (et pourquoi). */
export interface DetectionReport {
  used: "detector" | "pixels";
  /** Textes repérés par le détecteur, avant lecture. */
  found?: number;
  /** Pourquoi le détecteur n'a pas servi alors qu'il était choisi. */
  reason?: string;
  /** Le détecteur est choisi, mais son modèle n'est pas sur le serveur : il reste à le télécharger dans « Moteurs ». */
  missing?: boolean;
}

let lastDetection: DetectionReport = { used: "pixels" };
export const lastDetectionReport = (): DetectionReport => lastDetection;

/** Adresse du modèle choisi, gardée une minute : une analyse de chapitre ne la redemande pas à chaque page. */
let detectorCache: { at: number; url: string | null; missing: boolean } | null = null;
async function detectorChoice(): Promise<{ url: string | null; missing: boolean }> {
  if (detectorCache && Date.now() - detectorCache.at < 60_000) return detectorCache;
  try {
    const status = await api.getDetector();
    detectorCache = { at: Date.now(), url: status.modelUrl ?? null, missing: status.active !== "off" && !status.modelUrl };
  } catch {
    detectorCache = { at: Date.now(), url: null, missing: false };
  }
  return detectorCache;
}

/** À appeler quand le réglage du détecteur change : la prochaine analyse relit le choix. */
export function forgetDetectorChoice() {
  detectorCache = null;
}

/** Zones lues sur une image, dans l'ordre de lecture du format du chapitre. */
export const analyzeImage: AnalyzeImage = (image, settings, onProgress) => run(image, settings, { onProgress });

/** Même analyse, pour une image dont la taille diffère de celle que la page déclare. */
export function analyzeSurface(image: Surface, size: PageSize, settings: ChapterSettings, onProgress?: (progress: number) => void): Promise<ScanRegion[]> {
  return run(image, settings, { size, onProgress });
}

/**
 * Lit le texte d'un rectangle tracé à la main sur la page ouverte dans
 * l'atelier : même moteur que l'analyse, dans le navigateur, rien ne sort de
 * la machine. `null` : rien n'a pu être lu à cet endroit.
 */
export async function readZoneOnSurface(image: Surface, size: PageSize, zone: Rect, settings: ChapterSettings): Promise<ZoneReading | null> {
  return readZone(createBrowserReader(image, size, settings.sourceLanguage), zone, settings);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error("L’image de cette page n’a pas pu être chargée");
  }
  return image;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Analyse des pages enregistrées, une à la fois : lecture de la page, analyse,
 * fusion avec ses zones, enregistrement. Une zone corrigée à la main ou déjà
 * traduite n'est jamais retirée ni écrasée. Une page marquée « à laisser telle
 * quelle » (`skipped`) est passée sans être lue. Un `signal` interrompu arrête
 * le travail après la page en cours, sans rien enregistrer d'incomplet.
 */
export const analyzePages: AnalyzePages = async (pageIds, options = {}) => {
  const { replace = false, onProgress, signal } = options;
  const result: AnalyzePagesResult = { analyzed: 0, regions: 0, failed: [], untranslatable: [] };
  const report = (progress: AnalysisProgress) => onProgress?.(progress);

  for (const pageId of pageIds) {
    if (signal?.aborted) break;
    try {
      report({ pageId, step: "preparing", progress: 0 });
      const view = await api.getPage(pageId);
      // Couverture, bannière, page de crédits : la page est à laisser telle quelle, on n'y touche pas.
      if (view.page.skipped) {
        report({ pageId, step: "skipped", progress: 1, message: "Page à laisser telle quelle" });
        continue;
      }
      const settings = view.chapter.settings;
      const blocker = analysisBlocker(settings);
      if (blocker) {
        report({ pageId, step: "skipped", progress: 1, message: blocker });
        continue;
      }
      const image = await loadImage(view.imageUrl);
      if (signal?.aborted) break;

      const found = await run(image, settings, {
        size: view.page.source,
        signal,
        onProgress: (progress) => report({ pageId, step: "reading", progress: progress * 0.9 }),
      });
      const merged = mergeRegions(view.page.regions, found, { replace, format: settings.format });

      report({ pageId, step: "saving", progress: 0.95 });
      await api.savePage(pageId, {
        regions: merged.regions,
        // Une page déjà traduite ou relue ne redescend que si elle reçoit de nouvelles zones à traiter.
        status: view.page.status === "imported" || merged.added > 0 ? "analyzed" : view.page.status,
        revision: view.page.revision,
      });
      result.analyzed++;
      result.regions += merged.added;
      if (looksUntranslatable(merged.regions, view.page.source)) result.untranslatable.push(pageId);
      report({ pageId, step: "done", progress: 1, message: `${merged.added} zone${merged.added > 1 ? "s" : ""}` });
    } catch (error) {
      if (isAbort(error)) break;
      const message = error instanceof Error && error.message ? error.message : "Analyse impossible";
      result.failed.push({ pageId, error: message });
      report({ pageId, step: "error", progress: 1, message });
    }
  }
  return result;
};
