import { resolveThemeRuntimeState } from "@/lib/theme/runtime-theme";
import type { ThemeStyleProps, ThemeStyles } from "@/types/theme";
import type { ResolvedThemePayload } from "@/types/theme-runtime";

/**
 * Classe posée sur `<html>` pour décrire la préférence de thème.
 *
 * - `dark` : mode sombre décidé côté serveur.
 * - `theme-system` : la décision revient au navigateur, via
 *   `prefers-color-scheme`. Le variant `dark` de Tailwind connaît cette classe
 *   (voir `@custom-variant dark` dans app/global.css), donc les utilitaires
 *   `dark:` fonctionnent sans qu'aucun script n'ait à ajouter `.dark`.
 * - chaîne vide : mode clair.
 */
export type ThemeHtmlClass = "dark" | "theme-system" | "";

/**
 * Caractères interdits dans une valeur de variable CSS.
 *
 * Les valeurs viennent de la base (éditeur de thème) et sont injectées dans une
 * balise `<style>` : il ne doit pas être possible d'en sortir.
 */
const UNSAFE_CSS_VALUE = /[<>{};@\\]/;

function isSafeDeclaration(key: string, value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= 200 &&
    !UNSAFE_CSS_VALUE.test(value) &&
    /^[a-z0-9-]+$/.test(key)
  );
}

function declarations(styles: Partial<ThemeStyleProps> | undefined): string {
  if (!styles) return "";

  return Object.entries(styles)
    .filter(([key, value]) => isSafeDeclaration(key, value))
    .map(([key, value]) => `--${key}:${(value as string).trim()}`)
    .join(";");
}

/**
 * Feuille de style du thème, rendue côté serveur dans le `<head>`.
 *
 * Sans elle, le premier rendu utilise les couleurs par défaut de la feuille
 * globale, puis JavaScript applique le thème : deux peintures, donc un flash.
 * Ici les trois cas (clair, sombre, système) sont décrits en CSS pur, résolus
 * par le navigateur au moment du parsing.
 *
 * Le sélecteur `:root:root` est volontairement doublé : il l'emporte sur les
 * `:root` et `.dark` de app/global.css quel que soit l'ordre d'insertion des
 * feuilles, ce qui évite de dépendre de la façon dont Next les assemble.
 */
export function buildThemeStylesheet(styles: ThemeStyles): string {
  const light = declarations(styles?.light);
  const dark = declarations(styles?.dark);

  const rules: string[] = [];
  if (light) rules.push(`:root:root{${light}}`);
  if (dark) {
    rules.push(`:root:root.dark{${dark}}`);
    rules.push(
      `@media (prefers-color-scheme:dark){:root:root.theme-system{${dark}}}`,
    );
  }

  return rules.join("");
}

/**
 * Classe de thème à poser sur `<html>` dès le rendu serveur.
 *
 * Pour un utilisateur connecté, la préférence est connue : la décision est
 * prise ici, définitivement. Pour « système », on délègue au CSS. Le mode
 * horaire est calculé avec l'heure du serveur et corrigé ensuite côté client
 * si le fuseau diffère – c'est le seul cas qui peut encore bouger après coup.
 */
export function resolveThemeHtmlClass(
  payload: ResolvedThemePayload,
  isAuthenticated: boolean,
): ThemeHtmlClass {
  const state = resolveThemeRuntimeState(payload, {
    isAuthenticated,
    // Le serveur ne connaît ni la préférence anonyme (localStorage) ni le
    // `prefers-color-scheme` du visiteur : `system` est traité en CSS.
    anonymousPreference: null,
    prefersDark: false,
  });

  if (state.modePreference === "system") {
    return "theme-system";
  }

  return state.activeMode === "dark" ? "dark" : "";
}
