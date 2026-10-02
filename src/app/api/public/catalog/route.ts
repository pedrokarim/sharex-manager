import { NextRequest, NextResponse } from "next/server";
import { isInCatalog } from "@/lib/album-visibility";
import { albumsDb } from "@/lib/utils/albums-db";
import { isImageFile, isVideoFile } from "@/lib/media-kind";
import { videoMeta } from "@/lib/media/video";
import { readCatalogOverview } from "@/lib/public-catalog";
import { summarizeMonths } from "@/lib/timeline";

// GET /api/public/catalog - Récupérer tous les albums publics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const includeImages = searchParams.get("includeImages") === "true";
    const randomImages = parseInt(searchParams.get("randomImages") || "0");
    const images = searchParams.get("images") === "true";
    const imagesLimit = parseInt(searchParams.get("imagesLimit") || "60");
    const imagesOffset = parseInt(searchParams.get("imagesOffset") || "0");

    // Récupérer tous les albums publics
    const allAlbums = albumsDb.getAlbums();
    // Le catalogue ne montre que les albums qui y sont listés : un album
    // public par son seul lien n'y verse pas ses images.
    const publicAlbums = allAlbums.filter(isInCatalog);

    // Si on veut lister toutes les images (pagination pour infinite scroll).
    // Les vidéos des albums publics y figurent aussi ; le héros et les
    // couvertures d'album, eux, restent des images.
    if (images) {
      const allImages: Array<{ name: string; addedAt: string; albumSlug: string; albumName: string; durationMs?: number }> = [];

      for (const album of publicAlbums) {
        const fileEntries = albumsDb.getAlbumFileEntries(album.id);
        const imgs = fileEntries
          .filter((entry) => isImageFile(entry.fileName) || isVideoFile(entry.fileName))
          .map((entry) => ({
            name: entry.fileName,
            addedAt: entry.addedAt,
            albumSlug: album.publicSlug || "",
            albumName: album.name,
            ...(isVideoFile(entry.fileName) ? { durationMs: videoMeta(entry.fileName)?.durationMs } : {}),
          }));
        allImages.push(...imgs);
      }

      // Déduplication stricte (par nom de fichier) + ordre stable (plus récent en premier)
      const deduped = Array.from(
        allImages.reduce((acc, img) => {
          if (!acc.has(img.name)) acc.set(img.name, img);
          return acc;
        }, new Map<string, { name: string; addedAt: string; albumSlug: string; albumName: string; durationMs?: number }>())
          .values(),
      ).sort((a, b) => {
        const ta = new Date(a.addedAt).getTime();
        const tb = new Date(b.addedAt).getTime();
        return tb - ta;
      });

      // Frise des mois : de quoi dessiner le rail de défilement et sauter à une date.
      if (searchParams.get("timeline") === "1") {
        const tzOffset = parseInt(searchParams.get("tz") || "0") || 0;
        return NextResponse.json({
          months: summarizeMonths(deduped.map((entry) => entry.addedAt), tzOffset),
          total: deduped.length,
        });
      }

      const slice = deduped.slice(imagesOffset, imagesOffset + imagesLimit);
      const nextOffset = imagesOffset + slice.length;

      return NextResponse.json({
        images: slice,
        imagesTotal: deduped.length,
        videosTotal: deduped.filter((entry) => isVideoFile(entry.name)).length,
        imagesNextOffset: nextOffset,
        imagesHasMore: nextOffset < deduped.length,
      });
    }

    return NextResponse.json(readCatalogOverview({ limit, includeImages, randomImages }));
  } catch (error) {
    console.error("Erreur lors de la récupération du catalogue:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
