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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="h-8 w-8" />
          Gestion des modules
        </h1>
        <p className="text-muted-foreground mt-2">
          Gérez les modules installés dans ShareX Manager
        </p>
      </div>

      <div className="flex justify-between items-center mb-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-[400px]"
        >
          <TabsList>
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="enabled">Activés</TabsTrigger>
            <TabsTrigger value="disabled">Désactivés</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button variant="outline" onClick={refreshModules} disabled={isLoading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          Rafraîchir
        </Button>
      </div>

      <div className="space-y-6">
        {filteredModules.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
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
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {module.name}
                      <Badge variant={module.enabled ? "default" : "secondary"}>
                        {module.enabled ? "Activé" : "Désactivé"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{module.description}</CardDescription>
                  </div>
                  <Switch
                    checked={module.enabled}
                    onCheckedChange={() =>
                      toggleModuleStatus(module.name, module.enabled)
                    }
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Informations</h3>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Version</TableCell>
                          <TableCell>{module.version}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Auteur</TableCell>
                          <TableCell>{module.author}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {module.npmDependencies &&
                    Object.keys(module.npmDependencies).length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2">
                          Dépendances NPM
                        </h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nom</TableHead>
                              <TableHead>Version</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(module.npmDependencies).map(
                              ([name, version]) => (
                                <TableRow key={name}>
                                  <TableCell>{name}</TableCell>
                                  <TableCell>{version}</TableCell>
                                </TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                {module.npmDependencies &&
                  Object.keys(module.npmDependencies).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => installDependencies(module.name)}
                      disabled={isInstallingDependencies[module.name]}
                    >
                      {isInstallingDependencies[module.name] ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Installation...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Installer les dépendances
                        </>
                      )}
                    </Button>
                  )}
                <Button variant="outline" size="sm" disabled>
                  <Settings className="mr-2 h-4 w-4" />
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
