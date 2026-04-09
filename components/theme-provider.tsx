"use client";

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ResolvedThemePayload,
  RuntimeThemeMode,
} from "@/types/theme-runtime";
import { applyRuntimeThemeToElement } from "@/lib/theme/apply-runtime-theme";
import {
  resolveThemeRuntimeState,
  readAnonymousThemePreference,
  type ThemePreference,
  writeAnonymousThemePreference,
} from "@/lib/theme/runtime-theme";
import { useThemePresetFromUrl } from "@/hooks/use-theme-preset-from-url";

type Coords = { x: number; y: number };

type ThemeProviderState = {
  theme: RuntimeThemeMode;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedThemePayload;
  isAuthenticated: boolean;
  setThemePreference: (preference: ThemePreference, coords?: Coords) => void;
  toggleTheme: (coords?: Coords) => void;
  replaceResolvedTheme: (
    payload: ResolvedThemePayload,
    options?: { animate?: boolean; coords?: Coords }
  ) => void;
  timeWindow: {
    dayStartHour: number;
    dayEndHour: number;
  };
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

function ThemePresetHandler() {
  useThemePresetFromUrl();
  return null;
}

export function ThemeProvider({
  children,
  initialTheme,
  isAuthenticated,
}: {
  children: React.ReactNode;
  initialTheme: ResolvedThemePayload;
  isAuthenticated: boolean;
}) {
  const [resolvedTheme, setResolvedTheme] = useState(initialTheme);
  const [anonymousPreference, setAnonymousPreference] = useState(() =>
    readAnonymousThemePreference(),
  );
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [now, setNow] = useState(() => new Date());
  const latestPreferenceRequestRef = useRef(0);

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
        isAuthenticated,
        anonymousPreference,
        now,
        prefersDark,
      }),
    [anonymousPreference, isAuthenticated, now, prefersDark, resolvedTheme],
  );

  useEffect(() => {
    if (runtimeState.modePreference !== "time-based") {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [runtimeState.modePreference]);

  useEffect(() => {
    const root = document.documentElement;
    applyRuntimeThemeToElement(root, resolvedTheme.styles, runtimeState.activeMode);
    root.dataset.themePreference = runtimeState.themePreference;
    root.dataset.themeMode = runtimeState.activeMode;
  }, [resolvedTheme.styles, runtimeState.activeMode, runtimeState.themePreference]);

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

    document.startViewTransition(() => {
      updater();
    });
  };

  const setThemePreference = (preference: ThemePreference, coords?: Coords) => {
    if (preference === runtimeState.themePreference) {
      return;
    }

    if (!isAuthenticated) {
      if (
        preference !== "light" &&
        preference !== "dark" &&
        preference !== "system"
      ) {
        return;
      }

      runWithTransition(coords, () => {
        writeAnonymousThemePreference(preference);
        setAnonymousPreference(preference);
      });
      return;
    }

    const requestId = latestPreferenceRequestRef.current + 1;
    latestPreferenceRequestRef.current = requestId;

    void fetch("/api/settings/theme", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modeOverride: preference,
      }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string;
          payload: ResolvedThemePayload;
        };

        if (!response.ok) {
          throw new Error(data.error || "Impossible de mettre à jour le thème");
        }

        if (requestId !== latestPreferenceRequestRef.current) {
          return;
        }

        replaceResolvedTheme(data.payload, { coords });
      })
      .catch((error) => {
        if (requestId !== latestPreferenceRequestRef.current) {
          return;
        }

        console.error("Failed to persist theme preference", error);
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
      isAuthenticated,
      setThemePreference,
      toggleTheme,
      replaceResolvedTheme,
      timeWindow: runtimeState.timeWindow,
    }),
    [
      isAuthenticated,
      replaceResolvedTheme,
      resolvedTheme,
      runtimeState.activeMode,
      runtimeState.themePreference,
      runtimeState.timeWindow,
    ],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      <Suspense fallback={null}>
        <ThemePresetHandler />
      </Suspense>
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
