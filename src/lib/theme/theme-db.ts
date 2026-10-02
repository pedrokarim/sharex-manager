import { defaultThemeState } from "@/config/theme";
import { DEFAULT_GLOBAL_THEME_MODE } from "@/lib/theme/constants";
import {
  globalThemeConfigSchema,
  type GlobalThemeConfig,
  type GlobalThemeMode,
} from "@/types/theme-runtime";
import type { ThemeStyles } from "@/types/theme";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { normalizeLegacyFontTokens } from "@/lib/theme/normalize-font-tokens";

const GLOBAL_THEME_ROW_ID = 1;

class ThemeDatabase {
  private static dbPath: string;

  private static getDbPath() {
    if (!ThemeDatabase.dbPath) {
      if (process.env.THEME_DB_PATH) {
        ThemeDatabase.dbPath = process.env.THEME_DB_PATH;
      } else {
        const dataDir = join(process.cwd(), "data");
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }
        ThemeDatabase.dbPath = join(dataDir, "themes.db");
      }
    }

    return ThemeDatabase.dbPath;
  }

  private static getConnection() {
    const db = new Database(ThemeDatabase.getDbPath(), { create: true });
    db.run("PRAGMA journal_mode = WAL");
    ThemeDatabase.initTables(db);
    return db;
  }

  private static initTables(db: Database) {
    db.run(`
      CREATE TABLE IF NOT EXISTS global_theme_config (
        id INTEGER PRIMARY KEY CHECK (id = ${GLOBAL_THEME_ROW_ID}),
        mode TEXT NOT NULL,
        light_styles TEXT NOT NULL,
        dark_styles TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT
      )
    `);

    // L'ancienne table `user_theme_preferences` (thèmes personnels) n'est plus
    // lue ni créée. Elle reste en place là où elle existe : rien n'est effacé.

    const existing = db
      .prepare("SELECT id FROM global_theme_config WHERE id = ?")
      .get(GLOBAL_THEME_ROW_ID) as { id?: number } | null;

    if (!existing) {
      const now = new Date().toISOString();
      db.prepare(
        `
        INSERT INTO global_theme_config (
          id,
          mode,
          light_styles,
          dark_styles,
          updated_at,
          updated_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(
        GLOBAL_THEME_ROW_ID,
        DEFAULT_GLOBAL_THEME_MODE,
        JSON.stringify(defaultThemeState.styles.light),
        JSON.stringify(defaultThemeState.styles.dark),
        now,
        null,
      );
    }
  }

  private static parseStyles(row: {
    light_styles: string;
    dark_styles: string;
  }): ThemeStyles {
    return normalizeLegacyFontTokens({
      light: JSON.parse(row.light_styles),
      dark: JSON.parse(row.dark_styles),
    });
  }

  private static mapGlobalTheme(row: any): GlobalThemeConfig {
    const parsed = globalThemeConfigSchema.parse({
      mode: row.mode,
      styles: ThemeDatabase.parseStyles(row),
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id ?? null,
    });

    return parsed;
  }

  public static getGlobalThemeConfig(): GlobalThemeConfig {
    const db = ThemeDatabase.getConnection();
    const row = db
      .prepare("SELECT * FROM global_theme_config WHERE id = ?")
      .get(GLOBAL_THEME_ROW_ID);

    return ThemeDatabase.mapGlobalTheme(row);
  }

  public static updateGlobalThemeConfig(input: {
    mode: GlobalThemeMode;
    styles: ThemeStyles;
    updatedByUserId?: string | null;
  }): GlobalThemeConfig {
    const db = ThemeDatabase.getConnection();
    const now = new Date().toISOString();

    db.prepare(
      `
      UPDATE global_theme_config
      SET mode = ?, light_styles = ?, dark_styles = ?, updated_at = ?, updated_by_user_id = ?
      WHERE id = ?
    `,
    ).run(
      input.mode,
      JSON.stringify(input.styles.light),
      JSON.stringify(input.styles.dark),
      now,
      input.updatedByUserId ?? null,
      GLOBAL_THEME_ROW_ID,
    );

    return ThemeDatabase.getGlobalThemeConfig();
  }

  public static resetThemeDb() {
    const db = ThemeDatabase.getConnection();
    db.prepare("DELETE FROM global_theme_config").run();
    ThemeDatabase.initTables(db);
  }
}

export const themeDb = ThemeDatabase;
