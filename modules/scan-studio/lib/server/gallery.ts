/**
 * Pages exportées et galerie : envoi d'un chapitre, et source « Scan Studio »
 * de la fenêtre « Ajouter » (`gallerySources`).
 *
 * Même geste que Clip Studio : le rendu est copié dans les uploads sous un nom
 * neuf, puis annoncé aux galeries ouvertes. Une page déjà copiée n'est pas
 * dupliquée tant que sa copie existe.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { getAbsoluteUploadPath } from "@/lib/config";
import type { GallerySourceImport, GallerySourceItem, GallerySourcePage, GallerySourceQuery } from "@/types/modules";
import {
  assetExists,
  assetPath,
  exportThumbName,
  readChapter,
  readExports,
  readFolder,
  thumbUrl,
  writeExports,
  type ExportEntry,
} from "../store";
import { isId, type ScanChapter, type ScanFolder } from "../types";
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

/**
 * Copie dans la galerie les pages exportées d'un chapitre, dans l'ordre de
 * lecture. `saved` compte les fichiers réellement ajoutés : une page déjà
 * présente dans la galerie n'est pas recopiée.
 */
export async function sendChapterToGallery(chapterId: unknown): Promise<{ saved: number }> {
  const chapter = requireChapter(chapterId);
  const exported = new Set(readExports().map((entry) => entry.pageId));
  const pageIds = chapter.pageIds.filter((id) => exported.has(id));
  if (pageIds.length === 0) throw new Error("Aucune page exportée dans ce chapitre.");

  let saved = 0;
  for (const pageId of pageIds) {
    const { fileName, copied } = copyToGallery(pageId);
    if (!copied) continue;
    saved++;
    await announce(fileName);
  }
  return { saved };
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
