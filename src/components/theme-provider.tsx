"use client";

import { startThemeTransition } from "@/lib/theme/theme-transition";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ResolvedThemePayload,
  RuntimeThemeMode,
} from "@/types/theme-runtime";
import { applyRuntimeThemeToElement } from "@/lib/theme/apply-runtime-theme";
import {
  resolveThemeRuntimeState,
  readThemePreference,
  type ThemePreference,
  writeThemePreference,
} from "@/lib/theme/runtime-theme";

type Coords = { x: number; y: number };

type ThemeProviderState = {
  /** Mode affiché : clair ou sombre. */
  theme: RuntimeThemeMode;
  /** Mode choisi dans ce navigateur, sinon celui du site. */
  themePreference: ThemePreference;
  resolvedTheme: ResolvedThemePayload;
  setThemePreference: (preference: ThemePreference, coords?: Coords) => void;
  toggleTheme: (coords?: Coords) => void;
  /** Remplace le thème du site, après une publication. */
  replaceResolvedTheme: (
    payload: ResolvedThemePayload,
    options?: { animate?: boolean; coords?: Coords }
  ) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

/**
 * Le thème du site, le même pour tout le monde. Chaque navigateur ne choisit
 * que son mode d'affichage (clair, sombre, celui de l'appareil), gardé dans
 * `localStorage` : rien n'est enregistré par compte.
 */
export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: ResolvedThemePayload;
}) {
  const [resolvedTheme, setResolvedTheme] = useState(initialTheme);
  const [localPreference, setLocalPreference] = useState(() =>
    readThemePreference(),
  );
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    setResolvedTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPrefersDark(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const runtimeState = useMemo(
    () =>
      resolveThemeRuntimeState(resolvedTheme, {
        localPreference,
        prefersDark,
      }),
    [localPreference, prefersDark, resolvedTheme],
  );

  useEffect(() => {
    const root = document.documentElement;
    applyRuntimeThemeToElement(
      root,
      resolvedTheme.styles,
      runtimeState.activeMode,
      runtimeState.themePreference,
    );
    root.dataset.themePreference = runtimeState.themePreference;
    root.dataset.themeMode = runtimeState.activeMode;
  }, [
    resolvedTheme.styles,
    runtimeState.activeMode,
    runtimeState.themePreference,
  ]);

  const runWithTransition = (coords: Coords | undefined, updater: () => void) => {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (coords) {
      root.style.setProperty("--x", `${coords.x}px`);
      root.style.setProperty("--y", `${coords.y}px`);
    }

    if (!document.startViewTransition || prefersReducedMotion) {
      updater();
      return;
    }

    startThemeTransition(updater);
  };

  const setThemePreference = (preference: ThemePreference, coords?: Coords) => {
    if (preference === runtimeState.themePreference) {
      return;
    }

    runWithTransition(coords, () => {
      writeThemePreference(preference);
      setLocalPreference(preference);
    });
  };

  const toggleTheme = (coords?: Coords) => {
    const nextMode = runtimeState.activeMode === "light" ? "dark" : "light";
    setThemePreference(nextMode, coords);
  };

  const replaceResolvedTheme: ThemeProviderState["replaceResolvedTheme"] = (
    payload,
    options
  ) => {
    const apply = () => {
      setResolvedTheme(payload);
    };

    if (options?.animate === false) {
      apply();
      return;
    }

    runWithTransition(options?.coords, apply);
  };

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme: runtimeState.activeMode,
      themePreference: runtimeState.themePreference,
      resolvedTheme,
      setThemePreference,
      toggleTheme,
      replaceResolvedTheme,
    }),
    [
      replaceResolvedTheme,
      resolvedTheme,
      runtimeState.activeMode,
      runtimeState.themePreference,
    ],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
