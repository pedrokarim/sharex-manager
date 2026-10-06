/**
 * Ce qu'un moteur de traduction doit savoir faire, et les erreurs qu'il a le
 * droit de lever. Le routeur (`router.ts`) ne connaît que ce fichier : il ne
 * sait pas à quel service il parle, seulement comment réagir à chaque `kind`
 * (§ 7.5 du dossier).
 *
 * Un moteur ne retente rien, n'attend rien et ne compte rien : il envoie une
 * requête et dit ce qui s'est passé. Les files, délais et bascules sont
 * l'affaire du routeur.
 */

import type { SourceLanguage, TranslationEngineId } from "../../types";

export const ENGINE_IDS: TranslationEngineId[] = ["deepl", "libretranslate"];

export const ENGINE_LABELS: Record<TranslationEngineId, string> = {
  deepl: "DeepL",
  libretranslate: "LibreTranslate",
};

export function isEngineId(value: unknown): value is TranslationEngineId {
  return typeof value === "string" && (ENGINE_IDS as string[]).includes(value);
}

/**
 * - `rate-limited` : trop de requêtes, réessayer plus tard (`retryAfterMs` si le service l'indique) ;
 * - `quota-exceeded` : le crédit de caractères est épuisé, inutile d'insister ;
 * - `unauthorized` : clé refusée, inutile d'insister ;
 * - `unavailable` : panne du service, réseau coupé ou délai dépassé ;
 * - `invalid-request` : le service refuse cette demande-là (paire de langues, taille).
 */
export type EngineErrorKind = "rate-limited" | "quota-exceeded" | "unauthorized" | "unavailable" | "invalid-request";

export class EngineError extends Error {
  readonly kind: EngineErrorKind;
  /** Délai demandé par le service avant une nouvelle requête, en millisecondes. */
  readonly retryAfterMs?: number;

  constructor(kind: EngineErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "EngineError";
    this.kind = kind;
    if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) this.retryAfterMs = retryAfterMs;
  }
}

/** Toute erreur inconnue est une panne : c'est la lecture la plus prudente, elle ne retente qu'une fois. */
export function toEngineError(error: unknown): EngineError {
  if (error instanceof EngineError) return error;
  return new EngineError("unavailable", "Le service n'a pas répondu.");
}

export interface TranslationEngine {
  id: TranslationEngineId;
  /**
   * Traduit `texts` en une seule requête et rend autant de traductions, dans
   * le même ordre. Lève une `EngineError` sinon. `target` est le code de langue
   * du chapitre (« fr », « pt-BR »…) : chaque moteur le convertit.
   */
  translate(texts: string[], source: SourceLanguage, target: string, signal: AbortSignal): Promise<string[]>;
}

// ─── Requête HTTP commune ────────────────────────────────────────

/** `Retry-After` : un nombre de secondes ou une date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export interface JsonResponse {
  status: number;
  /** Corps lu comme du JSON ; `null` s'il n'en est pas. */
  body: unknown;
  retryAfterMs?: number;
}

/** Une réponse de traduction ne pèse jamais plus : au-delà, ce n'est pas ce qu'on attend. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * Envoie un corps JSON et rend le statut et le corps de la réponse. Les textes
 * voyagent dans le corps, sérialisés par `JSON.stringify` : jamais dans
 * l'adresse ni dans un en-tête. Réseau coupé, délai dépassé ou réponse
 * illisible : `unavailable`.
 */
export async function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(payload),
      signal,
      // Une redirection emmènerait la clé et les textes ailleurs que là où on les envoie.
      redirect: "error",
    });
  } catch {
    throw new EngineError("unavailable", signal.aborted ? "Le service n'a pas répondu à temps." : "Service injoignable.");
  }

  let body: unknown = null;
  try {
    const raw = await response.text();
    if (raw.length <= MAX_RESPONSE_BYTES) body = JSON.parse(raw);
  } catch {
    body = null;
  }
  return { status: response.status, body, retryAfterMs: parseRetryAfter(response.headers.get("retry-after")) };
}

/** Vérifie qu'un moteur a rendu une traduction par texte envoyé. */
export function expectTranslations(value: unknown, expected: number): string[] {
  if (!Array.isArray(value) || value.length !== expected || !value.every((entry) => typeof entry === "string")) {
    throw new EngineError("unavailable", "Réponse inattendue du service.");
  }
  return value as string[];
}
