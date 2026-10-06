/**
 * Scan Studio : point d'entrée serveur du module.
 *
 * Le serveur ne lit ni ne traduit rien : à cette étape (atelier manuel), il
 * range les dossiers, les chapitres et les pages, et garde les images. Chaque
 * fonction ci-dessous correspond à une entrée de `api` dans `lib/client.ts`,
 * avec la même signature, et est déclarée dans `module.json` (`functions`).
 * La traduction fait exception : le serveur y relaie les textes vers les
 * moteurs, par le routeur de `lib/server/translation/`.
 *
 * Ce qui arrive du navigateur est contrôlé dans `lib/server/` : un identifiant
 * inconnu ou une donnée mal formée lèvent une erreur en français, affichée
 * telle quelle.
 */

import type { GallerySourceImport, GallerySourcePage, GallerySourceQuery, ModuleHooks } from "@/types/modules";
import * as gallery from "./lib/server/gallery";
import * as library from "./lib/server/library";
import * as sources from "./lib/server/sources";
import * as translation from "./lib/server/translation";
import { ensureDirs } from "./lib/store";
import type { LinkImportReport } from "./lib/library-helpers";
import type {
  ChapterSettings,
  ChapterView,
  EngineCatalogue,
  EngineSettingsPatch,
  TranslationBatch,
  TranslationEngineId,
  TranslationEstimate,
  TranslationItem,
  FolderSummary,
  FolderView,
  GlossaryEntry,
  LinkPreview,
  PageStatus,
  PageSummary,
  PageView,
  ScanChapter,
  ScanFolder,
  ScanRegion,
  SourceStatus,
  UploadedFile,
} from "./lib/types";

// ─── Dossiers ────────────────────────────────────────────────────

export async function listFolders(): Promise<FolderSummary[]> {
  return library.listFolders();
}

export async function getFolder(folderId: string): Promise<FolderView> {
  return library.getFolder(folderId);
}

export async function createFolder(input: { name: string }): Promise<ScanFolder> {
  return library.createFolder(input);
}

export async function updateFolder(
  folderId: string,
  patch: { name?: string; defaults?: ChapterSettings; glossary?: GlossaryEntry[] }
): Promise<ScanFolder> {
  return library.updateFolder(folderId, patch);
}

/** Efface le dossier, ses chapitres, leurs pages et leurs images. */
export async function deleteFolder(folderId: string): Promise<{ deleted: boolean }> {
  return library.deleteFolder(folderId);
}

// ─── Chapitres ───────────────────────────────────────────────────

export async function getChapter(chapterId: string): Promise<ChapterView> {
  return library.getChapter(chapterId);
}

/** Le nouveau chapitre reprend les réglages par défaut de son dossier. */
export async function createChapter(folderId: string, input: { number: string; title?: string }): Promise<ScanChapter> {
  return library.createChapter(folderId, input);
}

export async function updateChapter(
  chapterId: string,
  patch: { number?: string; title?: string; settings?: ChapterSettings }
): Promise<ScanChapter> {
  return library.updateChapter(chapterId, patch);
}

export async function deleteChapter(chapterId: string): Promise<{ deleted: boolean }> {
  return library.deleteChapter(chapterId);
}

export async function reorderChapters(folderId: string, chapterIds: string[]): Promise<ScanFolder> {
  return library.reorderChapters(folderId, chapterIds);
}

// ─── Pages ───────────────────────────────────────────────────────

/** Rattache des images déjà déposées par la route d'envoi ; elles se rangent dans l'ordre naturel de leurs noms. */
export async function importPages(chapterId: string, files: UploadedFile[]): Promise<PageSummary[]> {
  return library.importPages(chapterId, files);
}

/** Copie des images de la galerie dans le chapitre. */
export async function importGalleryFiles(chapterId: string, fileNames: string[]): Promise<PageSummary[]> {
  return library.importGalleryFiles(chapterId, fileNames);
}

export async function reorderPages(chapterId: string, pageIds: string[]): Promise<ScanChapter> {
  return library.reorderPages(chapterId, pageIds);
}

export async function deletePage(pageId: string): Promise<{ deleted: boolean }> {
  return library.deletePage(pageId);
}

export async function setPageSkipped(pageId: string, skipped: boolean): Promise<PageSummary> {
  return library.setPageSkipped(pageId, skipped);
}

export async function getPage(pageId: string): Promise<PageView> {
  return library.getPage(pageId);
}

/** Refuse si `revision` n'est plus celle de la page : elle a été enregistrée ailleurs entre-temps. */
export async function savePage(
  pageId: string,
  input: { regions: ScanRegion[]; status?: PageStatus; revision: number }
): Promise<{ revision: number; updatedAt: number }> {
  return library.savePage(pageId, input);
}

// ─── Export ──────────────────────────────────────────────────────

/** Déclare le rendu d'une page, déjà déposé par la route d'envoi ; il remplace le précédent. */
export async function registerExport(pageId: string, file: string): Promise<PageSummary> {
  return library.registerExport(pageId, file);
}

/**
 * Copie les pages exportées d'un chapitre dans la galerie. Aucun album n'est
 * créé : une fonction de module ne reçoit pas la session, et un album a un
 * propriétaire. `albumId` n'est donc jamais rendu.
 */
export async function sendChapterToGallery(chapterId: string): Promise<{ saved: number; albumId?: number }> {
  return gallery.sendChapterToGallery(chapterId);
}

// ─── Traduction ──────────────────────────────────────────────────

/**
 * Traduit les phrases d'une page en un seul appel (§ 7.5 du dossier) :
 * glossaire, mémoire et cache d'abord, puis le moteur principal, puis le
 * secours. Les langues, le glossaire et la mémoire sont ceux du chapitre et de
 * son dossier. Rien n'est écrit dans la page : l'atelier pose les textes.
 */
export async function translateTexts(
  chapterId: string,
  items: TranslationItem[],
  options?: { engine?: TranslationEngineId; force?: boolean }
): Promise<TranslationBatch> {
  return translation.translateTexts(chapterId, items, options);
}

/** Ce qu'un lot coûterait, sans rien envoyer. */
export async function estimateTranslation(chapterId: string, texts: string[]): Promise<TranslationEstimate> {
  return translation.estimateTranslation(chapterId, texts);
}

/** État des moteurs : configuration, consommation, mise à l'écart. Aucune clé n'en sort. */
export async function getEngines(): Promise<EngineCatalogue> {
  return translation.getEngines();
}

/** Réservé aux administrateurs : absente de `functions` dans `module.json`. */
export async function saveEngineSettings(patch: EngineSettingsPatch): Promise<EngineCatalogue> {
  return translation.saveEngineSettings(patch);
}

/** Réservé aux administrateurs : une courte traduction d'essai, une seule requête. */
export async function testEngine(engineId: TranslationEngineId): Promise<{ ok: boolean; message: string }> {
  return translation.testEngine(engineId);
}

// ─── Sources : import d'un chapitre par son lien ─────────────────

/**
 * Les adaptateurs connus, activés ou non. La première fois qu'un adaptateur
 * est listé, l'icône de son site est lue chez lui ; ensuite, rien ne part.
 */
export async function listSources(): Promise<SourceStatus[]> {
  return sources.listSources();
}

/** Réservé aux administrateurs : absente de `functions` dans `module.json`. */
export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<SourceStatus> {
  return sources.setSourceEnabled(sourceId, enabled);
}

/** Réservé aux administrateurs : relit l'icône du site chez lui. */
export async function refreshSourceIcon(sourceId: string): Promise<SourceStatus> {
  return sources.refreshSourceIcon(sourceId);
}

/** Reconnaît le site d'un lien et lit ce qu'il désigne. Aucune image n'est téléchargée. */
export async function previewLink(url: string): Promise<LinkPreview> {
  return sources.previewLink(url);
}

/**
 * Lance la récupération des pages d'un lien dans un chapitre existant et rend
 * tout de suite : l'import se suit avec `getLinkImport`. Un seul à la fois.
 * Le travail porte aussi `preview`, ce que le site dit du chapitre : rien n'en
 * est recopié dans le chapitre sans un geste.
 */
export async function importFromLink(chapterId: string, url: string): Promise<LinkImportReport> {
  return sources.importFromLink(chapterId, url);
}

/**
 * Un lien suffit : range le chapitre dans le dossier de sa série, en créant
 * le dossier et le chapitre s'ils n'existent pas, puis récupère ses pages.
 */
export async function importLinkToLibrary(url: string): Promise<LinkImportReport> {
  return sources.importLinkToLibrary(url);
}

export async function getLinkImport(jobId: string): Promise<LinkImportReport> {
  return sources.getLinkImport(jobId);
}

/** Arrête un import ; ce qui a été téléchargé sans devenir une page est effacé. */
export async function cancelLinkImport(jobId: string): Promise<LinkImportReport> {
  return sources.cancelLinkImport(jobId);
}

// ─── Source pour la galerie ──────────────────────────────────────

/** Les pages exportées, proposées dans la fenêtre « Ajouter » de la galerie. */
export async function listGalleryItems(query: GallerySourceQuery = {}): Promise<GallerySourcePage> {
  return gallery.listGalleryItems(query);
}

/** Copie des pages exportées dans la galerie. Une page déjà copiée n'est pas dupliquée. */
export async function importGalleryItems(ids: string[]): Promise<GallerySourceImport> {
  return gallery.importGalleryItems(ids);
}

// ─── Cycle de vie ────────────────────────────────────────────────

const moduleHooks: ModuleHooks = {
  onInit: () => ensureDirs(),
};

export function initModule() {
  ensureDirs();
  return moduleHooks;
}

export default moduleHooks;
