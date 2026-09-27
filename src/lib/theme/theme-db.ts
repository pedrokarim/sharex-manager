import { defaultThemeState } from "@/config/theme";
import {
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
  DEFAULT_GLOBAL_THEME_MODE,
} from "@/lib/theme/constants";
import {
  globalThemeConfigSchema,
  userThemePreferencesSchema,
  type GlobalThemeConfig,
  type GlobalThemeMode,
  type ThemeColorOverrides,
  type UserThemeMode,
  type UserThemePreferences,
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

    db.run(`
      CREATE TABLE IF NOT EXISTS user_theme_preferences (
        user_id TEXT PRIMARY KEY,
        mode_override TEXT NOT NULL,
        override_enabled INTEGER NOT NULL DEFAULT 0,
        light_color_overrides TEXT NOT NULL DEFAULT '{}',
        dark_color_overrides TEXT NOT NULL DEFAULT '{}',
        light_theme_styles TEXT,
        dark_theme_styles TEXT,
        day_start_hour INTEGER NOT NULL DEFAULT ${DEFAULT_DAY_START_HOUR},
        day_end_hour INTEGER NOT NULL DEFAULT ${DEFAULT_DAY_END_HOUR},
        updated_at TEXT NOT NULL
      )
    `);

    ThemeDatabase.ensureUserThemePreferenceColumns(db);

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

  private static ensureUserThemePreferenceColumns(db: Database) {
    const columns = db
      .prepare("PRAGMA table_info(user_theme_preferences)")
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("light_theme_styles")) {
      db.run(
        "ALTER TABLE user_theme_preferences ADD COLUMN light_theme_styles TEXT",
      );
    }

    if (!columnNames.has("dark_theme_styles")) {
      db.run(
        "ALTER TABLE user_theme_preferences ADD COLUMN dark_theme_styles TEXT",
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

  private static mapUserPreferences(row: any): UserThemePreferences {
    return userThemePreferencesSchema.parse({
      userId: row.user_id,
      modeOverride: row.mode_override,
      overrideEnabled: Boolean(row.override_enabled),
      lightColorOverrides: JSON.parse(row.light_color_overrides || "{}"),
      darkColorOverrides: JSON.parse(row.dark_color_overrides || "{}"),
      stylesOverride:
        row.light_theme_styles && row.dark_theme_styles
          ? normalizeLegacyFontTokens({
              light: JSON.parse(row.light_theme_styles),
              dark: JSON.parse(row.dark_theme_styles),
            })
          : null,
      dayStartHour: row.day_start_hour,
      dayEndHour: row.day_end_hour,
      updatedAt: row.updated_at,
    });
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

  public static getUserThemePreferences(
    userId: string,
  ): UserThemePreferences | null {
    const db = ThemeDatabase.getConnection();
    const row = db
      .prepare("SELECT * FROM user_theme_preferences WHERE user_id = ?")
      .get(userId);

    if (!row) {
      return null;
    }

    return ThemeDatabase.mapUserPreferences(row);
  }

  public static getDefaultUserThemePreferences(
    userId: string,
  ): UserThemePreferences {
    return {
      userId,
      modeOverride: "inherit",
      overrideEnabled: false,
      lightColorOverrides: {},
      darkColorOverrides: {},
      stylesOverride: null,
      dayStartHour: DEFAULT_DAY_START_HOUR,
      dayEndHour: DEFAULT_DAY_END_HOUR,
      updatedAt: new Date(0).toISOString(),
    };
  }

  public static upsertUserThemePreferences(
    userId: string,
    updates: {
      modeOverride?: UserThemeMode;
      overrideEnabled?: boolean;
      lightColorOverrides?: ThemeColorOverrides;
      darkColorOverrides?: ThemeColorOverrides;
      stylesOverride?: ThemeStyles | null;
      dayStartHour?: number;
      dayEndHour?: number;
    },
  ): UserThemePreferences {
    const db = ThemeDatabase.getConnection();
    const current =
      ThemeDatabase.getUserThemePreferences(userId) ??
      ThemeDatabase.getDefaultUserThemePreferences(userId);
    const next: UserThemePreferences = {
      ...current,
      ...updates,
      lightColorOverrides:
        updates.lightColorOverrides ?? current.lightColorOverrides,
      darkColorOverrides:
        updates.darkColorOverrides ?? current.darkColorOverrides,
      stylesOverride: updates.stylesOverride ?? current.stylesOverride ?? null,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(
      `
      INSERT INTO user_theme_preferences (
        user_id,
        mode_override,
        override_enabled,
        light_color_overrides,
        dark_color_overrides,
        light_theme_styles,
        dark_theme_styles,
        day_start_hour,
        day_end_hour,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        mode_override = excluded.mode_override,
        override_enabled = excluded.override_enabled,
        light_color_overrides = excluded.light_color_overrides,
        dark_color_overrides = excluded.dark_color_overrides,
        light_theme_styles = excluded.light_theme_styles,
        dark_theme_styles = excluded.dark_theme_styles,
        day_start_hour = excluded.day_start_hour,
        day_end_hour = excluded.day_end_hour,
        updated_at = excluded.updated_at
    `,
    ).run(
      next.userId,
      next.modeOverride,
      next.overrideEnabled ? 1 : 0,
      JSON.stringify(next.lightColorOverrides),
      JSON.stringify(next.darkColorOverrides),
      next.stylesOverride ? JSON.stringify(next.stylesOverride.light) : null,
      next.stylesOverride ? JSON.stringify(next.stylesOverride.dark) : null,
      next.dayStartHour,
      next.dayEndHour,
      next.updatedAt,
    );

    return ThemeDatabase.getUserThemePreferences(userId)!;
  }

  public static resetThemeDb() {
    const db = ThemeDatabase.getConnection();
    db.prepare("DELETE FROM user_theme_preferences").run();
    db.prepare("DELETE FROM global_theme_config").run();
    ThemeDatabase.initTables(db);
  }
}

export const themeDb = ThemeDatabase;
