/**
 * Visibilité d'un album. Trois états, du plus fermé au plus ouvert :
 *
 * - `private` : seul son propriétaire le voit. C'est l'état par défaut.
 * - `link` : public, mais absent du catalogue. On y accède avec son adresse.
 * - `catalog` : public et listé dans le catalogue.
 *
 * En base, deux drapeaux portent cet état : `isPublic` (l'album a une page
 * publique) et `inCatalog` (cette page est listée). Un album ne peut pas être
 * au catalogue sans être public.
 */
export const ALBUM_VISIBILITIES = ["private", "link", "catalog"] as const;

export type AlbumVisibility = (typeof ALBUM_VISIBILITIES)[number];

interface VisibilityFlags {
  isPublic?: boolean;
  inCatalog?: boolean;
}

export function albumVisibility(album: VisibilityFlags): AlbumVisibility {
  if (!album.isPublic) return "private";
  return album.inCatalog ? "catalog" : "link";
}

export function visibilityFlags(visibility: AlbumVisibility): Required<VisibilityFlags> {
  return {
    isPublic: visibility !== "private",
    inCatalog: visibility === "catalog",
  };
}

/** L'album figure-t-il dans le catalogue public ? */
export function isInCatalog(album: VisibilityFlags): boolean {
  return albumVisibility(album) === "catalog";
}
