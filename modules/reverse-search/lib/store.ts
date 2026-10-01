/**
 * Données du module sur le disque : l'historique des recherches, leurs images
 * et les clés d'API. Tout vit dans `data/`, qui n'est ni versionné ni copié
 * dans l'image Docker.
 */

import fs from "fs";
import path from "path";
import type { KeyName, SearchRecord } from "./types";

export const MODULE_NAME = "reverse-search";
const DATA_DIR = path.join(process.cwd(), "modules", MODULE_NAME, "data");
export const QUERIES_DIR = path.join(DATA_DIR, "queries");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");

/** Au-delà, les recherches les plus anciennes sont oubliées, images comprises. */
const MAX_HISTORY = 500;

function ensureDirs() {
  fs.mkdirSync(QUERIES_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Écriture par fichier temporaire puis renommage : une coupure ne laisse pas un JSON tronqué. */
function writeJson(file: string, value: unknown, mode?: number) {
  ensureDirs();
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), mode ? { mode } : {});
  fs.renameSync(temporary, file);
}

// ─── Historique ──────────────────────────────────────────────────

/** Du plus récent au plus ancien. */
export function readHistory(): SearchRecord[] {
  const records = readJson<SearchRecord[]>(HISTORY_FILE, []);
  return Array.isArray(records) ? records : [];
}

function writeHistory(records: SearchRecord[]) {
  for (const dropped of records.slice(MAX_HISTORY)) removeQueryFiles(dropped.id);
  writeJson(HISTORY_FILE, records.slice(0, MAX_HISTORY));
}

/** Ajoute une recherche, ou remplace celle de même identifiant. */
export function saveRecord(record: SearchRecord) {
  const records = readHistory();
  const at = records.findIndex((entry) => entry.id === record.id);
  if (at === -1) records.unshift(record);
  else records[at] = record;
  writeHistory(records);
}

export function findRecord(id: string): SearchRecord | undefined {
  return readHistory().find((entry) => entry.id === id);
}

export function removeRecord(id: string): boolean {
  const records = readHistory();
  const kept = records.filter((entry) => entry.id !== id);
  if (kept.length === records.length) return false;
  removeQueryFiles(id);
  writeHistory(kept);
  return true;
}

export function clearRecords(): number {
  const records = readHistory();
  for (const record of records) removeQueryFiles(record.id);
  writeHistory([]);
  return records.length;
}

// ─── Images des recherches ───────────────────────────────────────

/** Un identifiant de recherche ne contient que des lettres, des chiffres et des tirets. */
export function isSearchId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{8,40}$/.test(value);
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const originalFileName = (id: string, mimeType: string) => `${id}.${EXTENSIONS[mimeType] ?? "bin"}`;
export const thumbFileName = (id: string) => `${id}-thumb.webp`;

export function writeQueryFiles(id: string, mimeType: string, original: Buffer, thumbnail: Buffer) {
  ensureDirs();
  fs.writeFileSync(path.join(QUERIES_DIR, originalFileName(id, mimeType)), original);
  fs.writeFileSync(path.join(QUERIES_DIR, thumbFileName(id)), thumbnail);
}

export function readOriginal(record: SearchRecord): Buffer | null {
  try {
    return fs.readFileSync(path.join(QUERIES_DIR, originalFileName(record.id, record.query.mimeType)));
  } catch {
    return null;
  }
}

function removeQueryFiles(id: string) {
  if (!isSearchId(id) || !fs.existsSync(QUERIES_DIR)) return;
  for (const file of fs.readdirSync(QUERIES_DIR)) {
    if (file.startsWith(`${id}.`) || file === thumbFileName(id)) {
      fs.rmSync(path.join(QUERIES_DIR, file), { force: true });
    }
  }
}

/** Adresse, servie aux comptes connectés, de l'aperçu d'une recherche enregistrée. */
export const thumbUrl = (id: string) => `/api/modules/${MODULE_NAME}/data/queries/${thumbFileName(id)}`;

// ─── Clés d'API ──────────────────────────────────────────────────

const KEY_ENV: Record<KeyName, string> = {
  saucenao: "SAUCENAO_API_KEY",
  tracemoe: "TRACE_MOE_API_KEY",
  serpapi: "SERPAPI_API_KEY",
};

export const KEY_NAMES = Object.keys(KEY_ENV) as KeyName[];

export function isKeyName(value: unknown): value is KeyName {
  return typeof value === "string" && value in KEY_ENV;
}

const fromEnv = (name: KeyName) => process.env[KEY_ENV[name]]?.trim() || undefined;

/** Une variable d'environnement prime sur le fichier, comme pour les autres modules. */
export function readKeys(): Partial<Record<KeyName, string>> {
  const stored = readJson<Partial<Record<KeyName, string>>>(SECRETS_FILE, {});
  const keys: Partial<Record<KeyName, string>> = {};
  for (const name of KEY_NAMES) {
    const value = fromEnv(name) ?? (typeof stored[name] === "string" ? stored[name]!.trim() : undefined);
    if (value) keys[name] = value;
  }
  return keys;
}

export function keyStatus(): Record<KeyName, { configured: boolean; fromEnv: boolean }> {
  const keys = readKeys();
  return Object.fromEntries(
    KEY_NAMES.map((name) => [name, { configured: Boolean(keys[name]), fromEnv: Boolean(fromEnv(name)) }])
  ) as Record<KeyName, { configured: boolean; fromEnv: boolean }>;
}

/** Enregistre une clé, ou l'efface si elle est vide. */
export function writeKey(name: KeyName, value: string) {
  const stored = readJson<Partial<Record<KeyName, string>>>(SECRETS_FILE, {});
  const clean = value.trim();
  if (clean) stored[name] = clean;
  else delete stored[name];
  writeJson(SECRETS_FILE, stored, 0o600);
}
