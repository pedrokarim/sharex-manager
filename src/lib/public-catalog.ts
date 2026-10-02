import { isInCatalog } from "@/lib/album-visibility";
import { albumsDb } from "@/lib/utils/albums-db";
import type { Album } from "@/types/albums";

/** Les couvertures et la mosaïque ne montrent que des images fixes. */
const STILL_IMAGE = /\.(jpg|jpeg|png|gif|webp)$/i;

export interface CatalogImageRef {
  name: string;
  addedAt: string;
  albumSlug: string;
  albumName: string;
}

export type CatalogAlbum = Album & { coverImages?: string[] };

export interface CatalogOverview {
  albums: CatalogAlbum[];
  /** Échantillon tiré au hasard, pour la mosaïque du héros. */
  heroImages: CatalogImageRef[];
  /** Nombre d'images publiques, tous albums confondus et sans doublon. */
  imagesTotal: number;
  /** Date du dernier ajout à un album public. */
  lastAddedAt?: string;
  /** Nombre d'albums publics. */
  total: number;
}

interface CatalogOverviewOptions {
  /** Nombre d'albums renvoyés. */
  limit?: number;
  /** Joindre à chaque album ses premières images. */
  includeImages?: boolean;
  /** Taille de l'échantillon d'images ; 0 pour ne pas en tirer. */
  randomImages?: number;
}

/**
 * Vue d'ensemble du catalogue public : ses albums, et de quoi peupler la
 * mosaïque. Sert la route `/api/public/catalog` comme les pages du catalogue,
 * qui la lisent côté serveur pour s'afficher sans attente.
 */
export function readCatalogOverview({ limit = 20, includeImages = false, randomImages = 0 }: CatalogOverviewOptions = {}): CatalogOverview {
  // Un album public par son seul lien n'apparaît nulle part ici.
  const publicAlbums = albumsDb.getAlbums().filter(isInCatalog);

  let heroImages: CatalogImageRef[] = [];
  let imagesTotal = 0;
  let lastAddedAt: string | undefined;

  if (randomImages > 0) {
    // Une image rangée dans plusieurs albums ne compte qu'une fois.
    const unique = new Map<string, CatalogImageRef>();
    for (const album of publicAlbums) {
      for (const entry of albumsDb.getAlbumFileEntries(album.id)) {
        if (!STILL_IMAGE.test(entry.fileName) || unique.has(entry.fileName)) continue;
        unique.set(entry.fileName, {
          name: entry.fileName,
          addedAt: entry.addedAt,
          albumSlug: album.publicSlug || "",
          albumName: album.name,
        });
      }
    }

    const all = [...unique.values()];
    imagesTotal = all.length;
    let latest = 0;
    for (const image of all) {
      const time = new Date(image.addedAt).getTime();
      if (time > latest) {
        latest = time;
        lastAddedAt = image.addedAt;
      }
    }
    heroImages = all.sort(() => Math.random() - 0.5).slice(0, randomImages);
  }

  const albums = publicAlbums.slice(0, limit).map((album) =>
    includeImages
      ? {
          ...album,
          coverImages: albumsDb
            .getAlbumFiles(album.id)
            .filter((fileName) => STILL_IMAGE.test(fileName))
            .slice(0, 4),
        }
      : album,
  );

  return { albums, heroImages, imagesTotal, lastAddedAt, total: publicAlbums.length };
}

/** La même vue, vide : pour une base absente (build, première installation). */
export const EMPTY_CATALOG: CatalogOverview = { albums: [], heroImages: [], imagesTotal: 0, total: 0 };

/** Lecture tolérante, pour une page : elle doit rester servie quoi qu'il arrive. */
export function readCatalogOverviewSafely(options?: CatalogOverviewOptions): CatalogOverview {
  try {
    return readCatalogOverview(options);
  } catch (error) {
    console.error("Catalogue public indisponible:", error);
    return EMPTY_CATALOG;
  }
}
