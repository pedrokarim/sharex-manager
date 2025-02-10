import type { Log, CreateLogOptions } from "@/lib/types/logs";
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

interface Statement {
  run: (params?: Record<string, any>) => { lastInsertRowid?: number };
  all: (params?: Record<string, any>) => any[];
}

class LogDatabase {
  private db: Database.Database;
  private static instance: LogDatabase;

  private constructor() {
    const dataDir = join(process.cwd(), "data");
    // Créer le dossier data s'il n'existe pas
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = join(dataDir, "logs.db");
    this.db = new Database(dbPath);
    this.init();
  }

  public static getInstance(): LogDatabase {
    if (!LogDatabase.instance) {
      LogDatabase.instance = new LogDatabase();
    }
    return LogDatabase.instance;
  }

  private init() {
    const stmt = this.db.prepare(`
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
    stmt.run();
  }

  public createLog(options: CreateLogOptions): Log {
    const timestamp = new Date().toISOString();
    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;

    const query = this.db.prepare(`
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

  public getLogs(
    limit = 50,
    offset = 0,
    filters?: {
      level?: string;
      action?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Log[] {
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

    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    return this.mapLogsFromDb(results);
  }

  public getLogsByUser(userId: string, limit = 50, offset = 0): Log[] {
    const query = this.db.prepare(`
      SELECT * FROM logs 
      WHERE userId = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const results = query.all(userId, limit, offset);
    return this.mapLogsFromDb(results);
  }

  public getLogsByLevel(level: string, limit = 50, offset = 0): Log[] {
    const query = this.db.prepare(`
      SELECT * FROM logs 
      WHERE level = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const results = query.all(level, limit, offset);
    return this.mapLogsFromDb(results);
  }

  public getLogsByAction(action: string, limit = 50, offset = 0): Log[] {
    const query = this.db.prepare(`
      SELECT * FROM logs 
      WHERE action = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const results = query.all(action, limit, offset);
    return this.mapLogsFromDb(results);
  }

  private mapLogsFromDb(results: any[]): Log[] {
    return results.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
  }

  public clearLogs(): void {
    const stmt = this.db.prepare("DELETE FROM logs");
    stmt.run();
  }
}

export const logDb = LogDatabase.getInstance();
