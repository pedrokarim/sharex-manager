"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
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

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoading(true);
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
        setStats(
          useTestData ? testData : calculateStats(historyData, fileStats)
        );
      } catch (error) {
        console.error("Erreur lors du chargement des statistiques:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [useTestData]); // Recharger quand useTestData change

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
      color: "hsl(var(--chart-1))",
    },
    web: {
      label: "Via Web",
      color: "hsl(var(--chart-2))",
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
    <main className="flex flex-col h-full">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {t("uploads.stats.title")}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
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
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 mt-6 sm:mt-8">
        {/* Cartes de statistiques générales */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("uploads.stats.cards.total_uploads")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">
                {stats.totalUploads}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("uploads.stats.labels.total")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("uploads.stats.cards.total_size")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">
                {formatFileSize(stats.totalSize)}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("uploads.stats.labels.space_used")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("uploads.stats.labels.api")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">
                {stats.uploadsByMethod.api}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("uploads.stats.labels.files_via_api")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("uploads.stats.labels.web")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">
                {stats.uploadsByMethod.web}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("uploads.stats.labels.files_via_web")}
              </p>
            </CardContent>
          </Card>

          {/* Nouvelles cartes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("uploads.stats.labels.oldest_file")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold">
                {format(new Date(stats.oldestFile.date), "dd/MM/yyyy", {
                  locale,
                })}
              </div>
              <p
                className="text-xs text-muted-foreground truncate"
                title={stats.oldestFile.name}
              >
                {stats.oldestFile.name}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">
                {t("uploads.stats.labels.newest_file")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold">
                {format(new Date(stats.newestFile.date), "dd/MM/yyyy", {
                  locale,
                })}
              </div>
              <p
                className="text-xs text-muted-foreground truncate"
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
            <div className="flex flex-1 flex-col justify-center gap-1 px-4 py-4 sm:px-6 sm:py-5 lg:py-6">
              <CardTitle className="text-base sm:text-lg">
                {t("uploads.stats.charts.uploads_by_day")}
              </CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">
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
                    "relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l sm:border-l sm:border-t-0 sm:px-6 sm:py-4 lg:px-8 lg:py-6 transition-colors",
                    activeView === method || activeView === null
                      ? "hover:bg-muted/50"
                      : "opacity-50 hover:opacity-75 bg-muted/10"
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {t(`uploads.stats.labels.${method}`)}
                  </span>
                  <span className="text-base sm:text-lg lg:text-3xl font-bold leading-none">
                    {
                      stats.uploadsByMethod[
                        method as keyof typeof stats.uploadsByMethod
                      ]
                    }
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="!p-4 sm:!p-6">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.uploadsByDay}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      format(new Date(date), "dd MMM", { locale })
                    }
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={20}
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                          <div className="mb-2 font-medium">
                            {format(new Date(label), "dd MMMM yyyy", {
                              locale,
                            })}
                          </div>
                          <div className="flex flex-col gap-1">
                            {payload.map((entry, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-1">
                                  <div
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                      backgroundColor: entry.color,
                                    }}
                                  />
                                  <span>
                                    {entry.name === "api"
                                      ? t("uploads.stats.labels.api")
                                      : t("uploads.stats.labels.web")}
                                  </span>
                                </div>
                                <div className="font-medium">
                                  {entry.value}{" "}
                                  {t("uploads.stats.labels.count")}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {(activeView === "api" || activeView === null) && (
                    <Bar
                      dataKey="api"
                      name="api"
                      stackId="a"
                      fill={chartConfig.api.color}
                      fillOpacity={0.8}
                      animationDuration={1000}
                      animationBegin={0}
                    >
                      <LabelList
                        dataKey="api"
                        position="top"
                        style={{ fontSize: "10px" }}
                        formatter={(value: number) => (value > 50 ? value : "")}
                      />
                    </Bar>
                  )}
                  {(activeView === "web" || activeView === null) && (
                    <Bar
                      dataKey="web"
                      name="web"
                      stackId="a"
                      fill={chartConfig.web.color}
                      fillOpacity={0.8}
                      animationDuration={1000}
                      animationBegin={200}
                    >
                      <LabelList
                        dataKey="web"
                        position="top"
                        style={{ fontSize: "10px" }}
                        formatter={(value: number) => (value > 35 ? value : "")}
                      />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Graphique de la taille moyenne des fichiers par jour */}
        <Card className="col-span-full">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">
              {t("uploads.stats.cards.average_size")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={stats.averageSizeByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      format(new Date(date), "dd MMM", { locale })
                    }
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value} MB`}
                  />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                          <div className="mb-2 font-medium">
                            {format(new Date(label), "dd MMMM yyyy", {
                              locale,
                            })}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{t("uploads.stats.cards.average_size")}</span>
                            <span className="font-medium">
                              {payload[0].value} MB
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="averageSize"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={{
                      r: 4,
                      fill: "hsl(var(--chart-2))",
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                    activeDot={{
                      r: 6,
                      fill: "hsl(var(--chart-2))",
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                    animationDuration={2000}
                  >
                    <LabelList
                      dataKey="averageSize"
                      position="top"
                      offset={10}
                      style={{ fontSize: "10px" }}
                      formatter={(value: number) =>
                        value > 0 ? `${value} MB` : ""
                      }
                    />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Graphiques côte à côte */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
          {/* Types de fichiers */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                {t("uploads.stats.charts.uploads_by_type")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <ChartContainer config={chartConfig}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                            <div className="mb-2 font-medium">
                              {t("uploads.stats.labels.type")} .{data.type}
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <span>{t("uploads.stats.labels.count")}</span>
                                <span className="font-medium">
                                  {data.count}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {t("uploads.stats.labels.percentage")}
                                </span>
                                <span className="font-medium">
                                  {data.percentage}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={stats.uploadsByType}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.type} (${entry.percentage}%)`}
                      animationDuration={2000}
                    >
                      {stats.uploadsByType.map((entry, index) => (
                        <Cell
                          key={entry.type}
                          fill={
                            [
                              "hsl(var(--chart-1))",
                              "hsl(var(--chart-2))",
                              "hsl(var(--chart-3))",
                              "hsl(var(--chart-4))",
                              "hsl(var(--chart-5))",
                            ][index % 5]
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Uploads par heure */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                {t("uploads.stats.charts.uploads_by_hour")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <ChartContainer config={chartConfig}>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.uploadsByHour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(hour) => `${hour}h`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                            <div className="mb-2 font-medium">
                              {data.hour}h00
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>{t("uploads.stats.labels.count")}</span>
                              <span className="font-medium">{data.count}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--chart-1))"
                      animationDuration={2000}
                    >
                      <LabelList
                        dataKey="count"
                        position="top"
                        style={{ fontSize: "10px" }}
                        formatter={(value: number) => (value > 30 ? value : "")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Uploads par jour de la semaine */}
        <Card className="col-span-full">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">
              {t("uploads.stats.charts.uploads_by_weekday")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.uploadsByWeekday}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="weekday" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                          <div className="mb-2 font-medium">{data.weekday}</div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{t("uploads.stats.labels.count")}</span>
                            <span className="font-medium">{data.count}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--chart-2))"
                    animationDuration={2000}
                  >
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{ fontSize: "10px" }}
                      formatter={(value: number) => (value > 100 ? value : "")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Distribution des tailles de fichiers */}
        <Card className="col-span-full">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">
              {t("uploads.stats.charts.size_distribution")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.sizeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                          <div className="mb-2 font-medium">{data.range}</div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span>{t("uploads.stats.labels.count")}</span>
                              <span className="font-medium">{data.count}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                {t("uploads.stats.labels.percentage")}
                              </span>
                              <span className="font-medium">
                                {data.percentage}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--chart-3))"
                    animationDuration={2000}
                  >
                    <LabelList
                      dataKey="percentage"
                      position="top"
                      style={{ fontSize: "10px" }}
                      formatter={(value: number) => `${value}%`}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Croissance mensuelle */}
        <Card className="col-span-full">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">
              {t("uploads.stats.charts.monthly_growth")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.monthlyGrowth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(month) =>
                      format(new Date(month), "MMM yyyy", { locale })
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const totalSize = payload[1]?.value;
                      if (typeof totalSize !== "number") return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                          <div className="mb-2 font-medium">
                            {format(new Date(label), "MMMM yyyy", {
                              locale,
                            })}
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: "hsl(var(--chart-1))",
                                  }}
                                />
                                <span>
                                  {t("uploads.stats.labels.new_files")}
                                </span>
                              </div>
                              <span className="font-medium">
                                {payload[0]?.value}{" "}
                                {t("uploads.stats.labels.count")}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: "hsl(var(--chart-2))",
                                  }}
                                />
                                <span>
                                  {t("uploads.stats.cards.total_size")}
                                </span>
                              </div>
                              <span className="font-medium">
                                {formatFileSize(totalSize)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "newFiles"
                        ? t("uploads.stats.labels.new_files")
                        : t("uploads.stats.cards.total_size")
                    }
                    wrapperStyle={{ paddingTop: "1rem" }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="newFiles"
                    name="newFiles"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.2}
                    animationDuration={2000}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="totalSize"
                    name="totalSize"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.2}
                    animationDuration={2000}
                    animationBegin={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
