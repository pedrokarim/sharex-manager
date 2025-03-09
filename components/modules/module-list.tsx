"use client";

import { useEffect, useState } from "react";
import { ModuleConfig } from "@/types/modules";
import { ModuleCard } from "./module-card";
import { ModuleUpload } from "./module-upload";
import { toast } from "sonner";

export const ModuleList = () => {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModules = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/modules");

      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des modules");
      }

      const data = await response.json();
      setModules(data.modules || []);
    } catch (error) {
      console.error("Erreur lors de la récupération des modules:", error);
      toast.error("Erreur lors de la récupération des modules");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const handleToggleModule = async (moduleName: string) => {
    try {
      const response = await fetch(`/api/modules/${moduleName}/toggle`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'activation/désactivation du module");
      }

      // Mettre à jour l'état local
      if (Array.isArray(modules)) {
        setModules(
          modules.map((module) =>
            module.name === moduleName
              ? { ...module, enabled: !module.enabled }
              : module
          )
        );
      } else {
        // Recharger les modules si la structure n'est pas celle attendue
        fetchModules();
      }
    } catch (error) {
      console.error(
        "Erreur lors de l'activation/désactivation du module:",
        error
      );
      throw error;
    }
  };

  const handleDeleteModule = async (moduleName: string) => {
    try {
      const response = await fetch(`/api/modules/${moduleName}/delete`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression du module");
      }

      // Mettre à jour l'état local
      if (Array.isArray(modules)) {
        setModules(modules.filter((module) => module.name !== moduleName));
      } else {
        // Recharger les modules si la structure n'est pas celle attendue
        fetchModules();
      }
    } catch (error) {
      console.error("Erreur lors de la suppression du module:", error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.isArray(modules) ? (
          modules.map((module) => (
            <ModuleCard
              key={module.name}
              module={module}
              onToggle={handleToggleModule}
              onDelete={handleDeleteModule}
            />
          ))
        ) : (
          <div className="col-span-3 text-center p-8 border border-dashed rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">
              Erreur lors du chargement des modules. Veuillez rafraîchir la
              page.
            </p>
          </div>
        )}
      </div>

      {Array.isArray(modules) && modules.length === 0 && (
        <div className="text-center p-8 border border-dashed rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">
            Aucun module n'est installé. Installez votre premier module
            ci-dessous.
          </p>
        </div>
      )}

      <div className="mt-8">
        <ModuleUpload onUploadSuccess={fetchModules} />
      </div>
    </div>
  );
};
