"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { CalendarSearch, ChevronDown } from "lucide-react";

import { GalleryProvenanceBadge } from "@/components/gallery/gallery-provenance";
import { VideoThumbnail } from "@/components/gallery/video-thumbnail";
import { FRONT_FULL } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { CHIP, CHIP_ACTIVE, CHIP_IDLE } from "@/components/front/styles";
import { isVideoFile } from "@/lib/media-kind";
import { cn } from "@/lib/utils";

/**
 * Pièces communes aux grilles du catalogue – la galerie et le détail d'un
 * album : la barre d'outils collante, le réglage de densité, les intertitres de
 * mois, les vignettes et leur attente.
 */

export type Density = "dense" | "normal" | "large";

const DENSITY: Record<Density, string> = {
  dense: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-1",
  normal: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-1.5",
  large: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2",
};

const DENSITY_LABEL: Record<Density, string> = { dense: "Dense", normal: "Normal", large: "Grand" };

/** Hauteur de la barre de navigation du site, sous laquelle la barre d'outils se colle. */
const NAV_HEIGHT = 72;
/** Ce qui recouvre le haut de la page une fois la barre d'outils collée. */
export const CATALOG_STICKY_OFFSET = NAV_HEIGHT + 64;

const SIZES = "(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw";

const thumb = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/** Barre d'outils de la grille : elle suit le défilement, juste sous la navigation. */
export function CatalogToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky z-20 bg-background/85 backdrop-blur-xl" style={{ top: NAV_HEIGHT }}>
      <div className={cn(FRONT_FULL, "flex min-h-16 flex-wrap items-center gap-2 py-3")}>{children}</div>
    </div>
  );
}

export function DensitySwitch({ value, onChange }: { value: Density; onChange: (density: Density) => void }) {
  return (
    <div className="flex shrink-0 rounded-full bg-foreground/[0.06] p-1" role="group" aria-label="Taille des vignettes">
      {(Object.keys(DENSITY) as Density[]).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cn(
            "h-7 rounded-full px-3 text-sm font-medium transition-colors",
            value === mode ? CHIP_ACTIVE : "text-muted-foreground hover:text-foreground",
          )}
        >
          {DENSITY_LABEL[mode]}
        </button>
      ))}
    </div>
  );
}

export function DateChip({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(CHIP, CHIP_IDLE)}>
      <CalendarSearch className="size-4" />
      Aller à une date
    </button>
  );
}

/** Intertitre d'un mois. Cliquable quand la grille sait sauter à une date. */
export function MonthHeading({ label, onPick }: { label: string; onPick?: () => void }) {
  const className = cn(DISPLAY, "text-2xl capitalize sm:text-3xl");
  return (
    <div className="mb-4">
      {onPick ? (
        <button
          type="button"
          onClick={onPick}
          title="Aller à une date"
          className={cn(className, "group/month inline-flex items-center gap-2 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400")}
        >
          {label}
          <ChevronDown className="size-4 opacity-0 transition-opacity group-hover/month:opacity-100 group-focus-visible/month:opacity-100" />
        </button>
      ) : (
        <h2 className={className}>{label}</h2>
      )}
    </div>
  );
}

export function MediaGrid({ density, children }: { density: Density; children: ReactNode }) {
  return <div className={cn("grid", DENSITY[density])}>{children}</div>;
}

interface MediaTileProps {
  name: string;
  durationMs?: number;
  onOpen: () => void;
  /** Rappel discret, au survol : le nom de l'album d'où vient l'image. */
  caption?: string;
}

export function MediaTile({ name, durationMs, onOpen, caption }: MediaTileProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-lg bg-foreground/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      aria-label={`Ouvrir ${name}`}
    >
      {isVideoFile(name) ? (
        <VideoThumbnail name={name} durationMs={durationMs} sizes={SIZES} />
      ) : (
        <Image
          src={thumb(name)}
          alt=""
          fill
          sizes={SIZES}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
        />
      )}
      <GalleryProvenanceBadge name={name} className="left-1.5 top-1.5" />
      {caption ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-6 pb-1.5 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          {caption}
        </span>
      ) : null}
    </button>
  );
}

/** Attente d'une grille : des cases qui respirent, à la place des vignettes. */
export function MediaGridSkeleton({ density, count = 28 }: { density: Density; count?: number }) {
  return (
    <div className={cn("grid", DENSITY[density])} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-lg bg-foreground/[0.06]" />
      ))}
    </div>
  );
}
