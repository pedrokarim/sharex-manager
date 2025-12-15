"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { format } from "date-fns";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";

const chartConfig = {
  uploads: {
    label: "Uploads",
  },
  api: {
    label: "Via API",
    color: "hsl(var(--chart-1))",
  },
  web: {
    label: "Via Web",
    color: "hsl(var(--chart-2))",
  },
  total: {
    label: "Total",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

interface UploadsChartInteractiveProps {
  data: {
    date: string;
    api: number;
    web: number;
    total: number;
  }[];
}

export function UploadsChartInteractive({
  data,
}: UploadsChartInteractiveProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("30d");
  const [activeView, setActiveView] = React.useState<
    "api" | "web" | "total" | null
  >(null);

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const filteredData = React.useMemo(() => {
    const now = new Date();
    let daysToSubtract = 90;

    if (timeRange === "30d") {
      daysToSubtract = 30;
    } else if (timeRange === "7d") {
      daysToSubtract = 7;
    }

    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysToSubtract);

    return data.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= startDate;
    });
  }, [data, timeRange]);

  const getFilteredData = () => {
    if (activeView === "api") {
      return filteredData.map((item) => ({ ...item, web: 0, total: item.api }));
    } else if (activeView === "web") {
      return filteredData.map((item) => ({ ...item, api: 0, total: item.web }));
    }
    return filteredData;
  };

  const displayData = getFilteredData();

  const totalUploads = displayData.reduce((sum, item) => sum + item.total, 0);
  const avgUploadsPerDay =
    displayData.length > 0
      ? (totalUploads / displayData.length).toFixed(1)
      : "0";

  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardTitle>{t("uploads.stats.charts.uploads_by_day")}</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            {t("uploads.stats.charts.total_uploads_period", {
              period:
                timeRange === "90d"
                  ? "3 mois"
                  : timeRange === "30d"
                  ? "30 jours"
                  : "7 jours",
            })}
          </span>
          <span className="@[540px]/card:hidden">
            {timeRange === "90d"
              ? "3 mois"
              : timeRange === "30d"
              ? "30 j"
              : "7 j"}
          </span>
        </CardDescription>
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={activeView || "all"}
            onValueChange={(value) =>
              setActiveView(
                value === "all" ? null : (value as "api" | "web" | "total")
              )
            }
            variant="outline"
            className="@[767px]/card:flex hidden"
          >
            <ToggleGroupItem value="all" className="h-8 px-2.5">
              {t("uploads.stats.labels.all")}
            </ToggleGroupItem>
            <ToggleGroupItem value="api" className="h-8 px-2.5">
              {t("uploads.stats.labels.api")}
            </ToggleGroupItem>
            <ToggleGroupItem value="web" className="h-8 px-2.5">
              {t("uploads.stats.labels.web")}
            </ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="@[767px]/card:hidden flex w-32"
              aria-label="Select time range"
            >
              <SelectValue
                placeholder={t("uploads.stats.labels.last_30_days")}
              />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                {t("uploads.stats.labels.last_3_months")}
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                {t("uploads.stats.labels.last_30_days")}
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                {t("uploads.stats.labels.last_7_days")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-4 flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {t("uploads.stats.labels.total_uploads")}:{" "}
            <span className="font-medium">{totalUploads.toLocaleString()}</span>
          </div>
          <div className="text-muted-foreground">
            {t("uploads.stats.labels.average_per_day")}:{" "}
            <span className="font-medium">{avgUploadsPerDay}</span>
          </div>
        </div>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={displayData}>
            <defs>
              <linearGradient id="fillApi" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-api)"
                  stopOpacity={1.0}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-api)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillWeb" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-web)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-web)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-total)"
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-total)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return format(date, "dd MMM", { locale });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return format(new Date(value), "dd MMMM yyyy", { locale });
                  }}
                  indicator="dot"
                />
              }
            />
            {(activeView === null || activeView === "web") && (
              <Area
                dataKey="web"
                type="natural"
                fill="url(#fillWeb)"
                stroke="var(--color-web)"
                stackId="a"
              />
            )}
            {(activeView === null || activeView === "api") && (
              <Area
                dataKey="api"
                type="natural"
                fill="url(#fillApi)"
                stroke="var(--color-api)"
                stackId="a"
              />
            )}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
