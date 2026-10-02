"use client";

import { HistoryList } from "@/components/history/history-list";
import { HistoryFilters } from "@/components/history/history-filters";
import { useTranslation } from "@/lib/i18n";

export function HistoryPageClient() {
  const { t } = useTranslation();
  return (
    // min-h-full et shrink-0, pas h-full : avec une hauteur fixe (ou un bloc
    // que la colonne flex peut tasser), le contenu déborde de ce
    // bloc et la marge basse de la zone de défilement ne s'applique plus sous
    // le dernier élément, qui vient toucher le bord.
    <main className="flex min-h-full shrink-0 flex-col">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("uploads.history.title")}
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              {t("uploads.history.description")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <HistoryFilters />
        <HistoryList />
      </div>
    </main>
  );
}
