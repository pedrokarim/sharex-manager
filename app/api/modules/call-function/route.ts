import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/module-manager.api";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    if (!session) {
      logDb.createLog({
        level: "warning",
        action: "module.function" as LogAction,
        message: "Tentative d'appel de fonction non autorisée",
        userId: undefined,
        userEmail: undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { moduleName, functionName, args = [] } = await request.json();

    if (!moduleName || !functionName) {
      logDb.createLog({
        level: "warning",
        action: "module.function" as LogAction,
        message:
          "Tentative d'appel de fonction sans nom de module ou de fonction",
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json(
        { error: "Nom de module ou de fonction non fourni" },
        { status: 400 }
      );
    }

    // S'assurer que le gestionnaire de modules est initialisé
    await initApiModuleManager();

    // Vérifier si le module existe
    const loadedModule = apiModuleManager.getLoadedModule(moduleName);
    if (!loadedModule) {
      const availableModules = apiModuleManager
        .getAllLoadedModules()
        .map((m) => m.name)
        .join(", ");

      logDb.createLog({
        level: "error",
        action: "module.function" as LogAction,
        message: `Module ${moduleName} non trouvé. Modules disponibles: ${availableModules}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        {
          error: `Module ${moduleName} non trouvé`,
          availableModules,
        },
        { status: 404 }
      );
    }

    // Vérifier si le module a la fonction demandée
    const capabilities = loadedModule.config.capabilities || [];
    if (!capabilities.includes(functionName)) {
      logDb.createLog({
        level: "error",
        action: "module.function" as LogAction,
        message: `Fonction ${functionName} non trouvée dans le module ${moduleName}`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });

      return NextResponse.json(
        {
          error: `Fonction ${functionName} non trouvée dans le module ${moduleName}`,
          availableFunctions: capabilities,
        },
        { status: 404 }
      );
    }

    // Désérialiser les arguments
    const deserializedArgs = args.map((arg: any) => {
      if (arg && arg.type === "buffer" && arg.data) {
        return Buffer.from(arg.data, "base64");
      }
      return arg;
    });

    // Appeler la fonction du module
    const result = await apiModuleManager.callModuleFunction(
      moduleName,
      functionName,
      ...deserializedArgs
    );

    // Journaliser l'action
    logDb.createLog({
      level: "info",
      action: "module.function" as LogAction,
      message: `Fonction ${functionName} du module ${moduleName} appelée avec succès`,
      userId: session.user?.id || undefined,
      userEmail: session.user?.email || undefined,
      metadata: {
        moduleName,
        functionName,
      },
    });

    // Sérialiser le résultat pour le transfert
    let serializedResult: any;
    if (result instanceof Buffer) {
      serializedResult = {
        type: "buffer",
        data: result.toString("base64"),
      };
    } else {
      serializedResult = {
        type: typeof result,
        data: result,
      };
    }

    return NextResponse.json({
      success: true,
      ...serializedResult,
    });
  } catch (error) {
    console.error("Erreur lors de l'appel de fonction:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'appel de fonction" },
      { status: 500 }
    );
  }
}
