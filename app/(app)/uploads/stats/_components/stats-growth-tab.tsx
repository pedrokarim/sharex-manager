"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  XAxis,
  YAxis,
  Area,
  Legend,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { StatsData, formatFileSize } from "./types";

const chartConfig = {
  newFiles: { label: "Nouveaux fichiers", color: "var(--chart-1)" },
  totalSize: { label: "Taille totale", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface StatsGrowthTabProps {
  stats: StatsData;
}

export function StatsGrowthTab({ stats }: StatsGrowthTabProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  return (
    <div className="grid gap-4 sm:gap-6">
      <Card className="col-span-full">
        <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
          <CardTitle className="text-sm sm:text-base font-semibold">
            {t("uploads.stats.charts.monthly_growth")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-2">
          <ChartContainer
            config={chartConfig}
            className="h-[200px] sm:h-[240px] w-full"
          >
            <AreaChart data={stats.monthlyGrowth}>
              <defs>
                <linearGradient id="fillNewFiles" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-newFiles)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-newFiles)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
                <linearGradient id="fillTotalSize" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-totalSize)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-totalSize)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-muted"
              />
              <XAxis
                dataKey="month"
                tickFormatter={(month) =>
                  format(new Date(month), "MMM yy", { locale })
                }
                tickLine={false}
                axisLine={false}
                className="text-xs"
              />
              <YAxis
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                width={35}
                className="text-xs"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={50}
                className="text-xs"
                tickFormatter={(value) => formatFileSize(value).split(" ")[0]}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      format(new Date(value), "MMMM yyyy", { locale })
                    }
                    formatter={(value, name) => {
                      if (name === "totalSize") {
                        return formatFileSize(value as number);
                      }
                      return value;
                    }}
                  />
                }
              />
              <Legend
                formatter={(value) =>
                  value === "newFiles"
                    ? t("uploads.stats.labels.new_files")
                    : t("uploads.stats.cards.total_size")
                }
                wrapperStyle={{ paddingTop: "0.5rem" }}
                iconType="circle"
                iconSize={8}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="newFiles"
                name="newFiles"
                stroke="var(--color-newFiles)"
                strokeWidth={2}
                fill="url(#fillNewFiles)"
                animationDuration={1200}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="totalSize"
                name="totalSize"
                stroke="var(--color-totalSize)"
                strokeWidth={2}
                fill="url(#fillTotalSize)"
                animationDuration={1200}
                animationBegin={300}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
