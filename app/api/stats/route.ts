import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { auth } from "@/auth";
import { getAllHistory } from "@/lib/history";
import { getAbsoluteUploadPath } from "@/lib/config";

interface FileStats {
  totalFiles: number;
  totalSize: number;
  byExtension: {
    extension: string;
    count: number;
    totalSize: number;
    averageSize: number;
    percentage: number;
  }[];
  oldestFile: {
    name: string;
    date: string;
  };
  newestFile: {
    name: string;
    date: string;
  };
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
  topExtensions: {
    extension: string;
    count: number;
    percentage: number;
  }[];
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const uploadsDir = getAbsoluteUploadPath();
    const files = await fs.readdir(uploadsDir);
    const history = await getAllHistory();

    const fileStats: FileStats = {
      totalFiles: 0,
      totalSize: 0,
      byExtension: [],
      oldestFile: { name: "", date: "" },
      newestFile: { name: "", date: "" },
      sizeDistribution: [],
      monthlyGrowth: [],
      topExtensions: [],
    };

    // Map pour stocker les statistiques par extension
    const extensionStats = new Map<
      string,
      {
        count: number;
        totalSize: number;
      }
    >();

    // Map pour stocker les statistiques mensuelles
    const monthlyStats = new Map<
      string,
      {
        newFiles: number;
        totalSize: number;
      }
    >();

    // Map pour la distribution des tailles
    const sizeRanges = [
      { max: 100 * 1024, label: "< 100 KB" },
      { max: 1024 * 1024, label: "100 KB - 1 MB" },
      { max: 5 * 1024 * 1024, label: "1 MB - 5 MB" },
      { max: 10 * 1024 * 1024, label: "5 MB - 10 MB" },
      { max: 50 * 1024 * 1024, label: "10 MB - 50 MB" },
      { max: Infinity, label: "> 50 MB" },
    ];
    const sizeDistribution = new Map<string, number>();
    sizeRanges.forEach((range) => sizeDistribution.set(range.label, 0));

    // Parcourir tous les fichiers
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const fileStat = await fs.stat(filePath);

      if (!fileStat.isFile()) continue;

      // Statistiques de base
      fileStats.totalFiles++;
      fileStats.totalSize += fileStat.size;

      // Extension
      const extension = path.extname(file).toLowerCase() || "sans extension";
      const currentExtStats = extensionStats.get(extension) || {
        count: 0,
        totalSize: 0,
      };
      extensionStats.set(extension, {
        count: currentExtStats.count + 1,
        totalSize: currentExtStats.totalSize + fileStat.size,
      });

      // Distribution des tailles
      const range = sizeRanges.find((range) => fileStat.size <= range.max);
      if (range) {
        sizeDistribution.set(
          range.label,
          (sizeDistribution.get(range.label) || 0) + 1
        );
      }

      // Fichier le plus ancien/récent
      const fileDate = fileStat.birthtime.toISOString();
      if (!fileStats.oldestFile.date || fileDate < fileStats.oldestFile.date) {
        fileStats.oldestFile = { name: file, date: fileDate };
      }
      if (!fileStats.newestFile.date || fileDate > fileStats.newestFile.date) {
        fileStats.newestFile = { name: file, date: fileDate };
      }
    }

    // Traitement des statistiques mensuelles depuis l'historique
    history.forEach((entry) => {
      const month = entry.uploadDate.substring(0, 7); // Format: YYYY-MM
      const current = monthlyStats.get(month) || { newFiles: 0, totalSize: 0 };
      monthlyStats.set(month, {
        newFiles: current.newFiles + 1,
        totalSize: current.totalSize + entry.fileSize,
      });
    });

    // Conversion des statistiques par extension
    fileStats.byExtension = Array.from(extensionStats.entries()).map(
      ([extension, data]) => ({
        extension: extension.slice(1), // Enlever le point
        count: data.count,
        totalSize: data.totalSize,
        averageSize: Math.round(data.totalSize / data.count),
        percentage: Math.round((data.count / fileStats.totalFiles) * 100),
      })
    );

    // Top 5 des extensions
    fileStats.topExtensions = fileStats.byExtension
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((ext) => ({
        extension: ext.extension,
        count: ext.count,
        percentage: ext.percentage,
      }));

    // Distribution des tailles
    fileStats.sizeDistribution = Array.from(sizeDistribution.entries()).map(
      ([range, count]) => ({
        range,
        count,
        percentage: Math.round((count / fileStats.totalFiles) * 100),
      })
    );

    // Croissance mensuelle
    fileStats.monthlyGrowth = Array.from(monthlyStats.entries())
      .map(([month, data]) => ({
        month,
        newFiles: data.newFiles,
        totalSize: data.totalSize,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json(fileStats);
  } catch (error) {
    console.error("Erreur lors du calcul des statistiques:", error);
    return NextResponse.json(
      { error: "Erreur lors du calcul des statistiques" },
      { status: 500 }
    );
  }
}
