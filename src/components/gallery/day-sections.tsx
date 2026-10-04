"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";

import { formatDayLabel, groupByDay, packDaysIntoRows, type DayGroup } from "@/lib/gallery-days";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/files";

/** Attribut posé sur la grille des cartes : il sert à compter ses colonnes. */
export const GALLERY_GRID_ATTRIBUTE = "data-gallery-grid";

interface DaySectionsProps {
  files: FileInfo[];
  /** Éteint, le composant rend les fichiers d'un seul tenant. */
  enabled: boolean;
  /** Grille de cartes, ou liste d'une ligne par fichier. */
  layout: "grid" | "list";
  locale: string;
  isSelected: (fileName: string) => boolean;
  /** Sélectionne ou désélectionne tous les fichiers d'un jour. */
  onToggleDay: (files: FileInfo[]) => void;
  children: (files: FileInfo[]) => ReactNode;
}

/**
 * Les fichiers d'un mois, séparés par jour.
 *
 * En grille, les jours ne prennent pas chacun leurs lignes : ils se suivent
 * dans la même grille, sans case perdue, et plusieurs jours partagent une
 * rangée. L'étiquette d'un jour se pose au-dessus de sa première carte et
 * s'étend sur les cartes de ce jour dans la rangée. Un jour qui déborde
 * continue à la rangée suivante, sans répéter son étiquette.
 *
 * En liste, chaque fichier occupe déjà sa ligne : un jour est une section.
 */
export function DaySections({ files, enabled, layout, locale, isSelected, onToggleDay, children }: DaySectionsProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  // Nombre de colonnes de la grille : supposé au premier rendu, puis lu sur
  // la grille réelle, dont les colonnes dépendent de la largeur de l'écran.
  const [columns, setColumns] = useState(4);

  const days = useMemo(() => (enabled ? groupByDay(files, (file) => file.createdAt) : []), [enabled, files]);
  const rows = useMemo(() => packDaysIntoRows(days, columns), [days, columns]);
  const gridMode = enabled && layout === "grid";

  useLayoutEffect(() => {
    const element = container.current;
    if (!gridMode || !element) return;
    const measure = () => {
      const grid = element.querySelector(`[${GALLERY_GRID_ATTRIBUTE}]`);
      if (!grid) return;
      const count = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (count > 0) setColumns(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [gridMode, rows.length]);

  if (!enabled) return <>{children(files)}</>;

  const labels = { today: t("gallery.days.today"), yesterday: t("gallery.days.yesterday") };
  const heading = (day: DayGroup<FileInfo>) => (
    <DayHeading
      label={formatDayLabel(day.date, locale, labels)}
      count={day.items.length}
      selected={day.items.filter((file) => isSelected(file.name)).length}
      onToggle={() => onToggleDay(day.items)}
    />
  );

  if (layout === "list") {
    return (
      <div className="space-y-5">
        {days.map((day) => (
          <section key={`${day.key}-${day.items[0]?.name}`}>
            <div className="mb-2 px-2 sm:px-0">{heading(day)}</div>
            {children(day.items)}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div ref={container} className="flex flex-col gap-2 sm:gap-4">
      {rows.map((row) => (
        <div key={row.items[0]?.name}>
          {row.starts.length > 0 && (
            <div
              className="mb-1.5 grid gap-2 px-2 sm:gap-4 sm:px-0"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {row.starts.map((start) => (
                <div
                  key={start.day.key}
                  className="min-w-0"
                  style={{ gridColumn: `${start.column + 1} / span ${start.span}` }}
                >
                  {heading(start.day)}
                </div>
              ))}
            </div>
          )}
          {children(row.items)}
        </div>
      ))}
    </div>
  );
}

interface DayHeadingProps {
  label: string;
  count: number;
  selected: number;
  onToggle: () => void;
}

/** Titre d'un jour : sa date, son nombre de fichiers, et de quoi le sélectionner d'un geste. */
function DayHeading({ label, count, selected, onToggle }: DayHeadingProps) {
  const { t } = useTranslation();
  const allSelected = selected === count;
  const action = allSelected ? t("gallery.days.deselect_day") : t("gallery.days.select_day");

  return (
    <div className="group/day flex min-w-0 items-center gap-1.5" title={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${action} ${label}`}
        title={action}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-[width,opacity,margin]",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          selected > 0
            ? "border-primary bg-primary text-primary-foreground"
            : // Au repos, le bouton ne prend aucune place : la date reste alignée sur sa carte.
              "-mr-1.5 w-0 border-border text-muted-foreground opacity-0 group-hover/day:mr-0 group-hover/day:w-[18px] group-hover/day:opacity-100 focus-visible:mr-0 focus-visible:w-[18px]",
        )}
      >
        {selected > 0 && !allSelected ? <Minus className="size-3" /> : <Check className="size-3" />}
      </button>
      <h3 className="truncate text-sm font-medium leading-5 first-letter:uppercase">{label}</h3>
      {/* Le nombre de fichiers du jour : une pastille, de la hauteur de la ligne, centrée sur elle. */}
      {count > 1 && (
        <span
          title={t("gallery.highlights.files", { count })}
          aria-label={t("gallery.highlights.files", { count })}
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold leading-none tabular-nums text-foreground/80"
        >
          {count}
        </span>
      )}
    </div>
  );
}
