/**
 * Compteurs de caractères envoyés à chaque moteur, par jour et par mois, et
 * mises à l'écart qui doivent survivre à un redémarrage : quota épuisé, clé
 * refusée.
 *
 *   data/translation/usage.json
 *
 * Le disjoncteur, lui, reste en mémoire (`router.ts`) : après un redémarrage,
 * une requête d'essai est justement ce qu'on veut.
 *
 * Jours et mois sont comptés en temps universel : un compteur ne dépend pas du
 * fuseau du serveur.
 */

import path from "path";
import { readJson, writeJson } from "../../store";
import type { TranslationEngineId } from "../../types";
import { ENGINE_IDS } from "./engines";
import { translationDir } from "./settings";

const usageFile = () => path.join(translationDir(), "usage.json");

interface StoredUsage {
  /** « 2026-10-06 » */
  day: string;
  dayCount: number;
  /** « 2026-10 » */
  month: string;
  monthCount: number;
  /** Quota épuisé chez le service : pas de nouvel appel avant cette date. */
  quotaUntil?: number;
  /** Empreinte de la clé que le service a refusée (`credentialFingerprint`). */
  rejected?: string;
}

export interface EngineUsage {
  day: number;
  month: number;
  quotaUntil?: number;
  rejected?: string;
}

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);
const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);

/** Premier instant du jour suivant, en temps universel. */
export function nextDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

function readAll(): Partial<Record<TranslationEngineId, StoredUsage>> {
  const stored = readJson<Partial<Record<TranslationEngineId, StoredUsage>>>(usageFile());
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

/** Fiche d'un moteur, remise à zéro pour les périodes écoulées. */
function current(stored: StoredUsage | undefined, now: number): StoredUsage {
  const day = dayOf(now);
  const month = monthOf(now);
  const usage: StoredUsage = {
    day,
    dayCount: stored?.day === day ? count(stored.dayCount) : 0,
    month,
    monthCount: stored?.month === month ? count(stored.monthCount) : 0,
  };
  if (typeof stored?.quotaUntil === "number" && stored.quotaUntil > now) usage.quotaUntil = stored.quotaUntil;
  if (typeof stored?.rejected === "string") usage.rejected = stored.rejected;
  return usage;
}

export function readUsage(id: TranslationEngineId, now: number): EngineUsage {
  const usage = current(readAll()[id], now);
  return { day: usage.dayCount, month: usage.monthCount, quotaUntil: usage.quotaUntil, rejected: usage.rejected };
}

/** Lit, modifie et réécrit d'une traite : deux lots simultanés ne se marchent pas dessus. */
function update(id: TranslationEngineId, now: number, change: (usage: StoredUsage) => void) {
  const all = readAll();
  const next: Partial<Record<TranslationEngineId, StoredUsage>> = {};
  for (const engine of ENGINE_IDS) {
    const usage = current(all[engine], now);
    if (engine === id) change(usage);
    next[engine] = usage;
  }
  writeJson(usageFile(), next);
}

export function addUsage(id: TranslationEngineId, characters: number, now: number) {
  if (characters <= 0) return;
  update(id, now, (usage) => {
    usage.dayCount += characters;
    usage.monthCount += characters;
  });
}

export function markQuotaExceeded(id: TranslationEngineId, until: number, now: number) {
  update(id, now, (usage) => {
    usage.quotaUntil = until;
  });
}

export function markRejected(id: TranslationEngineId, fingerprint: string, now: number) {
  update(id, now, (usage) => {
    usage.rejected = fingerprint;
  });
}

/** Le service a répondu : ni quota épuisé, ni clé refusée. N'écrit rien s'il n'y avait rien à lever. */
export function clearBlocks(id: TranslationEngineId, now: number) {
  const usage = readUsage(id, now);
  if (usage.quotaUntil === undefined && usage.rejected === undefined) return;
  update(id, now, (stored) => {
    delete stored.quotaUntil;
    delete stored.rejected;
  });
}

/** Nombre de caractères comme les services les comptent : par point de code. */
export function countCharacters(text: string): number {
  return Array.from(text).length;
}
