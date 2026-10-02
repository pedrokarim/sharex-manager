"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { CalendarIcon, Search, X, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { cn } from "@/lib/utils";

/**
 * Barre de filtres condensée, commune à toutes les listes du back-office.
 *
 * Une seule ligne, sans encadré ni titre : la recherche, puis des filtres
 * compacts, puis les actions de la liste à droite. Un filtre qui s'écarte de
 * sa valeur par défaut se teinte, et un bouton « Réinitialiser » apparaît.
 * Rien ne s'empile : sur un écran étroit, la ligne passe simplement à la ligne.
 *
 *   <FilterBar onReset={reset} actions={<Button>…</Button>}>
 *     <FilterSearch value={q} onChange={setQ} placeholder="Rechercher…" />
 *     <FilterSelect value={role} onChange={setRole} options={roles} />
 *     <FilterDateRange start={start} end={end} onChange={setRange} />
 *   </FilterBar>
 */

/** Hauteur et forme partagées par tous les éléments de la barre. */
const CONTROL = "h-8 rounded-lg text-sm";
/** Teinte d'un filtre actif : on voit d'un coup d'œil ce qui restreint la liste. */
const ACTIVE = "border-primary/50 bg-primary/10 text-foreground";

interface FilterBarProps {
  children: ReactNode;
  /** Actions de la liste (exporter, vider…), calées à droite. */
  actions?: ReactNode;
  /** Remet tous les filtres à zéro. Le bouton n'apparaît que si `onReset` est fourni. */
  onReset?: (() => void) | null;
  className?: string;
}

export function FilterBar({ children, actions, onReset, className }: FilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} role="search">
      {children}
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset} className={cn(CONTROL, "gap-1.5 px-2 text-muted-foreground")}>
          <X className="size-3.5" />
          {t("common.reset")}
        </Button>
      ) : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface FilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function FilterSearch({ value, onChange, placeholder, className }: FilterSearchProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("common.search")}
        aria-label={placeholder ?? t("common.search")}
        className={cn(CONTROL, "pl-8", value && ACTIVE)}
      />
    </div>
  );
}

interface FilterSelectProps<Value extends string> {
  value: Value;
  onChange: (value: Value) => void;
  options: { value: Value; label: string }[];
  /** Valeur qui ne filtre rien : avec elle, le filtre n'est pas teinté. */
  neutral?: Value;
  /** Nom du filtre, pour les lecteurs d'écran. */
  label: string;
  icon?: LucideIcon;
}

export function FilterSelect<Value extends string>({
  value,
  onChange,
  options,
  neutral = "all" as Value,
  label,
  icon: Icon,
}: FilterSelectProps<Value>) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Value)}>
      <SelectTrigger size="sm" aria-label={label} className={cn(CONTROL, "gap-1.5 px-2.5", value !== neutral && ACTIVE)}>
        {Icon ? <Icon className="size-3.5" /> : null}
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-sm">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface FilterDateRangeProps {
  /** Dates au format ISO, ou `null`. */
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
}

/** Une période en un seul bouton : un calendrier à deux mois, au lieu de deux champs. */
export function FilterDateRange({ start, end, onChange }: FilterDateRangeProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const active = Boolean(start || end);
  const day = (iso: string) => format(new Date(iso), "dd/MM/yy", { locale });

  const label = start && end
    ? `${day(start)} – ${day(end)}`
    : start
      ? `${t("gallery.date_filter.from")} ${day(start)}`
      : end
        ? `${t("gallery.date_filter.until")} ${day(end)}`
        : t("common.period");

  return (
    <div className="flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(CONTROL, "gap-1.5 px-2.5 font-normal", active && cn(ACTIVE, "rounded-r-none border-r-0"))}
          >
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            locale={locale}
            defaultMonth={start ? new Date(start) : undefined}
            selected={{ from: start ? new Date(start) : undefined, to: end ? new Date(end) : undefined }}
            onSelect={(range) => onChange(range?.from?.toISOString() ?? null, range?.to?.toISOString() ?? null)}
          />
        </PopoverContent>
      </Popover>
      {active ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(null, null)}
          aria-label={t("gallery.date_filter.reset")}
          className={cn(CONTROL, ACTIVE, "rounded-l-none px-1.5")}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
