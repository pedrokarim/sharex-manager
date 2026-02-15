"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  LineChart,
  XAxis,
  YAxis,
  Bar,
  Line,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import {
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
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { StatsData, formatFileSize } from "./types";

const chartConfig = {
  api: { label: "Via API", color: "var(--chart-1)" },
  web: { label: "Via Web", color: "var(--chart-2)" },
  averageSize: { label: "Taille moyenne", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface StatsOverviewTabProps {
  stats: StatsData;
}

export function StatsOverviewTab({ stats }: StatsOverviewTabProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [activeView, setActiveView] = useState<"api" | "web" | null>(null);

  return (
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
              {format(new Date(stats.oldestFile.date), "dd/MM/yy", { locale })}
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
              {format(new Date(stats.newestFile.date), "dd/MM/yy", { locale })}
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
    </div>
  );
}
