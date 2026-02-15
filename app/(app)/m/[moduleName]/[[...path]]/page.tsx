import { notFound } from "next/navigation";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { ModulePageLoader } from "./module-page-loader";

interface ModulePageProps {
  params: Promise<{
    moduleName: string;
    path?: string[];
  }>;
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
