import { statSync } from "fs";
import { join } from "path";

import { getAbsoluteUploadPath } from "@/lib/config";
import { albumsDb } from "@/lib/utils/albums-db";
import { HomePageClient, type HomeShowcase } from "./page.client";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "ShareX Manager — vos captures, chez vous",
  description:
    "Gestionnaire d'images auto-hébergé pour ShareX, Flameshot et mobile : upload en un raccourci, lien public immédiat, albums, statistiques et clés d'API.",
  path: "/",
});


// Le mur et les chiffres reflètent le catalogue public réel : ils doivent
// suivre les publications, sans rejouer la requête à chaque visite.
export const revalidate = 300;

const IMAGE_PATTERN = /\.(jpe?g|png|gif|webp)$/i;

/**
 * Nombre de vignettes du mur, en bas de page. La grille passe de 3 à 6
 * colonnes : 12 se pose sans dernière ligne incomplète aux deux largeurs.
 */
const WALL_SAMPLE = 12;

/**
 * Échantillon réparti sur toute la liste plutôt que sa tête.
 *
 * Les fichiers ajoutés en une fois partagent le même horodatage : prendre les
 * douze premiers donne un tri arbitraire où les doublons se suivent. Un pas
 * régulier balaie l'ensemble du catalogue et montre autre chose à chaque fois
 * que le contenu bouge.
 */
function pickSpread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

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
      wallImages: pickSpread(names, WALL_SAMPLE),
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
