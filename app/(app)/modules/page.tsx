import { Metadata } from "next";
import { ModuleList } from "@/components/modules/module-list";

export const metadata: Metadata = {
  title: "Gestion des Modules | ShareX Manager",
  description: "Gérez les modules de votre application ShareX Manager",
};

export default function ModulesPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gestion des Modules</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Installez, activez, désactivez et supprimez des modules pour étendre
          les fonctionnalités de votre application.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <ModuleList />
      </div>
    </div>
  );
}
