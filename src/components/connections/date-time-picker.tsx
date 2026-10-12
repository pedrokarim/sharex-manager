"use client";

/**
 * Choix d'une date et d'une heure de publication : un jour sur le calendrier,
 * une heure dans la colonne des quarts d'heure (ou à la minute près), et
 * trois raccourcis pour les cas courants. Jamais une date tapée à la main ;
 * le fuseau est rappelé, pour qu'une programmation ne se décale pas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { fr } from "react-day-picker/locale";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const QUARTER = 15 * 60_000;
const SLOTS = Array.from({ length: 96 }, (_, index) => ({ hours: Math.floor(index / 4), minutes: (index % 4) * 15 }));
const pad = (value: number) => String(value).padStart(2, "0");

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const at = (day: Date, hours: number, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);

/** « mar. 14 oct. 2026 à 18:00 ». */
export function formatSchedule(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${day} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Fuseau du navigateur, rappelé sous le choix (« Europe/Paris »). */
function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "heure locale";
  }
}

export interface DateTimePickerProps {
  /** Instant choisi, en ISO ; vide : aucun. */
  value: string;
  onChange: (value: string) => void;
  /** Premier instant permis (par défaut : dans deux minutes). */
  min?: Date;
  /** Dernier instant permis. */
  max?: Date;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Bouton pour retirer la date. */
  clearable?: boolean;
  "aria-label"?: string;
  /** Calendrier et heures affichés directement, sans bouton ni fenêtre surgissante. */
  inline?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Choisir une date et une heure",
  disabled,
  id,
  className,
  clearable = true,
  "aria-label": ariaLabel,
  inline = false,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : null;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : null;
  // Le minimum est recalculé à l'ouverture : une fenêtre restée ouverte ne propose pas une heure passée.
  const [now, setNow] = useState(() => Date.now());
  const floor = useMemo(() => min ?? new Date(now + 2 * 60_000), [min, now]);
  const [day, setDay] = useState<Date>(() => startOfDay(valid ?? floor));
  const [month, setMonth] = useState<Date>(day);
  const list = useRef<HTMLDivElement>(null);

  const active = open || inline;
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const shown = startOfDay(valid ?? floor);
    setDay(shown);
    setMonth(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement à l'ouverture
  }, [active]);

  // L'heure choisie (ou la première permise) est amenée dans la colonne.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      const target =
        list.current?.querySelector<HTMLElement>("[data-selected=true]") ??
        list.current?.querySelector<HTMLElement>("[data-near=true]") ??
        list.current?.querySelector<HTMLElement>("button:not(:disabled)");
      target?.scrollIntoView({ block: "center" });
    }, 30);
    return () => clearTimeout(timer);
  }, [active, day, value]);

  const allowed = (date: Date) => date.getTime() >= floor.getTime() && (!max || date.getTime() <= max.getTime());

  const choose = (date: Date) => {
    if (!allowed(date)) return;
    onChange(date.toISOString());
  };

  const pickDay = (next: Date | undefined) => {
    if (!next) return;
    setDay(next);
    setMonth(next);
    // On garde l'heure déjà choisie ; sinon la première permise de la journée, au plus tôt 9 h.
    const hours = valid?.getHours() ?? 9;
    const minutes = valid?.getMinutes() ?? 0;
    let candidate = at(next, hours, minutes);
    if (!allowed(candidate)) {
      const slot = SLOTS.map((entry) => at(next, entry.hours, entry.minutes)).find(allowed);
      if (!slot) return;
      candidate = slot;
    }
    choose(candidate);
  };

  const presets = useMemo(() => {
    const base = new Date(now);
    const inAnHour = new Date(Math.ceil((now + 60 * 60_000) / QUARTER) * QUARTER);
    const tomorrow = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    return [
      { label: "Dans 1 h", date: inAnHour },
      { label: "Demain 9 h", date: at(tomorrow, 9, 0) },
      { label: "Demain 18 h", date: at(tomorrow, 18, 0) },
    ].filter((preset) => allowed(preset.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépend de l'instant d'ouverture
  }, [now, floor, max]);

  const panel = (
    <>
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b p-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={valid && valid.getTime() === preset.date.getTime() ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setDay(startOfDay(preset.date));
                    setMonth(startOfDay(preset.date));
                    choose(preset.date);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row">
            <Calendar
              mode="single"
              locale={fr}
              selected={valid ?? undefined}
              onSelect={pickDay}
              month={month}
              onMonthChange={setMonth}
              disabled={[{ before: startOfDay(floor) }, ...(max ? [{ after: max }] : [])]}
              startMonth={startOfDay(floor)}
              endMonth={max}
              className="p-2"
            />
            <div className="flex flex-col border-t sm:w-32 sm:border-t-0 sm:border-l">
              <div
                ref={list}
                role="listbox"
                aria-label="Heure"
                className="grid max-h-28 grid-cols-4 gap-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[17.5rem] sm:grid-cols-1"
              >
                {SLOTS.map((slot) => {
                  const date = at(day, slot.hours, slot.minutes);
                  const isSelected = Boolean(valid && valid.getTime() === date.getTime());
                  // Heure choisie à la minute près : le quart d'heure qui la contient sert de repère.
                  const isNear = Boolean(valid && !isSelected && sameDay(valid, day) && Math.floor((valid.getHours() * 60 + valid.getMinutes()) / 15) === slot.hours * 4 + slot.minutes / 15);
                  return (
                    <button
                      key={`${slot.hours}:${slot.minutes}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      data-near={isNear}
                      disabled={!allowed(date)}
                      onClick={() => choose(date)}
                      className={cn(
                        "rounded-md px-2 py-1 text-center text-sm tabular-nums transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-35",
                        isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                        isNear && "ring-1 ring-primary/60"
                      )}
                    >
                      {pad(slot.hours)}:{pad(slot.minutes)}
                    </button>
                  );
                })}
              </div>
              <label className="grid gap-1 border-t p-2 text-xs text-muted-foreground">
                À la minute près
                <Input
                  type="time"
                  className="h-8"
                  value={valid && sameDay(valid, day) ? `${pad(valid.getHours())}:${pad(valid.getMinutes())}` : ""}
                  onChange={(event) => {
                    const [hours, minutes] = event.target.value.split(":").map(Number);
                    if (Number.isFinite(hours) && Number.isFinite(minutes)) choose(at(day, hours, minutes));
                  }}
                />
              </label>
            </div>
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {valid ? `${formatSchedule(valid)}, ` : ""}heure de {timeZoneName()}
          </p>
    </>
  );

  // Dans une fenêtre dont c'est le seul objet (programmer une publication), le calendrier est posé à plat : un clic de moins.
  if (inline) {
    return <div className={cn("w-fit max-w-full overflow-hidden rounded-md border", className)}>{panel}</div>;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn("h-9 min-w-0 flex-1 justify-start gap-2 font-normal", !valid && "text-muted-foreground")}
          >
            <CalendarClock className="size-4 shrink-0" />
            <span className="truncate">{valid ? formatSchedule(valid) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={8} className="max-h-(--radix-popover-content-available-height) w-auto max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain p-0">
          {panel}
        </PopoverContent>
      </Popover>
      {clearable && valid && !disabled ? (
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Retirer la date" onClick={() => onChange("")}>
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
