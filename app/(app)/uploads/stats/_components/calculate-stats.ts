import { format } from "date-fns";
import { HistoryEntry } from "@/lib/types/history";
import { StatsData } from "./types";

export function calculateStats(historyData: any, fileStats: any): StatsData {
  const entries: HistoryEntry[] = historyData.items;

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
    .map(([date, data]) => ({
      date,
      api: data.api,
      web: data.web,
      total: data.total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calcul de la taille moyenne par jour
  stats.averageSizeByDay = Array.from(byDay.entries())
    .map(([date, data]) => ({
      date,
      averageSize:
        data.total > 0
          ? Math.round((data.totalSize / data.total / (1024 * 1024)) * 10) / 10
          : 0,
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
    const weekday = weekdays[date.getDay() === 0 ? 6 : date.getDay() - 1];
    byWeekday.set(weekday, (byWeekday.get(weekday) || 0) + 1);
  });
  stats.uploadsByWeekday = weekdays.map((weekday) => ({
    weekday,
    count: byWeekday.get(weekday) || 0,
  }));

  return stats;
}

export function getTestData(): StatsData {
  return {
    totalUploads: 1250,
    totalSize: 1024 * 1024 * 1024 * 5,
    uploadsByMethod: {
      api: 750,
      web: 450,
      sharex: 50,
    },
    uploadsByDay: Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const api = Math.floor(Math.random() * 40) + 30;
      const web = Math.floor(Math.random() * 30) + 15;
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
}
