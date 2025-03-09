import { NextRequest, NextResponse } from "next/server";
import { moduleManager } from "@/lib/modules/module-manager";
import { auth } from "@/auth";
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

    // Récupérer tous les modules
    const modules = await moduleManager.getModules();

    return NextResponse.json({
      success: true,
      modules,
    });
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
