import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  try {
    if (!session) {
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

    await apiModuleManager.ensureInitialized();

    // Récupérer les modules compatibles avec le type de fichier
    const modules = await apiModuleManager.getModulesByFileType(fileType);

    return NextResponse.json({ modules });
  } catch (error) {
    console.error("Erreur lors de la récupération des modules:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des modules" },
      { status: 500 }
    );
  }
}
