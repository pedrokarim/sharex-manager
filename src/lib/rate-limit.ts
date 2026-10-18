/**
 * Limitation de débit en mémoire, par fenêtre fixe.
 *
 * La table est bornée : au-delà de `MAX_ENTRIES` compteurs, les fenêtres
 * expirées partent d'abord, puis les plus anciennes. Une rafale d'adresses
 * différentes ne peut donc pas faire grossir la mémoire sans fin.
 *
 * Une requête sans adresse attestée (`getTrustedClientIp` rend « unknown »)
 * ne partage plus le compteur d'un visiteur ordinaire : elle passe par
 * `checkIpRateLimit`, qui la compte dans un plafond global plus large, pour
 * ne bloquer que l'abus.
 */

import { getTrustedClientIp, UNKNOWN_CLIENT_IP } from "@/lib/request-ip";

interface Entry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Entry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

/** Nombre maximal de compteurs gardés en mémoire. */
export const MAX_ENTRIES = 50_000;

/** Sans adresse connue, toutes ces requêtes partagent un plafond global, multiplié d'autant. */
export const UNKNOWN_IP_FACTOR = 10;

export interface RateLimitOptions {
  max?: number;
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

function evict(now: number) {
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
  // Toujours trop : les plus anciens compteurs (ordre d'insertion) partent.
  const excess = attempts.size - MAX_ENTRIES + 1;
  if (excess > 0) {
    let removed = 0;
    for (const key of attempts.keys()) {
      if (removed >= excess) break;
      attempts.delete(key);
      removed++;
    }
  }
}

/**
 * Compte une tentative pour `key`. Par défaut : dix par quart d'heure. Un
 * usage plus fréquent (un outil public) passe ses propres bornes.
 */
export function checkRateLimit(
  key: string,
  { max = MAX_ATTEMPTS, windowMs = WINDOW_MS }: RateLimitOptions = {}
): RateLimitResult {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    if (entry) attempts.delete(key);
    else if (attempts.size >= MAX_ENTRIES) evict(now);
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= max) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Limite par adresse IP attestée, sous `scope`. Sans adresse connue, un
 * plafond global `max × UNKNOWN_IP_FACTOR` s'applique, distinct de tout
 * compteur de visiteur.
 */
export function checkIpRateLimit(scope: string, headers: Headers, options: RateLimitOptions = {}): RateLimitResult {
  const ip = getTrustedClientIp(headers);
  if (ip === UNKNOWN_CLIENT_IP) {
    const max = (options.max ?? MAX_ATTEMPTS) * UNKNOWN_IP_FACTOR;
    return checkRateLimit(`${scope}:no-ip`, { ...options, max });
  }
  return checkRateLimit(`${scope}:ip:${ip}`, options);
}

/** Secondes à annoncer dans `Retry-After` (au moins une). */
export function retryAfterSeconds(result: Pick<RateLimitResult, "retryAfterMs">): number {
  return Math.max(1, Math.ceil(result.retryAfterMs / 1000));
}

/** Réponse 429 en JSON (`{ error }`, lisible par ShareX), avec `Retry-After`. */
export function rateLimitResponse(
  result: Pick<RateLimitResult, "retryAfterMs">,
  error = "Trop de requêtes, réessayez dans un instant.",
  headers: Record<string, string> = {}
): Response {
  return Response.json(
    { error },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds(result)), "Cache-Control": "no-store", ...headers } }
  );
}

/** Vide tous les compteurs, pour les tests. */
export function resetRateLimits() {
  attempts.clear();
}

/** Nombre de compteurs en mémoire, pour les tests. */
export function rateLimitEntryCount(): number {
  return attempts.size;
}

// Nettoyage périodique des entrées expirées ; ne retient pas le processus.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) {
      attempts.delete(key);
    }
  }
}, 60 * 1000);
(sweeper as { unref?: () => void }).unref?.();
