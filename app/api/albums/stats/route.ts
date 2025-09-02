import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

// GET /api/albums/stats - Récupérer les statistiques des albums
export async function GET(request: NextRequest) {
  const session = await auth();

  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "album.stats" as LogAction,
        message: "Tentative d'accès non autorisé aux statistiques des albums",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const stats = albumsDb.getAlbumsStats(session.user.id);

    logDb.createLog({
      level: "info",
      action: "album.stats" as LogAction,
      message: "Récupération des statistiques des albums",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        totalAlbums: stats.totalAlbums,
        totalFiles: stats.totalFiles,
      },
    });

    return NextResponse.json(stats);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: "Erreur lors de la récupération des statistiques des albums",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
