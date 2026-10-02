import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

/**
 * Sources de fichiers que les modules activés proposent à la fenêtre
 * « Ajouter » de la galerie (`gallerySources` de leur `module.json`).
 *
 * Une source n'est listée que si ses deux fonctions sont ouvertes aux comptes
 * ordinaires : sinon la fenêtre afficherait un onglet qui répond « interdit ».
 */
export async function GET() {
  const access = await requireAccess("user");
  if (!access.ok) return access.response;

  try {
    await apiModuleManager.ensureInitialized();
    const modules = (await apiModuleManager.getModules()).filter((module) => module.enabled);
    const sources = modules.flatMap((module) =>
      (module.gallerySources ?? [])
        .filter((source) => module.functions?.[source.list] && module.functions?.[source.import])
        .map((source) => ({
          module: module.name,
          id: source.id,
          label: source.label,
          description: source.description,
          icon: source.icon,
          kinds: source.kinds,
          list: source.list,
          import: source.import,
        }))
    );
    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Erreur lors de la récupération des sources de modules:", error);
    return NextResponse.json({ error: "Sources de modules indisponibles" }, { status: 500 });
  }
}
