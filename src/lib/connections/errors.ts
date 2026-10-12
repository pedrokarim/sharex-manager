/**
 * Erreurs des comptes connectés. Leurs messages sont affichés tels quels :
 * ils ne contiennent jamais de jeton ni de corps de réponse brut.
 */

/** Le service a refusé le jeton d'actualisation : le compte doit être reconnecté. */
export class ReconnectRequiredError extends Error {
  constructor(message = "Ce compte doit être reconnecté.") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

/** Quota du jour épuisé, chez le service ou d'après le compteur local. */
export class QuotaExceededError extends Error {
  /** Instant de la remise à zéro, en millisecondes. */
  readonly retryAt: number;
  /** Compartiment épuisé, s'il est connu. */
  readonly bucket?: string;
  /**
   * « app » (par défaut) : le quota de l'application, commun à tous les
   * comptes du service, est épuisé et toute la publication du service est
   * suspendue. « account » : seul ce compte attend jusqu'à `retryAt`.
   */
  readonly scope: "app" | "account";
  constructor(message: string, retryAt: number, bucket?: string, scope: "app" | "account" = "app") {
    super(message);
    this.name = "QuotaExceededError";
    this.retryAt = retryAt;
    this.bucket = bucket;
    this.scope = scope;
  }
}

/**
 * Crédits épuisés chez un service payant à l'usage, ou budget mensuel de
 * l'instance atteint : les envois du service sont suspendus jusqu'à une
 * reprise à la main (rien ne revient seul).
 */
export class CreditsExhaustedError extends Error {
  constructor(message = "Crédits épuisés chez le service : rechargez-les, puis reprenez les envois.") {
    super(message);
    this.name = "CreditsExhaustedError";
  }
}

/** Erreur d'un échange OAuth ; `code` reprend le code d'erreur du service (« invalid_grant »…). */
export class OAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
  }
}

/** Réponse d'erreur d'une API de service : statut HTTP et raison lue dans le corps. */
export class ServiceError extends Error {
  readonly status: number;
  readonly reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.reason = reason;
  }
}

/** Message affichable d'une erreur quelconque. */
export function errorMessage(error: unknown, fallback = "Erreur inconnue"): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Erreur passagère, qu'un nouvel essai plus tard peut faire aboutir : coupure
 * réseau, service indisponible (5xx, 429), erreur marquée passagère par le
 * connecteur (`transient`, `RetryableError`). Ni un quota, ni une reconnexion,
 * ni un refus définitif.
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  if (error instanceof QuotaExceededError || error instanceof ReconnectRequiredError || error instanceof CreditsExhaustedError || error instanceof OAuthError) return false;
  const marked = (error as { transient?: unknown }).transient;
  if (typeof marked === "boolean") return marked;
  if (error.name === "RetryableError") return true;
  if (error instanceof ServiceError) return error.status >= 500 || error.status === 429 || error.status === 408;
  return error instanceof TypeError || /network|socket|ECONN|ETIMEDOUT|EPIPE|fetch failed|terminated/i.test(error.message);
}
