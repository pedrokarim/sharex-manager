/**
 * Compteurs de quota par service, par compartiment et par jour.
 *
 * Le quota appartient à l'application déclarée chez le service, donc à tous
 * les comptes de ce service ensemble : un seul compteur par connecteur. Le
 * jour est celui du service (fuseau du Pacifique pour Google), fourni par le
 * connecteur. Une action qui dépasserait le reste du jour est refusée avant
 * l'appel, avec un message clair.
 */

import type { AccountQuotaUsage, Connector, QuotaUsage } from "./types";
import { QuotaExceededError } from "./errors";
import { readStore, updateStore } from "./store";

interface ConnectorQuota {
  day: string;
  used: Record<string, number>;
  /**
   * Compartiments déclarés épuisés par le service, quel que soit le compteur
   * local (qui ne voit pas les appels faits ailleurs avec la même application).
   */
  exhausted?: string[];
  /** Publication suspendue jusqu'à cet instant (quota épuisé d'après le service). */
  pausedUntil?: number;
}

type QuotaFile = Record<string, ConnectorQuota>;

// ─── Fuseaux ──────────────────────────────────────────────────────

function zonedParts(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Jour (AAAA-MM-JJ) de `now` dans le fuseau donné. */
export function zonedDay(now: number, timeZone: string): string {
  const { year, month, day } = zonedParts(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Écart du fuseau avec UTC à l'instant donné, en millisecondes. */
function zoneOffset(at: number, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** Prochain minuit dans le fuseau donné, après `now`. */
export function zonedMidnightAfter(now: number, timeZone: string): number {
  const { year, month, day } = zonedParts(now, timeZone);
  const naive = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  // L'écart est lu juste avant minuit local : un changement d'heure dans la
  // journée ne décale pas la remise à zéro.
  return naive - zoneOffset(naive - zoneOffset(naive, timeZone) - 1000, timeZone);
}

// ─── Compteurs ────────────────────────────────────────────────────

function currentEntry(file: QuotaFile, connector: Connector, now: number): ConnectorQuota {
  const day = connector.quota!.day(now);
  const entry = file[connector.id];
  if (!entry || entry.day !== day) return { day, used: {}, pausedUntil: entry?.pausedUntil && entry.pausedUntil > now ? entry.pausedUntil : undefined };
  return entry;
}

export function getQuotaUsage(connector: Connector, now = Date.now()): QuotaUsage | null {
  if (!connector.quota) return null;
  const entry = currentEntry(readStore<QuotaFile>("quota", {}), connector, now);
  return {
    connector: connector.id,
    day: entry.day,
    buckets: connector.quota.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      used: entry.exhausted?.includes(bucket.id) ? bucket.limit : Math.min(entry.used[bucket.id] ?? 0, bucket.limit),
      limit: bucket.limit,
    })),
    resetsAt: connector.quota.nextReset(now),
    pausedUntil: entry.pausedUntil && entry.pausedUntil > now ? entry.pausedUntil : undefined,
  };
}

/**
 * Compte une méthode avant de l'appeler. Lève `QuotaExceededError` si le
 * reste du jour ne suffit pas : l'appel n'est alors pas fait.
 */
export function chargeQuota(connector: Connector, method: string, now = Date.now()) {
  const quota = connector.quota;
  if (!quota) return;
  const { bucket, units } = quota.cost(method);
  const spec = quota.buckets.find((entry) => entry.id === bucket);
  if (!spec) return;
  updateStore<QuotaFile>("quota", {}, (file) => {
    const entry = currentEntry(file, connector, now);
    const used = entry.exhausted?.includes(bucket) ? spec.limit : (entry.used[bucket] ?? 0);
    if (used + units > spec.limit) {
      throw new QuotaExceededError(
        `Quota du jour épuisé chez ${connector.label} (${spec.label}, ${used}/${spec.limit}) : réessayez après la remise à zéro.`,
        quota.nextReset(now),
        bucket
      );
    }
    entry.used[bucket] = used + units;
    file[connector.id] = entry;
  });
}

/**
 * Le service a répondu « quota dépassé » : le compartiment est marqué plein et
 * la publication suspendue jusqu'à la remise à zéro. Rend l'instant de reprise.
 */
export function markQuotaExhausted(connector: Connector, bucket: string | undefined, now = Date.now()): number {
  const retryAt = connector.quota ? connector.quota.nextReset(now) : now + 60 * 60 * 1000;
  if (!connector.quota) return retryAt;
  updateStore<QuotaFile>("quota", {}, (file) => {
    const entry = currentEntry(file, connector, now);
    const spec = connector.quota!.buckets.find((candidate) => candidate.id === bucket);
    if (spec) entry.exhausted = [...new Set([...(entry.exhausted ?? []), spec.id])];
    entry.pausedUntil = retryAt;
    file[connector.id] = entry;
  });
  return retryAt;
}

/** Instant jusqu'auquel la publication de ce service est suspendue, s'il y en a un. */
export function quotaPausedUntil(connector: Connector, now = Date.now()): number | undefined {
  const entry = readStore<QuotaFile>("quota", {})[connector.id];
  return entry?.pausedUntil && entry.pausedUntil > now ? entry.pausedUntil : undefined;
}

/**
 * Lève la suspension (« Reprendre » à la main) : le service sera interrogé à
 * nouveau ; s'il refuse encore, la suspension revient.
 */
export function clearQuotaPause(connectorId: string) {
  updateStore<QuotaFile>("quota", {}, (file) => {
    if (!file[connectorId]) return;
    delete file[connectorId].pausedUntil;
    delete file[connectorId].exhausted;
  });
}

// ─── Quota par compte, sur fenêtre glissante ──────────────────────

interface AccountQuotaEntry {
  /** Unités comptées, avec leur instant : elles sortent de la fenêtre une à une. */
  events: { bucket: string; units: number; at: number }[];
  /** Publication de ce compte suspendue jusqu'à cet instant. */
  pausedUntil?: number;
}

type AccountQuotaFile = Record<string, AccountQuotaEntry>;

function freshEvents(entry: AccountQuotaEntry | undefined, windowMs: number, now: number) {
  return (entry?.events ?? []).filter((event) => event.at > now - windowMs && event.at <= now + 60_000);
}

/** Instant où assez d'unités sortent de la fenêtre pour que `units` de plus passent. */
function releaseTime(events: AccountQuotaEntry["events"], bucket: string, limit: number, units: number, windowMs: number, now: number): number {
  const inBucket = events.filter((event) => event.bucket === bucket).sort((a, b) => a.at - b.at);
  let used = inBucket.reduce((sum, event) => sum + event.units, 0);
  for (const event of inBucket) {
    used -= event.units;
    if (used + units <= limit) return event.at + windowMs;
  }
  return now + windowMs;
}

/**
 * Compte une méthode dans le quota propre au compte, avant l'appel. Lève
 * `QuotaExceededError` (portée « account ») si la fenêtre glissante ne le
 * permet pas. `dryRun` vérifie sans compter.
 */
export function chargeAccountQuota(connector: Connector, accountId: string, method: string, options: { now?: number; dryRun?: boolean } = {}) {
  const quota = connector.accountQuota;
  if (!quota) return;
  const cost = quota.cost(method);
  if (!cost) return;
  const spec = quota.buckets.find((entry) => entry.id === cost.bucket);
  if (!spec) return;
  const now = options.now ?? Date.now();
  const check = (entry: AccountQuotaEntry | undefined) => {
    const events = freshEvents(entry, quota.windowMs, now);
    const used = events.filter((event) => event.bucket === spec.id).reduce((sum, event) => sum + event.units, 0);
    if (used + cost.units > spec.limit) {
      throw new QuotaExceededError(
        `Limite atteinte pour ce compte chez ${connector.label} (${spec.label}, ${used}/${spec.limit} sur la période) : la publication reprendra d’elle-même.`,
        releaseTime(events, spec.id, spec.limit, cost.units, quota.windowMs, now),
        spec.id,
        "account"
      );
    }
    return events;
  };
  if (options.dryRun) {
    check(readStore<AccountQuotaFile>("account-quota", {})[accountId]);
    return;
  }
  updateStore<AccountQuotaFile>("account-quota", {}, (file) => {
    const events = check(file[accountId]);
    file[accountId] = { ...file[accountId], events: [...events, { bucket: spec.id, units: cost.units, at: now }] };
  });
}

/** Le service a dit « limite atteinte » pour ce compte : sa publication attend jusqu'à `retryAt`. */
export function markAccountQuotaExhausted(accountId: string, retryAt: number) {
  updateStore<AccountQuotaFile>("account-quota", {}, (file) => {
    file[accountId] = { events: file[accountId]?.events ?? [], pausedUntil: retryAt };
  });
}

export function accountQuotaPausedUntil(accountId: string, now = Date.now()): number | undefined {
  const until = readStore<AccountQuotaFile>("account-quota", {})[accountId]?.pausedUntil;
  return until && until > now ? until : undefined;
}

/** « Reprendre » à la main : le compte est de nouveau essayé. */
export function clearAccountQuotaPause(accountId: string) {
  updateStore<AccountQuotaFile>("account-quota", {}, (file) => {
    if (file[accountId]) delete file[accountId].pausedUntil;
  });
}

/** Oublie l'usage d'un compte déconnecté. */
export function forgetAccountQuota(accountId: string) {
  updateStore<AccountQuotaFile>("account-quota", {}, (file) => {
    delete file[accountId];
  });
}

export function getAccountQuotaUsage(connector: Connector, accountId: string, now = Date.now()): AccountQuotaUsage | null {
  const quota = connector.accountQuota;
  if (!quota) return null;
  const entry = readStore<AccountQuotaFile>("account-quota", {})[accountId];
  const events = freshEvents(entry, quota.windowMs, now);
  const oldest = events.reduce((min, event) => Math.min(min, event.at), Number.POSITIVE_INFINITY);
  return {
    accountId,
    windowMs: quota.windowMs,
    buckets: quota.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      used: events.filter((event) => event.bucket === bucket.id).reduce((sum, event) => sum + event.units, 0),
      limit: bucket.limit,
    })),
    nextReleaseAt: Number.isFinite(oldest) ? oldest + quota.windowMs : undefined,
    pausedUntil: entry?.pausedUntil && entry.pausedUntil > now ? entry.pausedUntil : undefined,
  };
}
