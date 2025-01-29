'use client';

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Bar, Line } from "recharts";
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
  }[];
}

export function StatsPageClient() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await fetch('/api/history');
        if (!response.ok) throw new Error('Erreur lors du chargement des données');
        
        const data = await response.json();
        const entries: HistoryEntry[] = data.items;

        // Calculer les statistiques
        const stats: StatsData = {
          totalUploads: entries.length,
          totalSize: entries.reduce((acc, entry) => acc + entry.fileSize, 0),
          uploadsByMethod: {
            api: entries.filter(e => e.uploadMethod === 'api').length,
            web: entries.filter(e => e.uploadMethod === 'web').length,
            sharex: entries.filter(e => e.uploadMethod === 'sharex').length,
          },
          uploadsByDay: [],
          uploadsByType: [],
        };

        // Grouper par jour
        const byDay = new Map<string, { count: number; size: number }>();
        entries.forEach(entry => {
          const date = format(new Date(entry.uploadDate), 'yyyy-MM-dd');
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

        // Grouper par type MIME
        const byType = new Map<string, number>();
        entries.forEach(entry => {
          const type = entry.mimeType.split('/')[0] || 'unknown';
          byType.set(type, (byType.get(type) || 0) + 1);
        });

        stats.uploadsByType = Array.from(byType.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        setStats(stats);
      } catch (error) {
        console.error('Erreur lors du chargement des statistiques:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []);

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
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
      <div className="flex h-screen">
        <AppSidebar />
        <SidebarInset>
          <SidebarHeader title="Statistiques" />
          <main className="flex items-center justify-center flex-1">
            <Loader2 className="h-8 w-8 animate-spin" />
          </main>
        </SidebarInset>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex h-screen">
      <AppSidebar />
      <SidebarInset>
        <SidebarHeader title="Statistiques" />
        
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
                  <p className="text-xs text-muted-foreground">
                    fichiers uploadés
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    d'espace utilisé
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Uploads via API
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.uploadsByMethod.api}</div>
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
                  <div className="text-2xl font-bold">{stats.uploadsByMethod.web}</div>
                  <p className="text-xs text-muted-foreground">
                    fichiers via l'interface
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
                          format(new Date(date), 'dd MMM', { locale: fr })
                        }
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(date) =>
                          format(new Date(date), 'dd MMMM yyyy', { locale: fr })
                        }
                        formatter={(value: number) => [value, 'uploads']}
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

            {/* Graphique des types de fichiers */}
            <Card className="col-span-full">
              <CardHeader>
                <CardTitle>Types de fichiers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.uploadsByType}>
                      <XAxis dataKey="type" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [value, 'fichiers']} />
                      <Bar dataKey="count" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </div>
  );
} 