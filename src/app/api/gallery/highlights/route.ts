import { NextRequest, NextResponse } from "next/server";

import { requireAccess } from "@/lib/api-guard";
import { pickGalleryHighlights, type HighlightAlbum } from "@/lib/gallery-highlights";
import { listGalleryFiles } from "@/lib/gallery-listing";
import { isImageFile } from "@/lib/media-kind";
import { albumsDb } from "@/lib/utils/albums-db";

/**
 * Cartes du bandeau « À la une » de la galerie : dernier favori, dernier
 * fichier privé, souvenir d'une année précédente, dernier album. Les cartes
 * des modules sont demandées à part, par le bandeau, aux modules activés.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAccess("user");
  if (!guard.ok) return guard.response;

  try {
    const tzOffset = Number(request.nextUrl.searchParams.get("tz")) || 0;
    const files = await listGalleryFiles({ sort: "date", order: "desc" });

    // L'album modifié en dernier qui a de quoi s'illustrer.
    const albums: HighlightAlbum[] = [];
    for (const album of albumsDb.getAlbums(guard.session.user.id).slice(0, 12)) {
      const cover =
        album.thumbnailFile && isImageFile(album.thumbnailFile)
          ? album.thumbnailFile
          : albumsDb.getAlbumFiles(album.id).find((name) => isImageFile(name));
      if (!cover) continue;
      albums.push({ id: album.id, name: album.name, fileCount: album.fileCount, thumbnailFile: cover });
      break;
    }

    return NextResponse.json({ highlights: pickGalleryHighlights(files, albums, new Date(), tzOffset) });
  } catch (error) {
    console.error("Erreur lors de la préparation du bandeau de la galerie:", error);
    return NextResponse.json({ error: "Bandeau indisponible" }, { status: 500 });
  }
}
