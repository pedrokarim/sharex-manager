"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePreferences } from "@/lib/stores/preferences";
import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preferences = usePreferences();

  useEffect(() => {
    // Appliquer les couleurs du thème au chargement
    const applyStoredColors = () => {
      if (preferences.lightColors) {
        preferences.applyThemeColors(preferences.lightColors, "light");
      }
      if (preferences.darkColors) {
        preferences.applyThemeColors(preferences.darkColors, "dark");
      }
      // Appliquer le radius
      document.documentElement.style.setProperty(
        "--radius",
        `${preferences.radius}px`
      );
    };

    applyStoredColors();
  }, [preferences]);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
