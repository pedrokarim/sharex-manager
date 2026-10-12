"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * En-tête léger des écrans Exporter, Export et Publier : retour, icône,
 * titre (coupé avec son texte complet en infobulle), une phrase, puis les
 * actions calées à droite.
 */
export function ScreenHeader({
  back,
  icon: Icon,
  title,
  fullTitle,
  description,
  actions,
}: {
  back?: { href: string; label: string };
  icon: LucideIcon;
  title: ReactNode;
  /** Titre complet pour l'infobulle quand `title` est coupé. */
  fullTitle?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        {back ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="mt-1 size-8 shrink-0">
                <Link href={back.href} aria-label={back.label}>
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{back.label}</TooltipContent>
          </Tooltip>
        ) : null}
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight" title={fullTitle}>
            {title}
          </h1>
          {description ? <div className="text-sm text-pretty text-muted-foreground [overflow-wrap:anywhere]">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
