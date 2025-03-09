import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";

export async function DELETE(
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

    // Supprimer le module
    const success = await moduleManager.deleteModule(moduleName);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Impossible de supprimer le module" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error(
      `Erreur lors de la suppression du module ${params.moduleName}:`,
      error
    );
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
