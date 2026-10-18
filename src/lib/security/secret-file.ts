/**
 * Fichiers de secrets des modules (clés OpenAI, DeepL, Pexels…), chiffrés avec
 * la clé des comptes connectés (`lib/connections/crypto.ts`, AES-256-GCM).
 *
 * Format sur le disque :
 *
 *   { "format": "sxm-secret-file/v1", "blob": { "v": 1, "kid": "…", "iv": "…", "tag": "…", "data": "…" } }
 *
 * Migration transparente : un ancien fichier en JSON clair se lit toujours, et
 * il est chiffré à sa prochaine écriture. Un fichier chiffré avec une clé
 * retirée de la rotation est rechiffré avec la clé actuelle à la prochaine
 * écriture. Sans aucune clé disponible (ni `CONNECTIONS_ENCRYPTION_KEY(S)` ni
 * `AUTH_SECRET`), le fichier reste en clair, toujours en 0600, plutôt que de
 * perdre la clé saisie.
 *
 * Le `context` lie le chiffré à son fichier : un blob recopié d'un module à
 * l'autre ne se déchiffre pas.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { decryptJson, encryptJson, hasEncryptionKey, needsReencryption } from "@/lib/connections/crypto";
import type { EncryptedBlob } from "@/lib/connections/types";

export const SECRET_FILE_FORMAT = "sxm-secret-file/v1";

interface SecretFileEnvelope {
  format: typeof SECRET_FILE_FORMAT;
  blob: EncryptedBlob;
}

export function isSecretFileEnvelope(value: unknown): value is SecretFileEnvelope {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { format?: unknown }).format === SECRET_FILE_FORMAT &&
    typeof (value as { blob?: unknown }).blob === "object"
  );
}

export type SecretFileState = "missing" | "plain" | "encrypted" | "stale-key";

/** État du fichier, pour l'écran Sécurité : absent, en clair, chiffré, ou chiffré avec une ancienne clé. */
export function secretFileState(file: string): SecretFileState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return "missing";
  }
  if (!isSecretFileEnvelope(raw)) return "plain";
  return needsReencryption(raw.blob) ? "stale-key" : "encrypted";
}

/**
 * Lit un fichier de secrets, chiffré ou encore en clair. Renvoie `fallback`
 * si le fichier est absent ou illisible (JSON abîmé, clé perdue) : l'erreur
 * est signalée dans la console, jamais avec le contenu.
 */
export function readSecretJson<T>(file: string, context: string, fallback: T): T {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
  if (!isSecretFileEnvelope(raw)) return raw as T;
  try {
    return decryptJson<T>(raw.blob, context);
  } catch (error) {
    console.error(`[secrets] ${path.basename(path.dirname(file))}/${path.basename(file)} : ${(error as Error).message}`);
    return fallback;
  }
}

/** Écrit un fichier de secrets chiffré, en 0600, par fichier temporaire puis renommage. */
export function writeSecretJson(file: string, context: string, value: unknown) {
  const content = hasEncryptionKey()
    ? JSON.stringify({ format: SECRET_FILE_FORMAT, blob: encryptJson(value, context) } satisfies SecretFileEnvelope, null, 2)
    : JSON.stringify(value, null, 2);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600 });
    fs.renameSync(temporary, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Systèmes de fichiers sans droits POSIX (Windows) : sans effet.
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Chiffre un fichier encore en clair, ou rechiffre un fichier écrit avec une
 * ancienne clé. Sans effet sur un fichier absent, illisible, déjà à jour, ou
 * sans clé disponible. Renvoie vrai si le fichier a été réécrit.
 */
export function migrateSecretFile(file: string, context: string): boolean {
  if (!hasEncryptionKey()) return false;
  const state = secretFileState(file);
  if (state !== "plain" && state !== "stale-key") return false;
  const sentinel = Symbol("unreadable");
  const value = readSecretJson<unknown>(file, context, sentinel);
  if (value === sentinel) return false;
  writeSecretJson(file, context, value);
  return true;
}
