/**
 * Garde-fou des appels à une IA (niveau 3). Mêmes règles que le routeur des
 * traductions (§ 7.5 du dossier), en plus strict, puisque chaque appel coûte
 * plus cher :
 *
 * - un appel par clic, jamais retenté : un échec est rendu avec sa raison ;
 * - un seul appel à la fois : tant qu'une réponse est attendue, une nouvelle
 *   demande est refusée au lieu de s'ajouter derrière ;
 * - une demande identique à une demande déjà servie est lue dans le cache,
 *   gardé sur le disque : rien ne repart, rien n'est compté ;
 * - un délai minimal sépare deux appels ;
 * - un plafond mensuel en nombre d'appels, tenu ici, sur le serveur ;
 * - trois échecs de suite d'un fournisseur le mettent de côté cinq minutes ;
 * - chaque appel est consigné dans un journal : quel fournisseur, quel modèle,
 *   quand, pour quelle page, et ce qui est parti.
 *
 *   data/ai/settings.json   plafond mensuel
 *   data/ai/usage.json      appels du mois
 *   data/ai/cache.json      réponses déjà obtenues
 *   data/ai/journal.json    derniers appels
 */

import path from "path";
import { createHash } from "crypto";
import { dataRoot, readJson, writeJson } from "../../store";
import type { AiAction, AiSentKind, AiTrace } from "../../types";
import { AiCallError, toAiError, type AiModelRef } from "./providers";

export const AI_TIMINGS = {
  /** Délai minimal entre la fin d'un appel et le début du suivant. */
  minDelayMs: 1500,
  /** Au-delà, l'appel est abandonné. Un moteur d'image met parfois plusieurs minutes. */
  timeoutMs: { reading: 90_000, translation: 120_000, page: 10 * 60_000 } satisfies Record<AiAction, number>,
  /** Disjoncteur : trois échecs de suite, cinq minutes de pause. */
  breakerThreshold: 3,
  breakerPauseMs: 5 * 60_000,
} as const;

/** Appels permis par mois tant qu'un administrateur n'a rien réglé. */
export const DEFAULT_MONTHLY_LIMIT = 60;
const MAX_MONTHLY_LIMIT = 100_000;
const MAX_CACHE_ENTRIES = 2000;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_JOURNAL_ENTRIES = 500;

const aiDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "ai");
const settingsFile = () => path.join(aiDir(), "settings.json");
const usageFile = () => path.join(aiDir(), "usage.json");
const cacheFile = () => path.join(aiDir(), "cache.json");
const journalFile = () => path.join(aiDir(), "journal.json");

export interface AiClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const systemAiClock: AiClock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

// ─── Réglages et compteur ────────────────────────────────────────

export function readMonthlyLimit(): number {
  const stored = readJson<{ monthlyLimit?: unknown }>(settingsFile());
  const limit = stored?.monthlyLimit;
  return typeof limit === "number" && Number.isInteger(limit) && limit >= 0 && limit <= MAX_MONTHLY_LIMIT ? limit : DEFAULT_MONTHLY_LIMIT;
}

/** Réservé aux administrateurs. Tout est contrôlé avant d'écrire. */
export function applyAiSettings(patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Réglages de l'IA invalides.");
  const { monthlyLimit } = patch as { monthlyLimit?: unknown };
  if (monthlyLimit === undefined) return;
  if (typeof monthlyLimit !== "number" || !Number.isInteger(monthlyLimit) || monthlyLimit < 0 || monthlyLimit > MAX_MONTHLY_LIMIT) {
    throw new Error("Plafond mensuel invalide : un nombre entier d'appels, 0 pour n'en permettre aucun.");
  }
  writeJson(settingsFile(), { monthlyLimit });
}

/** Mois en temps universel : le compteur ne dépend pas du fuseau du serveur. */
const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);

export function readMonthlyCalls(now: number): number {
  const stored = readJson<{ month?: unknown; count?: unknown }>(usageFile());
  return stored?.month === monthOf(now) && typeof stored.count === "number" && stored.count > 0 ? Math.floor(stored.count) : 0;
}

function countCall(now: number) {
  writeJson(usageFile(), { month: monthOf(now), count: readMonthlyCalls(now) + 1 });
}

// ─── Cache ───────────────────────────────────────────────────────

interface StoredCache {
  version: 1;
  /** Clé et réponse, de la plus ancienne à la plus récente. */
  entries: [string, string][];
}

function readCache(): Map<string, string> {
  const stored = readJson<StoredCache>(cacheFile());
  const entries = new Map<string, string>();
  if (stored?.version === 1 && Array.isArray(stored.entries)) {
    for (const entry of stored.entries) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") entries.set(entry[0], entry[1]);
    }
  }
  return entries;
}

function writeCache(key: string, value: string) {
  const entries = readCache();
  entries.delete(key);
  entries.set(key, value);
  for (const oldest of entries.keys()) {
    if (entries.size <= MAX_CACHE_ENTRIES) break;
    entries.delete(oldest);
  }
  writeJson(cacheFile(), { version: 1, entries: [...entries] } satisfies StoredCache, { maxBytes: MAX_CACHE_BYTES });
}

/**
 * Clé d'une demande : l'action, le modèle, la version des consignes et une
 * empreinte de tout ce qui part. Deux demandes de même clé sont la même.
 */
export function requestKey(action: AiAction, ref: AiModelRef, promptVersion: number, ...payload: (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  hash.update(`${action}\n${ref.provider}\n${ref.model}\n${promptVersion}\n`);
  for (const part of payload) {
    hash.update(typeof part === "string" ? Buffer.from(part, "utf-8") : part);
    hash.update("\n");
  }
  return hash.digest("hex");
}

// ─── Journal ─────────────────────────────────────────────────────

export interface AiJournalEntry extends AiTrace {
  pageId: string;
  regionIds: string[];
  /** Taille de ce qui est parti : octets d'une image, caractères d'un texte. */
  size: number;
  ok: boolean;
  /** Raison de l'échec, quand l'appel n'a pas abouti. */
  error?: string;
}

export function readJournal(): AiJournalEntry[] {
  const stored = readJson<AiJournalEntry[]>(journalFile());
  return Array.isArray(stored) ? stored : [];
}

function appendJournal(entry: AiJournalEntry) {
  try {
    writeJson(journalFile(), [...readJournal(), entry].slice(-MAX_JOURNAL_ENTRIES));
  } catch (error) {
    // Un journal qui ne s'écrit pas ne doit pas faire perdre une réponse déjà payée.
    console.error("[scan-studio] journal de l'IA non enregistré :", error);
  }
}

// ─── Appels ──────────────────────────────────────────────────────

export interface AiCall {
  action: AiAction;
  ref: AiModelRef;
  /** Nom du fournisseur, pour les messages. */
  providerLabel: string;
  /** Clé de la demande (`requestKey`). */
  key: string;
  sent: AiSentKind;
  size: number;
  pageId: string;
  regionIds: string[];
  /** L'appel lui-même : une requête, sans nouvelle tentative. */
  send: (signal: AbortSignal) => Promise<string>;
  /**
   * Contrôle d'une réponse lue dans le cache ; `false` : elle ne vaut plus
   * (le fichier qu'elle désigne a disparu) et la demande repart.
   */
  stillValid?: (cached: string) => boolean;
}

export interface AiOutcome {
  value: string;
  trace: AiTrace;
}

interface BreakerState {
  failures: number;
  pausedUntil: number;
}

const timeOf = (timestamp: number) => new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export class AiGuard {
  private readonly clock: AiClock;
  private busy = false;
  private lastCallAt: number | null = null;
  private readonly breakers = new Map<string, BreakerState>();

  constructor(options: { clock?: AiClock } = {}) {
    this.clock = options.clock ?? systemAiClock;
  }

  /** Un appel attend-il sa réponse ? */
  get running(): boolean {
    return this.busy;
  }

  usage(): { month: number; monthlyLimit: number } {
    return { month: readMonthlyCalls(this.clock.now()), monthlyLimit: readMonthlyLimit() };
  }

  /** Raison pour laquelle un fournisseur est mis de côté, s'il l'est. */
  pauseReason(provider: string): string | undefined {
    const state = this.breakers.get(provider);
    return state && state.pausedUntil > this.clock.now()
      ? `mis de côté jusqu’à ${timeOf(state.pausedUntil)} après des échecs répétés`
      : undefined;
  }

  /**
   * Sert une demande : depuis le cache si elle a déjà reçu une réponse, sinon
   * par un appel, un seul. Lève une erreur en français quand l'appel est
   * refusé (plafond, appel en cours, fournisseur de côté) ou qu'il échoue.
   */
  async run(call: AiCall): Promise<AiOutcome> {
    const trace = (cached: boolean): AiTrace => ({
      action: call.action,
      provider: call.ref.provider,
      model: call.ref.model,
      at: this.clock.now(),
      sent: call.sent,
      ...(cached ? { cached: true } : {}),
    });
    const journal = (base: AiTrace, ok: boolean, error?: string) =>
      appendJournal({ ...base, pageId: call.pageId, regionIds: call.regionIds, size: call.size, ok, ...(error ? { error } : {}) });

    const cached = readCache().get(call.key);
    if (cached !== undefined && (call.stillValid?.(cached) ?? true)) {
      const served = trace(true);
      journal(served, true);
      return { value: cached, trace: served };
    }

    if (this.busy) throw new Error("Un appel à l’IA est déjà en cours : attendez sa réponse avant d’en lancer un autre.");
    const paused = this.pauseReason(call.ref.provider);
    if (paused) throw new Error(`${call.providerLabel} : ${paused}.`);
    const { month, monthlyLimit } = this.usage();
    if (month >= monthlyLimit) {
      throw new Error(
        monthlyLimit === 0
          ? "Les appels à l’IA sont fermés sur cette instance : le plafond mensuel est à 0. Un administrateur peut le relever depuis l’atelier, dans la section « IA, en dernier recours »."
          : `Plafond mensuel d’appels à l’IA atteint (${month} sur ${monthlyLimit}) : il repart de zéro le mois prochain, et un administrateur peut le relever.`,
      );
    }

    this.busy = true;
    try {
      if (this.lastCallAt !== null) {
        const wait = this.lastCallAt + AI_TIMINGS.minDelayMs - this.clock.now();
        if (wait > 0) await this.clock.sleep(wait);
      }
      // Compté au départ : un appel qui échoue a quitté la machine, lui aussi.
      countCall(this.clock.now());
      const sent = trace(false);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMINGS.timeoutMs[call.action]);
      try {
        const value = await call.send(controller.signal);
        this.breakers.delete(call.ref.provider);
        writeCache(call.key, value);
        journal(sent, true);
        return { value, trace: sent };
      } catch (error) {
        const failure = toAiError(error);
        this.recordFailure(call.ref.provider, failure);
        journal(sent, false, failure.message);
        throw new Error(failure.message);
      } finally {
        clearTimeout(timer);
        this.lastCallAt = this.clock.now();
      }
    } finally {
      this.busy = false;
    }
  }

  /** Une demande mal formée ou refusée par le modèle ne dit rien de la santé du fournisseur. */
  private recordFailure(provider: string, failure: AiCallError) {
    if (failure.kind === "invalid-request" || failure.kind === "refused") return;
    const state = this.breakers.get(provider) ?? { failures: 0, pausedUntil: 0 };
    state.failures++;
    if (state.failures >= AI_TIMINGS.breakerThreshold) {
      state.pausedUntil = this.clock.now() + AI_TIMINGS.breakerPauseMs;
      state.failures = 0;
    }
    this.breakers.set(provider, state);
  }
}
