"use client";

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Icône d'un site de lecture : la sienne, lue chez lui par le serveur et servie
 * par le module. Tant qu'elle n'a pas pu être récupérée, un globe la remplace.
 * Décorative : le nom du site est toujours écrit à côté.
 */
export function SourceIcon({ iconUrl, className }: { iconUrl?: string; className?: string }) {
  if (!iconUrl) return <Globe aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icône servie par le module, avec la session
    <img src={iconUrl} alt="" aria-hidden draggable={false} className={cn("size-4 shrink-0 rounded-sm object-contain", className)} />
  );
}

/** L'icône et le nom d'un site, côte à côte, dans une phrase. */
export function SourceName({ source, className }: { source: { name: string; iconUrl?: string }; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle font-medium whitespace-nowrap", className)}>
      <SourceIcon iconUrl={source.iconUrl} className="size-3.5" />
      {source.name}
    </span>
  );
}
