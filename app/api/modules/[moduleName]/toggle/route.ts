import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/api-module-manager";

export async function POST(
  request: NextRequest,
  { params }: { params: { moduleName: string } }
) {
  const session = await auth();
  try {
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { moduleName } = params;

    // Initialiser le gestionnaire de modules API
    await initApiModuleManager();

    // Activer/désactiver le module
    const success = await apiModuleManager.toggleModule(moduleName);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Échec de la modification de l'état du module" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Erreur lors de la modification de l'état du module:", error);
    return NextResponse.json(
      { error: "Erreur lors de la modification de l'état du module" },
      { status: 500 }
    );
  }
}
