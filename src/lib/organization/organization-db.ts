/**
 * Base des tags et des collections (docs/organisation.md, § 2) :
 * `data/organization.db`, à part des albums, tables créées au premier accès.
 *
 * Un fichier y est désigné par son nom, comme dans `album_files`. Les règles
 * pures (slugs, validation, évaluation d'une collection) sont dans `rules.ts`,
 * sans dépendance Bun, pour être testées sous Node.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { getAbsoluteUploadPath } from "@/lib/config";
import {
  TAGS_PER_FILE_MAX,
  cleanTagName,
  hasAnyRule,
  slugify,
  type Collection,
  type CollectionOrder,
  type CollectionRules,
  type CollectionSort,
  type Tag,
  type TagRef,
} from "./types";
import {
  OrganizationError,
  cleanCollectionDescription,
  cleanCollectionName,
  cleanTagDescription,
  parseCollectionRules,
  replaceRuleSlug,
  rulesFromJson,
  rulesTagSlugs,
  uniqueSlug,
} from "./rules";

interface TagRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface CollectionRow {
  id: number;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  rules: string;
  sort: string;
  sort_order: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTagInput {
  name: string;
  description?: string | null;
  createdBy?: string | null;
}

export interface UpdateTagInput {
  name?: string;
  description?: string | null;
}

export interface CollectionInput {
  name: string;
  description?: string | null;
  rules: CollectionRules;
  sort?: CollectionSort;
  order?: CollectionOrder;
  pinned?: boolean;
}

export interface BatchTagResult {
  /** Poses nouvelles (un fichier × un tag). */
  added: number;
  /** Poses retirées. */
  removed: number;
  /** Tags posés (créés au besoin). */
  tags: TagRef[];
  /** Fichiers qui avaient déjà `TAGS_PER_FILE_MAX` tags : une partie des ajouts y a été ignorée. */
  skipped: string[];
}

const now = () => new Date().toISOString();

function toSort(value: string | undefined): CollectionSort {
  return value === "name" || value === "size" ? value : "date";
}

function toOrder(value: string | undefined): CollectionOrder {
  return value === "asc" ? "asc" : "desc";
}

/** Noms des fichiers présents dans le dossier d'envoi. */
function readUploadNames(): Set<string> {
  try {
    return new Set(
      readdirSync(getAbsoluteUploadPath(), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name),
    );
  } catch {
    return new Set();
  }
}

class OrganizationDatabase {
  private static dbPath: string | null = null;
  private static connection: Database | null = null;

  private static getDbPath(): string {
    if (!OrganizationDatabase.dbPath) {
      if (process.env.ORGANIZATION_DB_PATH) {
        OrganizationDatabase.dbPath = process.env.ORGANIZATION_DB_PATH;
      } else {
        const dataDir = join(process.cwd(), "data");
        if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
        OrganizationDatabase.dbPath = join(dataDir, "organization.db");
      }
    }
    return OrganizationDatabase.dbPath;
  }

  /** Une connexion par processus, ouverte au premier accès. */
  public static getConnection(): Database {
    if (!OrganizationDatabase.connection) {
      const db = new Database(OrganizationDatabase.getDbPath(), { create: true });
      db.run("PRAGMA journal_mode = WAL");
      // Sans cette ligne, SQLite ignore ON DELETE CASCADE.
      db.run("PRAGMA foreign_keys = ON");
      OrganizationDatabase.initTables(db);
      OrganizationDatabase.connection = db;
    }
    return OrganizationDatabase.connection;
  }

  private static initTables(db: Database) {
    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS file_tags (
        file_name TEXT NOT NULL,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL,
        added_by TEXT,
        PRIMARY KEY (file_name, tag_id)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id)`);
    db.run(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        rules TEXT NOT NULL,
        sort TEXT NOT NULL DEFAULT 'date',
        sort_order TEXT NOT NULL DEFAULT 'desc',
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_id, slug)
      )
    `);
  }

  // ─── Tags ──────────────────────────────────────────────────────

  private static mapTag(row: TagRow, fileCount: number, lastUsedAt: string | null): Tag {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      fileCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      lastUsedAt,
    };
  }

  /** Compte et dernière pose de chaque tag, sur les fichiers encore présents. */
  private static tagStats(
    presentFiles: ReadonlySet<string>,
    tagId?: number,
  ): Map<number, { count: number; lastUsedAt: string | null }> {
    const db = OrganizationDatabase.getConnection();
    const rows = (
      tagId === undefined
        ? db.prepare("SELECT tag_id, file_name, added_at FROM file_tags").all()
        : db.prepare("SELECT tag_id, file_name, added_at FROM file_tags WHERE tag_id = ?").all(tagId)
    ) as { tag_id: number; file_name: string; added_at: string }[];
    const stats = new Map<number, { count: number; lastUsedAt: string | null }>();
    for (const row of rows) {
      if (!presentFiles.has(row.file_name)) continue;
      const entry = stats.get(row.tag_id) ?? { count: 0, lastUsedAt: null };
      entry.count++;
      if (!entry.lastUsedAt || row.added_at > entry.lastUsedAt) entry.lastUsedAt = row.added_at;
      stats.set(row.tag_id, entry);
    }
    return stats;
  }

  /**
   * Tous les tags, par nom. `fileCount` et `lastUsedAt` ne tiennent compte que
   * des fichiers encore sur le disque (`presentFiles`, lu dans le dossier
   * d'envoi par défaut).
   */
  public static listTags(presentFiles: ReadonlySet<string> = readUploadNames()): Tag[] {
    const db = OrganizationDatabase.getConnection();
    const rows = db.prepare("SELECT * FROM tags").all() as TagRow[];
    const stats = OrganizationDatabase.tagStats(presentFiles);
    return rows
      .map((row) => {
        const stat = stats.get(row.id);
        return OrganizationDatabase.mapTag(row, stat?.count ?? 0, stat?.lastUsedAt ?? null);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }

  private static tagRow(id: number): TagRow | null {
    return (OrganizationDatabase.getConnection().prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow | null) ?? null;
  }

  private static tagRowBySlug(slug: string): TagRow | null {
    return (
      (OrganizationDatabase.getConnection().prepare("SELECT * FROM tags WHERE slug = ?").get(slug) as TagRow | null) ?? null
    );
  }

  private static withStats(row: TagRow, presentFiles?: ReadonlySet<string>): Tag {
    const stat = OrganizationDatabase.tagStats(presentFiles ?? readUploadNames(), row.id).get(row.id);
    return OrganizationDatabase.mapTag(row, stat?.count ?? 0, stat?.lastUsedAt ?? null);
  }

  public static getTag(id: number, presentFiles?: ReadonlySet<string>): Tag | null {
    const row = OrganizationDatabase.tagRow(id);
    return row ? OrganizationDatabase.withStats(row, presentFiles) : null;
  }

  public static getTagBySlug(slug: string, presentFiles?: ReadonlySet<string>): Tag | null {
    const row = OrganizationDatabase.tagRowBySlug(slugify(slug));
    return row ? OrganizationDatabase.withStats(row, presentFiles) : null;
  }

  /** Le tag de ce nom, créé s'il n'existe pas ; deux noms au même slug sont le même tag. */
  private static ensureTag(name: string, createdBy: string | null, description: string | null = null): { row: TagRow; created: boolean } {
    const clean = cleanTagName(name);
    if (!clean) throw new OrganizationError("invalid_name", "Nom de tag vide ou invalide.");
    const slug = slugify(clean);
    const existing = OrganizationDatabase.tagRowBySlug(slug);
    if (existing) return { row: existing, created: false };
    const stamp = now();
    const result = OrganizationDatabase.getConnection()
      .prepare(
        "INSERT INTO tags (name, slug, description, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(clean, slug, description, stamp, stamp, createdBy);
    return { row: OrganizationDatabase.tagRow(Number(result.lastInsertRowid))!, created: true };
  }

  /** Crée un tag, ou rend celui qui a déjà ce slug (`created: false`, rien n'est changé). */
  public static createTag(input: CreateTagInput, presentFiles?: ReadonlySet<string>): { tag: Tag; created: boolean } {
    const description = cleanTagDescription(input.description);
    if (description === undefined) throw new OrganizationError("invalid_description", "Description trop longue.");
    const { row, created } = OrganizationDatabase.ensureTag(input.name, input.createdBy ?? null, description);
    return { tag: OrganizationDatabase.withStats(row, presentFiles), created };
  }

  /**
   * Renomme ou décrit un tag. Le slug suit le nouveau nom s'il ne heurte pas un
   * autre tag ; sinon il reste. Un slug changé est reporté dans les règles des
   * collections qui le citent.
   */
  public static updateTag(id: number, input: UpdateTagInput, presentFiles?: ReadonlySet<string>): Tag | null {
    const db = OrganizationDatabase.getConnection();
    const row = OrganizationDatabase.tagRow(id);
    if (!row) return null;

    let name = row.name;
    let slug = row.slug;
    if (input.name !== undefined) {
      const clean = cleanTagName(input.name);
      if (!clean) throw new OrganizationError("invalid_name", "Nom de tag vide ou invalide.");
      name = clean;
      const wanted = slugify(clean);
      if (wanted !== row.slug && !OrganizationDatabase.tagRowBySlug(wanted)) slug = wanted;
    }

    let description = row.description;
    if (input.description !== undefined) {
      const clean = cleanTagDescription(input.description);
      if (clean === undefined) throw new OrganizationError("invalid_description", "Description trop longue.");
      description = clean;
    }

    db.transaction(() => {
      db.prepare("UPDATE tags SET name = ?, slug = ?, description = ?, updated_at = ? WHERE id = ?").run(
        name,
        slug,
        description,
        now(),
        id,
      );
      if (slug !== row.slug) OrganizationDatabase.rewriteRuleSlug(row.slug, slug);
    })();
    return OrganizationDatabase.getTag(id, presentFiles);
  }

  /** Supprime un tag : il quitte les fichiers et les règles des collections. */
  public static deleteTag(id: number): boolean {
    const db = OrganizationDatabase.getConnection();
    const row = OrganizationDatabase.tagRow(id);
    if (!row) return false;
    db.transaction(() => {
      db.prepare("DELETE FROM file_tags WHERE tag_id = ?").run(id);
      db.prepare("DELETE FROM tags WHERE id = ?").run(id);
      OrganizationDatabase.rewriteRuleSlug(row.slug, null);
    })();
    return true;
  }

  /**
   * Fusionne `sourceId` dans `intoId` : les fichiers de la source portent la
   * cible, la source disparaît, les règles qui la citaient citent la cible.
   * Rend la cible, ou `null` si l'un des deux tags n'existe pas.
   */
  public static mergeTags(sourceId: number, intoId: number, presentFiles?: ReadonlySet<string>): Tag | null {
    if (sourceId === intoId) throw new OrganizationError("same_tag", "Un tag ne peut pas être fusionné dans lui-même.");
    const db = OrganizationDatabase.getConnection();
    const source = OrganizationDatabase.tagRow(sourceId);
    const target = OrganizationDatabase.tagRow(intoId);
    if (!source || !target) return null;
    db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO file_tags (file_name, tag_id, added_at, added_by)
         SELECT file_name, ?, added_at, added_by FROM file_tags WHERE tag_id = ?`,
      ).run(intoId, sourceId);
      db.prepare("DELETE FROM file_tags WHERE tag_id = ?").run(sourceId);
      db.prepare("DELETE FROM tags WHERE id = ?").run(sourceId);
      db.prepare("UPDATE tags SET updated_at = ? WHERE id = ?").run(now(), intoId);
      OrganizationDatabase.rewriteRuleSlug(source.slug, target.slug);
    })();
    return OrganizationDatabase.getTag(intoId, presentFiles);
  }

  /** Reporte un slug renommé (`to`) ou supprimé (`null`) dans toutes les collections. */
  private static rewriteRuleSlug(from: string, to: string | null) {
    const db = OrganizationDatabase.getConnection();
    const rows = db.prepare("SELECT id, rules FROM collections WHERE rules LIKE ?").all(`%"${from}"%`) as {
      id: number;
      rules: string;
    }[];
    const update = db.prepare("UPDATE collections SET rules = ?, updated_at = ? WHERE id = ?");
    for (const row of rows) {
      const rules = rulesFromJson(row.rules);
      if (!rulesTagSlugs(rules).includes(from)) continue;
      update.run(JSON.stringify(replaceRuleSlug(rules, from, to)), now(), row.id);
    }
  }

  // ─── Tags d'un fichier ─────────────────────────────────────────

  /** Tags posés sur un fichier, par nom. */
  public static getFileTags(fileName: string): TagRef[] {
    const rows = OrganizationDatabase.getConnection()
      .prepare(
        `SELECT t.id, t.name, t.slug FROM file_tags ft
         INNER JOIN tags t ON t.id = ft.tag_id
         WHERE ft.file_name = ?`,
      )
      .all(fileName) as TagRef[];
    return rows.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }

  /** Noms nettoyés, dédoublonnés par slug ; un nom vide est refusé. */
  private static cleanNames(names: readonly string[]): string[] {
    const bySlug = new Map<string, string>();
    for (const raw of names) {
      const name = cleanTagName(raw);
      if (!name) throw new OrganizationError("invalid_name", "Nom de tag vide ou invalide.");
      const slug = slugify(name);
      if (!bySlug.has(slug)) bySlug.set(slug, name);
    }
    return [...bySlug.values()];
  }

  /**
   * Remplace les tags d'un fichier par cette liste de noms ; les inconnus sont
   * créés. Les poses conservées gardent leur date.
   */
  public static setFileTags(fileName: string, names: readonly string[], userId: string | null = null): TagRef[] {
    const clean = OrganizationDatabase.cleanNames(names);
    if (clean.length > TAGS_PER_FILE_MAX) {
      throw new OrganizationError("too_many_tags", `Un fichier porte au plus ${TAGS_PER_FILE_MAX} tags.`);
    }
    const db = OrganizationDatabase.getConnection();
    db.transaction(() => {
      const ids = clean.map((name) => OrganizationDatabase.ensureTag(name, userId).row.id);
      const keep = new Set(ids);
      const current = db.prepare("SELECT tag_id FROM file_tags WHERE file_name = ?").all(fileName) as { tag_id: number }[];
      const remove = db.prepare("DELETE FROM file_tags WHERE file_name = ? AND tag_id = ?");
      for (const { tag_id } of current) if (!keep.has(tag_id)) remove.run(fileName, tag_id);
      const insert = db.prepare(
        "INSERT OR IGNORE INTO file_tags (file_name, tag_id, added_at, added_by) VALUES (?, ?, ?, ?)",
      );
      const stamp = now();
      for (const id of ids) insert.run(fileName, id, stamp, userId);
    })();
    return OrganizationDatabase.getFileTags(fileName);
  }

  /**
   * Pose et retire des tags sur une sélection. `add` : des noms (créés au
   * besoin) ; `remove` : des noms ou des slugs. Un fichier ne dépasse jamais
   * `TAGS_PER_FILE_MAX` tags : les ajouts en trop sont ignorés et le fichier
   * est cité dans `skipped`.
   */
  public static updateFilesTags(
    fileNames: readonly string[],
    changes: { add?: readonly string[]; remove?: readonly string[] },
    userId: string | null = null,
  ): BatchTagResult {
    const files = [...new Set(fileNames)];
    const addNames = OrganizationDatabase.cleanNames(changes.add ?? []);
    const removeSlugs = [...new Set((changes.remove ?? []).map(slugify).filter(Boolean))];
    const db = OrganizationDatabase.getConnection();
    const result: BatchTagResult = { added: 0, removed: 0, tags: [], skipped: [] };

    db.transaction(() => {
      if (removeSlugs.length) {
        const ids = removeSlugs
          .map((slug) => OrganizationDatabase.tagRowBySlug(slug)?.id)
          .filter((id): id is number => id !== undefined);
        const remove = db.prepare("DELETE FROM file_tags WHERE file_name = ? AND tag_id = ?");
        for (const file of files) for (const id of ids) result.removed += remove.run(file, id).changes;
      }
      if (addNames.length) {
        const rows = addNames.map((name) => OrganizationDatabase.ensureTag(name, userId).row);
        result.tags = rows.map(({ id, name, slug }) => ({ id, name, slug }));
        const count = db.prepare("SELECT tag_id FROM file_tags WHERE file_name = ?");
        const insert = db.prepare(
          "INSERT OR IGNORE INTO file_tags (file_name, tag_id, added_at, added_by) VALUES (?, ?, ?, ?)",
        );
        const stamp = now();
        for (const file of files) {
          const present = new Set((count.all(file) as { tag_id: number }[]).map((row) => row.tag_id));
          let skipped = false;
          for (const row of rows) {
            if (present.has(row.id)) continue;
            if (present.size >= TAGS_PER_FILE_MAX) {
              skipped = true;
              continue;
            }
            result.added += insert.run(file, row.id, stamp, userId).changes;
            present.add(row.id);
          }
          if (skipped) result.skipped.push(file);
        }
      }
    })();
    return result;
  }

  /** Slugs des tags de chaque fichier, lus en une seule requête. */
  public static tagsByFile(): Map<string, string[]> {
    const rows = OrganizationDatabase.getConnection()
      .prepare("SELECT ft.file_name, t.slug FROM file_tags ft INNER JOIN tags t ON t.id = ft.tag_id")
      .all() as { file_name: string; slug: string }[];
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.file_name);
      if (list) list.push(row.slug);
      else map.set(row.file_name, [row.slug]);
    }
    return map;
  }

  /**
   * Oublie les tags d'un fichier supprimé. Appelé après la suppression du
   * fichier : une erreur de la base est journalisée sans faire échouer la
   * suppression, déjà faite.
   */
  public static forgetFile(fileName: string): void {
    try {
      OrganizationDatabase.getConnection().prepare("DELETE FROM file_tags WHERE file_name = ?").run(fileName);
    } catch (error) {
      console.error("Tags du fichier supprimé non oubliés :", fileName, error);
    }
  }

  // ─── Collections ───────────────────────────────────────────────

  private static mapCollection(row: CollectionRow): Collection {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      rules: rulesFromJson(row.rules),
      sort: toSort(row.sort),
      order: toOrder(row.sort_order),
      userId: row.user_id,
      pinned: row.pinned === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Collections d'un compte : épinglées d'abord, puis les plus récemment modifiées. */
  public static listCollections(userId: string): Collection[] {
    const rows = OrganizationDatabase.getConnection()
      .prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC, id DESC")
      .all(userId) as CollectionRow[];
    return rows.map(OrganizationDatabase.mapCollection);
  }

  /** La collection de ce compte, ou `null` (inconnue, ou à un autre compte). */
  public static getCollection(id: number, userId: string): Collection | null {
    const row = OrganizationDatabase.getConnection()
      .prepare("SELECT * FROM collections WHERE id = ? AND user_id = ?")
      .get(id, userId) as CollectionRow | null;
    return row ? OrganizationDatabase.mapCollection(row) : null;
  }

  public static getCollectionBySlug(slug: string, userId: string): Collection | null {
    const row = OrganizationDatabase.getConnection()
      .prepare("SELECT * FROM collections WHERE slug = ? AND user_id = ?")
      .get(slug, userId) as CollectionRow | null;
    return row ? OrganizationDatabase.mapCollection(row) : null;
  }

  /** Par identifiant numérique ou par slug (`/organization/collections/<slug>`). */
  public static findCollection(idOrSlug: string | number, userId: string): Collection | null {
    const text = String(idOrSlug);
    return /^\d+$/.test(text)
      ? OrganizationDatabase.getCollection(Number(text), userId)
      : OrganizationDatabase.getCollectionBySlug(text, userId);
  }

  private static validRules(input: unknown): CollectionRules {
    const rules = parseCollectionRules(input);
    if (!rules) throw new OrganizationError("invalid_rules", "Règles de collection invalides.");
    if (!hasAnyRule(rules)) {
      throw new OrganizationError("empty_rules", "Une collection a besoin d’au moins une règle.");
    }
    return rules;
  }

  private static freeSlug(userId: string, name: string, exceptId?: number): string {
    const rows = OrganizationDatabase.getConnection()
      .prepare("SELECT id, slug FROM collections WHERE user_id = ?")
      .all(userId) as { id: number; slug: string }[];
    // « preview » est pris par la route `/api/collections/preview`.
    const taken = new Set(["preview", ...rows.filter((row) => row.id !== exceptId).map((row) => row.slug)]);
    return uniqueSlug(slugify(name), taken);
  }

  public static createCollection(userId: string, input: CollectionInput): Collection {
    const name = cleanCollectionName(input.name);
    if (!name) throw new OrganizationError("invalid_name", "Nom de collection vide.");
    const description = cleanCollectionDescription(input.description);
    if (description === undefined) throw new OrganizationError("invalid_description", "Description trop longue.");
    const rules = OrganizationDatabase.validRules(input.rules);
    const stamp = now();
    const result = OrganizationDatabase.getConnection()
      .prepare(
        `INSERT INTO collections (user_id, name, slug, description, rules, sort, sort_order, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        name,
        OrganizationDatabase.freeSlug(userId, name),
        description,
        JSON.stringify(rules),
        toSort(input.sort),
        toOrder(input.order),
        input.pinned ? 1 : 0,
        stamp,
        stamp,
      );
    return OrganizationDatabase.getCollection(Number(result.lastInsertRowid), userId)!;
  }

  /** Modifie une collection du compte ; le slug suit le nom. `null` si elle n'est pas à ce compte. */
  public static updateCollection(id: number, userId: string, patch: Partial<CollectionInput>): Collection | null {
    const current = OrganizationDatabase.getCollection(id, userId);
    if (!current) return null;

    let name = current.name;
    let slug = current.slug;
    if (patch.name !== undefined) {
      const clean = cleanCollectionName(patch.name);
      if (!clean) throw new OrganizationError("invalid_name", "Nom de collection vide.");
      name = clean;
      if (clean !== current.name) slug = OrganizationDatabase.freeSlug(userId, clean, id);
    }
    let description = current.description ?? null;
    if (patch.description !== undefined) {
      const clean = cleanCollectionDescription(patch.description);
      if (clean === undefined) throw new OrganizationError("invalid_description", "Description trop longue.");
      description = clean;
    }
    const rules = patch.rules !== undefined ? OrganizationDatabase.validRules(patch.rules) : current.rules;

    OrganizationDatabase.getConnection()
      .prepare(
        `UPDATE collections SET name = ?, slug = ?, description = ?, rules = ?, sort = ?, sort_order = ?, pinned = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        name,
        slug,
        description,
        JSON.stringify(rules),
        patch.sort !== undefined ? toSort(patch.sort) : current.sort,
        patch.order !== undefined ? toOrder(patch.order) : current.order,
        (patch.pinned ?? current.pinned) ? 1 : 0,
        now(),
        id,
        userId,
      );
    return OrganizationDatabase.getCollection(id, userId);
  }

  public static setCollectionPinned(id: number, userId: string, pinned: boolean): Collection | null {
    return OrganizationDatabase.updateCollection(id, userId, { pinned });
  }

  public static deleteCollection(id: number, userId: string): boolean {
    return (
      OrganizationDatabase.getConnection()
        .prepare("DELETE FROM collections WHERE id = ? AND user_id = ?")
        .run(id, userId).changes > 0
    );
  }
}

export const organizationDb = OrganizationDatabase;
