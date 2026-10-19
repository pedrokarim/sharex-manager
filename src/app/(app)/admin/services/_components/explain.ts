/**
 * Ce qu'un appel raconte, en mots : la famille d'un échec (notée par le code
 * appelant, ou déduite du message pour les appels notés avant qu'elle le
 * soit), son nom court pour le tableau, et l'explication complète du détail
 * (ce qui s'est passé, quoi faire), propre au service quand c'est utile.
 * Rien ici ne dessine : module pur, testé seul.
 */

import { AI_ERROR_KINDS, type AiErrorKind, type AiProviderId, type AiProviderOverview, type AiUsageEvent } from "@/lib/ai-usage/types";

/** Espace insécable, avant « : » et entre un nombre et son unité. */
const NBSP = " ";

/** Nom court d'une famille d'échec, pour la colonne « Issue ». */
export const ERROR_KIND_LABELS: Record<AiErrorKind, string> = {
  "rate-limit": "Trop de demandes",
  network: "Réseau",
  auth: "Accès refusé",
  quota: "Crédit épuisé",
  timeout: "Délai dépassé",
  provider: "Erreur du service",
  input: "Demande refusée",
  unknown: "Inconnue",
};

export function isErrorKind(value: unknown): value is AiErrorKind {
  return typeof value === "string" && (AI_ERROR_KINDS as readonly string[]).includes(value);
}

/**
 * Règles de déduction, dans l'ordre : un crédit épuisé arrive souvent avec un
 * statut 429, il passe donc avant la limite de débit ; une connexion qui
 * expire (`ETIMEDOUT`) est un problème de réseau, pas un délai de l'appel.
 */
const INFERENCE: [AiErrorKind, RegExp][] = [
  ["quota", /credit_balance|insufficient_quota|quota|cr[ée]dit|billing|usage limit|payment required|\b402\b|solde (?:épuisé|insuffisant)/i],
  ["rate-limit", /\b429\b|too many requests|rate[ _-]?limit|trop de (?:demandes|requêtes)/i],
  ["network", /connexion refusée|econn\w*|etimedout|enotfound|eai_again|ehostunreach|fetch failed|socket hang up|network|réseau|injoignable|stream disconnected|unreachable/i],
  ["auth", /\b40[13]\b|unauthori[sz]ed|forbidden|invalid[ _-]?api[ _-]?key|api key|authentication|clé (?:refusée|invalide)|non connecté|not logged in/i],
  ["timeout", /time ?out|timed out|délai/i],
  ["input", /\b400\b|\b422\b|bad request|invalid request|content[ _-]policy|safety|moderation|refusée? par le service|unsupported|trop long/i],
  ["provider", /\b5\d\d\b|internal server error|bad gateway|service unavailable|overloaded|surcharg/i],
];

/** Famille d'un échec déduite de son message ; `unknown` si rien ne la dit. */
export function inferErrorKind(text: string | undefined): AiErrorKind {
  if (!text) return "unknown";
  for (const [kind, pattern] of INFERENCE) if (pattern.test(text)) return kind;
  return "unknown";
}

/** Famille d'un appel : `null` s'il a réussi, celle notée sinon, ou celle que disent ses messages. */
export function errorKindOf(event: Pick<AiUsageEvent, "ok" | "error" | "errorKind" | "detail">): AiErrorKind | null {
  if (event.ok) return null;
  if (isErrorKind(event.errorKind)) return event.errorKind;
  const fromError = inferErrorKind(event.error);
  return fromError !== "unknown" ? fromError : inferErrorKind(event.detail);
}

/** « 850 ms », « 2,4 s », « 1 min 12 s ». */
export function formatDuration(ms: number | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)}${NBSP}ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: ms < 10_000 ? 1 : 0 })}${NBSP}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes}${NBSP}min ${seconds}${NBSP}s` : `${minutes}${NBSP}min`;
}

/** Moment court, pour une colonne étroite : « il y a 14 min », « il y a 3 h », « il y a 2 j ». */
export function formatRelativeShort(at: number, now = Date.now()): string {
  const seconds = Math.round((now - at) / 1000);
  if (!Number.isFinite(seconds)) return "–";
  if (seconds < 45) return "à l’instant";
  if (seconds < 3600) return `il y a ${Math.max(1, Math.round(seconds / 60))}${NBSP}min`;
  if (seconds < 86_400) return `il y a ${Math.round(seconds / 3600)}${NBSP}h`;
  if (seconds < 30 * 86_400) return `il y a ${Math.round(seconds / 86_400)}${NBSP}j`;
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** « dimanche 19 octobre 2026 à 14:32:05 ». */
export function formatFullDate(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "–";
  const day = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${day} à ${time}`;
}

// ─── Explications ─────────────────────────────────────────────────

export interface FailureExplanation {
  kind: AiErrorKind;
  /** Nom court : « Trop de demandes ». */
  label: string;
  /** Ce qui s'est passé. */
  summary: string;
  /** Ce qu'il faut faire, s'il y a quelque chose à faire. */
  advice: string;
  /** Page où régler le service, quand la cause s'y corrige (clé, crédit). */
  settingsHref?: string;
}

type ProviderFacts = Pick<AiProviderOverview, "id" | "label" | "kind"> & { settingsHref?: string };

/** Services de voix : une autre voix contourne un service qui ne répond plus. */
const VOICE_PROVIDERS: AiProviderId[] = ["edge-tts", "azure-speech", "google-tts", "elevenlabs"];

function rateLimit(provider: ProviderFacts): Omit<FailureExplanation, "kind" | "label"> {
  if (provider.id === "codex") {
    return {
      summary: "L’abonnement ChatGPT de Codex a refusé des demandes trop rapprochées.",
      advice: "L’application les espace désormais et réessaie ; si cela revient souvent, réduisez les créations lancées en même temps.",
    };
  }
  if (provider.kind === "cli") {
    return {
      summary: `L’abonnement derrière ${provider.label} a refusé des demandes trop rapprochées.`,
      advice: "L’application espace ses appels et réessaie ; si cela revient souvent, réduisez les créations lancées en même temps.",
    };
  }
  return {
    summary: `${provider.label} a refusé des demandes trop rapprochées : sa limite de débit était atteinte.`,
    advice: "C’est passager : les appels suivants passent dès que la fenêtre de la limite se libère. Si cela revient souvent, lancez moins de traitements en même temps.",
  };
}

function network(provider: ProviderFacts): Omit<FailureExplanation, "kind" | "label"> {
  const summary = "Le service n’a pas répondu ou a refusé la connexion.";
  if (provider.kind === "self-hosted") {
    return {
      summary: `Le serveur ${provider.label} n’a pas répondu ou a refusé la connexion.`,
      advice: "Vérifiez qu’il tourne et que son adresse est juste dans les réglages ; l’application ne peut pas le relancer elle-même.",
    };
  }
  if (VOICE_PROVIDERS.includes(provider.id)) {
    return {
      summary,
      advice: "C’est le plus souvent passager : l’application réessaie plusieurs fois. Si tous les appels échouent pendant des heures, choisissez une autre voix.",
    };
  }
  return {
    summary,
    advice: "C’est le plus souvent passager : l’application réessaie plusieurs fois. Si tous les appels échouent pendant des heures, vérifiez que le serveur accède bien à Internet.",
  };
}

function quota(provider: ProviderFacts): Omit<FailureExplanation, "kind" | "label"> {
  if (provider.kind === "cli") {
    return {
      summary: `L’abonnement derrière ${provider.label} a atteint sa limite d’usage.`,
      advice: "Les appels reprendront à la fin de la fenêtre d’usage de l’abonnement ; en attendant, les créations qui en dépendent échouent.",
    };
  }
  if (provider.kind === "free") {
    return {
      summary: `Le quota gratuit de ${provider.label} est épuisé pour la période en cours.`,
      advice: "Les appels reprendront à sa remise à zéro ; rien à régler dans l’application.",
    };
  }
  return {
    summary: `Crédit épuisé chez ${provider.label}.`,
    advice: "Rechargez le compte de la clé, ou relevez son plafond chez le fournisseur ; les appels reprendront aussitôt.",
  };
}

function auth(provider: ProviderFacts): Omit<FailureExplanation, "kind" | "label"> {
  if (provider.kind === "cli") {
    return {
      summary: `${provider.label} n’est plus connecté au compte de l’abonnement.`,
      advice: "Reconnectez l’outil sur le serveur (connexion du CLI), puis relancez la création.",
    };
  }
  return {
    summary: `${provider.label} a refusé la clé d’accès : absente, révoquée ou sans le droit demandé.`,
    advice: "Vérifiez la clé dans les réglages, ou créez-en une nouvelle chez le fournisseur.",
  };
}

const GENERIC: Record<Exclude<AiErrorKind, "rate-limit" | "network" | "quota" | "auth">, (provider: ProviderFacts) => Omit<FailureExplanation, "kind" | "label">> = {
  timeout: (provider) => ({
    summary: `${provider.label} n’a pas répondu dans le délai accordé.`,
    advice: "Une demande très longue (texte long, image lourde) peut dépasser le délai : réessayez, et si cela se répète, découpez la demande.",
  }),
  provider: (provider) => ({
    summary: `${provider.label} a renvoyé une erreur de son côté (panne ou surcharge).`,
    advice: "C’est en général passager : réessayez plus tard. Le message ci-dessous est celui du service.",
  }),
  input: (provider) => ({
    summary: `${provider.label} a refusé la demande elle-même : contenu, format ou paramètre qu’il n’accepte pas.`,
    advice: "Réessayer à l’identique échouera de nouveau : modifiez le texte ou l’image envoyés, ou le réglage en cause.",
  }),
  unknown: () => ({
    summary: "L’application n’a pas su classer cet échec.",
    advice: "Le message ci-dessous est celui du service ou de l’outil. S’il se répète, il dit en général où chercher.",
  }),
};

/** Explication complète d'un échec, pour le détail d'un appel. */
export function explainFailure(event: Pick<AiUsageEvent, "ok" | "error" | "errorKind" | "detail">, provider: ProviderFacts): FailureExplanation | null {
  const kind = errorKindOf(event);
  if (!kind) return null;
  const text =
    kind === "rate-limit" ? rateLimit(provider) : kind === "network" ? network(provider) : kind === "quota" ? quota(provider) : kind === "auth" ? auth(provider) : GENERIC[kind](provider);
  const explanation: FailureExplanation = { kind, label: ERROR_KIND_LABELS[kind], ...text };
  // Le réglage n'aide que là où la cause se corrige : la clé, le crédit.
  if (provider.settingsHref && (kind === "auth" || kind === "quota") && provider.kind !== "free") explanation.settingsHref = provider.settingsHref;
  return explanation;
}
