import { getThemeFontFamilies } from "@/lib/theme/theme-font-families";
import { loadGoogleFont } from "@/utils/fonts/google-fonts";
import type { RuntimeThemeMode } from "@/types/theme-runtime";
import type { ThemeStyles } from "@/types/theme";

export function applyRuntimeThemeToElement(
  root: HTMLElement,
  styles: ThemeStyles,
  mode: RuntimeThemeMode,
) {
  if (!root || !styles?.[mode]) {
    return;
  }

  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  for (const [key, value] of Object.entries(styles[mode])) {
    if (typeof value === "string" && value.trim() !== "") {
      root.style.setProperty(`--${key}`, value);
    }
  }

  // Le thème peut désigner une famille Google Fonts par son nom : la variable
  // CSS ne suffit pas, il faut aussi que la feuille de style soit chargée.
  // `loadGoogleFont` ignore les familles déjà présentes.
  for (const family of getThemeFontFamilies(styles)) {
    loadGoogleFont(family);
  }
}
