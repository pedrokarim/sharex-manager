/**
 * Consommation des IA et des services à quota, vue d'ensemble pour l'écran
 * d'administration « Intelligence artificielle » (`/admin/ai`).
 *
 * Chaque appel à un fournisseur, d'où qu'il parte (module ou cœur), est noté
 * dans un registre commun par `recordAiUsage`. Les limites connues (offre
 * gratuite, plafond réglé dans un module, solde lu chez le service) sont
 * fournies à part : le registre compte, il n'interdit rien.
 */

import type { Brand } from "@/components/brand-logo";

/** Fournisseurs suivis. Un nouveau fournisseur s'ajoute ici et dans le catalogue du registre. */
export type AiProviderId =
  | "openai"
  | "google"
  | "stability"
  | "codex"
  | "gemini-cli"
  | "claude-cli"
  | "elevenlabs"
  | "azure-speech"
  | "google-tts"
  | "edge-tts"
  | "deepl"
  | "libretranslate"
  | "mymemory"
  | "serpapi"
  | "saucenao"
  | "tracemoe"
  | "openverse"
  | "pexels";

/** Unité de ce qui est consommé ; un même fournisseur peut en compter plusieurs. */
export type AiUnit = "calls" | "characters" | "images" | "tokens" | "seconds";

/** Un appel noté dans le registre. */
export interface AiUsageEvent {
  provider: AiProviderId;
  /** Module à l'origine de l'appel (`clip-studio`, `scan-studio`…), ou `core`. */
  module: string;
  /** Usage précis, lisible : « Voix off », « Script », « Traduction de page »… */
  feature: string;
  model?: string;
  unit: AiUnit;
  /** Quantité consommée dans `unit` (1 pour un appel, n caractères, n images…). */
  amount: number;
  ok: boolean;
  /** Message d'erreur abrégé, sans secret. */
  error?: string;
  at: number;
  /**
   * Autres quantités du même appel, dans d'autres unités : un appel de modèle
   * de langage compté en `calls` porte ici ses `tokens`. Un événement reste un
   * seul appel.
   */
  extra?: Partial<Record<AiUnit, number>>;
}

export type AiUsageInput = Omit<AiUsageEvent, "at"> & { at?: number };

/** D'où part un appel : le module et l'usage, transmis par l'appelant à un code partagé. */
export interface AiUsageOrigin {
  module: string;
  feature: string;
}

/** Une limite connue d'un fournisseur, avec ce qui en est consommé. */
export interface AiLimit {
  id: string;
  label: string;
  unit: AiUnit;
  period: "day" | "month" | "plan";
  used: number;
  limit: number;
  /** Instant de la prochaine remise à zéro, s'il est connu. */
  resetsAt?: number;
  /**
   * D'où vient le chiffre : compteur local de l'application, solde lu chez le
   * service, ou limite de l'offre (chiffre publié, sans compteur chez nous).
   */
  source: "local" | "remote" | "plan";
  /** Le service a refusé pour quota épuisé, jusqu'à cet instant. */
  blockedUntil?: number;
  note?: string;
}

export interface AiDailyUsage {
  /** AAAA-MM-JJ, fuseau du serveur. */
  day: string;
  calls: number;
  failures: number;
  amount: Partial<Record<AiUnit, number>>;
}

export interface AiFeatureUsage {
  module: string;
  feature: string;
  calls: number;
  failures: number;
  amount: Partial<Record<AiUnit, number>>;
  lastAt: number;
}

export interface AiProviderOverview {
  id: AiProviderId;
  label: string;
  /** Logo officiel (`BrandLogo`), quand il existe. */
  brand?: Brand;
  /** API à clé, CLI sur abonnement, service gratuit sans clé, ou service auto-hébergé. */
  kind: "api" | "cli" | "free" | "self-hosted";
  /** État de l'accès : clé dans un fichier, variable d'environnement, CLI connecté, rien. */
  access: "key" | "env" | "cli" | "none" | "open";
  /** Modules qui l'utilisent (identifiants), même sans appel récent. */
  usedBy: string[];
  /** Limites connues, triées de la plus tendue à la plus large. */
  limits: AiLimit[];
  /** Le solde se lit chez le service à la demande (`readRemoteLimits`). */
  remoteReadable: boolean;
  /** Mois en cours (fuseau du serveur). */
  month: { calls: number; failures: number; amount: Partial<Record<AiUnit, number>> };
  /** Trente derniers jours, du plus ancien au plus récent, jours vides compris. */
  daily: AiDailyUsage[];
  /** Répartition sur trente jours, de la plus forte à la plus faible. */
  byFeature: AiFeatureUsage[];
  lastCall?: Pick<AiUsageEvent, "at" | "ok" | "module" | "feature" | "model" | "error">;
  /** Où se règle ce fournisseur (clé, plafond), s'il a une page. */
  settingsHref?: string;
}

export interface AiUsageOverview {
  generatedAt: number;
  providers: AiProviderOverview[];
  /** Cinquante derniers appels, du plus récent au plus ancien. */
  recent: AiUsageEvent[];
}

/**
 * Ce qu'un module dit d'un fournisseur qu'il utilise, par la fonction que son
 * `module.json` déclare dans `aiUsage.limits`. Le cœur ne lit jamais les
 * fichiers d'un module : il ne connaît que ce rapport.
 */
export interface AiModuleProviderReport {
  /** État de l'accès vu par ce module (clé, variable d'environnement, CLI connecté…). */
  access?: AiProviderOverview["access"];
  /** Limites que ce module tient ou connaît. */
  limits?: AiLimit[];
  /** Le module sait lire le solde chez le service (fonction `aiUsage.remote`). */
  remoteReadable?: boolean;
  /** Page du module où se règle ce fournisseur. */
  settingsHref?: string;
}

/** Rapport d'un module : un fournisseur cité y figure même sans clé, pour `usedBy`. */
export type AiModuleReport = Partial<Record<AiProviderId, AiModuleProviderReport>>;
