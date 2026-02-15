"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  XAxis,
  YAxis,
  Bar,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useTranslation } from "@/lib/i18n";
import { formatFileSize } from "./types";
import type { TopIPEntry } from "@/lib/types/geo";

const chartConfig = {
  count: { label: "Uploads", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Country code to flag emoji
function countryFlag(countryCode: string): string {
  if (!countryCode || countryCode === "XX") return "";
  return countryCode
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function maskIP(ip: string): string {
  // Show first two octets, mask the rest
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6 or other formats: show abbreviated
  return ip.length > 12 ? ip.substring(0, 12) + "..." : ip;
}

interface TopIpsChartProps {
  topIps: TopIPEntry[];
}

export function TopIpsChart({ topIps }: TopIpsChartProps) {
  const { t } = useTranslation();

  const chartData = topIps.slice(0, 10).map((entry) => ({
    ip: maskIP(entry.ip),
    count: entry.count,
    city: entry.geo?.city || "-",
    country: entry.geo?.country || "-",
    flag: entry.geo ? countryFlag(entry.geo.countryCode) : "",
    totalSize: entry.totalSize,
  }));

  return (
    <div className="grid gap-4 sm:gap-6">
      {/* Bar chart horizontal */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
          <CardTitle className="text-sm sm:text-base font-semibold">
            {t("uploads.stats.network.top_ips_chart")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <ChartContainer
            config={chartConfig}
            className="h-[280px] sm:h-[340px] w-full"
          >
            <BarChart data={chartData} layout="vertical">
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
                dataKey="ip"
                type="category"
                tickLine={false}
                axisLine={false}
                width={100}
                className="text-xs"
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[0, 4, 4, 0]}
                animationDuration={1200}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Table détaillée */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
          <CardTitle className="text-sm sm:text-base font-semibold">
            {t("uploads.stats.network.top_ips_table")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    IP
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    {t("uploads.stats.network.location")}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                    {t("uploads.stats.labels.count")}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                    {t("uploads.stats.labels.size")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topIps.slice(0, 10).map((entry, index) => (
                  <tr
                    key={entry.ip}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {maskIP(entry.ip)}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.geo ? (
                        <span>
                          {countryFlag(entry.geo.countryCode)}{" "}
                          {entry.geo.city !== "Local"
                            ? `${entry.geo.city}, ${entry.geo.country}`
                            : t("uploads.stats.network.private_network")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {entry.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatFileSize(entry.totalSize)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
