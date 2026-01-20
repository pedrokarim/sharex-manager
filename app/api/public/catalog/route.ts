import { NextRequest, NextResponse } from "next/server";
import { albumsDb } from "@/lib/utils/albums-db";

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
    const publicAlbums = allAlbums.filter((album) => album.isPublic);

    // Si on veut lister toutes les images (pagination pour infinite scroll)
    if (images) {
      const allImages: Array<{ name: string; addedAt: string; albumSlug: string; albumName: string }> = [];

      for (const album of publicAlbums) {
        const fileEntries = albumsDb.getAlbumFileEntries(album.id);
        const imgs = fileEntries
          .filter((entry) => /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.fileName))
          .map((entry) => ({
            name: entry.fileName,
            addedAt: entry.addedAt,
            albumSlug: album.publicSlug || "",
            albumName: album.name,
          }));
        allImages.push(...imgs);
      }

      // Déduplication stricte (par nom de fichier) + ordre stable (plus récent en premier)
      const deduped = Array.from(
        allImages.reduce((acc, img) => {
          if (!acc.has(img.name)) acc.set(img.name, img);
          return acc;
        }, new Map<string, { name: string; addedAt: string; albumSlug: string; albumName: string }>())
          .values(),
      ).sort((a, b) => {
        const ta = new Date(a.addedAt).getTime();
        const tb = new Date(b.addedAt).getTime();
        return tb - ta;
      });

      const slice = deduped.slice(imagesOffset, imagesOffset + imagesLimit);
      const nextOffset = imagesOffset + slice.length;

      return NextResponse.json({
        images: slice,
        imagesTotal: deduped.length,
        imagesNextOffset: nextOffset,
        imagesHasMore: nextOffset < deduped.length,
      });
    }

    // Si on veut des images aléatoires pour le hero
    let heroImages: Array<{ name: string; addedAt: string; albumSlug: string; albumName: string }> = [];
    if (randomImages > 0) {
      const allImages: Array<{ name: string; addedAt: string; albumSlug: string; albumName: string }> = [];

      for (const album of publicAlbums) {
        const fileEntries = albumsDb.getAlbumFileEntries(album.id);
        const images = fileEntries
          .filter((entry) => /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.fileName))
          .map((entry) => ({
            name: entry.fileName,
            addedAt: entry.addedAt,
            albumSlug: album.publicSlug || '',
            albumName: album.name,
          }));
        allImages.push(...images);
      }

      // Déduplication (évite les doublons renvoyés au client)
      const deduped = Array.from(
        allImages.reduce((acc, img) => {
          if (!acc.has(img.name)) acc.set(img.name, img);
          return acc;
        }, new Map<string, { name: string; addedAt: string; albumSlug: string; albumName: string }>())
          .values(),
      );

      // Mélanger et prendre le nombre demandé
      const shuffled = deduped.sort(() => Math.random() - 0.5);
      heroImages = shuffled.slice(0, randomImages);
    }

    // Enrichir les albums avec leurs images de couverture si demandé
    const enrichedAlbums = publicAlbums.slice(0, limit).map((album) => {
      if (includeImages) {
        const files = albumsDb.getAlbumFiles(album.id);
        const images = files
          .filter((fileName) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName))
          .slice(0, 4);
        return { ...album, coverImages: images };
      }
      return album;
    });

    return NextResponse.json({
      albums: enrichedAlbums,
      heroImages,
      total: publicAlbums.length,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du catalogue:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
