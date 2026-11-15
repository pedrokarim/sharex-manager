"use client";

import { useState } from "react";
import { FileIcon, Play } from "lucide-react";
import { fileKind } from "@/lib/media-kind";
import { cn } from "@/lib/utils";

const thumbnail = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/**
 * Aperçu d'une collection : ses quatre premiers fichiers en mosaïque 2 × 2.
 * La forme ne dépend pas du nombre de fichiers (cases vides en fond
 * atténué) : la grille de la liste reste alignée, et l'aperçu de l'éditeur
 * ne change pas de taille pendant la saisie.
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

  return (
    <div
      className={cn(
        "relative grid aspect-[4/3] w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      {Array.from({ length: 4 }, (_, index) => {
        const name = cells[index];
        return name ? (
          <CoverCell key={`${index}-${name}`} name={name} />
        ) : (
          <div key={`empty-${index}`} aria-hidden className="bg-muted" />
        );
      })}
      {cells.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </span>
      ) : null}
    </div>
  );
}

function CoverCell({ name }: { name: string }) {
  const kind = fileKind(name);
  const [failed, setFailed] = useState(false);
  const extension = name.includes(".") ? name.split(".").pop()?.toUpperCase() : null;

  if (kind === "file" || failed) {
    return (
      <div className="flex min-w-0 flex-col items-center justify-center gap-1 bg-muted/70 px-2 text-muted-foreground" title={name}>
        <FileIcon aria-hidden className="size-5" />
        {extension ? <span className="max-w-full truncate text-[11px] font-medium">{extension}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative min-w-0 overflow-hidden bg-muted">
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
