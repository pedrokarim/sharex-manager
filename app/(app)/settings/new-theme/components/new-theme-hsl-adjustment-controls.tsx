"use client";

import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import NewThemeSliderWithInput from "./new-theme-slider-with-input";

// Preset HSL adjustment values
const HSL_PRESETS = [
  // Hue Adjustments
  { label: "Hue (-120°)", hueShift: -120, saturationScale: 1, lightnessScale: 1 },
  { label: "Hue (-60°)", hueShift: -60, saturationScale: 1, lightnessScale: 1 },
  { label: "Hue (+60°)", hueShift: 60, saturationScale: 1, lightnessScale: 1 },
  { label: "Hue (+120°)", hueShift: 120, saturationScale: 1, lightnessScale: 1 },
  { label: "Hue Invert", hueShift: 180, saturationScale: 1, lightnessScale: 1 },

  // Saturation Adjustments
  { label: "Grayscale", hueShift: 0, saturationScale: 0, lightnessScale: 1 },
  { label: "Muted", hueShift: 0, saturationScale: 0.6, lightnessScale: 1 },
  { label: "Vibrant", hueShift: 0, saturationScale: 1.4, lightnessScale: 1 },

  // Lightness Adjustments
  { label: "Dimmer", hueShift: 0, saturationScale: 1, lightnessScale: 0.8 },
  { label: "Brighter", hueShift: 0, saturationScale: 1, lightnessScale: 1.2 },

  // Combined Adjustments
  { label: "H(+30) S(-50) L(-5%)", hueShift: 30, saturationScale: 0.5, lightnessScale: 0.95 },
  { label: "H(-20) S(+20) L(+5%)", hueShift: -20, saturationScale: 1.2, lightnessScale: 1.05 },
  { label: "H(+20) S(-30) L(-5%)", hueShift: 20, saturationScale: 0.7, lightnessScale: 0.95 },
  { label: "H(-10) S(-25) L(+10%)", hueShift: -10, saturationScale: 0.75, lightnessScale: 1.1 },
  { label: "H(+60) S(+50) L(+10%)", hueShift: 60, saturationScale: 1.5, lightnessScale: 1.1 },
];

// Adjusts a color by modifying HSL values
function adjustColorByHsl(
  color: string,
  hueShift: number,
  saturationScale: number,
  lightnessScale: number
): string {
  // Simple HSL adjustment using CSS filters as fallback
  // In a real implementation, you'd use a library like culori
  return color; // For now, return the original color
}

interface NewThemeHslAdjustmentControlsProps {
  currentStyles: any;
  updateStyle: <K extends keyof any>(key: K, value: any[K]) => void;
}

const NewThemeHslAdjustmentControls: React.FC<NewThemeHslAdjustmentControlsProps> = ({
  currentStyles,
  updateStyle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hslAdjustments, setHslAdjustments] = useState({
    hueShift: 0,
    saturationScale: 1,
    lightnessScale: 1,
  });

  const handleHslChange = useCallback(
    (property: keyof typeof hslAdjustments, value: number) => {
      const newAdjustments = { ...hslAdjustments, [property]: value };
      setHslAdjustments(newAdjustments);

      // Apply adjustments to colors
      // This is a simplified version - in the real tweakcn, it applies to all color variables
      Object.keys(currentStyles).forEach((key) => {
        if (typeof currentStyles[key] === 'string' && currentStyles[key].startsWith('hsl(')) {
          const adjustedColor = adjustColorByHsl(currentStyles[key], newAdjustments.hueShift, newAdjustments.saturationScale, newAdjustments.lightnessScale);
          updateStyle(key, adjustedColor);
        }
      });
    },
    [hslAdjustments, currentStyles, updateStyle]
  );

  const handlePresetClick = useCallback((preset: typeof HSL_PRESETS[0]) => {
    setHslAdjustments(preset);
    handleHslChange('hueShift', preset.hueShift);
    handleHslChange('saturationScale', preset.saturationScale);
    handleHslChange('lightnessScale', preset.lightnessScale);
  }, [handleHslChange]);

  return (
    <div className="@container">
      {/* Responsive preset grid */}
      <div
        className={cn(
          "-m-1 mb-2 grid grid-cols-5 gap-2 overflow-hidden p-1 transition-all duration-300 ease-in-out @sm:grid-cols-7 @md:grid-cols-9 @lg:grid-cols-11 @xl:grid-cols-13",
          !isExpanded ? "h-10" : "h-auto"
        )}
      >
        {HSL_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => handlePresetClick(preset)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Show/Hide more button */}
      {HSL_PRESETS.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground mb-4 flex w-full items-center justify-center text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Hide" : "Show more"} presets
          <ChevronDown
            className={cn(
              "ml-1 h-4 w-4 transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </Button>
      )}

      <div className="space-y-4">
        <NewThemeSliderWithInput
          value={hslAdjustments.hueShift}
          onChange={(value) => handleHslChange("hueShift", value)}
          unit="deg"
          min={-180}
          max={180}
          step={1}
          label="Hue Shift"
        />
        <NewThemeSliderWithInput
          value={hslAdjustments.saturationScale}
          onChange={(value) => handleHslChange("saturationScale", value)}
          unit="x"
          min={0}
          max={2}
          step={0.01}
          label="Saturation Multiplier"
        />
        <NewThemeSliderWithInput
          value={hslAdjustments.lightnessScale}
          onChange={(value) => handleHslChange("lightnessScale", value)}
          unit="x"
          min={0.2}
          max={2}
          step={0.01}
          label="Lightness Multiplier"
        />
      </div>
    </div>
  );
};

export default NewThemeHslAdjustmentControls;
