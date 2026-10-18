/**
 * Base SQLite de la sécurité : `data/security.db` (droits 0600).
 *
 *   sign_in_attempts   échecs de connexion par identifiant et par adresse IP
 *   alerts             alertes affichées dans l'écran Sécurité
 *   admin_known_ips    adresses déjà vues pour chaque administrateur
 *
 * Gardée hors de `logs.db` : vider le journal ne doit lever ni un blocage ni
 * une alerte. `SECURITY_DB_PATH` la déplace (tests : `:memory:`).
 */

import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const holder = globalThis as typeof globalThis & { __sxmSecurityDb?: Database };

function databasePath(): string {
  return process.env.SECURITY_DB_PATH || join(/* turbopackIgnore: true */ process.cwd(), "data", "security.db");
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS sign_in_attempts (
      key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL,
      first_failure_at INTEGER NOT NULL,
      last_failure_at INTEGER NOT NULL,
      locked_until INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      details TEXT,
      acknowledged_at TEXT,
      acknowledged_by TEXT
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS alerts_created_at ON alerts (created_at)");
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_known_ips (
      user_id TEXT NOT NULL,
      ip TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (user_id, ip)
    )
  `);
}

/** Connexion unique par processus, ouverte à la première utilisation. */
export function securityDb(): Database {
  if (holder.__sxmSecurityDb) return holder.__sxmSecurityDb;
  const file = databasePath();
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file, { create: true });
  if (file !== ":memory:") {
    db.run("PRAGMA journal_mode = WAL");
    try {
      chmodSync(file, 0o600);
    } catch {
      // Systèmes de fichiers sans droits POSIX : sans effet.
    }
  }
  migrate(db);
  holder.__sxmSecurityDb = db;
  return db;
}
