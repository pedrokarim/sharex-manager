import { THEME_COLOR_KEYS } from "@/lib/theme/constants";
import { mergeColorOverrides } from "@/lib/theme/resolve-theme";
import type {
  ResolvedThemePayload,
  ThemeColorOverrides,
} from "@/types/theme-runtime";
import type { ThemeStyles } from "@/types/theme";

export function getUserThemeDraftStyles(
  resolvedTheme: ResolvedThemePayload,
): ThemeStyles {
  if (resolvedTheme.userPreferences?.stylesOverride) {
    return resolvedTheme.userPreferences.stylesOverride;
  }

  return mergeColorOverrides(
    resolvedTheme.globalTheme.styles,
    resolvedTheme.userPreferences?.lightColorOverrides,
    resolvedTheme.userPreferences?.darkColorOverrides,
  );
}

export function getThemeColorOverridesFromStyles(
  baseStyles: ThemeStyles,
  nextStyles: ThemeStyles,
): {
  light: ThemeColorOverrides;
  dark: ThemeColorOverrides;
} {
  const light: ThemeColorOverrides = {};
  const dark: ThemeColorOverrides = {};

  for (const key of THEME_COLOR_KEYS) {
    if (nextStyles.light[key] !== baseStyles.light[key]) {
      light[key] = nextStyles.light[key];
    }

    if (nextStyles.dark[key] !== baseStyles.dark[key]) {
      dark[key] = nextStyles.dark[key];
    }
  }

  return { light, dark };
}
