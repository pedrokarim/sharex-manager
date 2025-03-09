import { moduleManager } from "@/lib/modules/module-manager";
import { ModulesPageClient } from "./page.client";

export const metadata = {
  title: "Gestion des modules - ShareX Manager",
  description: "Gérez les modules installés dans ShareX Manager",
};

export default async function ModulesPage() {
  const modules = await moduleManager.getModules();

  return <ModulesPageClient initialModules={modules} />;
}
