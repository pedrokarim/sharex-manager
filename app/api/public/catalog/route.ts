import { NextRequest, NextResponse } from "next/server";
import { albumsDb } from "@/lib/utils/albums-db";

// GET /api/public/catalog - Récupérer tous les albums publics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const includeImages = searchParams.get("includeImages") === "true";
    const randomImages = parseInt(searchParams.get("randomImages") || "0");

    // Récupérer tous les albums publics
    const allAlbums = albumsDb.getAlbums();
    const publicAlbums = allAlbums.filter((album) => album.isPublic);

    // Si on veut des images aléatoires pour le hero
    let heroImages: string[] = [];
    if (randomImages > 0) {
      const allImages: string[] = [];

      for (const album of publicAlbums) {
        const files = albumsDb.getAlbumFiles(album.id);
        const images = files.filter((fileName) =>
          /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
        );
        allImages.push(...images);
      }

      // Mélanger et prendre le nombre demandé
      const shuffled = allImages.sort(() => Math.random() - 0.5);
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
