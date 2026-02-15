export interface StatsData {
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

export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
