"use client";

/**
 * Analyse automatique d'une page, dans le navigateur : premier niveau de
 * l'échelle de recours (§ 3 du dossier). Texte source anglais, lu localement,
 * sans IA générative et sans rien envoyer à un service.
 *
 * Ce fichier fait le lien entre le navigateur (canevas, moteur de lecture,
 * fonctions serveur) et la chaîne d'analyse de `pipeline.ts`, qui ne connaît
 * ni l'un ni l'autre. Il implémente `contract.ts`.
 */

import { api, newId } from "../client";
import type { Rect } from "../geometry";
import type { ChapterSettings, ScanRegion } from "../types";
import type { AnalyzeImage, AnalyzePages, AnalyzePagesResult, AnalysisProgress } from "./contract";
import { recognize } from "./engine";
import { mergeRegions } from "./merge";
import { analyzeWithReader, type PageReader, type ReadOptions } from "./pipeline";
import type { PageSize } from "./words";

export type * from "./contract";
export { REVIEW_CONFIDENCE } from "./words";
export { isProtectedRegion, mergeRegions, needsReview } from "./merge";
export { READING_ENGINE } from "./regions";
export { releaseEngine } from "./engine";
import { looksUntranslatable } from "./untranslatable";

export { isTranslatableRegion, looksUntranslatable } from "./untranslatable";

type Surface = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function sizeOf(image: Surface): PageSize {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return { width: image.width, height: image.height };
}

/** Pourquoi ce chapitre ne peut pas être analysé automatiquement ; `null` s'il le peut. */
export function analysisBlocker(settings: ChapterSettings): string | null {
  if (settings.maxLevel < 1) {
    return "Ce chapitre est réglé sur le niveau 0 (tout à la main) : l’analyse automatique y est coupée. Le niveau se change dans les réglages du chapitre.";
  }
  if (settings.sourceLanguage !== "en" && settings.sourceLanguage !== "auto") {
    return "L’analyse automatique ne sait lire que l’anglais pour l’instant. Les autres langues se tracent et se saisissent à la main.";
  }
  return null;
}

/**
 * Lecteur de page du navigateur : découpe l'image sur un canevas, la donne au
 * moteur. `size` est la taille de la page ; l'image peut en avoir une autre.
 */
function createBrowserReader(image: Surface, size: PageSize): PageReader {
  const natural = sizeOf(image);
  const scaleX = natural.width / size.width;
  const scaleY = natural.height / size.height;

  /** Canevas neuf, prêt à recevoir un rectangle de la page. */
  const createCanvas = (width: number, height: number): CanvasRenderingContext2D => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Cette page est trop grande pour être lue par le navigateur");
    ctx.imageSmoothingQuality = "high";
    return ctx;
  };

  return {
    size,
    async read(rect: Rect, options: ReadOptions, onProgress) {
      const width = Math.max(1, Math.round(rect.width * options.scale));
      const height = Math.max(1, Math.round(rect.height * options.scale));
      // Une image tournée déborde de son rectangle : le canevas prend sa boîte englobante.
      const angle = (options.rotate * Math.PI) / 180;
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      const canvasWidth = Math.ceil(width * cos + height * sin);
      const canvasHeight = Math.ceil(width * sin + height * cos);
      const ctx = createCanvas(canvasWidth, canvasHeight);
      // Le fond du canevas prend la teinte du papier : blanc, ou noir pour un texte clair.
      ctx.fillStyle = options.invert ? "#000000" : "#ffffff";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(angle);
      ctx.drawImage(image, rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY, -width / 2, -height / 2, width, height);
      // Le texte voisin qui dépasse dans le rectangle est recouvert de la teinte du papier.
      for (const patch of options.erase ?? []) {
        ctx.fillRect(-width / 2 + (patch.x - rect.x) * options.scale, -height / 2 + (patch.y - rect.y) * options.scale, patch.width * options.scale, patch.height * options.scale);
      }
      if (options.invert) {
        // « Différence » avec du blanc : le négatif, sans dépendre des filtres du canevas.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
      return recognize(ctx.canvas, options.mode, onProgress);
    },
    pixels(rect: Rect) {
      const x = clamp(Math.floor(rect.x), 0, size.width - 1);
      const y = clamp(Math.floor(rect.y), 0, size.height - 1);
      const width = clamp(Math.ceil(rect.x + rect.width) - x, 1, size.width - x);
      const height = clamp(Math.ceil(rect.y + rect.height) - y, 1, size.height - y);
      try {
        const ctx = createCanvas(width, height);
        ctx.drawImage(image, x * scaleX, y * scaleY, width * scaleX, height * scaleY, 0, 0, width, height);
        return { pixels: ctx.getImageData(0, 0, width, height), offset: { x, y } };
      } catch {
        // Rectangle trop grand pour un canevas, ou image d'une autre origine.
        return null;
      }
    },
  };
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
  return analyzeWithReader(createBrowserReader(image, size), settings, {
    createId: newId,
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

/** Zones lues sur une image, dans l'ordre de lecture du format du chapitre. */
export const analyzeImage: AnalyzeImage = (image, settings, onProgress) => run(image, settings, { onProgress });

/** Même analyse, pour une image dont la taille diffère de celle que la page déclare. */
export function analyzeSurface(image: Surface, size: PageSize, settings: ChapterSettings, onProgress?: (progress: number) => void): Promise<ScanRegion[]> {
  return run(image, settings, { size, onProgress });
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
