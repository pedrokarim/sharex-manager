"use client";

/**
 * Traitements d'un chapitre lancés en arrière-plan : l'analyse ou la
 * traduction d'une sélection de pages.
 *
 * Le travail tourne dans l'onglet, hors de toute fenêtre : on peut la fermer,
 * ouvrir une page dans l'atelier, revenir au chapitre, il continue. La planche
 * du chapitre s'abonne à ce suivi pour montrer l'état de chaque page (en
 * attente, en cours, traitée, en échec). Fermer l'onglet l'arrête : ce qui est
 * déjà enregistré reste enregistré.
 *
 * Un seul traitement à la fois par chapitre.
 */

import { useSyncExternalStore } from "react";
import type { AnalysisProgress, AnalyzePagesResult } from "./analysis/contract";
import type { ChapterTranslationResult, TranslateProgress } from "./translate-pages";

export type ChapterJobKind = "analyze" | "translate";
/** Où en est une page du traitement. */
export type PageJobState = "queued" | "running" | "done" | "skipped" | "error";

export interface PageJob {
  state: PageJobState;
  /** Ce qui se passe, ou ce qui s'est passé : « Lecture… », « 6 zones traduites ». */
  detail?: string;
}

export interface ChapterJob {
  chapterId: string;
  kind: ChapterJobKind;
  /** Pages du traitement, dans l'ordre où elles passent. */
  order: string[];
  pages: Record<string, PageJob>;
  running: boolean;
  /** L'arrêt est demandé : la page en cours finit, les suivantes ne partent pas. */
  stopping: boolean;
  /** Une phrase qui dit ce qui a été fait, une fois le traitement fini. */
  summary?: string;
  /** Le traitement s'est interrompu sur une erreur. */
  failure?: string;
  /** Analyse : pages qui semblent n'avoir rien à traduire (couvertures, bannières). */
  untranslatable?: string[];
}

// ─── Fonctions pures : ce que les tests exercent ─────────────────

export function createJob(chapterId: string, kind: ChapterJobKind, pageIds: string[]): ChapterJob {
  return {
    chapterId,
    kind,
    order: [...pageIds],
    pages: Object.fromEntries(pageIds.map((id) => [id, { state: "queued" as const }])),
    running: true,
    stopping: false,
  };
}

function withPage(job: ChapterJob, pageId: string, page: PageJob): ChapterJob {
  if (!(pageId in job.pages)) return job;
  return { ...job, pages: { ...job.pages, [pageId]: page } };
}

const ANALYSIS_DETAILS: Partial<Record<AnalysisProgress["step"], string>> = {
  preparing: "Préparation…",
  reading: "Repérage et lecture…",
  saving: "Enregistrement…",
  done: "Analysée",
  skipped: "Passée",
  error: "Échec",
};

export function applyAnalysisProgress(job: ChapterJob, progress: AnalysisProgress): ChapterJob {
  const state: PageJobState = progress.step === "done" ? "done" : progress.step === "skipped" ? "skipped" : progress.step === "error" ? "error" : "running";
  return withPage(job, progress.pageId, { state, detail: progress.message || ANALYSIS_DETAILS[progress.step] });
}

const TRANSLATION_DETAILS: Partial<Record<TranslateProgress["step"], string>> = {
  reading: "Lecture de la page…",
  translating: "Traduction…",
  saving: "Enregistrement…",
};

const count = (value: number, one: string, many: string) => `${value} ${value < 2 ? one : many}`;

export function applyTranslationProgress(job: ChapterJob, progress: TranslateProgress): ChapterJob {
  const outcome = progress.outcome;
  if (!outcome) return withPage(job, progress.pageId, { state: "running", detail: TRANSLATION_DETAILS[progress.step] });
  if (outcome.state === "skipped") return withPage(job, progress.pageId, { state: "skipped", detail: "Rien à traduire" });
  if (outcome.state === "error") return withPage(job, progress.pageId, { state: "error", detail: outcome.error ?? "Échec" });
  const missing = outcome.failed.length > 0 ? `, ${count(outcome.failed.length, "zone sans réponse", "zones sans réponse")}` : "";
  return withPage(job, progress.pageId, { state: "done", detail: `${count(outcome.translated, "zone traduite", "zones traduites")}${missing}` });
}

/**
 * Fin d'un traitement. Une page restée « en cours » n'a rien d'enregistré : elle
 * repasse en attente, comme celles qui n'ont pas eu leur tour.
 */
function settle(job: ChapterJob, extra: Partial<ChapterJob>): ChapterJob {
  const pages = Object.fromEntries(Object.entries(job.pages).map(([id, page]) => [id, page.state === "running" ? { state: "queued" as const } : page]));
  return { ...job, ...extra, pages, running: false };
}

export function finishAnalysis(job: ChapterJob, result: AnalyzePagesResult): ChapterJob {
  let next = job;
  // Une page en échec garde sa raison, même si l'analyse ne l'a pas signalée en cours de route.
  for (const failure of result.failed) next = withPage(next, failure.pageId, { state: "error", detail: failure.error });
  const left = countStates(next).queued + countStates(next).running;
  const parts = [count(result.analyzed, "page analysée", "pages analysées"), count(result.regions, "zone ajoutée", "zones ajoutées")];
  if (result.failed.length > 0) parts.push(count(result.failed.length, "page en échec", "pages en échec"));
  if (job.stopping && left > 0) parts.push(count(left, "page non analysée", "pages non analysées"));
  return settle(next, { summary: `${job.stopping ? "Analyse arrêtée" : "Analyse terminée"} : ${parts.join(", ")}.`, untranslatable: result.untranslatable.filter((id) => id in job.pages) });
}

export function finishTranslation(job: ChapterJob, result: ChapterTranslationResult): ChapterJob {
  const left = countStates(job).queued + countStates(job).running;
  const parts = [result.translatedPages === 0 ? "rien à traduire" : `${count(result.translatedPages, "page traduite", "pages traduites")}, ${count(result.translatedRegions, "zone", "zones")}`];
  if (result.failed.length > 0) parts.push(count(result.failed.length, "page en échec", "pages en échec"));
  if (job.stopping && left > 0) parts.push(count(left, "page non traduite", "pages non traduites"));
  const halted = result.stopped === "engines";
  const head = halted ? "Traduction interrompue" : job.stopping ? "Traduction arrêtée" : "Traduction terminée";
  return settle(job, { summary: `${head} : ${parts.join(", ")}.`, ...(halted ? { failure: result.stopReason ?? "Aucun moteur de traduction ne répond." } : {}) });
}

export function failJob(job: ChapterJob, message: string): ChapterJob {
  return settle(job, { summary: job.kind === "analyze" ? "L’analyse s’est interrompue." : "La traduction s’est interrompue.", failure: message });
}

export function countStates(job: ChapterJob): Record<PageJobState, number> {
  const totals: Record<PageJobState, number> = { queued: 0, running: 0, done: 0, skipped: 0, error: 0 };
  for (const id of job.order) totals[job.pages[id]?.state ?? "queued"]++;
  return totals;
}

/** Pages dont le sort est réglé, sur le total : l'avancement du traitement. */
export function jobProgress(job: ChapterJob): { settled: number; total: number } {
  const totals = countStates(job);
  return { settled: totals.done + totals.skipped + totals.error, total: job.order.length };
}

// ─── Suivi, partagé par les pages de l'onglet ────────────────────

const jobs = new Map<string, ChapterJob>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function publish(job: ChapterJob) {
  jobs.set(job.chapterId, job);
  for (const listener of listeners) listener();
}

function update(chapterId: string, change: (job: ChapterJob) => ChapterJob) {
  const current = jobs.get(chapterId);
  if (current) publish(change(current));
}

export function getChapterJob(chapterId: string): ChapterJob | null {
  return jobs.get(chapterId) ?? null;
}

export function subscribeChapterJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Un traitement tourne-t-il quelque part dans l'onglet ? Sert à retenir la fermeture de l'onglet. */
export function anyChapterJobRunning(): boolean {
  for (const job of jobs.values()) if (job.running) return true;
  return false;
}

export interface AnalysisRunner {
  (pageIds: string[], options: { replace?: boolean; onProgress?: (progress: AnalysisProgress) => void; signal?: AbortSignal }): Promise<AnalyzePagesResult>;
}
export interface TranslationRunner {
  (pageIds: string[], options: { retranslate?: boolean; onProgress?: (progress: TranslateProgress) => void; signal?: AbortSignal }): Promise<ChapterTranslationResult>;
}

function begin(chapterId: string, kind: ChapterJobKind, pageIds: string[]): AbortController | null {
  if (pageIds.length === 0 || jobs.get(chapterId)?.running) return null;
  const controller = new AbortController();
  controllers.set(chapterId, controller);
  publish(createJob(chapterId, kind, pageIds));
  return controller;
}

/** Lance l'analyse d'une sélection de pages. Rend `false` si un traitement tourne déjà sur ce chapitre. */
export function startAnalysisJob(chapterId: string, pageIds: string[], options: { replace?: boolean }, analyze: AnalysisRunner): boolean {
  const controller = begin(chapterId, "analyze", pageIds);
  if (!controller) return false;
  void analyze(pageIds, { replace: options.replace, signal: controller.signal, onProgress: (progress) => update(chapterId, (job) => applyAnalysisProgress(job, progress)) })
    .then((result) => update(chapterId, (job) => finishAnalysis(job, result)))
    .catch((error: unknown) => update(chapterId, (job) => failJob(job, error instanceof Error && error.message ? error.message : "Erreur inconnue.")))
    .finally(() => controllers.delete(chapterId));
  return true;
}

/** Lance la traduction d'une sélection de pages. Rend `false` si un traitement tourne déjà sur ce chapitre. */
export function startTranslationJob(chapterId: string, pageIds: string[], options: { retranslate?: boolean }, translate: TranslationRunner): boolean {
  const controller = begin(chapterId, "translate", pageIds);
  if (!controller) return false;
  void translate(pageIds, { retranslate: options.retranslate, signal: controller.signal, onProgress: (progress) => update(chapterId, (job) => applyTranslationProgress(job, progress)) })
    .then((result) => update(chapterId, (job) => finishTranslation(job, result)))
    .catch((error: unknown) => update(chapterId, (job) => failJob(job, error instanceof Error && error.message ? error.message : "Erreur inconnue.")))
    .finally(() => controllers.delete(chapterId));
  return true;
}

/** Demande l'arrêt : la page en cours finit, les suivantes ne partent pas. */
export function stopChapterJob(chapterId: string) {
  const job = jobs.get(chapterId);
  if (!job?.running || job.stopping) return;
  controllers.get(chapterId)?.abort();
  publish({ ...job, stopping: true });
}

/** Retire de l'écran le compte rendu d'un traitement fini. Sans effet pendant qu'il tourne. */
export function dismissChapterJob(chapterId: string) {
  if (jobs.get(chapterId)?.running) return;
  jobs.delete(chapterId);
  for (const listener of listeners) listener();
}

/** Le traitement du chapitre, tenu à jour : `null` s'il n'y en a pas. */
export function useChapterJob(chapterId: string): ChapterJob | null {
  return useSyncExternalStore(
    subscribeChapterJobs,
    () => getChapterJob(chapterId),
    () => null,
  );
}
