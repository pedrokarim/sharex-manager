import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { logDb } from "@/lib/utils/db";
import { LogAction } from "@/lib/types/logs";
import { hasAccess, isAdmin, isTrustedOrigin } from "@/lib/api-guard";

/** Fonctions appelées par le gestionnaire de modules lui-même. */
const INTERNAL_FUNCTIONS = new Set(["initModule", "processImage", "default"]);

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
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

    // Une page d'un autre site peut envoyer un formulaire en text/plain avec
    // le cookie de session : seules les requêtes JSON de ce site passent.
    if (!isTrustedOrigin(request.headers.get("origin"))) {
      return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "Corps JSON attendu" }, { status: 415 });
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

    await apiModuleManager.ensureInitialized();

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

    // Vérifier si le module a la fonction demandée. Les fonctions de cycle de
    // vie sont exportées pour le gestionnaire de modules, jamais pour le
    // navigateur.
    const capabilities = loadedModule.config.capabilities || [];
    if (!capabilities.includes(functionName) || INTERNAL_FUNCTIONS.has(functionName)) {
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
          ...(isAdmin(session) ? { availableFunctions: capabilities } : {}),
        },
        { status: 404 }
      );
    }

    // Chaque module déclare dans `module.json` (`functions`) ce qu'un compte
    // « user » peut appeler ; le reste est réservé aux administrateurs. Sans
    // cette liste, toute fonction exportée était ouverte à tout compte
    // connecté, y compris celles qui enregistrent des commandes à exécuter.
    const requiredAccess = loadedModule.config.functions?.[functionName] ?? "admin";
    // Une fonction du catalogue public rend des chemins de fichiers au
    // serveur : elle ne passe jamais par ici, quel que soit le compte.
    if (requiredAccess === "public") {
      return NextResponse.json(
        { error: `Fonction ${functionName} non trouvée dans le module ${moduleName}` },
        { status: 404 }
      );
    }
    if (!hasAccess(session, requiredAccess)) {
      logDb.createLog({
        level: "warning",
        action: "module.function" as LogAction,
        message: `Appel refusé : ${moduleName}.${functionName} est réservé aux administrateurs`,
        userId: session.user?.id || undefined,
        userEmail: session.user?.email || undefined,
      });
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
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

    // Le message vient de la fonction du module et porte l'information utile
    // (« quota dépassé », « clé refusée »…). Le remplacer par un libellé
    // générique laissait l'utilisateur sans piste.
    const message =
      error instanceof Error ? error.message : "Erreur lors de l'appel de fonction";

    logDb.createLog({
      level: "error",
      action: "module.function" as LogAction,
      message: `Échec de l'appel de fonction : ${message}`,
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
