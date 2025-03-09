import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { moduleName: string } }
) {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { moduleName } = params;

    // Activer/désactiver le module
    const success = await moduleManager.toggleModule(moduleName);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Impossible de modifier l'état du module" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error(
      `Erreur lors de l'activation/désactivation du module ${params.moduleName}:`,
      error
    );
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
