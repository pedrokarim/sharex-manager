import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer le nom du module depuis les paramètres de requête
    const moduleName = request.nextUrl.searchParams.get("moduleName");

    if (!moduleName) {
      return NextResponse.json(
        { error: "Nom de module non spécifié" },
        { status: 400 }
      );
    }

    // Récupérer les informations du fichier depuis le corps de la requête
    const { fileInfo } = await request.json();

    // Récupérer le module
    const loadedModule = moduleManager.getLoadedModule(moduleName);
    if (!loadedModule) {
      return NextResponse.json({ error: "Module non trouvé" }, { status: 404 });
    }

    // Vérifier si le module a une interface utilisateur
    if (!loadedModule.config.hasUI) {
      return NextResponse.json(
        { error: "Le module n'a pas d'interface utilisateur" },
        { status: 400 }
      );
    }

    // Dans une implémentation réelle, nous retournerions les informations nécessaires
    // pour charger l'interface utilisateur du module
    return NextResponse.json({
      success: true,
      moduleName: loadedModule.config.name,
      settings: loadedModule.config.settings,
    });
  } catch (error) {
    console.error(
      "Erreur lors du chargement de l'interface utilisateur du module:",
      error
    );
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
