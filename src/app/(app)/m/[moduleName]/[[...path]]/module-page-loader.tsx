"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import type { ModuleConfig } from "@/types/modules";

interface ModulePageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

type PageLoader = () => Promise<{ default: ComponentType<ModulePageProps> }>;

// Registry of module pages — explicit imports avoid Turbopack scanning all of @/modules/
const MODULE_PAGES: Record<string, Record<string, PageLoader>> = {
  "ai-image-gen": {
    "": () => import("@/modules/ai-image-gen/pages/generate"),
    library: () => import("@/modules/ai-image-gen/pages/library"),
    collections: () => import("@/modules/ai-image-gen/pages/collections"),
    pipelines: () => import("@/modules/ai-image-gen/pages/pipelines"),
    settings: () => import("@/modules/ai-image-gen/pages/settings"),
  },
  "clip-studio": {
    "": () => import("@/modules/clip-studio/pages/projects"),
    edit: () => import("@/modules/clip-studio/pages/editor"),
    voices: () => import("@/modules/clip-studio/pages/voices"),
  },
  "reverse-search": {
    "": () => import("@/modules/reverse-search/pages/search"),
    history: () => import("@/modules/reverse-search/pages/history"),
    settings: () => import("@/modules/reverse-search/pages/settings"),
  },
  "scan-studio": {
    "": () => import("@/modules/scan-studio/pages/library"),
    folder: () => import("@/modules/scan-studio/pages/folder"),
    chapter: () => import("@/modules/scan-studio/pages/chapter"),
    edit: () => import("@/modules/scan-studio/pages/editor"),
    engines: () => import("@/modules/scan-studio/pages/engines"),
    sources: () => import("@/modules/scan-studio/pages/sources"),
    fonts: () => import("@/modules/scan-studio/pages/fonts"),
  },
};

/**
 * Pages déjà téléchargées, partagées entre les montages.
 *
 * `next/dynamic` repasse par son état de chargement à chaque changement
 * d'onglet, même quand le code est déjà là : toute la page, en-tête compris,
 * clignotait en spinner. Ici une page connue s'affiche de façon synchrone, et
 * seul le tout premier affichage attend.
 */
const resolved = new Map<string, ComponentType<ModulePageProps>>();
const inflight = new Map<string, Promise<void>>();

function pageKey(moduleName: string, pagePath: string) {
  return `${moduleName}/${pagePath}`;
}

function loadPage(moduleName: string, pagePath: string): Promise<void> {
  const key = pageKey(moduleName, pagePath);
  const loader = MODULE_PAGES[moduleName]?.[pagePath];
  if (!loader || resolved.has(key)) return Promise.resolve();
  if (!inflight.has(key)) {
    inflight.set(
      key,
      loader()
        .then((loaded) => {
          resolved.set(key, loaded.default);
        })
        .finally(() => inflight.delete(key))
    );
  }
  return inflight.get(key)!;
}

/** Précharge les autres pages du module quand le navigateur est au repos. */
function preloadSiblings(moduleName: string) {
  const run = () => {
    for (const pagePath of Object.keys(MODULE_PAGES[moduleName] ?? {})) {
      void loadPage(moduleName, pagePath).catch(() => undefined);
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 300);
  }
}

interface ModulePageLoaderProps {
  moduleName: string;
  pagePath: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

export function ModulePageLoader({
  moduleName,
  pagePath,
  moduleConfig,
  settings,
}: ModulePageLoaderProps) {
  const key = pageKey(moduleName, pagePath);
  const known = Boolean(MODULE_PAGES[moduleName]?.[pagePath]);
  // Le rendu serveur et la première hydratation partent toujours de `null` :
  // le cache n'existe que dans le navigateur.
  const [, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const Component = resolved.get(key) ?? null;

  useEffect(() => {
    if (!known) return;
    let cancelled = false;
    if (!resolved.has(key)) {
      loadPage(moduleName, pagePath)
        .then(() => {
          if (!cancelled) setVersion((value) => value + 1);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }
    preloadSiblings(moduleName);
    return () => {
      cancelled = true;
    };
  }, [key, known, moduleName, pagePath]);

  if (!known || failed) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>{failed ? "Chargement de la page impossible" : "Page de module introuvable"}</p>
        <p className="text-sm mt-1">
          Module: {moduleName}, Page: {pagePath || "/"}
        </p>
      </div>
    );
  }

  if (!Component) {
    // Premier affichage seulement : rien d'autre à montrer à cet endroit.
    return (
      <div className="flex items-center justify-center py-12" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
      </div>
    );
  }

  return (
    <Component
      moduleName={moduleName}
      moduleConfig={moduleConfig}
      settings={settings}
    />
  );
}
