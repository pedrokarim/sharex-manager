/**
 * Traduction des pages, côté navigateur (§ 7.5 du dossier).
 *
 * Le serveur ne touche pas aux pages : il rend des textes. Ce fichier choisit
 * les zones à traduire, les envoie en un seul appel par page, pose les
 * réponses dans les zones et enregistre la page.
 *
 * Règle du dossier : ne jamais marteler une API. Rien ici ne se lance tout
 * seul, les pages passent l'une après l'autre, et un lot s'arrête dès qu'aucun
 * moteur ne répond au lieu d'insister page après page.
 *
 * La sélection des zones et la pose des résultats sont des fonctions pures ;
 * les appels au serveur passent par `deps`, remplaçable dans les tests.
 */

import { api } from "./client";
import type {
  PageStatus,
  RegionKind,
  ScanRegion,
  TranslationBatch,
  TranslationEngineId,
  TranslationItem,
  TranslationResult,
} from "./types";

// ─── Sélection des zones ─────────────────────────────────────────

/** Onomatopées et texte du décor : repérés, laissés tels quels par défaut (§ 6.1). */
export const SKIPPED_KINDS: RegionKind[] = ["sfx", "background"];

export interface CollectOptions {
  /** Reprend aussi les zones déjà proposées. Les zones corrigées ou validées ne sont jamais reprises. */
  retranslate?: boolean;
  /** Types de zones laissés de côté ; par défaut les onomatopées et le texte du décor. */
  skipKinds?: RegionKind[];
}

/** La zone porte un texte à traduire : son type est traité et sa lecture n'est pas vide. */
export function isTranslatable(region: ScanRegion, skipKinds: RegionKind[] = SKIPPED_KINDS): boolean {
  return !skipKinds.includes(region.kind) && region.reading.clean.trim().length > 0;
}

/** Une zone corrigée à la main ou validée ne se réécrit jamais. */
export function isLocked(region: ScanRegion): boolean {
  return region.translation.status === "edited" || region.translation.status === "approved";
}

/** Zones à envoyer, dans l'ordre de lecture de la page. */
export function collectTexts(page: { regions: ScanRegion[] }, options: CollectOptions = {}): TranslationItem[] {
  const items: TranslationItem[] = [];
  for (const region of page.regions) {
    if (!isTranslatable(region, options.skipKinds) || isLocked(region)) continue;
    if (region.translation.status !== "todo" && !options.retranslate) continue;
    items.push({ id: region.id, text: region.reading.clean.trim() });
  }
  return items;
}

// ─── Pose des résultats ──────────────────────────────────────────

/** Ce que la zone retient de l'origine d'un texte : le moteur, sinon le glossaire ou la mémoire. */
export function engineLabelOf(result: TranslationResult): string {
  return result.engine ?? result.source;
}

/**
 * Pose les traductions rendues dans leurs zones, sans modifier les zones
 * reçues. L'ancien texte part dans l'historique. Une zone corrigée ou validée
 * n'est jamais touchée, même si le serveur rend un texte pour elle.
 */
export function applyTranslations(
  regions: ScanRegion[],
  results: TranslationResult[],
  now: number
): { regions: ScanRegion[]; applied: number } {
  const byId = new Map(results.map((result) => [result.id, result]));
  let applied = 0;
  const next = regions.map((region) => {
    const result = byId.get(region.id);
    if (!result || isLocked(region)) return region;
    const text = result.text.trim();
    if (!text) return region;
    const engine = engineLabelOf(result);
    const previous = region.translation;
    applied++;
    // La même proposition, rendue par le cache : rien à ranger dans l'historique.
    const history =
      previous.text && previous.text !== text
        ? [...previous.history, { text: previous.text, engine: previous.engine ?? "manual", at: now }]
        : previous.history;
    return { ...region, translation: { text, status: "proposed" as const, engine, history } };
  });
  return { regions: next, applied };
}

/** Toutes les zones à traduire de la page portent un texte, et il y en a au moins une. */
export function isFullyTranslated(regions: ScanRegion[], skipKinds: RegionKind[] = SKIPPED_KINDS): boolean {
  const translatable = regions.filter((region) => isTranslatable(region, skipKinds));
  return translatable.length > 0 && translatable.every((region) => region.translation.text.trim().length > 0);
}

/**
 * État à enregistrer avec la page : « traduite » quand tout l'est, sans jamais
 * faire reculer une page déjà relue ou exportée. `undefined` : ne rien changer.
 */
export function statusAfterTranslation(current: PageStatus, regions: ScanRegion[]): PageStatus | undefined {
  if (current !== "imported" && current !== "analyzed") return undefined;
  return isFullyTranslated(regions) ? "translated" : undefined;
}

/** Aucun moteur n'a pu répondre pour une partie du lot : inutile d'envoyer la page suivante. */
export function enginesUnavailable(batch: TranslationBatch): boolean {
  return batch.failed.length > 0;
}

// ─── Une page ────────────────────────────────────────────────────

/** Les seules fonctions serveur dont la traduction d'une page a besoin. */
export type TranslateDeps = Pick<typeof api, "getPage" | "translateTexts" | "savePage">;

export type TranslateStep = "reading" | "translating" | "saving" | "done" | "skipped" | "error";

export interface TranslateProgress {
  pageId: string;
  /** Rang de la page dans le lot, à partir de zéro. */
  index: number;
  total: number;
  step: TranslateStep;
  /** Présent aux étapes finales : `done`, `skipped`, `error`. */
  outcome?: PageTranslationOutcome;
}

export interface TranslatePageOptions extends CollectOptions {
  /** Impose un moteur, par exemple pour redemander au principal ce que le secours a traduit. */
  engine?: TranslationEngineId;
  /** Ignore le cache du serveur : la phrase est réellement renvoyée au moteur. */
  force?: boolean;
  signal?: AbortSignal;
  /** Suivi des étapes de la page. */
  onStep?: (step: TranslateStep) => void;
  /** Horloge, pour les tests. */
  now?: () => number;
  deps?: TranslateDeps;
}

export interface PageTranslationOutcome {
  pageId: string;
  /** `done` : la page a été traitée ; `skipped` : rien à traduire, aucun appel ; `error` : rien n'a été enregistré. */
  state: "done" | "skipped" | "error";
  /** Zones envoyées au routeur. */
  requested: number;
  /** Zones qui ont reçu une traduction. */
  translated: number;
  /** Zones restées sans traduction : aucun moteur n'a pu répondre. */
  failed: { id: string; error: string }[];
  fallback?: TranslationBatch["fallback"];
  /** Caractères réellement envoyés à un moteur. */
  sentCharacters: number;
  /** L'appel au routeur lui-même a échoué, ou a rendu des phrases sans réponse : le lot doit s'arrêter. */
  enginesDown: boolean;
  /** L'utilisateur a demandé l'arrêt avant que la page ne parte. */
  aborted?: boolean;
  error?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Erreur inconnue.";
}

function emptyOutcome(pageId: string, state: PageTranslationOutcome["state"]): PageTranslationOutcome {
  return { pageId, state, requested: 0, translated: 0, failed: [], sentCharacters: 0, enginesDown: false };
}

/**
 * Traduit une page : une lecture, un seul appel au routeur pour toutes ses
 * zones, un enregistrement avec la révision qu'on vient de lire. Ne lève
 * pas : l'issue dit ce qui s'est passé.
 */
export async function translatePage(pageId: string, options: TranslatePageOptions = {}): Promise<PageTranslationOutcome> {
  const deps = options.deps ?? api;
  const now = options.now ?? Date.now;
  const aborted = (): PageTranslationOutcome => ({ ...emptyOutcome(pageId, "skipped"), aborted: true });

  if (options.signal?.aborted) return aborted();
  options.onStep?.("reading");

  let view: Awaited<ReturnType<TranslateDeps["getPage"]>>;
  try {
    view = await deps.getPage(pageId);
  } catch (error) {
    return { ...emptyOutcome(pageId, "error"), error: messageOf(error) };
  }

  // Une page laissée telle quelle (couverture, bannière) n'est jamais traduite.
  if (view.page.skipped) return emptyOutcome(pageId, "skipped");
  const items = collectTexts(view.page, options);
  if (items.length === 0) return emptyOutcome(pageId, "skipped");
  // Dernier moment pour renoncer : passé ce point, le texte est parti.
  if (options.signal?.aborted) return aborted();

  options.onStep?.("translating");
  let batch: TranslationBatch;
  try {
    const routing = options.engine || options.force ? { engine: options.engine, force: options.force } : undefined;
    batch = await deps.translateTexts(view.page.chapterId, items, routing);
  } catch (error) {
    // On ne sait pas pourquoi le routeur a refusé : dans le doute, on n'insiste pas.
    return { ...emptyOutcome(pageId, "error"), requested: items.length, enginesDown: true, error: messageOf(error) };
  }

  const outcome: PageTranslationOutcome = {
    pageId,
    state: "done",
    requested: items.length,
    translated: 0,
    failed: batch.failed,
    fallback: batch.fallback,
    sentCharacters: batch.sentCharacters,
    enginesDown: enginesUnavailable(batch),
  };

  const { regions, applied } = applyTranslations(view.page.regions, batch.results, now());
  outcome.translated = applied;
  if (applied === 0) {
    if (batch.failed.length > 0) return { ...outcome, state: "error", error: batch.failed[0].error };
    return outcome;
  }

  // Une réponse payée s'enregistre toujours, même si l'arrêt a été demandé entre-temps.
  options.onStep?.("saving");
  try {
    await deps.savePage(pageId, {
      regions,
      status: statusAfterTranslation(view.page.status, regions),
      revision: view.page.revision,
    });
  } catch (error) {
    return { ...outcome, state: "error", translated: 0, error: messageOf(error) };
  }
  return outcome;
}

// ─── Un chapitre ─────────────────────────────────────────────────

export interface TranslateChapterOptions extends Omit<TranslatePageOptions, "onStep"> {
  onProgress?: (progress: TranslateProgress) => void;
}

export interface ChapterTranslationResult {
  /** Une issue par page traitée, dans l'ordre. */
  pages: PageTranslationOutcome[];
  /** Pages dont au moins une zone a été traduite et enregistrée. */
  translatedPages: number;
  translatedRegions: number;
  sentCharacters: number;
  /** Bascules sur le moteur de secours, sans doublon. */
  fallbacks: NonNullable<TranslationBatch["fallback"]>[];
  /** Pages en échec, avec leur raison. */
  failed: { pageId: string; error: string }[];
  /** Pourquoi le lot s'est arrêté avant la fin : arrêt demandé, ou plus aucun moteur. */
  stopped?: "aborted" | "engines";
  stopReason?: string;
  /** Pages qui n'ont pas été envoyées. */
  remaining: string[];
}

/**
 * Traduit des pages l'une après l'autre, jamais en parallèle. S'arrête
 * proprement si l'arrêt est demandé, ou dès qu'aucun moteur ne répond : les
 * pages déjà traduites le restent, les autres attendent une relance à la main.
 */
export async function translateChapter(pageIds: string[], options: TranslateChapterOptions = {}): Promise<ChapterTranslationResult> {
  const { onProgress, ...pageOptions } = options;
  const result: ChapterTranslationResult = {
    pages: [],
    translatedPages: 0,
    translatedRegions: 0,
    sentCharacters: 0,
    fallbacks: [],
    failed: [],
    remaining: [],
  };

  for (let index = 0; index < pageIds.length; index++) {
    const pageId = pageIds[index];
    if (options.signal?.aborted) {
      result.stopped = "aborted";
      result.remaining = pageIds.slice(index);
      break;
    }

    const report = (step: TranslateStep, outcome?: PageTranslationOutcome) => onProgress?.({ pageId, index, total: pageIds.length, step, outcome });
    const outcome = await translatePage(pageId, { ...pageOptions, onStep: (step) => report(step) });

    if (outcome.aborted) {
      result.stopped = "aborted";
      result.remaining = pageIds.slice(index);
      break;
    }

    result.pages.push(outcome);
    result.sentCharacters += outcome.sentCharacters;
    if (outcome.translated > 0) {
      result.translatedPages++;
      result.translatedRegions += outcome.translated;
    }
    if (outcome.fallback && !result.fallbacks.some((entry) => entry.from === outcome.fallback?.from && entry.to === outcome.fallback?.to)) {
      result.fallbacks.push(outcome.fallback);
    }
    if (outcome.state === "error") result.failed.push({ pageId, error: outcome.error ?? "Erreur inconnue." });
    report(outcome.state, outcome);

    if (outcome.enginesDown) {
      result.stopped = "engines";
      result.stopReason = outcome.error ?? outcome.failed[0]?.error;
      result.remaining = pageIds.slice(index + 1);
      break;
    }
  }
  return result;
}

// ─── Avant un lot ────────────────────────────────────────────────

export interface ChapterTexts {
  /** Pages qui ont au moins une zone à envoyer. */
  pages: { pageId: string; items: TranslationItem[] }[];
  /** Toutes les phrases du lot, pour l'estimation. */
  texts: string[];
  regionCount: number;
  /** Pages qui n'ont pas pu être lues. */
  unreadable: string[];
}

/**
 * Lit les pages (aucun moteur n'est appelé) et rassemble ce qu'un lot
 * enverrait : de quoi demander une estimation avant de confirmer.
 */
export async function collectChapterTexts(
  pageIds: string[],
  options: CollectOptions & { signal?: AbortSignal; deps?: Pick<TranslateDeps, "getPage"> } = {}
): Promise<ChapterTexts> {
  const deps = options.deps ?? api;
  const collected: ChapterTexts = { pages: [], texts: [], regionCount: 0, unreadable: [] };
  for (const pageId of pageIds) {
    if (options.signal?.aborted) break;
    try {
      const view = await deps.getPage(pageId);
      if (view.page.skipped) continue;
      const items = collectTexts(view.page, options);
      if (items.length === 0) continue;
      collected.pages.push({ pageId, items });
      collected.regionCount += items.length;
      for (const item of items) collected.texts.push(item.text);
    } catch {
      collected.unreadable.push(pageId);
    }
  }
  return collected;
}
