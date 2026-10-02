import { THEME_PREFERENCE_STORAGE_KEY } from "@/lib/theme/constants";
import { resolveRuntimeThemeMode } from "@/lib/theme/resolve-theme";
import type {
  GlobalThemeMode,
  ResolvedThemePayload,
  RuntimeThemeMode,
} from "@/types/theme-runtime";

/**
 * Mode d'affichage choisi dans ce navigateur. Ce n'est pas un thème : les
 * couleurs sont celles du site pour tout le monde. Le choix vit dans
 * `localStorage`, connecté ou non, et n'est jamais envoyé au serveur.
 */
export type ThemePreference = GlobalThemeMode;

export function parseThemePreference(
  value: string | null | undefined,
): ThemePreference | null {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return null;
}

export function readThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseThemePreference(
      window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY),
    );
  } catch {
    // Stockage indisponible (navigation privée, cookies bloqués).
    return null;
  }
}

export function writeThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Le choix vaudra pour cette page seulement.
  }
}

/**
 * Le mode à afficher : celui que ce navigateur a choisi, sinon celui du site.
 */
export function resolveThemeRuntimeState(
  resolvedTheme: ResolvedThemePayload,
  options: {
    localPreference?: ThemePreference | null;
    prefersDark?: boolean;
  } = {},
): {
  themePreference: ThemePreference;
  activeMode: RuntimeThemeMode;
} {
  const themePreference =
    options.localPreference ?? resolvedTheme.globalTheme.mode;

  return {
    themePreference,
    activeMode: resolveRuntimeThemeMode(themePreference, {
      prefersDark: options.prefersDark,
    }),
  };
}
