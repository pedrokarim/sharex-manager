/**
 * Liste des fichiers de la galerie, filtrée et triée : la même pour la page de
 * fichiers et pour la frise des mois, qui doivent compter exactement pareil.
 */

import { readdir } from "fs/promises";
import { getAbsoluteUploadPath } from "@/lib/config";
import { getFileMetadata, loadFileFlagSets } from "@/lib/file-metadata";
import { organizationDb } from "@/lib/organization/organization-db";
import { matchesCollection } from "@/lib/organization/rules";
import {
  hasAnyRule,
  slugify,
  type Collection,
  type CollectionPreview,
  type CollectionRules,
  type CollectionSummary,
} from "@/lib/organization/types";
import type { FileInfo } from "@/types/files";

export interface GalleryQuery {
  search?: string;
  secureOnly?: boolean;
  starredOnly?: boolean;
  sort?: string;
  order?: string;
  startDate?: string | null;
  endDate?: string | null;
  /** Slugs de tags : le fichier doit les porter tous. */
  tags?: string[];
  /** Règles complètes d'une collection, déjà résolues pour le compte. */
  collection?: CollectionRules;
  /**
   * Identifiant (ou slug) de collection lu dans l'adresse, pas encore résolu.
   * `listGalleryFiles` refuse une requête qui le porte sans `collection` :
   * passer d'abord par `resolveGalleryCollection`.
   */
  collectionId?: string;
}

export function galleryQueryFrom(searchParams: URLSearchParams): GalleryQuery {
  const tags = [...new Set(searchParams.getAll("tag").map(slugify).filter(Boolean))];
  const collectionId = searchParams.get("collection")?.trim();
  return {
    search: searchParams.get("q") || "",
    secureOnly: searchParams.get("secure") === "true",
    starredOnly: searchParams.get("starred") === "true",
    sort: searchParams.get("sort") || "date",
    order: searchParams.get("order") || "desc",
    startDate: searchParams.get("start"),
    endDate: searchParams.get("end"),
    ...(tags.length ? { tags } : {}),
    ...(collectionId ? { collectionId } : {}),
  };
}

/**
 * Résout `collectionId` pour un compte : la requête reçoit les règles de la
 * collection, et son tri quand l'adresse n'en impose pas (`explicitSort`).
 * `null` : la collection n'existe pas ou appartient à un autre compte (404).
 */
export function resolveGalleryCollection(
  query: GalleryQuery,
  userId: string,
  explicitSort = { sort: false, order: false },
): { query: GalleryQuery; collection: Collection | null } | null {
  if (!query.collectionId) return { query, collection: null };
  const collection = organizationDb.findCollection(query.collectionId, userId);
  if (!collection) return null;
  return {
    collection,
    query: {
      ...query,
      collection: collection.rules,
      sort: explicitSort.sort ? query.sort : collection.sort,
      order: explicitSort.order ? query.order : collection.order,
    },
  };
}

/** Vrai si la requête a besoin des tags des fichiers. */
function needsTags(query: GalleryQuery): boolean {
  const rules = query.collection;
  return Boolean(query.tags?.length || rules?.tagsAll?.length || rules?.tagsAny?.length || rules?.tagsNone?.length);
}

const NO_TAGS: readonly string[] = [];

/**
 * Filtre et tri, sans accès au disque ni à la base : `tagsByFile` est la table
 * des tags lue une fois pour toute la liste.
 */
export function applyGalleryQuery(
  input: readonly FileInfo[],
  query: GalleryQuery,
  tagsByFile: ReadonlyMap<string, readonly string[]> = new Map(),
  now: Date = new Date(),
): FileInfo[] {
  // Une collection dont toutes les règles ont disparu ne montre rien, jamais la galerie entière.
  if (query.collection && !hasAnyRule(query.collection)) return [];

  const needle = query.search?.toLowerCase();
  let files = needle ? input.filter((file) => file.name.toLowerCase().includes(needle)) : [...input];
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

  if (query.tags?.length) {
    const wanted = query.tags;
    files = files.filter((file) => {
      const slugs = tagsByFile.get(file.name) ?? NO_TAGS;
      return wanted.every((slug) => slugs.includes(slug));
    });
  }
  if (query.collection) {
    const rules = query.collection;
    files = files.filter((file) => matchesCollection(file, tagsByFile.get(file.name) ?? NO_TAGS, rules, now));
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

/** Tous les fichiers du dossier d'envoi avec leurs métadonnées, sans filtre ni tri. */
export async function readGalleryFiles(search?: string): Promise<FileInfo[]> {
  const entries = await readdir(getAbsoluteUploadPath(), { withFileTypes: true });
  const flags = await loadFileFlagSets();
  const needle = search?.toLowerCase();

  const loaded = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => (needle ? entry.name.toLowerCase().includes(needle) : true))
      .map((entry) => getFileMetadata(entry.name, flags))
  );
  return loaded.filter((file): file is FileInfo => file !== null);
}

export async function listGalleryFiles(query: GalleryQuery): Promise<FileInfo[]> {
  if (query.collectionId && !query.collection) {
    throw new Error("Collection non résolue : appeler resolveGalleryCollection avant listGalleryFiles");
  }
  if (query.collection && !hasAnyRule(query.collection)) return [];
  const files = await readGalleryFiles(query.search);
  const tagsByFile = needsTags(query) ? organizationDb.tagsByFile() : undefined;
  return applyGalleryQuery(files, query, tagsByFile);
}

/** Fichiers d'aperçu d'une collection. */
export const COLLECTION_COVER_SIZE = 4;

/** Toute la galerie et la table des tags, lues une fois pour évaluer plusieurs collections. */
export async function readGalleryIndex(): Promise<{
  files: FileInfo[];
  tagsByFile: Map<string, string[]>;
}> {
  const files = await readGalleryFiles();
  return { files, tagsByFile: organizationDb.tagsByFile() };
}

/** Nombre de fichiers et aperçu (quatre noms au plus, dans l'ordre de tri) d'une règle. */
export function previewCollection(
  files: readonly FileInfo[],
  tagsByFile: ReadonlyMap<string, readonly string[]>,
  collection: Pick<Collection, "rules" | "sort" | "order">,
  now: Date = new Date(),
): CollectionPreview {
  const matched = applyGalleryQuery(
    files,
    { collection: collection.rules, sort: collection.sort, order: collection.order },
    tagsByFile,
    now,
  );
  return {
    fileCount: matched.length,
    cover: matched.slice(0, COLLECTION_COVER_SIZE).map((file) => file.name),
  };
}

/** Collections avec leur compte et leur aperçu ; la galerie et les tags ne sont lus qu'une fois. */
export async function summarizeCollections(collections: readonly Collection[]): Promise<CollectionSummary[]> {
  if (!collections.length) return [];
  const { files, tagsByFile } = await readGalleryIndex();
  const now = new Date();
  return collections.map((collection) => ({
    ...collection,
    ...previewCollection(files, tagsByFile, collection, now),
  }));
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
