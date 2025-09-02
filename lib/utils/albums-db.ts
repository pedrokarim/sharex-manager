import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export interface Album {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  thumbnailFile?: string;
  fileCount: number;
}

export interface AlbumFile {
  id: number;
  albumId: number;
  fileName: string;
  addedAt: string;
}

export interface CreateAlbumOptions {
  name: string;
  description?: string;
  userId?: string;
}

export interface AlbumWithFiles extends Album {
  files: string[];
}

class AlbumsDatabase {
  private static dbPath: string;

  private static initDbPath() {
    if (!AlbumsDatabase.dbPath) {
      const dataDir = join(process.cwd(), "data");
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      AlbumsDatabase.dbPath = join(dataDir, "logs.db"); // Utilise la même DB que les logs
    }
    return AlbumsDatabase.dbPath;
  }

  private static getConnection(): Database {
    const db = new Database(AlbumsDatabase.initDbPath(), { create: true });
    db.run("PRAGMA journal_mode = WAL");
    return db;
  }

  private static initTables(db: Database) {
    // Table des albums
    db.run(`
      CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user_id TEXT,
        thumbnail_file TEXT,
        file_count INTEGER DEFAULT 0
      )
    `);

    // Table de liaison albums-fichiers
    db.run(`
      CREATE TABLE IF NOT EXISTS album_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        added_at TEXT NOT NULL,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
        UNIQUE(album_id, file_name)
      )
    `);

    // Index pour les performances
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_album_files_album_id ON album_files(album_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_album_files_file_name ON album_files(file_name)`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id)`);
  }

  // CRUD Albums
  public static createAlbum(options: CreateAlbumOptions): Album {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const timestamp = new Date().toISOString();

    const query = db.prepare(`
      INSERT INTO albums (name, description, created_at, updated_at, user_id, file_count)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    const result = query.run(
      options.name,
      options.description || null,
      timestamp,
      timestamp,
      options.userId || null
    );

    return {
      id: Number(result.lastInsertRowid || 0),
      name: options.name,
      description: options.description,
      createdAt: timestamp,
      updatedAt: timestamp,
      userId: options.userId,
      fileCount: 0,
    };
  }

  public static getAlbum(id: number): Album | null {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`SELECT * FROM albums WHERE id = ?`);
    const result = query.get(id);

    return result ? AlbumsDatabase.mapAlbumFromDb(result) : null;
  }

  public static getAlbums(userId?: string): Album[] {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    let query: any;
    let results: any[];

    try {
      if (userId) {
        query = db.prepare(`
          SELECT * FROM albums 
          WHERE user_id = ? OR user_id IS NULL
          ORDER BY updated_at DESC
        `);
        results = query.all(userId);
      } else {
        query = db.prepare(`
          SELECT * FROM albums 
          ORDER BY updated_at DESC
        `);
        results = query.all();
      }

      return results.map(AlbumsDatabase.mapAlbumFromDb);
    } catch (error) {
      console.error("Error in getAlbums:", error);
      throw new Error(
        `Failed to retrieve albums: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public static updateAlbum(id: number, updates: Partial<Album>): Album | null {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const timestamp = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description);
    }

    if (updates.thumbnailFile !== undefined) {
      fields.push("thumbnail_file = ?");
      values.push(updates.thumbnailFile);
    }

    if (fields.length === 0) {
      return AlbumsDatabase.getAlbum(id);
    }

    fields.push("updated_at = ?");
    values.push(timestamp);
    values.push(id);

    const query = db.prepare(`
      UPDATE albums 
      SET ${fields.join(", ")} 
      WHERE id = ?
    `);

    query.run(...values);
    return AlbumsDatabase.getAlbum(id);
  }

  public static deleteAlbum(id: number): boolean {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`DELETE FROM albums WHERE id = ?`);
    const result = query.run(id);

    return (result.changes || 0) > 0;
  }

  // Gestion des fichiers dans les albums
  public static addFilesToAlbum(
    albumId: number,
    fileNames: string[]
  ): AlbumFile[] {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const timestamp = new Date().toISOString();
    const addedFiles: AlbumFile[] = [];

    db.transaction(() => {
      const insertQuery = db.prepare(`
        INSERT OR IGNORE INTO album_files (album_id, file_name, added_at)
        VALUES (?, ?, ?)
      `);

      for (const fileName of fileNames) {
        const result = insertQuery.run(albumId, fileName, timestamp);
        if (result.changes && result.changes > 0) {
          addedFiles.push({
            id: Number(result.lastInsertRowid || 0),
            albumId,
            fileName,
            addedAt: timestamp,
          });
        }
      }

      // Mettre à jour le compteur de fichiers
      AlbumsDatabase.updateFileCount(albumId);
    })();

    return addedFiles;
  }

  public static removeFilesFromAlbum(
    albumId: number,
    fileNames: string[]
  ): boolean {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    let totalChanges = 0;

    db.transaction(() => {
      const deleteQuery = db.prepare(`
        DELETE FROM album_files 
        WHERE album_id = ? AND file_name = ?
      `);

      for (const fileName of fileNames) {
        const result = deleteQuery.run(albumId, fileName);
        totalChanges += result.changes || 0;
      }

      // Mettre à jour le compteur de fichiers
      AlbumsDatabase.updateFileCount(albumId);
    })();

    return totalChanges > 0;
  }

  public static getAlbumFiles(albumId: number): string[] {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`
      SELECT file_name FROM album_files 
      WHERE album_id = ? 
      ORDER BY added_at DESC
    `);

    const results = query.all(albumId);
    return results.map((row: any) => row.file_name);
  }

  public static getFileAlbums(fileName: string): Album[] {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`
      SELECT a.* FROM albums a
      INNER JOIN album_files af ON a.id = af.album_id
      WHERE af.file_name = ?
      ORDER BY a.name
    `);

    const results = query.all(fileName);
    return results.map(AlbumsDatabase.mapAlbumFromDb);
  }

  public static removeFileFromAllAlbums(fileName: string): boolean {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    let totalChanges = 0;

    db.transaction(() => {
      // Récupérer les albums affectés
      const getAffectedQuery = db.prepare(`
        SELECT DISTINCT album_id FROM album_files WHERE file_name = ?
      `);
      const affectedAlbums = getAffectedQuery.all(fileName);

      // Supprimer le fichier de tous les albums
      const deleteQuery = db.prepare(`
        DELETE FROM album_files WHERE file_name = ?
      `);
      const result = deleteQuery.run(fileName);
      totalChanges = result.changes || 0;

      // Mettre à jour les compteurs de fichiers pour tous les albums affectés
      for (const album of affectedAlbums) {
        AlbumsDatabase.updateFileCount((album as any).album_id);
      }
    })();

    return totalChanges > 0;
  }

  // Utilitaires
  private static updateFileCount(albumId: number) {
    const db = AlbumsDatabase.getConnection();

    const countQuery = db.prepare(`
      SELECT COUNT(*) as count FROM album_files WHERE album_id = ?
    `);
    const countResult = countQuery.get(albumId) as any;
    const fileCount = countResult?.count || 0;

    const updateQuery = db.prepare(`
      UPDATE albums SET file_count = ?, updated_at = ? WHERE id = ?
    `);
    updateQuery.run(fileCount, new Date().toISOString(), albumId);
  }

  private static mapAlbumFromDb(row: any): Album {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      thumbnailFile: row.thumbnail_file,
      fileCount: row.file_count || 0,
    };
  }

  // Méthodes de recherche et statistiques
  public static searchAlbums(query: string, userId?: string): Album[] {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    let sqlQuery: any;
    let results: any[];

    try {
      if (userId) {
        sqlQuery = db.prepare(`
          SELECT * FROM albums 
          WHERE (user_id = ? OR user_id IS NULL) AND name LIKE ?
          ORDER BY name
        `);
        results = sqlQuery.all(userId, `%${query}%`);
      } else {
        sqlQuery = db.prepare(`
          SELECT * FROM albums 
          WHERE name LIKE ?
          ORDER BY name
        `);
        results = sqlQuery.all(`%${query}%`);
      }

      return results.map(AlbumsDatabase.mapAlbumFromDb);
    } catch (error) {
      console.error("Error in searchAlbums:", error);
      throw new Error(
        `Failed to search albums: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public static getAlbumsStats(userId?: string): {
    totalAlbums: number;
    totalFiles: number;
    averageFilesPerAlbum: number;
  } {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    let query: any;
    let result: any;

    if (userId) {
      query = db.prepare(`
        SELECT 
          COUNT(*) as totalAlbums,
          SUM(file_count) as totalFiles,
          AVG(file_count) as averageFilesPerAlbum
        FROM albums 
        WHERE user_id = ? OR user_id IS NULL
      `);
      result = query.get(userId);
    } else {
      query = db.prepare(`
        SELECT 
          COUNT(*) as totalAlbums,
          SUM(file_count) as totalFiles,
          AVG(file_count) as averageFilesPerAlbum
        FROM albums
      `);
      result = query.get();
    }

    return {
      totalAlbums: result?.totalAlbums || 0,
      totalFiles: result?.totalFiles || 0,
      averageFilesPerAlbum: Math.round(result?.averageFilesPerAlbum || 0),
    };
  }
}

export const albumsDb = AlbumsDatabase;
