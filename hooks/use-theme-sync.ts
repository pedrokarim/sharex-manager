"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { usePreferences } from "@/lib/stores/preferences";

export function useThemeSync() {
  const { theme } = useTheme();
  const preferences = usePreferences();
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Appliquer les couleurs initiales une seule fois
    if (preferences.lightColors) {
      document.documentElement.style.setProperty(
        "--radius",
        `${preferences.radius}px`
      );
      Object.entries(preferences.lightColors).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    }
    if (preferences.darkColors) {
      Object.entries(preferences.darkColors).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    }
  }, [preferences.lightColors, preferences.darkColors, preferences.radius]);

  // Écouter les changements de thème
  useEffect(() => {
    if (!theme) return;
    const colors =
      theme === "dark" ? preferences.darkColors : preferences.lightColors;
    if (!colors) return;

    Object.entries(colors).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--${key}`, value);
    });
  }, [theme, preferences.lightColors, preferences.darkColors]);
}
