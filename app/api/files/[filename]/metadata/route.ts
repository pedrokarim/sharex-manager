import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getFileMetadata } from "@/lib/file-metadata";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { filename } = await params;
    const fileMetadata = await getFileMetadata(filename);

    if (!fileMetadata) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    return NextResponse.json(fileMetadata, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des métadonnées du fichier:",
      error,
    );

    return NextResponse.json(
      { error: "Erreur lors de la récupération des métadonnées du fichier" },
      { status: 500 },
    );
  }
}
