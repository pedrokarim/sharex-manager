import { describe, expect, it } from "vitest";
import { defaultThemeState } from "@/config/theme";
import { resolveThemePayload } from "@/lib/theme/resolve-theme";
import { parseThemePreference, resolveThemeRuntimeState } from "@/lib/theme/runtime-theme";
import { createThemeBootstrapScript } from "@/lib/theme/create-theme-bootstrap-script";
import { resolveThemeHtmlClass } from "@/lib/theme/theme-stylesheet";
import type { ThemeStyles } from "@/types/theme";
import type { GlobalThemeConfig } from "@/types/theme-runtime";

const globalTheme = (mode: GlobalThemeConfig["mode"]): GlobalThemeConfig => ({
  mode,
  styles: defaultThemeState.styles as ThemeStyles,
  updatedAt: "2026-04-02T10:00:00.000Z",
  updatedByUserId: null,
});

describe("mode d'affichage d'un navigateur", () => {
  it("sans choix local, le mode du site s'applique", () => {
    const state = resolveThemeRuntimeState(resolveThemePayload(globalTheme("dark")), { prefersDark: false });

    expect(state.themePreference).toBe("dark");
    expect(state.activeMode).toBe("dark");
  });

  it("le choix du navigateur l'emporte sur le mode du site", () => {
    const state = resolveThemeRuntimeState(resolveThemePayload(globalTheme("dark")), {
      localPreference: "light",
      prefersDark: true,
    });

    expect(state.themePreference).toBe("light");
    expect(state.activeMode).toBe("light");
  });

  it("« système » suit l'appareil", () => {
    const payload = resolveThemePayload(globalTheme("light"));

    expect(resolveThemeRuntimeState(payload, { localPreference: "system", prefersDark: true }).activeMode).toBe("dark");
    expect(resolveThemeRuntimeState(payload, { localPreference: "system", prefersDark: false }).activeMode).toBe("light");
  });

  it("n'accepte que les trois modes connus", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    // Anciennes valeurs des préférences par compte : ignorées.
    expect(parseThemePreference("inherit")).toBeNull();
    expect(parseThemePreference("time-based")).toBeNull();
    expect(parseThemePreference(null)).toBeNull();
  });
});

describe("rendu serveur du thème", () => {
  it("la classe de <html> ne dépend que du mode du site", () => {
    expect(resolveThemeHtmlClass(resolveThemePayload(globalTheme("light")))).toBe("");
    expect(resolveThemeHtmlClass(resolveThemePayload(globalTheme("dark")))).toBe("dark");
    expect(resolveThemeHtmlClass(resolveThemePayload(globalTheme("system")))).toBe("theme-system");
  });

  it("le script de démarrage lit le choix du navigateur, connecté ou non", () => {
    const script = createThemeBootstrapScript({ initialTheme: resolveThemePayload(globalTheme("system")) });

    expect(script).toContain("anonymous-theme-preference-v1");
    expect(script).toContain('"modePreference":"system"');
    expect(script).not.toContain("isAuthenticated");
    expect(script).not.toContain("time-based");
  });
});
