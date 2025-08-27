import { NextRequest, NextResponse } from "next/server";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { auth } from "@/auth";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import fs from "fs";
import path from "path";

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

    const { moduleName } = await request.json();

    if (!moduleName) {
      logDb.createLog({
        level: "warning",
        action: "system.error" as LogAction,
        message: "Tentative d'installation de dépendances sans nom de module",
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        { error: "Nom de module non fourni" },
        { status: 400 }
      );
    }

    // Vérifier si le module existe
    const modules = await apiModuleManager.getModules();
    const moduleExists = modules.some((m) => m.name === moduleName);

    if (!moduleExists) {
      // Si le module n'existe pas dans la liste des modules chargés,
      // vérifier s'il existe dans le système de fichiers
      const modulesDir = path.join(process.cwd(), "modules");
      const moduleFolders = fs
        .readdirSync(modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      let moduleFound = false;
      for (const folder of moduleFolders) {
        const configPath = path.join(modulesDir, folder, "module.json");
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf-8");
          try {
            const config = JSON.parse(configContent);
            if (config.name === moduleName) {
              moduleFound = true;
              break;
            }
          } catch (error) {
            console.error(
              `Erreur lors de la lecture du fichier module.json dans ${folder}:`,
              error
            );
          }
        }
      }

      if (!moduleFound) {
        logDb.createLog({
          level: "error",
          action: "system.error" as LogAction,
          message: `Module non trouvé: ${moduleName}`,
          userId: session.user?.id || undefined,
          userEmail: session.user?.email || undefined,
        });

        return NextResponse.json(
          { error: `Module ${moduleName} non trouvé` },
          { status: 404 }
        );
      }

      // Recharger les modules pour s'assurer que le module est chargé
      await apiModuleManager.loadModules();
    }

    // Installer les dépendances NPM du module
    const success = await apiModuleManager.installNpmDependencies(moduleName);

    if (success) {
      logDb.createLog({
        level: "info",
        action: "system.error" as LogAction,
        message: `Dépendances NPM installées avec succès pour le module ${moduleName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json({
        success: true,
        message: `Dépendances NPM installées avec succès pour le module ${moduleName}`,
      });
    } else {
      logDb.createLog({
        level: "error",
        action: "system.error" as LogAction,
        message: `Erreur lors de l'installation des dépendances NPM pour le module ${moduleName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        { error: "Erreur lors de l'installation des dépendances NPM" },
        { status: 500 }
      );
    }
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
