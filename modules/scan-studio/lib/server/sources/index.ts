/**
 * Sources : ce que `index.process.ts` appelle.
 *
 * `SourceHub` réunit le registre des adaptateurs, leur client poli (un par
 * adaptateur, gardé d'un appel à l'autre pour que les délais tiennent entre
 * l'aperçu, l'icône et l'import), leur état et les imports. Les tests en
 * construisent un avec un faux transport ; en service, il n'y en a qu'un pour
 * tout le serveur.
 */

import type { LinkImportReport } from "../../library-helpers";
import type { LinkPreview, SourceLanguage, SourceStatus } from "../../types";
import * as library from "../library";
import { SourceError, toSourceError, type SourceAdapter, type SourceContext } from "./adapter";
import { PoliteFetcher, systemClock, type Clock, type Transport } from "./fetcher";
import { fetchSourceIcon, storeIcon } from "./icons";
import { ImportManager, recordSourceFailure, toPreview } from "./jobs";
import { ADAPTERS, detect, getAdapter } from "./registry";
import { readSourceState, sourceStatus, updateSourceState } from "./settings";

/** Langue source du module pour un code de langue de site : « en », « ja », « zh-hk »… */
function sourceLanguageOf(code: string | undefined): SourceLanguage | null {
  const value = code?.toLowerCase() ?? "";
  if (value === "en" || value === "ja" || value === "ko") return value;
  if (value === "zh-hk" || value === "zh-tw" || value === "zh-hant") return "zh-Hant";
  if (value === "zh" || value === "zh-hans" || value === "zh-cn") return "zh-Hans";
  return null;
}

/** Après un échec, l'icône n'est pas redemandée d'elle-même avant ce délai. */
const ICON_RETRY_MS = 24 * 60 * 60 * 1000;

export interface SourceHubOptions {
  adapters?: SourceAdapter[];
  transport?: Transport;
  clock?: Clock;
}

export class SourceHub {
  private readonly adapters: SourceAdapter[];
  private readonly transport?: Transport;
  private readonly clock: Clock;
  private readonly fetchers = new Map<string, PoliteFetcher>();
  private readonly iconFetches = new Map<string, Promise<void>>();
  readonly imports: ImportManager;

  constructor(options: SourceHubOptions = {}) {
    this.adapters = options.adapters ?? ADAPTERS;
    this.transport = options.transport;
    this.clock = options.clock ?? systemClock;
    this.imports = new ImportManager({ adapters: this.adapters, fetcherFor: (adapter) => this.fetcherFor(adapter), now: () => this.clock.now() });
  }

  fetcherFor(adapter: SourceAdapter): PoliteFetcher {
    let fetcher = this.fetchers.get(adapter.id);
    if (!fetcher) {
      fetcher = new PoliteFetcher({
        hosts: [...adapter.hosts, ...(adapter.requestHosts ?? [])],
        minDelayMs: adapter.minDelayMs,
        transport: this.transport,
        clock: this.clock,
      });
      this.fetchers.set(adapter.id, fetcher);
    }
    return fetcher;
  }

  private requireAdapter(id: unknown): SourceAdapter {
    const adapter = getAdapter(id, this.adapters);
    if (!adapter) throw new Error("Source inconnue.");
    return adapter;
  }

  // ─── Icônes ────────────────────────────────────────────────────

  /** Récupère l'icône d'un site et l'enregistre. Une seule récupération à la fois par site. */
  private fetchIcon(adapter: SourceAdapter): Promise<void> {
    const running = this.iconFetches.get(adapter.id);
    if (running) return running;
    const task = (async () => {
      try {
        storeIcon(adapter.id, await fetchSourceIcon(adapter, this.fetcherFor(adapter)));
        updateSourceState(adapter.id, (state) => {
          state.icon = { fetchedAt: this.clock.now() };
        });
      } catch (error) {
        // L'ancienne icône, s'il y en a une, reste en place.
        updateSourceState(adapter.id, (state) => {
          state.icon = { ...state.icon, failedAt: this.clock.now() };
        });
        throw error;
      }
    })().finally(() => this.iconFetches.delete(adapter.id));
    this.iconFetches.set(adapter.id, task);
    return task;
  }

  // ─── État ──────────────────────────────────────────────────────

  /**
   * Les adaptateurs connus. La première fois qu'un adaptateur activé est
   * listé, son icône est lue chez le site ; ensuite, plus rien ne part d'ici.
   */
  async listSources(): Promise<SourceStatus[]> {
    for (const adapter of this.adapters) {
      const state = readSourceState(adapter.id);
      const triedRecently = state.icon?.failedAt !== undefined && this.clock.now() - state.icon.failedAt < ICON_RETRY_MS;
      if (!state.enabled || state.icon?.fetchedAt || triedRecently) continue;
      // Sans icône, l'état n'a simplement pas d'`iconUrl`.
      await this.fetchIcon(adapter).catch((error) => console.info(`[scan-studio] ${adapter.id} : ${error instanceof Error ? error.message : error}`));
    }
    return this.adapters.map(sourceStatus);
  }

  setSourceEnabled(sourceId: unknown, enabled: unknown): SourceStatus {
    const adapter = this.requireAdapter(sourceId);
    if (typeof enabled !== "boolean") throw new Error("Réglage invalide.");
    updateSourceState(adapter.id, (state) => {
      state.enabled = enabled;
    });
    return sourceStatus(adapter);
  }

  /** À la demande d'un administrateur. Un échec est dit, et l'icône en place est gardée. */
  async refreshSourceIcon(sourceId: unknown): Promise<SourceStatus> {
    const adapter = this.requireAdapter(sourceId);
    await this.fetchIcon(adapter);
    return sourceStatus(adapter);
  }

  // ─── Liens ─────────────────────────────────────────────────────

  /** Reconnaît le site d'un lien et lit ce qu'il désigne. Aucune image n'est téléchargée. */
  async previewLink(rawUrl: unknown): Promise<LinkPreview> {
    const { adapter, url } = detect(rawUrl, this.adapters);
    if (!readSourceState(adapter.id).enabled) {
      throw new SourceError("disabled", `${adapter.name} est désactivé dans la page « Sources » : un administrateur peut le réactiver.`);
    }
    const context: SourceContext = {
      fetcher: this.fetcherFor(adapter),
      signal: new AbortController().signal,
      log: (message) => console.info(`[scan-studio] ${adapter.id} : ${message}`),
    };
    try {
      const info = adapter.describe ? await adapter.describe(url, context) : (await adapter.resolve(url, context)).info;
      return toPreview(adapter, info);
    } catch (error) {
      const failure = toSourceError(error);
      recordSourceFailure(adapter.id, failure, this.clock.now());
      throw failure;
    }
  }

  importFromLink(chapterId: unknown, rawUrl: unknown): LinkImportReport {
    return this.imports.start(chapterId, rawUrl);
  }

  /**
   * Un lien suffit : le chapitre est rangé dans le dossier de sa série, créé
   * s'il n'existe pas, puis ses pages sont récupérées. Le dossier se retrouve
   * par son nom, le chapitre par son numéro. Un chapitre déjà présent avec ses
   * pages n'est pas importé une seconde fois.
   */
  async importLinkToLibrary(rawUrl: unknown): Promise<LinkImportReport> {
    const preview = await this.previewLink(rawUrl);
    const seriesName = (preview.series?.trim() || `Imports ${preview.source.name}`).slice(0, 120);
    const number = (preview.chapterNumber?.trim() || "1").slice(0, 20);

    const wanted = seriesName.toLocaleLowerCase("fr");
    const known = library.listFolders().find((folder) => folder.name.trim().toLocaleLowerCase("fr") === wanted);
    const folder = known ? library.getFolder(known.id).folder : library.createFolder({ name: seriesName });
    const created = { folder: !known, chapter: false };

    const existing = known ? library.getFolder(folder.id).chapters.find((chapter) => chapter.number === number) : undefined;
    if (existing && existing.pageCount > 0) {
      throw new Error(`Le chapitre ${number} de « ${seriesName} » est déjà dans la bibliothèque, avec ses pages.`);
    }
    let chapterId = existing?.id;
    try {
      if (!chapterId) {
        const chapter = library.createChapter(folder.id, { number, title: preview.chapterTitle });
        chapterId = chapter.id;
        created.chapter = true;
        // La langue annoncée par le site devient la langue source du chapitre.
        const language = sourceLanguageOf(preview.language);
        if (language && language !== chapter.settings.sourceLanguage) {
          library.updateChapter(chapter.id, { settings: { ...chapter.settings, sourceLanguage: language } });
        }
      }
      const job = this.imports.start(chapterId, rawUrl);
      return { ...job, folderId: folder.id, created };
    } catch (error) {
      // L'import n'a pas démarré : on ne laisse pas un chapitre ou un dossier vide derrière soi.
      if (created.chapter && chapterId) library.deleteChapter(chapterId);
      if (created.folder) library.deleteFolder(folder.id);
      throw error;
    }
  }

  getLinkImport(jobId: unknown): LinkImportReport {
    return this.imports.get(jobId);
  }

  cancelLinkImport(jobId: unknown): LinkImportReport {
    return this.imports.cancel(jobId);
  }
}

// ─── En service ──────────────────────────────────────────────────

// Gardé sur `globalThis` : en développement, le rechargement à chaud relit ce
// fichier, et un import en cours ne doit ni se perdre ni se doubler.
/**
 * À augmenter quand `SourceHub` gagne ou perd une méthode : le gestionnaire
 * gardé en mémoire par un rechargement à chaud serait sinon l'ancien, sans elle.
 */
const HUB_VERSION = 4;
const holder = globalThis as typeof globalThis & { __scanStudioSourceHub?: { version: number; hub: SourceHub } };

function hub(): SourceHub {
  if (holder.__scanStudioSourceHub?.version !== HUB_VERSION) {
    holder.__scanStudioSourceHub = { version: HUB_VERSION, hub: new SourceHub() };
  }
  return holder.__scanStudioSourceHub.hub;
}

export const listSources = () => hub().listSources();
export const setSourceEnabled = (sourceId: unknown, enabled: unknown) => hub().setSourceEnabled(sourceId, enabled);
export const refreshSourceIcon = (sourceId: unknown) => hub().refreshSourceIcon(sourceId);
export const previewLink = (url: unknown) => hub().previewLink(url);
export const importFromLink = (chapterId: unknown, url: unknown) => hub().importFromLink(chapterId, url);
export const importLinkToLibrary = (url: unknown) => hub().importLinkToLibrary(url);
export const getLinkImport = (jobId: unknown) => hub().getLinkImport(jobId);
export const cancelLinkImport = (jobId: unknown) => hub().cancelLinkImport(jobId);
