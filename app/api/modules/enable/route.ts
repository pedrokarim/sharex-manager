import { NextRequest, NextResponse } from "next/server";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
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
        message: "Tentative d'activation de module non autorisée",
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
