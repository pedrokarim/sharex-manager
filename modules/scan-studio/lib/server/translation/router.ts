/**
 * Routeur des traductions (§ 7.5 du dossier) : deux moteurs, aucune rafale.
 *
 * Pour chaque phrase, dans cet ordre, et on s'arrête au premier qui répond :
 *
 *   1. le glossaire du dossier (un terme imposé se remplace) ;
 *   2. la mémoire de traduction du dossier (une phrase déjà validée) ;
 *   3. le cache (la même phrase déjà demandée à un moteur) ;
 *   4. le moteur principal, puis le moteur de secours.
 *
 * Ce qui empêche de marteler un service :
 *
 * - les phrases identiques d'un lot ne partent qu'une fois, et un lot part en
 *   une requête (découpée seulement s'il dépasse ce qu'une requête accepte) ;
 * - une requête à la fois par moteur, avec un délai minimal entre deux ;
 * - les nouvelles tentatives sont comptées (tableau de `TIMINGS`), jamais
 *   après une clé refusée ou un quota épuisé ;
 * - trois échecs de suite ouvrent le disjoncteur : cinq minutes sans appel,
 *   puis une seule requête d'essai décide ;
 * - un plafond mensuel de caractères par moteur, jamais dépassé ;
 * - quand plus aucun moteur ne répond, le lot rend ce qu'il a obtenu et la
 *   liste de ce qui manque. Rien ne boucle : on relance à la main.
 *
 * Le routeur ne connaît ni les chapitres ni les pages (`index.ts` s'en
 * charge), et ne parle aux services qu'à travers `TranslationEngine` : les
 * tests lui donnent de faux moteurs et une fausse horloge.
 */

import type {
  EngineCatalogue,
  EngineStatus,
  GlossaryEntry,
  SourceLanguage,
  TranslationBatch,
  TranslationEngineId,
  TranslationEstimate,
  TranslationItem,
  TranslationResult,
  TranslationSource,
} from "../../types";
import { openCache, type TranslationCache } from "./cache";
import { createDeeplEngine } from "./deepl";
import { ENGINE_IDS, ENGINE_LABELS, EngineError, toEngineError, type TranslationEngine } from "./engines";
import { exactGlossaryMatch, isOnlyTerms, prepareGlossary, protectTerms, restoreTerms } from "./glossary";
import { createLibreTranslateEngine } from "./libretranslate";
import { memoryKey, openMemory } from "./memory";
import { credentialFingerprint, keyHint, readCredentials, readSettings } from "./settings";
import { addUsage, clearBlocks, countCharacters, markQuotaExceeded, markRejected, nextDay, readUsage } from "./usage";

// ─── Réglages du routage ─────────────────────────────────────────

export const TIMINGS = {
  /** Délai minimal entre la fin d'une requête et le début de la suivante, par moteur. */
  minDelayMs: 1000,
  /** Au-delà, une requête est abandonnée et comptée comme une panne. */
  requestTimeoutMs: 30_000,
  /** « Trop de requêtes » : deux nouvelles tentatives au plus, après 2 s puis 4 s, ou le délai du service s'il est plus long. */
  rateLimitRetries: 2,
  rateLimitBackoffMs: 2000,
  /** Un service qui demande d'attendre plus longtemps n'est pas attendu : on bascule, et il est laissé tranquille jusque-là. */
  maxRetryAfterMs: 60_000,
  /** Panne ou délai dépassé : une nouvelle tentative, après 2 s. */
  unavailableRetries: 1,
  unavailableBackoffMs: 2000,
  /** Disjoncteur : trois échecs de suite, cinq minutes de pause. */
  breakerThreshold: 3,
  breakerPauseMs: 5 * 60_000,
  /** Ce qu'une requête emporte au plus : bien en dessous des 128 Kio de DeepL. */
  maxTextsPerRequest: 50,
  maxCharactersPerRequest: 30_000,
  /** Part du plafond mensuel à partir de laquelle l'interface prévient. */
  warnRatio: 0.8,
} as const;

/** Une traduction rendue par un service reste une donnée : bornée, sans caractère de contrôle. */
const MAX_TRANSLATION_LENGTH = 8000;
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

export interface Clock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

/** Un moteur prêt à servir, ou la raison pour laquelle il ne l'est pas. */
export interface ResolvedEngine {
  engine?: TranslationEngine;
  /** Pourquoi le moteur n'est pas configuré. */
  reason?: string;
  /** Empreinte de sa clé ou de son adresse (`credentialFingerprint`). */
  fingerprint: string;
  keyHint?: string;
  url?: string;
}

export type EngineResolver = (id: TranslationEngineId) => ResolvedEngine;

/** Les vrais moteurs, d'après les clés et l'adresse enregistrées. */
export const resolveConfiguredEngine: EngineResolver = (id) => {
  const credentials = readCredentials();
  const fingerprint = credentialFingerprint(id, credentials);
  if (id === "deepl") {
    if (!credentials.deeplKey) return { fingerprint, reason: "aucune clé d'API enregistrée" };
    return { fingerprint, engine: createDeeplEngine(credentials.deeplKey), keyHint: keyHint(credentials.deeplKey) };
  }
  if (!credentials.libreTranslateUrl) return { fingerprint, reason: "aucune adresse de service enregistrée" };
  return {
    fingerprint,
    engine: createLibreTranslateEngine(credentials.libreTranslateUrl, credentials.libreTranslateKey),
    keyHint: keyHint(credentials.libreTranslateKey),
    url: credentials.libreTranslateUrl,
  };
};

export interface TranslationRequest {
  items: TranslationItem[];
  source: SourceLanguage;
  target: string;
  glossary: GlossaryEntry[];
  /** Dossier dont la mémoire de traduction s'applique. */
  folderId: string;
  /** Impose un moteur : lui seul est appelé, sans secours. */
  engine?: TranslationEngineId;
  /** Ignore le cache pour redemander une traduction. */
  force?: boolean;
  /** `false` : le niveau du chapitre interdit d'appeler un moteur ; glossaire, mémoire et cache répondent seuls. */
  allowEngines?: boolean;
}

const LEVEL_REFUSAL = "Le niveau d'automatisation du chapitre n'autorise pas la traduction automatique.";

// ─── État par moteur ─────────────────────────────────────────────

interface BreakerState {
  /** Échecs de suite depuis la dernière réponse correcte. */
  failures: number;
  /** Fin de la mise à l'écart ; 0 : le moteur n'est pas à l'écart. Échue, elle annonce une requête d'essai. */
  pausedUntil: number;
}

interface Availability {
  configured: boolean;
  engine?: TranslationEngine;
  available: boolean;
  reason?: string;
  /** Caractères encore permis ce mois-ci ; `Infinity` sans plafond. */
  budget: number;
  pausedUntil?: number;
}

/** Une phrase à envoyer, et les phrases d'origine qui l'attendent (elles ne diffèrent que par leurs termes de glossaire). */
interface PendingText {
  characters: number;
  waiting: { original: string; terms: string[] }[];
}

type Outcome = { text: string; source: TranslationSource; engine?: TranslationEngineId };

const timeOf = (timestamp: number) => new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export class TranslationRouter {
  private readonly resolve: EngineResolver;
  private readonly clock: Clock;
  private readonly queues = new Map<TranslationEngineId, Promise<unknown>>();
  private readonly lastRequestAt = new Map<TranslationEngineId, number>();
  private readonly breakers = new Map<TranslationEngineId, BreakerState>();

  constructor(options: { resolve?: EngineResolver; clock?: Clock } = {}) {
    this.resolve = options.resolve ?? resolveConfiguredEngine;
    this.clock = options.clock ?? systemClock;
  }

  // ─── Disponibilité ─────────────────────────────────────────────

  private breaker(id: TranslationEngineId): BreakerState {
    let state = this.breakers.get(id);
    if (!state) {
      state = { failures: 0, pausedUntil: 0 };
      this.breakers.set(id, state);
    }
    return state;
  }

  /** Raison de la mise à l'écart en cours, s'il y en a une. */
  private pauseReason(id: TranslationEngineId): string | undefined {
    const { pausedUntil } = this.breaker(id);
    return pausedUntil > this.clock.now() ? `mis de côté jusqu'à ${timeOf(pausedUntil)} après des échecs répétés` : undefined;
  }

  private availability(id: TranslationEngineId): Availability {
    const resolved = this.resolve(id);
    if (!resolved.engine) {
      return { configured: false, available: false, reason: resolved.reason ?? "non configuré", budget: 0 };
    }
    const now = this.clock.now();
    const usage = readUsage(id, now);
    const limit = readSettings().monthlyLimits[id];
    const budget = limit > 0 ? Math.max(0, limit - usage.month) : Infinity;
    const base = { configured: true, engine: resolved.engine, budget };

    if (usage.rejected === resolved.fingerprint) {
      return { ...base, available: false, reason: "clé refusée par le service : corrigez-la dans la page « Moteurs »" };
    }
    if (usage.quotaUntil !== undefined) {
      return { ...base, available: false, reason: "quota épuisé chez le service, nouvel essai demain" };
    }
    if (budget <= 0) {
      return { ...base, available: false, reason: `plafond mensuel atteint (${limit.toLocaleString("fr-FR")} caractères)` };
    }
    const paused = this.pauseReason(id);
    if (paused) return { ...base, available: false, reason: paused, pausedUntil: this.breaker(id).pausedUntil };
    return { ...base, available: true };
  }

  status(id: TranslationEngineId): EngineStatus {
    const resolved = this.resolve(id);
    const availability = this.availability(id);
    const usage = readUsage(id, this.clock.now());
    const monthlyLimit = readSettings().monthlyLimits[id];
    const status: EngineStatus = {
      id,
      label: ENGINE_LABELS[id],
      configured: availability.configured,
      available: availability.available,
      usage: { day: usage.day, month: usage.month },
      monthlyLimit,
    };
    if (availability.reason) status.reason = availability.reason;
    else if (monthlyLimit > 0 && usage.month >= monthlyLimit * TIMINGS.warnRatio) {
      // Le moteur reste disponible : la raison prévient seulement que le plafond approche.
      status.reason = `${Math.floor((usage.month / monthlyLimit) * 100)} % du plafond mensuel consommés`;
    }
    if (availability.pausedUntil) status.pausedUntil = availability.pausedUntil;
    if (resolved.keyHint) status.keyHint = resolved.keyHint;
    if (resolved.url) status.url = resolved.url;
    return status;
  }

  catalogue(): EngineCatalogue {
    return { engines: ENGINE_IDS.map((id) => this.status(id)), order: readSettings().order };
  }

  // ─── File et requêtes ──────────────────────────────────────────

  /** Une tâche à la fois par moteur : la suivante attend la fin de la précédente, réussie ou non. */
  private enqueue<T>(id: TranslationEngineId, job: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const run = previous.then(job, job);
    this.queues.set(
      id,
      run.catch(() => undefined)
    );
    return run;
  }

  /** Une seule requête, précédée du délai minimal et bornée dans le temps. */
  private async request(engine: TranslationEngine, texts: string[], source: SourceLanguage, target: string): Promise<string[]> {
    const last = this.lastRequestAt.get(engine.id);
    if (last !== undefined) {
      const wait = last + TIMINGS.minDelayMs - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMINGS.requestTimeoutMs);
    try {
      const translated = await engine.translate(texts, source, target, controller.signal);
      if (!Array.isArray(translated) || translated.length !== texts.length || !translated.every((text) => typeof text === "string")) {
        throw new EngineError("unavailable", "Réponse inattendue du service.");
      }
      return translated;
    } catch (error) {
      throw toEngineError(error);
    } finally {
      clearTimeout(timer);
      this.lastRequestAt.set(engine.id, this.clock.now());
    }
  }

  private recordSuccess(id: TranslationEngineId) {
    const state = this.breaker(id);
    state.failures = 0;
    state.pausedUntil = 0;
    clearBlocks(id, this.clock.now());
  }

  /**
   * Envoie un lot à un moteur, dans sa file, avec les nouvelles tentatives
   * permises. Lève l'`EngineError` qui a mis fin aux essais.
   *
   * `prepare` est appelée quand vient le tour du lot, pas avant : elle rend
   * les phrases qui restent à envoyer à ce moment-là. Un lot qui a attendu
   * derrière un autre ne redemande pas ce que celui-ci vient d'obtenir.
   */
  private send(
    id: TranslationEngineId,
    engine: TranslationEngine,
    prepare: () => string[],
    source: SourceLanguage,
    target: string
  ): Promise<{ texts: string[]; translated: string[] }> {
    return this.enqueue(id, async () => {
      const state = this.breaker(id);
      const texts = prepare();
      if (texts.length === 0) return { texts, translated: [] };
      for (let retries = 0; ; retries++) {
        // Relu à chaque tour : un lot précédent de la file a pu ouvrir le disjoncteur.
        const paused = this.pauseReason(id);
        if (paused) throw new EngineError("unavailable", paused);
        // Mise à l'écart échue : cette requête est l'essai, elle n'a droit à aucune nouvelle tentative.
        const trial = state.pausedUntil > 0;

        let failure: EngineError;
        try {
          const translated = await this.request(engine, texts, source, target);
          this.recordSuccess(id);
          return { texts, translated };
        } catch (error) {
          failure = toEngineError(error);
        }

        const now = this.clock.now();
        if (failure.kind === "unauthorized") {
          markRejected(id, this.resolve(id).fingerprint, now);
          throw failure;
        }
        if (failure.kind === "quota-exceeded") {
          markQuotaExceeded(id, nextDay(now), now);
          throw failure;
        }
        // Une demande refusée ne dit rien de la santé du service : ni tentative, ni disjoncteur.
        if (failure.kind === "invalid-request") throw failure;

        state.failures++;
        if (trial || state.failures >= TIMINGS.breakerThreshold) {
          state.pausedUntil = now + TIMINGS.breakerPauseMs;
          throw failure;
        }

        let wait: number;
        if (failure.kind === "rate-limited") {
          if (retries >= TIMINGS.rateLimitRetries) throw failure;
          const asked = failure.retryAfterMs ?? 0;
          if (asked > TIMINGS.maxRetryAfterMs) {
            state.pausedUntil = now + asked;
            throw failure;
          }
          wait = Math.max(asked, TIMINGS.rateLimitBackoffMs * 2 ** retries);
        } else {
          if (retries >= TIMINGS.unavailableRetries) throw failure;
          wait = TIMINGS.unavailableBackoffMs;
        }
        await this.clock.sleep(wait);
      }
    });
  }

  // ─── Traduction d'un lot ───────────────────────────────────────

  /**
   * Ce qui se sait sans moteur. Rend, par phrase d'origine, ce qui est résolu,
   * et par phrase à envoyer, celles qui attendent.
   */
  private resolveLocally(request: TranslationRequest, cache: TranslationCache, order: TranslationEngineId[]) {
    const glossary = prepareGlossary(request.glossary);
    const memory = openMemory(request.folderId, request.target);
    const outcomes = new Map<string, Outcome>();
    const pending = new Map<string, PendingText>();

    for (const item of request.items) {
      const original = item.text.trim();
      if (!original || outcomes.has(original)) continue;

      const imposed = exactGlossaryMatch(original, glossary);
      if (imposed !== null) {
        outcomes.set(original, { text: imposed, source: "glossary" });
        continue;
      }
      const remembered = memory.get(memoryKey(original));
      if (remembered !== undefined) {
        outcomes.set(original, { text: remembered, source: "memory" });
        continue;
      }
      const guarded = protectTerms(original, glossary);
      if (isOnlyTerms(guarded)) {
        outcomes.set(original, { text: restoreTerms(guarded.text, guarded.terms).text, source: "glossary" });
        continue;
      }
      const entry = pending.get(guarded.text) ?? { characters: countCharacters(guarded.text), waiting: [] };
      if (!entry.waiting.some((waiting) => waiting.original === original)) entry.waiting.push({ original, terms: guarded.terms });
      pending.set(guarded.text, entry);
    }

    if (!request.force) {
      for (const [sent, entry] of pending) {
        for (const id of order) {
          const cached = cache.get(id, request.source, request.target, sent);
          if (cached === undefined) continue;
          for (const waiting of entry.waiting) {
            outcomes.set(waiting.original, { text: restoreTerms(cached, waiting.terms).text, source: "cache", engine: id });
          }
          pending.delete(sent);
          break;
        }
      }
    }
    return { outcomes, pending };
  }

  async translate(request: TranslationRequest): Promise<TranslationBatch> {
    const order = request.engine ? [request.engine] : readSettings().order;
    const cache = openCache();
    const { outcomes, pending } = this.resolveLocally(request, cache, order);

    const reasons: string[] = [];
    let sentCharacters = 0;
    let fallback: TranslationBatch["fallback"];
    /** Pourquoi le moteur principal, pourtant configuré, n'a pas tout traduit. */
    let primaryReason: string | undefined;

    if (pending.size > 0 && request.allowEngines === false) reasons.push(LEVEL_REFUSAL);

    for (const id of request.allowEngines === false ? [] : order) {
      if (pending.size === 0) break;
      const label = ENGINE_LABELS[id];
      const note = (reason: string, configured = true) => {
        reasons.push(`${label} : ${reason}`);
        if (id === order[0] && configured) primaryReason ??= reason;
      };

      const availability = this.availability(id);
      if (!availability.available || !availability.engine) {
        note(availability.reason ?? "indisponible", availability.configured);
        continue;
      }

      // Jamais au-delà du plafond : seules les premières phrases qui y tiennent partent.
      const texts: string[] = [];
      let budget = availability.budget;
      for (const [sent, entry] of pending) {
        if (entry.characters > budget) break;
        budget -= entry.characters;
        texts.push(sent);
      }
      if (texts.length < pending.size) note("plafond mensuel atteint");

      let translatedHere = 0;
      for (const chunk of chunksOf(texts, pending)) {
        // Au tour de ce lot : ce qu'un lot voisin a mis au cache entre-temps ne repart pas.
        const prepare = () => {
          if (request.force) return chunk;
          const latest = openCache();
          return chunk.filter((sent) => {
            const cached = latest.get(id, request.source, request.target, sent);
            const entry = pending.get(sent);
            if (cached === undefined || !entry) return true;
            for (const waiting of entry.waiting) {
              outcomes.set(waiting.original, { text: restoreTerms(cached, waiting.terms).text, source: "cache", engine: id });
            }
            pending.delete(sent);
            return false;
          });
        };
        let sentTexts: string[];
        let translated: string[];
        try {
          ({ texts: sentTexts, translated } = await this.send(id, availability.engine, prepare, request.source, request.target));
        } catch (error) {
          note(toEngineError(error).message);
          // Le moteur vient d'échouer : le reste du lot ne lui est pas présenté.
          break;
        }
        if (sentTexts.length === 0) continue;
        const characters = sentTexts.reduce((sum, sent) => sum + (pending.get(sent)?.characters ?? 0), 0);
        sentCharacters += characters;
        addUsage(id, characters, this.clock.now());

        let empty = 0;
        sentTexts.forEach((sent, index) => {
          const text = cleanTranslation(translated[index]);
          const entry = pending.get(sent);
          if (!entry) return;
          if (!text) {
            empty++;
            return;
          }
          cache.set(id, request.source, request.target, sent, text);
          for (const waiting of entry.waiting) {
            outcomes.set(waiting.original, { text: restoreTerms(text, waiting.terms).text, source: "engine", engine: id });
          }
          pending.delete(sent);
          translatedHere++;
        });
        cache.save();
        if (empty > 0) note("traduction vide rendue pour certaines phrases");
      }

      if (translatedHere > 0 && id !== order[0] && primaryReason && !fallback) {
        fallback = { from: order[0], to: id, reason: primaryReason };
      }
    }

    const error = reasons.join(" ; ") || "Aucun moteur de traduction n'a répondu.";
    const results: TranslationResult[] = [];
    const failed: TranslationBatch["failed"] = [];
    for (const item of request.items) {
      const original = item.text.trim();
      const outcome = outcomes.get(original);
      if (outcome) results.push({ id: item.id, ...outcome });
      else failed.push({ id: item.id, error: original ? error : "Rien à traduire." });
    }
    return { results, failed, ...(fallback ? { fallback } : {}), sentCharacters };
  }

  // ─── Estimation ────────────────────────────────────────────────

  /** Ce qu'un lot coûterait, sans rien envoyer. */
  estimate(request: Omit<TranslationRequest, "items"> & { texts: string[] }): TranslationEstimate {
    const order = request.engine ? [request.engine] : readSettings().order;
    const items = request.texts.map((text, index) => ({ id: String(index), text }));
    const { pending } = this.resolveLocally({ ...request, items }, openCache(), order);

    const characters = request.texts.reduce((sum, text) => sum + countCharacters(text.trim()), 0);
    let toSend = 0;
    for (const entry of pending.values()) toSend += entry.characters;
    toSend = Math.min(toSend, characters);

    const estimate: TranslationEstimate = { characters, known: characters - toSend, toSend };
    const engine = request.allowEngines === false ? undefined : order.find((id) => this.availability(id).available);
    if (engine) estimate.engine = engine;
    return estimate;
  }

  // ─── Essai d'un moteur ─────────────────────────────────────────

  /**
   * Une courte traduction d'essai, demandée par un administrateur. Elle passe
   * par la file et respecte le délai minimal, mais ignore les mises à l'écart :
   * c'est le moyen de remettre un moteur en service après avoir corrigé sa clé.
   * Une seule requête, sans nouvelle tentative.
   */
  async test(id: TranslationEngineId): Promise<{ ok: boolean; message: string }> {
    const label = ENGINE_LABELS[id];
    const resolved = this.resolve(id);
    const engine = resolved.engine;
    if (!engine) return { ok: false, message: `${label} : ${resolved.reason ?? "non configuré"}.` };

    const sample = "Hello";
    try {
      const [translated] = await this.enqueue(id, () => this.request(engine, [sample], "en", "fr"));
      addUsage(id, countCharacters(sample), this.clock.now());
      this.recordSuccess(id);
      return { ok: true, message: `${label} répond : « ${sample} » donne « ${cleanTranslation(translated).slice(0, 80)} ».` };
    } catch (error) {
      const failure = toEngineError(error);
      const now = this.clock.now();
      if (failure.kind === "unauthorized") markRejected(id, resolved.fingerprint, now);
      if (failure.kind === "quota-exceeded") markQuotaExceeded(id, nextDay(now), now);
      return { ok: false, message: failure.message };
    }
  }
}

/** Texte rendu par un service : sans caractère de contrôle, borné. */
function cleanTranslation(text: string): string {
  return text.replace(CONTROL_EXCEPT_NEWLINE, " ").trim().slice(0, MAX_TRANSLATION_LENGTH);
}

/** Découpe un lot en requêtes, dans l'ordre, sans dépasser ce qu'une requête emporte. */
function chunksOf(texts: string[], pending: Map<string, PendingText>): string[][] {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let characters = 0;
  for (const text of texts) {
    const size = pending.get(text)?.characters ?? 0;
    if (chunk.length > 0 && (chunk.length >= TIMINGS.maxTextsPerRequest || characters + size > TIMINGS.maxCharactersPerRequest)) {
      chunks.push(chunk);
      chunk = [];
      characters = 0;
    }
    chunk.push(text);
    characters += size;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}
