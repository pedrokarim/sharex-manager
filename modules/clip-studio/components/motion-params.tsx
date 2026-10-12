"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MotionParamValues, MotionPreset } from "../engine/motion/types";
import { compactParams, paramOptions, paramValue, type LooseMotionParam } from "../lib/motion-catalog";

/** Curseur compact, dans le style de l'inspecteur. */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="flex min-w-0 items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-muted-foreground" title={label}>
          {label}
        </span>
        <span className="shrink-0 font-mono tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

/** Libellés des valeurs connues ; une valeur nouvelle s'affiche telle quelle. */
const OPTION_LABELS: Record<string, string> = {
  up: "Vers le haut",
  down: "Vers le bas",
  left: "Vers la gauche",
  right: "Vers la droite",
  start: "Du début",
  end: "De la fin",
  center: "Du centre",
  random: "Au hasard",
  whole: "Bloc",
  line: "Ligne",
  word: "Mot",
  char: "Lettre",
};

const DIRECTION_ICONS: Record<string, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
};

const formatNumber = (value: number, digits = 2) => value.toLocaleString("fr-FR", { maximumFractionDigits: digits });

/**
 * Réglages déclarés par un préréglage, dessinés d'après leur forme : une
 * plage numérique devient un curseur, une liste d'options des boutons (ou
 * une liste déroulante au-delà de quatre). Une forme que le moteur ajoutera
 * plus tard (ordre, unité de découpe…) s'affiche donc sans code nouveau.
 */
export function MotionParamsFields({
  preset,
  values,
  onChange,
}: {
  preset: MotionPreset;
  values: MotionParamValues | undefined;
  onChange: (values: MotionParamValues | undefined) => void;
}) {
  const params = (preset.params ?? []) as unknown as LooseMotionParam[];
  if (params.length === 0) return null;

  const set = (id: string, value: number | string) => onChange(compactParams(params, { ...(values ?? {}), [id]: value }));
  const changed = compactParams(params, values ?? {}) !== undefined;

  return (
    <div className="space-y-2.5">
      {params.map((param) => {
        const options = paramOptions(param);
        const current = paramValue(param, values);
        if (options) {
          const selected = typeof current === "string" ? current : options[0];
          if (options.length <= 4) {
            const icons = options.every((option) => option in DIRECTION_ICONS);
            return (
              <div key={param.id} className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={param.label}>
                  {param.label}
                </span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={selected}
                  onValueChange={(next) => next && set(param.id, next)}
                  aria-label={param.label}
                  className="shrink-0"
                >
                  {options.map((option) => {
                    const Icon = icons ? DIRECTION_ICONS[option] : null;
                    const label = OPTION_LABELS[option] ?? option;
                    return (
                      <ToggleGroupItem
                        key={option}
                        value={option}
                        aria-label={label}
                        title={label}
                        className={Icon ? "h-7 w-7 min-w-7 px-0" : "h-7 px-2 text-[11px]"}
                      >
                        {Icon ? <Icon className="h-3.5 w-3.5" /> : label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>
            );
          }
          return (
            <div key={param.id} className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-muted-foreground" title={param.label}>
                {param.label}
              </span>
              <Select value={selected} onValueChange={(next) => set(param.id, next)}>
                <SelectTrigger size="sm" className="w-36 shrink-0 text-xs" aria-label={param.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option} className="text-xs">
                      {OPTION_LABELS[option] ?? option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        if (typeof current === "number" && typeof param.min === "number" && typeof param.max === "number") {
          // Une intensité (0 à 2 autour de 1) se lit mieux en pourcentage.
          const percent = param.kind === "amount";
          return (
            <RangeField
              key={param.id}
              label={param.label}
              value={current}
              min={param.min}
              max={param.max}
              step={param.step ?? (param.max - param.min > 10 ? 1 : 0.05)}
              format={(value) => (percent ? `${Math.round(value * 100)} %` : formatNumber(value))}
              onChange={(value) => set(param.id, value)}
            />
          );
        }
        return null;
      })}
      {changed && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
          onClick={() => onChange(undefined)}
        >
          <RotateCcw className="h-3 w-3" />
          Réglages par défaut
        </Button>
      )}
    </div>
  );
}
