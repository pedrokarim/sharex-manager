/**
 * Liste des fichiers de la galerie, filtrée et triée : la même pour la page de
 * fichiers et pour la frise des mois, qui doivent compter exactement pareil.
 */

import { readdir } from "fs/promises";
import { getAbsoluteUploadPath } from "@/lib/config";
import { getFileMetadata, loadFileFlagSets } from "@/lib/file-metadata";
import type { FileInfo } from "@/types/files";

export interface GalleryQuery {
  search?: string;
  secureOnly?: boolean;
  starredOnly?: boolean;
  sort?: string;
  order?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export function galleryQueryFrom(searchParams: URLSearchParams): GalleryQuery {
  return {
    search: searchParams.get("q") || "",
    secureOnly: searchParams.get("secure") === "true",
    starredOnly: searchParams.get("starred") === "true",
    sort: searchParams.get("sort") || "date",
    order: searchParams.get("order") || "desc",
    startDate: searchParams.get("start"),
    endDate: searchParams.get("end"),
  };
}

export async function listGalleryFiles(query: GalleryQuery): Promise<FileInfo[]> {
  const entries = await readdir(getAbsoluteUploadPath(), { withFileTypes: true });
  const flags = await loadFileFlagSets();
  const needle = query.search?.toLowerCase();

  const loaded = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => (needle ? entry.name.toLowerCase().includes(needle) : true))
      .map((entry) => getFileMetadata(entry.name, flags))
  );

  let files = loaded.filter((file): file is FileInfo => file !== null);
  if (query.secureOnly) files = files.filter((file) => file.isSecure);
  if (query.starredOnly) files = files.filter((file) => file.isStarred);

  if (query.startDate) {
    const start = new Date(query.startDate).getTime();
    files = files.filter((file) => new Date(file.createdAt).getTime() >= start);
  }
  if (query.endDate) {
    const end = new Date(query.endDate).getTime();
    files = files.filter((file) => new Date(file.createdAt).getTime() <= end);
  }

  const direction = query.order === "asc" ? 1 : -1;
  files.sort((a, b) => {
    let comparison: number;
    switch (query.sort) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "size":
        comparison = a.size - b.size;
        break;
      default:
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return comparison * direction;
  });
  return files;
}

/** Taille de la première page servie avec la galerie. */
export const GALLERY_FIRST_PAGE_SIZE = 24;

export interface GalleryFirstPage {
  /** `null` : la lecture a échoué, la page chargera sa liste elle-même. */
  files: FileInfo[] | null;
  hasMore: boolean;
}

/**
 * Première page de la galerie, lue directement sur le disque.
 *
 * Les pages la demandaient avant à `/api/files` par une requête HTTP vers
 * `NEXT_PUBLIC_API_URL`. Dès que cette adresse ne désignait pas le serveur en
 * cours (un autre port en développement, un hôte interne en production), la
 * requête échouait et la galerie s'ouvrait sur « Aucune image ».
 */
export async function readGalleryFirstPage(query: GalleryQuery): Promise<GalleryFirstPage> {
  try {
    const files = await listGalleryFiles({ sort: "date", order: "desc", ...query });
    return {
      files: files.slice(0, GALLERY_FIRST_PAGE_SIZE),
      hasMore: files.length > GALLERY_FIRST_PAGE_SIZE,
    };
  } catch (error) {
    console.error("Erreur lors du chargement initial des fichiers:", error);
    return { files: null, hasMore: false };
  }
}
