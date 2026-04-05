import {
  ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY,
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
} from "@/lib/theme/constants";
import type { ResolvedThemePayload } from "@/types/theme-runtime";

function escapeJsonForInlineScript(value: string) {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function createThemeBootstrapScript(options: {
  initialTheme: ResolvedThemePayload;
  isAuthenticated: boolean;
}) {
  const data = escapeJsonForInlineScript(
    JSON.stringify({
      initialTheme: options.initialTheme,
      isAuthenticated: options.isAuthenticated,
      anonymousPreferenceStorageKey: ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY,
      defaultDayStartHour: DEFAULT_DAY_START_HOUR,
      defaultDayEndHour: DEFAULT_DAY_END_HOUR,
    }),
  );

  return `
(() => {
  const data = ${data};
  const payload = data.initialTheme;
  const root = document.documentElement;

  const parseAnonymousPreference = (value) => {
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
    return null;
  };

  const resolveMode = (modePreference, prefersDark, now, dayStartHour, dayEndHour) => {
    if (modePreference === "light" || modePreference === "dark") {
      return modePreference;
    }

    if (modePreference === "system") {
      return prefersDark ? "dark" : "light";
    }

    const currentHour = now.getHours();
    const isDayTime = currentHour >= dayStartHour && currentHour < dayEndHour;
    return isDayTime ? "light" : "dark";
  };

  const rawAnonymousPreference = !data.isAuthenticated
    ? window.localStorage.getItem(data.anonymousPreferenceStorageKey)
    : null;
  const anonymousPreference = parseAnonymousPreference(rawAnonymousPreference);
  const themePreference = data.isAuthenticated
    ? (payload.userPreferences && payload.userPreferences.modeOverride) || "inherit"
    : anonymousPreference || payload.globalTheme.mode;
  const modePreference =
    themePreference === "inherit" ? payload.globalTheme.mode : themePreference;
  const dayStartHour =
    (payload.userPreferences && payload.userPreferences.dayStartHour) ??
    data.defaultDayStartHour;
  const dayEndHour =
    (payload.userPreferences && payload.userPreferences.dayEndHour) ??
    data.defaultDayEndHour;
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const activeMode = resolveMode(
    modePreference,
    prefersDark,
    new Date(),
    dayStartHour,
    dayEndHour
  );
  const activeStyles = payload.styles[activeMode];

  if (activeMode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  if (activeStyles) {
    for (const [key, value] of Object.entries(activeStyles)) {
      if (typeof value === "string" && value.trim() !== "") {
        root.style.setProperty("--" + key, value);
      }
    }
  }

  root.dataset.themePreference = themePreference;
  root.dataset.themeMode = activeMode;
})();
  `.trim();
}
