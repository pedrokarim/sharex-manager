import { Package } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ModuleList } from "@/components/modules/module-list";

export const metadata = {
  title: "Administration des modules",
  description: "Gérez les modules installés dans ShareX Manager",
};

export default function ModulesPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Package}
        title="Gestion des modules"
        description="Installez, activez, désactivez et supprimez des modules pour étendre les fonctionnalités de votre application."
      />
      <ModuleList />
    </div>
  );
}
