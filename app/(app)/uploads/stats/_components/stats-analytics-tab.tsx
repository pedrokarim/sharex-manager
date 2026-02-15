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

  return (
    <div className="grid gap-4 sm:gap-6">
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
    </div>
  );
}
