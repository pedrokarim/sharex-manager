import type { ColorVars } from "@/hooks/use-theme-config";

export type PresetTheme = {
  light: ColorVars;
  dark: ColorVars;
  preview: readonly [string, string, string, string];
};

export type ThemeCategory = {
  [key: string]: PresetTheme;
};

export type Presets = {
  "Thèmes par défaut": ThemeCategory;
  "Thèmes colorés": ThemeCategory;
  "Thèmes tweakcn": ThemeCategory;
};
