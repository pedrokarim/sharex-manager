"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleConfig } from "@/types/modules";
import { ModuleCard } from "./module-card";
import { ModuleUpload } from "./module-upload";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Puzzle, RefreshCw } from "lucide-react";

export const ModuleList = () => {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchModules();
    setIsRefreshing(false);
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

      if (Array.isArray(modules)) {
        setModules(
          modules.map((module) =>
            module.name === moduleName
              ? { ...module, enabled: !module.enabled }
              : module
          )
        );
      } else {
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

      if (Array.isArray(modules)) {
        setModules(modules.filter((module) => module.name !== moduleName));
      } else {
        fetchModules();
      }
    } catch (error) {
      console.error("Erreur lors de la suppression du module:", error);
      throw error;
    }
  };

  const activeCount = useMemo(
    () => modules.filter((m) => m.enabled).length,
    [modules]
  );
  const inactiveCount = useMemo(
    () => modules.filter((m) => !m.enabled).length,
    [modules]
  );

  const filteredModules = useMemo(() => {
    if (!Array.isArray(modules)) return [];
    switch (filter) {
      case "active":
        return modules.filter((m) => m.enabled);
      case "inactive":
        return modules.filter((m) => !m.enabled);
      default:
        return modules;
    }
  }, [modules, filter]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48 sm:h-64">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const scrollToUpload = () => {
    document
      .getElementById("module-upload")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {Array.isArray(modules) && modules.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
          >
            <TabsList>
              <TabsTrigger value="all" className="gap-1.5">
                Tous
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {modules.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="active" className="gap-1.5">
                Actifs
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {activeCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="inactive" className="gap-1.5">
                Inactifs
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {inactiveCount}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Rafraîchir
          </Button>
        </div>
      )}

      {Array.isArray(modules) && modules.length > 0 ? (
        filteredModules.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredModules.map((module) => (
              <ModuleCard
                key={module.name}
                module={module}
                onToggle={handleToggleModule}
                onDelete={handleDeleteModule}
              />
            ))}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Puzzle />
              </EmptyMedia>
              <EmptyTitle>Aucun module {filter === "active" ? "actif" : "inactif"}</EmptyTitle>
              <EmptyDescription>
                {filter === "active"
                  ? "Activez un module pour le voir apparaître ici."
                  : "Désactivez un module pour le voir apparaître ici."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : !Array.isArray(modules) ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Puzzle />
            </EmptyMedia>
            <EmptyTitle>Erreur de chargement</EmptyTitle>
            <EmptyDescription>
              Erreur lors du chargement des modules. Veuillez rafraîchir la page.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Puzzle />
            </EmptyMedia>
            <EmptyTitle>Aucun module installé</EmptyTitle>
            <EmptyDescription>
              Installez votre premier module pour commencer.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={scrollToUpload}>
            Installer un module
          </Button>
        </Empty>
      )}

      <div id="module-upload" className="mt-6 sm:mt-8">
        <ModuleUpload onUploadSuccess={fetchModules} />
      </div>
    </div>
  );
};
