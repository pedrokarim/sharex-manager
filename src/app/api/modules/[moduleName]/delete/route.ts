import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  // Installer, activer ou supprimer un module revient à décider du code que
  // le serveur exécute : réservé aux administrateurs.
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const session = guard.session;
  try {
    const { moduleName } = await params;

    await apiModuleManager.ensureInitialized();

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
