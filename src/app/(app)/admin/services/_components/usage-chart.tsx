"use client";

/**
 * Trente derniers jours d'un fournisseur en barres : les appels réussis et
 * les échecs empilés (on voit d'un coup d'œil un jour où tout a échoué), ou
 * la quantité consommée quand le fournisseur compte autre chose que des
 * appels (caractères, images…). Les jours vides restent sur l'axe : un trou
 * se lit comme un trou.
 */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { AiDailyUsage, AiUnit } from "@/lib/ai-usage/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNumber, unitWord } from "./format";

/** « 2026-10-12 » → date à midi, pour qu'aucun fuseau ne la fasse changer de jour. */
const dayDate = (day: string) => new Date(`${day}T12:00:00`);
const shortDay = (day: string) => dayDate(day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const longDay = (day: string) => dayDate(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);

const CALLS_CONFIG = {
  succeeded: { label: "Réussis", color: "var(--chart-1)" },
  failures: { label: "Échecs", color: "var(--destructive)" },
} satisfies ChartConfig;

export function UsageChart({ daily, unit }: { daily: AiDailyUsage[]; unit: AiUnit }) {
  const [view, setView] = useState<"calls" | "amount">("calls");
  const showAmount = view === "amount" && unit !== "calls";
  const data = useMemo(
    () =>
      daily.map((entry) => ({
        day: entry.day,
        succeeded: Math.max(0, entry.calls - entry.failures),
        failures: entry.failures,
        amount: entry.amount[unit] ?? 0,
      })),
    [daily, unit]
  );
  const totalCalls = daily.reduce((sum, entry) => sum + entry.calls, 0);
  const amountConfig = useMemo<ChartConfig>(() => ({ amount: { label: capitalize(unitWord(unit, 2)), color: "var(--chart-1)" } }), [unit]);
  const config: ChartConfig = showAmount ? amountConfig : CALLS_CONFIG;

  if (totalCalls === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Aucun appel ces trente derniers jours.</p>;
  }

  return (
    <div className="grid min-w-0 gap-2">
      {unit !== "calls" ? (
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(next) => next && setView(next as "calls" | "amount")} aria-label="Ce que montre le graphique" className="justify-self-start">
          <ToggleGroupItem value="calls" className="px-2.5">
            Appels
          </ToggleGroupItem>
          <ToggleGroupItem value="amount" className="px-2.5">
            {capitalize(unitWord(unit, 2))}
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}
      <ChartContainer config={config} className="aspect-auto h-44 w-full min-w-0" role="img" aria-label={showAmount ? `Quantité consommée par jour, en ${unitWord(unit, 2)}` : "Appels réussis et échecs par jour"}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} minTickGap={24} tickFormatter={shortDay} />
          <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={(value: number) => value.toLocaleString("fr-FR", { notation: "compact" })} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const day = payload?.[0]?.payload?.day as string | undefined;
                  return day ? longDay(day) : "";
                }}
                formatter={(value, name) => (
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                    <span className="font-medium tabular-nums">{formatNumber(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          {showAmount ? (
            <Bar dataKey="amount" fill="var(--color-amount)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ) : (
            <>
              <Bar dataKey="succeeded" stackId="calls" fill="var(--color-succeeded)" isAnimationActive={false} />
              <Bar dataKey="failures" stackId="calls" fill="var(--color-failures)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </>
          )}
        </BarChart>
      </ChartContainer>
      {!showAmount ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-(--chart-1)" aria-hidden />
            Réussis
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-destructive" aria-hidden />
            Échecs
          </span>
        </div>
      ) : null}
    </div>
  );
}
