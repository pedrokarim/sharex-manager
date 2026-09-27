import { NextRequest, NextResponse } from "next/server";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { isVideoFile } from "@/lib/media-kind";
import { videoMeta } from "@/lib/media/video";

// GET /api/public/albums/[slug] - Récupérer un album public par son slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: "Slug requis" }, { status: 400 });
    }

    const album = albumsDb.getAlbumByPublicSlug(slug);

    if (!album) {
      logDb.createLog({
        level: "warning",
        action: "album.public.get" as LogAction,
        message: `Tentative d'accès à un album public inexistant: ${slug}`,
        userId: undefined,
        userEmail: undefined,
        metadata: { slug },
      });
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    // Récupérer les fichiers de l'album avec leurs dates d'ajout
    const files = albumsDb.getAlbumFileEntries(album.id);

    logDb.createLog({
      level: "info",
      action: "album.public.get" as LogAction,
      message: `Accès public à l'album "${album.name}"`,
      userId: undefined,
      userEmail: undefined,
      metadata: {
        albumId: album.id,
        albumName: album.name,
        fileCount: files.length,
        slug,
      },
    });

    return NextResponse.json({
      ...album,
      // La durée d'une vidéo s'affiche sur sa vignette.
      files: files.map((entry) =>
        isVideoFile(entry.fileName) ? { ...entry, durationMs: videoMeta(entry.fileName)?.durationMs } : entry
      ),
    });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la récupération de l'album public",
      userId: undefined,
      userEmail: undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        slug: (await params).slug,
      },
    });

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
