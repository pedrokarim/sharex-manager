"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface BoundedNumberControlProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  ariaLabel?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BoundedNumberControl({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  ariaLabel,
}: BoundedNumberControlProps) {
  const safeValue =
    typeof value === "number" && Number.isFinite(value) ? value : min;
  const [localValue, setLocalValue] = useState(String(safeValue));

  useEffect(() => {
    setLocalValue(String(safeValue));
  }, [safeValue]);

  const commitValue = (nextValue: number) => {
    const boundedValue = clamp(nextValue, min, max);
    setLocalValue(String(boundedValue));
    onChange(boundedValue);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
        <Slider
          value={[safeValue]}
          min={min}
          max={max}
          step={step}
          aria-label={ariaLabel}
          onValueChange={([nextValue]) => commitValue(nextValue)}
        />

        <div className="flex items-center gap-2 sm:justify-end">
          <Input
            type="number"
            inputMode="decimal"
            value={localValue}
            min={min}
            max={max}
            step={step}
            aria-label={ariaLabel}
            className="bg-background text-sm"
            onChange={(event) => {
              const rawValue = event.target.value;
              setLocalValue(rawValue);

              const parsedValue = Number.parseFloat(rawValue.replace(",", "."));
              if (Number.isFinite(parsedValue)) {
                onChange(clamp(parsedValue, min, max));
              }
            }}
            onBlur={() => {
              const parsedValue = Number.parseFloat(
                localValue.replace(",", "."),
              );
              if (Number.isFinite(parsedValue)) {
                commitValue(parsedValue);
                return;
              }
              setLocalValue(String(safeValue));
            }}
          />
          {unit ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Min {min}
          {unit ? ` ${unit}` : ""}
        </span>
        <span>
          Max {max}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}
