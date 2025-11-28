import { defaultTheme } from "./default";
import { shadcnThemes } from "./shadcn";
import { colorThemes } from "./colors";
import { tweakcnThemes } from "./tweakcn";
import type { Presets } from "./types";

export const presets: Presets = {
  "Thèmes par défaut": {
    Défaut: {
      light: defaultTheme.light,
      dark: defaultTheme.dark,
      preview: defaultTheme.preview,
    },
    Red: shadcnThemes.Red,
    Orange: shadcnThemes.Orange,
    Green: shadcnThemes.Green,
    Blue: shadcnThemes.Blue,
    Yellow: shadcnThemes.Yellow,
    Violet: shadcnThemes.Violet,
  },
  "Thèmes colorés": {
    "Modern Blue": colorThemes["Modern Blue"],
    "Forest Green": colorThemes["Forest Green"],
    "Royal Purple": colorThemes["Royal Purple"],
    "Sunset Orange": colorThemes["Sunset Orange"],
    "Rose Garden": colorThemes["Rose Garden"],
    "Ocean Blue": colorThemes["Ocean Blue"],
    Emerald: colorThemes.Emerald,
  },
  "Thèmes tweakcn": {
    Claymorphism: tweakcnThemes.Claymorphism,
    "t3-chat": tweakcnThemes["t3-chat"],
    "retro-arcade": tweakcnThemes["retro-arcade"],
    perpetuity: tweakcnThemes.perpetuity,
    "sunset-horizon": tweakcnThemes["sunset-horizon"],
    "amber-minimal": tweakcnThemes["amber-minimal"],
  },
} as const;

export type { ColorVars } from "@/hooks/use-theme-config";
export type { PresetTheme, ThemeCategory, Presets } from "./types";
export { defaultTheme } from "./default";
