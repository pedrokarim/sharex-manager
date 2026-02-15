"use client";

import { ModuleConfig } from "@/types/modules";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Package, Download, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

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
    <Card
      className={cn(
        "group w-full transition-all duration-200 hover:shadow-md relative",
        !module.enabled && "opacity-60"
      )}
    >
      {module.category && (
        <div className="absolute top-3 right-3 z-10">
          <Badge variant="outline" className="text-xs">
            {module.category}
          </Badge>
        </div>
      )}

      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-md overflow-hidden flex items-center justify-center bg-muted">
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
                <Package className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    module.enabled ? "bg-green-500" : "bg-gray-400"
                  )}
                />
                {module.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                v{module.version} · {module.author}
              </p>
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
        <p className="text-sm text-muted-foreground line-clamp-2">
          {module.description}
        </p>

        {module.supportedFileTypes && module.supportedFileTypes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {module.supportedFileTypes.map((type) => (
              <Badge key={type} variant="secondary" className="text-xs font-mono">
                .{type}
              </Badge>
            ))}
          </div>
        )}

        {module.npmDependencies &&
          Object.keys(module.npmDependencies).length > 0 && (
            <Collapsible
              open={isNpmDepsOpen}
              onOpenChange={setIsNpmDepsOpen}
              className="mt-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
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
                <div className="text-xs text-muted-foreground space-y-1 border rounded-md p-2">
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
      </CardContent>

      <CardFooter className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
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
