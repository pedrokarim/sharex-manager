import { describe, expect, it } from "vitest";
import { defaultThemeState } from "@/config/theme";
import { resolveThemePayloadFromState } from "@/lib/theme/resolve-theme";
import {
  parseAnonymousThemePreference,
  resolveThemeRuntimeState,
} from "@/lib/theme/runtime-theme";
import type { GlobalThemeConfig, UserThemePreferences } from "@/types/theme-runtime";

const baseGlobalTheme: GlobalThemeConfig = {
  mode: "system",
  styles: defaultThemeState.styles,
  updatedAt: "2026-04-02T10:00:00.000Z",
  updatedByUserId: null,
};

function createUserPreferences(
  overrides: Partial<UserThemePreferences> = {},
): UserThemePreferences {
  return {
    userId: "user-1",
    modeOverride: "inherit",
    overrideEnabled: false,
    lightColorOverrides: {},
    darkColorOverrides: {},
    dayStartHour: 7,
    dayEndHour: 19,
    updatedAt: "2026-04-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("runtime theme resolution", () => {
  it("keeps inherit as the selected preference for authenticated users", () => {
    const payload = resolveThemePayloadFromState(baseGlobalTheme, null);
    const runtimeState = resolveThemeRuntimeState(payload, {
      isAuthenticated: true,
      prefersDark: true,
      now: new Date("2026-04-02T22:00:00.000Z"),
    });

    expect(runtimeState.themePreference).toBe("inherit");
    expect(runtimeState.modePreference).toBe("system");
    expect(runtimeState.activeMode).toBe("dark");
  });

  it("resolves time-based mode from the stored user window", () => {
    const payload = resolveThemePayloadFromState(
      baseGlobalTheme,
      createUserPreferences({
        modeOverride: "time-based",
        dayStartHour: 8,
        dayEndHour: 18,
      }),
    );
    const runtimeState = resolveThemeRuntimeState(payload, {
      isAuthenticated: true,
      now: new Date("2026-04-02T21:00:00.000Z"),
      prefersDark: false,
    });

    expect(runtimeState.themePreference).toBe("time-based");
    expect(runtimeState.activeMode).toBe("dark");
  });

  it("prefers the anonymous local mode over the public site mode", () => {
    const payload = resolveThemePayloadFromState(
      {
        ...baseGlobalTheme,
        mode: "light",
      },
      null,
    );
    const runtimeState = resolveThemeRuntimeState(payload, {
      isAuthenticated: false,
      anonymousPreference: "dark",
      prefersDark: false,
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(runtimeState.themePreference).toBe("dark");
    expect(runtimeState.modePreference).toBe("dark");
    expect(runtimeState.activeMode).toBe("dark");
  });

  it("falls back to the public site mode for anonymous visitors without local choice", () => {
    const payload = resolveThemePayloadFromState(
      {
        ...baseGlobalTheme,
        mode: "dark",
      },
      null,
    );
    const runtimeState = resolveThemeRuntimeState(payload, {
      isAuthenticated: false,
      anonymousPreference: null,
      prefersDark: false,
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(runtimeState.themePreference).toBe("dark");
    expect(runtimeState.activeMode).toBe("dark");
  });

  it("validates the anonymous preference storage values", () => {
    expect(parseAnonymousThemePreference("light")).toBe("light");
    expect(parseAnonymousThemePreference("dark")).toBe("dark");
    expect(parseAnonymousThemePreference("system")).toBe("system");
    expect(parseAnonymousThemePreference("inherit")).toBeNull();
    expect(parseAnonymousThemePreference(null)).toBeNull();
  });
});
