import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/skeletons/page-skeletons";

/**
 * Forme de l'écran Sécurité pendant le premier chargement : l'en-tête, la
 * barre d'onglets, puis les deux colonnes de l'onglet État (points de
 * contrôle à gauche, alertes à droite). Chaque bloc garde sa place.
 */
export default function SecurityLoading() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6" role="status" aria-label="Chargement de l’écran Sécurité">
      <PageHeaderSkeleton actions />
      <Skeleton className="h-9 w-[26rem] max-w-full rounded-lg" aria-hidden />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start" aria-hidden>
        <div className="grid min-w-0 gap-6">
          <PanelSkeleton rows={6} />
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        </div>
        <PanelSkeleton rows={3} />
      </div>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="grid flex-1 gap-1.5 pt-0.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-60 max-w-full" />
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex min-w-0 items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
