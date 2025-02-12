"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset } from "@/components/ui/sidebar";
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

    // Calculer les statistiques de base
    const stats: StatsData = {
      totalUploads: entries.length,
      totalSize: entries.reduce((acc, entry) => acc + entry.fileSize, 0),
      uploadsByMethod: {
        api: entries.filter((e) => e.uploadMethod === "api").length,
        web: entries.filter((e) => e.uploadMethod === "web").length,
        sharex: entries.filter((e) => e.uploadMethod === "sharex").length,
      },
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
        const [historyResponse, fileStatsResponse] = await Promise.all([
          fetch("/api/history"),
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
    <main className="p-8">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                Statistiques des uploads
              </h1>
              <p className="text-muted-foreground">
                Visualisez les statistiques de vos uploads ShareX
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
                  className="text-sm text-muted-foreground"
                >
                  {useTestData ? "Données de test" : "Données réelles"}
                </Label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 mt-8">
        {/* Cartes de statistiques générales */}
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total des uploads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUploads}</div>
              <p className="text-xs text-muted-foreground">fichiers uploadés</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Taille totale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatFileSize(stats.totalSize)}
              </div>
              <p className="text-xs text-muted-foreground">d'espace utilisé</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Uploads via API
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.uploadsByMethod.api}
              </div>
              <p className="text-xs text-muted-foreground">
                fichiers via l'API
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Uploads via Web
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.uploadsByMethod.web}
              </div>
              <p className="text-xs text-muted-foreground">
                fichiers via l'interface
              </p>
            </CardContent>
          </Card>

          {/* Nouvelles cartes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Premier fichier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {format(new Date(stats.oldestFile.date), "dd/MM/yyyy", {
                  locale: fr,
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Dernier fichier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {format(new Date(stats.newestFile.date), "dd/MM/yyyy", {
                  locale: fr,
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
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
              <CardTitle>Uploads par jour</CardTitle>
              <p className="text-sm text-muted-foreground">
                Affichage des uploads par méthode sur les 30 derniers jours
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
                    "relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-l sm:border-t-0 sm:px-8 sm:py-6 transition-colors",
                    activeView === method || activeView === null
                      ? "hover:bg-muted/50"
                      : "opacity-50 hover:opacity-75 bg-muted/10"
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    Via {method.toUpperCase()}
                  </span>
                  <span className="text-lg font-bold leading-none sm:text-3xl">
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
          <CardContent className="!p-6">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.uploadsByDay}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      format(new Date(date), "dd MMM", { locale: fr })
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
                              locale: fr,
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
                                      ? "Via API"
                                      : "Via Web"}
                                  </span>
                                </div>
                                <div className="font-medium">
                                  {entry.value} uploads
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
                      name="Via API"
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
                      name="Via Web"
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
          <CardHeader>
            <CardTitle>Taille moyenne des fichiers par jour</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.averageSizeByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      format(new Date(date), "dd MMM", { locale: fr })
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
                              locale: fr,
                            })}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Taille moyenne</span>
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
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          {/* Types de fichiers */}
          <Card>
            <CardHeader>
              <CardTitle>Extensions de fichiers</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                            <div className="mb-2 font-medium">
                              Extension .{data.type}
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <span>Fichiers</span>
                                <span className="font-medium">
                                  {data.count}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>Pourcentage</span>
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
            <CardHeader>
              <CardTitle>Uploads par heure</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig}>
                <ResponsiveContainer width="100%" height={300}>
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
                              <span>Uploads</span>
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
          <CardHeader>
            <CardTitle>Uploads par jour de la semaine</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
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
                            <span>Uploads</span>
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
          <CardHeader>
            <CardTitle>Distribution des tailles de fichiers</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
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
                              <span>Fichiers</span>
                              <span className="font-medium">{data.count}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>Pourcentage</span>
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
          <CardHeader>
            <CardTitle>Croissance mensuelle</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stats.monthlyGrowth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(month) =>
                      format(new Date(month), "MMM yyyy", { locale: fr })
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
                              locale: fr,
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
                                <span>Nouveaux fichiers</span>
                              </div>
                              <span className="font-medium">
                                {payload[0]?.value} fichiers
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
                                <span>Taille totale</span>
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
                        ? "Nouveaux fichiers"
                        : "Taille totale"
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
