// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { defaultThemeState } from "@/config/theme";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { resolveThemePayloadFromState } from "@/lib/theme/resolve-theme";
import { ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY } from "@/lib/theme/constants";
import type { GlobalThemeConfig } from "@/types/theme-runtime";

vi.mock("@/hooks/use-theme-preset-from-url", () => ({
  useThemePresetFromUrl: () => {},
}));

const baseGlobalTheme: GlobalThemeConfig = {
  mode: "light",
  styles: defaultThemeState.styles,
  updatedAt: "2026-04-02T10:00:00.000Z",
  updatedByUserId: null,
};

function ThemeProbe() {
  const { theme, themePreference, setThemePreference } = useTheme();

  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="theme-preference">{themePreference}</span>
      <button onClick={() => setThemePreference("dark")}>force-dark</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    delete (document.documentElement as HTMLElement).dataset.themeMode;
    delete (document.documentElement as HTMLElement).dataset.themePreference;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    Object.defineProperty(document, "startViewTransition", {
      writable: true,
      value: undefined,
    });

    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not auto-migrate legacy theme data on mount", () => {
    localStorage.setItem("preferredThemeMode", JSON.stringify("dark"));
    localStorage.setItem(
      "timeBasedTheme",
      JSON.stringify({ dayStartHour: 8, dayEndHour: 18 }),
    );
    localStorage.setItem(
      "preferences",
      JSON.stringify({
        lightColors: { background: "oklch(0.95 0.01 200)" },
        darkColors: { background: "oklch(0.18 0.01 260)" },
      }),
    );

    render(
      <ThemeProvider
        initialTheme={resolveThemePayloadFromState(baseGlobalTheme, null)}
        isAuthenticated={true}
      >
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("hydrates anonymous visitors from the dedicated local preference", async () => {
    localStorage.setItem(ANONYMOUS_THEME_PREFERENCE_STORAGE_KEY, "dark");

    render(
      <ThemeProvider
        initialTheme={resolveThemePayloadFromState(baseGlobalTheme, null)}
        isAuthenticated={false}
      >
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    });

    expect(screen.getByTestId("theme-preference").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists authenticated theme changes through the settings theme API", async () => {
    const user = userEvent.setup();
    const updatedPayload = resolveThemePayloadFromState(
      baseGlobalTheme,
      {
        userId: "user-1",
        modeOverride: "dark",
        overrideEnabled: false,
        lightColorOverrides: {},
        darkColorOverrides: {},
        stylesOverride: null,
        dayStartHour: 7,
        dayEndHour: 19,
        updatedAt: "2026-04-02T10:05:00.000Z",
      },
    );

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        payload: updatedPayload,
      }),
    } as Response);

    render(
      <ThemeProvider
        initialTheme={resolveThemePayloadFromState(baseGlobalTheme, null)}
        isAuthenticated={true}
      >
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "force-dark" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/settings/theme",
        expect.objectContaining({
          method: "PUT",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("theme-preference").textContent).toBe("dark");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
