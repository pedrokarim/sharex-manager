import { Metadata } from "next";
import { Puzzle } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ModuleList } from "@/components/modules/module-list";

export const metadata: Metadata = {
  title: "Gestion des modules",
  description: "Gérez les modules de votre application ShareX Manager",
};

export default function ModulesPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Puzzle}
        title="Gestion des modules"
        description="Installez, activez, désactivez et supprimez des modules pour étendre les fonctionnalités de votre application."
      />
      <ModuleList />
    </div>
  );
}
