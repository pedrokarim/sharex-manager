import { getThemeFontFamilies } from "@/lib/theme/theme-font-families";
import { buildThemeStylesheet } from "@/lib/theme/theme-stylesheet";
import { loadGoogleFont } from "@/utils/fonts/google-fonts";
import type { RuntimeThemeMode } from "@/types/theme-runtime";
import type { ThemeStyles } from "@/types/theme";

/** Identifiant de la balise `<style>` rendue par le serveur dans le `<head>`. */
const THEME_STYLE_ID = "theme-tokens";

/**
 * Préférence de mode, telle que résolue par `resolveThemeRuntimeState`.
 * « system » délègue la décision au navigateur, les autres sont explicites.
 */
type ModePreference = "light" | "dark" | "system" | "time-based";

/**
 * Applique un thème au document.
 *
 * Les variables ne sont plus posées en style inline sur `<html>` : elles
 * réécrivent la feuille rendue par le serveur. La différence compte pour la
 * préférence « système », dont le mode sombre passe par une media query — un
 * style inline l'emporterait sur elle et figerait le thème au mode détecté au
 * chargement, sans plus jamais suivre le système.
 */
export function applyRuntimeThemeToElement(
  root: HTMLElement,
  styles: ThemeStyles,
  mode: RuntimeThemeMode,
  modePreference: ModePreference,
) {
  if (!root || !styles?.[mode]) {
    return;
  }

  const followsSystem = modePreference === "system";
  root.classList.toggle("theme-system", followsSystem);
  root.classList.toggle("dark", !followsSystem && mode === "dark");

  const css = buildThemeStylesheet(styles);
  let element = document.getElementById(THEME_STYLE_ID);

  if (!element) {
    element = document.createElement("style");
    element.id = THEME_STYLE_ID;
    document.head.appendChild(element);
  }

  // Comparer avant d'écrire : réaffecter un contenu identique invalide tout le
  // style calculé de la page pour rien.
  if (element.textContent !== css) {
    element.textContent = css;
  }

  // Le thème peut désigner une famille Google Fonts par son nom : la variable
  // CSS ne suffit pas, il faut aussi que la feuille de style soit chargée.
  // `loadGoogleFont` ignore les familles déjà présentes.
  for (const family of getThemeFontFamilies(styles)) {
    loadGoogleFont(family);
  }
}
