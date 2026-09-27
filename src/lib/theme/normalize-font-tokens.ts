import type { ThemeStyles } from "@/types/theme";

const FONT_KEYS = ["font-sans", "font-serif", "font-mono"] as const;

/**
 * Variables de police disparues, et celle qui les remplace aujourd'hui.
 *
 * Les thèmes enregistrés avant le changement de police pointent encore vers
 * `--font-geist-sans` et `--font-geist-mono`, que plus personne ne déclare. Or
 * un `var()` sans repli vers une variable inexistante n'est pas ignoré par le
 * navigateur : il rend la déclaration entière invalide. `--font-sans` devient
 * donc vide, `font-family` avec lui, et toute l'application retombe sur la
 * police système – silencieusement.
 */
const LEGACY_FONT_VARIABLES: Record<string, string> = {
  "--font-geist-sans": "--font-plus-jakarta",
  "--font-geist-mono": "--font-jetbrains-mono",
};

function normalizeValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  let next = value;
  for (const [legacy, current] of Object.entries(LEGACY_FONT_VARIABLES)) {
    next = next.replaceAll(legacy, current);
  }
  return next;
}

/**
 * Remplace les variables de police obsolètes d'un thème enregistré.
 *
 * Appliqué à la lecture plutôt que par une migration de la base : le correctif
 * vaut aussitôt pour toutes les installations, y compris celles dont la base
 * vit dans un volume, sans étape manuelle.
 */
export function normalizeLegacyFontTokens(styles: ThemeStyles): ThemeStyles {
  const next = { light: { ...styles.light }, dark: { ...styles.dark } };

  for (const mode of ["light", "dark"] as const) {
    for (const key of FONT_KEYS) {
      const value = next[mode][key];
      if (value === undefined) continue;
      next[mode][key] = normalizeValue(value) as (typeof next)[typeof mode][typeof key];
    }
  }

  return next;
}
