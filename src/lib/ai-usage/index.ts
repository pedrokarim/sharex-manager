/**
 * Registre de consommation des IA et des services à quota (serveur seulement).
 *
 * - `recordAiUsage` : chaque appel réel à un fournisseur, d’où qu’il parte ;
 * - `getAiUsageOverview` : l’aperçu de tous les fournisseurs du catalogue,
 *   même jamais appelés, pour l’écran `/admin/ai` ;
 * - `readRemoteLimits` : le solde lu chez le service, à la demande.
 *
 * Le cœur ne lit aucun fichier de module : ce qu’un module sait d’un
 * fournisseur (accès, plafonds, compteurs) lui est demandé par la fonction
 * que son `module.json` déclare dans `aiUsage`.
 */

import { AI_PROVIDERS, aiProvider, isAiProviderId, isAiUnit, type AiProviderEntry } from "./catalog";
import { flushAiUsage, lastDays, monthKey, readStoredUsage, type StoredAggregate, type StoredUsage } from "./store";
import type {
  AiDailyUsage,
  AiFeatureUsage,
  AiLimit,
  AiModuleProviderReport,
  AiModuleReport,
  AiProviderId,
  AiProviderOverview,
  AiUnit,
  AiUsageOverview,
} from "./types";
import type { ModuleConfig } from "@/types/modules";

export { recordAiUsage, flushAiUsage, setAiUsageDataRoot, usageError, countCharacters } from "./store";
export type * from "./types";

/** Une fonction de module qui ne répond pas ne bloque pas l’écran. */
const MODULE_TIMEOUT_MS = 10_000;
const RECENT_IN_OVERVIEW = 50;
const DAYS_IN_OVERVIEW = 30;

// ─── Rapports des modules ────────────────────────────────────────

export interface ModuleAiReport {
  module: string;
  report: AiModuleReport;
}

const ACCESS = ["env", "key", "cli", "open", "none"] as const;
const PERIODS = ["day", "month", "plan"] as const;
const SOURCES = ["local", "remote", "plan"] as const;

const finite = (value: unknown, minimum = 0): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;

const shortText = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : undefined;

/** Limite rendue par un module, ou `null` si elle n’a pas la forme attendue. */
export function cleanLimit(value: unknown): AiLimit | null {
  const entry = value as Partial<AiLimit> | null;
  if (!entry || typeof entry !== "object") return null;
  const id = shortText(entry.id, 80);
  const label = shortText(entry.label, 120);
  const used = finite(entry.used);
  const limit = finite(entry.limit);
  if (!id || !label || used === null || limit === null || !isAiUnit(entry.unit)) return null;
  if (!(PERIODS as readonly string[]).includes(entry.period as string) || !(SOURCES as readonly string[]).includes(entry.source as string)) return null;
  const clean: AiLimit = { id, label, unit: entry.unit, period: entry.period as AiLimit["period"], used, limit, source: entry.source as AiLimit["source"] };
  const resetsAt = finite(entry.resetsAt, 1);
  if (resetsAt !== null) clean.resetsAt = resetsAt;
  const blockedUntil = finite(entry.blockedUntil, 1);
  if (blockedUntil !== null) clean.blockedUntil = blockedUntil;
  const note = shortText(entry.note, 240);
  if (note) clean.note = note;
  return clean;
}

/** Rapport d’un module, réduit à ce que le cœur sait lire. */
export function cleanReport(value: unknown): AiModuleReport {
  const report: AiModuleReport = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return report;
  for (const [provider, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isAiProviderId(provider) || !raw || typeof raw !== "object") continue;
    const entry = raw as AiModuleProviderReport;
    const clean: AiModuleProviderReport = {};
    if ((ACCESS as readonly string[]).includes(entry.access as string)) clean.access = entry.access;
    if (Array.isArray(entry.limits)) {
      const limits = entry.limits.map(cleanLimit).filter((limit): limit is AiLimit => limit !== null);
      if (limits.length) clean.limits = limits.slice(0, 20);
    }
    if (entry.remoteReadable === true) clean.remoteReadable = true;
    // Une page de l’application seulement : jamais une adresse extérieure.
    if (typeof entry.settingsHref === "string" && /^\/[a-z0-9/_-]{1,120}$/i.test(entry.settingsHref)) clean.settingsHref = entry.settingsHref;
    report[provider] = clean;
  }
  return report;
}

function withTimeout<T>(task: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} n’a pas répondu à temps.`)), MODULE_TIMEOUT_MS);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Le gestionnaire de modules tire avec lui tous les modules : il n’est chargé
 * qu’au moment de s’en servir, pas avec ce fichier (que les modules importent).
 */
async function manager() {
  const { apiModuleManager } = await import("@/lib/modules/module-manager.api");
  await apiModuleManager.ensureInitialized();
  return apiModuleManager;
}

type AiUsageFunction = keyof NonNullable<ModuleConfig["aiUsage"]>;

/** Modules activés et chargés qui déclarent cette fonction, dans l’ordre du disque. */
async function modulesDeclaring(kind: AiUsageFunction): Promise<{ name: string; fn: string }[]> {
  const modules = await manager();
  // `getModules` relit `module.json` et l’état de l’instance : un module coupé disparaît tout de suite.
  return (await modules.getModules())
    .filter((config) => config.enabled && typeof config.aiUsage?.[kind] === "string" && modules.getLoadedModule(config.name)?.status === "loaded")
    .map((config) => ({ name: config.name, fn: config.aiUsage![kind]! }));
}

/** Rapports de tous les modules activés. Un module en échec est passé, avec une ligne dans le journal. */
export async function collectModuleReports(): Promise<ModuleAiReport[]> {
  let declared: { name: string; fn: string }[];
  try {
    declared = await modulesDeclaring("limits");
  } catch (error) {
    console.error("Consommation des IA : modules illisibles.", error instanceof Error ? error.message : error);
    return [];
  }
  const modules = await manager();
  const reports = await Promise.all(
    declared.map(async ({ name, fn }) => {
      try {
        const raw = await withTimeout(Promise.resolve(modules.callModuleFunction(name, fn)), `Le module ${name}`);
        return { module: name, report: cleanReport(raw) };
      } catch (error) {
        console.error(`Consommation des IA : rapport du module ${name} indisponible.`, error instanceof Error ? error.message : error);
        return null;
      }
    })
  );
  return reports.filter((entry): entry is ModuleAiReport => entry !== null);
}

// ─── Aperçu ──────────────────────────────────────────────────────

const ACCESS_RANK: Record<AiProviderOverview["access"], number> = { env: 0, key: 1, cli: 2, open: 3, none: 4 };

const tension = (limit: AiLimit, now: number) => {
  if (limit.blockedUntil && limit.blockedUntil > now) return Infinity;
  return limit.limit > 0 ? limit.used / limit.limit : 0;
};

function addAmount(target: Partial<Record<AiUnit, number>>, source: Partial<Record<AiUnit, number>>) {
  for (const [unit, value] of Object.entries(source) as [AiUnit, number][]) {
    if (typeof value === "number" && Number.isFinite(value)) target[unit] = Math.round(((target[unit] ?? 0) + value) * 1000) / 1000;
  }
}

function providerAggregates(usage: StoredUsage, provider: AiProviderId, day: string): [string, string, StoredAggregate][] {
  const entries: [string, string, StoredAggregate][] = [];
  for (const [moduleName, features] of Object.entries(usage.days[day]?.[provider] ?? {})) {
    for (const [feature, aggregate] of Object.entries(features ?? {})) {
      if (aggregate && typeof aggregate.calls === "number") entries.push([moduleName, feature, aggregate]);
    }
  }
  return entries;
}

function buildProvider(entry: AiProviderEntry, usage: StoredUsage, reports: ModuleAiReport[], now: number): AiProviderOverview {
  const days = lastDays(now, DAYS_IN_OVERVIEW);
  const month = monthKey(now);
  const usedBy = new Set<string>();
  const limits: AiLimit[] = [];
  let access: AiProviderOverview["access"] | undefined;
  let settingsHref: string | undefined;
  let remoteReadable = false;

  for (const { module: moduleName, report } of reports) {
    const part = report[entry.id];
    if (!part) continue;
    usedBy.add(moduleName);
    if (part.access && (access === undefined || ACCESS_RANK[part.access] < ACCESS_RANK[access])) access = part.access;
    if (part.limits) limits.push(...part.limits);
    settingsHref ??= part.settingsHref;
    if (part.remoteReadable) remoteReadable = true;
  }

  const daily: AiDailyUsage[] = days.map((day) => {
    const totals: AiDailyUsage = { day, calls: 0, failures: 0, amount: {} };
    for (const [moduleName, , aggregate] of providerAggregates(usage, entry.id, day)) {
      totals.calls += aggregate.calls;
      totals.failures += aggregate.failures;
      addAmount(totals.amount, aggregate.amount);
      usedBy.add(moduleName);
    }
    return totals;
  });

  const features = new Map<string, AiFeatureUsage>();
  for (const day of days) {
    for (const [moduleName, feature, aggregate] of providerAggregates(usage, entry.id, day)) {
      const key = `${moduleName}\u0000${feature}`;
      const current = features.get(key) ?? { module: moduleName, feature, calls: 0, failures: 0, amount: {}, lastAt: 0 };
      current.calls += aggregate.calls;
      current.failures += aggregate.failures;
      addAmount(current.amount, aggregate.amount);
      current.lastAt = Math.max(current.lastAt, aggregate.lastAt ?? 0);
      features.set(key, current);
    }
  }

  const monthTotals: AiProviderOverview["month"] = { calls: 0, failures: 0, amount: {} };
  for (const day of Object.keys(usage.days)) {
    if (!day.startsWith(`${month}-`)) continue;
    for (const [, , aggregate] of providerAggregates(usage, entry.id, day)) {
      monthTotals.calls += aggregate.calls;
      monthTotals.failures += aggregate.failures;
      addAmount(monthTotals.amount, aggregate.amount);
    }
  }

  const last = usage.last[entry.id];
  const overview: AiProviderOverview = {
    id: entry.id,
    label: entry.label,
    ...(entry.brand ? { brand: entry.brand } : {}),
    kind: entry.kind,
    access: access ?? (entry.kind === "free" ? "open" : "none"),
    usedBy: [...usedBy].sort(),
    limits: limits.sort((a, b) => tension(b, now) - tension(a, now)),
    remoteReadable: entry.remote && remoteReadable,
    month: monthTotals,
    daily,
    byFeature: [...features.values()].sort((a, b) => b.calls - a.calls || b.lastAt - a.lastAt),
  };
  if (last) {
    overview.lastCall = { at: last.at, ok: last.ok, module: last.module, feature: last.feature };
    if (last.model) overview.lastCall.model = last.model;
    if (last.error) overview.lastCall.error = last.error;
  }
  if (settingsHref) overview.settingsHref = settingsHref;
  return overview;
}

/** Aperçu à partir d’un registre et de rapports donnés : fonction pure, testée seule. */
export function buildAiUsageOverview(usage: StoredUsage, reports: ModuleAiReport[], now = Date.now()): AiUsageOverview {
  return {
    generatedAt: now,
    providers: AI_PROVIDERS.map((entry) => buildProvider(entry, usage, reports, now)),
    recent: usage.recent.slice(0, RECENT_IN_OVERVIEW),
  };
}

/** Aperçu de tous les fournisseurs du catalogue, appels en attente compris. */
export async function getAiUsageOverview(): Promise<AiUsageOverview> {
  flushAiUsage();
  const reports = await collectModuleReports();
  return buildAiUsageOverview(readStoredUsage(), reports);
}

// ─── Solde chez le service ───────────────────────────────────────

/**
 * Lit le solde chez le service, par le module qui en tient la clé (fonction
 * `aiUsage.remote` de son `module.json`, qui rend `null` pour un fournisseur
 * qu’il ne connaît pas). Lève une erreur lisible, sans secret.
 */
export async function readRemoteLimits(provider: AiProviderId): Promise<AiLimit[]> {
  if (!isAiProviderId(provider)) throw new Error("Fournisseur inconnu.");
  const entry = aiProvider(provider)!;
  if (!entry.remote) throw new Error(`${entry.label} ne publie pas son solde : rien à lire sans dépenser un appel.`);

  const declared = await modulesDeclaring("remote");
  const modules = await manager();
  for (const { name, fn } of declared) {
    const raw = await withTimeout(Promise.resolve(modules.callModuleFunction(name, fn, provider)), `Le module ${name}`);
    if (Array.isArray(raw)) return raw.map(cleanLimit).filter((limit): limit is AiLimit => limit !== null);
  }
  throw new Error(`Aucun module activé ne tient l’accès à ${entry.label}.`);
}

