"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface NewThemeColorPickerProps {
  name: string;
  color: string;
  onChange: (color: string) => void;
  label: string;
}

const NewThemeColorPicker: React.FC<NewThemeColorPickerProps> = ({
  name,
  color,
  onChange,
  label,
}) => {
  const [inputValue, setInputValue] = React.useState(color);

  React.useEffect(() => {
    setInputValue(color);
  }, [color]);

  const handleColorChange = (newColor: string) => {
    setInputValue(newColor);
    onChange(newColor);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    // Only update if it's a valid color
    if (/^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{3}$|^hsl\([^)]+\)$|^rgb\([^)]+\)$/.test(value)) {
      onChange(value);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={color}
          onChange={(e) => handleColorChange(e.target.value)}
          className="absolute inset-0 h-9 w-9 cursor-pointer rounded-md border border-border opacity-0"
        />
        <div
          className="h-9 w-9 rounded-md border border-border"
          style={{ backgroundColor: color }}
        />
      </div>
      <div className="flex-1">
        <Label htmlFor={name} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Input
          id={name}
          value={inputValue}
          onChange={handleInputChange}
          className="mt-1 h-8 text-xs"
          placeholder="#000000"
        />
      </div>
    </div>
  );
};

export default NewThemeColorPicker;
