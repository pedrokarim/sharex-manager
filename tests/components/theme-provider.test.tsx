// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { defaultThemeState } from "@/config/theme";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { resolveThemePayload } from "@/lib/theme/resolve-theme";
import { THEME_PREFERENCE_STORAGE_KEY } from "@/lib/theme/constants";
import type { ThemeStyles } from "@/types/theme";
import type { GlobalThemeConfig } from "@/types/theme-runtime";

const baseGlobalTheme: GlobalThemeConfig = {
  mode: "light",
  styles: defaultThemeState.styles as ThemeStyles,
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

const renderProvider = () =>
  render(
    <ThemeProvider initialTheme={resolveThemePayload(baseGlobalTheme)}>
      <ThemeProbe />
    </ThemeProvider>,
  );

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

  it("sans choix local, affiche le mode du site", () => {
    renderProvider();

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(screen.getByTestId("theme-preference").textContent).toBe("light");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reprend le mode choisi dans ce navigateur", async () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, "dark");

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    });

    expect(screen.getByTestId("theme-preference").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enregistre un changement de mode dans le navigateur, jamais sur le serveur", async () => {
    const user = userEvent.setup();

    renderProvider();
    await user.click(screen.getByRole("button", { name: "force-dark" }));

    await waitFor(() => {
      expect(screen.getByTestId("theme-preference").textContent).toBe("dark");
    });

    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
