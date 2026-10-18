import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/skeletons/page-skeletons";

/**
 * Forme de l'écran pendant le premier chargement : l'en-tête, le panneau des
 * limites en jauges, les onglets et le tableau des fournisseurs. Rien ne
 * prend toute la page : chaque bloc garde sa place.
 */
export default function AiUsageLoading() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6" role="status" aria-label="Chargement de l’écran Intelligence artificielle">
      <PageHeaderSkeleton actions />

      <div className="min-w-0 overflow-hidden rounded-xl border" aria-hidden>
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="grid flex-1 gap-1.5 pt-0.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3.5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,1.6fr)] md:items-center">
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-4" aria-hidden>
        <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-full rounded-lg sm:w-72" />
          <Skeleton className="h-8 w-80 max-w-full rounded-lg" />
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-4 w-1/3" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="hidden h-4 w-40 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
