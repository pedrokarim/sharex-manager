"use client";

import { useState } from "react";
import { Download, Loader2, Package, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { ModuleConfig } from "@/types/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    currentStatus: boolean,
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
        },
      );

      if (!response.ok) {
        throw new Error(
          `Erreur lors de la ${
            currentStatus ? "désactivation" : "activation"
          } du module`,
        );
      }

      const data = await response.json();

      if (data.success) {
        setModules((currentModules) =>
          currentModules.map((module) =>
            module.name === moduleName
              ? { ...module, enabled: !currentStatus }
              : module,
          ),
        );

        toast.success(
          `Module ${currentStatus ? "désactivé" : "activé"} avec succès`,
        );
      } else {
        throw new Error(
          data.error ||
            `Erreur lors de la ${
              currentStatus ? "désactivation" : "activation"
            } du module`,
        );
      }
    } catch (error) {
      console.error(
        `Erreur lors de la ${
          currentStatus ? "désactivation" : "activation"
        } du module:`,
        error,
      );
      toast.error(
        `Erreur lors de la ${
          currentStatus ? "désactivation" : "activation"
        } du module`,
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
          `Dépendances installées avec succès pour le module ${moduleName}`,
        );
      } else {
        throw new Error(
          data.error || "Erreur lors de l'installation des dépendances",
        );
      }
    } catch (error) {
      console.error("Erreur lors de l'installation des dépendances:", error);
      toast.error(
        `Erreur lors de l'installation des dépendances pour le module ${moduleName}`,
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

  const enabledCount = modules.filter((module) => module.enabled).length;
  const disabledCount = modules.length - enabledCount;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Catalogue des modules
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Gestion des modules
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Activez, inspectez et entretenez les extensions de la plateforme
              dans un panneau plus lisible et plus stable.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={refreshModules}
            disabled={isLoading}
            className="text-sm"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Rafraîchir
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Catalogue
            </p>
            <p className="mt-2 text-2xl font-semibold">{modules.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Modules actuellement détectés dans l’instance.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Actifs
            </p>
            <p className="mt-2 text-2xl font-semibold">{enabledCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Fonctionnalités réellement chargées au runtime.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              En veille
            </p>
            <p className="mt-2 text-2xl font-semibold">{disabledCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Extensions disponibles mais actuellement désactivées.
            </p>
          </div>
        </div>
      </section>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg sm:text-xl">
                Registre des extensions
              </CardTitle>
              <CardDescription className="text-sm">
                Filtrez les modules par état pour concentrer les actions
                d’activation, de maintenance et d’installation.
              </CardDescription>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full xl:w-[420px]"
            >
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl border border-border/60 bg-muted/20 p-1">
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
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-5 sm:p-6">
          {filteredModules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
              Aucun module{" "}
              {activeTab === "enabled"
                ? "activé"
                : activeTab === "disabled"
                  ? "désactivé"
                  : ""}{" "}
              trouvé.
            </div>
          ) : (
            filteredModules.map((module) => (
              <Card
                key={module.name}
                className="rounded-2xl border border-border/70 bg-background shadow-none"
              >
                <CardHeader className="border-b border-border/60 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base sm:text-lg">
                          {module.name}
                        </CardTitle>
                        <Badge
                          variant={module.enabled ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {module.enabled ? "Activé" : "Désactivé"}
                        </Badge>
                      </div>
                      <CardDescription className="max-w-3xl text-sm">
                        {module.description}
                      </CardDescription>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          État du module
                        </span>
                        <Switch
                          checked={module.enabled}
                          onCheckedChange={() =>
                            toggleModuleStatus(module.name, module.enabled)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium sm:text-base">
                        Informations du module
                      </p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        Repères rapides sur l’origine et la version de
                        l’extension.
                      </p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border/60 bg-background">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="w-32 text-xs font-medium sm:text-sm">
                              Version
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {module.version}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-xs font-medium sm:text-sm">
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

                  <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium sm:text-base">
                        Dépendances NPM
                      </p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        Vérifiez rapidement les paquets attendus avant
                        installation.
                      </p>
                    </div>

                    {module.npmDependencies &&
                    Object.keys(module.npmDependencies).length > 0 ? (
                      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background">
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
                                  <TableCell className="max-w-[160px] truncate text-xs sm:text-sm">
                                    {name}
                                  </TableCell>
                                  <TableCell className="text-xs sm:text-sm">
                                    {version}
                                  </TableCell>
                                </TableRow>
                              ),
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
                        Aucune dépendance NPM déclarée pour ce module.
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-2 border-t border-border/60 bg-muted/10 p-5 sm:flex-row sm:justify-end">
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configurer
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
