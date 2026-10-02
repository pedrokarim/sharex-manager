"use client";

import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULE_PATH } from "../lib/client";

const TABS = [
  { href: MODULE_PATH, label: "Recherche", match: "" },
  { href: `${MODULE_PATH}/history`, label: "Historique", match: "history" },
  { href: `${MODULE_PATH}/settings`, label: "Moteurs", match: "settings" },
] as const;

interface ModuleShellProps {
  /** Segment courant : "", "history" ou "settings". */
  current: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** En-tête commun aux pages du module : son nom, ses trois vues, et les actions de la page. */
export function ModuleShell({ current, actions, children }: ModuleShellProps) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-3 bg-background/95 px-4 py-3 backdrop-blur-md xl:sticky xl:top-0 xl:h-14 xl:flex-nowrap xl:py-0">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ScanSearch className="h-4 w-4" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Recherche inversée</h1>
        </div>
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
        <nav aria-label="Sections du module" className="inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TABS.map((tab) => {
            const active = tab.match === current;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
