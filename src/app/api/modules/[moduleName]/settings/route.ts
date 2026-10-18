import { NextRequest, NextResponse } from "next/server";
import { isAdmin, requireAccess, withAuth } from "@/lib/api-guard";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

/** Nom de réglage qui ressemble à un secret : jamais montré à un compte non admin. */
const SECRET_LIKE = /(key|secret|token|password|credential)/i;

/**
 * Les réglages d'un module restent lisibles par tout compte connecté : les
 * fenêtres d'action sur un fichier (filigrane…) partent des valeurs
 * enregistrées. Ils ne portent pas de secret (les clés des services vivent
 * dans les magasins de secrets des modules) ; par prudence, un nom de réglage
 * qui ressemble à un secret n'est rendu qu'à un admin.
 */
export const GET = withAuth(async (
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> },
  session
) => {
  try {
    const { moduleName } = await params;

    await apiModuleManager.ensureInitialized();

    const loadedModule = apiModuleManager.getLoadedModule(moduleName);
    if (!loadedModule) {
      return NextResponse.json(
        { error: `Module ${moduleName} non trouvé` },
        { status: 404 }
      );
    }

    const settings: Record<string, unknown> = loadedModule.config.settings || {};
    return NextResponse.json({
      settings: isAdmin(session)
        ? settings
        : Object.fromEntries(Object.entries(settings).filter(([name]) => !SECRET_LIKE.test(name))),
    });
  } catch (error) {
    console.error("Error fetching module settings:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des paramètres" },
      { status: 500 }
    );
  }
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  // Les réglages d'un module pilotent son comportement serveur : réservés
  // aux administrateurs, la lecture reste ouverte aux comptes connectés.
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const session = guard.session;

  try {
    const { moduleName } = await params;
    const { settings } = await request.json();

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Settings invalides" },
        { status: 400 }
      );
    }

    await apiModuleManager.ensureInitialized();

    const success = await apiModuleManager.updateModuleSettings(
      moduleName,
      settings
    );

    if (success) {
      // Return the updated settings
      const loadedModule = apiModuleManager.getLoadedModule(moduleName);
      return NextResponse.json({
        success: true,
        settings: loadedModule?.config.settings || {},
      });
    } else {
      return NextResponse.json(
        { error: "Échec de la mise à jour des paramètres" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error updating module settings:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour des paramètres" },
      { status: 500 }
    );
  }
}
