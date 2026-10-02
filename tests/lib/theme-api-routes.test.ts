import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultThemeState } from "@/config/theme";

const { authMock, themeStore } = vi.hoisted(() => ({
  authMock: vi.fn(),
  themeStore: {
    globalTheme: null as any,
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: authMock } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/theme/theme-db", () => ({
  themeDb: {
    getGlobalThemeConfig: vi.fn(() => themeStore.globalTheme),
    updateGlobalThemeConfig: vi.fn((input: any) => {
      themeStore.globalTheme = {
        ...themeStore.globalTheme,
        mode: input.mode,
        styles: input.styles,
        updatedAt: new Date().toISOString(),
        updatedByUserId: input.updatedByUserId ?? null,
      };

      return themeStore.globalTheme;
    }),
  },
}));

describe("theme API routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    themeStore.globalTheme = {
      mode: "system",
      styles: defaultThemeState.styles,
      updatedAt: "2026-03-30T12:00:00.000Z",
      updatedByUserId: null,
    };
    vi.resetModules();
  });

  it("should reject non-admin users on /api/admin/theme", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        role: "user",
      },
    });

    const { GET } = await import("@/app/api/admin/theme/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Non autorisé");
  });

  it("should let an admin publish the global theme", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: "admin",
      },
    });

    const { PUT } = await import("@/app/api/admin/theme/route");
    const response = await PUT(
      new Request("http://localhost/api/admin/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "dark",
          styles: {
            light: {
              ...defaultThemeState.styles.light,
              primary: "oklch(0.45 0.2 20)",
            },
            dark: {
              ...defaultThemeState.styles.dark,
              primary: "oklch(0.72 0.19 250)",
            },
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.globalTheme.mode).toBe("dark");
    expect(body.globalTheme.updatedByUserId).toBe("admin-1");
    expect(body.payload.globalTheme.mode).toBe("dark");
    expect(body.payload.styles.dark.primary).toBe("oklch(0.72 0.19 250)");
    // Le site n'a qu'un thème : la réponse ne porte plus de préférences par compte.
    expect(body.userPreferences).toBeUndefined();
  });
});
