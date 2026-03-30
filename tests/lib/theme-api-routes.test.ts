import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultThemeState } from "@/config/theme";

const { authMock, themeStore } = vi.hoisted(() => ({
  authMock: vi.fn(),
  themeStore: {
    globalTheme: null as any,
    userPreferences: new Map<string, any>(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
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
    getUserThemePreferences: vi.fn((userId: string) => {
      return themeStore.userPreferences.get(userId) ?? null;
    }),
    upsertUserThemePreferences: vi.fn((userId: string, updates: any) => {
      const current =
        themeStore.userPreferences.get(userId) ?? {
          userId,
          modeOverride: "inherit",
          overrideEnabled: false,
          lightColorOverrides: {},
          darkColorOverrides: {},
          dayStartHour: 7,
          dayEndHour: 19,
          updatedAt: new Date(0).toISOString(),
        };

      const next = {
        ...current,
        ...updates,
        lightColorOverrides:
          updates.lightColorOverrides ?? current.lightColorOverrides,
        darkColorOverrides:
          updates.darkColorOverrides ?? current.darkColorOverrides,
        updatedAt: new Date().toISOString(),
      };

      themeStore.userPreferences.set(userId, next);
      return next;
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
    themeStore.userPreferences = new Map();
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
  });

  it("should require authentication on /api/settings/theme", async () => {
    authMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/settings/theme/route");
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("should store user theme preferences on /api/settings/theme", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        role: "user",
      },
    });

    const { PUT } = await import("@/app/api/settings/theme/route");
    const response = await PUT(
      new Request("http://localhost/api/settings/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modeOverride: "time-based",
          overrideEnabled: true,
          lightColorOverrides: {
            background: "oklch(0.98 0.02 200)",
          },
          darkColorOverrides: {
            background: "oklch(0.16 0.02 260)",
          },
          dayStartHour: 9,
          dayEndHour: 18,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userPreferences.modeOverride).toBe("time-based");
    expect(body.userPreferences.overrideEnabled).toBe(true);
    expect(body.userPreferences.dayStartHour).toBe(9);
    expect(body.payload.modeSource).toBe("user");
    expect(body.payload.styles.light.background).toBe("oklch(0.98 0.02 200)");
    expect(body.payload.styles.dark.background).toBe("oklch(0.16 0.02 260)");
  });
});
