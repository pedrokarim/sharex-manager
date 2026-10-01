"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { monthName, yearOf, type TimelineMonth } from "@/lib/timeline";
import { cn } from "@/lib/utils";

export interface TimelinePickerLabels {
  title: string;
  description: string;
  /** « Ouvrir {year} » : aller au début de l'année choisie. */
  openYear: (year: number) => string;
  /** « {count} fichiers » */
  count: (count: number) => string;
}

export const TIMELINE_PICKER_LABELS_FR: TimelinePickerLabels = {
  title: "Aller à une date",
  description: "Choisissez une année, puis un mois si vous voulez être plus précis.",
  openYear: (year) => `Ouvrir ${year}`,
  count: (count) => `${count.toLocaleString("fr-FR")} ${count > 1 ? "fichiers" : "fichier"}`,
};

interface TimelinePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mois de la galerie, dans l'ordre d'affichage. */
  months: TimelineMonth[];
  /** Mois mis en avant à l'ouverture (« 2026-09 ») : celui du séparateur cliqué. */
  currentKey?: string | null;
  onPick: (monthKey: string) => void;
  locale?: string;
  labels?: TimelinePickerLabels;
}

/**
 * Saut à une date : les années de la galerie, puis les douze mois de l'année
 * choisie. Seuls les mois qui contiennent quelque chose sont cliquables.
 */
export function TimelinePicker({
  open,
  onOpenChange,
  months,
  currentKey,
  onPick,
  locale = "fr",
  labels = TIMELINE_PICKER_LABELS_FR,
}: TimelinePickerProps) {
  // Années dans l'ordre d'affichage, avec leur total et leur premier mois affiché.
  const years = useMemo(() => {
    const byYear = new Map<number, { year: number; count: number; firstKey: string }>();
    for (const month of months) {
      const year = yearOf(month.key);
      const entry = byYear.get(year);
      if (entry) entry.count += month.count;
      else byYear.set(year, { year, count: month.count, firstKey: month.key });
    }
    return Array.from(byYear.values());
  }, [months]);

  const counts = useMemo(() => new Map(months.map((month) => [month.key, month.count])), [months]);

  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    setYear(currentKey ? yearOf(currentKey) : years[0]?.year ?? null);
  }, [open, currentKey, years]);

  const selected = years.find((entry) => entry.year === year) ?? years[0];

  const pick = (key: string) => {
    onPick(key);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div
              role="listbox"
              aria-label={labels.title}
              className="flex max-h-72 shrink-0 gap-1 overflow-auto sm:w-36 sm:flex-col sm:pr-1"
            >
              {years.map((entry) => (
                <button
                  key={entry.year}
                  type="button"
                  role="option"
                  aria-selected={entry.year === selected.year}
                  onClick={() => setYear(entry.year)}
                  onDoubleClick={() => pick(entry.firstKey)}
                  className={cn(
                    "flex shrink-0 items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    entry.year === selected.year
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="font-semibold tabular-nums">{entry.year}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      entry.year === selected.year ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {entry.count.toLocaleString(locale)}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {Array.from({ length: 12 }, (_, index) => {
                  const key = `${selected.year}-${String(index + 1).padStart(2, "0")}`;
                  const count = counts.get(key) ?? 0;
                  const isCurrent = key === currentKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={count === 0}
                      onClick={() => pick(key)}
                      aria-current={isCurrent ? "date" : undefined}
                      title={count > 0 ? labels.count(count) : undefined}
                      className={cn(
                        "flex flex-col items-center rounded-md border px-2 py-2 text-sm transition-colors",
                        count === 0
                          ? "cursor-default border-transparent text-muted-foreground/40"
                          : "hover:border-primary/50 hover:bg-muted",
                        isCurrent && "border-primary bg-primary/10 font-medium text-primary"
                      )}
                    >
                      <span className="capitalize">{monthName(index, "short", locale)}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {count > 0 ? count.toLocaleString(locale) : "–"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" className="self-end" onClick={() => pick(selected.firstKey)}>
                {labels.openYear(selected.year)}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
