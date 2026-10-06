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
import type { CatalogSectionCollection, CatalogSectionItem, CatalogSectionListing, CatalogSectionMedia } from "@/types/modules";
import type { ChapterSharing, ChapterVisibility, DetectorChoice, DetectorStatus, DetectorVariantId } from "./lib/types";
import * as ai from "./lib/server/ai";
import * as fonts from "./lib/server/fonts";
import * as gallery from "./lib/server/gallery";
import * as library from "./lib/server/library";
import * as publicReading from "./lib/server/public";
import * as sources from "./lib/server/sources";
import * as translation from "./lib/server/translation";
import * as detector from "./lib/server/detector";
import { ensureDirs } from "./lib/store";
import type { LinkImportReport } from "./lib/library-helpers";
import type {
  AiCatalogue,
  AiPageVersion,
  AiReadingProposal,
  AiSettingsPatch,
  AiTranslationProposal,
  CustomFont,
  FontUsage,
} from "./lib/types";
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
  patch: { name?: string; defaults?: ChapterSettings; glossary?: GlossaryEntry[]; defaultVisibility?: ChapterVisibility }
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

/** Efface des images déposées qui n'ont pas pu être rattachées à un chapitre. */
export async function discardUploads(files: UploadedFile[]): Promise<{ discarded: number }> {
  return library.discardUploads(files);
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
 * Copie les pages d'un chapitre dans la galerie, dans l'ordre de lecture : le
 * rendu des pages exportées, et telles quelles les pages « laissées telles
 * quelles ». Elles sont réunies dans un album privé, un par chapitre ;
 * `albumId` manque si l'album n'a pas pu être créé.
 */
export async function sendChapterToGallery(chapterId: string): Promise<{ saved: number; albumId?: number }> {
  return gallery.sendChapterToGallery(chapterId);
}

// ─── Lecture publique (§ 11.2 du dossier) ────────────────────────

/**
 * Change la visibilité d'un chapitre : privé, public par son lien, listé au
 * catalogue. Refusé tant qu'aucune page n'est exportée. Repasser en privé
 * efface l'adresse publique, tout de suite.
 */
export async function setChapterVisibility(chapterId: string, visibility: ChapterVisibility): Promise<ChapterSharing> {
  return library.setChapterVisibility(chapterId, visibility);
}

// Les quatre fonctions qui suivent servent le catalogue public
// (`catalogSections`), sans compte : audience `public` dans `module.json`,
// jamais appelables par le navigateur. Elles ne font que lire, et ne rendent
// que des champs publics.

/** Les séries qui ont au moins un chapitre listé au catalogue. */
export async function listPublicSeries(): Promise<CatalogSectionListing> {
  return publicReading.listPublicSeries();
}

/** Une série et ses chapitres listés ; `null` si elle n'en a aucun. */
export async function getPublicSeries(seriesSlug: string): Promise<CatalogSectionCollection | null> {
  return publicReading.getPublicSeries(seriesSlug);
}

/** Un chapitre public et les adresses de ses pages exportées ; `null` s'il est privé ou inconnu. */
export async function getPublicChapter(seriesSlug: string, chapterSlug: string): Promise<CatalogSectionItem | null> {
  return publicReading.getPublicChapter(seriesSlug, chapterSlug);
}

/** Le rendu, ou sa vignette, que désigne une adresse d'image publique ; `null` pour tout le reste. */
export async function openPublicMedia(parts: string[]): Promise<CatalogSectionMedia | null> {
  return publicReading.openPublicMedia(parts);
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

// ─── Détecteur de bulles et de texte ─────────────────────────────

/** La variante choisie, ce qui est installé, et l'adresse du modèle pour le navigateur. */
export async function getDetector(): Promise<DetectorStatus> {
  return detector.getDetector();
}

/** Réservé aux administrateurs (absent de `module.json`) : choisit la variante en service, ou coupe le détecteur. */
export async function setDetectorChoice(choice: DetectorChoice): Promise<DetectorStatus> {
  return detector.setDetectorChoice(choice);
}

/** Réservé aux administrateurs (absent de `module.json`) : télécharge le modèle d'une variante, vérifié à l'arrivée. */
export async function downloadDetector(variant: DetectorVariantId): Promise<DetectorStatus> {
  return detector.downloadDetector(variant);
}

/** Réservé aux administrateurs (absent de `module.json`) : efface le modèle d'une variante. */
export async function removeDetector(variant: DetectorVariantId): Promise<DetectorStatus> {
  return detector.removeDetector(variant);
}

/** Réservé aux administrateurs (absent de `module.json`) : la consommation du compte, lue chez le service. */
export async function readEngineUsage(engineId: TranslationEngineId): Promise<{ ok: boolean; message: string; used?: number; limit?: number }> {
  return translation.readEngineUsage(engineId);
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

// ─── Polices ajoutées (§ 8 du dossier) ───────────────────────────

/** Les polices ajoutées par le propriétaire de l'instance. */
export async function listFonts(): Promise<CustomFont[]> {
  return fonts.listFonts();
}

/**
 * Contenu d'une police, pour le navigateur d'un compte connecté : une police
 * ajoutée n'a pas d'adresse, elle ne sort que par cette fonction.
 */
export async function getFontFile(fontId: string): Promise<Buffer> {
  return fonts.readFontFile(fontId);
}

/** Pages, chapitres et dossiers qui portent une police : ce qui changerait si elle était retirée. */
export async function getFontUsage(fontId: string): Promise<FontUsage> {
  return fonts.getFontUsage(fontId);
}

/** Réservé aux administrateurs : absente de `functions` dans `module.json`. Le fichier est contrôlé avant d'être gardé. */
export async function addFont(data: Uint8Array, name?: string): Promise<CustomFont> {
  return fonts.addFont({ data, name });
}

/** Réservé aux administrateurs : change le nom affiché, sans toucher aux pages. */
export async function renameFont(fontId: string, name: string): Promise<CustomFont> {
  return fonts.renameFont(fontId, name);
}

/**
 * Réservé aux administrateurs. Une police encore utilisée n'est retirée qu'avec
 * `replaceWith`, la police que prendront les pages qui la portaient.
 */
export async function removeFont(fontId: string, options?: { replaceWith?: string }): Promise<{ removed: boolean; replaced: FontUsage }> {
  return fonts.removeFont(fontId, options);
}

// ─── IA en dernier recours (niveau 3, § 3 et § 6.8 du dossier) ───
// Chaque appel part d'un clic sur une zone ou une page ; le serveur refuse tout
// si le niveau du chapitre est sous 3, et tient le plafond mensuel d'appels.

/** Modèles de la palette d'IA proposés pour ce chapitre, et appels du mois. N'appelle aucun fournisseur. */
export async function getAiCatalogue(chapterId: string): Promise<AiCatalogue> {
  return ai.getAiCatalogue(chapterId);
}

/** Appels à l'IA du mois, et plafond. */
export async function getAiUsage(): Promise<{ month: number; monthlyLimit: number }> {
  return ai.getAiUsage();
}

/** Réservé aux administrateurs : le plafond mensuel d'appels à l'IA. */
export async function saveAiSettings(patch: AiSettingsPatch): Promise<{ month: number; monthlyLimit: number }> {
  return ai.saveAiSettings(patch);
}

/** Relit une zone : son image part chez un modèle, la lecture revient comme une proposition. */
export async function askAiReading(pageId: string, regionId: string, options?: { model?: string }): Promise<AiReadingProposal> {
  return ai.askAiReading(pageId, regionId, options);
}

/** Traduit une zone, ou les zones d'une page, avec le contexte, en un seul appel. Rend des propositions. */
export async function askAiTranslation(pageId: string, regionIds: string[], options?: { model?: string }): Promise<AiTranslationProposal> {
  return ai.askAiTranslation(pageId, regionIds, options);
}

/** Traduit la page entière par un moteur d'image, en une version gardée à côté du travail de l'atelier. */
export async function askAiPage(pageId: string, options?: { model?: string }): Promise<AiPageVersion> {
  return ai.askAiPage(pageId, options);
}

export async function listAiPageVersions(pageId: string): Promise<AiPageVersion[]> {
  return ai.listAiPageVersions(pageId);
}

export async function deleteAiPageVersion(pageId: string, versionId: string): Promise<{ deleted: boolean }> {
  return ai.deleteAiPageVersion(pageId, versionId);
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
