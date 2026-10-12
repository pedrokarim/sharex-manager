"use client";

/**
 * Consommation d'un quota, compartiment par compartiment, sur une échelle
 * commune en pourcentage de la limite : « 100 envois » et « 10 000 unités »
 * se comparent d'un coup d'œil. La valeur exacte est écrite au bout de
 * chaque barre ; la couleur passe à l'orange à 80 %, au rouge à 100 %.
 */

import { Bar, BarChart, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";

export interface QuotaBar {
  id: string;
  label: string;
  used: number;
  limit: number;
}

const config = { share: { label: "Part utilisée", color: "var(--chart-2)" } } satisfies ChartConfig;

function tone(share: number) {
  if (share >= 100) return "var(--destructive)";
  if (share >= 80) return "oklch(0.77 0.16 70)";
  return "var(--color-share)";
}

export function QuotaChart({ buckets, label }: { buckets: QuotaBar[]; label: string }) {
  const data = buckets.map((bucket) => ({
    ...bucket,
    share: bucket.limit > 0 ? Math.min(100, (bucket.used / bucket.limit) * 100) : 0,
    text: `${bucket.used.toLocaleString("fr-FR")} / ${bucket.limit.toLocaleString("fr-FR")}`,
  }));
  return (
    <figure className="grid min-w-0 gap-1" aria-label={label}>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(72, data.length * 44 + 28) }}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value: number) => `${value} %`} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            type="category"
            dataKey="label"
            width={128}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            tickFormatter={(value: string) => (value.length > 20 ? `${value.slice(0, 19)}…` : value)}
          />
          <ReferenceLine x={100} stroke="var(--border)" strokeDasharray="3 3" />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              const entry = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!entry) return null;
              return (
                <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <span className="font-medium">{entry.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {entry.text} ({Math.round(entry.share)} %)
                  </span>
                </div>
              );
            }}
          />
          <Bar dataKey="share" radius={4} background={{ fill: "var(--muted)", radius: 4 }} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.id} fill={tone(entry.share)} />
            ))}
            <LabelList
              dataKey="text"
              content={(props) => {
                const { x, y, width, height, value, index } = props as { x: number; y: number; width: number; height: number; value: string; index: number };
                const share = data[index]?.share ?? 0;
                // Dans la barre quand elle a la place, juste après sinon : le texte ne déborde jamais du graphique.
                const inside = width > String(value).length * 7 + 16;
                return (
                  <text
                    x={inside ? x + width - 8 : x + width + 8}
                    y={y + height / 2}
                    dominantBaseline="central"
                    textAnchor={inside ? "end" : "start"}
                    fontSize={12}
                    className={inside ? (share >= 80 && share < 100 ? "fill-neutral-950" : "fill-white") : "fill-foreground"}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {value}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </figure>
  );
}
