import { defaultThemeState } from "@/config/theme";
import { isDeepEqual } from "@/lib/utils";
import { ThemeStyles } from "../types/theme";
import { useThemePresetStore } from "../store/theme-preset-store";

export function getPresetThemeStyles(name: string): ThemeStyles {
  const defaultTheme = defaultThemeState.styles;
  if (name === "default") {
    return defaultTheme;
  }

  const store = useThemePresetStore.getState();
  const preset = store.getPreset(name);
  if (!preset) {
    return defaultTheme;
  }

  return {
    light: {
      ...defaultTheme.light,
      ...(preset.styles.light || {}),
    },
    dark: {
      ...defaultTheme.dark,
      ...(preset.styles.dark || {}),
    },
  };
}

export function findMatchingThemePresetName(styles: ThemeStyles): string | undefined {
  const store = useThemePresetStore.getState();
  const presetNames = ["default", ...Object.keys(store.getAllPresets())];

  return presetNames.find((presetName) =>
    isDeepEqual(getPresetThemeStyles(presetName), styles)
  );
}
