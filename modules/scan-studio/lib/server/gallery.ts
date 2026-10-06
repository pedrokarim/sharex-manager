/**
 * Pages exportées et galerie : envoi d'un chapitre, et source « Scan Studio »
 * de la fenêtre « Ajouter » (`gallerySources`).
 *
 * Même geste que Clip Studio : le rendu est copié dans les uploads sous un nom
 * neuf, puis annoncé aux galeries ouvertes. Une page déjà copiée n'est pas
 * dupliquée tant que sa copie existe.
 *
 * L'envoi d'un chapitre suit l'ordre de lecture, pages « laissées telles
 * quelles » comprises (couvertures, bannières) : elles partent telles
 * qu'elles sont, à leur place. Les copies sont réunies dans un album privé,
 * un par chapitre.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { getAbsoluteUploadPath } from "@/lib/config";
import type { GallerySourceImport, GallerySourceItem, GallerySourcePage, GallerySourceQuery } from "@/types/modules";
import {
  assetExists,
  assetPath,
  dataRoot,
  exportThumbName,
  isAssetName,
  readChapter,
  readExports,
  readFolder,
  readJson,
  readPage,
  thumbUrl,
  writeExports,
  writeJson,
  type ExportEntry,
} from "../store";
import { isId, type ScanChapter, type ScanFolder, type ScanPage } from "../types";
import { requireChapter } from "./library";

/** Pages copiées en un appel par la fenêtre « Ajouter ». */
const MAX_IMPORT_ITEMS = 100;

/**
 * `gallery-events` tire avec lui la lecture des fichiers de la galerie : il
 * n'est chargé qu'au moment d'annoncer, pas avec le module.
 */
async function announce(fileName: string) {
  // Une page de scan n'est pas une capture à partager : elle entre dans la
  // galerie marquée privée, visible seulement connecté. On la rend publique
  // ensuite, à la main, si on le veut.
  const { setFileSecure } = await import("@/lib/secure-files");
  await setFileSecure(fileName, true);
  const { announceNewUpload } = await import("@/lib/gallery-events");
  await announceNewUpload(fileName);
}

const galleryCopyExists = (uploads: string, entry: ExportEntry) =>
  Boolean(entry.galleryFile) && fs.existsSync(path.join(uploads, entry.galleryFile!));

/**
 * Copie le rendu d'une page dans la galerie. La copie et son inscription à
 * l'index se font d'une traite : deux envois simultanés ne donnent qu'un
 * fichier.
 */
function copyToGallery(pageId: string): { fileName: string; copied: boolean } {
  const exports = readExports();
  const entry = exports.find((item) => item.pageId === pageId);
  if (!entry) throw new Error("Cette page n'a pas encore été exportée.");
  if (!assetExists(entry.file)) throw new Error("Rendu introuvable sur le disque : exportez la page à nouveau.");

  const uploads = getAbsoluteUploadPath();
  if (galleryCopyExists(uploads, entry)) return { fileName: entry.galleryFile!, copied: false };

  fs.mkdirSync(uploads, { recursive: true });
  const extension = path.extname(entry.file);
  let fileName: string;
  do {
    fileName = `${randomBytes(9).toString("base64url")}${extension}`;
  } while (fs.existsSync(path.join(uploads, fileName)));
  fs.copyFileSync(assetPath(entry.file), path.join(uploads, fileName), fs.constants.COPYFILE_EXCL);

  entry.galleryFile = fileName;
  writeExports(exports);
  return { fileName, copied: true };
}

// ─── Ce que la galerie a déjà reçu ───────────────────────────────

/**
 * Ce que l'index des exports ne peut pas porter : la copie d'une page
 * « laissée telle quelle » (elle n'a pas de rendu), et l'album de chaque
 * chapitre envoyé.
 */
interface GalleryState {
  /** Par page laissée telle quelle : l'image d'origine copiée, et le nom de sa copie. */
  untouched: Record<string, { file: string; galleryFile: string }>;
  /** Par chapitre : l'album qui réunit ses pages dans la galerie. */
  albums: Record<string, number>;
}

// `dataRoot()` peut être déplacé par les tests : le build ne peut pas borner ce chemin.
const galleryStateFile = () => path.join(/* turbopackIgnore: true */ dataRoot(), "gallery.json");

function readGalleryState(): GalleryState {
  const stored = readJson<Partial<GalleryState>>(galleryStateFile());
  const plain = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  return {
    untouched: plain(stored?.untouched) as GalleryState["untouched"],
    albums: plain(stored?.albums) as GalleryState["albums"],
  };
}

/** Nom neuf dans les uploads, imprévisible, avec l'extension du fichier copié. */
function newGalleryName(uploads: string, extension: string): string {
  let fileName: string;
  do {
    fileName = `${randomBytes(9).toString("base64url")}${extension}`;
  } while (fs.existsSync(path.join(uploads, fileName)));
  return fileName;
}

/**
 * Copie dans la galerie l'image d'une page « laissée telle quelle », sans y
 * toucher. Comme pour un rendu, une copie encore présente n'est pas refaite.
 */
function copyUntouchedToGallery(page: ScanPage): { fileName: string; copied: boolean } {
  const file = page.source?.file;
  if (!isAssetName(file) || !assetExists(file)) throw new Error("Image d'origine introuvable sur le disque.");

  const uploads = getAbsoluteUploadPath();
  const state = readGalleryState();
  const known = state.untouched[page.id];
  if (known && known.file === file && typeof known.galleryFile === "string" && fs.existsSync(path.join(uploads, known.galleryFile))) {
    return { fileName: known.galleryFile, copied: false };
  }

  fs.mkdirSync(uploads, { recursive: true });
  const fileName = newGalleryName(uploads, path.extname(file));
  fs.copyFileSync(assetPath(file), path.join(uploads, fileName), fs.constants.COPYFILE_EXCL);
  state.untouched[page.id] = { file, galleryFile: fileName };
  writeJson(galleryStateFile(), state);
  return { fileName, copied: true };
}

/**
 * Compte connecté qui a lancé l'envoi : l'album lui appartiendra. Une fonction
 * de module ne reçoit pas la session ; elle est relue dans la requête en
 * cours. Hors requête, l'album n'a pas de propriétaire.
 */
async function currentUserId(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers");
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id || undefined;
  } catch {
    return undefined;
  }
}

function albumNameOf(chapter: ScanChapter, folder: ScanFolder | null): string {
  const number = chapter.number.trim();
  const label = /^\d/.test(number) ? `chapitre ${number}` : number || "chapitre";
  return `${folder?.name ?? "Scan Studio"} \u2013 ${label}`.slice(0, 120);
}

/**
 * Range les pages envoyées dans l'album du chapitre, créé à la première fois.
 * Un album naît privé (`createAlbum` ne le publie pas), et rien ici ne le rend
 * public. Un album supprimé entre-temps est recréé. L'album est un rangement :
 * s'il ne peut pas être créé, les pages restent dans la galerie, en privé, et
 * l'envoi n'échoue pas.
 */
async function fileInAlbum(chapter: ScanChapter, fileNames: string[]): Promise<number | undefined> {
  try {
    // `albums-db` ouvre la base de la galerie : il n'est chargé qu'ici, pas avec le module.
    const { albumsDb } = await import("@/lib/utils/albums-db");
    const state = readGalleryState();
    let albumId: number | undefined = state.albums[chapter.id];
    if (!Number.isInteger(albumId) || !albumsDb.getAlbum(albumId)) {
      const folder = readFolder(chapter.folderId);
      const album = albumsDb.createAlbum({
        name: albumNameOf(chapter, folder),
        description: chapter.title,
        userId: await currentUserId(),
      });
      albumId = album.id;
      // Relu avant d'écrire : la copie des pages a pu compléter le fichier entre-temps.
      const fresh = readGalleryState();
      fresh.albums[chapter.id] = albumId;
      writeJson(galleryStateFile(), fresh);
    }
    albumsDb.addFilesToAlbum(albumId, fileNames);
    return albumId;
  } catch (error) {
    console.error("[scan-studio] album de la galerie non créé :", error);
    return undefined;
  }
}

/**
 * Copie dans la galerie les pages d'un chapitre, dans l'ordre de lecture : le
 * rendu des pages exportées, et l'image telle quelle des pages « laissées
 * telles quelles ». Une page ni exportée ni laissée telle quelle n'est pas
 * envoyée. `saved` compte les fichiers réellement ajoutés : une page déjà
 * présente dans la galerie n'est pas recopiée. Les pages sont réunies dans un
 * album privé, dont `albumId` est l'identifiant.
 */
export async function sendChapterToGallery(chapterId: unknown): Promise<{ saved: number; albumId?: number }> {
  const chapter = requireChapter(chapterId);
  const exported = new Set(readExports().map((entry) => entry.pageId));
  const pages = chapter.pageIds.flatMap((id) => readPage(id) ?? []);
  // Rien de traduit à envoyer : un chapitre fait seulement de couvertures n'est pas un envoi.
  if (!pages.some((page) => !page.skipped && exported.has(page.id))) throw new Error("Aucune page exportée dans ce chapitre.");

  let saved = 0;
  const fileNames: string[] = [];
  for (const page of pages) {
    if (!page.skipped && !exported.has(page.id)) continue;
    const { fileName, copied } = page.skipped ? copyUntouchedToGallery(page) : copyToGallery(page.id);
    fileNames.push(fileName);
    if (!copied) continue;
    saved++;
    await announce(fileName);
  }
  const albumId = await fileInAlbum(chapter, fileNames);
  return { saved, ...(albumId === undefined ? {} : { albumId }) };
}

// ─── Source pour la galerie ──────────────────────────────────────

/** Les pages exportées, de la plus récente à la plus ancienne. */
export function listGalleryItems(query: GallerySourceQuery = {}): GallerySourcePage {
  const search = typeof query?.search === "string" ? query.search.trim().toLowerCase() : "";
  const offset = Math.max(0, Math.floor(Number(query?.offset) || 0));
  const limit = Math.min(Math.max(Math.floor(Number(query?.limit) || 48), 1), 96);

  const uploads = getAbsoluteUploadPath();
  const chapters = new Map<string, ScanChapter | null>();
  const folders = new Map<string, ScanFolder | null>();
  const chapterOf = (id: string) => {
    if (!chapters.has(id)) chapters.set(id, readChapter(id));
    return chapters.get(id) ?? null;
  };
  const folderOf = (id: string) => {
    if (!folders.has(id)) folders.set(id, readFolder(id));
    return folders.get(id) ?? null;
  };

  const items: GallerySourceItem[] = readExports()
    .filter((entry) => assetExists(entry.file))
    .sort((a, b) => b.at - a.at)
    .flatMap((entry) => {
      const chapter = chapterOf(entry.chapterId);
      const folder = chapter ? folderOf(chapter.folderId) : null;
      // Une page sans chapitre ni dossier est en cours de suppression : elle n'est pas proposée.
      if (!chapter || !folder) return [];
      const rank = chapter.pageIds.indexOf(entry.pageId) + 1;
      return [
        {
          id: entry.pageId,
          name: `${folder.name} – chapitre ${chapter.number}${rank > 0 ? `, page ${rank}` : ""}`,
          kind: "image" as const,
          thumbnail: thumbUrl(exportThumbName(entry.file)),
          createdAt: entry.at,
          caption: entry.pageName,
          galleryFile: galleryCopyExists(uploads, entry) ? entry.galleryFile : undefined,
        },
      ];
    })
    .filter((item) => !search || item.name.toLowerCase().includes(search) || item.caption?.toLowerCase().includes(search));

  return { items: items.slice(offset, offset + limit), total: items.length, hasMore: offset + limit < items.length };
}

/** Copie des pages exportées dans la galerie. Les identifiants viennent du navigateur : ce sont ceux des pages. */
export async function importGalleryItems(ids: unknown): Promise<GallerySourceImport> {
  if (!Array.isArray(ids)) throw new Error("Sélection invalide.");
  if (ids.length > MAX_IMPORT_ITEMS) throw new Error(`Choisissez ${MAX_IMPORT_ITEMS} pages au plus à la fois.`);

  const result: GallerySourceImport = { saved: [], failed: [] };
  for (const id of ids) {
    try {
      if (!isId(id)) throw new Error("Page invalide.");
      const { fileName, copied } = copyToGallery(id);
      if (copied) await announce(fileName);
      result.saved.push({ id, fileName });
    } catch (error) {
      result.failed.push({ id: String(id), error: error instanceof Error ? error.message : "Copie impossible." });
    }
  }
  return result;
}
