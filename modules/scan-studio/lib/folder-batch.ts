/**
 * Lot sur un dossier : lancer sur chaque chapitre d'un dossier une action qui
 * existe déjà pour un chapitre (analyser, traduire, exporter en `.cbz`).
 *
 * Le lot n'ajoute aucun moyen de travailler : il enchaîne. Trois règles :
 *
 * - **un chapitre à la fois**, dans l'ordre du dossier, jamais en parallèle ;
 * - **arrêtable** : l'arrêt demandé laisse finir ce qui est en cours et ne
 *   lance rien d'autre. Ce qui est fait reste fait ;
 * - **la traduction passe par le chemin d'un chapitre**, sans raccourci :
 *   `translateChapter`, donc une requête par page vers le routeur du serveur,
 *   qui garde ses écarts, son plafond et son disjoncteur (§ 7.5 du dossier).
 *   Dès qu'aucun moteur ne répond, le lot entier s'arrête : il ne passe pas au
 *   chapitre suivant pour réessayer.
 *
 * Rien ici ne dépend de React ni du navigateur : les appels au serveur et les
 * actions passent par `deps`, remplaçable dans les tests.
 */

import type { ChapterTranslationResult, TranslateChapterOptions } from "./translate-pages";
import type { AnalyzePages, AnalyzePagesResult } from "./analysis/contract";
import type { ChapterExportResult } from "./page-export";
import type { ChapterView, PageView, TranslationEngineId, TranslationEstimate } from "./types";
import { collectTexts, type CollectOptions } from "./translate-pages";

// ─── File d'attente ──────────────────────────────────────────────

export type BatchState = "waiting" | "running" | "done" | "skipped" | "error";

export interface BatchChapter {
  id: string;
  /** « Chapitre 12 ». */
  label: string;
}

/** Ce qu'une action dit d'un chapitre une fois passée. */
export interface BatchOutcome {
  state: "done" | "skipped" | "error";
  /** Une phrase : « 12 pages analysées », « Rien à traduire ». */
  detail: string;
  /** Présent : le lot ne doit pas continuer, pour cette raison (plus aucun moteur, par exemple). */
  halt?: string;
}

export interface BatchProgress {
  chapterId: string;
  /** Rang du chapitre dans le lot, à partir de zéro. */
  index: number;
  total: number;
  state: BatchState;
  detail?: string;
  /** Avancement du chapitre en cours, de 0 à 1, quand l'action sait le dire. */
  progress?: number;
}

export interface BatchResult {
  /** Une issue par chapitre traité, dans l'ordre. */
  chapters: (BatchOutcome & { chapterId: string })[];
  /** Pourquoi le lot s'est arrêté avant la fin. */
  stopped?: "aborted" | "halted";
  stopReason?: string;
  /** Chapitres qui n'ont pas été lancés. */
  remaining: string[];
}

export type BatchRunner = (
  chapter: BatchChapter,
  context: { signal?: AbortSignal; report: (detail: string, progress?: number) => void }
) => Promise<BatchOutcome>;

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Erreur inconnue.";
}

/**
 * Passe les chapitres l'un après l'autre dans `run`. Un chapitre en échec
 * n'arrête pas le lot, sauf si l'action le demande (`halt`). L'arrêt demandé
 * est regardé avant chaque chapitre.
 */
export async function runBatch(
  chapters: BatchChapter[],
  run: BatchRunner,
  options: { signal?: AbortSignal; onProgress?: (progress: BatchProgress) => void } = {}
): Promise<BatchResult> {
  const result: BatchResult = { chapters: [], remaining: [] };
  const total = chapters.length;

  for (let index = 0; index < total; index++) {
    const chapter = chapters[index];
    if (options.signal?.aborted) {
      result.stopped = "aborted";
      result.remaining = chapters.slice(index).map((entry) => entry.id);
      break;
    }

    const emit = (state: BatchState, detail?: string, progress?: number) =>
      options.onProgress?.({ chapterId: chapter.id, index, total, state, detail, progress });
    emit("running");

    let outcome: BatchOutcome;
    try {
      outcome = await run(chapter, { signal: options.signal, report: (detail, progress) => emit("running", detail, progress) });
    } catch (error) {
      outcome = { state: "error", detail: messageOf(error) };
    }
    result.chapters.push({ ...outcome, chapterId: chapter.id });
    emit(outcome.state, outcome.detail);

    if (outcome.halt) {
      result.stopped = "halted";
      result.stopReason = outcome.halt;
      result.remaining = chapters.slice(index + 1).map((entry) => entry.id);
      break;
    }
  }
  return result;
}

// ─── Actions ─────────────────────────────────────────────────────

const plural = (count: number, singular: string, many: string) => `${count} ${count < 2 ? singular : many}`;

/** Pages d'un chapitre sur lesquelles on travaille : celles « laissées telles quelles » sont écartées. */
function workPageIds(view: ChapterView): string[] {
  return view.pages.filter((page) => !page.skipped).map((page) => page.id);
}

export interface AnalyzeBatchDeps {
  getChapter: (chapterId: string) => Promise<ChapterView>;
  analyze: AnalyzePages;
  /** Pourquoi un chapitre ne peut pas être analysé automatiquement ; `null` s'il le peut. */
  blocker: (settings: ChapterView["chapter"]["settings"]) => string | null;
}

/** Analyse d'un chapitre du lot : la même que celle du bouton « Analyser » d'un chapitre. */
export function analyzeRunner(deps: AnalyzeBatchDeps, options: { replace?: boolean } = {}): BatchRunner {
  return async (chapter, { signal, report }) => {
    const view = await deps.getChapter(chapter.id);
    const blocked = deps.blocker(view.chapter.settings);
    if (blocked) return { state: "skipped", detail: blocked };
    const pageIds = workPageIds(view);
    if (pageIds.length === 0) return { state: "skipped", detail: "Aucune page à analyser" };

    let settled = 0;
    const outcome: AnalyzePagesResult = await deps.analyze(pageIds, {
      replace: options.replace,
      signal,
      onProgress: (progress) => {
        if (progress.step === "done" || progress.step === "skipped" || progress.step === "error") settled++;
        report(`Page ${Math.min(settled + 1, pageIds.length)} sur ${pageIds.length}`, settled / pageIds.length);
      },
    });
    const failed = outcome.failed.length > 0 ? `, ${plural(outcome.failed.length, "page en échec", "pages en échec")}` : "";
    return {
      state: outcome.analyzed === 0 && outcome.failed.length > 0 ? "error" : "done",
      detail: `${plural(outcome.analyzed, "page analysée", "pages analysées")}, ${plural(outcome.regions, "zone ajoutée", "zones ajoutées")}${failed}`,
    };
  };
}

export interface TranslateBatchDeps {
  getChapter: (chapterId: string) => Promise<ChapterView>;
  /** La traduction d'un chapitre, telle quelle : une requête par page vers le routeur. */
  translateChapter: (pageIds: string[], options?: TranslateChapterOptions) => Promise<ChapterTranslationResult>;
}

/**
 * Traduction d'un chapitre du lot : exactement celle du bouton « Traduire »
 * d'un chapitre. Si `translateChapter` s'arrête parce qu'aucun moteur ne
 * répond, le lot s'arrête avec lui (`halt`).
 */
export function translateRunner(deps: TranslateBatchDeps, options: { retranslate?: boolean } = {}): BatchRunner {
  return async (chapter, { signal, report }) => {
    const view = await deps.getChapter(chapter.id);
    // Le niveau maximal du chapitre borne ce qui peut partir (§ 3 du dossier).
    if (view.chapter.settings.maxLevel < 2) {
      return { state: "skipped", detail: "Le niveau de ce chapitre interdit la traduction automatique" };
    }
    const pageIds = workPageIds(view);
    if (pageIds.length === 0) return { state: "skipped", detail: "Aucune page à traduire" };

    const result = await deps.translateChapter(pageIds, {
      retranslate: options.retranslate,
      signal,
      onProgress: (progress) => report(`Page ${progress.index + 1} sur ${progress.total}`, progress.index / progress.total),
    });

    const summary =
      result.translatedPages === 0
        ? "Rien à traduire"
        : `${plural(result.translatedPages, "page traduite", "pages traduites")}, ${plural(result.translatedRegions, "zone", "zones")}`;
    if (result.stopped === "engines") {
      const reason = result.stopReason ?? "Aucun moteur de traduction ne répond.";
      return { state: "error", detail: reason, halt: reason };
    }
    if (result.failed.length > 0) {
      return { state: result.translatedPages > 0 ? "done" : "error", detail: `${summary}, ${plural(result.failed.length, "page en échec", "pages en échec")}` };
    }
    return { state: result.translatedPages === 0 ? "skipped" : "done", detail: summary };
  };
}

export interface RenderBatchDeps {
  getChapter: (chapterId: string) => Promise<ChapterView>;
  /** Le rendu des pages d'un chapitre (`exportChapterPages`), tel quel. */
  exportPages: (pageIds: string[], options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }) => Promise<ChapterExportResult>;
  describe: (result: ChapterExportResult) => string;
}

/** Rendu des pages d'un chapitre du lot : le même que le bouton « Exporter » de l'atelier, page après page. */
export function renderRunner(deps: RenderBatchDeps): BatchRunner {
  return async (chapter, { signal, report }) => {
    const view = await deps.getChapter(chapter.id);
    const pageIds = view.pages.map((page) => page.id);
    if (pageIds.length === 0) return { state: "skipped", detail: "Aucune page" };
    const result = await deps.exportPages(pageIds, {
      signal,
      onProgress: (done, total) => report(`Page ${Math.min(done + 1, total)} sur ${total}`, total === 0 ? 0 : done / total),
    });
    const detail = deps.describe(result);
    if (result.exported === 0 && result.failed > 0) return { state: "error", detail };
    return { state: result.exported === 0 ? "skipped" : "done", detail };
  };
}

// ─── Estimation d'un lot de traduction ───────────────────────────

/** Bornes d'un appel d'estimation, celles du serveur (`lib/server/translation/index.ts`). */
export const ESTIMATE_MAX_ITEMS = 400;
export const ESTIMATE_MAX_CHARACTERS = 200_000;

/** Découpe des phrases en paquets que le serveur accepte d'estimer en un appel. */
export function chunkTexts(texts: string[], maxItems = ESTIMATE_MAX_ITEMS, maxCharacters = ESTIMATE_MAX_CHARACTERS): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let characters = 0;
  for (const text of texts) {
    if (current.length > 0 && (current.length >= maxItems || characters + text.length > maxCharacters)) {
      chunks.push(current);
      current = [];
      characters = 0;
    }
    current.push(text);
    characters += text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Estime des phrases quel que soit leur nombre : un appel par paquet, les
 * totaux additionnés. Sert au chapitre comme au dossier.
 */
export async function estimateTexts(
  chapterId: string,
  texts: string[],
  estimate: (chapterId: string, texts: string[]) => Promise<TranslationEstimate>,
  signal?: AbortSignal
): Promise<TranslationEstimate> {
  const total: TranslationEstimate = { characters: 0, known: 0, toSend: 0 };
  for (const chunk of chunkTexts(texts)) {
    if (signal?.aborted) break;
    const part = await estimate(chapterId, chunk);
    total.characters += part.characters;
    total.known += part.known;
    total.toSend += part.toSend;
    total.engine ??= part.engine;
  }
  return total;
}

export interface FolderEstimate {
  /** Chapitres qui ont au moins une zone à envoyer. */
  chapters: number;
  /** Chapitres dont le niveau interdit la traduction automatique : ils ne partiront pas. */
  blockedChapters: number;
  pages: number;
  regions: number;
  characters: number;
  known: number;
  toSend: number;
  /** Moteur qui recevrait le lot, s'il y en a un de disponible. */
  engine?: TranslationEngineId;
  /** Pages qui n'ont pas pu être lues. */
  unreadable: number;
}

export interface EstimateDeps {
  getChapter: (chapterId: string) => Promise<ChapterView>;
  getPage: (pageId: string) => Promise<PageView>;
  estimateTranslation: (chapterId: string, texts: string[]) => Promise<TranslationEstimate>;
}

/**
 * Ce que traduire tout le dossier représente, avant de rien envoyer : pages,
 * zones, caractères. Les pages sont lues sur ce serveur, et le serveur estime
 * chapitre par chapitre (langues, glossaire et mémoire sont ceux du chapitre).
 * Aucun moteur n'est appelé.
 */
export async function estimateFolderTranslation(
  chapterIds: string[],
  deps: EstimateDeps,
  options: CollectOptions & { signal?: AbortSignal } = {}
): Promise<FolderEstimate> {
  const total: FolderEstimate = { chapters: 0, blockedChapters: 0, pages: 0, regions: 0, characters: 0, known: 0, toSend: 0, unreadable: 0 };

  for (const chapterId of chapterIds) {
    if (options.signal?.aborted) break;
    const view = await deps.getChapter(chapterId);
    if (view.chapter.settings.maxLevel < 2) {
      total.blockedChapters++;
      continue;
    }

    const texts: string[] = [];
    let pages = 0;
    for (const page of view.pages) {
      if (options.signal?.aborted) break;
      if (page.skipped) continue;
      try {
        const items = collectTexts((await deps.getPage(page.id)).page, options);
        if (items.length === 0) continue;
        pages++;
        for (const item of items) texts.push(item.text);
      } catch {
        total.unreadable++;
      }
    }
    if (texts.length === 0) continue;

    total.chapters++;
    total.pages += pages;
    total.regions += texts.length;
    for (const chunk of chunkTexts(texts)) {
      if (options.signal?.aborted) break;
      const estimate = await deps.estimateTranslation(chapterId, chunk);
      total.characters += estimate.characters;
      total.known += estimate.known;
      total.toSend += estimate.toSend;
      total.engine ??= estimate.engine;
    }
  }
  return total;
}
