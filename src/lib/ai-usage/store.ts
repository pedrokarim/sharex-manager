/**
 * Registre de consommation des IA, dans le volume `data/` déjà monté :
 *
 *   data/ai-usage/usage.json   agrégats par jour, fournisseur, module et usage
 *                              (environ treize mois), derniers appels (500) et
 *                              dernier appel de chaque fournisseur
 *
 * `recordAiUsage` ne fait que poser l'appel dans une file en mémoire : rien
 * n'est lu ni écrit sur le chemin de l'appelant. La file est versée sur le
 * disque peu après, d'un seul geste synchrone : relecture du fichier, ajout,
 * écriture dans un fichier temporaire puis renommage. Relire juste avant
 * d'écrire garde ce qu'un autre processus a pu ajouter entre-temps, et une
 * coupure ne laisse jamais un JSON tronqué.
 *
 * Répertoire en 0700, fichier en 0600, comme `data/connections/`.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { AI_UNITS, isAiProviderId, isAiUnit } from "./catalog";
import { AI_ERROR_KINDS, type AiProviderId, type AiUnit, type AiUsageEvent, type AiUsageInput } from "./types";

/** Jours gardés : treize mois et un peu de marge. */
export const RETENTION_DAYS = 400;
/** Derniers appels gardés en détail. */
export const RECENT_LIMIT = 500;
/** Délai avant de verser la file sur le disque. */
const FLUSH_DELAY_MS = 750;
/** Au-delà, la file est versée sans attendre le délai. */
const FLUSH_BATCH = 200;
/** Une file qui ne peut plus être écrite ne grossit pas sans fin. */
const MAX_PENDING = 2000;

export interface StoredAggregate {
  calls: number;
  failures: number;
  amount: Partial<Record<AiUnit, number>>;
  lastAt: number;
}

/** jour → fournisseur → module → usage → agrégat. */
export type StoredDays = Record<string, Partial<Record<AiProviderId, Record<string, Record<string, StoredAggregate>>>>>;

export interface StoredUsage {
  version: 1;
  days: StoredDays;
  /** Du plus récent au plus ancien. */
  recent: AiUsageEvent[];
  /** Dernier appel de chaque fournisseur, gardé même quand il est sorti de `recent`. */
  last: Partial<Record<AiProviderId, AiUsageEvent>>;
}

export const emptyUsage = (): StoredUsage => ({ version: 1, days: {}, recent: [], last: {} });

// ─── Emplacement ─────────────────────────────────────────────────

const holder = globalThis as typeof globalThis & {
  __sxmAiUsage?: { pending: AiUsageEvent[]; timer: ReturnType<typeof setTimeout> | null; exitHooked: boolean; root: string | null };
};
// Sur `globalThis` : une seule file par processus, même si ce fichier est chargé deux fois (route, action, module).
const state = (holder.__sxmAiUsage ??= { pending: [], timer: null, exitHooked: false, root: null });

/**
 * Déplace le registre ailleurs, pour les tests : ils ne doivent jamais écrire
 * dans le vrai `data/`. `null` rétablit l'emplacement normal.
 */
export function setAiUsageDataRoot(directory: string | null) {
  state.root = directory;
}

/** Lu à chaque appel, jamais figé au chargement du fichier. */
export function aiUsageDataRoot(): string {
  return state.root ?? path.join(process.cwd(), "data", "ai-usage");
}

// `aiUsageDataRoot()` peut être déplacé par les tests : le build ne peut pas borner ce chemin.
const usageFile = () => path.join(/* turbopackIgnore: true */ aiUsageDataRoot(), "usage.json");

/**
 * Sous Vitest, sans emplacement de test réglé, rien n'est gardé : un test qui
 * fait passer un vrai code d'appel (moteur simulé) n'écrit pas dans `data/`.
 */
const discarding = () => state.root === null && Boolean(process.env.VITEST);

// ─── Nettoyage des entrées ───────────────────────────────────────

/** Ce qui ressemble à une clé ou à un jeton est masqué avant d'être gardé. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(Bearer|DeepL-Auth-Key|Basic)\s+[^\s,;]+/gi, "$1 ***")
    .replace(/([?&](?:api_key|key|token|access_token|apikey)=)[^&\s]+/gi, "$1***")
    .replace(/\b(sk|pk|rk|xi|sess)[-_][A-Za-z0-9_-]{8,}/g, "***")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "***")
    .replace(/[A-Za-z0-9_\-+/=:]{32,}/g, "***");
}

const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

/** Texte sur plusieurs lignes (détail d'un échec) : les retours à la ligne restent, les autres caractères de contrôle partent. */
function cleanMultiline(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean ? clean.slice(0, max) : undefined;
}

const cleanAmount = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : 0);

/** Événement propre, ou `null` s'il n'est pas exploitable. */
export function normalizeEvent(input: AiUsageInput, now = Date.now()): AiUsageEvent | null {
  if (!input || typeof input !== "object" || !isAiProviderId(input.provider) || !isAiUnit(input.unit)) return null;
  const moduleName = cleanText(input.module, 40)?.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "core";
  const event: AiUsageEvent = {
    provider: input.provider,
    module: moduleName,
    feature: cleanText(input.feature, 80) ?? "Autre",
    unit: input.unit,
    amount: cleanAmount(input.amount),
    ok: input.ok === true,
    at: typeof input.at === "number" && Number.isFinite(input.at) && input.at > 0 ? input.at : now,
  };
  const model = cleanText(input.model, 80);
  if (model) event.model = model;
  if (!event.ok) {
    const error = cleanText(input.error, 400);
    if (error) event.error = redactSecrets(error).slice(0, 200);
    if (typeof input.errorKind === "string" && (AI_ERROR_KINDS as readonly string[]).includes(input.errorKind)) event.errorKind = input.errorKind;
    const detail = cleanMultiline(input.detail, 2000);
    if (detail) event.detail = redactSecrets(detail).slice(0, 1200);
  }
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs) && input.durationMs >= 0) event.durationMs = Math.round(input.durationMs);
  if (typeof input.attempts === "number" && Number.isInteger(input.attempts) && input.attempts > 0) event.attempts = Math.min(input.attempts, 20);
  if (input.extra && typeof input.extra === "object") {
    const extra: Partial<Record<AiUnit, number>> = {};
    for (const unit of AI_UNITS) {
      const value = cleanAmount((input.extra as Record<string, unknown>)[unit]);
      if (value > 0 && unit !== event.unit) extra[unit] = value;
    }
    if (Object.keys(extra).length > 0) event.extra = extra;
  }
  return event;
}

// ─── Jours ───────────────────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, "0");

/** AAAA-MM-JJ, fuseau du serveur. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** AAAA-MM, fuseau du serveur. */
export function monthKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Les `count` derniers jours, du plus ancien à aujourd'hui. */
export function lastDays(now: number, count: number): string[] {
  const today = new Date(now);
  const days: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    // Midi : un changement d'heure ne fait ni sauter ni doubler un jour.
    days.push(dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, 12).getTime()));
  }
  return days;
}

// ─── Fichier ─────────────────────────────────────────────────────

function isAggregate(value: unknown): value is StoredAggregate {
  const entry = value as StoredAggregate | null;
  return Boolean(entry && typeof entry === "object" && typeof entry.calls === "number" && typeof entry.failures === "number" && entry.amount && typeof entry.amount === "object");
}

export function readStoredUsage(): StoredUsage {
  try {
    const parsed = JSON.parse(fs.readFileSync(usageFile(), "utf-8")) as Partial<StoredUsage> | null;
    if (!parsed || parsed.version !== 1) return emptyUsage();
    return {
      version: 1,
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter((event) => event && isAiProviderId(event.provider)) : [],
      last: parsed.last && typeof parsed.last === "object" ? parsed.last : {},
    };
  } catch {
    return emptyUsage();
  }
}

function writeStoredUsage(value: StoredUsage) {
  const root = aiUsageDataRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(root, 0o700);
  } catch {
    // Systèmes de fichiers sans droits POSIX (Windows) : sans effet.
  }
  const target = usageFile();
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    // Compact : le fichier est relu et réécrit à chaque versement.
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // Voir plus haut.
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/** Ajoute des événements à un registre (fonction pure sur `usage`, qu'elle modifie et rend). */
export function applyEvents(usage: StoredUsage, events: AiUsageEvent[], now = Date.now()): StoredUsage {
  for (const event of events) {
    const day = (usage.days[dayKey(event.at)] ??= {});
    const byModule = (day[event.provider] ??= {});
    const byFeature = (byModule[event.module] ??= {});
    const existing = byFeature[event.feature];
    const aggregate: StoredAggregate = isAggregate(existing) ? existing : { calls: 0, failures: 0, amount: {}, lastAt: 0 };
    aggregate.calls += 1;
    if (!event.ok) aggregate.failures += 1;
    for (const [unit, value] of [[event.unit, event.amount] as const, ...(Object.entries(event.extra ?? {}) as [AiUnit, number][])]) {
      if (value > 0) aggregate.amount[unit] = Math.round(((aggregate.amount[unit] ?? 0) + value) * 1000) / 1000;
    }
    aggregate.lastAt = Math.max(aggregate.lastAt, event.at);
    byFeature[event.feature] = aggregate;

    const last = usage.last[event.provider];
    if (!last || last.at <= event.at) usage.last[event.provider] = event;
  }

  usage.recent = [...events, ...usage.recent].sort((a, b) => b.at - a.at).slice(0, RECENT_LIMIT);

  const oldest = lastDays(now, RETENTION_DAYS)[0];
  for (const day of Object.keys(usage.days)) {
    if (day < oldest) delete usage.days[day];
  }
  return usage;
}

// ─── File ────────────────────────────────────────────────────────

/** Verse tout de suite la file sur le disque. Ne lève jamais. */
export function flushAiUsage() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.pending.length === 0) return;
  const events = state.pending.splice(0, state.pending.length);
  if (discarding()) return;
  try {
    writeStoredUsage(applyEvents(readStoredUsage(), events));
  } catch (error) {
    // Disque plein, droits refusés… : on retentera au prochain appel, sans grossir sans fin.
    state.pending.unshift(...events.slice(-MAX_PENDING));
    if (state.pending.length > MAX_PENDING) state.pending.splice(0, state.pending.length - MAX_PENDING);
    console.error("Registre de consommation des IA : écriture impossible.", error instanceof Error ? error.message : error);
  }
}

function schedule() {
  if (!state.exitHooked && typeof process.once === "function") {
    state.exitHooked = true;
    // Les écritures sont synchrones : elles tiennent dans l'événement `exit`.
    process.once("exit", () => flushAiUsage());
  }
  if (state.pending.length >= FLUSH_BATCH) {
    setImmediate(() => flushAiUsage());
    return;
  }
  if (state.timer) return;
  state.timer = setTimeout(() => flushAiUsage(), FLUSH_DELAY_MS);
  // Le délai ne retient pas un processus qui s'arrête : `exit` verse la file.
  (state.timer as { unref?: () => void }).unref?.();
}

/**
 * Note un appel à un fournisseur, réussi ou non. Ne lève jamais, n'attend
 * rien et ne lit rien : l'appel est mis en file et versé sur le disque peu
 * après. Une entrée inexploitable (fournisseur ou unité inconnus) est ignorée.
 *
 * `amount` est ce qui a été consommé dans `unit` : 1 pour un appel compté en
 * `calls`, même en échec ; pour des caractères ou des images, ce que le
 * service a rendu, 0 quand il a refusé. Un message d'erreur est abrégé et ce
 * qui ressemble à une clé y est masqué.
 */
export function recordAiUsage(input: AiUsageInput): void {
  try {
    const event = normalizeEvent(input);
    if (!event || discarding()) return;
    state.pending.push(event);
    if (state.pending.length > MAX_PENDING) state.pending.splice(0, state.pending.length - MAX_PENDING);
    schedule();
  } catch (error) {
    console.error("Registre de consommation des IA :", error instanceof Error ? error.message : error);
  }
}

/** Message d'erreur sans secret, à passer dans `error`. */
export function usageError(error: unknown): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "Annulé ou délai dépassé.";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return redactSecrets(message.replace(/\s+/g, " ").trim()).slice(0, 200) || "Erreur inconnue.";
}

/** Caractères comme les services les comptent : par point de code. */
export function countCharacters(texts: string | string[]): number {
  let total = 0;
  for (const text of Array.isArray(texts) ? texts : [texts]) total += typeof text === "string" ? Array.from(text).length : 0;
  return total;
}
