"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import logo from "../branding/logo-96.png";
import { MODULE_PATH } from "../lib/client";

export interface Crumb {
  label: string;
  /** Absent : c'est l'endroit où l'on se trouve. */
  href?: string;
}

interface ModuleShellProps {
  /** Chemin dans la bibliothèque : dossier, puis chapitre. */
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * En-tête commun aux pages du module : son nom, le chemin dans la
 * bibliothèque (dossier › chapitre) et les actions de la page.
 */
export function ModuleShell({ crumbs = [], actions, children }: ModuleShellProps) {
  return (
    // min-h-full et shrink-0, sans flex-1 : avec une base de zéro, la boîte ferait pile la
    // hauteur visible, le contenu en déborderait et la marge du bas du cadre disparaîtrait.
    <div className="flex min-h-full shrink-0 flex-col gap-4">
      <header className="z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-3 bg-background/95 px-4 py-3 backdrop-blur-md xl:sticky xl:top-0 xl:min-h-14 xl:py-2">
        <Link href={MODULE_PATH} className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <Image src={logo} alt="" width={36} height={36} className="size-9 shrink-0" />
          <h1 className="text-lg font-semibold tracking-tight">Scan Studio</h1>
        </Link>
        {crumbs.length > 0 && (
          <nav aria-label="Emplacement dans la bibliothèque" className="flex min-w-0 items-center gap-1 text-sm">
            {crumbs.map((crumb) => (
              <span key={`${crumb.href ?? ""}-${crumb.label}`} className="flex min-w-0 items-center gap-1">
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {crumb.href ? (
                  <Link href={crumb.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate font-medium">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
