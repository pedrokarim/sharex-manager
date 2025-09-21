"use client";

import { useState } from "react";
import { HistoryList } from "@/components/history/history-list";
import { HistoryFilters } from "@/components/history/history-filters";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { BreadcrumbNav } from "@/components/breadcrumb";
import { SidebarInset } from "@/components/ui/sidebar";
import { useTranslation } from "@/lib/i18n";

export function HistoryPageClient() {
  const { t } = useTranslation();
  const [currentFilters, setCurrentFilters] = useState<
    URLSearchParams | undefined
  >();

  return (
    <main className="p-4 sm:p-6 lg:p-8">
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
        <HistoryFilters onFiltersChange={setCurrentFilters} />
        <HistoryList filters={currentFilters} />
      </div>
    </main>
  );
}
