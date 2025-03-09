"use client";

import { ModuleConfig } from "@/types/modules";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { Package, Download } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ModuleCardProps {
  module: ModuleConfig;
  onToggle: (moduleName: string) => Promise<void>;
  onDelete: (moduleName: string) => Promise<void>;
}

export const ModuleCard = ({ module, onToggle, onDelete }: ModuleCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isInstallingDeps, setIsInstallingDeps] = useState(false);
  const [isNpmDepsOpen, setIsNpmDepsOpen] = useState(false);

  const handleToggle = async () => {
    try {
      setIsLoading(true);
      await onToggle(module.name);
      toast.success(
        `Module ${module.name} ${
          module.enabled ? "désactivé" : "activé"
        } avec succès`
      );
    } catch (error) {
      toast.error(
        `Erreur lors de l'activation/désactivation du module ${module.name}`
      );
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      await onDelete(module.name);
      toast.success(`Module ${module.name} supprimé avec succès`);
    } catch (error) {
      toast.error(`Erreur lors de la suppression du module ${module.name}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageError = () => {
    setImageError(true);
  };

  // Formater les types de fichiers supportés
  const formatSupportedFileTypes = () => {
    if (!module.supportedFileTypes || module.supportedFileTypes.length === 0) {
      return "Aucun type de fichier supporté";
    }

    return module.supportedFileTypes.map((type) => `.${type}`).join(", ");
  };

  // Installer les dépendances NPM
  const handleInstallNpmDeps = async () => {
    try {
      setIsInstallingDeps(true);

      const response = await fetch("/api/modules/install-dependencies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ moduleName: module.name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.error || "Erreur lors de l'installation des dépendances NPM"
        );
      }

      toast.success(
        `Dépendances NPM installées avec succès pour le module ${module.name}`
      );
    } catch (error) {
      console.error(
        "Erreur lors de l'installation des dépendances NPM:",
        error
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Erreur lors de l'installation des dépendances NPM"
      );
    } finally {
      setIsInstallingDeps(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-md overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800">
              {module.icon && !imageError ? (
                <Image
                  src={module.icon}
                  alt={`Icône du module ${module.name}`}
                  width={48}
                  height={48}
                  className="object-cover"
                  onError={handleImageError}
                />
              ) : (
                <Package className="h-6 w-6 text-gray-400" />
              )}
            </div>
            <div>
              <CardTitle>{module.name}</CardTitle>
              <CardDescription>Version {module.version}</CardDescription>
            </div>
          </div>
          <Switch
            checked={module.enabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            aria-label={`Activer/désactiver le module ${module.name}`}
          />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {module.description}
        </p>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Auteur: {module.author}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Types de fichiers supportés: {formatSupportedFileTypes()}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Interface utilisateur: {module.hasUI ? "Oui" : "Non"}
          </p>

          {module.npmDependencies &&
            Object.keys(module.npmDependencies).length > 0 && (
              <Collapsible
                open={isNpmDepsOpen}
                onOpenChange={setIsNpmDepsOpen}
                className="mt-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Dépendances NPM:{" "}
                    {Object.keys(module.npmDependencies).length}
                  </p>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {isNpmDepsOpen ? "Masquer" : "Afficher"}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-2">
                  <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 border rounded-md p-2">
                    {Object.entries(module.npmDependencies).map(
                      ([name, version]) => (
                        <div key={name} className="flex justify-between">
                          <span>{name}</span>
                          <span>{version}</span>
                        </div>
                      )
                    )}
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleInstallNpmDeps}
                        disabled={isInstallingDeps}
                        className="flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        {isInstallingDeps ? "Installation..." : "Installer"}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isLoading}>
              Supprimer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action supprimera définitivement le module {module.name}{" "}
                et ne peut pas être annulée.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
};
