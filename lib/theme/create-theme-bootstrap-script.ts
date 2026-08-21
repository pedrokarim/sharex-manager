import {
  ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY,
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
} from "@/lib/theme/constants";
import { resolveThemeRuntimeState } from "@/lib/theme/runtime-theme";
import type { ResolvedThemePayload } from "@/types/theme-runtime";

function escapeJsonForInlineScript(value: string) {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Script de correction du thème, exécuté dans le `<head>` avant la première
 * peinture.
 *
 * Il ne pose plus le thème : la classe de `<html>` et les variables CSS sont
 * rendues par le serveur, et le cas « système » est résolu par le navigateur en
 * CSS pur. Ce script ne sert qu'aux deux situations que le serveur ne peut pas
 * connaître :
 *
 * 1. un visiteur anonyme dont la préférence est stockée dans `localStorage` ;
 * 2. le mode horaire, dont l'heure de référence est celle du visiteur et non
 *    celle du serveur.
 *
 * Dans tous les autres cas — c'est-à-dire la majorité — il ne fait rien.
 */
export function createThemeBootstrapScript(options: {
  initialTheme: ResolvedThemePayload;
  isAuthenticated: boolean;
}) {
  const state = resolveThemeRuntimeState(options.initialTheme, {
    isAuthenticated: options.isAuthenticated,
    anonymousPreference: null,
    prefersDark: false,
  });

  const data = escapeJsonForInlineScript(
    JSON.stringify({
      isAuthenticated: options.isAuthenticated,
      modePreference: state.modePreference,
      themePreference: state.themePreference,
      storageKey: ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY,
      dayStartHour: state.timeWindow.dayStartHour ?? DEFAULT_DAY_START_HOUR,
      dayEndHour: state.timeWindow.dayEndHour ?? DEFAULT_DAY_END_HOUR,
    }),
  );

  return `
(() => {
  try {
    const data = ${data};
    const root = document.documentElement;

    let preference = data.modePreference;

    if (!data.isAuthenticated) {
      let stored = null;
      try {
        stored = window.localStorage.getItem(data.storageKey);
      } catch (error) {
        // Stockage indisponible (navigation privée, cookies bloqués) : on garde
        // ce que le serveur a rendu.
      }
      if (stored === "light" || stored === "dark" || stored === "system") {
        preference = stored;
      }
    }

    let target;
    if (preference === "system") {
      target = "theme-system";
    } else if (preference === "time-based") {
      const hour = new Date().getHours();
      const isDay = hour >= data.dayStartHour && hour < data.dayEndHour;
      target = isDay ? "" : "dark";
    } else {
      target = preference === "dark" ? "dark" : "";
    }

    // Ne touche au DOM que si le serveur s'est trompé : sans ça, on force un
    // recalcul de style à chaque chargement pour rien.
    if (root.classList.contains("dark") !== (target === "dark")) {
      root.classList.toggle("dark", target === "dark");
    }
    if (root.classList.contains("theme-system") !== (target === "theme-system")) {
      root.classList.toggle("theme-system", target === "theme-system");
    }

    root.dataset.themePreference = data.isAuthenticated
      ? data.themePreference
      : preference;

    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.themeMode =
      target === "dark" || (target === "theme-system" && prefersDark)
        ? "dark"
        : "light";
  } catch (error) {
    // Un thème mal appliqué ne doit jamais empêcher la page de s'afficher.
  }
})();
  `.trim();
}
