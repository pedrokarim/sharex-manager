import { ThemeEditorState } from "@/types/editor";
import { ThemeStyleProps, ThemeStyles } from "@/types/theme";
import { colorFormatter } from "./color-converter";
import { setShadowVariables } from "./shadows";
import { applyStyleToElement } from "./apply-style-to-element";
import { COMMON_STYLES } from "@/config/theme";

type Theme = "dark" | "light";

// Extended list of keys that should not be treated as colors
const COMMON_NON_COLOR_KEYS = [
  ...COMMON_STYLES,
  "radius",
  "spacing",
  "letter-spacing",
  "font-sans",
  "font-serif",
  "font-mono",
  "shadow-color",
  "shadow-opacity",
  "shadow-blur",
  "shadow-spread",
  "shadow-offset-x",
  "shadow-offset-y",
  "shadow-xs",
  "shadow-sm",
  "shadow",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
  "shadow-2xs",
  "tracking-normal",
  "tracking-tighter",
  "tracking-tight",
  "tracking-wide",
  "tracking-wider",
  "tracking-widest",
];

// Helper functions (not exported, used internally by applyThemeToElement)
const updateThemeClass = (root: HTMLElement, mode: Theme) => {
  if (mode === "light") {
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
  }
};

const applyCommonStyles = (root: HTMLElement, themeStyles: ThemeStyleProps) => {
  Object.entries(themeStyles)
    .filter(([key]) =>
      COMMON_NON_COLOR_KEYS.includes(
        key as (typeof COMMON_NON_COLOR_KEYS)[number]
      )
    )
    .forEach(([key, value]) => {
      if (typeof value === "string") {
        applyStyleToElement(root, key, value);
      }
    });
};

const applyThemeColors = (
  root: HTMLElement,
  themeStyles: ThemeStyles,
  mode: Theme
) => {
  Object.entries(themeStyles[mode]).forEach(([key, value]) => {
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      !COMMON_NON_COLOR_KEYS.includes(
        key as (typeof COMMON_NON_COLOR_KEYS)[number]
      )
    ) {
      try {
        const hslValue = colorFormatter(value, "hsl", "4");
        applyStyleToElement(root, key, hslValue);
      } catch (error) {
        console.warn(`Failed to parse color for ${key}: ${value}`, error);
      }
    }
  });
};

// Exported function to apply theme styles to an element
export const applyThemeToElement = (
  themeState: ThemeEditorState,
  rootElement: HTMLElement
) => {
  const { currentMode: mode, styles: themeStyles } = themeState;

  if (!rootElement || !themeStyles || !themeStyles[mode]) return;

  updateThemeClass(rootElement, mode);
  // Apply common styles (like border-radius) based on the 'light' mode definition
  applyCommonStyles(rootElement, themeStyles.light);
  // Apply mode-specific colors
  applyThemeColors(rootElement, themeStyles, mode);
  // Apply shadow variables
  setShadowVariables(themeState);
};
