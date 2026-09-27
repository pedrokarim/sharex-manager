import {
  ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY,
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
} from "@/lib/theme/constants";
import { resolveRuntimeThemeMode } from "@/lib/theme/resolve-theme";
import type {
  GlobalThemeMode,
  ResolvedThemePayload,
  RuntimeThemeMode,
  UserThemeMode,
} from "@/types/theme-runtime";

export type ThemePreference = UserThemeMode;
export type AnonymousThemePreference = GlobalThemeMode;

export function parseAnonymousThemePreference(
  value: string | null | undefined,
): AnonymousThemePreference | null {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return null;
}

export function readAnonymousThemePreference(): AnonymousThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseAnonymousThemePreference(
    window.localStorage.getItem(ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY),
  );
}

export function writeAnonymousThemePreference(
  preference: AnonymousThemePreference,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY,
    preference,
  );
}

export function clearAnonymousThemePreference() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY);
}

export function getThemeTimeWindow(resolvedTheme: ResolvedThemePayload) {
  return {
    dayStartHour:
      resolvedTheme.userPreferences?.dayStartHour ?? DEFAULT_DAY_START_HOUR,
    dayEndHour: resolvedTheme.userPreferences?.dayEndHour ?? DEFAULT_DAY_END_HOUR,
  };
}

export function getThemePreference(
  resolvedTheme: ResolvedThemePayload,
  options: {
    isAuthenticated: boolean;
    anonymousPreference?: AnonymousThemePreference | null;
  },
): ThemePreference {
  if (options.isAuthenticated) {
    return resolvedTheme.userPreferences?.modeOverride ?? "inherit";
  }

  return options.anonymousPreference ?? resolvedTheme.globalTheme.mode;
}

export function getResolvedModePreference(
  themePreference: ThemePreference,
  globalThemeMode: GlobalThemeMode,
): Exclude<UserThemeMode, "inherit"> | GlobalThemeMode {
  if (themePreference === "inherit") {
    return globalThemeMode;
  }

  return themePreference;
}

export function resolveThemeRuntimeState(
  resolvedTheme: ResolvedThemePayload,
  options: {
    isAuthenticated: boolean;
    anonymousPreference?: AnonymousThemePreference | null;
    now?: Date;
    prefersDark?: boolean;
  },
): {
  themePreference: ThemePreference;
  modePreference: Exclude<UserThemeMode, "inherit"> | GlobalThemeMode;
  activeMode: RuntimeThemeMode;
  timeWindow: {
    dayStartHour: number;
    dayEndHour: number;
  };
} {
  const themePreference = getThemePreference(resolvedTheme, options);
  const modePreference = getResolvedModePreference(
    themePreference,
    resolvedTheme.globalTheme.mode,
  );
  const timeWindow = getThemeTimeWindow(resolvedTheme);

  return {
    themePreference,
    modePreference,
    activeMode: resolveRuntimeThemeMode(modePreference, {
      prefersDark: options.prefersDark,
      now: options.now,
      dayStartHour: timeWindow.dayStartHour,
      dayEndHour: timeWindow.dayEndHour,
    }),
    timeWindow,
  };
}
