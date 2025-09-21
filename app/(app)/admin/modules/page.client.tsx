"use client";

import { useState } from "react";
import {
  Package,
  RefreshCw,
  Loader2,
  Check,
  X,
  Settings,
  Download,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModuleConfig } from "@/types/modules";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ModulesPageClientProps {
  initialModules: ModuleConfig[];
}

export function ModulesPageClient({ initialModules }: ModulesPageClientProps) {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleConfig[]>(initialModules);
  const [isLoading, setIsLoading] = useState(false);
  const [isInstallingDependencies, setIsInstallingDependencies] = useState<
    Record<string, boolean>
  >({});
  const [activeTab, setActiveTab] = useState("all");

  const refreshModules = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/modules", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des modules");
      }

      const data = await response.json();
      setModules(data.modules || []);
      toast.success("Liste des modules mise à jour");
    } catch (error) {
      console.error("Erreur lors de la récupération des modules:", error);
      toast.error("Erreur lors de la récupération des modules");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModuleStatus = async (
    moduleName: string,
    currentStatus: boolean
  ) => {
    try {
      const response = await fetch(
        `/api/modules/${currentStatus ? "disable" : "enable"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ moduleName }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Erreur lors de la ${
            currentStatus ? "désactivation" : "activation"
          } du module`
        );
      }

      const data = await response.json();

      if (data.success) {
        // Mettre à jour l'état local
        setModules(
          modules.map((module) =>
            module.name === moduleName
              ? { ...module, enabled: !currentStatus }
              : module
          )
        );

        toast.success(
          `Module ${currentStatus ? "désactivé" : "activé"} avec succès`
        );
      } else {
        throw new Error(
          data.error ||
            `Erreur lors de la ${
              currentStatus ? "désactivation" : "activation"
            } du module`
        );
      }
    } catch (error) {
      console.error(
        `Erreur lors de la ${
          currentStatus ? "désactivation" : "activation"
        } du module:`,
        error
      );
      toast.error(
        `Erreur lors de la ${
          currentStatus ? "désactivation" : "activation"
        } du module`
      );
    }
  };

  const installDependencies = async (moduleName: string) => {
    setIsInstallingDependencies((prev) => ({ ...prev, [moduleName]: true }));

    try {
      const response = await fetch("/api/modules/install-dependencies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ moduleName }),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'installation des dépendances");
      }

      const data = await response.json();

      if (data.success) {
        toast.success(
          `Dépendances installées avec succès pour le module ${moduleName}`
        );
      } else {
        throw new Error(
          data.error || "Erreur lors de l'installation des dépendances"
        );
      }
    } catch (error) {
      console.error("Erreur lors de l'installation des dépendances:", error);
      toast.error(
        `Erreur lors de l'installation des dépendances pour le module ${moduleName}`
      );
    } finally {
      setIsInstallingDependencies((prev) => ({ ...prev, [moduleName]: false }));
    }
  };

  const filteredModules =
    activeTab === "all"
      ? modules
      : activeTab === "enabled"
      ? modules.filter((module) => module.enabled)
      : modules.filter((module) => !module.enabled);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 sm:h-8 sm:w-8" />
          Gestion des modules
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Gérez les modules installés dans ShareX Manager
        </p>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full sm:w-[400px]"
        >
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="all" className="text-xs sm:text-sm">
              Tous
            </TabsTrigger>
            <TabsTrigger value="enabled" className="text-xs sm:text-sm">
              Activés
            </TabsTrigger>
            <TabsTrigger value="disabled" className="text-xs sm:text-sm">
              Désactivés
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="outline"
          onClick={refreshModules}
          disabled={isLoading}
          className="w-full sm:w-auto text-sm"
        >
          <RefreshCw
            className={`h-3 w-3 sm:h-4 sm:w-4 mr-2 ${
              isLoading ? "animate-spin" : ""
            }`}
          />
          Rafraîchir
        </Button>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {filteredModules.length === 0 ? (
          <Card>
            <CardContent className="pt-4 sm:pt-6 text-center text-muted-foreground text-sm">
              Aucun module{" "}
              {activeTab === "enabled"
                ? "activé"
                : activeTab === "disabled"
                ? "désactivé"
                : ""}{" "}
              trouvé.
            </CardContent>
          </Card>
        ) : (
          filteredModules.map((module) => (
            <Card key={module.name}>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 text-base sm:text-lg">
                      <span className="truncate">{module.name}</span>
                      <Badge
                        variant={module.enabled ? "default" : "secondary"}
                        className="text-xs w-fit"
                      >
                        {module.enabled ? "Activé" : "Désactivé"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {module.description}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={module.enabled}
                    onCheckedChange={() =>
                      toggleModuleStatus(module.name, module.enabled)
                    }
                    className="flex-shrink-0"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Informations</h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium text-xs sm:text-sm">
                              Version
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {module.version}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-xs sm:text-sm">
                              Auteur
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {module.author}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {module.npmDependencies &&
                    Object.keys(module.npmDependencies).length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2">
                          Dépendances NPM
                        </h3>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs sm:text-sm">
                                  Nom
                                </TableHead>
                                <TableHead className="text-xs sm:text-sm">
                                  Version
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.entries(module.npmDependencies).map(
                                ([name, version]) => (
                                  <TableRow key={name}>
                                    <TableCell className="text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
                                      {name}
                                    </TableCell>
                                    <TableCell className="text-xs sm:text-sm">
                                      {version}
                                    </TableCell>
                                  </TableRow>
                                )
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 p-4 sm:p-6">
                {module.npmDependencies &&
                  Object.keys(module.npmDependencies).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => installDependencies(module.name)}
                      disabled={isInstallingDependencies[module.name]}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                    >
                      {isInstallingDependencies[module.name] ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                          Installation...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                          Installer les dépendances
                        </>
                      )}
                    </Button>
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="w-full sm:w-auto text-xs sm:text-sm"
                >
                  <Settings className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  Configurer
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
