import type {
  GlobalThemeConfig,
  GlobalThemeMode,
  ResolvedThemePayload,
  RuntimeThemeMode,
} from "@/types/theme-runtime";

/**
 * Mode réellement affiché. « system » dépend de l'appareil : sans cette
 * information (rendu serveur), on retombe sur le clair, et le CSS fait le
 * reste par media query.
 */
export function resolveRuntimeThemeMode(
  modePreference: GlobalThemeMode,
  options?: { prefersDark?: boolean },
): RuntimeThemeMode {
  if (modePreference === "light" || modePreference === "dark") {
    return modePreference;
  }

  return options?.prefersDark ? "dark" : "light";
}

/** Ce que le serveur envoie au navigateur : le thème du site, tel que publié. */
export function resolveThemePayload(
  globalTheme: GlobalThemeConfig,
): ResolvedThemePayload {
  return {
    globalTheme,
    styles: globalTheme.styles,
    modePreference: globalTheme.mode,
    activeMode: resolveRuntimeThemeMode(globalTheme.mode),
  };
}
