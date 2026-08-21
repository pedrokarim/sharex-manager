import { statSync } from "fs";
import { join } from "path";

import { getAbsoluteUploadPath } from "@/lib/config";
import { albumsDb } from "@/lib/utils/albums-db";
import { HomePageClient, type HomeShowcase } from "./page.client";

// Le mur et les chiffres reflètent le catalogue public réel : ils doivent
// suivre les publications, sans rejouer la requête à chaque visite.
export const revalidate = 300;

const IMAGE_PATTERN = /\.(jpe?g|png|gif|webp)$/i;

/**
 * Nombre de vignettes du mur, en bas de page. 12 est divisible par 3, 4 et 6 —
 * les trois largeurs de grille — donc aucune dernière ligne incomplète.
 */
const WALL_SAMPLE = 12;

function readPublicShowcase(): HomeShowcase {
  try {
    const publicAlbums = albumsDb.getAlbums().filter((album) => album.isPublic);

    const seen = new Map<string, string>();
    for (const album of publicAlbums) {
      for (const entry of albumsDb.getAlbumFileEntries(album.id)) {
        if (IMAGE_PATTERN.test(entry.fileName) && !seen.has(entry.fileName)) {
          seen.set(entry.fileName, entry.addedAt);
        }
      }
    }

    const names = [...seen.entries()]
      .sort(
        ([, a], [, b]) => new Date(b).getTime() - new Date(a).getTime(),
      )
      .map(([name]) => name);

    const uploadsDir = getAbsoluteUploadPath();
    let bytes = 0;
    for (const name of names) {
      try {
        bytes += statSync(join(uploadsDir, name)).size;
      } catch {
        // Entrée orpheline en base : elle ne compte pas dans le total.
      }
    }

    return {
      wallImages: names.slice(0, WALL_SAMPLE),
      imagesTotal: names.length,
      albumsTotal: publicAlbums.length,
      bytesTotal: bytes,
    };
  } catch (error) {
    // Base absente (build, première installation) : la page doit rester servie.
    console.error("Catalogue public indisponible pour la page d'accueil:", error);
    return {
      wallImages: [],
      imagesTotal: 0,
      albumsTotal: 0,
      bytesTotal: 0,
    };
  }
}

export default function HomePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  return (
    <HomePageClient showcase={readPublicShowcase()} apiBaseUrl={apiBaseUrl} />
  );
}
