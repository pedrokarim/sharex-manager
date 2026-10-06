/**
 * La bibliothèque de Scan Studio : dossiers, chapitres, pages.
 *
 * Les règles sont ici, la lecture et l'écriture dans `../store.ts`. Deux
 * principes tiennent l'ensemble :
 *
 * - tout ce qui lit puis réécrit une fiche le fait d'une traite, sans `await`
 *   entre les deux : deux appels simultanés ne peuvent pas se marcher dessus.
 *   Le travail lent (ouvrir des images, calculer des vignettes) est fait
 *   avant ;
 * - une fonction qui ne trouve pas ce qu'on lui demande lève une erreur, elle
 *   ne rend jamais une valeur de remplacement.
 */

import fs from "fs";
import path from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import { sortNatural } from "../natural-sort";
import { isPageStatus, sanitizeRegions } from "../sanitize-page";
import {
  assetExists,
  assetPath,
  assetUrl,
  ensureDirs,
  exportThumbName,
  isAssetName,
  newAssetName,
  newChapterId,
  newFolderId,
  newPageId,
  pageThumbName,
  readAllFolders,
  readChapter,
  readExports,
  readFolder,
  readPage,
  referencedAssets,
  removeAsset,
  removeChapter,
  removeFolder,
  removePage,
  removeThumb,
  thumbPath,
  thumbUrl,
  writeChapter,
  writeExports,
  writeFolder,
  writePage,
} from "../store";
import {
  DEFAULT_CHAPTER_SETTINGS,
  isId,
  type ChapterOrigin,
  type ChapterSettings,
  type ChapterSharing,
  type ChapterSummary,
  type ChapterView,
  type FolderSummary,
  type FolderView,
  type GlossaryEntry,
  type PageStatus,
  type PageSummary,
  type PageView,
  type ScanChapter,
  type ScanFolder,
  type ScanPage,
  type ScanRegion,
  type UploadedFile,
} from "../types";
import { probeImage, writeThumbnail, type ImageInfo } from "./images";
import { isChapterVisibility, isPublishablePage, newPublicSlug, publicChapterPath, visibilityOf } from "./visibility";
import { approvedPairs, forgetMemory, recordMemory } from "./translation/memory";
import {
  sanitizeChapterNumber,
  sanitizeChapterTitle,
  sanitizeFolderName,
  sanitizeGlossary,
  sanitizeSettings,
} from "./sanitize-settings";

/** Images rattachées en un appel. */
export const MAX_IMPORT_FILES = 300;
const MAX_CHAPTER_PAGES = 2000;
const MAX_FOLDER_CHAPTERS = 2000;
/** Même plafond que l'envoi direct du module (`uploads.maxMb`). */
const MAX_GALLERY_FILE_BYTES = 40 * 1024 * 1024;
const GALLERY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

// ─── Lecture stricte ─────────────────────────────────────────────

export function requireFolder(id: unknown): ScanFolder {
  const folder = readFolder(id);
  if (!folder) throw new Error("Dossier introuvable.");
  return folder;
}

export function requireChapter(id: unknown): ScanChapter {
  const chapter = readChapter(id);
  if (!chapter) throw new Error("Chapitre introuvable.");
  return chapter;
}

export function requirePage(id: unknown): ScanPage {
  const page = readPage(id);
  if (!page) throw new Error("Page introuvable.");
  return page;
}

function asPatch(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Modification invalide.");
  return value as Record<string, unknown>;
}

/** Vérifie qu'un nouvel ordre contient exactement les identifiants connus, une fois chacun. */
function assertSameIds(given: unknown, known: string[], message: string): asserts given is string[] {
  if (!Array.isArray(given) || given.length !== known.length || !given.every(isId)) throw new Error(message);
  const expected = new Set(known);
  if (new Set(given).size !== given.length || !given.every((id) => expected.has(id))) throw new Error(message);
}

// ─── Résumés ─────────────────────────────────────────────────────

export function summarizePage(page: ScanPage): PageSummary {
  return {
    id: page.id,
    chapterId: page.chapterId,
    name: page.name,
    width: page.source.width,
    height: page.source.height,
    status: page.status,
    skipped: page.skipped === true,
    regionCount: page.regions.length,
    imageUrl: assetUrl(page.source.file),
    thumbUrl: thumbUrl(pageThumbName(page.id)),
    exportUrl: page.exported ? assetUrl(page.exported.file) : undefined,
    updatedAt: page.updatedAt,
  };
}

/** Pages d'un chapitre, dans l'ordre de lecture. Une fiche de page perdue est passée sous silence ici seulement. */
function pagesOf(chapter: ScanChapter): ScanPage[] {
  return chapter.pageIds.flatMap((id) => readPage(id) ?? []);
}

/** Pages d'un chapitre qui peuvent être lues en public : exportées, rendu présent, pas « laissées telles quelles ». */
function countPublishable(pages: ScanPage[]): number {
  return pages.filter((page) => isPublishablePage(page) && assetExists(page.exported!.file)).length;
}

/** Adresse de lecture publique d'un chapitre ; absente tant qu'il est privé. */
function publicPathOf(chapter: ScanChapter, folder: ScanFolder | null): string | undefined {
  if (visibilityOf(chapter) === "private" || !chapter.publicSlug || !folder?.publicSlug) return undefined;
  return publicChapterPath(folder.publicSlug, chapter.publicSlug);
}

function summarizeChapter(chapter: ScanChapter, pages = pagesOf(chapter), folder: ScanFolder | null = readFolder(chapter.folderId)): ChapterSummary {
  const progress: Record<PageStatus, number> = { imported: 0, analyzed: 0, translated: 0, reviewed: 0, exported: 0 };
  let updatedAt = chapter.updatedAt;
  for (const page of pages) {
    if (page.status in progress) progress[page.status]++;
    // Enregistrer une page ne réécrit pas son chapitre : la date la plus récente se lit ici.
    updatedAt = Math.max(updatedAt, page.updatedAt);
  }
  return {
    id: chapter.id,
    folderId: chapter.folderId,
    number: chapter.number,
    title: chapter.title,
    pageCount: pages.length,
    progress,
    cover: pages[0] ? thumbUrl(pageThumbName(pages[0].id)) : undefined,
    visibility: visibilityOf(chapter),
    publishablePages: countPublishable(pages),
    publicPath: publicPathOf(chapter, folder),
    updatedAt,
  };
}

function chaptersOf(folder: ScanFolder): ScanChapter[] {
  return folder.chapterIds.flatMap((id) => readChapter(id) ?? []);
}

/** La liste des dossiers ne lit aucune page : le nombre de pages vient des chapitres. */
function summarizeFolder(folder: ScanFolder): FolderSummary {
  const chapters = chaptersOf(folder);
  const illustrated = [...chapters].reverse().find((chapter) => chapter.pageIds.length > 0);
  return {
    id: folder.id,
    name: folder.name,
    chapterCount: chapters.length,
    pageCount: chapters.reduce((sum, chapter) => sum + chapter.pageIds.length, 0),
    // La couverture de la série quand on l'a ; sinon la première page du dernier chapitre.
    cover: folder.cover && assetExists(folder.cover.file) ? assetUrl(folder.cover.file) : illustrated ? thumbUrl(pageThumbName(illustrated.pageIds[0])) : undefined,
    updatedAt: Math.max(folder.updatedAt, ...chapters.map((chapter) => chapter.updatedAt)),
  };
}

// ─── Dossiers ────────────────────────────────────────────────────

/** Du plus récemment modifié au plus ancien. */
export function listFolders(): FolderSummary[] {
  return readAllFolders()
    .map(summarizeFolder)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getFolder(folderId: unknown): FolderView {
  const folder = requireFolder(folderId);
  return { folder, chapters: chaptersOf(folder).map((chapter) => summarizeChapter(chapter, undefined, folder)) };
}

export function createFolder(input: unknown): ScanFolder {
  const name = sanitizeFolderName(asPatch(input).name);
  const now = Date.now();
  const folder: ScanFolder = {
    id: newFolderId(),
    name,
    defaults: structuredClone(DEFAULT_CHAPTER_SETTINGS),
    glossary: [],
    chapterIds: [],
    createdAt: now,
    updatedAt: now,
  };
  writeFolder(folder);
  return folder;
}

export function updateFolder(folderId: unknown, patch: unknown): ScanFolder {
  const changes = asPatch(patch);
  // Tout est contrôlé avant la relecture : rien n'est écrit si un champ est refusé.
  const name = changes.name === undefined ? undefined : sanitizeFolderName(changes.name);
  const defaults: ChapterSettings | undefined = changes.defaults === undefined ? undefined : sanitizeSettings(changes.defaults);
  const glossary: GlossaryEntry[] | undefined = changes.glossary === undefined ? undefined : sanitizeGlossary(changes.glossary);
  if (changes.defaultVisibility !== undefined && !isChapterVisibility(changes.defaultVisibility)) throw new Error("Visibilité inconnue.");

  const folder = requireFolder(folderId);
  if (name !== undefined) folder.name = name;
  if (defaults) folder.defaults = defaults;
  if (glossary) folder.glossary = glossary;
  if (changes.defaultVisibility !== undefined) {
    // Ne vaut que pour les chapitres créés ensuite : les chapitres existants gardent la leur.
    if (changes.defaultVisibility === "private") delete folder.defaultVisibility;
    else folder.defaultVisibility = changes.defaultVisibility;
  }
  folder.updatedAt = Date.now();
  writeFolder(folder);
  return folder;
}

export function deleteFolder(folderId: unknown): { deleted: boolean } {
  const folder = requireFolder(folderId);
  const chapters = chaptersOf(folder);
  // La fiche du dossier d'abord : après une coupure, il ne reste au pire que des fichiers sans attache.
  removeFolder(folder.id);
  for (const chapter of chapters) removeChapter(chapter.id);
  removePages(chapters.flatMap((chapter) => chapter.pageIds));
  // La couverture n'appartient qu'à lui.
  if (folder.cover && !referencedAssets().has(folder.cover.file)) removeAsset(folder.cover.file);
  // La mémoire de traduction appartient au dossier : elle part avec lui.
  forgetMemory(folder.id);
  return { deleted: true };
}

/**
 * Donne sa couverture à un dossier : un fichier déjà déposé dans `assets/`.
 * L'ancienne est effacée si plus rien ne s'en sert.
 */
export function setFolderCover(folderId: unknown, file: unknown): ScanFolder {
  const folder = requireFolder(folderId);
  if (!isAssetName(file) || !assetExists(file)) throw new Error("Couverture introuvable.");
  const previous = folder.cover?.file;
  folder.cover = { file };
  folder.updatedAt = Date.now();
  writeFolder(folder);
  if (previous && previous !== file && !referencedAssets().has(previous)) removeAsset(previous);
  return folder;
}

export function reorderChapters(folderId: unknown, chapterIds: unknown): ScanFolder {
  const folder = requireFolder(folderId);
  assertSameIds(chapterIds, folder.chapterIds, "L'ordre envoyé ne correspond pas aux chapitres du dossier.");
  folder.chapterIds = [...chapterIds];
  folder.updatedAt = Date.now();
  writeFolder(folder);
  return folder;
}

// ─── Chapitres ───────────────────────────────────────────────────

export function getChapter(chapterId: unknown): ChapterView {
  const chapter = requireChapter(chapterId);
  const folder = requireFolder(chapter.folderId);
  const pages = pagesOf(chapter);
  return {
    chapter,
    folder: { id: folder.id, name: folder.name },
    pages: pages.map(summarizePage),
    publishablePages: countPublishable(pages),
    publicPath: publicPathOf(chapter, folder),
  };
}

export function createChapter(folderId: unknown, input: unknown): ScanChapter {
  const fields = asPatch(input);
  const number = sanitizeChapterNumber(fields.number);
  const title = sanitizeChapterTitle(fields.title);

  const folder = requireFolder(folderId);
  if (folder.chapterIds.length >= MAX_FOLDER_CHAPTERS) {
    throw new Error(`Ce dossier a atteint ${MAX_FOLDER_CHAPTERS} chapitres.`);
  }
  const now = Date.now();
  const id = newChapterId();
  // Le dossier a pu demander que ses nouveaux chapitres naissent publics : le
  // chapitre reçoit alors son adresse, mais n'a rien à montrer avant son premier export.
  const visibility = visibilityOf({ visibility: folder.defaultVisibility });
  const chapter: ScanChapter = {
    id,
    folderId: folder.id,
    number,
    ...(title ? { title } : {}),
    settings: structuredClone(folder.defaults),
    pageIds: [],
    ...(visibility === "private" ? {} : { visibility, publicSlug: newPublicSlug(id) }),
    createdAt: now,
    updatedAt: now,
  };
  if (visibility !== "private") folder.publicSlug ??= newPublicSlug(folder.id);
  // Le chapitre avant le dossier : le dossier ne cite jamais un chapitre qui n'existe pas.
  writeChapter(chapter);
  folder.chapterIds.push(chapter.id);
  folder.updatedAt = now;
  writeFolder(folder);
  return chapter;
}

export function updateChapter(chapterId: unknown, patch: unknown): ScanChapter {
  const changes = asPatch(patch);
  const number = changes.number === undefined ? undefined : sanitizeChapterNumber(changes.number);
  const title = sanitizeChapterTitle(changes.title);
  const settings = changes.settings === undefined ? undefined : sanitizeSettings(changes.settings);

  const chapter = requireChapter(chapterId);
  if (number !== undefined) chapter.number = number;
  if (changes.title !== undefined) {
    // Un titre vidé est retiré, pas gardé comme chaîne vide.
    if (title) chapter.title = title;
    else delete chapter.title;
  }
  if (settings) chapter.settings = settings;
  chapter.updatedAt = Date.now();
  writeChapter(chapter);
  return chapter;
}

export function deleteChapter(chapterId: unknown): { deleted: boolean } {
  const chapter = requireChapter(chapterId);
  const folder = readFolder(chapter.folderId);
  if (folder) {
    folder.chapterIds = folder.chapterIds.filter((id) => id !== chapter.id);
    folder.updatedAt = Date.now();
    writeFolder(folder);
  }
  removeChapter(chapter.id);
  removePages(chapter.pageIds);
  return { deleted: true };
}

// ─── Lecture publique ────────────────────────────────────────────

/**
 * Change la visibilité d'un chapitre (§ 11.2 du dossier) : privé, public par
 * son lien, listé au catalogue. C'est le seul geste qui rend un chapitre
 * existant public.
 *
 * - Un chapitre sans page exportée ne se publie pas : il n'aurait rien à
 *   montrer, et seules les pages exportées sont servies.
 * - Repasser en privé efface l'adresse publique : les anciens liens ne mènent
 *   plus à rien, et une nouvelle publication donnera une autre adresse. Les
 *   lectures publiques relisent la fiche à chaque demande : l'effet est
 *   immédiat.
 */
export function setChapterVisibility(chapterId: unknown, visibility: unknown): ChapterSharing {
  if (!isChapterVisibility(visibility)) throw new Error("Visibilité inconnue.");

  const chapter = requireChapter(chapterId);
  const folder = requireFolder(chapter.folderId);
  const publishablePages = countPublishable(pagesOf(chapter));
  if (visibility !== "private" && publishablePages === 0) {
    throw new Error("Ce chapitre n'a aucune page exportée : exportez au moins une page depuis l'atelier avant de le publier.");
  }

  const now = Date.now();
  if (visibility === "private") {
    delete chapter.visibility;
    delete chapter.publicSlug;
  } else {
    chapter.visibility = visibility;
    chapter.publicSlug ??= newPublicSlug(chapter.id);
    if (!folder.publicSlug) {
      // Le dossier d'abord : un chapitre public ne cite jamais une série sans adresse.
      folder.publicSlug = newPublicSlug(folder.id);
      folder.updatedAt = now;
      writeFolder(folder);
    }
  }
  chapter.updatedAt = now;
  writeChapter(chapter);
  return { visibility: visibilityOf(chapter), publicPath: publicPathOf(chapter, folder), publishablePages };
}

/** Texte court sur une ligne, sans caractère de contrôle ; `undefined` s'il est vide ou mal formé. */
function shortLine(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const line = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return line || undefined;
}

/**
 * Note d'où vient un chapitre importé par lien : le site, l'adresse du
 * chapitre chez lui et l'équipe qu'il crédite. Ni le titre ni le numéro du
 * chapitre ne sont touchés. Appelé par l'import, jamais par le navigateur.
 */
export function recordChapterOrigin(chapterId: unknown, origin: { source?: unknown; url?: unknown; credit?: unknown }): void {
  const source = shortLine(origin?.source, 80);
  if (!source) return;
  const credit = shortLine(origin.credit, 200);
  let url: string | undefined;
  try {
    const parsed = new URL(String(origin.url ?? ""));
    if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.href.slice(0, 500);
  } catch {
    // Pas d'adresse lisible : la source reste nommée, sans lien.
  }
  const chapter = readChapter(chapterId);
  if (!chapter) return;
  const next: ChapterOrigin = { source, ...(url ? { url } : {}), ...(credit ? { credit } : {}) };
  chapter.origin = next;
  writeChapter(chapter);
}

export function reorderPages(chapterId: unknown, pageIds: unknown): ScanChapter {
  const chapter = requireChapter(chapterId);
  assertSameIds(pageIds, chapter.pageIds, "L'ordre envoyé ne correspond pas aux pages du chapitre.");
  chapter.pageIds = [...pageIds];
  chapter.updatedAt = Date.now();
  writeChapter(chapter);
  return chapter;
}

// ─── Suppression de pages ────────────────────────────────────────

/**
 * Efface des pages et tout ce qui leur appartient : fiche, vignettes, image
 * d'origine, rendu, versions traduites par IA. Un fichier de `assets/` n'est effacé que si aucune page
 * restante ne s'en sert (la même image peut avoir été rattachée deux fois).
 */
function removePages(pageIds: string[]) {
  if (pageIds.length === 0) return;
  const doomed = new Set(pageIds);
  const pages = pageIds.flatMap((id) => readPage(id) ?? []);
  const stillUsed = referencedAssets(doomed);

  for (const page of pages) {
    removePage(page.id);
    removeThumb(pageThumbName(page.id));
    if (!stillUsed.has(page.source.file)) removeAsset(page.source.file);
    if (page.exported && !stillUsed.has(page.exported.file)) dropExportFiles(page.exported.file);
    // Les versions traduites par IA n'appartiennent qu'à leur page.
    for (const version of page.aiVersions ?? []) if (version?.file && !stillUsed.has(version.file)) removeAsset(version.file);
  }

  const exports = readExports();
  const kept = exports.filter((entry) => !doomed.has(entry.pageId));
  if (kept.length !== exports.length) writeExports(kept);
}

function dropExportFiles(file: string) {
  removeAsset(file);
  removeThumb(exportThumbName(file));
}

export function deletePage(pageId: unknown): { deleted: boolean } {
  const page = requirePage(pageId);
  const chapter = readChapter(page.chapterId);
  if (chapter) {
    chapter.pageIds = chapter.pageIds.filter((id) => id !== page.id);
    chapter.updatedAt = Date.now();
    writeChapter(chapter);
  }
  removePages([page.id]);
  return { deleted: true };
}

/**
 * Marque une page « à laisser telle quelle » (couverture, bannière, crédits),
 * ou lève cette marque. Ses zones ne sont pas touchées : on peut revenir en
 * arrière sans rien perdre.
 */
export function setPageSkipped(pageId: unknown, skipped: unknown): PageSummary {
  const page = requirePage(pageId);
  if (typeof skipped !== "boolean") throw new Error("Réglage invalide.");
  if ((page.skipped === true) !== skipped) {
    if (skipped) page.skipped = true;
    else delete page.skipped;
    page.updatedAt = Date.now();
    // La marque ne change pas les zones : l'atelier peut continuer d'enregistrer
    // avec la révision qu'il connaît.
    writePage(page);
  }
  return summarizePage(page);
}

// ─── Import de pages ─────────────────────────────────────────────

/** Nom d'origine d'une image, tel qu'on l'affiche : sans chemin ni caractère de contrôle. */
function displayName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const name = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()!
    .trim()
    .slice(0, 200);
  return name || fallback;
}

interface PendingPage extends UploadedFile {
  /** Déjà mesurée par l'appelant : inutile de rouvrir l'image. */
  info?: ImageInfo;
}

/**
 * Rattache à un chapitre des images présentes dans `assets/`, dans l'ordre
 * naturel de leurs noms, à la suite des pages existantes. Tout ou rien : si
 * une image est refusée, aucune page n'est créée.
 */
async function attachPages(chapterId: unknown, files: PendingPage[]): Promise<PageSummary[]> {
  requireChapter(chapterId);
  ensureDirs();

  const ordered = sortNatural(files, (file) => file.name);
  const prepared: { page: ScanPage; info: ImageInfo }[] = [];
  const thumbs: string[] = [];

  try {
    for (const file of ordered) {
      let info = file.info;
      if (!info) {
        try {
          info = await probeImage(assetPath(file.file), file.name);
        } catch (error) {
          // Ce fichier ne deviendra jamais une page : il ne reste pas sur le disque.
          if (!referencedAssets().has(file.file)) removeAsset(file.file);
          throw error;
        }
      }
      const id = newPageId();
      const thumb = pageThumbName(id);
      await writeThumbnail(assetPath(file.file), thumbPath(thumb), info);
      thumbs.push(thumb);

      const now = Date.now();
      const page: ScanPage = {
        id,
        chapterId: String(chapterId),
        name: file.name,
        source: { file: file.file, width: info.width, height: info.height },
        regions: [],
        status: "imported",
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      // La fiche est écrite tout de suite : elle réserve l'identifiant de la page.
      writePage(page);
      prepared.push({ page, info });
    }

    // D'une traite à partir d'ici. Le chapitre a pu changer, ou disparaître, pendant le calcul des vignettes.
    const chapter = requireChapter(chapterId);
    if (chapter.pageIds.length + prepared.length > MAX_CHAPTER_PAGES) {
      throw new Error(`Un chapitre ne dépasse pas ${MAX_CHAPTER_PAGES} pages.`);
    }
    chapter.pageIds.push(...prepared.map(({ page }) => page.id));
    chapter.updatedAt = Date.now();
    writeChapter(chapter);
  } catch (error) {
    for (const { page } of prepared) removePage(page.id);
    for (const thumb of thumbs) removeThumb(thumb);
    throw error;
  }

  return prepared.map(({ page }) => summarizePage(page));
}

/** Rattache des images déjà déposées par la route d'envoi du module. */
export async function importPages(chapterId: unknown, files: unknown): Promise<PageSummary[]> {
  requireChapter(chapterId);
  if (!Array.isArray(files) || files.length === 0) throw new Error("Aucune image à ajouter.");
  if (files.length > MAX_IMPORT_FILES) throw new Error(`Ajoutez ${MAX_IMPORT_FILES} images au plus à la fois.`);

  const seen = new Set<string>();
  const pending: PendingPage[] = files.map((entry) => {
    const file = entry && typeof entry === "object" ? (entry as Record<string, unknown>).file : undefined;
    if (!isAssetName(file)) throw new Error("Fichier déposé invalide.");
    if (seen.has(file)) throw new Error("La même image a été envoyée deux fois.");
    seen.add(file);
    return { file, name: displayName((entry as Record<string, unknown>).name, file) };
  });
  for (const { file, name } of pending) {
    if (!assetExists(file)) throw new Error(`Image déposée introuvable : « ${name} ».`);
  }
  return attachPages(chapterId, pending);
}

/**
 * Efface des images déposées par la route d'envoi qui n'ont pas pu être
 * rattachées : sans cela, elles resteraient dans `assets/` sans page. Seul
 * un fichier dont plus rien ne se sert est effacé ; les autres sont laissés.
 */
export function discardUploads(files: unknown): { discarded: number } {
  if (!Array.isArray(files) || files.length > MAX_IMPORT_FILES) throw new Error("Liste de fichiers invalide.");
  const names = new Set<string>();
  for (const entry of files) {
    const file = entry && typeof entry === "object" ? (entry as Record<string, unknown>).file : entry;
    if (!isAssetName(file)) throw new Error("Fichier déposé invalide.");
    names.add(file);
  }
  const used = referencedAssets();
  let discarded = 0;
  for (const file of names) {
    if (used.has(file) || !assetExists(file)) continue;
    removeAsset(file);
    discarded++;
  }
  return { discarded };
}

/** Nom simple d'un fichier de la galerie : ni chemin, ni remontée, ni fichier caché, image seulement. */
function assertGalleryName(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    /[\\/\u0000-\u001f:*?"<>|]/.test(value) ||
    value.includes("..") ||
    value.startsWith(".") ||
    !GALLERY_EXTENSIONS.has(path.extname(value).toLowerCase())
  ) {
    throw new Error("Fichier de la galerie invalide : seules les images sont acceptées.");
  }
}

/** Copie des images de la galerie dans les données du module, puis les rattache au chapitre. */
export async function importGalleryFiles(chapterId: unknown, fileNames: unknown): Promise<PageSummary[]> {
  requireChapter(chapterId);
  if (!Array.isArray(fileNames) || fileNames.length === 0) throw new Error("Aucune image à ajouter.");
  if (fileNames.length > MAX_IMPORT_FILES) throw new Error(`Ajoutez ${MAX_IMPORT_FILES} images au plus à la fois.`);
  if (new Set(fileNames).size !== fileNames.length) throw new Error("La même image a été choisie deux fois.");
  for (const name of fileNames) assertGalleryName(name);

  const uploads = path.resolve(getAbsoluteUploadPath());
  ensureDirs();
  const copied: PendingPage[] = [];
  try {
    for (const name of fileNames as string[]) {
      const source = path.join(uploads, name);
      // `lstat` : un lien symbolique posé dans les uploads n'est pas suivi.
      const stats = path.dirname(source) === uploads ? fs.lstatSync(source, { throwIfNoEntry: false }) : undefined;
      if (!stats?.isFile()) throw new Error(`Image introuvable dans la galerie : « ${name} ».`);
      if (stats.size > MAX_GALLERY_FILE_BYTES) throw new Error(`« ${name} » est trop lourde (40 Mo au plus).`);

      // L'extension du rendu suit le type réel, pas le nom du fichier.
      const info = await probeImage(source, name);
      const file = newAssetName(info.extension);
      fs.copyFileSync(source, assetPath(file), fs.constants.COPYFILE_EXCL);
      copied.push({ file, name, info });
    }
    return await attachPages(chapterId, copied);
  } catch (error) {
    for (const { file } of copied) removeAsset(file);
    throw error;
  }
}

// ─── Atelier ─────────────────────────────────────────────────────

export function getPage(pageId: unknown): PageView {
  const page = requirePage(pageId);
  const chapter = requireChapter(page.chapterId);
  const folder = requireFolder(chapter.folderId);
  return {
    page,
    imageUrl: assetUrl(page.source.file),
    exportUrl: page.exported ? assetUrl(page.exported.file) : undefined,
    chapter: {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      settings: chapter.settings,
      pageIds: chapter.pageIds,
    },
    folder: { id: folder.id, name: folder.name },
  };
}

/**
 * Mémoire de traduction (§ 6.5 du dossier) : les zones validées d'une page
 * qu'on enregistre y déposent leur phrase et sa traduction, pour le dossier et
 * la langue cible du chapitre. La page est déjà écrite : une mémoire qui ne
 * s'écrit pas ne fait jamais échouer l'enregistrement.
 */
function rememberApproved(chapterId: string, regions: ScanRegion[]) {
  try {
    const pairs = approvedPairs(regions);
    if (pairs.length === 0) return;
    const chapter = readChapter(chapterId);
    if (chapter) recordMemory(chapter.folderId, chapter.settings.targetLanguage, pairs);
  } catch (error) {
    console.error("[scan-studio] mémoire de traduction non enregistrée :", error);
  }
}

/**
 * Enregistre les zones d'une page. `revision` est celle que l'atelier a lue :
 * si la page a été enregistrée entre-temps (un autre onglet), on refuse au
 * lieu d'écraser.
 */
export function savePage(pageId: unknown, input: unknown): { revision: number; updatedAt: number } {
  const fields = asPatch(input);
  if (!Number.isInteger(fields.revision)) throw new Error("Révision de la page manquante.");
  if (fields.status !== undefined && !isPageStatus(fields.status)) throw new Error("État de page inconnu.");

  const page = requirePage(pageId);
  if (fields.revision !== page.revision) {
    throw new Error("Cette page a été modifiée ailleurs depuis son ouverture : rechargez-la avant d'enregistrer.");
  }
  const regions: ScanRegion[] = sanitizeRegions(fields.regions, page.source);

  page.regions = regions;
  if (fields.status !== undefined) page.status = fields.status;
  page.revision += 1;
  page.updatedAt = Date.now();
  writePage(page);
  rememberApproved(page.chapterId, regions);
  return { revision: page.revision, updatedAt: page.updatedAt };
}

/**
 * Déclare le rendu d'une page, déjà déposé par la route d'envoi. Il remplace
 * le précédent, dont le fichier est effacé. La révision ne bouge pas : un
 * export ne doit pas faire refuser l'enregistrement suivant de l'atelier.
 */
export async function registerExport(pageId: unknown, file: unknown): Promise<PageSummary> {
  const known = requirePage(pageId);
  if (!isAssetName(file)) throw new Error("Rendu invalide.");
  if (!assetExists(file)) throw new Error("Rendu introuvable : l'envoi n'a pas abouti.");
  if (known.source.file === file) throw new Error("Le rendu ne peut pas être l'image d'origine de la page.");
  if (referencedAssets(new Set([String(pageId)])).has(file)) {
    throw new Error("Ce fichier appartient déjà à une autre page.");
  }

  ensureDirs();
  let info: ImageInfo;
  try {
    info = await probeImage(assetPath(file), "Le rendu");
  } catch (error) {
    if (!referencedAssets().has(file)) removeAsset(file);
    throw error;
  }
  const thumb = exportThumbName(file);
  await writeThumbnail(assetPath(file), thumbPath(thumb), info);

  // D'une traite à partir d'ici.
  const page = readPage(pageId);
  if (!page) {
    dropExportFiles(file);
    throw new Error("Page introuvable.");
  }
  const previous = page.exported?.file;
  const now = Date.now();
  page.exported = { file, at: now };
  page.status = "exported";
  page.updatedAt = now;
  writePage(page);

  if (previous && previous !== file && !referencedAssets().has(previous)) dropExportFiles(previous);
  const exports = readExports();
  // Le même rendu déclaré deux fois garde le souvenir de sa copie dans la galerie.
  const galleryFile = exports.find((entry) => entry.pageId === page.id && entry.file === file)?.galleryFile;
  writeExports([
    { pageId: page.id, chapterId: page.chapterId, pageName: page.name, file, at: now, ...(galleryFile ? { galleryFile } : {}) },
    ...exports.filter((entry) => entry.pageId !== page.id),
  ]);
  return summarizePage(page);
}
