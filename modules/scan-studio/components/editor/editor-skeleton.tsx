import { Skeleton } from "@/components/ui/skeleton";

/** Classes du cadre de l'atelier : toute la largeur et toute la hauteur laissées par l'en-tête de l'application. */
export const WORKSPACE_CLASS = "-mx-4 -mb-4 flex h-[calc(100svh-var(--header-height)-1rem)] min-h-[560px] flex-col overflow-hidden border-t";

/**
 * Silhouette de l'atelier pendant le chargement d'une page : mêmes bandes,
 * mêmes dimensions, pour que rien ne saute quand la page arrive.
 */
export function EditorSkeleton() {
  return (
    <div className={WORKSPACE_CLASS} aria-busy="true" aria-label="Chargement de la page">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="ml-auto h-8 w-36" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r py-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="size-9" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center p-8">
          <Skeleton className="aspect-[2/3] h-full max-h-full max-w-full rounded-sm" />
        </div>
        <div className="w-80 shrink-0 space-y-4 border-l p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="flex h-14 shrink-0 items-center gap-2 border-t px-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-36" />
        ))}
      </div>
    </div>
  );
}
