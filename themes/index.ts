import { defaultTheme } from "./default";
import { shadcnThemes } from "./shadcn";
import { colorThemes } from "./colors";
import type { Presets } from "./types";

export const presets: Presets = {
  "Thèmes par défaut": {
    "Rose (Défaut)": {
      light: defaultTheme.light,
      dark: defaultTheme.dark,
      preview: defaultTheme.preview,
    },
  },
  "Thèmes Shadcn": {
    Zinc: shadcnThemes.Zinc,
    Slate: shadcnThemes.Slate,
    Stone: shadcnThemes.Stone,
    Gray: shadcnThemes.Gray,
    Neutral: shadcnThemes.Neutral,
    Red: shadcnThemes.Red,
    Orange: shadcnThemes.Orange,
    Green: shadcnThemes.Green,
    Blue: shadcnThemes.Blue,
    Yellow: shadcnThemes.Yellow,
    Violet: shadcnThemes.Violet,
  },
  "Thèmes colorés": {},
} as const;

export type { ColorVars } from "@/hooks/use-theme-config";
export type { PresetTheme, ThemeCategory, Presets } from "./types";
export { defaultTheme } from "./default";
