/**
 * Mots et calculs communs de l'écran « Services externes » : unités en
 * toutes lettres, nombres en français, part d'une limite et son état, accès
 * d'un fournisseur, noms des modules. Rien ici ne dessine.
 */

import type { AiLimit, AiProviderOverview, AiUnit, AiUsageEvent } from "@/lib/ai-usage/types";

/** Espace insécable entre un nombre et son unité : « 412 000 caractères » ne se coupe pas. */
const NBSP = " ";

const UNIT_WORDS: Record<AiUnit, { one: string; many: string; feminine?: boolean }> = {
  calls: { one: "appel", many: "appels" },
  characters: { one: "caractère", many: "caractères" },
  images: { one: "image", many: "images", feminine: true },
  tokens: { one: "jeton", many: "jetons" },
  seconds: { one: "seconde", many: "secondes", feminine: true },
};

export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** L'unité seule, accordée au nombre. */
export function unitWord(unit: AiUnit, count: number): string {
  return Math.abs(count) >= 2 ? UNIT_WORDS[unit].many : UNIT_WORDS[unit].one;
}

/** « 412 000 caractères », « 1 appel ». */
export function formatAmount(value: number, unit: AiUnit): string {
  return `${formatNumber(value)}${NBSP}${unitWord(unit, value)}`;
}

/** « 88 000 caractères restants », « 3 images restantes ». */
export function formatRemaining(value: number, unit: AiUnit): string {
  const word = `restant${UNIT_WORDS[unit].feminine ? "e" : ""}${Math.abs(value) >= 2 ? "s" : ""}`;
  return `${formatAmount(value, unit)} ${word}`;
}

/** « 500 000 caractères » : la limite et son unité, la partie qui suit « consommé / ». */
export function formatLimitPart(limit: number, unit: AiUnit): string {
  return `${formatNumber(limit)}${NBSP}${unitWord(unit, limit)}`;
}

/** Quantité d'un appel, avec ce qu'il a compté dans d'autres unités : « 1 appel · 1 240 jetons ». */
export function formatEventAmount(event: Pick<AiUsageEvent, "amount" | "unit" | "extra">): string {
  const extras = Object.entries(event.extra ?? {}) as [AiUnit, number | undefined][];
  return [formatAmount(event.amount, event.unit), ...extras.filter(([unit, value]) => unit !== event.unit && value).map(([unit, value]) => formatAmount(value!, unit))].join(" · ");
}

/** « 412 000 / 500 000 caractères ». */
export function formatUsedOf(used: number, limit: number, unit: AiUnit): string {
  return `${formatNumber(used)} / ${formatNumber(limit)}${NBSP}${unitWord(unit, limit)}`;
}

/** « 82 % », « < 1 % » pour une part entamée mais minuscule. */
export function formatShare(share: number, used: number): string {
  const text = used > 0 && share < 1 ? "< 1" : String(Math.round(share));
  return `${text}${NBSP}%`;
}

// ─── Limites ──────────────────────────────────────────────────────

/** Seuil à partir duquel une limite passe à l'orange, comme les quotas des comptes connectés. */
export const LOW_SHARE = 80;

export type LimitState = "available" | "low" | "exhausted" | "blocked";

/** Part utilisée, en pourcentage, bornée à 100. */
export function limitShare(limit: Pick<AiLimit, "used" | "limit">): number {
  if (limit.limit <= 0) return limit.used > 0 ? 100 : 0;
  return Math.min(100, (limit.used / limit.limit) * 100);
}

export function isBlocked(limit: Pick<AiLimit, "blockedUntil">, now = Date.now()): boolean {
  return typeof limit.blockedUntil === "number" && limit.blockedUntil > now;
}

export function limitState(limit: AiLimit, now = Date.now()): LimitState {
  if (isBlocked(limit, now)) return "blocked";
  const share = limitShare(limit);
  if (share >= 100) return "exhausted";
  if (share >= LOW_SHARE) return "low";
  return "available";
}

/** Rang d'urgence : une limite bloquée d'abord, puis la plus entamée. */
export function compareLimits(a: AiLimit, b: AiLimit, now = Date.now()): number {
  const blocked = Number(isBlocked(b, now)) - Number(isBlocked(a, now));
  if (blocked !== 0) return blocked;
  const share = limitShare(b) - limitShare(a);
  if (share !== 0) return share;
  return a.label.localeCompare(b.label, "fr");
}

export const PERIOD_LABELS: Record<AiLimit["period"], string> = {
  day: "par jour",
  month: "par mois",
  plan: "sur l’offre",
};

export const SOURCE_LABELS: Record<AiLimit["source"], { label: string; hint: string }> = {
  local: { label: "Compté ici", hint: "Compteur de l’application : il ne voit que les appels qu’elle a faits." },
  remote: { label: "Lu chez le service", hint: "Solde lu chez le fournisseur : c’est lui qui fait foi." },
  plan: { label: "Limite de l’offre", hint: "Chiffre publié par le fournisseur pour cette offre, sans compteur chez lui." },
};

/** Une limite « à surveiller » : entamée à 80 % ou plus, ou refusée par le service. */
export function needsWatch(limit: AiLimit, now = Date.now()): boolean {
  return isBlocked(limit, now) || limitShare(limit) >= LOW_SHARE;
}

/**
 * Limites d'un fournisseur après une lecture du solde chez lui : chaque
 * limite lue remplace celle de même identifiant, les nouvelles s'ajoutent.
 */
export function mergeLimits(base: AiLimit[], remote: AiLimit[] | undefined): AiLimit[] {
  if (!remote?.length) return base;
  const byId = new Map(base.map((limit) => [limit.id, limit]));
  for (const limit of remote) byId.set(limit.id, limit);
  return [...byId.values()].sort((a, b) => compareLimits(a, b));
}

// ─── Fournisseurs ─────────────────────────────────────────────────

export const ACCESS_LABELS: Record<AiProviderOverview["access"], string> = {
  key: "Clé configurée",
  env: "Variable d’environnement",
  cli: "CLI connecté",
  none: "Non configuré",
  open: "Accès libre",
};

export const ACCESS_HINTS: Record<AiProviderOverview["access"], string> = {
  key: "La clé d’accès est enregistrée dans les réglages de l’application.",
  env: "La clé d’accès vient d’une variable d’environnement du serveur.",
  cli: "L’outil en ligne de commande est connecté au compte de l’abonnement.",
  none: "Aucune clé ni connexion : les modules qui en dépendent ne peuvent pas l’appeler.",
  open: "Service ouvert, appelé sans clé.",
};

export const KIND_LABELS: Record<AiProviderOverview["kind"], string> = {
  api: "API à clé",
  cli: "CLI sur abonnement",
  free: "Service gratuit",
  "self-hosted": "Auto-hébergé",
};

/**
 * Unité qui résume la consommation d'un fournisseur : celle de sa limite la
 * plus tendue, sinon la plus consommée ce mois-ci hors appels, sinon les appels.
 */
export function primaryUnit(provider: Pick<AiProviderOverview, "limits" | "month">): AiUnit {
  if (provider.limits[0]) return provider.limits[0].unit;
  let best: AiUnit = "calls";
  let bestAmount = 0;
  for (const [unit, amount] of Object.entries(provider.month.amount) as [AiUnit, number | undefined][]) {
    if (unit === "calls" || !amount) continue;
    if (amount > bestAmount) {
      best = unit;
      bestAmount = amount;
    }
  }
  return best;
}

/** Quantité consommée dans une unité ; les appels se lisent aussi dans le compteur d'appels. */
export function amountIn(usage: { calls: number; amount: Partial<Record<AiUnit, number>> }, unit: AiUnit): number {
  return usage.amount[unit] ?? (unit === "calls" ? usage.calls : 0);
}

// ─── Modules ──────────────────────────────────────────────────────

const MODULE_NAMES: Record<string, string> = {
  core: "Application",
  "clip-studio": "Clip Studio",
  "scan-studio": "Scan Studio",
  "ai-image-gen": "Génération d’images",
  "reverse-search": "Recherche inversée",
  "brand-kit": "Image de marque",
  watermark: "Filigrane",
};

/** Nom lisible d'un module : connu, ou tiré de son identifiant (`mon-module` → « Mon module »). */
export function moduleName(id: string): string {
  const known = MODULE_NAMES[id];
  if (known) return known;
  const words = id.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase("fr") + words.slice(1) : id;
}

/** Clé stable d'un appel du journal, pour animer les lignes qui arrivent sans rejouer les autres. */
export function eventKeys(events: AiUsageEvent[]): string[] {
  const seen = new Map<string, number>();
  return events.map((event) => {
    const base = `${event.at}:${event.provider}:${event.module}:${event.feature}:${event.amount}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}:${count}` : base;
  });
}
