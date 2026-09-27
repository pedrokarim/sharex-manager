"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, BarChart3, TrendingUp, Network, LayoutDashboard, CalendarIcon, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQueryState } from "nuqs";
import { format } from "date-fns";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { cn } from "@/lib/utils";
import { StatsData } from "./_components/types";
import { calculateStats, getTestData } from "./_components/calculate-stats";
import { StatsOverviewTab } from "./_components/stats-overview-tab";
import { StatsAnalyticsTab } from "./_components/stats-analytics-tab";
import { StatsGrowthTab } from "./_components/stats-growth-tab";
import { StatsNetworkTab } from "./_components/stats-network-tab";

export function StatsPageClient() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [tab, setTab] = useQueryState("tab", { defaultValue: "overview" });
  const [startDate, setStartDate] = useQueryState("start");
  const [endDate, setEndDate] = useQueryState("end");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [useTestData, setUseTestData] = useState(false);

  const hasDateFilter = startDate || endDate;

  const formatDateLabel = () => {
    if (startDate && endDate) {
      return `${format(new Date(startDate), "dd/MM/yy", { locale })} - ${format(new Date(endDate), "dd/MM/yy", { locale })}`;
    }
    if (startDate) {
      return `${t("gallery.date_filter.from")} ${format(new Date(startDate), "dd/MM/yy", { locale })}`;
    }
    if (endDate) {
      return `${t("gallery.date_filter.until")} ${format(new Date(endDate), "dd/MM/yy", { locale })}`;
    }
    return null;
  };

  const handleResetDates = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const loadStats = useCallback(async () => {
    try {
      const historyParams = new URLSearchParams({ stats: "true" });
      const statsParams = new URLSearchParams();

      if (startDate) {
        historyParams.set("startDate", startDate);
        statsParams.set("startDate", startDate);
      }
      if (endDate) {
        historyParams.set("endDate", endDate);
        statsParams.set("endDate", endDate);
      }

      const [historyResponse, fileStatsResponse] = await Promise.all([
        fetch(`/api/history?${historyParams}`),
        fetch(`/api/stats?${statsParams}`),
      ]);

      if (!historyResponse.ok || !fileStatsResponse.ok)
        throw new Error("Erreur lors du chargement des données");

      const historyData = await historyResponse.json();
      const fileStats = await fileStatsResponse.json();

      const dateRange = (startDate || endDate)
        ? { startDate: startDate || undefined, endDate: endDate || undefined }
        : undefined;

      setStats(useTestData ? getTestData() : calculateStats(historyData, fileStats, dateRange));
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    }
  }, [useTestData, startDate, endDate]);

  useEffect(() => {
    const loadStatsAsync = async () => {
      try {
        setIsLoading(true);
        await loadStats();
      } finally {
        setIsLoading(false);
      }
    };

    loadStatsAsync();
  }, [useTestData, startDate, endDate]);

  // Ref pour accéder aux fonctions dans les callbacks SSE
  const loadStatsRef = useRef(loadStats);

  useEffect(() => {
    loadStatsRef.current = loadStats;
  }, [loadStats]);

  // SSE pour les mises à jour des statistiques en temps réel
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isReconnecting = false;
    let isDestroyed = false;

    const cleanup = () => {
      isDestroyed = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      isReconnecting = false;
    };

    const connectSSE = () => {
      if (isDestroyed || isReconnecting) return;

      eventSource = new EventSource("/api/stats/stream");

      eventSource.onopen = () => {
        if (isDestroyed) return;
        isReconnecting = false;
      };

      eventSource.addEventListener("stats", (event: any) => {
        if (isDestroyed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "stats_update") {
            loadStatsRef.current().catch((error) => {
              console.error("[Stats SSE] Erreur lors du rechargement:", error);
            });
          }
        } catch (error) {
          console.error("[Stats SSE] Erreur parsing message:", error);
        }
      });

      eventSource.onerror = () => {
        if (isDestroyed) return;
        if (!isReconnecting) {
          isReconnecting = true;
          reconnectTimeout = setTimeout(() => {
            if (!isDestroyed) connectSSE();
          }, 5000);
        }
      };
    };

    connectSSE();
    return cleanup;
  }, []);

  if (isLoading) {
    return (
      <main className="flex items-center justify-center flex-1">
        <Loader2 className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  if (!stats) return null;

  return (
    <main className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {t("uploads.stats.title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("uploads.stats.description")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date range filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs",
                  hasDateFilter && "pr-1.5"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {hasDateFilter ? formatDateLabel() : t("gallery.date_filter.start_date")}
                </span>
                {hasDateFilter && (
                  <span
                    role="button"
                    className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetDates();
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("gallery.date_filter.start_date")}
                    </span>
                    <Calendar
                      mode="single"
                      selected={startDate ? new Date(startDate) : undefined}
                      onSelect={(date) =>
                        setStartDate(date ? date.toISOString() : null)
                      }
                      locale={locale}
                      disabled={(date) =>
                        endDate ? date > new Date(endDate) : false
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("gallery.date_filter.end_date")}
                    </span>
                    <Calendar
                      mode="single"
                      selected={endDate ? new Date(endDate) : undefined}
                      onSelect={(date) =>
                        setEndDate(date ? date.toISOString() : null)
                      }
                      locale={locale}
                      disabled={(date) =>
                        startDate ? date < new Date(startDate) : false
                      }
                    />
                  </div>
                </div>
                {hasDateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetDates}
                    className="w-full h-7 text-xs"
                  >
                    <X className="mr-1.5 h-3 w-3" />
                    {t("gallery.date_filter.reset")}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {process.env.NODE_ENV === "development" && (
            <div className="flex items-center space-x-2">
              <Switch
                id="test-mode"
                checked={useTestData}
                onCheckedChange={setUseTestData}
              />
              <Label
                htmlFor="test-mode"
                className="text-xs sm:text-sm text-muted-foreground"
              >
                {useTestData ? "Données de test" : "Données réelles"}
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5 hidden sm:block" />
            <span className="text-xs sm:text-sm">{t("uploads.stats.tabs.overview")}</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 hidden sm:block" />
            <span className="text-xs sm:text-sm">{t("uploads.stats.tabs.analytics")}</span>
          </TabsTrigger>
          <TabsTrigger value="growth" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 hidden sm:block" />
            <span className="text-xs sm:text-sm">{t("uploads.stats.tabs.growth")}</span>
          </TabsTrigger>
          <TabsTrigger value="network" className="gap-1.5">
            <Network className="h-3.5 w-3.5 hidden sm:block" />
            <span className="text-xs sm:text-sm">{t("uploads.stats.tabs.network")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StatsOverviewTab stats={stats} />
        </TabsContent>

        <TabsContent value="analytics">
          <StatsAnalyticsTab stats={stats} />
        </TabsContent>

        <TabsContent value="growth">
          <StatsGrowthTab stats={stats} />
        </TabsContent>

        <TabsContent value="network">
          <StatsNetworkTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
