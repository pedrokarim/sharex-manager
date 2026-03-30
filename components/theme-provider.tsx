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
import { useSession } from "next-auth/react";
import { defaultThemeState } from "@/config/theme";
import {
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
} from "@/lib/theme/constants";
import { applyThemeToElement } from "@/utils/apply-theme";
import { resolveRuntimeThemeMode } from "@/lib/theme/resolve-theme";
import type {
  GlobalThemeMode,
  ResolvedThemePayload,
  RuntimeThemeMode,
  UserThemeMode,
} from "@/types/theme-runtime";
import { useThemePresetFromUrl } from "@/hooks/use-theme-preset-from-url";

type ThemePreference = GlobalThemeMode | Exclude<UserThemeMode, "inherit">;
type Coords = { x: number; y: number };

type ThemeProviderState = {
  theme: RuntimeThemeMode;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedThemePayload;
  setTheme: (theme: RuntimeThemeMode) => void;
  setThemePreference: (preference: ThemePreference, coords?: Coords) => void;
  toggleTheme: (coords?: Coords) => void;
  replaceResolvedTheme: (
    payload: ResolvedThemePayload,
    options?: { animate?: boolean; coords?: Coords; keepTemporaryPreference?: boolean }
  ) => void;
  clearTemporaryPreference: () => void;
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

function readStoredValue<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function ThemePreferencesMigration({
  resolvedTheme,
  replaceResolvedTheme,
}: {
  resolvedTheme: ResolvedThemePayload;
  replaceResolvedTheme: ThemeProviderState["replaceResolvedTheme"];
}) {
  const { data: session, status } = useSession();
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      return;
    }

    if (resolvedTheme.userPreferences || hasAttempted.current) {
      return;
    }

    const migrationFlag = window.localStorage.getItem("theme-preferences-migrated-v1");
    if (migrationFlag) {
      return;
    }

    const preferredThemeMode = readStoredValue<"light" | "dark" | "system" | "time-based">(
      "preferredThemeMode"
    );
    const timeBasedTheme = readStoredValue<{ dayStartHour?: number; dayEndHour?: number }>(
      "timeBasedTheme"
    );
    const legacyPreferences = readStoredValue<{
      lightColors?: Record<string, string>;
      darkColors?: Record<string, string>;
    }>("preferences");

    const lightColorOverrides = legacyPreferences?.lightColors ?? {};
    const darkColorOverrides = legacyPreferences?.darkColors ?? {};
    const hasColorOverrides =
      Object.keys(lightColorOverrides).length > 0 || Object.keys(darkColorOverrides).length > 0;

    const hasModeOverride =
      preferredThemeMode && (preferredThemeMode !== "system" || hasColorOverrides);
    const hasTimeOverride =
      !!timeBasedTheme &&
      (timeBasedTheme.dayStartHour !== undefined || timeBasedTheme.dayEndHour !== undefined);

    if (!hasColorOverrides && !hasModeOverride && !hasTimeOverride) {
      window.localStorage.setItem("theme-preferences-migrated-v1", "skipped");
      return;
    }

    hasAttempted.current = true;

    const body = {
      modeOverride: preferredThemeMode ?? "inherit",
      overrideEnabled: hasColorOverrides,
      lightColorOverrides,
      darkColorOverrides,
      dayStartHour: timeBasedTheme?.dayStartHour ?? DEFAULT_DAY_START_HOUR,
      dayEndHour: timeBasedTheme?.dayEndHour ?? DEFAULT_DAY_END_HOUR,
    };

    void fetch("/api/settings/theme", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Migration failed");
        }
        const data = (await response.json()) as { payload: ResolvedThemePayload };
        replaceResolvedTheme(data.payload, { animate: false });
        window.localStorage.setItem("theme-preferences-migrated-v1", "done");
      })
      .catch(() => {
        hasAttempted.current = false;
      });
  }, [replaceResolvedTheme, resolvedTheme, session?.user?.id, status]);

  return null;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: ResolvedThemePayload;
}) {
  const [resolvedTheme, setResolvedTheme] = useState(initialTheme);
  const [temporaryPreference, setTemporaryPreference] = useState<ThemePreference | null>(null);
  const [prefersDark, setPrefersDark] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const modePreference = temporaryPreference ?? resolvedTheme.modePreference;
  const timeWindow = {
    dayStartHour: resolvedTheme.userPreferences?.dayStartHour ?? 7,
    dayEndHour: resolvedTheme.userPreferences?.dayEndHour ?? 19,
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPrefersDark(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (modePreference !== "time-based") {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [modePreference]);

  const currentMode = useMemo(
    () =>
      resolveRuntimeThemeMode(modePreference, {
        prefersDark,
        now,
        dayStartHour: timeWindow.dayStartHour,
        dayEndHour: timeWindow.dayEndHour,
      }),
    [modePreference, now, prefersDark, timeWindow.dayEndHour, timeWindow.dayStartHour]
  );

  useEffect(() => {
    const root = document.documentElement;
    applyThemeToElement(
      {
        ...defaultThemeState,
        currentMode,
        styles: resolvedTheme.styles,
      },
      root
    );
  }, [currentMode, resolvedTheme.styles]);

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

  const setTheme = (theme: RuntimeThemeMode) => {
    setTemporaryPreference(theme);
  };

  const setThemePreference = (preference: ThemePreference, coords?: Coords) => {
    runWithTransition(coords, () => {
      setTemporaryPreference(preference);
      if (preference === "time-based") {
        setNow(new Date());
      }
    });
  };

  const toggleTheme = (coords?: Coords) => {
    const nextMode = currentMode === "light" ? "dark" : "light";
    setThemePreference(nextMode, coords);
  };

  const replaceResolvedTheme: ThemeProviderState["replaceResolvedTheme"] = (
    payload,
    options
  ) => {
    const apply = () => {
      setResolvedTheme(payload);
      if (!options?.keepTemporaryPreference) {
        setTemporaryPreference(null);
      }
    };

    if (options?.animate === false) {
      apply();
      return;
    }

    runWithTransition(options?.coords, apply);
  };

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme: currentMode,
      themePreference: modePreference,
      resolvedTheme,
      setTheme,
      setThemePreference,
      toggleTheme,
      replaceResolvedTheme,
      clearTemporaryPreference: () => setTemporaryPreference(null),
      timeWindow,
    }),
    [currentMode, modePreference, replaceResolvedTheme, resolvedTheme, timeWindow]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      <Suspense fallback={null}>
        <ThemePresetHandler />
      </Suspense>
      <ThemePreferencesMigration
        resolvedTheme={resolvedTheme}
        replaceResolvedTheme={replaceResolvedTheme}
      />
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
