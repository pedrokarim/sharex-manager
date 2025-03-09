import {
  apiModuleManager,
  initApiModuleManager,
} from "@/lib/modules/api-module-manager";
import { ModuleList } from "@/components/modules/module-list";
import { Metadata } from "next";

export const metadata = {
  title: "Gestion des modules - ShareX Manager",
  description: "Gérez les modules installés dans ShareX Manager",
};

export default async function ModulesPage() {
  // Initialiser le gestionnaire de modules API
  await initApiModuleManager();

  // Récupérer la liste des modules
  const modules = await apiModuleManager.getModules();

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Gestion des modules</h1>
      <ModuleList />
    </div>
  );
}
