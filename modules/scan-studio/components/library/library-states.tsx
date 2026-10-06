"use client";

import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Gabarit des grilles de la bibliothèque : autant de colonnes que la largeur en offre. */
export const FOLDER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-6";
export const PAGE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5";

/** Message centré : bibliothèque vide, objet introuvable, chargement impossible. */
export function LibraryNotice({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Le geste proposé : un bouton, un lien. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <Icon aria-hidden className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      </div>
      {children}
    </div>
  );
}

/** Les cartes de dossiers, avant leur arrivée. */
export function FolderGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={FOLDER_GRID} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="aspect-[3/4] rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Les lignes de chapitres. */
export function ChapterListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-2 py-2.5">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-16 w-12 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-2 w-48 rounded-full md:block" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** La planche de vignettes d'un chapitre. */
export function PageBoardSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={PAGE_GRID} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="aspect-[3/4] rounded-lg" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
