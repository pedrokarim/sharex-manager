import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { defaultThemeState } from "@/config/theme";

function createTestDbPath() {
  return join(
    process.cwd(),
    "data",
    `theme-db-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
}

function cleanupDbArtifacts(dbPath: string) {
  for (const suffix of ["", "-shm", "-wal"]) {
    const filePath = `${dbPath}${suffix}`;
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }
}

function runThemeDbScript<T>(dbPath: string, script: string): T {
  const output = execFileSync("bun", ["-e", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      THEME_DB_PATH: dbPath,
    },
    encoding: "utf8",
  });

  return JSON.parse(output) as T;
}

describe("themeDb", () => {
  let dbPath = "";

  beforeEach(() => {
    dbPath = createTestDbPath();
  });

  afterEach(() => {
    cleanupDbArtifacts(dbPath);
  });

  it("should initialize the global theme config with the app defaults", () => {
    const globalTheme = runThemeDbScript<{
      mode: string;
      styles: typeof defaultThemeState.styles;
      updatedAt: string;
      updatedByUserId: string | null;
    }>(
      dbPath,
      `
        import { themeDb } from "./src/lib/theme/theme-db";
        console.log(JSON.stringify(themeDb.getGlobalThemeConfig()));
      `
    );

    expect(globalTheme.mode).toBe("system");
    expect(globalTheme.styles).toEqual(defaultThemeState.styles);
    expect(globalTheme.updatedAt).toEqual(expect.any(String));
    expect(globalTheme.updatedByUserId).toBeNull();
  });

  it("should persist global theme updates", () => {
    const updatedTheme = runThemeDbScript<{
      mode: string;
      updatedByUserId: string | null;
      styles: typeof defaultThemeState.styles;
    }>(
      dbPath,
      `
        import { themeDb } from "./src/lib/theme/theme-db";
        import { defaultThemeState } from "./src/config/theme";

        themeDb.updateGlobalThemeConfig({
          mode: "dark",
          updatedByUserId: "admin-1",
          styles: {
            light: {
              ...defaultThemeState.styles.light,
              primary: "oklch(0.5 0.2 30)",
            },
            dark: {
              ...defaultThemeState.styles.dark,
              primary: "oklch(0.7 0.2 260)",
            },
          },
        });

        console.log(JSON.stringify(themeDb.getGlobalThemeConfig()));
      `
    );

    expect(updatedTheme.mode).toBe("dark");
    expect(updatedTheme.updatedByUserId).toBe("admin-1");
    expect(updatedTheme.styles.light.primary).toBe("oklch(0.5 0.2 30)");
    expect(updatedTheme.styles.dark.primary).toBe("oklch(0.7 0.2 260)");
  });
});
