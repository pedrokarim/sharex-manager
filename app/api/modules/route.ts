import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/api-module-manager";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

export async function GET(request: NextRequest) {
  const session = await auth();
  try {
    if (!session) {
      logDb.createLog({
        level: "warning",
        action: "system.error" as LogAction,
        message: "Tentative d'accès à la liste des modules non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Initialiser le gestionnaire de modules API
    await initApiModuleManager();

    // Récupérer la liste des modules
    const modules = await apiModuleManager.getModules();

    return NextResponse.json({ modules });
  } catch (error) {
    console.error("Erreur lors de la récupération des modules:", error);
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: `Erreur lors de la récupération des modules: ${error}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return NextResponse.json(
      { error: "Erreur lors de la récupération des modules" },
      { status: 500 }
    );
  }
}
