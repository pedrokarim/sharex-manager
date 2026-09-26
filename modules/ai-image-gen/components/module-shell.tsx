"use client";

import Link, { useLinkStatus } from "next/link";
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
  /** Espace de travail : en-tête compact sur une ligne, pleine largeur. */
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
  const nav = (
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
              "relative shrink-0 overflow-hidden rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <TabPendingHint />
          </Link>
        );
      })}
    </nav>
  );

  // Le studio est un espace de travail : l'en-tête tient sur une ligne pour
  // laisser la hauteur aux images, et la description passe en infobulle
  // native du titre.
  if (wide) {
    return (
      <div className="flex flex-col gap-4">
        {/* Sur grand écran, l'en-tête reste collé en haut : le choix
            de vue et l'activité restent à portée pendant le défilement. Plus
            étroit, il passe sur plusieurs lignes et défile avec la page. */}
        <header className="z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-3 bg-background/95 px-4 py-3 backdrop-blur-md xl:sticky xl:top-0 xl:h-14 xl:flex-nowrap xl:py-0">
          <div className="flex items-center gap-2.5" title={description}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          {nav}
          {actions && (
            <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
        {nav}
      </header>

      {children}
    </div>
  );
}

/**
 * Indicateur de navigation propre à l'onglet cliqué : un trait qui file sous
 * son libellé le temps que la page arrive. Le reste de l'interface ne bouge
 * pas. Toujours rendu, seule son opacité change, pour ne rien décaler.
 */
function TabPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full transition-opacity duration-200",
        pending ? "opacity-100" : "opacity-0"
      )}
    >
      <span className="block h-full w-1/2 animate-[tab-pending_0.9s_ease-in-out_infinite] rounded-full bg-primary" />
      <style>{`@keyframes tab-pending { from { transform: translateX(-100%); } to { transform: translateX(200%); } }`}</style>
    </span>
  );
}
