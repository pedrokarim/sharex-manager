import { describe, expect, it, vi } from "vitest";
import { defaultThemeState } from "@/config/theme";
vi.mock("@/lib/theme/theme-db", () => ({
  themeDb: {
    getGlobalThemeConfig: vi.fn(),
    getUserThemePreferences: vi.fn(),
  },
}));
import {
  resolveRuntimeThemeMode,
  resolveThemePayloadFromState,
} from "@/lib/theme/resolve-theme";
import type { GlobalThemeConfig, UserThemePreferences } from "@/types/theme-runtime";

const baseGlobalTheme: GlobalThemeConfig = {
  mode: "system",
  styles: defaultThemeState.styles,
  updatedAt: "2026-03-30T12:00:00.000Z",
  updatedByUserId: null,
};

function createUserPreferences(
  overrides: Partial<UserThemePreferences> = {}
): UserThemePreferences {
  return {
    userId: "user-1",
    modeOverride: "inherit",
    overrideEnabled: false,
    lightColorOverrides: {},
    darkColorOverrides: {},
    dayStartHour: 7,
    dayEndHour: 19,
    updatedAt: "2026-03-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("theme resolution", () => {
  it("should use the global theme for anonymous visitors", () => {
    const payload = resolveThemePayloadFromState(baseGlobalTheme, null);

    expect(payload.modeSource).toBe("global");
    expect(payload.modePreference).toBe("system");
    expect(payload.styles).toEqual(baseGlobalTheme.styles);
  });

  it("should use a user mode override without changing global styles", () => {
    const payload = resolveThemePayloadFromState(
      baseGlobalTheme,
      createUserPreferences({
        modeOverride: "dark",
      })
    );

    expect(payload.modeSource).toBe("user");
    expect(payload.modePreference).toBe("dark");
    expect(payload.styles).toEqual(baseGlobalTheme.styles);
    expect(payload.activeMode).toBe("dark");
  });

  it("should merge user color overrides only when the override is enabled", () => {
    const payload = resolveThemePayloadFromState(
      baseGlobalTheme,
      createUserPreferences({
        overrideEnabled: true,
        lightColorOverrides: {
          background: "oklch(0.98 0.02 200)",
        },
        darkColorOverrides: {
          background: "oklch(0.16 0.02 260)",
        },
      })
    );

    expect(payload.styles.light.background).toBe("oklch(0.98 0.02 200)");
    expect(payload.styles.dark.background).toBe("oklch(0.16 0.02 260)");
    expect(payload.styles.light.primary).toBe(baseGlobalTheme.styles.light.primary);
  });

  it("should ignore stored user colors when the override is disabled", () => {
    const payload = resolveThemePayloadFromState(
      baseGlobalTheme,
      createUserPreferences({
        overrideEnabled: false,
        lightColorOverrides: {
          background: "oklch(0.98 0.02 200)",
        },
      })
    );

    expect(payload.styles).toEqual(baseGlobalTheme.styles);
  });

  it("should resolve time-based mode using the user time window", () => {
    expect(
      resolveRuntimeThemeMode("time-based", {
        now: new Date("2026-03-30T09:00:00.000Z"),
        dayStartHour: 8,
        dayEndHour: 18,
      })
    ).toBe("light");

    expect(
      resolveRuntimeThemeMode("time-based", {
        now: new Date("2026-03-30T22:00:00.000Z"),
        dayStartHour: 8,
        dayEndHour: 18,
      })
    ).toBe("dark");
  });
});
