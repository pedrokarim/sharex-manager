import { albumsDb } from "@/lib/utils/albums-db";

const IMAGE_PATTERN = /\.(jpe?g|png|gif|webp)$/i;

export interface PublicAlbumSummary {
  name: string;
  description?: string;
  imageCount: number;
  /** Les quatre premières images, pour composer l'aperçu partagé. */
  covers: string[];
  updatedAt?: string;
}

/**
 * Résumé d'un album public, pour les metadata et l'image Open Graph.
 *
 * Lit la base directement plutôt que de passer par `/api/public/albums/[slug]` :
 * `generateMetadata` s'exécute côté serveur, un aller-retour HTTP vers sa propre
 * application n'apporterait rien et ferait échouer le rendu si le port change.
 */
export function getPublicAlbumSummary(slug: string): PublicAlbumSummary | null {
  try {
    const album = albumsDb.getAlbumByPublicSlug(slug);
    if (!album || !album.isPublic) return null;

    const images = albumsDb
      .getAlbumFiles(album.id)
      .filter((fileName) => IMAGE_PATTERN.test(fileName));

    // La vignette choisie par l'auteur passe en premier : c'est la couverture
    // qu'il a explicitement retenue pour l'album.
    const ordered = album.thumbnailFile
      ? [album.thumbnailFile, ...images.filter((n) => n !== album.thumbnailFile)]
      : images;

    return {
      name: album.name,
      description: album.description,
      imageCount: images.length,
      covers: ordered.slice(0, 4),
      updatedAt: album.updatedAt,
    };
  } catch (error) {
    // Un aperçu manquant ne doit jamais empêcher la page de s'afficher.
    console.error(`Album public "${slug}" illisible:`, error);
    return null;
  }
}

/** Description de repli quand l'auteur n'en a pas écrit. */
export function albumFallbackDescription(count: number) {
  if (count === 0) return "Album public sur ShareX Manager.";
  return count === 1
    ? "1 image partagée publiquement sur ShareX Manager."
    : `${count} images partagées publiquement sur ShareX Manager.`;
}
