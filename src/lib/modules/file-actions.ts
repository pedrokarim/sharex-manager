"use client";

import { useEffect, useState } from "react";
import {
  Clapperboard,
  Crop,
  Droplets,
  Maximize2,
  MessageSquare,
  Palette,
  PenLine,
  Puzzle,
  Search,
  Shield,
  Sparkles,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

/** Action d'un module qui ouvre l'une de ses pages avec les fichiers choisis. */
export interface ModuleLinkAction {
  module: string;
  moduleTitle: string;
  id: string;
  label: string;
  description?: string;
  icon?: string;
  maxFiles?: number;
  href: string;
  params: Record<string, string>;
}

/** Module de traitement qui transforme le fichier sur place. */
export interface ModuleProcessor {
  name: string;
  description: string;
  category?: string;
  icon?: string;
  hasUI: boolean;
  /** Transforme l'image ; faux pour un module d'analyse. */
  processesImages: boolean;
}

export interface ModuleFileActions {
  links: ModuleLinkAction[];
  processors: ModuleProcessor[];
}

export function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

// ─── Récupération ────────────────────────────────────────────────

/**
 * Les actions ne dépendent que des types de fichiers : on les garde en
 * mémoire par combinaison de types. Le menu contextuel s'ouvre ainsi sans
 * attente dès la deuxième fois.
 */
const cache = new Map<string, Promise<ModuleFileActions>>();
const resolved = new Map<string, ModuleFileActions>();

function typesKey(fileNames: string[]) {
  return [...new Set(fileNames.map(fileExtension).filter(Boolean))].sort().join(",");
}

function loadFileActions(key: string): Promise<ModuleFileActions> {
  if (!cache.has(key)) {
    const request = fetch(`/api/modules/file-actions?types=${encodeURIComponent(key)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = (await response.json()) as ModuleFileActions;
        resolved.set(key, data);
        return data;
      })
      .catch((error) => {
        // Un échec ne doit pas rester en cache : on retentera au prochain menu.
        cache.delete(key);
        throw error;
      });
    cache.set(key, request);
  }
  return cache.get(key)!;
}

/** Oublie les actions connues, après l'activation ou la désactivation d'un module. */
export function invalidateModuleFileActions() {
  cache.clear();
  resolved.clear();
}

export function useModuleFileActions(fileNames: string[], active = true) {
  const key = typesKey(fileNames);
  const [data, setData] = useState<ModuleFileActions | null>(
    () => resolved.get(key) ?? null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || !key) return;
    let cancelled = false;
    const known = resolved.get(key);
    if (known) {
      setData(known);
      return;
    }
    setData(null);
    setFailed(false);
    loadFileActions(key)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, active]);

  return { data, loading: !data && !failed, failed };
}

// ─── Exécution ───────────────────────────────────────────────────

/** Adresse de la page du module, avec les fichiers et les paramètres de l'action. */
export function linkActionHref(action: ModuleLinkAction, fileNames: string[]) {
  const params = new URLSearchParams(action.params);
  params.set("files", fileNames.join(","));
  return `${action.href}?${params.toString()}`;
}

/**
 * Applique un module sans réglages à une série de fichiers, un par un. Chaque
 * fichier produit une nouvelle version, que la galerie reçoit en direct.
 */
export async function runProcessorOnFiles(moduleName: string, fileNames: string[]) {
  const toastId = toast.loading(
    fileNames.length > 1
      ? `${moduleName} : 0 sur ${fileNames.length}`
      : `${moduleName} en cours…`
  );
  let succeeded = 0;
  const failures: string[] = [];

  for (const [index, fileName] of fileNames.entries()) {
    try {
      const response = await fetch("/api/modules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, moduleName, createNewVersion: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      succeeded += 1;
    } catch (error) {
      failures.push(`${fileName} : ${error instanceof Error ? error.message : "échec"}`);
    }
    if (fileNames.length > 1) {
      toast.loading(`${moduleName} : ${index + 1} sur ${fileNames.length}`, { id: toastId });
    }
  }

  if (failures.length === 0) {
    toast.success(
      succeeded > 1
        ? `${moduleName} appliqué à ${succeeded} fichiers`
        : `${moduleName} appliqué`,
      { id: toastId }
    );
  } else {
    toast.error(
      `${moduleName} : ${failures.length} échec(s) sur ${fileNames.length}`,
      { id: toastId, description: failures.slice(0, 3).join("\n") }
    );
  }
}

/** Événement écouté par l'hôte des réglages de module, monté dans la mise en page. */
export const MODULE_SETTINGS_EVENT = "sxm:module-settings";

export interface ModuleSettingsRequest {
  moduleName: string;
  description?: string;
  category?: string;
  /**
   * Le module transforme l'image (`processImage`). Faux pour un module
   * d'analyse : sa fenêtre se ferme sans rien appliquer.
   */
  processesImages?: boolean;
  file: { name: string; url: string; size: number };
}

/**
 * Ouvre la fenêtre de réglages d'un module. Le menu contextuel se referme au
 * clic : la fenêtre ne peut pas vivre dans son contenu, elle est donc tenue
 * par un hôte unique qui écoute cet événement.
 */
export function openModuleSettings(request: ModuleSettingsRequest) {
  window.dispatchEvent(new CustomEvent(MODULE_SETTINGS_EVENT, { detail: request }));
}

// ─── Icônes ──────────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  Clapperboard,
  Crop,
  Droplets,
  Maximize2,
  MessageSquare,
  Palette,
  PenLine,
  Search,
  Shield,
  Sparkles,
  Wand2,
  Zap,
};

/** Icône Lucide désignée par son nom dans `module.json`, avec un repli neutre. */
export function moduleIcon(name?: string): LucideIcon {
  return (name && ICONS[name]) || Puzzle;
}

/** Icône d'un module de traitement, d'après sa catégorie. */
export function processorIcon(category?: string): LucideIcon {
  switch (category?.toLowerCase()) {
    case "édition":
      return Palette;
    case "marque":
      return Shield;
    case "analysis":
      return Zap;
    case "text":
      return MessageSquare;
    case "crop":
      return Crop;
    case "resize":
      return Maximize2;
    default:
      return Wand2;
  }
}
