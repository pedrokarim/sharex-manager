import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

/**
 * Active ou coupe l'application automatique d'un module à chaque capture
 * envoyée. Chaque upload passe alors par ce module : réservé aux admins.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  const { moduleName } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Valeur « enabled » attendue" }, { status: 400 });
  }

  await apiModuleManager.ensureInitialized();
  const loaded = apiModuleManager.getLoadedModule(moduleName);
  if (!loaded) {
    return NextResponse.json({ error: `Module ${moduleName} introuvable` }, { status: 404 });
  }
  if (body.enabled && !loaded.config.capabilities?.includes("processImage")) {
    return NextResponse.json({ error: "Ce module ne traite pas les images" }, { status: 400 });
  }
  if (body.enabled && loaded.config.manualOnly) {
    return NextResponse.json({ error: "Ce module se règle à la main à chaque image" }, { status: 400 });
  }

  const success = await apiModuleManager.setAutoProcess(moduleName, body.enabled);
  return success
    ? NextResponse.json({ success: true, autoProcess: body.enabled })
    : NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
}
