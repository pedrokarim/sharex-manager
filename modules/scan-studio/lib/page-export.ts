/**
 * Rendu d'une page hors de l'atelier : la même chaîne que le bouton « Exporter »
 * (polices, fonds reconstruits, `renderPage`), sans scène ni historique. Sert à
 * rendre d'un coup toutes les pages d'un chapitre, ou d'un dossier.
 *
 * Tout se passe dans le navigateur, une page à la fois.
 */

import { usedFontFamilies } from "./custom-fonts";
import { ensureCustomFonts, ensureFonts, nearestWeight } from "./fonts";
import { computeInpaintPatch, createPixelReader } from "./inpaint-patch";
import { awaitsTranslation, renderPage, type InpaintPatch } from "./render";
import type { PageSummary, PageView, ScanPage, UploadedFile } from "./types";

/** Nom du fichier exporté : celui de la page, marqué de la langue cible. */
export function exportNameOf(pageName: string, targetLanguage: string): string {
  const base = pageName.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._ -]+/gu, "_").trim() || "page";
  const suffix = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(targetLanguage) ? targetLanguage.toLowerCase() : "traduit";
  return `${base}-${suffix}.png`;
}

/** Pourquoi une page n'est pas rendue par un lot, ou `null` si elle l'est. */
export function exportSkipReason(page: Pick<ScanPage, "regions" | "skipped">): "set-aside" | "no-region" | "untranslated" | null {
  if (page.skipped) return "set-aside";
  if (page.regions.length === 0) return "no-region";
  // Une page dont aucune zone n'est traduite sortirait identique à l'original.
  if (page.regions.every((region) => !region.translation.text.trim())) return "untranslated";
  return null;
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Interrompu", "AbortError"));
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("L’image de la page n’a pas pu être chargée"));
    signal?.addEventListener("abort", () => reject(new DOMException("Interrompu", "AbortError")), { once: true });
    image.src = url;
  });
}

/** Rend une page à sa taille réelle, comme le fait l'atelier, et rend le PNG. */
export async function renderPageExport(view: PageView, signal?: AbortSignal): Promise<Blob> {
  const { page } = view;
  const settings = view.chapter.settings;
  const image = await loadImage(view.imageUrl, signal);

  await ensureFonts();
  // Une police ajoutée qui ne se charge pas donnerait un rendu différent de l'aperçu : on s'arrête.
  const unloaded = (await ensureCustomFonts(usedFontFamilies(page.regions, settings))).filter((failure) => failure.name);
  if (unloaded.length > 0) throw new Error(`La police « ${unloaded[0].name} » n’a pas pu être chargée : ${unloaded[0].reason}`);

  // Les fonds reconstruits, zone après zone ; une zone qui n'aboutit pas garde son aplat, comme dans l'atelier.
  const readPixels = createPixelReader(image, page.source);
  const patches = new Map<string, InpaintPatch>();
  const running = signal ?? new AbortController().signal;
  for (const region of page.regions) {
    if (running.aborted) throw new DOMException("Interrompu", "AbortError");
    if (region.mask.kind !== "inpaint" || awaitsTranslation(region) || region.outline.length < 3) continue;
    const outcome = await computeInpaintPatch(region, page.source, readPixels, running);
    if (outcome.patch) patches.set(region.id, outcome.patch);
  }
  if (running.aborted) throw new DOMException("Interrompu", "AbortError");

  const canvas = document.createElement("canvas");
  canvas.width = page.source.width;
  canvas.height = page.source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cette page est trop grande pour être rendue par le navigateur");
  ctx.imageSmoothingQuality = "high";
  renderPage(ctx, page.source, image, page.regions, settings, {
    view: "translated",
    resolveWeight: nearestWeight,
    resolveInpaint: (region) => patches.get(region.id) ?? null,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Cette page est trop grande pour être rendue par le navigateur");
  return blob;
}

// ─── Tout un chapitre ────────────────────────────────────────────

export interface ChapterExportDeps {
  getPage: (pageId: string) => Promise<PageView>;
  render: (view: PageView, signal?: AbortSignal) => Promise<Blob>;
  upload: (blob: Blob, name: string) => Promise<UploadedFile>;
  register: (pageId: string, file: string) => Promise<PageSummary>;
}

export interface ChapterExportResult {
  /** Pages rendues et déclarées. */
  exported: number;
  /** Pages laissées de côté, et pourquoi. */
  setAside: number;
  withoutRegion: number;
  untranslated: number;
  /** Pages dont le rendu a échoué, avec la raison de la première. */
  failed: number;
  firstError?: string;
  /** Le lot a été arrêté avant la fin. */
  aborted: boolean;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Rend les pages d'un chapitre l'une après l'autre. Une page en échec n'arrête
 * pas les suivantes ; l'arrêt demandé est regardé avant chaque page.
 */
export async function exportChapterPages(
  pageIds: string[],
  deps: ChapterExportDeps,
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}
): Promise<ChapterExportResult> {
  const result: ChapterExportResult = { exported: 0, setAside: 0, withoutRegion: 0, untranslated: 0, failed: 0, aborted: false };
  const total = pageIds.length;
  for (let index = 0; index < total; index++) {
    if (options.signal?.aborted) {
      result.aborted = true;
      break;
    }
    options.onProgress?.(index, total);
    try {
      const view = await deps.getPage(pageIds[index]);
      const reason = exportSkipReason(view.page);
      if (reason === "set-aside") result.setAside++;
      else if (reason === "no-region") result.withoutRegion++;
      else if (reason === "untranslated") result.untranslated++;
      else {
        const blob = await deps.render(view, options.signal);
        const uploaded = await deps.upload(blob, exportNameOf(view.page.name, view.chapter.settings.targetLanguage));
        await deps.register(view.page.id, uploaded.file);
        result.exported++;
      }
    } catch (error) {
      if (isAbort(error) || options.signal?.aborted) {
        result.aborted = true;
        break;
      }
      result.failed++;
      result.firstError ??= error instanceof Error && error.message ? error.message : "Erreur inconnue.";
    }
  }
  if (!result.aborted) options.onProgress?.(total, total);
  return result;
}

/** Une phrase qui dit ce qu'un rendu en lot a fait. */
export function describeChapterExport(result: ChapterExportResult): string {
  const count = (value: number, one: string, many: string) => `${value} ${value < 2 ? one : many}`;
  const parts = [count(result.exported, "page rendue", "pages rendues")];
  if (result.untranslated > 0) parts.push(count(result.untranslated, "sans traduction", "sans traduction"));
  if (result.withoutRegion > 0) parts.push(count(result.withoutRegion, "sans zone", "sans zone"));
  if (result.setAside > 0) parts.push(count(result.setAside, "laissée telle quelle", "laissées telles quelles"));
  if (result.failed > 0) parts.push(`${count(result.failed, "en échec", "en échec")}${result.firstError ? ` (${result.firstError})` : ""}`);
  return parts.join(", ");
}
