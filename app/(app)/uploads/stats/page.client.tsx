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
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { HistoryEntry } from "@/lib/types/history";
import { Loader2 } from "lucide-react";

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
    count: number;
    size: number;
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
        const entries: HistoryEntry[] = historyData.items;

        // Calculer les statistiques
        const stats: StatsData = {
          totalUploads: entries.length,
          totalSize: entries.reduce((acc, entry) => acc + entry.fileSize, 0),
          uploadsByMethod: {
            api: entries.filter((e) => e.uploadMethod === "api").length,
            web: entries.filter((e) => e.uploadMethod === "web").length,
            sharex: entries.filter((e) => e.uploadMethod === "sharex").length,
          },
          uploadsByDay: [],
          uploadsByType: fileStats.byExtension,
          averageSizeByDay: [],
          uploadsByHour: [],
          uploadsByWeekday: [],
          sizeDistribution: fileStats.sizeDistribution,
          monthlyGrowth: fileStats.monthlyGrowth,
          oldestFile: fileStats.oldestFile,
          newestFile: fileStats.newestFile,
        };

        // Grouper par jour
        const byDay = new Map<string, { count: number; size: number }>();
        entries.forEach((entry) => {
          const date = format(new Date(entry.uploadDate), "yyyy-MM-dd");
          const current = byDay.get(date) || { count: 0, size: 0 };
          byDay.set(date, {
            count: current.count + 1,
            size: current.size + entry.fileSize,
          });
        });

        stats.uploadsByDay = Array.from(byDay.entries())
          .map(([date, stats]) => ({
            date,
            count: stats.count,
            size: Math.round(stats.size / 1024 / 1024), // Convertir en MB
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Calculer la taille moyenne par jour
        stats.averageSizeByDay = Array.from(byDay.entries())
          .map(([date, stats]) => ({
            date,
            averageSize: Math.round(stats.size / stats.count / 1024 / 1024), // Convertir en MB
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Grouper par extension de fichier
        const byType = new Map<string, number>();
        entries.forEach((entry) => {
          const extension =
            entry.originalFilename.split(".").pop()?.toLowerCase() ||
            "sans extension";
          byType.set(extension, (byType.get(extension) || 0) + 1);
        });

        const totalFiles = entries.length;
        stats.uploadsByType = Array.from(byType.entries())
          .map(([type, count]) => ({
            type,
            count,
            percentage: Math.round((count / totalFiles) * 100),
          }))
          .sort((a, b) => b.count - a.count);

        // Grouper par heure
        const byHour = new Map<number, number>();
        entries.forEach((entry) => {
          const hour = new Date(entry.uploadDate).getHours();
          byHour.set(hour, (byHour.get(hour) || 0) + 1);
        });

        stats.uploadsByHour = Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: byHour.get(hour) || 0,
        }));

        // Grouper par jour de la semaine
        const weekdays = [
          "Dimanche",
          "Lundi",
          "Mardi",
          "Mercredi",
          "Jeudi",
          "Vendredi",
          "Samedi",
        ];
        const byWeekday = new Map<string, number>();
        entries.forEach((entry) => {
          const weekday = weekdays[new Date(entry.uploadDate).getDay()];
          byWeekday.set(weekday, (byWeekday.get(weekday) || 0) + 1);
        });

        stats.uploadsByWeekday = weekdays.map((weekday) => ({
          weekday,
          count: byWeekday.get(weekday) || 0,
        }));

        setStats(stats);
      } catch (error) {
        console.error("Erreur lors du chargement des statistiques:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []);

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
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Statistiques des uploads
            </h1>
            <p className="text-muted-foreground">
              Visualisez les statistiques de vos uploads ShareX
            </p>
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
          <CardHeader>
            <CardTitle>Uploads par jour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.uploadsByDay}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      format(new Date(date), "dd MMM", { locale: fr })
                    }
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(date) =>
                      format(new Date(date), "dd MMMM yyyy", { locale: fr })
                    }
                    formatter={(value: number) => [value, "uploads"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Graphique de la taille moyenne des fichiers par jour */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Taille moyenne des fichiers par jour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.averageSizeByDay}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      format(new Date(date), "dd MMM", { locale: fr })
                    }
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(date) =>
                      format(new Date(date), "dd MMMM yyyy", { locale: fr })
                    }
                    formatter={(value: number) => [
                      `${value} MB`,
                      "taille moyenne",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="averageSize"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.uploadsByType}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.type} (${entry.percentage}%)`}
                    >
                      {stats.uploadsByType.map((entry, index) => (
                        <Cell
                          key={entry.type}
                          fill={
                            [
                              "#2563eb", // Bleu
                              "#16a34a", // Vert
                              "#dc2626", // Rouge
                              "#ca8a04", // Jaune
                              "#9333ea", // Violet
                              "#0891b2", // Cyan
                              "#be185d", // Rose
                              "#2dd4bf", // Turquoise
                              "#f97316", // Orange
                              "#8b5cf6", // Indigo
                              "#ec4899", // Pink
                              "#14b8a6", // Teal
                            ][index % 12]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => [
                        `${value} fichiers (${props.payload.percentage}%)`,
                        `Extension .${name}`,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Uploads par heure */}
          <Card>
            <CardHeader>
              <CardTitle>Uploads par heure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.uploadsByHour}>
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(hour) => `${hour}h`}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => [value, "uploads"]}
                      labelFormatter={(hour) => `${hour}h00`}
                    />
                    <Bar dataKey="count" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Uploads par jour de la semaine */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Uploads par jour de la semaine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.uploadsByWeekday}>
                  <XAxis dataKey="weekday" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => [value, "uploads"]} />
                  <Bar dataKey="count" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribution des tailles de fichiers */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Distribution des tailles de fichiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.sizeDistribution}>
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string, props: any) => [
                      `${value} fichiers (${props.payload.percentage}%)`,
                      "Nombre de fichiers",
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    fill="#2563eb"
                    name="Fichiers"
                    label={({ x, y, width, height, value, payload }) => (
                      <text
                        x={x + width / 2}
                        y={y - 10}
                        fill="#666"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {payload?.percentage ?? 0}%
                      </text>
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Croissance mensuelle */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Croissance mensuelle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyGrowth}>
                  <XAxis
                    dataKey="month"
                    tickFormatter={(month) =>
                      format(new Date(month), "MMM yyyy", { locale: fr })
                    }
                  />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    labelFormatter={(month) =>
                      format(new Date(month), "MMMM yyyy", { locale: fr })
                    }
                    formatter={(value: number, name: string) => [
                      name === "newFiles"
                        ? `${value} fichiers`
                        : formatFileSize(value),
                      name === "newFiles"
                        ? "Nouveaux fichiers"
                        : "Taille totale",
                    ]}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "newFiles"
                        ? "Nouveaux fichiers"
                        : "Taille totale"
                    }
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="newFiles"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.2}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="totalSize"
                    stroke="#16a34a"
                    fill="#16a34a"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
