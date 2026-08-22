"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  PieChart,
  XAxis,
  YAxis,
  Bar,
  Pie,
  Cell,
  CartesianGrid,
  LabelList,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useTranslation } from "@/lib/i18n";
import { StatsData } from "./types";
import {
  STAT_CARD,
  STAT_CARD_CONTENT,
  STAT_CARD_HEADER,
} from "./card-spacing";
import { cn } from "@/lib/utils";

const chartConfig = {
  count: { label: "Nombre", color: "var(--chart-1)" },
  web: { label: "Via Web", color: "var(--chart-2)" },
  sizeDistribution: { label: "Distribution des tailles", color: "var(--chart-3)" },
} satisfies ChartConfig;

interface StatsAnalyticsTabProps {
  stats: StatsData;
}

export function StatsAnalyticsTab({ stats }: StatsAnalyticsTabProps) {
  const { t } = useTranslation();

  // Group small file types (< 3%) into "autres" to avoid label overlap
  const otherLabel = t("uploads.stats.labels.other");
  const { groupedUploadsByType, otherDetails } = (() => {
    const total = stats.uploadsByType.reduce((sum, e) => sum + e.count, 0);
    if (total === 0) return { groupedUploadsByType: stats.uploadsByType, otherDetails: [] as typeof stats.uploadsByType };
    const threshold = total * 0.03;
    const major: typeof stats.uploadsByType = [];
    const others: typeof stats.uploadsByType = [];
    for (const entry of stats.uploadsByType) {
      if (entry.count >= threshold) {
        major.push(entry);
      } else {
        others.push(entry);
      }
    }
    if (others.length > 0) {
      const otherCount = others.reduce((sum, e) => sum + e.count, 0);
      major.push({ type: otherLabel, count: otherCount });
    }
    return { groupedUploadsByType: major, otherDetails: others };
  })();

  return (
    <div className="grid gap-4">
      {/* Graphiques côte à côte */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Types de fichiers */}
        <Card className={STAT_CARD}>
          <CardHeader className={STAT_CARD_HEADER}>
            <CardTitle className="text-sm sm:text-base font-semibold">
              {t("uploads.stats.charts.uploads_by_type")}
            </CardTitle>
          </CardHeader>
          <CardContent className={STAT_CARD_CONTENT}>
            <ChartContainer
              config={chartConfig}
              className="h-[200px] sm:h-[240px] w-full"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    const isOther = data.type === otherLabel;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                        {isOther ? (
                          <div className="space-y-1">
                            <p className="font-medium">{otherLabel}</p>
                            {otherDetails.map((d) => (
                              <div key={d.type} className="flex items-center justify-between gap-4 text-xs">
                                <span className="text-muted-foreground">.{d.type}</span>
                                <span className="font-mono tabular-nums">{d.count}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-4">
                            <span>.{data.type}</span>
                            <span className="font-mono tabular-nums font-medium">{data.count}</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Pie
                  data={groupedUploadsByType}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  label={(entry) => entry.type === t("uploads.stats.labels.other") ? entry.type : `.${entry.type}`}
                  labelLine={{ strokeWidth: 1 }}
                  animationDuration={1200}
                >
                  {groupedUploadsByType.map((entry, index) => {
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
        <Card className={STAT_CARD}>
          <CardHeader className={STAT_CARD_HEADER}>
            <CardTitle className="text-sm sm:text-base font-semibold">
              {t("uploads.stats.charts.uploads_by_hour")}
            </CardTitle>
          </CardHeader>
          <CardContent className={STAT_CARD_CONTENT}>
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
      <Card className={cn("col-span-full", STAT_CARD)}>
        <CardHeader className={STAT_CARD_HEADER}>
          <CardTitle className="text-sm sm:text-base font-semibold">
            {t("uploads.stats.charts.uploads_by_weekday")}
          </CardTitle>
        </CardHeader>
        <CardContent className={STAT_CARD_CONTENT}>
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
      <Card className={cn("col-span-full", STAT_CARD)}>
        <CardHeader className={STAT_CARD_HEADER}>
          <CardTitle className="text-sm sm:text-base font-semibold">
            {t("uploads.stats.charts.size_distribution")}
          </CardTitle>
        </CardHeader>
        <CardContent className={STAT_CARD_CONTENT}>
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
    </div>
  );
}
