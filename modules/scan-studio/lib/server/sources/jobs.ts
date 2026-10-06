/**
 * L'import d'un chapitre par son lien.
 *
 * `start` contrôle la demande, crée le travail et le rend aussitôt ; le reste
 * se fait en arrière-plan, et se suit avec `get` :
 *
 *   lien lu chez le site → pages téléchargées une à une dans `data/assets/`,
 *   chacune ouverte avec sharp → rattachées au chapitre en un seul appel à
 *   `importPages`, dans l'ordre du site → `done`
 *
 * Ce qui tient l'ensemble :
 *
 * - **un import à la fois.** Une seconde demande est refusée avec un message
 *   clair plutôt que mise en file : une file cacherait une longue attente, et
 *   deux chapitres lancés coup sur coup feraient deux fois plus de requêtes
 *   d'affilée chez le même site. Redemander le même lien pour le même chapitre
 *   rend le travail en cours, au lieu d'une erreur ;
 * - **les pages l'une après l'autre**, par le client poli (`fetcher.ts`) ;
 * - **rien à moitié** : annulation ou échec effacent les fichiers téléchargés
 *   qui ne sont pas devenus des pages ;
 * - **rien d'écrit en silence** : ce que le site dit du chapitre (titre,
 *   numéro) est rendu dans le travail, jamais recopié dans le chapitre ;
 * - les travaux vivent en mémoire et sont recopiés dans
 *   `data/sources/jobs.json` à chaque étape. Un travail qu'un redémarrage du
 *   serveur a interrompu est marqué échoué à la relecture.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import sharp from "sharp";
import type { LinkImportReport } from "../../library-helpers";
import { assetPath, ensureDirs, newAssetName, readJson, referencedAssets, removeAsset, writeJson, type AssetExtension } from "../../store";
import type { LinkImportState, LinkPreview, SourceErrorKind, UploadedFile } from "../../types";
import { probeImage } from "../images";
import { MAX_IMPORT_FILES, importPages, recordChapterOrigin, requireChapter, requireFolder, setFolderCover } from "../library";
import { AbortedError, SourceError, type ChapterInfo, type SourceAdapter, type SourceContext } from "./adapter";
import type { PoliteFetcher } from "./fetcher";
import { detect } from "./registry";
import { readSourceState, sourceStatus, sourcesDir, updateSourceState } from "./settings";

const jobsFile = () => path.join(sourcesDir(), "jobs.json");

/** Travaux gardés pour être relus après coup. */
const MAX_KEPT_JOBS = 20;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ACTIVE_STATES: LinkImportState[] = ["queued", "resolving", "downloading", "importing"];
const EXTENSIONS: Record<string, AssetExtension> = { png: "png", jpeg: "jpg", webp: "webp", gif: "gif" };

/** Les échecs qui disent quelque chose de l'état de l'adaptateur, et qu'on garde donc en mémoire. */
const HEALTH_KINDS: SourceErrorKind[] = ["rate-limited", "site-error", "adapter-outdated"];

const isActive = (job: LinkImportReport) => ACTIVE_STATES.includes(job.state);

/** Note un échec sur l'adaptateur, s'il dit quelque chose de son état. */
export function recordSourceFailure(adapterId: string, error: SourceError, at: number) {
  if (!HEALTH_KINDS.includes(error.kind)) return;
  try {
    updateSourceState(adapterId, (state) => {
      state.lastError = { kind: error.kind, message: error.message, at };
    });
  } catch (failure) {
    console.error("[scan-studio] état de la source non enregistré :", failure);
  }
}

/** Ce que le site dit du chapitre, tel que l'interface le montre. */
export function toPreview(adapter: SourceAdapter, info: ChapterInfo): LinkPreview {
  const status = sourceStatus(adapter);
  const preview: LinkPreview = { source: { id: status.id, name: status.name, iconUrl: status.iconUrl }, pageCount: info.pageCount };
  if (info.series) preview.series = info.series;
  if (info.chapterNumber) preview.chapterNumber = info.chapterNumber;
  if (info.chapterTitle) preview.chapterTitle = info.chapterTitle;
  if (info.language) preview.language = info.language;
  if (info.credit) preview.credit = info.credit;
  return preview;
}

/** `007.png` : l'ordre naturel des noms est celui du site, quel que soit le nombre de pages. */
function pageName(index: number, total: number, extension: AssetExtension): string {
  return `${String(index + 1).padStart(Math.max(3, String(total).length), "0")}.${extension}`;
}

export interface ImportManagerOptions {
  adapters: SourceAdapter[];
  /** Le client poli de l'adaptateur : le même pour l'aperçu, l'icône et l'import. */
  fetcherFor: (adapter: SourceAdapter) => PoliteFetcher;
  now?: () => number;
}

export class ImportManager {
  private readonly adapters: SourceAdapter[];
  private readonly fetcherFor: (adapter: SourceAdapter) => PoliteFetcher;
  private readonly now: () => number;
  private jobs: Map<string, LinkImportReport> | null = null;
  private active: { job: LinkImportReport; controller: AbortController; done: Promise<void> } | null = null;

  constructor(options: ImportManagerOptions) {
    this.adapters = options.adapters;
    this.fetcherFor = options.fetcherFor;
    this.now = options.now ?? Date.now;
  }

  // ─── Mémoire et disque ─────────────────────────────────────────

  /** Relit les travaux gardés, une fois. Ceux qu'un redémarrage a coupés sont marqués échoués. */
  private load(): Map<string, LinkImportReport> {
    if (this.jobs) return this.jobs;
    const jobs = new Map<string, LinkImportReport>();
    const stored = readJson<LinkImportReport[]>(jobsFile());
    let interrupted = false;
    for (const job of Array.isArray(stored) ? stored : []) {
      if (!job || typeof job !== "object" || typeof job.id !== "string" || typeof job.state !== "string") continue;
      if (isActive(job)) {
        job.state = "failed";
        job.error = { kind: "site-error", message: "Import interrompu par un redémarrage du serveur. Rien n’a été ajouté au chapitre : relancez-le." };
        job.updatedAt = this.now();
        interrupted = true;
      }
      jobs.set(job.id, job);
    }
    this.jobs = jobs;
    if (interrupted) this.persist();
    return jobs;
  }

  private persist() {
    const jobs = [...this.load().values()].sort((left, right) => right.createdAt - left.createdAt);
    for (const job of jobs.slice(MAX_KEPT_JOBS)) {
      if (!isActive(job)) this.load().delete(job.id);
    }
    try {
      writeJson(jobsFile(), jobs.slice(0, MAX_KEPT_JOBS));
    } catch (error) {
      // Le travail continue en mémoire : seule sa relecture après un redémarrage est perdue.
      console.error("[scan-studio] imports par lien non enregistrés :", error);
    }
  }

  private touch(job: LinkImportReport, change: Partial<LinkImportReport>) {
    Object.assign(job, change, { updatedAt: this.now() });
    this.persist();
  }

  /**
   * Illustre le dossier du chapitre par la couverture de sa série, s'il n'en a
   * pas déjà une. Jamais indispensable : un échec est noté et l'import reste réussi.
   */
  private async fetchSeriesCover(chapterId: string, coverUrl: string | undefined, fetcher: PoliteFetcher, signal: AbortSignal) {
    if (!coverUrl) return;
    try {
      const folder = requireFolder(requireChapter(chapterId).folderId);
      if (folder.cover) return;
      const response = await fetcher.request(coverUrl, { kind: "image", signal });
      if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
      setFolderCover(folder.id, await storeCover(response.body));
    } catch (error) {
      console.info(`[scan-studio] couverture de la série non récupérée : ${error instanceof Error ? error.message : "erreur"}`);
    }
  }

  private newId(): string {
    for (;;) {
      const id = Array.from(randomBytes(12), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");
      if (!this.load().has(id)) return id;
    }
  }

  // ─── Appels ────────────────────────────────────────────────────

  /** Contrôle la demande, crée le travail et le rend tout de suite. */
  start(chapterId: unknown, rawUrl: unknown): LinkImportReport {
    const chapter = requireChapter(chapterId);
    const { adapter, url } = detect(rawUrl, this.adapters);
    if (!readSourceState(adapter.id).enabled) {
      throw new SourceError("disabled", `${adapter.name} est désactivé dans la page « Sources » : un administrateur peut le réactiver.`);
    }
    this.load();

    if (this.active) {
      const running = this.active.job;
      if (running.chapterId === chapter.id && running.url === url.toString()) return structuredClone(running);
      throw new Error("Un import par lien est déjà en cours. Un seul à la fois : attendez sa fin ou annulez-le avant d’en lancer un autre.");
    }

    const now = this.now();
    const job: LinkImportReport = {
      id: this.newId(),
      url: url.toString(),
      chapterId: chapter.id,
      sourceId: adapter.id,
      state: "queued",
      done: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.load().set(job.id, job);
    this.persist();
    const snapshot = structuredClone(job);

    const controller = new AbortController();
    const done = this.run(job, adapter, url, controller).finally(() => {
      if (this.active?.job === job) this.active = null;
    });
    this.active = { job, controller, done };
    return snapshot;
  }

  get(jobId: unknown): LinkImportReport {
    const job = typeof jobId === "string" ? this.load().get(jobId) : undefined;
    if (!job) throw new Error("Import introuvable : il est trop ancien, ou n’a jamais existé.");
    return structuredClone(job);
  }

  /**
   * Arrête un import. Ce qui a été téléchargé sans être devenu une page est
   * effacé. Une fois les pages en cours de rattachement au chapitre, il est
   * trop tard : l'import va à son terme, et le travail est rendu tel quel.
   */
  cancel(jobId: unknown): LinkImportReport {
    const job = this.get(jobId);
    const active = this.active;
    if (active && active.job.id === job.id && active.job.state !== "importing") {
      // L'état change tout de suite ; le ménage est fait par `run`, qui s'arrête à ce signal.
      this.touch(active.job, { state: "cancelled" });
      active.controller.abort();
      return structuredClone(active.job);
    }
    return job;
  }

  /** Fin du travail en cours, s'il y en a un. Pour les tests. */
  async idle(): Promise<void> {
    await this.active?.done;
  }

  // ─── Le travail ────────────────────────────────────────────────

  private async run(job: LinkImportReport, adapter: SourceAdapter, url: URL, controller: AbortController) {
    // Laisse `start` rendre le travail « en attente » avant de commencer.
    await Promise.resolve();
    const fetcher = this.fetcherFor(adapter);
    const context: SourceContext = {
      fetcher,
      signal: controller.signal,
      log: (message) => console.info(`[scan-studio] ${adapter.id} : ${message}`),
    };
    const stopIfCancelled = () => {
      if (controller.signal.aborted) throw new AbortedError();
    };
    /** Fichiers écrits dans `assets/` par cet import. */
    const written: string[] = [];

    try {
      stopIfCancelled();
      this.touch(job, { state: "resolving" });
      const chapter = await adapter.resolve(url, context);
      stopIfCancelled();

      const total = chapter.pages.length;
      if (total === 0) throw new SourceError("unavailable", `${adapter.name} n’a rendu aucune page pour ce chapitre.`);
      if (total > MAX_IMPORT_FILES) {
        throw new SourceError("unavailable", `Ce chapitre compte ${total} pages : un import en accepte ${MAX_IMPORT_FILES} au plus.`);
      }
      this.touch(job, { state: "downloading", total, preview: toPreview(adapter, { ...chapter.info, pageCount: total }) });

      ensureDirs();
      const files: UploadedFile[] = [];
      // Par rang, pas par itération : un adaptateur peut corriger les adresses des pages restantes en route.
      for (let index = 0; index < total; index++) {
        stopIfCancelled();
        const page = chapter.pages[index];
        const buffer = adapter.fetchPage ? await adapter.fetchPage(page, chapter, context) : await fetchPlainPage(fetcher, page.url, index, controller.signal);
        stopIfCancelled();

        const file = await storePage(buffer, index, total);
        written.push(file.file);
        files.push(file);
        this.touch(job, { done: index + 1 });
      }

      stopIfCancelled();
      this.touch(job, { state: "importing" });
      const pages = await importPages(job.chapterId, files);
      // D'où vient le chapitre : le site, son adresse et l'équipe créditée, montrés avec sa lecture publique.
      try {
        recordChapterOrigin(job.chapterId, { source: adapter.name, url: job.url, credit: chapter.info.credit });
      } catch (failure) {
        console.error("[scan-studio] origine du chapitre non enregistrée :", failure);
      }
      // La couverture de la série, si le site en donne une et que le dossier n'en a pas.
      await this.fetchSeriesCover(job.chapterId, chapter.info.seriesCoverUrl, fetcher, controller.signal);
      this.touch(job, { state: "done", imported: pages.length });
      updateSourceState(adapter.id, (state) => {
        state.lastUsedAt = this.now();
        delete state.lastError;
      });
    } catch (error) {
      // Rien à moitié : ce qui n'est pas devenu une page ne reste pas sur le disque.
      const used = referencedAssets();
      for (const file of written) {
        if (!used.has(file)) removeAsset(file);
      }

      if (controller.signal.aborted || error instanceof AbortedError) {
        this.touch(job, { state: "cancelled" });
      } else if (error instanceof SourceError) {
        this.touch(job, { state: "failed", error: { kind: error.kind, message: error.message } });
        recordSourceFailure(adapter.id, error, this.now());
      } else {
        // L'échec vient d'ici (chapitre supprimé entre-temps, disque plein…), pas du site.
        const reason = error instanceof Error && error.message ? error.message : "erreur inattendue";
        this.touch(job, { state: "failed", error: { kind: "site-error", message: `L’import a échoué sur ce serveur, pas chez ${adapter.name} : ${reason}` } });
      }
    }
  }
}

/**
 * Écrit la couverture d'une série dans `assets/` et rend son nom. Elle est
 * ouverte comme une page : ce qui n'est pas une image acceptée ne reste pas.
 */
async function storeCover(buffer: Buffer): Promise<string> {
  const extension = EXTENSIONS[(await sharp(buffer).metadata()).format ?? ""];
  if (!extension) throw new Error("format non accepté");
  const file = newAssetName(extension);
  fs.writeFileSync(assetPath(file), buffer, { flag: "wx" });
  try {
    await probeImage(assetPath(file), "La couverture");
  } catch (error) {
    removeAsset(file);
    throw error;
  }
  return file;
}

/** Une page sans traitement particulier : un simple GET de son adresse. */
async function fetchPlainPage(fetcher: PoliteFetcher, url: string, index: number, signal: AbortSignal): Promise<Buffer> {
  const response = await fetcher.request(url, { kind: "image", signal });
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError("site-error", `Le site a répondu HTTP ${response.status} pour la page ${index + 1}.`);
  }
  return response.body;
}

/**
 * Écrit une page reçue dans `assets/`, sous un nom du même gabarit que ceux de
 * la route d'envoi, puis l'ouvre comme `importPages` le fera : ce qui n'est pas
 * une image acceptée ne reste pas sur le disque.
 */
async function storePage(buffer: Buffer, index: number, total: number): Promise<UploadedFile> {
  const refused = () => new SourceError("site-error", `Ce que le site a rendu pour la page ${index + 1} n’est pas une image lisible (PNG, JPEG, WebP ou GIF).`);
  let extension: AssetExtension | undefined;
  try {
    extension = EXTENSIONS[(await sharp(buffer).metadata()).format ?? ""];
  } catch {
    throw refused();
  }
  if (!extension) throw refused();

  const name = pageName(index, total, extension);
  const file = newAssetName(extension);
  fs.writeFileSync(assetPath(file), buffer, { flag: "wx" });
  try {
    await probeImage(assetPath(file), name);
  } catch (error) {
    removeAsset(file);
    throw new SourceError("site-error", `Page ${index + 1} : ${error instanceof Error ? error.message : "image refusée"}`);
  }
  return { file, name };
}
