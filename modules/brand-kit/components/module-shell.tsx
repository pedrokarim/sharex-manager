"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import logo from "../branding/logo-96.png";
import { MODULE_PATH } from "../lib/types";

export interface Crumb {
  label: string;
  /** Absent : c'est l'endroit où l'on se trouve. */
  href?: string;
}

interface ModuleShellProps {
  /** Chemin dans le module : la marque ouverte. */
  crumbs?: Crumb[];
  /** Phrase sous le titre, sur la page d'accueil du module. */
  description?: string;
  /** Contenu discret juste après le fil d'Ariane (état de l'enregistrement…). */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * En-tête commun aux pages du module : son logo et son nom, la marque ouverte
 * et les actions de la page.
 */
export function ModuleShell({ crumbs = [], description, status, actions, children }: ModuleShellProps) {
  return (
    // min-h-full et shrink-0, sans flex-1 : avec une base de zéro, la boîte ferait pile la
    // hauteur visible, le contenu en déborderait et la marge du bas du cadre disparaîtrait.
    <div className="flex min-h-full shrink-0 flex-col gap-4">
      <header className="z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-3 bg-background/95 px-4 py-3 backdrop-blur-md xl:sticky xl:top-0 xl:min-h-14 xl:py-2">
        <Link href={MODULE_PATH} className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <Image src={logo} alt="" width={36} height={36} className="size-9 shrink-0" />
          <span className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Image de marque</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </span>
        </Link>
        {crumbs.length > 0 && (
          <nav aria-label="Emplacement dans le module" className="flex min-w-0 items-center gap-1 text-sm">
            {crumbs.map((crumb) => (
              <span key={`${crumb.href ?? ""}-${crumb.label}`} className="flex min-w-0 items-center gap-1">
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {crumb.href ? (
                  <Link href={crumb.href} title={crumb.label} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" title={crumb.label} className="truncate font-medium">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        {status}
        {actions && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
