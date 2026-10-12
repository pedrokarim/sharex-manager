/**
 * Stockage des comptes connectés, dans le volume `data/` déjà monté :
 *
 *   data/connections/accounts.json       comptes, jetons chiffrés
 *   data/connections/apps.json           applications saisies dans l'interface, secret chiffré
 *   data/connections/publish-jobs.json   file de publication
 *   data/connections/quota.json          compteurs par service, compartiment et jour
 *   data/connections/account-quota.json  usage par compte sur fenêtre glissante, suspensions par compte
 *   data/connections/billing.json        dépenses du mois et budget par service payant, crédits épuisés
 *   data/connections/pending.json        autorisations en attente du choix des comptes (dix minutes, chiffrées)
 *   data/connections/public-media.json   liens publics temporaires vers un fichier (empreinte du jeton seulement)
 *   data/connections/tmp/                fichiers dérivés servis par un lien public, effacés avec lui
 *
 * Répertoire en 0700, fichiers en 0600, écriture par fichier temporaire puis
 * renommage : une coupure ne laisse jamais un JSON tronqué.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

let dataRootOverride: string | null = null;

/**
 * Déplace les données ailleurs, pour les tests : ils ne doivent jamais écrire
 * dans le vrai `data/`. `null` rétablit l'emplacement normal.
 */
export function setDataRoot(directory: string | null) {
  dataRootOverride = directory;
}

/** Lu à chaque appel, jamais figé au chargement du fichier. */
export function dataRoot(): string {
  return dataRootOverride ?? path.join(process.cwd(), "data", "connections");
}

export type StoreFile = "accounts" | "apps" | "publish-jobs" | "quota" | "account-quota" | "billing" | "pending" | "public-media";

// `dataRoot()` peut être déplacé par les tests : le build ne peut pas borner ce chemin.
const filePath = (name: StoreFile) => path.join(/* turbopackIgnore: true */ dataRoot(), `${name}.json`);

function ensureRoot() {
  const root = dataRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  // `mkdirSync` n'applique pas le mode à un dossier existant.
  try {
    fs.chmodSync(root, 0o700);
  } catch {
    // Systèmes de fichiers sans droits POSIX (Windows) : sans effet.
  }
}

export function readStore<T>(name: StoreFile, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function writeStore(name: StoreFile, value: unknown) {
  ensureRoot();
  const target = filePath(name);
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // Voir plus haut.
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/** Lit, modifie et réécrit un fichier en une fois (les appels sont synchrones : pas d'entrelacement). */
export function updateStore<T>(name: StoreFile, fallback: T, change: (value: T) => T | void): T {
  const current = readStore<T>(name, fallback);
  const next = (change(current) ?? current) as T;
  writeStore(name, next);
  return next;
}

// ─── Verrous en mémoire ───────────────────────────────────────────

// Rangés sur `globalThis` : un seul verrou par clé et par processus, même si
// ce fichier est chargé deux fois (route, action serveur, module).
const holder = globalThis as typeof globalThis & { __sxmConnectionLocks?: Map<string, Promise<unknown>> };
const locks = (holder.__sxmConnectionLocks ??= new Map());

/** Exécute `task` après les tâches déjà en attente sur la même clé. */
export function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  locks.set(key, settled);
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
}

/** Identifiant interne : préfixe et douze caractères aléatoires. */
export function newId(prefix: string): string {
  return `${prefix}-${randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
}
