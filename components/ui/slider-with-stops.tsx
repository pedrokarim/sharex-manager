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
      ...props
    },
    ref
  ) => {
    const stops = React.useMemo(() => {
      if (!showStops) return [];
      const stops = [];
      for (let i = min; i <= max; i += stopInterval) {
        stops.push(i);
      }
      return stops;
    }, [min, max, stopInterval, showStops]);

    return (
      <div className="relative pt-6">
        {showStops && (
          <div
            className="absolute w-full flex justify-between px-2 -top-1"
            style={{
              transform: "translateY(-100%)",
            }}
          >
            {stops.map((stop) => (
              <div
                key={stop}
                className="flex flex-col items-center"
                style={{
                  width: "20px",
                  marginLeft: stop === min ? "-10px" : 0,
                  marginRight: stop === max ? "-10px" : 0,
                }}
              >
                <span className="text-xs text-muted-foreground mb-2">
                  {stop}
                </span>
                <div className="w-0.5 h-1.5 bg-muted-foreground/50" />
              </div>
            ))}
          </div>
        )}
        <SliderPrimitive.Root
          ref={ref}
          min={min}
          max={max}
          step={step}
          className={cn(
            "relative flex w-full touch-none select-none items-center",
            className
          )}
          {...props}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
        </SliderPrimitive.Root>
      </div>
    );
  }
);

SliderWithStops.displayName = "SliderWithStops";

export { SliderWithStops };
