/**
 * Données de Scan Studio sur le disque. Tout vit dans `data/`, qui n'est ni
 * versionné ni copié dans l'image Docker.
 *
 *   data/folders/<id>.json    un dossier (une série)
 *   data/chapters/<id>.json   un chapitre et l'ordre de ses pages
 *   data/pages/<id>.json      une page et ses zones
 *   data/assets/              images d'origine et rendus, déposés par la route d'envoi
 *   data/thumbs/              vignettes, servies par la route des données
 *   data/exports.json         index des pages exportées, pour la galerie
 *   data/translation/         réglages, clés, compteurs, cache et mémoire de traduction
 *
 * Un fichier JSON par page : l'atelier enregistre souvent, et sauver une page
 * ne réécrit ni son chapitre ni ses voisines. Toutes les écritures passent par
 * un fichier temporaire puis un renommage.
 *
 * Ce fichier ne fait que lire et écrire. Les règles (qui peut supprimer quoi,
 * dans quel ordre) sont dans `server/library.ts`.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { MODULE_NAME, isId, type ScanChapter, type ScanFolder, type ScanPage } from "./types";

// ─── Emplacements ────────────────────────────────────────────────

let dataRootOverride: string | null = null;

/**
 * Déplace les données ailleurs, pour les tests : ils ne doivent jamais écrire
 * dans le vrai `data/`. `null` rétablit l'emplacement normal. En service, la
 * route d'envoi et la route des données ne connaissent que l'emplacement
 * normal : ne pas s'en servir hors des tests.
 */
export function setDataRoot(directory: string | null) {
  dataRootOverride = directory;
}

/** Lu à chaque appel, jamais figé au chargement du fichier. */
export function dataRoot(): string {
  return dataRootOverride ?? path.join(process.cwd(), "modules", MODULE_NAME, "data");
}

type Area = "folders" | "chapters" | "pages" | "assets" | "thumbs";
const AREAS: Area[] = ["folders", "chapters", "pages", "assets", "thumbs"];

// `dataRoot()` peut être déplacé par les tests : le build ne peut pas borner ce
// chemin, et sans cette mention il suivrait tout le projet à la trace.
const areaDir = (area: Area) => path.join(/* turbopackIgnore: true */ dataRoot(), area);

export function ensureDirs() {
  for (const area of AREAS) fs.mkdirSync(areaDir(area), { recursive: true });
}

// ─── JSON ────────────────────────────────────────────────────────

/** Une page n'a aucune raison de peser plus : ce sont des tracés et du texte, pas des images. */
const MAX_JSON_BYTES = 4 * 1024 * 1024;

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Écriture par fichier temporaire puis renommage : une coupure ne laisse pas un JSON tronqué. */
// `mode` restreint les droits du fichier (secrets), `maxBytes` remplace le
// plafond d'une page pour les fichiers de la traduction (cache, mémoire).
export function writeJson(file: string, value: unknown, options: { mode?: number; maxBytes?: number } = {}) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > (options.maxBytes ?? MAX_JSON_BYTES)) {
    throw new Error("Trop de données à enregistrer d'un coup : allégez la page (traits de pinceau, historique).");
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, serialized, options.mode ? { mode: options.mode } : {});
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

// ─── Identifiants ────────────────────────────────────────────────

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Douze caractères, comme `newId` côté navigateur, et libre dans le répertoire visé. */
function freshId(area: "folders" | "chapters" | "pages"): string {
  for (;;) {
    const id = Array.from(randomBytes(12), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");
    if (!fs.existsSync(path.join(areaDir(area), `${id}.json`))) return id;
  }
}

export const newFolderId = () => freshId("folders");
export const newChapterId = () => freshId("chapters");
export const newPageId = () => freshId("pages");

// ─── Dossiers, chapitres, pages ──────────────────────────────────

/**
 * Lit une fiche par son identifiant. Un identifiant mal formé, un fichier
 * absent ou illisible donnent tous `null` : l'appelant lève « introuvable ».
 */
function readEntity<T extends { id: string }>(area: "folders" | "chapters" | "pages", id: unknown): T | null {
  if (!isId(id)) return null;
  const entity = readJson<T>(path.join(areaDir(area), `${id}.json`));
  return entity && typeof entity === "object" && entity.id === id ? entity : null;
}

function writeEntity(area: "folders" | "chapters" | "pages", entity: { id: string }) {
  if (!isId(entity.id)) throw new Error("Identifiant invalide.");
  writeJson(path.join(areaDir(area), `${entity.id}.json`), entity);
}

function removeEntity(area: "folders" | "chapters" | "pages", id: string) {
  if (isId(id)) fs.rmSync(path.join(areaDir(area), `${id}.json`), { force: true });
}

function listIds(area: "folders" | "chapters" | "pages"): string[] {
  try {
    // Le chemin dépend de `setDataRoot` (les tests) : sans cette mention, le
    // build suivrait tout le projet à la trace pour trouver ce qu'il peut lire.
    return fs
      .readdirSync(/* turbopackIgnore: true */ areaDir(area))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5))
      .filter(isId);
  } catch {
    return [];
  }
}

export const readFolder = (id: unknown) => readEntity<ScanFolder>("folders", id);
export const writeFolder = (folder: ScanFolder) => writeEntity("folders", folder);
export const removeFolder = (id: string) => removeEntity("folders", id);

export const readChapter = (id: unknown) => readEntity<ScanChapter>("chapters", id);
export const writeChapter = (chapter: ScanChapter) => writeEntity("chapters", chapter);
export const removeChapter = (id: string) => removeEntity("chapters", id);

export const readPage = (id: unknown) => readEntity<ScanPage>("pages", id);
export const writePage = (page: ScanPage) => writeEntity("pages", page);
export const removePage = (id: string) => removeEntity("pages", id);

/** Tous les dossiers lisibles, sans ordre particulier. */
export function readAllFolders(): ScanFolder[] {
  return listIds("folders").flatMap((id) => readFolder(id) ?? []);
}

/** Toutes les pages lisibles : sert à savoir quels fichiers sont encore utilisés. */
export function readAllPages(): ScanPage[] {
  return listIds("pages").flatMap((id) => readPage(id) ?? []);
}

// ─── Images ──────────────────────────────────────────────────────

/** Nom donné par la route d'envoi des modules : horodatage, dix chiffres hexadécimaux, extension d'image. */
const ASSET_PATTERN = /^\d{10,16}-[0-9a-f]{10}\.(?:png|jpg|gif|webp)$/;

export type AssetExtension = "png" | "jpg" | "gif" | "webp";

export function isAssetName(value: unknown): value is string {
  return typeof value === "string" && ASSET_PATTERN.test(value);
}

export const assetPath = (file: string) => path.join(areaDir("assets"), file);
export const thumbPath = (file: string) => path.join(areaDir("thumbs"), file);

/** Nom neuf, du même gabarit que ceux de la route d'envoi. */
export function newAssetName(extension: AssetExtension): string {
  for (;;) {
    const name = `${Date.now()}-${randomBytes(5).toString("hex")}.${extension}`;
    if (!fs.existsSync(assetPath(name))) return name;
  }
}

export function assetExists(file: string): boolean {
  try {
    return isAssetName(file) && fs.statSync(assetPath(file)).isFile();
  } catch {
    return false;
  }
}

export function removeAsset(file: string) {
  if (isAssetName(file)) fs.rmSync(assetPath(file), { force: true });
}

/** Vignette de l'image d'origine d'une page. */
export const pageThumbName = (pageId: string) => `${pageId}.webp`;
/** Vignette d'un rendu : elle porte le nom du rendu, et change donc d'adresse avec lui. */
export const exportThumbName = (file: string) => `${file.slice(0, file.lastIndexOf("."))}.webp`;

export function removeThumb(file: string) {
  if (/^[a-z0-9-]+\.webp$/.test(file)) fs.rmSync(thumbPath(file), { force: true });
}

/** Adresses servies aux comptes connectés par la route des données du module. */
export const assetUrl = (file: string) => `/api/modules/${MODULE_NAME}/data/assets/${file}`;
export const thumbUrl = (file: string) => `/api/modules/${MODULE_NAME}/data/thumbs/${file}`;

/**
 * Fichiers de `assets/` encore utilisés par une page, comme image d'origine ou
 * comme rendu, sans compter les pages sur le point de disparaître.
 */
export function referencedAssets(ignoredPageIds: ReadonlySet<string> = new Set()): Set<string> {
  const files = new Set<string>();
  for (const page of readAllPages()) {
    if (ignoredPageIds.has(page.id)) continue;
    if (page.source?.file) files.add(page.source.file);
    if (page.exported?.file) files.add(page.exported.file);
  }
  for (const id of listIds("folders")) {
    const cover = readEntity<ScanFolder>("folders", id)?.cover?.file;
    if (cover) files.add(cover);
  }
  return files;
}

// ─── Index des pages exportées ───────────────────────────────────

/**
 * Une page exportée, telle que la galerie en a besoin. L'index évite de relire
 * toutes les pages à chaque ouverture de la galerie ; la page reste la
 * référence (`exported`), l'index s'en reconstruit s'il manque.
 */
export interface ExportEntry {
  pageId: string;
  chapterId: string;
  pageName: string;
  /** Rendu, dans `assets/`. */
  file: string;
  at: number;
  /** Nom de la copie dans la galerie, une fois le rendu envoyé. */
  galleryFile?: string;
}

const exportsFile = () => path.join(dataRoot(), "exports.json");

export function readExports(): ExportEntry[] {
  const stored = readJson<ExportEntry[]>(exportsFile());
  if (Array.isArray(stored)) return stored.filter((entry) => entry && isId(entry.pageId) && isAssetName(entry.file));

  const rebuilt: ExportEntry[] = readAllPages().flatMap((page) =>
    page.exported && isAssetName(page.exported.file)
      ? [{ pageId: page.id, chapterId: page.chapterId, pageName: page.name, file: page.exported.file, at: page.exported.at }]
      : []
  );
  if (rebuilt.length > 0) writeExports(rebuilt);
  return rebuilt;
}

export function writeExports(entries: ExportEntry[]) {
  writeJson(exportsFile(), entries);
}
