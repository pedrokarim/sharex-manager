import { describe, expect, it } from "vitest";
import { defaultThemeState } from "@/config/theme";
import { resolveRuntimeThemeMode, resolveThemePayload } from "@/lib/theme/resolve-theme";
import type { ThemeStyles } from "@/types/theme";
import type { GlobalThemeConfig } from "@/types/theme-runtime";

const baseGlobalTheme: GlobalThemeConfig = {
  mode: "system",
  styles: defaultThemeState.styles as ThemeStyles,
  updatedAt: "2026-03-30T12:00:00.000Z",
  updatedByUserId: null,
};

describe("résolution du thème", () => {
  it("un mode explicite s'applique tel quel", () => {
    expect(resolveRuntimeThemeMode("light", { prefersDark: true })).toBe("light");
    expect(resolveRuntimeThemeMode("dark", { prefersDark: false })).toBe("dark");
  });

  it("le mode « système » suit l'appareil, et vaut clair quand il est inconnu", () => {
    expect(resolveRuntimeThemeMode("system", { prefersDark: true })).toBe("dark");
    expect(resolveRuntimeThemeMode("system", { prefersDark: false })).toBe("light");
    expect(resolveRuntimeThemeMode("system")).toBe("light");
  });

  it("le thème envoyé au navigateur est celui du site, sans variante par compte", () => {
    const payload = resolveThemePayload({ ...baseGlobalTheme, mode: "dark" });

    expect(payload.styles).toBe(baseGlobalTheme.styles);
    expect(payload.modePreference).toBe("dark");
    expect(payload.activeMode).toBe("dark");
    expect(Object.keys(payload).sort()).toEqual(["activeMode", "globalTheme", "modePreference", "styles"]);
  });
});
