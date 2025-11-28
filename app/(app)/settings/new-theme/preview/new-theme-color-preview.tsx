"use client";

import React from "react";
import { ThemeStyles } from "@/types/new-theme";

interface NewThemeColorPreviewProps {
  styles: ThemeStyles;
  currentMode: "light" | "dark";
}

const NewThemeColorPreview: React.FC<NewThemeColorPreviewProps> = ({
  styles,
  currentMode,
}) => {
  const currentStyles = styles[currentMode];

  const colorGroups = [
    {
      title: "Primary Colors",
      colors: [
        { name: "Primary", value: currentStyles.primary, key: "primary" },
        { name: "Primary Foreground", value: currentStyles["primary-foreground"], key: "primary-foreground" },
      ],
    },
    {
      title: "Secondary Colors",
      colors: [
        { name: "Secondary", value: currentStyles.secondary, key: "secondary" },
        { name: "Secondary Foreground", value: currentStyles["secondary-foreground"], key: "secondary-foreground" },
      ],
    },
    {
      title: "Base Colors",
      colors: [
        { name: "Background", value: currentStyles.background, key: "background" },
        { name: "Foreground", value: currentStyles.foreground, key: "foreground" },
      ],
    },
    {
      title: "Accent Colors",
      colors: [
        { name: "Accent", value: currentStyles.accent, key: "accent" },
        { name: "Accent Foreground", value: currentStyles["accent-foreground"], key: "accent-foreground" },
      ],
    },
    {
      title: "Muted Colors",
      colors: [
        { name: "Muted", value: currentStyles.muted, key: "muted" },
        { name: "Muted Foreground", value: currentStyles["muted-foreground"], key: "muted-foreground" },
      ],
    },
    {
      title: "Destructive Colors",
      colors: [
        { name: "Destructive", value: currentStyles.destructive, key: "destructive" },
        { name: "Destructive Foreground", value: currentStyles["destructive-foreground"], key: "destructive-foreground" },
      ],
    },
    {
      title: "Border & Input",
      colors: [
        { name: "Border", value: currentStyles.border, key: "border" },
        { name: "Input", value: currentStyles.input, key: "input" },
        { name: "Ring", value: currentStyles.ring, key: "ring" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Color Palette</h2>

      <div className="grid gap-6">
        {colorGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
            <div className="grid grid-cols-1 gap-3">
              {group.colors.map((color) => (
                <div key={color.key} className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-md border border-border flex-shrink-0"
                    style={{ backgroundColor: color.value }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{color.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {color.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewThemeColorPreview;
