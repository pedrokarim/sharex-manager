/**
 * Jetons de suppression des liens ShareX (`deletion_url`).
 *
 * Le jeton n'est remis qu'une fois, dans la réponse de l'envoi. Le serveur
 * n'en garde que l'empreinte SHA-256, liée au nom du fichier : ni ce fichier,
 * ni l'historique ne permettent de le relire. La comparaison se fait en temps
 * constant.
 *
 * Le lien mène à une page de confirmation (`/delete/<fichier>?token=…`) :
 * ShareX l'ouvre dans le navigateur par un simple GET, qui ne supprime rien
 * (un aperçu de lien ou un antivirus qui suit l'adresse ne doit rien effacer).
 * C'est le bouton de cette page qui envoie la suppression.
 */

import { createHash, timingSafeEqual } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const TOKENS_FILE = join(process.cwd(), "data/deletion-tokens.json");

interface StoredDeletionToken {
  filename: string;
  /** Empreinte SHA-256 du jeton, en hexadécimal. */
  tokenHash: string;
  createdAt: string;
}

/** Ancien format : le jeton en clair. Converti en empreinte à la lecture. */
interface LegacyDeletionToken {
  filename: string;
  token: string;
  createdAt?: string;
}

export function hashDeletionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Compare deux empreintes hexadécimales en temps constant. */
export function sameTokenHash(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== 32 || actual.length !== 32) return false;
  return timingSafeEqual(expected, actual);
}

async function readTokens(): Promise<StoredDeletionToken[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(TOKENS_FILE, "utf-8"));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: Partial<StoredDeletionToken & LegacyDeletionToken>) => {
    if (!entry || typeof entry.filename !== "string") return [];
    const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString();
    if (typeof entry.tokenHash === "string") return [{ filename: entry.filename, tokenHash: entry.tokenHash, createdAt }];
    if (typeof entry.token === "string") {
      return [{ filename: entry.filename, tokenHash: hashDeletionToken(entry.token), createdAt }];
    }
    return [];
  });
}

async function writeTokens(tokens: StoredDeletionToken[]): Promise<void> {
  await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Garde l'empreinte du jeton d'un fichier. Un nouvel envoi sous le même nom
 * remplace l'ancien jeton : seul le dernier lien reste valable.
 */
export async function storeDeletionToken(filename: string, token: string): Promise<void> {
  const tokens = (await readTokens()).filter((entry) => entry.filename !== filename);
  tokens.push({ filename, tokenHash: hashDeletionToken(token), createdAt: new Date().toISOString() });
  await writeTokens(tokens);
}

export async function validateDeletionToken(filename: string, token: string): Promise<boolean> {
  if (!token) return false;
  const actual = hashDeletionToken(token);
  const tokens = await readTokens();
  // Toutes les entrées du fichier sont comparées, sans sortie anticipée.
  let valid = false;
  for (const entry of tokens) {
    if (entry.filename === filename && sameTokenHash(entry.tokenHash, actual)) valid = true;
  }
  return valid;
}

export async function deleteDeletionToken(filename: string): Promise<void> {
  const tokens = await readTokens();
  await writeTokens(tokens.filter((entry) => entry.filename !== filename));
}

/** Adresse publique de l'application (pas celle du domaine d'images). */
function appBaseUrl(fallbackOrigin: string): string {
  for (const value of [process.env.AUTH_URL, process.env.NEXT_PUBLIC_API_URL]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim());
      return url.origin + url.pathname.replace(/\/+$/, "");
    } catch {
      // valeur invalide : on essaie la suivante
    }
  }
  return fallbackOrigin.replace(/\/+$/, "");
}

/** Lien de suppression remis à ShareX : la page de confirmation. */
export function buildDeletionUrl(fallbackOrigin: string, filename: string, token: string): string {
  return `${appBaseUrl(fallbackOrigin)}/delete/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
}
