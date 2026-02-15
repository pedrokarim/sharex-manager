import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

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

    return NextResponse.json({
      settings: loadedModule.config.settings || {},
    });
  } catch (error) {
    console.error("Error fetching module settings:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des paramètres" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

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
