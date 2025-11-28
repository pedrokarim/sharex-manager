"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Provider as JotaiProvider } from "jotai";
import { useThemeConfig } from "@/hooks/use-theme-config";
import { useEffect, useState } from "react";

const defaultColors = {
  light: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.141 0.005 285.823)",
    primary: "oklch(0.21 0.006 285.885)",
    "primary-foreground": "oklch(0.985 0 0)",
    secondary: "oklch(0.967 0.001 286.375)",
    "secondary-foreground": "oklch(0.21 0.006 285.885)",
    muted: "oklch(0.967 0.001 286.375)",
    "muted-foreground": "oklch(0.552 0.016 285.938)",
    accent: "oklch(0.967 0.001 286.375)",
    "accent-foreground": "oklch(0.21 0.006 285.885)",
    destructive: "oklch(0.577 0.245 27.325)",
    "destructive-foreground": "oklch(0.985 0 0)",
    border: "oklch(0.92 0.004 286.32)",
    input: "oklch(0.92 0.004 286.32)",
    ring: "oklch(0.705 0.015 286.067)",
    radius: "0.625",
  },
  dark: {
    background: "oklch(0.141 0.005 285.823)",
    foreground: "oklch(0.985 0 0)",
    primary: "oklch(0.92 0.004 286.32)",
    "primary-foreground": "oklch(0.21 0.006 285.885)",
    secondary: "oklch(0.274 0.006 286.033)",
    "secondary-foreground": "oklch(0.985 0 0)",
    muted: "oklch(0.274 0.006 286.033)",
    "muted-foreground": "oklch(0.705 0.015 286.067)",
    accent: "oklch(0.274 0.006 286.033)",
    "accent-foreground": "oklch(0.985 0 0)",
    destructive: "oklch(0.704 0.191 22.216)",
    "destructive-foreground": "oklch(0.985 0 0)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.552 0.016 285.938)",
    radius: "0.625",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <JotaiProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ThemeSync>{children}</ThemeSync>
      </NextThemesProvider>
    </JotaiProvider>
  );
}

function ThemeSync({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [config] = useThemeConfig();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Appliquer les couleurs du thème au chargement
    const root = document.documentElement;
    const applyThemeColors = (theme: "light" | "dark") => {
      // Utiliser les couleurs sauvegardées ou les couleurs par défaut
      const vars = {
        ...defaultColors[theme],
        ...config.cssVars[theme],
      };

      // Appliquer chaque variable CSS
      for (const [key, value] of Object.entries(vars)) {
        if (key === "radius") {
          root.style.setProperty("--radius", `${value}rem`);
        } else {
          root.style.setProperty(`--${key}`, value);
        }
      }
    };

    applyThemeColors("light");
    applyThemeColors("dark");
  }, [config, mounted]);

  if (!mounted) {
    return null;
  }

  return children;
}
