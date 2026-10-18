import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface SliderWithStopsProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  showStops?: boolean;
  step?: number;
  min?: number;
  max?: number;
  stopInterval?: number;
  /** Paliers marqués, à la place de ceux calculés depuis `stopInterval`. */
  stops?: number[];
  /** Libellé d'un palier : « 40 % », « Grasse »… */
  formatStop?: (value: number) => string;
  /** Valeur lue par un lecteur d'écran (« 7 jours ») quand le curseur porte un indice de palier. */
  valueText?: string;
}

/** Diamètre du curseur : Radix le garde dans la piste, son centre va de 8 px à la largeur moins 8 px. */
const THUMB = 16;

/**
 * Paliers sans erreur d'arrondi : 0,1 + 0,2 ne doit pas s'afficher
 * « 0.30000000000000004 ». On compte les paliers, puis on arrondit chacun.
 */
function computeStops(min: number, max: number, interval: number): number[] {
  if (!(interval > 0) || max <= min) return [min];
  const decimals = Math.max(0, ...[min, interval].map((value) => (String(value).split(".")[1] ?? "").length));
  const count = Math.floor((max - min) / interval + 1e-9);
  const stops = Array.from({ length: count + 1 }, (_, index) => Number((min + index * interval).toFixed(decimals)));
  if (stops[stops.length - 1] < max - 1e-9) stops.push(max);
  return stops;
}

const SliderWithStops = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderWithStopsProps
>(
  (
    {
      className,
      showStops = true,
      min = 0,
      max = 100,
      step = 1,
      stopInterval = step,
      stops: customStops,
      formatStop = (value) => String(value),
      valueText,
      ...props
    },
    ref
  ) => {
    const stops = React.useMemo(() => {
      if (!showStops) return [];
      return customStops ?? computeStops(min, max, stopInterval);
    }, [min, max, stopInterval, showStops, customStops]);

    return (
      <div data-slot="slider-with-stops" className={cn("relative", showStops && "pt-6")}>
        {showStops && (
          <div aria-hidden className="absolute inset-x-0 top-0 h-6">
            {stops.map((stop, index) => {
              const ratio = max > min ? (stop - min) / (max - min) : 0;
              const first = index === 0;
              const last = index === stops.length - 1;
              return (
                <span
                  key={stop}
                  className={cn(
                    "absolute top-0 flex flex-col text-[11px] leading-none text-muted-foreground tabular-nums whitespace-nowrap",
                    // Les libellés des bouts s'alignent sur le bord : ils ne sortent jamais du champ.
                    first ? "items-start" : last ? "items-end" : "-translate-x-1/2 items-center"
                  )}
                  style={
                    first
                      ? { left: 0 }
                      : last
                        ? { right: 0 }
                        : { left: `calc(${THUMB / 2}px + ${ratio} * (100% - ${THUMB}px))` }
                  }
                >
                  {formatStop(stop)}
                  <span className={cn("mt-1 h-1.5 w-px bg-muted-foreground/50", first && "ml-2", last && "mr-2")} />
                </span>
              );
            })}
          </div>
        )}
        <SliderPrimitive.Root
          ref={ref}
          min={min}
          max={max}
          step={step}
          className={cn(
            "relative flex w-full touch-none select-none items-center py-1 data-[disabled]:opacity-50",
            className
          )}
          {...props}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb aria-label={props["aria-label"]} aria-valuetext={valueText} className="block size-4 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50" />
        </SliderPrimitive.Root>
      </div>
    );
  }
);

SliderWithStops.displayName = "SliderWithStops";

export { SliderWithStops };
