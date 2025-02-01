"use client";

import { useState } from "react";
import { HistoryList } from "@/components/history/history-list";
import { HistoryFilters } from "@/components/history/history-filters";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { BreadcrumbNav } from "@/components/breadcrumb";
import { SidebarInset } from "@/components/ui/sidebar";

export function HistoryPageClient() {
  const [currentFilters, setCurrentFilters] = useState<
    URLSearchParams | undefined
  >();

  return (
    <main className="p-8">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Historique des uploads
            </h1>
            <p className="text-muted-foreground">
              Consultez l&apos;historique de tous les fichiers uploadés via
              ShareX
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <HistoryFilters onFiltersChange={setCurrentFilters} />
        <HistoryList filters={currentFilters} />
      </div>
    </main>
  );
}
