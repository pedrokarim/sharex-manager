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
  isPublic?: boolean;
  publicSlug?: string;
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

export class AlbumsDatabase {
  private static dbPath: string;

  private static initDbPath() {
    if (!AlbumsDatabase.dbPath) {
      const dataDir = join(process.cwd(), "data");
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      AlbumsDatabase.dbPath = join(dataDir, "albums.db"); // Base de données séparée pour les albums
    }
    return AlbumsDatabase.dbPath;
  }

  public static getConnection(): Database {
    const db = new Database(AlbumsDatabase.initDbPath(), { create: true });
    db.run("PRAGMA journal_mode = WAL");
    AlbumsDatabase.initTables(db);
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
        file_count INTEGER DEFAULT 0,
        is_public INTEGER DEFAULT 0,
        public_slug TEXT UNIQUE
      )
    `);

    // Migration : Ajouter les colonnes is_public et public_slug si elles n'existent pas
    try {
      db.run(`ALTER TABLE albums ADD COLUMN is_public INTEGER DEFAULT 0`);
    } catch (e) {
      // La colonne existe déjà, ignorer l'erreur
    }
    try {
      // SQLite ne permet pas d'ajouter UNIQUE directement dans ALTER TABLE
      db.run(`ALTER TABLE albums ADD COLUMN public_slug TEXT`);
    } catch (e) {
      // La colonne existe déjà, ignorer l'erreur
    }

    // Index pour les recherches publiques
    // Note: L'unicité du slug est gérée au niveau applicatif dans generateUniqueSlug
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_albums_public_slug ON albums(public_slug)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_albums_is_public ON albums(is_public)`
    );

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

  public static getAlbumByPublicSlug(publicSlug: string): Album | null {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`
      SELECT * FROM albums 
      WHERE public_slug = ? AND is_public = 1
    `);
    const result = query.get(publicSlug);

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

    if (updates.isPublic !== undefined) {
      fields.push("is_public = ?");
      values.push(updates.isPublic ? 1 : 0);
    }

    if (updates.publicSlug !== undefined) {
      fields.push("public_slug = ?");
      values.push(updates.publicSlug || null);
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

  public static getAlbumsForFile(fileName: string): Album[] {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`
      SELECT a.* FROM albums a
      INNER JOIN album_files af ON a.id = af.album_id
      WHERE af.file_name = ?
      ORDER BY a.name
    `);

    const albums = query.all(fileName) as any[];
    return albums.map((album) => ({
      id: album.id,
      name: album.name,
      description: album.description,
      createdAt: album.created_at,
      updatedAt: album.created_at, // Utiliser createdAt comme updatedAt pour l'instant
      fileCount: 0, // On ne calcule pas le fileCount ici pour optimiser
    }));
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

    // Mettre à jour le compteur de fichiers après tous les ajouts
    AlbumsDatabase.updateFileCount(albumId);

    return addedFiles;
  }

  public static removeFilesFromAlbum(
    albumId: number,
    fileNames: string[]
  ): boolean {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    let totalChanges = 0;

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

  public static getAlbumFileEntries(albumId: number): Array<{ fileName: string; addedAt: string }> {
    const db = AlbumsDatabase.getConnection();
    AlbumsDatabase.initTables(db);

    const query = db.prepare(`
      SELECT file_name, added_at FROM album_files
      WHERE album_id = ?
      ORDER BY added_at DESC
    `);

    const results = query.all(albumId);
    return results.map((row: any) => ({
      fileName: row.file_name,
      addedAt: row.added_at,
    }));
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

  public static generateUniqueSlug(
    baseName: string,
    excludeId?: number
  ): string {
    const db = AlbumsDatabase.getConnection();

    // Générer un slug à partir du nom
    const baseSlug = baseName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
      .replace(/[^a-z0-9]+/g, "-") // Remplacer les caractères spéciaux par des tirets
      .replace(/^-+|-+$/g, "") // Supprimer les tirets en début/fin
      .substring(0, 50); // Limiter la longueur

    let slug = baseSlug || "album";
    let counter = 0;
    let isUnique = false;

    while (!isUnique) {
      const checkQuery = db.prepare(`
        SELECT id FROM albums WHERE public_slug = ? AND (? IS NULL OR id != ?)
      `);
      const existing = checkQuery.get(
        slug,
        excludeId || null,
        excludeId || null
      );

      if (!existing) {
        isUnique = true;
      } else {
        counter++;
        slug = `${baseSlug}-${counter}`;
      }
    }

    return slug;
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
      // Gérer les colonnes qui pourraient ne pas exister dans les anciennes bases de données
      isPublic: row.hasOwnProperty("is_public")
        ? Boolean(row.is_public)
        : false,
      publicSlug: row.hasOwnProperty("public_slug")
        ? row.public_slug || undefined
        : undefined,
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
