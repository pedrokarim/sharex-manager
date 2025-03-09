import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer le type de fichier depuis les paramètres de requête
    const fileType = request.nextUrl.searchParams.get("fileType");

    if (!fileType) {
      return NextResponse.json(
        { error: "Type de fichier non spécifié" },
        { status: 400 }
      );
    }

    // Récupérer les modules qui supportent ce type de fichier
    const modules = await moduleManager.getModulesByFileType(fileType);

    return NextResponse.json(modules);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des modules par type de fichier:",
      error
    );
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
