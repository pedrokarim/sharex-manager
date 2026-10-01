/**
 * Préférences rattachées au compte, côté serveur.
 *
 * Les préférences d'affichage historiques (`lib/atoms/preferences.ts`) vivent
 * dans le navigateur : elles ne suivent pas le compte d'un appareil à l'autre.
 * Ici, chaque compte possède des « portées » nommées (`ai-image-gen.composer`,
 * `clip-studio.voice`…), chacune un petit objet JSON, gardées dans le volume
 * de données.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

import {
  MAX_SCOPES_PER_USER,
  parsePreferenceValue,
  type PreferenceValue,
} from "@/lib/user-preferences-rules";

export { MAX_PREFERENCE_BYTES, isPreferenceScope, parsePreferenceValue, type PreferenceValue } from "@/lib/user-preferences-rules";

let database: Database | null = null;

function connection(): Database {
  if (database) return database;
  const file = process.env.PREFERENCES_DB_PATH ?? join(process.cwd(), "data", "user-preferences.db");
  if (file !== ":memory:") {
    const directory = join(file, "..");
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  }
  database = new Database(file, { create: true });
  database.run("PRAGMA journal_mode = WAL");
  database.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, scope)
    )
  `);
  return database;
}

export function getUserPreference(userId: string, scope: string): PreferenceValue | null {
  const row = connection()
    .prepare("SELECT value FROM user_preferences WHERE user_id = ? AND scope = ?")
    .get(userId, scope) as { value: string } | null;
  if (!row) return null;
  try {
    return parsePreferenceValue(JSON.parse(row.value));
  } catch {
    return null;
  }
}

/** Enregistre la préférence ; faux si le compte a déjà trop de portées. */
export function setUserPreference(userId: string, scope: string, value: PreferenceValue): boolean {
  const db = connection();
  const existing = db
    .prepare("SELECT 1 FROM user_preferences WHERE user_id = ? AND scope = ?")
    .get(userId, scope);
  if (!existing) {
    const { total } = db
      .prepare("SELECT COUNT(*) AS total FROM user_preferences WHERE user_id = ?")
      .get(userId) as { total: number };
    if (total >= MAX_SCOPES_PER_USER) return false;
  }
  db.prepare(
    `INSERT INTO user_preferences (user_id, scope, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, scope) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(userId, scope, JSON.stringify(value), new Date().toISOString());
  return true;
}

export function deleteUserPreference(userId: string, scope: string): void {
  connection().prepare("DELETE FROM user_preferences WHERE user_id = ? AND scope = ?").run(userId, scope);
}

/** Pour les tests : repart d'une base vierge. */
export function resetPreferencesConnection(): void {
  database?.close();
  database = null;
}
