/**
 * Liens publics temporaires vers une image.
 *
 * Un service tiers (recherche inversée par exemple) ne peut lire une image que
 * par une adresse publique. Quand l'image n'en a pas – fichier privé, image
 * déposée depuis l'ordinateur –, on lui en prête une : un jeton imprévisible,
 * valable peu de temps, servi par `/api/public/share/<jeton>`.
 *
 * Tout vit en mémoire : rien n'est écrit sur le disque, et un redémarrage
 * éteint tous les liens.
 */

import { randomBytes } from "node:crypto";

interface Share {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;
/** Au-delà, les liens les plus anciens sont éteints. */
const MAX_SHARES = 40;
const MAX_BYTES = 20 * 1024 * 1024;

const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

// Le module qui crée un lien et la route qui le sert peuvent être chargés
// séparément : la table est accrochée au processus, pas au fichier.
const holder = globalThis as typeof globalThis & { __sxmTempShares?: Map<string, Share> };
const shares = (holder.__sxmTempShares ??= new Map<string, Share>());

function purge(now = Date.now()) {
  for (const [token, share] of shares) {
    if (share.expiresAt <= now) shares.delete(token);
  }
  while (shares.size > MAX_SHARES) {
    shares.delete(shares.keys().next().value as string);
  }
}

/** Prête une adresse publique à une image, pour `ttlMs` (trente minutes par défaut, une heure au plus). */
export function createTempShare(
  buffer: Buffer,
  mimeType: string,
  ttlMs = DEFAULT_TTL_MS
): { token: string; expiresAt: number } {
  if (!MIME_TYPES.has(mimeType)) throw new Error("Seule une image peut recevoir un lien temporaire.");
  if (buffer.length === 0 || buffer.length > MAX_BYTES) throw new Error("Image trop lourde pour un lien temporaire.");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + Math.min(Math.max(ttlMs, 60_000), MAX_TTL_MS);
  shares.set(token, { buffer, mimeType, expiresAt });
  purge();
  return { token, expiresAt };
}

export function readTempShare(token: string): { buffer: Buffer; mimeType: string; expiresAt: number } | null {
  purge();
  return shares.get(token) ?? null;
}

export function revokeTempShare(token: string | undefined) {
  if (token) shares.delete(token);
}

/** Chemin de l'adresse publique d'un jeton, à préfixer par l'origine du site. */
export function tempSharePath(token: string): string {
  return `/api/public/share/${token}`;
}
