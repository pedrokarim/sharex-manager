"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useThemeConfig } from "@/hooks/use-theme-config";

interface ThemeWrapperProps {
  children: React.ReactNode;
}

export function ThemeWrapper({ children }: ThemeWrapperProps) {
  const [mounted, setMounted] = React.useState(false);
  const [config] = useThemeConfig();
  const { resolvedTheme } = useTheme();

  // Attendre que le composant soit monté pour éviter les problèmes d'hydration
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    const currentTheme = resolvedTheme === "dark" ? "dark" : "light";
    const vars = config.cssVars[currentTheme];

    // Appliquer toutes les variables CSS
    Object.entries(vars).forEach(([key, value]) => {
      if (key === "radius") {
        root.style.setProperty("--radius", `${value}rem`);
      } else {
        root.style.setProperty(`--${key}`, value);
      }
    });

    // Mettre à jour la classe du thème
    root.classList.remove("light", "dark");
    root.classList.add(currentTheme);
  }, [config, resolvedTheme, mounted]);

  // Éviter le flash en ne rendant rien jusqu'au montage
  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}
