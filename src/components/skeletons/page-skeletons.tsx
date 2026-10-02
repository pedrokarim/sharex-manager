import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Squelettes de chargement du back-office.
 *
 * Une page qui charge montre tout de suite sa forme – en-tête, barre d'outils,
 * grille ou tableau – en cases qui respirent, au lieu d'un écran d'attente
 * puis d'un contenu qui surgit. Chaque squelette reprend les proportions de ce
 * qu'il remplace, pour que rien ne saute à l'arrivée des données.
 */

/** Colonnes de la grille de la galerie, par taille de vignette. */
export const GALLERY_GRID_COLUMNS = {
  small: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8",
  medium: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  large: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3",
} as const;

export type GalleryThumbnailSize = keyof typeof GALLERY_GRID_COLUMNS;

const TILE_ASPECT: Record<GalleryThumbnailSize, string> = {
  small: "aspect-square",
  medium: "aspect-video",
  large: "aspect-[4/3]",
};

/** En-tête d'une page : l'icône, le titre, la phrase. */
export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6" aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2 pt-0.5">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-80 max-w-[60vw]" />
        </div>
      </div>
      {actions ? <Skeleton className="h-9 w-36 rounded-lg" /> : null}
    </div>
  );
}

/** Une ligne de filtres condensés. */
export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden>
      <Skeleton className="h-8 w-64 rounded-lg" />
      <Skeleton className="h-8 w-36 rounded-lg" />
      <Skeleton className="h-8 w-28 rounded-lg" />
    </div>
  );
}

interface MediaGridSkeletonProps {
  count?: number;
  size?: GalleryThumbnailSize;
  className?: string;
}

/** Cartes de fichiers de la galerie : la vignette, puis le nom et la date. */
export function MediaGridSkeleton({ count = 12, size = "medium", className }: MediaGridSkeletonProps) {
  return (
    <div className={cn("grid gap-2 sm:gap-4", GALLERY_GRID_COLUMNS[size], className)} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-border/60">
          <Skeleton className={cn("w-full rounded-none", TILE_ASPECT[size])} />
          <div className={cn("space-y-2 px-3 py-2.5", size === "small" && "p-2")}>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lignes d'une liste ou d'un tableau. */
export function RowsSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/60", className)} aria-hidden>
      <div className="border-b border-border/60 px-4 py-3">
        <Skeleton className="h-4 w-1/3" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-border/40 px-4 py-3.5 last:border-b-0">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Grille de cartes : albums, modules, rubriques. */
export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-4 rounded-2xl border border-border/60 p-5">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Pages entières ──────────────────────────────────────────────

/** La galerie : sa barre d'outils, un intertitre de mois, sa grille. */
export function GalleryPageSkeleton({ size = "medium" }: { size?: GalleryThumbnailSize }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Chargement de la galerie">
      <div className="flex flex-wrap items-center justify-between gap-3" aria-hidden>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-6 w-40" aria-hidden />
      <MediaGridSkeleton size={size} />
    </div>
  );
}

/** Page à tableau : en-tête, filtres, lignes. */
export function TablePageSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Chargement">
      <PageHeaderSkeleton actions />
      <FilterBarSkeleton />
      <RowsSkeleton />
    </div>
  );
}

/** Page à cartes : en-tête, grille de cartes. */
export function CardsPageSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Chargement">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={count} />
    </div>
  );
}

/** Page de réglages : en-tête, quelques blocs de champs. */
export function FormPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Chargement">
      <PageHeaderSkeleton />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-4 rounded-2xl border border-border/60 p-5" aria-hidden>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
