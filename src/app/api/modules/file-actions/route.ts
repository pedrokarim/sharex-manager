import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import type { ModuleConfig } from "@/types/modules";

/**
 * Ce que les modules activés proposent pour une sélection de fichiers.
 *
 * Deux familles :
 * - `links` : actions déclarées dans `fileActions`, qui ouvrent une page du
 *   module avec les fichiers (ex. « Retoucher dans le studio ») ;
 * - `processors` : modules de traitement (`supportedFileTypes`) qui
 *   transforment le fichier sur place, avec ou sans interface de réglage.
 *
 * Une action n'est proposée que si elle accepte le type de **chaque** fichier
 * de la sélection. Un module désactivé n'apparaît jamais.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const types = [
    ...new Set(
      (request.nextUrl.searchParams.get("types") ?? "")
        .split(",")
        .map((type) => type.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean)
    ),
  ];
  if (types.length === 0) {
    return NextResponse.json(
      { error: "Types de fichiers non spécifiés" },
      { status: 400 }
    );
  }

  try {
    await apiModuleManager.ensureInitialized();
    const modules = (await apiModuleManager.getModules()).filter(
      (module) => module.enabled
    );

    const accepts = (fileTypes: string[]) =>
      fileTypes.includes("*") ||
      types.every((type) => fileTypes.map((entry) => entry.toLowerCase()).includes(type));

    const links = modules.flatMap((module) =>
      (module.fileActions ?? [])
        .filter((action) => accepts(action.fileTypes))
        .map((action) => ({
          module: module.name,
          moduleTitle: moduleTitle(module),
          id: action.id,
          label: action.label,
          description: action.description,
          icon: action.icon,
          maxFiles: action.maxFiles,
          href: `/m/${module.name}${action.page ? `/${action.page}` : ""}`,
          params: action.params ?? {},
        }))
    );

    const processors = modules
      .filter((module) => accepts(module.supportedFileTypes))
      .map((module) => ({
        name: module.name,
        description: module.description,
        category: module.category,
        icon: module.icon,
        hasUI: module.hasUI,
      }));

    return NextResponse.json({ links, processors });
  } catch (error) {
    console.error("Erreur lors de la récupération des actions de modules:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des actions de modules" },
      { status: 500 }
    );
  }
}

function moduleTitle(module: ModuleConfig) {
  return module.navItems?.[0]?.title ?? module.name;
}
