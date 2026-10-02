import { THEME_PREFERENCE_STORAGE_KEY } from "@/lib/theme/constants";
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
 * Script bloquant du `<head>`, exécuté avant la première peinture.
 *
 * Il ne pose pas le thème : la classe de `<html>` et les variables CSS sont
 * rendues par le serveur, d'après le mode du site, et le cas « système » est
 * résolu par le navigateur en CSS pur. Ce script ne sert qu'à une situation que
 * le serveur ne peut pas connaître : un navigateur qui a choisi un autre mode
 * que celui du site, choix rangé dans `localStorage`.
 */
export function createThemeBootstrapScript(options: {
  initialTheme: ResolvedThemePayload;
}) {
  const data = escapeJsonForInlineScript(
    JSON.stringify({
      modePreference: options.initialTheme.globalTheme.mode,
      storageKey: THEME_PREFERENCE_STORAGE_KEY,
    }),
  );

  return `
(() => {
  try {
    const data = ${data};
    const root = document.documentElement;

    let preference = data.modePreference;
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

    const target =
      preference === "system" ? "theme-system" : preference === "dark" ? "dark" : "";

    // Ne touche au DOM que si le serveur s'est trompé : sans ça, on force un
    // recalcul de style à chaque chargement pour rien.
    if (root.classList.contains("dark") !== (target === "dark")) {
      root.classList.toggle("dark", target === "dark");
    }
    if (root.classList.contains("theme-system") !== (target === "theme-system")) {
      root.classList.toggle("theme-system", target === "theme-system");
    }

    root.dataset.themePreference = preference;

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
