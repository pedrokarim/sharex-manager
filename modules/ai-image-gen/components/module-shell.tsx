"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * En-tête commun aux pages du module.
 *
 * Les pages sont des routes distinctes, pas des onglets d'un même composant :
 * la barre est donc faite de liens. On garde l'apparence d'un sélecteur
 * segmenté, qui dit mieux « plusieurs vues d'un même outil » qu'une suite de
 * boutons dispersés.
 */

const TABS = [
  { href: "/m/ai-image-gen", label: "Studio", match: "" },
  { href: "/m/ai-image-gen/library", label: "Bibliothèque", match: "library" },
  { href: "/m/ai-image-gen/collections", label: "Séries", match: "collections" },
  { href: "/m/ai-image-gen/pipelines", label: "Pipelines", match: "pipelines" },
  { href: "/m/ai-image-gen/settings", label: "Moteurs", match: "settings" },
] as const;

interface ModuleShellProps {
  /** Segment courant : "", "library", "collections", "pipelines" ou "settings". */
  current: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Le studio occupe toute la largeur disponible, les autres pages non. */
  wide?: boolean;
}

export function ModuleShell({
  current,
  title,
  description,
  actions,
  children,
  wide,
}: ModuleShellProps) {
  return (
    <div className={cn("flex flex-col gap-6", wide && "-mx-1")}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>

        <nav
          aria-label="Sections du module"
          className="inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1"
        >
          {TABS.map((tab) => {
            const active = tab.match === current;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {children}
    </div>
  );
}
