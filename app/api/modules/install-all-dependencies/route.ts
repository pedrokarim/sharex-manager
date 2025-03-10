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
        message: "Tentative d'installation de dépendances non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer tous les modules
    const modules = await apiModuleManager.getModules();

    // Filtrer les modules qui ont des dépendances NPM
    const modulesWithDependencies = modules.filter(
      (module) =>
        module.npmDependencies && Object.keys(module.npmDependencies).length > 0
    );

    if (modulesWithDependencies.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucun module n'a de dépendances NPM à installer",
      });
    }

    // Installer les dépendances NPM de chaque module
    const results = [];
    for (const module of modulesWithDependencies) {
      try {
        const success = await apiModuleManager.installNpmDependencies(
          module.name
        );
        results.push({
          name: module.name,
          success,
          message: success
            ? `Dépendances NPM installées avec succès pour le module ${module.name}`
            : `Erreur lors de l'installation des dépendances NPM pour le module ${module.name}`,
        });

        if (success) {
          logDb.createLog({
            level: "info",
            action: "system.error" as LogAction,
            message: `Dépendances NPM installées avec succès pour le module ${module.name}`,
            userId: session.user?.id || undefined,
            userEmail: session.user?.email || undefined,
          });
        } else {
          logDb.createLog({
            level: "error",
            action: "system.error" as LogAction,
            message: `Erreur lors de l'installation des dépendances NPM pour le module ${module.name}`,
            userId: session.user?.id || undefined,
            userEmail: session.user?.email || undefined,
          });
        }
      } catch (error) {
        console.error(
          `Erreur lors de l'installation des dépendances NPM pour le module ${module.name}:`,
          error
        );
        results.push({
          name: module.name,
          success: false,
          message: `Erreur lors de l'installation des dépendances NPM pour le module ${module.name}`,
        });

        logDb.createLog({
          level: "error",
          action: "system.error" as LogAction,
          message: `Erreur lors de l'installation des dépendances NPM pour le module ${module.name}: ${error}`,
          userId: session.user?.id || undefined,
          userEmail: session.user?.email || undefined,
        });
      }
    }

    // Recharger les modules pour s'assurer que tous les modules sont chargés
    await apiModuleManager.loadModules();

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Erreur lors de l'installation des dépendances NPM:", error);
    logDb.createLog({
      level: "error",
      action: "system.error" as LogAction,
      message: `Erreur lors de l'installation des dépendances NPM: ${error}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return NextResponse.json(
      { error: "Erreur lors de l'installation des dépendances NPM" },
      { status: 500 }
    );
  }
}
