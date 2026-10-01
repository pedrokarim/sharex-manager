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
