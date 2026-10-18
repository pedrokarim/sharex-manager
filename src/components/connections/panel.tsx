/**
 * Panneau d'un écran de compte connecté : un cadre, un en-tête (icône, titre,
 * phrase, actions à droite), un corps, un pied facultatif. C'est l'unité de
 * mise en page des onglets du compte, au même dessin que le tableau des
 * publications : un panneau ne se met jamais dans un autre.
 */

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section data-slot="panel" className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground", className)} {...props} />;
}

export function PanelHeader({
  icon: Icon,
  title,
  description,
  actions,
  titleId,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Gestes du panneau, alignés à droite (passent dessous sur un écran étroit). */
  actions?: ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b px-4 py-3", className)}>
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <div className="grid min-w-0 gap-0.5">
          <h3 id={titleId} className="text-sm leading-6 font-semibold [overflow-wrap:anywhere]">
            {title}
          </h3>
          {description ? <div className="text-xs text-pretty text-muted-foreground">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel-body" className={cn("min-w-0 p-4", className)} {...props} />;
}

/** Corps en lignes séparées d'un trait, sans marge propre : chaque ligne porte la sienne. */
export function PanelRows({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="panel-rows" className={cn("min-w-0 divide-y", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: ComponentProps<"footer">) {
  return <footer data-slot="panel-footer" className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground", className)} {...props} />;
}
