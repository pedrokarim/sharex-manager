import { ThemeStyles } from "@/types/theme";
import { mergeThemeStylesWithDefaults } from "@/utils/theme-styles";

export function applyGeneratedTheme(
  themeStyles: ThemeStyles,
  themeState: any,
  setThemeState: (state: any) => void
) {
  // Merge the generated theme styles with the default theme styles
  // if the generated theme styles are missing a value, use the default theme styles
  const mergedStyles = mergeThemeStylesWithDefaults(themeStyles);

  if (!document.startViewTransition) {
    setThemeState({
      ...themeState,
      styles: mergedStyles,
    });
  } else {
    document.startViewTransition(() => {
      setThemeState({
        ...themeState,
        styles: mergedStyles,
      });
    });
  }
}
