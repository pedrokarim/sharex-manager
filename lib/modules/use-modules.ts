"use client";

import { useState, useEffect } from "react";
import { ModuleConfig } from "@/types/modules";

export function useModules() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/modules");

      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des modules");
      }

      const data = await response.json();
      setModules(data);
    } catch (error) {
      console.error("Erreur lors de la récupération des modules:", error);
      setError(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModule = async (moduleName: string) => {
    try {
      const response = await fetch(`/api/modules/${moduleName}/toggle`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'activation/désactivation du module");
      }

      // Mettre à jour l'état local
      setModules(
        modules.map((module) =>
          module.name === moduleName
            ? { ...module, enabled: !module.enabled }
            : module
        )
      );

      return true;
    } catch (error) {
      console.error(
        "Erreur lors de l'activation/désactivation du module:",
        error
      );
      throw error;
    }
  };

  const deleteModule = async (moduleName: string) => {
    try {
      const response = await fetch(`/api/modules/${moduleName}/delete`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression du module");
      }

      // Mettre à jour l'état local
      setModules(modules.filter((module) => module.name !== moduleName));

      return true;
    } catch (error) {
      console.error("Erreur lors de la suppression du module:", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  return {
    modules,
    isLoading,
    error,
    fetchModules,
    toggleModule,
    deleteModule,
  };
}
