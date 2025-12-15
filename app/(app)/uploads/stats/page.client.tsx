"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  LabelList,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { HistoryEntry } from "@/lib/types/history";
import {
  Loader2,
  Upload,
  HardDrive,
  Code,
  Globe,
  Calendar,
  Sparkles,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";

interface StatsData {
  totalUploads: number;
  totalSize: number;
  uploadsByMethod: {
    api: number;
    web: number;
    sharex: number;
  };
  uploadsByDay: {
    date: string;
    api: number;
    web: number;
    total: number;
  }[];
  uploadsByType: {
    type: string;
    count: number;
    percentage: number;
  }[];
  averageSizeByDay: {
    date: string;
    averageSize: number;
  }[];
  uploadsByHour: {
    hour: number;
    count: number;
  }[];
  uploadsByWeekday: {
    weekday: string;
    count: number;
  }[];
  sizeDistribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
  monthlyGrowth: {
    month: string;
    newFiles: number;
    totalSize: number;
  }[];
  oldestFile: {
    name: string;
    date: string;
  };
  newestFile: {
    name: string;
    date: string;
  };
}

export function StatsPageClient() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [useTestData, setUseTestData] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);
  const [fileStats, setFileStats] = useState<any>(null);
  const [activeView, setActiveView] = useState<"api" | "web" | null>(null);

  // Données de test pour la visualisation
  const testData: StatsData = {
    totalUploads: 1250,
    totalSize: 1024 * 1024 * 1024 * 5, // 5GB
    uploadsByMethod: {
      api: 750,
      web: 450,
      sharex: 50,
    },
    uploadsByDay: Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const api = Math.floor(Math.random() * 40) + 30; // Entre 30 et 70
      const web = Math.floor(Math.random() * 30) + 15; // Entre 15 et 45
      return {
        date: format(date, "yyyy-MM-dd"),
        api,
        web,
        total: api + web,
      };
    }),
    uploadsByType: [
      { type: "png", count: 450, percentage: 36 },
      { type: "jpg", count: 380, percentage: 30 },
      { type: "gif", count: 220, percentage: 18 },
      { type: "mp4", count: 120, percentage: 10 },
      { type: "autres", count: 80, percentage: 6 },
    ],
    averageSizeByDay: [
      { date: "2024-03-01", averageSize: 2.5 },
      { date: "2024-03-02", averageSize: 3.1 },
      { date: "2024-03-03", averageSize: 2.8 },
      { date: "2024-03-04", averageSize: 3.5 },
      { date: "2024-03-05", averageSize: 2.9 },
      { date: "2024-03-06", averageSize: 3.2 },
      { date: "2024-03-07", averageSize: 2.7 },
    ],
    uploadsByHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: Math.floor(Math.random() * 50) + 10,
    })),
    uploadsByWeekday: [
      { weekday: "Lundi", count: 180 },
      { weekday: "Mardi", count: 220 },
      { weekday: "Mercredi", count: 240 },
      { weekday: "Jeudi", count: 190 },
      { weekday: "Vendredi", count: 260 },
      { weekday: "Samedi", count: 120 },
      { weekday: "Dimanche", count: 90 },
    ],
    sizeDistribution: [
      { range: "< 100 KB", count: 450, percentage: 36 },
      { range: "100 KB - 1 MB", count: 380, percentage: 30 },
      { range: "1 MB - 5 MB", count: 220, percentage: 18 },
      { range: "5 MB - 10 MB", count: 120, percentage: 10 },
      { range: "> 10 MB", count: 80, percentage: 6 },
    ],
    monthlyGrowth: [
      { month: "2024-01", newFiles: 280, totalSize: 1024 * 1024 * 500 },
      { month: "2024-02", newFiles: 420, totalSize: 1024 * 1024 * 800 },
      { month: "2024-03", newFiles: 550, totalSize: 1024 * 1024 * 1200 },
    ],
    oldestFile: {
      name: "premiere-image.png",
      date: "2024-01-01T08:30:00Z",
    },
    newestFile: {
      name: "derniere-capture.jpg",
      date: "2024-03-14T15:45:00Z",
    },
  };

  // Fonction pour calculer les vraies statistiques
  const calculateStats = (historyData: any, fileStats: any): StatsData => {
    const entries: HistoryEntry[] = historyData.items;

    // Utiliser les statistiques globales directement depuis fileStats
    const stats: StatsData = {
      totalUploads: fileStats.totalFiles,
      totalSize: fileStats.totalSize,
      uploadsByMethod: fileStats.uploadsByMethod,
      uploadsByDay: [],
      uploadsByType: fileStats.byExtension.map((ext: any) => ({
        type: ext.extension || "sans extension",
        count: ext.count,
        percentage: ext.percentage,
      })),
      averageSizeByDay: [],
      uploadsByHour: [],
      uploadsByWeekday: [],
      sizeDistribution: fileStats.sizeDistribution,
      monthlyGrowth: fileStats.monthlyGrowth,
      oldestFile: fileStats.oldestFile,
      newestFile: fileStats.newestFile,
    };

    // Grouper par jour avec séparation API/Web et calcul de la taille moyenne
    const byDay = new Map<
      string,
      { api: number; web: number; total: number; totalSize: number }
    >();

    // Initialiser les 30 derniers jours avec des valeurs à 0
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      byDay.set(format(date, "yyyy-MM-dd"), {
        api: 0,
        web: 0,
        total: 0,
        totalSize: 0,
      });
    }

    // Ajouter les données réelles
    entries.forEach((entry) => {
      const date = format(new Date(entry.uploadDate), "yyyy-MM-dd");
      // Ne prendre en compte que les 30 derniers jours
      if (byDay.has(date)) {
        const current = byDay.get(date)!;
        if (entry.uploadMethod === "api") current.api++;
        else if (entry.uploadMethod === "web") current.web++;
        current.total = current.api + current.web;
        current.totalSize += entry.fileSize;
        byDay.set(date, current);
      }
    });

    stats.uploadsByDay = Array.from(byDay.entries())
      .map(([date, stats]) => ({
        date,
        api: stats.api,
        web: stats.web,
        total: stats.total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calcul de la taille moyenne par jour
    stats.averageSizeByDay = Array.from(byDay.entries())
      .map(([date, stats]) => ({
        date,
        averageSize:
          stats.total > 0
            ? Math.round((stats.totalSize / stats.total / (1024 * 1024)) * 10) /
              10
            : 0, // Convertir en MB avec 1 décimale
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calcul des uploads par heure
    const byHour = new Map<number, number>();
    for (let i = 0; i < 24; i++) byHour.set(i, 0);
    entries.forEach((entry) => {
      const hour = new Date(entry.uploadDate).getHours();
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
    });
    stats.uploadsByHour = Array.from(byHour.entries()).map(([hour, count]) => ({
      hour,
      count,
    }));

    // Calcul des uploads par jour de la semaine
    const weekdays = [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ];
    const byWeekday = new Map<string, number>();
    weekdays.forEach((day) => byWeekday.set(day, 0));
    entries.forEach((entry) => {
      const date = new Date(entry.uploadDate);
      const weekday = weekdays[date.getDay() === 0 ? 6 : date.getDay() - 1]; // Convertir 0-6 (Dimanche-Samedi) en 1-7 (Lundi-Dimanche)
      byWeekday.set(weekday, (byWeekday.get(weekday) || 0) + 1);
    });
    stats.uploadsByWeekday = weekdays.map((weekday) => ({
      weekday,
      count: byWeekday.get(weekday) || 0,
    }));

    // Autres calculs existants...
    return stats;
  };

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

      setHistoryData(historyData);
      setFileStats(fileStats);

      // Utiliser les données de test ou réelles selon l'état
      setStats(useTestData ? testData : calculateStats(historyData, fileStats));
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    }
  }, [useTestData, testData, calculateStats]);

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
  }, [useTestData]); // Recharger quand useTestData change

  // Ref pour accéder aux fonctions dans les callbacks SSE
  const loadStatsRef = useRef(loadStats);

  // Mettre à jour la ref quand loadStats change
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
      if (isDestroyed || isReconnecting) {
        return;
      }

      eventSource = new EventSource("/api/stats/stream");

      eventSource.onopen = () => {
        if (isDestroyed) return;
        console.log("[Stats SSE] Connexion établie");
        isReconnecting = false;
      };

      // Écouter les événements nommés "stats"
      eventSource.addEventListener("stats", (event: any) => {
        if (isDestroyed) return;

        try {
          const data = JSON.parse(event.data);

          if (data.type === "stats_update") {
            console.log(
              "[Stats SSE] Mise à jour des stats détectée:",
              data.action
            );

            // Recharger les statistiques
            loadStatsRef.current().catch((error) => {
              console.error("[Stats SSE] Erreur lors du rechargement:", error);
            });
          }
        } catch (error) {
          console.error("[Stats SSE] Erreur parsing message:", error);
        }
      });

      eventSource.onerror = (error) => {
        if (isDestroyed) return;

        console.error("[Stats SSE] Erreur de connexion");
        if (!isReconnecting) {
          isReconnecting = true;
          reconnectTimeout = setTimeout(() => {
            if (!isDestroyed) {
              console.log("[Stats SSE] Tentative de reconnexion...");
              connectSSE();
            }
          }, 5000);
        }
      };
    };

    // Établir la connexion SSE
    connectSSE();

    // Nettoyer la connexion à la destruction du composant
    return cleanup;
  }, []); // Dépendances vides pour éviter les re-créations

  const formatFileSize = (bytes: number) => {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const chartConfig = {
    api: {
      label: "Via API",
      color: "var(--chart-1)",
    },
    web: {
      label: "Via Web",
      color: "var(--chart-2)",
    },
    averageSize: {
      label: "Taille moyenne",
      color: "var(--chart-2)",
    },
    count: {
      label: "Nombre",
      color: "var(--chart-1)",
    },
    total: {
      label: "Total",
      color: "var(--chart-3)",
    },
    sizeDistribution: {
      label: "Distribution des tailles",
      color: "var(--chart-3)",
    },
    newFiles: {
      label: "Nouveaux fichiers",
      color: "var(--chart-1)",
    },
    totalSize: {
      label: "Taille totale",
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;

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

      <div className="grid gap-4 sm:gap-6">
        {/* Cartes de statistiques générales */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="@container">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("uploads.stats.cards.total_uploads")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-2xl font-bold tabular-nums">
                {stats.totalUploads.toLocaleString()}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("uploads.stats.labels.total")}
              </p>
            </CardContent>
          </Card>

          <Card className="@container">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("uploads.stats.cards.total_size")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-2xl font-bold tabular-nums">
                {formatFileSize(stats.totalSize)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("uploads.stats.labels.space_used")}
              </p>
            </CardContent>
          </Card>

          <Card className="@container">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <Code className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("uploads.stats.labels.api")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-2xl font-bold tabular-nums">
                {stats.uploadsByMethod.api.toLocaleString()}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("uploads.stats.labels.files_via_api")}
              </p>
            </CardContent>
          </Card>

          <Card className="@container">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("uploads.stats.labels.web")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-2xl font-bold tabular-nums">
                {stats.uploadsByMethod.web.toLocaleString()}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("uploads.stats.labels.files_via_web")}
              </p>
            </CardContent>
          </Card>

          <Card className="@container">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("uploads.stats.labels.oldest_file")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-2xl font-bold tabular-nums">
                {format(new Date(stats.oldestFile.date), "dd/MM/yy", {
                  locale,
                })}
              </div>
              <p
                className="text-[11px] text-muted-foreground truncate mt-0.5"
                title={stats.oldestFile.name}
              >
                {stats.oldestFile.name}
              </p>
            </CardContent>
          </Card>

          <Card className="@container">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("uploads.stats.labels.newest_file")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-2xl font-bold tabular-nums">
                {format(new Date(stats.newestFile.date), "dd/MM/yy", {
                  locale,
                })}
              </div>
              <p
                className="text-[11px] text-muted-foreground truncate mt-0.5"
                title={stats.newestFile.name}
              >
                {stats.newestFile.name}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Graphique des uploads par jour */}
        <Card className="col-span-full">
          <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
            <div className="flex flex-1 flex-col justify-center gap-1 px-4 py-3 sm:px-5 sm:py-4">
              <CardTitle className="text-sm sm:text-base font-semibold">
                {t("uploads.stats.charts.uploads_by_day")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("uploads.stats.charts.uploads_by_method")}
              </p>
            </div>
            <div className="flex">
              {["api", "web"].map((method) => (
                <button
                  key={method}
                  onClick={() =>
                    setActiveView(
                      activeView === (method as "api" | "web")
                        ? null
                        : (method as "api" | "web")
                    )
                  }
                  className={cn(
                    "relative z-30 flex flex-1 flex-col justify-center gap-0.5 border-t px-4 py-2.5 text-left even:border-l sm:border-l sm:border-t-0 sm:px-5 sm:py-3 transition-colors",
                    activeView === method || activeView === null
                      ? "hover:bg-muted/50"
                      : "opacity-50 hover:opacity-75 bg-muted/10"
                  )}
                >
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    {t(`uploads.stats.labels.${method}`)}
                  </span>
                  <span className="text-lg sm:text-xl font-bold leading-none tabular-nums">
                    {stats.uploadsByMethod[
                      method as keyof typeof stats.uploadsByMethod
                    ].toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <ChartContainer
              config={chartConfig}
              className="h-[200px] sm:h-[240px] w-full"
            >
              <BarChart data={stats.uploadsByDay}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) =>
                    format(new Date(date), "dd MMM", { locale })
                  }
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        format(new Date(value), "dd MMMM yyyy", { locale })
                      }
                    />
                  }
                />
                {(activeView === "api" || activeView === null) && (
                  <Bar
                    dataKey="api"
                    name="api"
                    stackId="a"
                    fill="var(--color-api)"
                    radius={[2, 2, 0, 0]}
                    animationDuration={800}
                    animationBegin={0}
                  />
                )}
                {(activeView === "web" || activeView === null) && (
                  <Bar
                    dataKey="web"
                    name="web"
                    stackId="a"
                    fill="var(--color-web)"
                    radius={[2, 2, 0, 0]}
                    animationDuration={800}
                    animationBegin={150}
                  />
                )}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Graphique de la taille moyenne des fichiers par jour */}
        <Card className="col-span-full">
          <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
            <CardTitle className="text-sm sm:text-base font-semibold">
              {t("uploads.stats.cards.average_size")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-2">
            <ChartContainer
              config={chartConfig}
              className="h-[180px] sm:h-[220px] w-full"
            >
              <LineChart data={stats.averageSizeByDay}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) =>
                    format(new Date(date), "dd MMM", { locale })
                  }
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value} MB`}
                  width={50}
                  className="text-xs"
                  domain={["dataMin - 0.5", "dataMax + 0.5"]}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        format(new Date(value), "dd MMMM yyyy", { locale })
                      }
                      formatter={(value) => `${value} MB`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="averageSize"
                  stroke="var(--color-averageSize)"
                  strokeWidth={2.5}
                  dot={{
                    r: 4,
                    fill: "var(--color-averageSize)",
                    strokeWidth: 2,
                    stroke: "hsl(var(--background))",
                  }}
                  activeDot={{
                    r: 6,
                    fill: "var(--color-averageSize)",
                    strokeWidth: 2,
                    stroke: "hsl(var(--background))",
                  }}
                  animationDuration={1200}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Graphiques côte à côte */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Types de fichiers */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
              <CardTitle className="text-sm sm:text-base font-semibold">
                {t("uploads.stats.charts.uploads_by_type")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <ChartContainer
                config={chartConfig}
                className="h-[200px] sm:h-[240px] w-full"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={stats.uploadsByType}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    label={(entry) => `.${entry.type}`}
                    labelLine={{ strokeWidth: 1 }}
                    animationDuration={1200}
                  >
                    {stats.uploadsByType.map((entry, index) => {
                      const chartColors = [
                        "var(--chart-1)",
                        "var(--chart-2)",
                        "var(--chart-3)",
                        "var(--chart-4)",
                        "var(--chart-5)",
                      ];
                      return (
                        <Cell key={entry.type} fill={chartColors[index % 5]} />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Uploads par heure */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
              <CardTitle className="text-sm sm:text-base font-semibold">
                {t("uploads.stats.charts.uploads_by_hour")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <ChartContainer
                config={chartConfig}
                className="h-[200px] sm:h-[240px] w-full"
              >
                <BarChart data={stats.uploadsByHour}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(hour) => `${hour}h`}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                    className="text-xs"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    className="text-xs"
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[2, 2, 0, 0]}
                    animationDuration={1200}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Uploads par jour de la semaine */}
        <Card className="col-span-full">
          <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
            <CardTitle className="text-sm sm:text-base font-semibold">
              {t("uploads.stats.charts.uploads_by_weekday")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-2">
            <ChartContainer
              config={chartConfig}
              className="h-[160px] sm:h-[200px] w-full"
            >
              <BarChart data={stats.uploadsByWeekday} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  className="stroke-muted"
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  dataKey="weekday"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  className="text-xs"
                  tickFormatter={(value) => value.substring(0, 3)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-web)"
                  radius={[0, 4, 4, 0]}
                  animationDuration={1200}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Distribution des tailles de fichiers */}
        <Card className="col-span-full">
          <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
            <CardTitle className="text-sm sm:text-base font-semibold">
              {t("uploads.stats.charts.size_distribution")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-2">
            <ChartContainer
              config={chartConfig}
              className="h-[180px] sm:h-[220px] w-full"
            >
              <BarChart data={stats.sizeDistribution}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="range"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-sizeDistribution)"
                  radius={[4, 4, 0, 0]}
                  animationDuration={1200}
                >
                  <LabelList
                    dataKey="percentage"
                    position="top"
                    className="text-[10px] fill-muted-foreground"
                    formatter={(value: number) => `${value}%`}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Croissance mensuelle */}
        <Card className="col-span-full">
          <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
            <CardTitle className="text-sm sm:text-base font-semibold">
              {t("uploads.stats.charts.monthly_growth")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-2">
            <ChartContainer
              config={chartConfig}
              className="h-[200px] sm:h-[240px] w-full"
            >
              <AreaChart data={stats.monthlyGrowth}>
                <defs>
                  <linearGradient id="fillNewFiles" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-newFiles)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-newFiles)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                  <linearGradient
                    id="fillTotalSize"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-totalSize)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-totalSize)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="month"
                  tickFormatter={(month) =>
                    format(new Date(month), "MMM yy", { locale })
                  }
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  className="text-xs"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  className="text-xs"
                  tickFormatter={(value) => formatFileSize(value).split(" ")[0]}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        format(new Date(value), "MMMM yyyy", { locale })
                      }
                      formatter={(value, name) => {
                        if (name === "totalSize") {
                          return formatFileSize(value as number);
                        }
                        return value;
                      }}
                    />
                  }
                />
                <Legend
                  formatter={(value) =>
                    value === "newFiles"
                      ? t("uploads.stats.labels.new_files")
                      : t("uploads.stats.cards.total_size")
                  }
                  wrapperStyle={{ paddingTop: "0.5rem" }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="newFiles"
                  name="newFiles"
                  stroke="var(--color-newFiles)"
                  strokeWidth={2}
                  fill="url(#fillNewFiles)"
                  animationDuration={1200}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalSize"
                  name="totalSize"
                  stroke="var(--color-totalSize)"
                  strokeWidth={2}
                  fill="url(#fillTotalSize)"
                  animationDuration={1200}
                  animationBegin={300}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
