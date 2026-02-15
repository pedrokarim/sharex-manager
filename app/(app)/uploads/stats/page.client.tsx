"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, BarChart3, TrendingUp, Network, LayoutDashboard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryState } from "nuqs";
import { useTranslation } from "@/lib/i18n";
import { StatsData } from "./_components/types";
import { calculateStats, getTestData } from "./_components/calculate-stats";
import { StatsOverviewTab } from "./_components/stats-overview-tab";
import { StatsAnalyticsTab } from "./_components/stats-analytics-tab";
import { StatsGrowthTab } from "./_components/stats-growth-tab";
import { StatsNetworkTab } from "./_components/stats-network-tab";

export function StatsPageClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useQueryState("tab", { defaultValue: "overview" });
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [useTestData, setUseTestData] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [historyResponse, fileStatsResponse] = await Promise.all([
        fetch("/api/history?stats=true"),
        fetch("/api/stats"),
      ]);

      if (!historyResponse.ok || !fileStatsResponse.ok)
        throw new Error("Erreur lors du chargement des données");

      const historyData = await historyResponse.json();
      const fileStats = await fileStatsResponse.json();

      setStats(useTestData ? getTestData() : calculateStats(historyData, fileStats));
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    }
  }, [useTestData]);

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
  }, [useTestData]);

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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
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
