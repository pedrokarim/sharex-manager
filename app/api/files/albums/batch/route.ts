import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { AlbumsDatabase } from "@/lib/utils/albums-db";
import { logDb } from "@/lib/utils/db";
import { z } from "zod";

const BatchAlbumsSchema = z.object({
  fileNames: z.array(z.string().min(1)).min(1).max(100), // Max 100 fichiers par requête
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { fileNames } = BatchAlbumsSchema.parse(body);

    const fileAlbumsMap: Record<string, any[]> = {};

    // Récupérer les albums pour tous les fichiers en une seule requête
    const db = AlbumsDatabase.getConnection();
    const query = db.prepare(`
      SELECT af.file_name, a.id, a.name, a.description, a.created_at
      FROM album_files af
      INNER JOIN albums a ON af.album_id = a.id
      WHERE af.file_name IN (${fileNames.map(() => "?").join(",")})
      ORDER BY af.file_name, a.name
    `);

    const results = query.all(...fileNames) as any[];

    // Grouper les résultats par nom de fichier
    for (const row of results) {
      if (!fileAlbumsMap[row.file_name]) {
        fileAlbumsMap[row.file_name] = [];
      }
      fileAlbumsMap[row.file_name].push({
        id: row.id,
        name: row.name,
        description: row.description,
        createdAt: row.created_at,
        fileCount: 0, // On ne calcule pas le fileCount ici pour optimiser
      });
    }

    // S'assurer que tous les fichiers ont une entrée (même vide)
    for (const fileName of fileNames) {
      if (!fileAlbumsMap[fileName]) {
        fileAlbumsMap[fileName] = [];
      }
    }

    // Log de l'action
    logDb.createLog({
      level: "info",
      action: "api.request",
      message: `Récupération batch des albums pour ${fileNames.length} fichiers`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        fileCount: fileNames.length,
        albumsFound: Object.values(fileAlbumsMap).flat().length,
      },
    });

    return NextResponse.json({ fileAlbumsMap });
  } catch (error) {
    console.error("Erreur lors de la récupération batch des albums:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des albums" },
      { status: 500 }
    );
  }
}
