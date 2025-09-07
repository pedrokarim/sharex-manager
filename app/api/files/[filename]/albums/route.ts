import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { AlbumsDatabase } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { filename } = params;
    if (!filename) {
      return NextResponse.json(
        { error: "Nom de fichier requis" },
        { status: 400 }
      );
    }

    const albums = AlbumsDatabase.getAlbumsForFile(filename);

    // Log de l'action
    logDb.createLog({
      level: "info",
      action: "api.request",
      message: `Récupération des albums pour le fichier ${filename}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: { filename, albumCount: albums.length },
    });

    return NextResponse.json({ albums });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des albums du fichier:",
      error
    );
    return NextResponse.json(
      { error: "Erreur lors de la récupération des albums" },
      { status: 500 }
    );
  }
}
