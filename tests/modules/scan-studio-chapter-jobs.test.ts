/**
 * Traitements d'un chapitre en arrière-plan : l'état de chaque page, le compte
 * rendu, l'arrêt, et la règle « un seul traitement à la fois ». L'analyse et la
 * traduction elles-mêmes sont remplacées par de fausses.
 */

import { describe, expect, it } from "vitest";
import type { AnalyzePagesResult } from "@/modules/scan-studio/lib/analysis/contract";
import {
  applyAnalysisProgress,
  applyTranslationProgress,
  countStates,
  createJob,
  dismissChapterJob,
  failJob,
  finishAnalysis,
  finishTranslation,
  getChapterJob,
  jobProgress,
  startAnalysisJob,
  startTranslationJob,
  stopChapterJob,
  subscribeChapterJobs,
  type AnalysisRunner,
  type TranslationRunner,
} from "@/modules/scan-studio/lib/chapter-jobs";
import type { ChapterTranslationResult, PageTranslationOutcome } from "@/modules/scan-studio/lib/translate-pages";

const analysis = (extra: Partial<AnalyzePagesResult> = {}): AnalyzePagesResult => ({ analyzed: 0, regions: 0, failed: [], untranslatable: [], ...extra }) as AnalyzePagesResult;
const translation = (extra: Partial<ChapterTranslationResult> = {}): ChapterTranslationResult =>
  ({ translatedPages: 0, translatedRegions: 0, sentCharacters: 0, failed: [], fallbacks: [], remaining: [], ...extra }) as ChapterTranslationResult;
const outcome = (extra: Partial<PageTranslationOutcome>): PageTranslationOutcome => ({ pageId: "a", state: "done", translated: 0, failed: [], ...extra }) as PageTranslationOutcome;

describe("traitement d'un chapitre : l'état de chaque page", () => {
  it("part avec toutes les pages en attente, dans l'ordre", () => {
    const job = createJob("chapter00001", "analyze", ["a", "b", "c"]);
    expect(job.order).toEqual(["a", "b", "c"]);
    expect(countStates(job)).toEqual({ queued: 3, running: 0, done: 0, skipped: 0, error: 0 });
    expect(jobProgress(job)).toEqual({ settled: 0, total: 3 });
    expect(job.running).toBe(true);
  });

  it("suit l'analyse page par page, et ignore une page qui n'est pas du lot", () => {
    let job = createJob("chapter00001", "analyze", ["a", "b"]);
    job = applyAnalysisProgress(job, { pageId: "a", step: "reading", progress: 0.4 });
    expect(job.pages.a).toEqual({ state: "running", detail: "Repérage et lecture…" });
    job = applyAnalysisProgress(job, { pageId: "a", step: "done", progress: 1 });
    job = applyAnalysisProgress(job, { pageId: "b", step: "error", progress: 1, message: "Image illisible" });
    job = applyAnalysisProgress(job, { pageId: "zzz", step: "done", progress: 1 });
    expect(job.pages).toEqual({ a: { state: "done", detail: "Analysée" }, b: { state: "error", detail: "Image illisible" } });
    expect(jobProgress(job)).toEqual({ settled: 2, total: 2 });
  });

  it("suit la traduction : en cours, traduite, rien à traduire, en échec", () => {
    let job = createJob("chapter00001", "translate", ["a", "b", "c"]);
    job = applyTranslationProgress(job, { pageId: "a", index: 0, total: 3, step: "translating" });
    expect(job.pages.a).toEqual({ state: "running", detail: "Traduction…" });
    job = applyTranslationProgress(job, { pageId: "a", index: 0, total: 3, step: "done", outcome: outcome({ translated: 6, failed: [{ id: "x", error: "sans réponse" }] as never }) });
    job = applyTranslationProgress(job, { pageId: "b", index: 1, total: 3, step: "skipped", outcome: outcome({ pageId: "b", state: "skipped" }) });
    job = applyTranslationProgress(job, { pageId: "c", index: 2, total: 3, step: "error", outcome: outcome({ pageId: "c", state: "error", error: "Page introuvable" }) });
    expect(job.pages.a).toEqual({ state: "done", detail: "6 zones traduites, 1 zone sans réponse" });
    expect(job.pages.b).toEqual({ state: "skipped", detail: "Rien à traduire" });
    expect(job.pages.c).toEqual({ state: "error", detail: "Page introuvable" });
  });
});

describe("traitement d'un chapitre : le compte rendu", () => {
  it("dit ce que l'analyse a fait, garde la raison d'un échec et propose les pages sans texte", () => {
    let job = createJob("chapter00001", "analyze", ["a", "b", "c"]);
    job = applyAnalysisProgress(job, { pageId: "a", step: "done", progress: 1 });
    job = applyAnalysisProgress(job, { pageId: "b", step: "done", progress: 1 });
    const done = finishAnalysis(job, analysis({ analyzed: 2, regions: 11, failed: [{ pageId: "c", error: "Trop grande" }], untranslatable: ["a", "ailleurs"] }));
    expect(done.running).toBe(false);
    expect(done.summary).toBe("Analyse terminée : 2 pages analysées, 11 zones ajoutées, 1 page en échec.");
    expect(done.pages.c).toEqual({ state: "error", detail: "Trop grande" });
    // Seules les pages du lot sont proposées.
    expect(done.untranslatable).toEqual(["a"]);
  });

  it("après un arrêt, la page interrompue repasse en attente et le compte rendu dit ce qui reste", () => {
    let job = createJob("chapter00001", "analyze", ["a", "b", "c"]);
    job = applyAnalysisProgress(job, { pageId: "a", step: "done", progress: 1 });
    job = applyAnalysisProgress(job, { pageId: "b", step: "reading", progress: 0.2 });
    const stopped = finishAnalysis({ ...job, stopping: true }, analysis({ analyzed: 1, regions: 4 }));
    expect(stopped.pages.b).toEqual({ state: "queued" });
    expect(stopped.summary).toBe("Analyse arrêtée : 1 page analysée, 4 zones ajoutées, 2 pages non analysées.");
  });

  it("dit pourquoi une traduction s'est interrompue faute de moteur", () => {
    let job = createJob("chapter00001", "translate", ["a", "b"]);
    job = applyTranslationProgress(job, { pageId: "a", index: 0, total: 2, step: "done", outcome: outcome({ translated: 3 }) });
    const halted = finishTranslation(job, translation({ translatedPages: 1, translatedRegions: 3, stopped: "engines", stopReason: "Quota du jour atteint." }));
    expect(halted.summary).toBe("Traduction interrompue : 1 page traduite, 3 zones.");
    expect(halted.failure).toBe("Quota du jour atteint.");
    expect(finishTranslation(job, translation()).summary).toBe("Traduction terminée : rien à traduire.");
    expect(failJob(job, "Réseau coupé")).toMatchObject({ running: false, failure: "Réseau coupé", summary: "La traduction s’est interrompue." });
  });
});

describe("traitement d'un chapitre : en arrière-plan", () => {
  /** Une fausse analyse qui attend qu'on la laisse finir, et note ce qu'on lui a demandé. */
  function controlled() {
    const calls: { ids: string[]; replace?: boolean }[] = [];
    let release!: (result: AnalyzePagesResult) => void;
    let aborted = false;
    const runner: AnalysisRunner = (ids, options) => {
      calls.push({ ids, replace: options.replace });
      options.signal?.addEventListener("abort", () => (aborted = true));
      options.onProgress?.({ pageId: ids[0], step: "reading", progress: 0.5 });
      return new Promise((resolve) => (release = resolve));
    };
    return { runner, calls, finish: (result: AnalyzePagesResult) => release(result), wasAborted: () => aborted };
  }

  it("lance, publie chaque changement, refuse un second traitement, puis rend le compte rendu", async () => {
    const chapter = "chapter0000a";
    const { runner, calls, finish } = controlled();
    let notified = 0;
    const unsubscribe = subscribeChapterJobs(() => notified++);

    expect(startAnalysisJob(chapter, ["a", "b"], { replace: true }, runner)).toBe(true);
    expect(calls).toEqual([{ ids: ["a", "b"], replace: true }]);
    expect(getChapterJob(chapter)).toMatchObject({ kind: "analyze", running: true, pages: { a: { state: "running" }, b: { state: "queued" } } });
    expect(notified).toBeGreaterThanOrEqual(2);

    // Un traitement tourne : ni une autre analyse ni une traduction ne partent sur ce chapitre.
    expect(startAnalysisJob(chapter, ["a"], {}, runner)).toBe(false);
    const never: TranslationRunner = async () => {
      throw new Error("ne doit pas être appelé");
    };
    expect(startTranslationJob(chapter, ["a"], {}, never)).toBe(false);
    // Pendant qu'il tourne, on ne peut pas le retirer de l'écran.
    dismissChapterJob(chapter);
    expect(getChapterJob(chapter)).not.toBeNull();

    finish(analysis({ analyzed: 2, regions: 5 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getChapterJob(chapter)).toMatchObject({ running: false, summary: "Analyse terminée : 2 pages analysées, 5 zones ajoutées." });

    dismissChapterJob(chapter);
    expect(getChapterJob(chapter)).toBeNull();
    unsubscribe();
  });

  it("l'arrêt prévient le travail et se voit tout de suite ; une sélection vide ne lance rien", async () => {
    const chapter = "chapter0000b";
    const { runner, finish, wasAborted } = controlled();
    expect(startAnalysisJob(chapter, [], {}, runner)).toBe(false);
    expect(getChapterJob(chapter)).toBeNull();

    startAnalysisJob(chapter, ["a", "b"], {}, runner);
    stopChapterJob(chapter);
    expect(wasAborted()).toBe(true);
    expect(getChapterJob(chapter)).toMatchObject({ running: true, stopping: true });
    finish(analysis({ analyzed: 0, regions: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getChapterJob(chapter)?.summary).toBe("Analyse arrêtée : 0 page analysée, 0 zone ajoutée, 2 pages non analysées.");
    dismissChapterJob(chapter);
  });

  it("une erreur du travail finit le traitement avec sa raison", async () => {
    const chapter = "chapter0000c";
    const failing: TranslationRunner = async () => {
      throw new Error("Serveur injoignable");
    };
    expect(startTranslationJob(chapter, ["a"], { retranslate: true }, failing)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getChapterJob(chapter)).toMatchObject({ running: false, failure: "Serveur injoignable" });
    dismissChapterJob(chapter);
  });
});
