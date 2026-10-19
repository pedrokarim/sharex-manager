import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { modulePageTitle } from "@/lib/modules/page-title";
import { ModulePageLoader } from "./module-page-loader";

interface ModulePageProps {
  params: Promise<{
    moduleName: string;
    path?: string[];
  }>;
}

/**
 * Le titre nomme la page et son module : « Projets · Clip Studio » plutôt que
 * l'identifiant technique dans l'onglet. Le `noindex` vient du layout du groupe (app).
 */
export async function generateMetadata({
  params,
}: ModulePageProps): Promise<Metadata> {
  const { moduleName, path: pathSegments } = await params;

  try {
    await apiModuleManager.ensureInitialized();
    const loadedModule = apiModuleManager.getLoadedModule(moduleName);
    if (loadedModule?.config) {
      return { title: modulePageTitle(loadedModule.config, pathSegments?.join("/") || "") };
    }
  } catch (error) {
    console.error(`Métadonnées du module "${moduleName}" indisponibles:`, error);
  }

  return { title: "Module" };
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { moduleName, path: pathSegments } = await params;
  const pagePath = pathSegments?.join("/") || "";

  await apiModuleManager.ensureInitialized();

  const loadedModule = apiModuleManager.getLoadedModule(moduleName);
  if (!loadedModule || loadedModule.status !== "loaded") {
    notFound();
  }

  const pages = loadedModule.config.pages || [];
  const pageConfig = pages.find((p) => p.path === pagePath);
  if (!pageConfig) {
    notFound();
  }

  return (
    <ModulePageLoader
      moduleName={moduleName}
      pagePath={pagePath}
      moduleConfig={loadedModule.config}
      settings={loadedModule.config.settings || {}}
    />
  );
}
