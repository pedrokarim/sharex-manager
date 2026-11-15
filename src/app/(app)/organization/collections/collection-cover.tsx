"use client";

import { useState } from "react";
import { FileIcon, Play } from "lucide-react";
import { fileKind } from "@/lib/media-kind";
import { cn } from "@/lib/utils";

const thumbnail = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/**
 * Aperçu d'une collection : ses premiers fichiers, qui remplissent toujours
 * tout le cadre (un seul fichier en plein cadre, deux côte à côte, trois en
 * un grand et deux petits, quatre en 2 × 2). Le cadre garde ses proportions
 * quel que soit le nombre : la grille de la liste reste alignée, et l'aperçu
 * de l'éditeur ne change pas de taille pendant la saisie.
 */
export function CollectionCover({
  files,
  className,
  emptyLabel = "Aucun fichier",
}: {
  files: string[];
  className?: string;
  emptyLabel?: string;
}) {
  const cells = files.slice(0, 4);
  const layout =
    cells.length <= 1
      ? "grid-cols-1 grid-rows-1"
      : cells.length === 2
        ? "grid-cols-2 grid-rows-1"
        : "grid-cols-2 grid-rows-2";

  return (
    <div
      className={cn(
        "relative grid aspect-[4/3] w-full gap-0.5 overflow-hidden rounded-lg bg-muted",
        layout,
        className,
      )}
    >
      {cells.map((name, index) => (
        <CoverCell
          key={`${index}-${name}`}
          name={name}
          // À trois fichiers, le premier prend toute la hauteur à gauche.
          className={cells.length === 3 && index === 0 ? "row-span-2" : undefined}
        />
      ))}
      {cells.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </span>
      ) : null}
    </div>
  );
}

function CoverCell({ name, className }: { name: string; className?: string }) {
  const kind = fileKind(name);
  const [failed, setFailed] = useState(false);
  const extension = name.includes(".") ? name.split(".").pop()?.toUpperCase() : null;

  if (kind === "file" || failed) {
    return (
      <div className={cn("flex min-w-0 flex-col items-center justify-center gap-1 bg-muted/70 px-2 text-muted-foreground", className)} title={name}>
        <FileIcon aria-hidden className="size-5" />
        {extension ? <span className="max-w-full truncate text-[11px] font-medium">{extension}</span> : null}
      </div>
    );
  }

  return (
    <div className={cn("relative min-w-0 overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- vignette déjà réduite par /api/thumbnails */}
      <img
        src={thumbnail(name)}
        alt=""
        title={name}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
      {kind === "video" ? (
        <span className="absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
          <Play aria-hidden className="size-2.5 fill-current" />
          <span className="sr-only">Vidéo</span>
        </span>
      ) : null}
    </div>
  );
}
