import { extractFontFamily, FALLBACK_FONTS } from "@/utils/fonts";
import { buildFontCssUrl } from "@/utils/fonts/google-fonts";
import type { ThemeStyles } from "@/types/theme";

const FONT_STYLE_KEYS = ["font-sans", "font-serif", "font-mono"] as const;

/** Poids demandés par défaut quand la famille n'est pas dans le catalogue local. */
const DEFAULT_WEIGHTS = ["400", "500", "600", "700"];

const WEIGHTS_BY_FAMILY = new Map(
  FALLBACK_FONTS.map((font) => [
    font.family.toLowerCase(),
    // Les variantes peuvent être non numériques (« regular », « 700italic ») :
    // l'API Google Fonts v2 n'accepte que des poids dans `wght@`.
    font.variants.filter((variant) => /^[1-9]00$/.test(variant)),
  ]),
);

/**
 * Familles Google Fonts référencées par un thème.
 *
 * L'éditeur de thème enregistre des noms de familles bruts
 * (« Plus Jakarta Sans, sans-serif ») : sans feuille de style associée, le
 * navigateur retombe silencieusement sur la police système. On extrait donc les
 * familles réellement demandées pour pouvoir les charger.
 *
 * Les valeurs qui pointent vers une variable CSS (`var(--font-plus-jakarta)`)
 * sont ignorées : ces polices sont déjà auto-hébergées par `next/font`.
 */
export function getThemeFontFamilies(styles: ThemeStyles): string[] {
  const families = new Set<string>();

  for (const mode of ["light", "dark"] as const) {
    const modeStyles = styles?.[mode];
    if (!modeStyles) continue;

    for (const key of FONT_STYLE_KEYS) {
      const value = modeStyles[key];
      if (typeof value !== "string" || value.includes("var(")) continue;

      const family = extractFontFamily(value);
      if (family) families.add(family);
    }
  }

  return [...families];
}

/** URLs des feuilles de style Google Fonts à injecter pour un thème. */
export function getThemeFontStylesheets(styles: ThemeStyles): string[] {
  return getThemeFontFamilies(styles).map((family) => {
    const weights = WEIGHTS_BY_FAMILY.get(family.toLowerCase());
    return buildFontCssUrl(family, weights?.length ? weights : DEFAULT_WEIGHTS);
  });
}
