import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/module-manager.api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const session = await auth();
  try {
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { moduleName } = await params;

    // Initialiser le gestionnaire de modules API
    await initApiModuleManager();

    // Supprimer le module
    const success = await apiModuleManager.deleteModule(moduleName);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Échec de la suppression du module" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Erreur lors de la suppression du module:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du module" },
      { status: 500 }
    );
  }
}
