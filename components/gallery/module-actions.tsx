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
  SlidersHorizontal,
  X,
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

  /**
   * Échap referme le bandeau avant de fermer la visionneuse. Sans cette étape,
   * la seule touche d'échappement disponible ferait perdre le fichier en cours
   * de consultation alors que l'utilisateur voulait juste ranger les modules.
   */
  useEffect(() => {
    if (variant !== "overlay" || !isExpanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setIsExpanded(false);
    };

    // En phase de capture, pour passer avant le gestionnaire de la visionneuse.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [variant, isExpanded]);

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
    // En surimpression, le chargement prend la place du déclencheur plutôt que
    // d'afficher une pastille de texte au milieu de l'image.
    if (variant === "overlay") {
      return (
        <div className="pointer-events-none p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/80 shadow-lg backdrop-blur">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center p-1">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
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
        {/*
          Bandeau révélé depuis le bas de la zone image, au-dessus de la barre
          d'outils. Il remplace un panneau flottant qui n'était ancré à rien et
          inventait sa propre palette. Ici, jetons de thème uniquement.

          Le système de modules accepte n'importe quoi : ni le nombre de modules
          ni la liste des catégories ne sont connus à l'avance. Les deux rangées
          défilent donc horizontalement plutôt que de passer à la ligne, sinon le
          bandeau grandirait jusqu'à manger l'image.
        */}
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key="bandeau"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="pointer-events-auto w-full border-t border-border/60 bg-background/90 backdrop-blur"
            >
              <div className="flex items-center gap-2 px-4 pt-2">
                {categories.length > 1 ? (
                  <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 pb-0.5">
                    {categories.map((category) => {
                      const count =
                        category === "all"
                          ? modules.length
                          : modules.filter(
                              (m) => (m.category || "other") === category
                            ).length;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setActiveCategory(category)}
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                            activeCategory === category
                              ? "bg-secondary text-secondary-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          {category === "all"
                            ? t("gallery.file_viewer.modules.all")
                            : category === "other"
                              ? t("gallery.file_viewer.modules.other")
                              : category}
                          <span className="text-[10px] tabular-nums opacity-60">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="flex-1 truncate text-xs text-muted-foreground">
                    {t("gallery.file_viewer.modules.title")}
                  </p>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("gallery.file_viewer.modules.collapse")}
                  onClick={() => setIsExpanded(false)}
                  className="h-7 w-7 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 pt-2">
                {filteredModules.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    {t("gallery.file_viewer.modules.empty_category")}
                  </p>
                ) : (
                  filteredModules.map((module) => (
                    <TooltipProvider key={module.name}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 shrink-0 gap-2 px-2.5 font-normal"
                            onClick={() =>
                              module.hasUI
                                ? openModuleUI(module.name)
                                : applyModule(module.name)
                            }
                            disabled={processingModule === module.name}
                          >
                            <span className="flex h-4 w-4 items-center justify-center">
                              {processingModule === module.name ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                renderModuleIcon(module)
                              )}
                            </span>
                            <span className="max-w-40 truncate text-xs">
                              {module.name}
                            </span>
                            {/* Distingue d'un coup d'oeil ce qui s'applique
                                immédiatement de ce qui ouvre une interface. */}
                            {module.hasUI ? (
                              <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
                            ) : null}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56">
                          <p className="font-medium">{module.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {module.description}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="declencheur"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto p-4"
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setIsExpanded(true)}
                      aria-label={t("gallery.file_viewer.modules.expand")}
                      className="relative h-11 w-11 rounded-full border border-border/60 bg-background/80 shadow-lg backdrop-blur hover:bg-background"
                    >
                      <Wand2 className="h-5 w-5" />
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-foreground">
                        {modules.length}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {t("gallery.file_viewer.modules.expand")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </motion.div>
          )}
        </AnimatePresence>

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
