"use client";

import type { ReactNode } from "react";
import { useAtom } from "jotai";
import { useQueryState } from "nuqs";
import { ArrowDown, ArrowUp, Grid2X2, LayoutList, List, SlidersHorizontal } from "lucide-react";
import {
  autoRefreshIntervalAtom,
  galleryViewModeAtom,
  sortByAtom,
  sortOrderAtom,
} from "@/lib/atoms/preferences";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangeFilter } from "@/components/gallery/date-range-filter";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ViewMode = "grid" | "list" | "details";
type SortBy = "name" | "date" | "size";

const REFRESH_INTERVALS = [0, 5, 10, 15, 30];

function Segment<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
            option.value === value
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Vue, tri, période et actualisation de la galerie, rangés derrière un seul
 * bouton : ce sont des réglages qu'on pose une fois, pas des actions. Le
 * bouton signale d'un point qu'un filtre de période est actif.
 */
export function GalleryDisplayMenu() {
  const { t } = useTranslation();
  const [defaultView, setDefaultView] = useAtom(galleryViewModeAtom);
  const [view, setView] = useQueryState<ViewMode>("view", {
    defaultValue: defaultView,
    parse: (value): ViewMode => (value === "grid" || value === "list" || value === "details" ? value : defaultView),
  });
  const [sortBy, setSortBy] = useAtom(sortByAtom);
  const [sortOrder, setSortOrder] = useAtom(sortOrderAtom);
  const [refresh, setRefresh] = useAtom(autoRefreshIntervalAtom);
  const [startDate] = useQueryState("start");
  const [endDate] = useQueryState("end");
  const hasFilter = Boolean(startDate || endDate);

  const orderLabel =
    sortBy === "date"
      ? sortOrder === "desc"
        ? t("gallery.display.newest_first")
        : t("gallery.display.oldest_first")
      : sortBy === "name"
        ? sortOrder === "asc"
          ? t("gallery.display.a_to_z")
          : t("gallery.display.z_to_a")
        : sortOrder === "desc"
          ? t("gallery.display.largest_first")
          : t("gallery.display.smallest_first");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative h-9 gap-2 rounded-xl px-3 text-xs sm:text-sm">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">{t("gallery.display.button")}</span>
          {hasFilter && (
            <span
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-primary"
              aria-label={t("gallery.display.filter_active")}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        <Row label={t("gallery.display.view")}>
          <Segment<ViewMode>
            value={view}
            onChange={(next) => {
              void setView(next);
              setDefaultView(next);
            }}
            options={[
              { value: "grid", label: <><Grid2X2 className="h-3.5 w-3.5" />{t("gallery.view_modes.grid")}</> },
              { value: "list", label: <><List className="h-3.5 w-3.5" />{t("gallery.view_modes.list")}</> },
              { value: "details", label: <><LayoutList className="h-3.5 w-3.5" />{t("gallery.view_modes.details")}</> },
            ]}
          />
        </Row>

        <Row label={t("gallery.display.sort")}>
          <Segment<SortBy>
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "date", label: t("gallery.sort.date") },
              { value: "name", label: t("gallery.sort.name") },
              { value: "size", label: t("gallery.sort.size") },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-start gap-2 px-2 text-xs"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          >
            {sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {orderLabel}
          </Button>
        </Row>

        <Row label={t("gallery.display.period")}>
          <div className="flex items-center gap-2">
            <DateRangeFilter />
            {!hasFilter && <span className="text-xs text-muted-foreground">{t("gallery.display.period_all")}</span>}
          </div>
        </Row>

        <Row label={t("gallery.display.auto_refresh")}>
          <Segment<number>
            value={REFRESH_INTERVALS.includes(refresh) ? refresh : 0}
            onChange={setRefresh}
            options={REFRESH_INTERVALS.map((seconds) => ({
              value: seconds,
              label: seconds === 0 ? t("gallery.display.refresh_off") : `${seconds} s`,
            }))}
          />
        </Row>
      </PopoverContent>
    </Popover>
  );
}
