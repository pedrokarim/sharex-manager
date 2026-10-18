import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { albumsDb } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

// GET /api/albums/stats - Récupérer les statistiques des albums
export const GET = withAuth(async (request: NextRequest, _context: unknown, session) => {
  try {
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
});
