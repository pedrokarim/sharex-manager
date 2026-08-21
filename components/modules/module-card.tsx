"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, ChevronDown, Download, Package, Trash2 } from "lucide-react";
import { ModuleConfig } from "@/types/modules";
import { Card } from "@/components/ui/card";
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

/**
 * Carte d'un module dans le registre.
 *
 * La carte est une colonne à trois zones de hauteur fixe ou extensible :
 * en-tête, corps, pied. Le pied est poussé en bas par `mt-auto`, sinon il
 * remontait coller au contenu et les actions se retrouvaient à une hauteur
 * différente dans chaque carte d'une même rangée, avec un vide sous elles.
 */
export const ModuleCard = ({ module, onToggle, onDelete }: ModuleCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isInstallingDeps, setIsInstallingDeps] = useState(false);
  const [isNpmDepsOpen, setIsNpmDepsOpen] = useState(false);

  const npmDependencies = module.npmDependencies ?? {};
  const npmCount = Object.keys(npmDependencies).length;
  const fileTypes = module.supportedFileTypes ?? [];
  const hasPages = Boolean(module.pages?.length);

  const handleToggle = async () => {
    try {
      setIsLoading(true);
      await onToggle(module.name);
      toast.success(
        `Module ${module.name} ${module.enabled ? "désactivé" : "activé"}`
      );
    } catch (error) {
      toast.error(`Impossible de changer l'état du module ${module.name}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      await onDelete(module.name);
      toast.success(`Module ${module.name} supprimé`);
    } catch (error) {
      toast.error(`Impossible de supprimer le module ${module.name}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallNpmDeps = async () => {
    try {
      setIsInstallingDeps(true);
      const response = await fetch("/api/modules/install-dependencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleName: module.name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Installation des dépendances impossible");
      }

      toast.success(`Dépendances installées pour ${module.name}`);
    } catch (error) {
      console.error("Erreur lors de l'installation des dépendances :", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Installation des dépendances impossible"
      );
    } finally {
      setIsInstallingDeps(false);
    }
  };

  return (
    <Card
      className={cn(
        "group flex h-full flex-col gap-0 overflow-hidden py-0 transition-colors",
        "hover:border-primary/40",
        // Un module en veille reste lisible : on le signale par une teinte de
        // fond et le point d'état, pas en effaçant la carte entière.
        !module.enabled && "bg-muted/30"
      )}
    >
      {/* ─── En-tête ──────────────────────────────────── */}
      <div className="flex items-start gap-3 p-5">
        <span
          className={cn(
            "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border/60",
            !module.enabled && "grayscale"
          )}
        >
          {module.icon && !imageError ? (
            <Image
              src={module.icon}
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <Package className="h-5 w-5 text-muted-foreground" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                module.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
            <h3 className="truncate font-semibold" title={module.name}>
              {module.name}
            </h3>
            {module.category && (
              <Badge
                variant="outline"
                className="h-5 shrink-0 px-1.5 text-[10px] font-normal"
              >
                {module.category}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            v{module.version} · {module.author}
          </p>
        </div>

        <Switch
          checked={module.enabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
          aria-label={`Activer ou désactiver le module ${module.name}`}
          className="mt-0.5 shrink-0"
        />
      </div>

      {/* ─── Corps ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 px-5">
        {/* Hauteur réservée pour deux lignes : sans elle, une description
            courte remonterait tout ce qui suit et désalignerait la rangée. */}
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
          {module.description}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {fileTypes.length > 0 ? (
            fileTypes.map((type) => (
              <Badge
                key={type}
                variant="secondary"
                className="h-5 px-1.5 font-mono text-[10px] font-normal"
              >
                {type === "*" ? "tous" : `.${type}`}
              </Badge>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground/70">
              Sans traitement d&apos;upload
            </span>
          )}
        </div>

        {npmCount > 0 && (
          <Collapsible open={isNpmDepsOpen} onOpenChange={setIsNpmDepsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              >
                {npmCount} dépendance{npmCount > 1 ? "s" : ""} NPM
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    isNpmDepsOpen && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 space-y-1 rounded-lg border bg-muted/40 p-2.5 text-xs">
                {Object.entries(npmDependencies).map(([name, version]) => (
                  <div key={name} className="flex justify-between gap-3">
                    <span className="truncate font-mono">{name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {version}
                    </span>
                  </div>
                ))}
                <div className="flex justify-end pt-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleInstallNpmDeps}
                    disabled={isInstallingDeps}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Download className="h-3 w-3" />
                    {isInstallingDeps ? "Installation…" : "Installer"}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* ─── Pied ─────────────────────────────────────── */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t px-3 py-2.5">
        {hasPages && module.enabled ? (
          <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 px-2">
            <Link href={`/m/${module.name}`}>
              Ouvrir
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <span className="px-2 text-xs text-muted-foreground">
            {module.enabled ? "Actif" : "En veille"}
          </span>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              className="h-8 gap-1.5 px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Supprimer le module {module.name} ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Le dossier du module et ses données seront retirés de
                l&apos;instance. Cette action est définitive.
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
      </div>
    </Card>
  );
};
