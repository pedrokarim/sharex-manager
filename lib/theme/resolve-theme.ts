import {
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
  THEME_COLOR_KEYS,
} from "@/lib/theme/constants";
import type {
  GlobalThemeConfig,
  ResolvedThemePayload,
  RuntimeThemeMode,
  ThemeColorOverrideKey,
  ThemeColorOverrides,
  UserThemeMode,
  UserThemePreferences,
} from "@/types/theme-runtime";
import type { ThemeStyles } from "@/types/theme";

const defaultTimeWindow = {
  dayStartHour: DEFAULT_DAY_START_HOUR,
  dayEndHour: DEFAULT_DAY_END_HOUR,
};

export function getModePreference(
  globalTheme: GlobalThemeConfig,
  userPreferences: UserThemePreferences | null,
): Exclude<UserThemeMode, "inherit"> | GlobalThemeConfig["mode"] {
  if (!userPreferences || userPreferences.modeOverride === "inherit") {
    return globalTheme.mode;
  }

  return userPreferences.modeOverride;
}

export function resolveRuntimeThemeMode(
  modePreference: "light" | "dark" | "system" | "time-based",
  options?: {
    prefersDark?: boolean;
    now?: Date;
    dayStartHour?: number;
    dayEndHour?: number;
  },
): RuntimeThemeMode {
  if (modePreference === "light" || modePreference === "dark") {
    return modePreference;
  }

  if (modePreference === "system") {
    return options?.prefersDark ? "dark" : "light";
  }

  const now = options?.now ?? new Date();
  const currentHour = now.getHours();
  const dayStartHour = options?.dayStartHour ?? defaultTimeWindow.dayStartHour;
  const dayEndHour = options?.dayEndHour ?? defaultTimeWindow.dayEndHour;
  const isDayTime = currentHour >= dayStartHour && currentHour < dayEndHour;
  return isDayTime ? "light" : "dark";
}

export function mergeColorOverrides(
  baseStyles: ThemeStyles,
  lightOverrides: ThemeColorOverrides = {},
  darkOverrides: ThemeColorOverrides = {},
): ThemeStyles {
  const nextLight = { ...baseStyles.light };
  const nextDark = { ...baseStyles.dark };

  for (const key of THEME_COLOR_KEYS) {
    const lightValue = lightOverrides[key as ThemeColorOverrideKey];
    if (lightValue) {
      nextLight[key] = lightValue;
    }

    const darkValue = darkOverrides[key as ThemeColorOverrideKey];
    if (darkValue) {
      nextDark[key] = darkValue;
    }
  }

  return {
    light: nextLight,
    dark: nextDark,
  };
}

export function resolveThemePayloadFromState(
  globalTheme: GlobalThemeConfig,
  userPreferences: UserThemePreferences | null,
): ResolvedThemePayload {
  const modePreference = getModePreference(globalTheme, userPreferences);
  const fallbackStyles = mergeColorOverrides(
    globalTheme.styles,
    userPreferences?.lightColorOverrides,
    userPreferences?.darkColorOverrides,
  );
  const styles = userPreferences?.overrideEnabled
    ? (userPreferences.stylesOverride ?? fallbackStyles)
    : globalTheme.styles;

  return {
    globalTheme,
    userPreferences,
    styles,
    modePreference,
    modeSource:
      !userPreferences || userPreferences.modeOverride === "inherit"
        ? "global"
        : "user",
    activeMode: resolveRuntimeThemeMode(modePreference, {
      now: new Date(),
      dayStartHour: userPreferences?.dayStartHour,
      dayEndHour: userPreferences?.dayEndHour,
    }),
  };
}
