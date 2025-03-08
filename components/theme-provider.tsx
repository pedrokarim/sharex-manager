"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Provider as JotaiProvider } from "jotai";
import { useThemeConfig } from "@/hooks/use-theme-config";
import { useEffect, useState } from "react";

const defaultColors = {
  light: {
    background: "0 0% 100%",
    foreground: "240 10% 3.9%",
    primary: "346.8 77.2% 49.8%",
    "primary-foreground": "355.7 100% 97.3%",
    secondary: "240 4.8% 95.9%",
    "secondary-foreground": "240 5.9% 10%",
    muted: "240 4.8% 95.9%",
    "muted-foreground": "240 3.8% 46.1%",
    accent: "240 4.8% 95.9%",
    "accent-foreground": "240 5.9% 10%",
    destructive: "0 84.2% 60.2%",
    "destructive-foreground": "0 0% 98%",
    border: "240 5.9% 90%",
    input: "240 5.9% 90%",
    ring: "346.8 77.2% 49.8%",
    radius: "0.5",
  },
  dark: {
    background: "20 14.3% 4.1%",
    foreground: "0 0% 95%",
    primary: "346.8 77.2% 49.8%",
    "primary-foreground": "355.7 100% 97.3%",
    secondary: "240 3.7% 15.9%",
    "secondary-foreground": "0 0% 98%",
    muted: "0 0% 15%",
    "muted-foreground": "240 5% 64.9%",
    accent: "12 6.5% 15.1%",
    "accent-foreground": "0 0% 98%",
    destructive: "0 62.8% 30.6%",
    "destructive-foreground": "0 85.7% 97.3%",
    border: "240 3.7% 15.9%",
    input: "240 3.7% 15.9%",
    ring: "346.8 77.2% 49.8%",
    radius: "0.5",
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
