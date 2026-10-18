import type { Log, CreateLogOptions } from "@/lib/types/logs";
import { Database } from "bun:sqlite";
import { join } from "path";
import { chmodSync, existsSync, mkdirSync } from "fs";

interface Statement {
  run: (params?: Record<string, any>) => { lastInsertRowid?: number };
  all: (params?: Record<string, any>) => any[];
}

class LogDatabase {
  private static dbPath: string;

  private static initDbPath() {
    if (!LogDatabase.dbPath) {
      // `LOGS_DB_PATH` déplace la base, pour les tests.
      if (process.env.LOGS_DB_PATH) {
        LogDatabase.dbPath = process.env.LOGS_DB_PATH;
        return LogDatabase.dbPath;
      }
      const dataDir = join(process.cwd(), "data");
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      }
      LogDatabase.dbPath = join(dataDir, "logs.db");
    }
    return LogDatabase.dbPath;
  }

  private static getConnection(): Database {
    const path = LogDatabase.initDbPath();
    const created = !existsSync(path);
    const db = new Database(path, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    if (created) {
      // Le journal contient des adresses IP et des noms de comptes.
      try {
        chmodSync(path, 0o600);
      } catch {
        // Systèmes de fichiers sans droits POSIX : sans effet.
      }
    }
    return db;
  }

  private static initTable(db: Database) {
    db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        action TEXT NOT NULL,
        userId TEXT,
        userEmail TEXT,
        message TEXT NOT NULL,
        metadata TEXT,
        ip TEXT,
        userAgent TEXT
      )
    `);
  }

  public static createLog(options: CreateLogOptions): Log {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    const timestamp = new Date().toISOString();
    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;

    const query = db.prepare(`
      INSERT INTO logs (timestamp, level, action, userId, userEmail, message, metadata, ip, userAgent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = query.run(
      timestamp,
      options.level,
      options.action,
      options.userId || null,
      options.userEmail || null,
      options.message,
      metadata,
      options.ip || null,
      options.userAgent || null
    );

    return {
      id: Number(result.lastInsertRowid || 0),
      timestamp,
      ...options,
      metadata: options.metadata || {},
    };
  }

  public static getLogs(
    limit = 50,
    offset = 0,
    filters?: {
      level?: string;
      action?: string;
      userId?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Log[] {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    let query = `
      SELECT * FROM logs 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.level) {
      query += ` AND level = ?`;
      params.push(filters.level);
    }

    if (filters?.action) {
      query += ` AND action = ?`;
      params.push(filters.action);
    }

    if (filters?.userId) {
      query += ` AND userId = ?`;
      params.push(filters.userId);
    }

    if (filters?.search) {
      query += ` AND (metadata LIKE ? OR message LIKE ? OR ip LIKE ?)`;
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (filters?.startDate) {
      query += ` AND timestamp >= ?`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ` AND timestamp <= ?`;
      params.push(filters.endDate);
    }

    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const results = stmt.all(...params);
    return LogDatabase.mapLogsFromDb(results);
  }

  public static getLogsByUser(userId: string, limit = 50, offset = 0): Log[] {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    const query = db.prepare(`
      SELECT * FROM logs 
      WHERE userId = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const results = query.all(userId, limit, offset);
    return LogDatabase.mapLogsFromDb(results);
  }

  public static getLogsByLevel(level: string, limit = 50, offset = 0): Log[] {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    const query = db.prepare(`
      SELECT * FROM logs 
      WHERE level = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const results = query.all(level, limit, offset);
    return LogDatabase.mapLogsFromDb(results);
  }

  public static getLogsByAction(action: string, limit = 50, offset = 0): Log[] {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    const query = db.prepare(`
      SELECT * FROM logs 
      WHERE action = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const results = query.all(action, limit, offset);
    return LogDatabase.mapLogsFromDb(results);
  }

  private static mapLogsFromDb(results: any[]): Log[] {
    return results.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
  }

  /** Supprime les entrées antérieures à `before` (ISO) ; renvoie leur nombre. */
  public static purgeOlderThan(before: string): number {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    const result = db.prepare("DELETE FROM logs WHERE timestamp < ?").run(before);
    return Number(result.changes ?? 0);
  }

  public static clearLogs(): void {
    const db = LogDatabase.getConnection();
    LogDatabase.initTable(db);

    const stmt = db.prepare("DELETE FROM logs");
    stmt.run();
  }
}

export const logDb = LogDatabase;
