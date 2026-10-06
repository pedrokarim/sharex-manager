/**
 * Lecture publique de Scan Studio (§ 11.2 du dossier) : ce que le catalogue
 * montre sans compte. Quatre fonctions, déclarées avec l'audience `public`
 * dans `module.json` et désignées par `catalogSections`.
 *
 * Ce fichier ne fait que lire, et ne rend que des champs publics :
 *
 * - **seul le rendu d'une page est servi**, jamais son image d'origine, ni ses
 *   zones, ses lectures, ses traductions, le glossaire ou la mémoire. Une page
 *   « laissée telle quelle » ou pas encore exportée n'existe pas ici ;
 * - **la visibilité est relue à chaque demande.** Une adresse publique porte
 *   l'identifiant de la fiche ; la fiche est relue, et doit porter exactement
 *   cette adresse et une visibilité publique. Repasser un chapitre en privé
 *   efface son adresse : la demande suivante ne trouve plus rien ;
 * - **aucun nom de fichier ne sort.** Une image publique s'adresse par
 *   l'adresse de son chapitre et un jeton ; le nom du fichier ne quitte le
 *   serveur que vers la route qui le sert.
 *
 * Pour qu'une page publique ne coûte pas une relecture complète à chaque
 * visite, les fiches sont gardées en mémoire sous une forme réduite, et
 * revalidées par un simple `stat` : dès qu'un fichier change sur le disque, sa
 * fiche est relue. Le disque reste la seule vérité, rien n'expire « plus tard ».
 */

import fs from "fs";
import path from "path";
import { catalogSectionMediaUrl } from "@/lib/catalog-section-paths";
import type { CatalogSectionCard, CatalogSectionCollection, CatalogSectionItem, CatalogSectionListing, CatalogSectionMedia } from "@/types/modules";
import { assetExists, dataRoot, exportThumbName, readJson } from "../store";
import { isId, type ChapterOrigin, type ChapterVisibility, type ReadingFormat, type ScanChapter, type ScanFolder, type ScanPage } from "../types";
import { PUBLIC_SECTION_ID, idOfPublicSlug, isPublishablePage, pageToken, visibilityOf } from "./visibility";

// ─── Fiches réduites, revalidées par `stat` ──────────────────────

type Area = "folders" | "chapters" | "pages";

// `dataRoot()` peut être déplacé par les tests : le build ne peut pas borner ce chemin.
const entityFile = (area: Area, id: string) => path.join(/* turbopackIgnore: true */ dataRoot(), area, `${id}.json`);

interface Cached {
  signature: string;
  value: unknown;
}

/** Au-delà, la mémoire est vidée d'un coup : elle se remplit de nouveau à la demande. */
const MAX_CACHED = 20_000;

// Rangé sur `globalThis` : une seule mémoire par processus, même si ce fichier est chargé deux fois.
const holder = globalThis as typeof globalThis & { __scanStudioPublicCache?: Map<string, Cached> };
const cache = (): Map<string, Cached> => (holder.__scanStudioPublicCache ??= new Map());

/** Vide la mémoire, pour les tests. */
export function resetPublicCache() {
  cache().clear();
}

/**
 * Empreinte d'un fichier sans le lire. Chaque écriture du module passe par un
 * fichier temporaire puis un renommage : le numéro d'inode change avec elle,
 * en plus de la date et de la taille.
 */
function signatureOf(file: string): string | null {
  try {
    const stats = fs.statSync(file, { bigint: true });
    if (!stats.isFile()) return null;
    return `${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`;
  } catch {
    return null;
  }
}

/** Lit une fiche et n'en garde que la projection utile au public. `null` : fiche absente ou illisible. */
function readProjected<T>(area: Area, id: unknown, project: (raw: Record<string, unknown>) => T | null): T | null {
  if (!isId(id)) return null;
  const file = entityFile(area, id);
  const signature = signatureOf(file);
  if (!signature) return null;

  const key = `${file}`;
  const known = cache().get(key);
  if (known && known.signature === signature) return known.value as T | null;

  const raw = readJson<Record<string, unknown>>(file);
  const value = raw && typeof raw === "object" && raw.id === id ? project(raw) : null;
  if (cache().size >= MAX_CACHED) cache().clear();
  cache().set(key, { signature, value });
  return value;
}

interface FolderInfo {
  id: string;
  name: string;
  publicSlug?: string;
  chapterIds: string[];
}

interface ChapterInfo {
  id: string;
  folderId: string;
  number: string;
  title?: string;
  format: ReadingFormat;
  visibility: ChapterVisibility;
  publicSlug?: string;
  pageIds: string[];
  origin?: ChapterOrigin;
  updatedAt: number;
}

interface PageInfo {
  id: string;
  chapterId: string;
  /** Rendu de la page ; absent si la page ne peut pas être lue en public. */
  exportedFile?: string;
  exportedAt: number;
  width: number;
  height: number;
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const idList = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isId) : []);
const dimension = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

function folderInfo(id: unknown): FolderInfo | null {
  return readProjected<FolderInfo>("folders", id, (raw) => {
    const folder = raw as unknown as ScanFolder;
    return {
      id: folder.id,
      name: text(folder.name, 200),
      publicSlug: idOfPublicSlug(folder.publicSlug) === folder.id ? folder.publicSlug : undefined,
      chapterIds: idList(folder.chapterIds),
    };
  });
}

function projectOrigin(origin: unknown): ChapterOrigin | undefined {
  if (!origin || typeof origin !== "object") return undefined;
  const { source, url, credit } = origin as Record<string, unknown>;
  if (typeof source !== "string" || !source.trim()) return undefined;
  const safeUrl = typeof url === "string" && /^https?:\/\//i.test(url) ? url.slice(0, 500) : undefined;
  return { source: text(source, 80), ...(safeUrl ? { url: safeUrl } : {}), ...(typeof credit === "string" && credit.trim() ? { credit: text(credit, 200) } : {}) };
}

function chapterInfo(id: unknown): ChapterInfo | null {
  return readProjected<ChapterInfo>("chapters", id, (raw) => {
    const chapter = raw as unknown as ScanChapter;
    const format = chapter.settings?.format;
    return {
      id: chapter.id,
      folderId: text(chapter.folderId, 12),
      number: text(chapter.number, 40),
      title: text(chapter.title, 200) || undefined,
      format: format === "manhua" || format === "webtoon" ? format : "manga",
      visibility: visibilityOf(chapter),
      publicSlug: idOfPublicSlug(chapter.publicSlug) === chapter.id ? chapter.publicSlug : undefined,
      pageIds: idList(chapter.pageIds),
      origin: projectOrigin(chapter.origin),
      updatedAt: typeof chapter.updatedAt === "number" ? chapter.updatedAt : 0,
    };
  });
}

function pageInfo(id: unknown): PageInfo | null {
  return readProjected<PageInfo>("pages", id, (raw) => {
    const page = raw as unknown as ScanPage;
    const publishable = isPublishablePage(page);
    return {
      id: page.id,
      chapterId: text(page.chapterId, 12),
      exportedFile: publishable ? page.exported!.file : undefined,
      exportedAt: publishable && typeof page.exported!.at === "number" ? page.exported!.at : 0,
      width: dimension(page.source?.width),
      height: dimension(page.source?.height),
    };
  });
}

// ─── Ce qui est public ───────────────────────────────────────────

interface PublicPage {
  token: string;
  /** Rendu, dans `assets/`. Ne sort jamais dans une réponse publique. */
  file: string;
  width: number;
  height: number;
  at: number;
}

interface PublicChapter {
  info: ChapterInfo & { publicSlug: string };
  folder: FolderInfo & { publicSlug: string };
  listed: boolean;
}

/** Le chapitre et sa série, s'il est public et rattaché à une série qui a une adresse. */
function asPublic(info: ChapterInfo | null): PublicChapter | null {
  if (!info || info.visibility === "private" || !info.publicSlug) return null;
  const folder = folderInfo(info.folderId);
  // Le dossier doit citer le chapitre : une fiche orpheline n'est pas servie.
  if (!folder || !folder.publicSlug || !folder.chapterIds.includes(info.id)) return null;
  return { info: { ...info, publicSlug: info.publicSlug }, folder: { ...folder, publicSlug: folder.publicSlug }, listed: info.visibility === "catalog" };
}

/** Retrouve un chapitre public par son adresse. La fiche doit porter exactement cette adresse. */
function findChapter(chapterSlug: unknown): PublicChapter | null {
  const id = idOfPublicSlug(chapterSlug);
  if (!id) return null;
  const found = asPublic(chapterInfo(id));
  return found && found.info.publicSlug === chapterSlug ? found : null;
}

function findFolder(folderSlug: unknown): (FolderInfo & { publicSlug: string }) | null {
  const id = idOfPublicSlug(folderSlug);
  if (!id) return null;
  const folder = folderInfo(id);
  const slug = folder?.publicSlug;
  return folder && slug !== undefined && slug === folderSlug ? { ...folder, publicSlug: slug } : null;
}

/** Pages lisibles d'un chapitre public, dans l'ordre de lecture. `limit` arrête la lecture dès qu'on en sait assez. */
function publicPages(chapter: PublicChapter, limit = Infinity): PublicPage[] {
  const pages: PublicPage[] = [];
  for (const pageId of chapter.info.pageIds) {
    if (pages.length >= limit) break;
    const page = pageInfo(pageId);
    // La page doit appartenir à ce chapitre, et son rendu être encore sur le disque.
    if (!page || page.chapterId !== chapter.info.id || !page.exportedFile || !assetExists(page.exportedFile)) continue;
    pages.push({
      token: pageToken(chapter.info.publicSlug, page.exportedFile),
      file: page.exportedFile,
      width: page.width,
      height: page.height,
      at: page.exportedAt,
    });
  }
  return pages;
}

const pageUrl = (chapter: PublicChapter, page: PublicPage) => catalogSectionMediaUrl(PUBLIC_SECTION_ID, [chapter.info.publicSlug, page.token]);
const thumbnailUrl = (chapter: PublicChapter, page: PublicPage) => catalogSectionMediaUrl(PUBLIC_SECTION_ID, [chapter.info.publicSlug, page.token, "thumb"]);

/** « Chapitre 12 » pour un numéro, le texte tel quel pour « Extra ». */
function chapterTitle(info: ChapterInfo): string {
  const number = info.number.trim();
  return /^\d/.test(number) ? `Chapitre ${number}` : number || "Chapitre";
}

/** Chapitres publics d'une série, dans l'ordre du dossier. `listedOnly` : seulement ceux du catalogue. */
function chaptersOf(folder: FolderInfo, listedOnly: boolean): PublicChapter[] {
  const chapters: PublicChapter[] = [];
  for (const chapterId of folder.chapterIds) {
    const chapter = asPublic(chapterInfo(chapterId));
    if (!chapter || (listedOnly && !chapter.listed)) continue;
    // Un chapitre sans page lisible n'a rien à montrer : il n'est cité nulle part.
    if (publicPages(chapter, 1).length === 0) continue;
    chapters.push(chapter);
  }
  return chapters;
}

/** Identifiants des dossiers présents sur le disque. */
function folderIds(): string[] {
  try {
    return fs
      .readdirSync(path.join(/* turbopackIgnore: true */ dataRoot(), "folders"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5))
      .filter(isId);
  } catch {
    return [];
  }
}

// ─── Fonctions du catalogue ──────────────────────────────────────

/** Les séries qui ont au moins un chapitre listé, la plus récemment mise à jour d'abord. */
export function listPublicSeries(): CatalogSectionListing {
  const collections: CatalogSectionCard[] = [];
  for (const id of folderIds()) {
    const folder = folderInfo(id);
    // Un dossier sans adresse n'a jamais rien publié : ses chapitres ne sont pas lus.
    if (!folder?.publicSlug) continue;
    const chapters = chaptersOf(folder, true);
    if (chapters.length === 0) continue;
    const cover = publicPages(chapters[0], 1)[0];
    collections.push({
      slug: folder.publicSlug,
      title: folder.name,
      cover: cover ? thumbnailUrl(chapters[0], cover) : undefined,
      count: chapters.length,
      updatedAt: Math.max(...chapters.map((chapter) => chapter.info.updatedAt)),
    });
  }
  collections.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  return { collections };
}

/** Une série et ses chapitres listés. `null` si elle n'en a aucun : la série n'a alors pas de page. */
export function getPublicSeries(seriesSlug: unknown): CatalogSectionCollection | null {
  const folder = findFolder(seriesSlug);
  if (!folder) return null;
  const chapters = chaptersOf(folder, true);
  if (chapters.length === 0) return null;

  const items: CatalogSectionCard[] = chapters.map((chapter) => {
    const pages = publicPages(chapter);
    return {
      slug: chapter.info.publicSlug,
      title: chapterTitle(chapter.info),
      subtitle: chapter.info.title,
      cover: pages[0] ? thumbnailUrl(chapter, pages[0]) : undefined,
      count: pages.length,
      updatedAt: Math.max(chapter.info.updatedAt, ...pages.map((page) => page.at)),
    };
  });
  return { slug: folder.publicSlug, title: folder.name, cover: items[0]?.cover, items };
}

const READING: Record<ReadingFormat, CatalogSectionItem["reading"]> = { manga: "paged-rtl", manhua: "paged-ltr", webtoon: "scroll" };

/**
 * Un chapitre public et ses pages lisibles. L'adresse de la série doit être
 * celle de son dossier. Les chapitres voisins proposés dépendent d'où l'on
 * est : depuis un chapitre listé, seuls les chapitres listés ; depuis un
 * chapitre partagé par son lien, tous les chapitres publics de la série. Une
 * adresse non listée n'apparaît ainsi jamais sur une page du catalogue.
 */
export function getPublicChapter(seriesSlug: unknown, chapterSlug: unknown): CatalogSectionItem | null {
  const chapter = findChapter(chapterSlug);
  if (!chapter || chapter.folder.publicSlug !== seriesSlug) return null;
  const pages = publicPages(chapter);
  if (pages.length === 0) return null;

  const siblings = chaptersOf(chapter.folder, chapter.listed);
  const rank = siblings.findIndex((entry) => entry.info.id === chapter.info.id);
  const neighbour = (entry: PublicChapter | undefined) =>
    entry ? { slug: entry.info.publicSlug, title: entry.info.title ? `${chapterTitle(entry.info)} · ${entry.info.title}` : chapterTitle(entry.info) } : undefined;

  const credits: NonNullable<CatalogSectionItem["credits"]> = [];
  const origin = chapter.info.origin;
  if (origin) {
    credits.push({ label: "Source", value: origin.source, ...(origin.url ? { href: origin.url } : {}) });
    if (origin.credit) credits.push({ label: "Traduction d’origine", value: origin.credit });
  }

  return {
    slug: chapter.info.publicSlug,
    title: chapter.info.title ? `${chapterTitle(chapter.info)} · ${chapter.info.title}` : chapterTitle(chapter.info),
    collection: { slug: chapter.folder.publicSlug, title: chapter.folder.name },
    listed: chapter.listed,
    reading: READING[chapter.info.format],
    pages: pages.map((page) => ({ url: pageUrl(chapter, page), width: page.width, height: page.height })),
    cover: thumbnailUrl(chapter, pages[0]),
    previous: rank > 0 ? neighbour(siblings[rank - 1]) : undefined,
    next: rank >= 0 ? neighbour(siblings[rank + 1]) : undefined,
    credits: credits.length > 0 ? credits : undefined,
    updatedAt: Math.max(chapter.info.updatedAt, ...pages.map((page) => page.at)),
  };
}

/**
 * L'image que désigne une adresse publique : `[chapitre, jeton]` pour le rendu
 * d'une page, `[chapitre, jeton, "thumb"]` pour sa vignette. Rend un chemin
 * relatif à `data/`, pour la route du catalogue ; `null` pour tout le reste.
 * Le jeton ne peut désigner qu'un rendu de ce chapitre : il n'existe aucun
 * moyen de nommer ici un fichier.
 */
export function openPublicMedia(parts: unknown): CatalogSectionMedia | null {
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 3 || !parts.every((part) => typeof part === "string")) return null;
  const [chapterSlug, token, variant] = parts as string[];
  if (variant !== undefined && variant !== "thumb") return null;
  if (!/^[0-9a-f]{24}$/.test(token)) return null;

  const chapter = findChapter(chapterSlug);
  if (!chapter) return null;
  const page = publicPages(chapter).find((entry) => entry.token === token);
  if (!page) return null;
  return {
    file: variant === "thumb" ? `thumbs/${exportThumbName(page.file)}` : `assets/${page.file}`,
    indexable: chapter.listed,
  };
}
