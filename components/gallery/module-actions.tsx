"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileInfo } from "@/types/files";
import { ModuleConfig } from "@/types/modules";
import {
  Wand2,
  Loader2,
  Sparkles,
  Settings2,
  ChevronLeft,
  ChevronRight,
  PanelRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Suspense, lazy } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Palette,
  Shield,
  Zap,
  MessageSquare,
  Crop,
  Maximize2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ModuleActionsProps {
  file: FileInfo;
  onProcessComplete?: () => void;
  variant?: "overlay" | "details";
}

// Interface pour les props des composants UI des modules
interface ModuleUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

export function ModuleActions({
  file,
  onProcessComplete,
  variant = "overlay",
}: ModuleActionsProps) {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [processingModule, setProcessingModule] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [createNewVersion, setCreateNewVersion] = useState(true);
  const [moduleUIOpen, setModuleUIOpen] = useState(false);
  const [moduleComponent, setModuleComponent] =
    useState<React.ComponentType<ModuleUIProps> | null>(null);
  const [moduleError, setModuleError] = useState<Error | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Récupérer l'extension du fichier
  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

  // Fonction pour gérer le résultat du module UI
  const handleModuleUIComplete = useCallback(
    async (result: any) => {
      if (!selectedModule) return;

      try {
        setProcessingModule(selectedModule.name);

        console.log(
          `Envoi des données pour le module ${selectedModule.name}:`,
          result
        );

        const response = await fetch("/api/modules/apply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            moduleName: selectedModule.name,
            settings: result,
            createNewVersion: createNewVersion,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(
            data.error || t("gallery.file_viewer.modules.apply_error")
          );
        }

        toast.success(
          t("gallery.file_viewer.modules.apply_success", {
            module: selectedModule.name,
          })
        );

        setModuleUIOpen(false);

        if (onProcessComplete) {
          onProcessComplete();
        }
      } catch (error) {
        console.error("Erreur lors de l'application du module:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : t("gallery.file_viewer.modules.apply_error")
        );
      } finally {
        setProcessingModule(null);
      }
    },
    [selectedModule, file.name, onProcessComplete, createNewVersion]
  ); // t est stable et géré par la bibliothèque de traduction

  // Fonction pour appliquer un module sans interface utilisateur
  const applyModule = useCallback(
    async (moduleName: string) => {
      try {
        setProcessingModule(moduleName);

        const response = await fetch("/api/modules/apply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            moduleName: moduleName,
            createNewVersion: createNewVersion,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(
            data.error || t("gallery.file_viewer.modules.apply_error")
          );
        }

        toast.success(
          t("gallery.file_viewer.modules.apply_success", { module: moduleName })
        );

        if (onProcessComplete) {
          onProcessComplete();
        }
      } catch (error) {
        console.error("Erreur lors de l'application du module:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : t("gallery.file_viewer.modules.apply_error")
        );
      } finally {
        setProcessingModule(null);
      }
    },
    [file.name, onProcessComplete, createNewVersion]
  ); // t est stable et géré par la bibliothèque de traduction

  // Fonction pour charger le composant UI d'un module
  const loadModuleUI = useCallback(async (modulePath: string) => {
    try {
      setModuleError(null);
      const module = await import(`@/modules/${modulePath}/ui`);
      setModuleComponent(() => module.default);
    } catch (err) {
      console.error(`Erreur lors du chargement du module ${modulePath}:`, err);
      setModuleError(
        err instanceof Error
          ? err
          : new Error(t("gallery.file_viewer.modules.unknown_error"))
      );
    }
  }, []); // t est stable et géré par la bibliothèque de traduction

  // Fonction pour ouvrir l'interface utilisateur d'un module
  const openModuleUI = useCallback(
    async (moduleName: string) => {
      try {
        setSelectedModule(modules.find((m) => m.name === moduleName) || null);
        setModuleComponent(null);
        setModuleError(null);

        // Trouver le module sélectionné
        const selectedModuleConfig = modules.find((m) => m.name === moduleName);
        if (!selectedModuleConfig) {
          throw new Error(t("gallery.file_viewer.modules.module_not_found"));
        }

        // Charger le composant UI du module
        const modulePath = moduleName.toLowerCase();
        await loadModuleUI(modulePath);

        // Ouvrir la boîte de dialogue
        setModuleUIOpen(true);
      } catch (error) {
        console.error(
          "Erreur lors du chargement de l'interface utilisateur:",
          error
        );
        toast.error(
          error instanceof Error
            ? error.message
            : t("gallery.file_viewer.modules.ui_load_error")
        );
      }
    },
    [modules, loadModuleUI]
  ); // t est stable et géré par la bibliothèque de traduction

  // Fonction pour obtenir l'icône par défaut selon la catégorie du module
  const getDefaultIcon = useCallback((category?: string) => {
    switch (category?.toLowerCase()) {
      case "édition":
        return <Palette className="h-4 w-4" />;
      case "marque":
        return <Shield className="h-4 w-4" />;
      case "analysis":
        return <Zap className="h-4 w-4" />;
      case "text":
        return <MessageSquare className="h-4 w-4" />;
      case "crop":
        return <Crop className="h-4 w-4" />;
      case "resize":
        return <Maximize2 className="h-4 w-4" />;
      default:
        return <Wand2 className="h-4 w-4" />;
    }
  }, []);

  // Fonction pour afficher l'icône du module avec gestion d'erreur
  const renderModuleIcon = useCallback(
    (module: ModuleConfig) => {
      // Vérifier si l'icône est valide (doit être une URL)
      if (!module.icon || !module.icon.startsWith("http")) {
        return getDefaultIcon(module.category);
      }

      return (
        <img
          src={module.icon}
          alt={module.name}
          className="w-4 h-4"
          onError={() => {
            // En cas d'erreur de chargement, on ne peut pas utiliser setState ici
            // car onError est appelé dans le rendu, mais on peut au moins afficher l'icône par défaut
          }}
        />
      );
    },
    [getDefaultIcon]
  );

  // Charger les modules disponibles pour ce type de fichier
  useEffect(() => {
    const fetchModules = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/modules/by-type?fileType=${fileExtension}`
        );

        if (!response.ok) {
          throw new Error(t("gallery.file_viewer.modules.fetch_error"));
        }

        const data = await response.json();
        setModules(data?.modules || []);
      } catch (error) {
        console.error("Erreur lors de la récupération des modules:", error);
        toast.error(t("gallery.file_viewer.modules.fetch_error"));
      } finally {
        setIsLoading(false);
      }
    };

    if (fileExtension) {
      fetchModules();
    }
  }, [fileExtension]); // t est stable et géré par la bibliothèque de traduction

  // Préparer les informations du fichier pour le composant UI
  const fileInfo = {
    name: file.name,
    url: file.url,
    size: file.size,
    type: fileExtension,
  };

  // Si aucun module n'est disponible ou en cours de chargement, ne rien afficher
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          variant === "overlay"
            ? "p-3 bg-white/10 dark:bg-black/20 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-xl shadow-2xl"
            : "p-1"
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin mr-2 text-white/90" />
        <span className="text-xs text-white/80">
          {t("gallery.file_viewer.modules.loading")}
        </span>
      </div>
    );
  }

  if (!modules || modules.length === 0) {
    return null;
  }

  // Regrouper les modules par catégorie
  const categories = [
    "all",
    ...new Set(modules.map((m) => m.category || "other")),
  ];

  // Filtrer les modules par catégorie active
  const filteredModules =
    activeCategory === "all"
      ? modules
      : modules.filter((m) => (m.category || "other") === activeCategory);

  // Rendu du contenu du module UI
  const renderModuleUI = () => {
    if (moduleError) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-500 mb-4">
            {t("gallery.file_viewer.modules.ui_load_error")}
          </p>
          <p>
            {t("gallery.file_viewer.modules.module_load_failed", {
              module: selectedModule?.name,
            })}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {moduleError.message}
          </p>
        </div>
      );
    }

    if (!moduleComponent) {
      return (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    const ModuleUIComponent = moduleComponent;
    return (
      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <ModuleUIComponent
          fileInfo={fileInfo}
          onComplete={handleModuleUIComplete}
        />
      </Suspense>
    );
  };

  // Version pour l'overlay au-dessus de l'image
  if (variant === "overlay") {
    return (
      <>
        <motion.div
          className="flex items-center bg-white/10 dark:bg-black/20 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden"
          initial={{ width: "auto" }}
          animate={{ width: isExpanded ? "auto" : "auto" }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {/* Bouton de toggle à gauche */}
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 bg-white/10 dark:bg-black/20 hover:bg-white/20 dark:hover:bg-white/10 border-r border-white/20 dark:border-white/10 rounded-l-xl rounded-r-none flex-shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              {isExpanded ? (
                <ChevronLeft className="h-5 w-5 text-white/90" />
              ) : (
                <ChevronRight className="h-5 w-5 text-white/90" />
              )}
            </motion.div>
          </Button>

          {/* Séparateur */}
          <div className="w-px h-10 bg-white/20 dark:bg-white/10 flex-shrink-0 my-1" />

          {/* Contenu expandable */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="flex flex-col gap-3 p-3 min-w-[300px]"
              >
                {categories.length > 1 && (
                  <Tabs
                    value={activeCategory}
                    onValueChange={setActiveCategory}
                    className="w-full"
                  >
                    <TabsList className="flex w-full bg-white/5 dark:bg-black/10 border border-white/10 dark:border-white/5 justify-end">
                      {categories.map((category) => (
                        <TabsTrigger
                          key={category}
                          value={category}
                          className="text-xs h-7 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-white/20 dark:data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm"
                        >
                          {category === "all"
                            ? t("gallery.file_viewer.modules.all")
                            : category === "other"
                            ? t("gallery.file_viewer.modules.other")
                            : category === "Édition"
                            ? t(
                                "gallery.file_viewer.modules.categories.edition"
                              )
                            : category === "Marque"
                            ? t("gallery.file_viewer.modules.categories.brand")
                            : category === "Effets"
                            ? t(
                                "gallery.file_viewer.modules.categories.effects"
                              )
                            : category === "Filtres"
                            ? t(
                                "gallery.file_viewer.modules.categories.filters"
                              )
                            : category}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}

                <div className="flex flex-wrap gap-2 justify-end">
                  {filteredModules.map((module) => (
                    <TooltipProvider key={module.name}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 bg-white/10 dark:bg-black/20 hover:bg-white/20 dark:hover:bg-white/10 border border-white/20 dark:border-white/10 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-lg flex items-center justify-center"
                            onClick={() =>
                              module.hasUI
                                ? openModuleUI(module.name)
                                : applyModule(module.name)
                            }
                            disabled={processingModule === module.name}
                          >
                            {processingModule === module.name ? (
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            ) : (
                              <div className="text-white/90 flex items-center justify-center">
                                {renderModuleIcon(module)}
                              </div>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="max-w-[200px] bg-white/95 dark:bg-black/95 backdrop-blur-md border border-white/20 dark:border-white/10 text-black dark:text-white"
                        >
                          <p className="font-medium">{module.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {module.description}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Dialog pour l'interface utilisateur du module */}
        <Dialog
          open={moduleUIOpen}
          onOpenChange={(open) => {
            if (!open) {
              setModuleUIOpen(false);
              setModuleComponent(null);
              setModuleError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedModule &&
                  modules.find((m) => m.name === selectedModule.name)?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedModule &&
                  modules.find((m) => m.name === selectedModule.name)
                    ?.description}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">{renderModuleUI()}</div>

            {/* N'afficher le switcher que pour les modules de type Édition */}
            {selectedModule?.category === "Édition" && (
              <div className="flex items-center space-x-2 mt-4 border-t pt-4">
                <Switch
                  id="create-new-version"
                  checked={createNewVersion}
                  onCheckedChange={setCreateNewVersion}
                />
                <Label htmlFor="create-new-version">
                  {t("gallery.file_viewer.modules.create_new_version")}
                </Label>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setModuleUIOpen(false);
                  setModuleComponent(null);
                  setModuleError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Version pour la section détails
  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          {t("gallery.file_viewer.modules.title")}
        </h3>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={activeCategory === category ? "secondary" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveCategory(category)}
              >
                {category === "all"
                  ? t("gallery.file_viewer.modules.all")
                  : category === "other"
                  ? t("gallery.file_viewer.modules.other")
                  : category === "Édition"
                  ? t("gallery.file_viewer.modules.categories.edition")
                  : category === "Marque"
                  ? t("gallery.file_viewer.modules.categories.brand")
                  : category === "Effets"
                  ? t("gallery.file_viewer.modules.categories.effects")
                  : category === "Filtres"
                  ? t("gallery.file_viewer.modules.categories.filters")
                  : category}
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {filteredModules.map((module) => (
            <Button
              key={module.name}
              variant="outline"
              size="sm"
              className="justify-start h-auto py-2 px-3 w-full"
              onClick={() =>
                module.hasUI
                  ? openModuleUI(module.name)
                  : applyModule(module.name)
              }
              disabled={processingModule === module.name}
            >
              <div className="flex items-center gap-2 w-full">
                <div className="flex-shrink-0">
                  {processingModule === module.name ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : module.icon ? (
                    <img
                      src={module.icon}
                      alt={module.name}
                      className="w-4 h-4"
                    />
                  ) : module.hasUI ? (
                    <Settings2 className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div className="text-left overflow-hidden">
                  <p className="text-xs font-medium">{module.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate w-full">
                    {module.description}
                  </p>
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      {/* Dialog pour l'interface utilisateur du module */}
      <Dialog
        open={moduleUIOpen}
        onOpenChange={(open) => {
          if (!open) {
            setModuleUIOpen(false);
            setModuleComponent(null);
            setModuleError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedModule &&
                modules.find((m) => m.name === selectedModule.name)?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedModule &&
                modules.find((m) => m.name === selectedModule.name)
                  ?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">{renderModuleUI()}</div>

          {/* N'afficher le switcher que pour les modules de type Édition */}
          {selectedModule?.category === "Édition" && (
            <div className="flex items-center space-x-2 mt-4 border-t pt-4">
              <Switch
                id="create-new-version"
                checked={createNewVersion}
                onCheckedChange={setCreateNewVersion}
              />
              <Label htmlFor="create-new-version">
                {t("gallery.file_viewer.modules.create_new_version")}
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setModuleUIOpen(false);
                setModuleComponent(null);
                setModuleError(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
