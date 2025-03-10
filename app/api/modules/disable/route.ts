import { NextRequest, NextResponse } from "next/server";
import { apiModuleManager } from "@/lib/modules/api-module-manager";
import { auth } from "@/auth";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    if (!session) {
      logDb.createLog({
        level: "warning",
        action: "system.error" as LogAction,
        message: "Tentative de désactivation de module non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { moduleName } = body;

    if (!moduleName) {
      return NextResponse.json(
        { error: "Nom du module requis" },
        { status: 400 }
      );
    }

    // Désactiver le module
    const success = await apiModuleManager.toggleModule(moduleName);

    if (success) {
      logDb.createLog({
        level: "info",
        action: "module.disable" as LogAction,
        message: `Module ${moduleName} désactivé`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      // Recharger les modules pour s'assurer que le module est correctement désactivé
      await apiModuleManager.loadModules();

      return NextResponse.json({ success: true });
    } else {
      logDb.createLog({
        level: "error",
        action: "system.error" as LogAction,
        message: `Erreur lors de la désactivation du module ${moduleName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        { error: `Erreur lors de la désactivation du module ${moduleName}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Erreur lors de la désactivation du module:", error);
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: `Erreur lors de la désactivation du module: ${error}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return NextResponse.json(
      { error: "Erreur lors de la désactivation du module" },
      { status: 500 }
    );
  }
}
