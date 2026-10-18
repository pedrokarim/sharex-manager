/**
 * Stockage des clés API : `data/api-keys.json`, seul chemin du fichier dans
 * le code.
 *
 * Le serveur ne garde que l'empreinte SHA-256 de chaque clé et un préfixe
 * d'affichage (`sk_` + six caractères). La clé complète est tirée ici, par le
 * serveur seul, et n'est remise qu'une fois, à la création.
 *
 * Migration transparente : une entrée ancienne qui porte encore la clé en
 * clair (`key`) est convertie à la première lecture, puis réécrite sans elle.
 * La clé déjà distribuée (configuration ShareX, application mobile) continue
 * de fonctionner : son empreinte est la même.
 *
 * Les écritures passent par une file d'attente propre au processus et par un
 * fichier temporaire renommé ensuite : deux envois simultanés ne se volent
 * plus la mise à jour de « dernière utilisation », et une coupure ne laisse
 * jamais un JSON tronqué.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import type { ApiKey, ApiKeyPermissions, ApiKeyView } from "@/types/api-key";

export const API_KEYS_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "api-keys.json");

const KEY_PREFIX = "sk_";
const DISPLAY_CHARS = 6;

let pathOverride: string | null = null;

/** Déplace le fichier ailleurs, pour les tests. `null` rétablit l'emplacement normal. */
export function setApiKeysPath(file: string | null) {
  pathOverride = file;
}

export function apiKeysPath(): string {
  return pathOverride ?? API_KEYS_FILE;
}

// ─── Clés ─────────────────────────────────────────────────────────

/** Empreinte SHA-256 (hexadécimal) d'une clé. */
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Début de la clé, pour la reconnaître dans une liste. Une ancienne clé
 * saisie à la main peut être courte : on en montre au plus un quart.
 */
export function displayPrefix(secret: string): string {
  const prefixed = secret.startsWith(KEY_PREFIX);
  const body = prefixed ? secret.slice(KEY_PREFIX.length) : secret;
  const shown = Math.min(DISPLAY_CHARS, Math.floor(body.length / 4));
  return `${prefixed ? KEY_PREFIX : ""}${body.slice(0, shown)}`;
}

/** Nouvelle clé : `sk_` + 43 caractères tirés de 32 octets aléatoires (CSPRNG). */
export function generateApiKeySecret(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** Retrouve la clé correspondant au secret présenté, par comparaison d'empreintes à temps constant. */
export function findApiKeyBySecret(keys: ApiKey[], secret: string): ApiKey | null {
  if (!secret) return null;
  const presented = Buffer.from(hashApiKey(secret), "hex");
  let found: ApiKey | null = null;
  // Toutes les entrées sont comparées, même après une correspondance.
  for (const key of keys) {
    if (typeof key.hash !== "string" || !/^[0-9a-f]{64}$/.test(key.hash)) continue;
    if (timingSafeEqual(Buffer.from(key.hash, "hex"), presented) && !found) found = key;
  }
  return found;
}

export function isApiKeyExpired(key: Pick<ApiKey, "expiresAt">, now = new Date()): boolean {
  return Boolean(key.expiresAt && new Date(key.expiresAt).getTime() < now.getTime());
}

/** Vue sans empreinte, pour l'interface. */
export function toApiKeyView(key: ApiKey): ApiKeyView {
  const { hash: _hash, ...view } = key as ApiKey & { key?: string };
  delete (view as { key?: string }).key;
  return view;
}

// ─── Migration ────────────────────────────────────────────────────

type StoredEntry = Partial<ApiKey> & { key?: unknown };

/**
 * Convertit les entrées encore en clair. `changed` dit s'il faut réécrire le
 * fichier. Une ancienne clé pouvait extraire des couleurs sans permission
 * dédiée : elle garde ce droit, pour ne pas casser un usage existant.
 */
export function migrateApiKeys(raw: unknown): { keys: ApiKey[]; changed: boolean } {
  if (!Array.isArray(raw)) return { keys: [], changed: false };
  let changed = false;
  const keys = raw
    .filter((entry): entry is StoredEntry => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const { key: plain, ...rest } = entry;
      if (typeof plain !== "string" || !plain) {
        if (plain !== undefined) changed = true;
        return { ...rest, hash: rest.hash ?? "", prefix: rest.prefix ?? "" } as ApiKey;
      }
      changed = true;
      const permissions = (rest.permissions ?? {}) as ApiKeyPermissions;
      return {
        ...rest,
        hash: rest.hash || hashApiKey(plain),
        prefix: rest.prefix || displayPrefix(plain),
        expiresAt: rest.expiresAt ?? null,
        permissions:
          permissions.extractColors === undefined ? { ...permissions, extractColors: true } : permissions,
      } as ApiKey;
    });
  return { keys, changed };
}

// ─── Fichier ──────────────────────────────────────────────────────

class ApiKeysFileError extends Error {}

/**
 * Lit le fichier. Absent : liste vide. Illisible : liste vide en lecture
 * seule, mais erreur avant une écriture (on n'écrase pas des clés qu'on n'a
 * pas su lire).
 */
async function readRaw(strict: boolean): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(apiKeysPath(), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    if (strict) throw error;
    console.error("[api-keys] lecture impossible :", (error as Error).message);
    return [];
  }
  try {
    return JSON.parse(content);
  } catch {
    if (strict) throw new ApiKeysFileError("data/api-keys.json illisible : écriture refusée");
    console.error("[api-keys] data/api-keys.json illisible");
    return [];
  }
}

async function writeAtomic(keys: ApiKey[]) {
  const file = apiKeysPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, file);
    try {
      await chmod(file, 0o600);
    } catch {
      // Systèmes de fichiers sans droits POSIX (Windows) : sans effet.
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Exécute `task` seul : les lectures-modifications-écritures ne se chevauchent jamais. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Lecture sans écriture, pour qui n'a besoin que des identifiants et des
 * propriétaires (propriété des fichiers). Les entrées en clair sont
 * converties en mémoire seulement.
 */
export async function readStoredApiKeys(): Promise<ApiKey[]> {
  return migrateApiKeys(await readRaw(false)).keys;
}

/** Toutes les clés ; migre et réécrit le fichier s'il portait encore des clés en clair. */
export function loadApiKeys(): Promise<ApiKey[]> {
  return serialized(async () => {
    const { keys, changed } = migrateApiKeys(await readRaw(false));
    if (changed) {
      try {
        await writeAtomic(keys);
      } catch (error) {
        console.error("[api-keys] migration non enregistrée :", (error as Error).message);
      }
    }
    return keys;
  });
}

/**
 * Modifie la liste et l'enregistre, à l'abri des autres écritures. `change`
 * reçoit la liste à jour du disque et la modifie sur place ; ce qu'il renvoie
 * est rendu à l'appelant. Renvoyer `false` annule l'écriture.
 */
export function mutateApiKeys<T>(change: (keys: ApiKey[]) => T | Promise<T>): Promise<T> {
  return serialized(async () => {
    const { keys } = migrateApiKeys(await readRaw(true));
    const result = await change(keys);
    if (result !== false) await writeAtomic(keys);
    return result;
  });
}

// ─── Opérations ───────────────────────────────────────────────────

export interface NewApiKeyInput {
  name: string;
  permissions: ApiKeyPermissions;
  expiresAt: Date | null;
  createdBy: string;
}

/** Crée une clé ; la clé complète n'est renvoyée qu'ici. */
export async function createApiKey(input: NewApiKeyInput): Promise<{ record: ApiKey; secret: string }> {
  const secret = generateApiKeySecret();
  const record: ApiKey = {
    id: `key_${randomBytes(12).toString("base64url")}`,
    name: input.name,
    hash: hashApiKey(secret),
    prefix: displayPrefix(secret),
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    createdBy: input.createdBy,
    permissions: input.permissions,
  };
  await mutateApiKeys((keys) => {
    keys.push(record);
  });
  return { record, secret };
}

/** Retire une clé ; renvoie l'entrée retirée, ou `null` si elle n'existait pas. */
export function deleteApiKey(id: string, filter: (key: ApiKey) => boolean = () => true): Promise<ApiKey | null> {
  return mutateApiKeys((keys) => {
    const index = keys.findIndex((key) => key.id === id && filter(key));
    if (index < 0) return false as const;
    const [removed] = keys.splice(index, 1);
    return removed;
  }).then((result) => result || null);
}

/** Révoque toutes les clés créées par ce compte (compte supprimé). */
export function revokeApiKeysOfUser(userId: string): Promise<ApiKey[]> {
  return mutateApiKeys((keys) => {
    const removed = keys.filter((key) => key.createdBy === userId);
    if (removed.length === 0) return false as const;
    const kept = keys.filter((key) => key.createdBy !== userId);
    keys.splice(0, keys.length, ...kept);
    return removed;
  }).then((result) => result || []);
}

/** Note la dernière utilisation ; renvoie la date écrite. */
export async function touchApiKey(id: string, at = new Date()): Promise<string> {
  const stamp = at.toISOString();
  await mutateApiKeys((keys) => {
    const key = keys.find((entry) => entry.id === id);
    if (!key) return false as const;
    key.lastUsed = stamp;
    return true;
  });
  return stamp;
}
