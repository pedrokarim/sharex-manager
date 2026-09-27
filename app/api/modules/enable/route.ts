import { NextRequest, NextResponse } from "next/server";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { requireAccess } from "@/lib/api-guard";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

export async function POST(request: NextRequest) {
  // Installer, activer ou supprimer un module revient à décider du code que
  // le serveur exécute : réservé aux administrateurs.
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const session = guard.session;
  try {
    const body = await request.json();
    const { moduleName } = body;

    if (!moduleName) {
      return NextResponse.json(
        { error: "Nom du module requis" },
        { status: 400 }
      );
    }

    await apiModuleManager.ensureInitialized();

    // Activer le module
    const success = await apiModuleManager.toggleModule(moduleName);

    if (success) {
      logDb.createLog({
        level: "info",
        action: "module.enable" as LogAction,
        message: `Module ${moduleName} activé`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json({ success: true });
    } else {
      logDb.createLog({
        level: "error",
        action: "system.error" as LogAction,
        message: `Erreur lors de l'activation du module ${moduleName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        { error: `Erreur lors de l'activation du module ${moduleName}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Erreur lors de l'activation du module:", error);
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: `Erreur lors de l'activation du module: ${error}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return NextResponse.json(
      { error: "Erreur lors de l'activation du module" },
      { status: 500 }
    );
  }
}
