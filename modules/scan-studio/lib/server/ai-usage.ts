/**
 * Ce que Scan Studio rapporte au registre de consommation des IA du cœur
 * (écran `/admin/ai`) : l’accès aux moteurs de traduction, leurs compteurs
 * et plafonds, et le plafond mensuel des appels d’IA. Aucune clé n’en sort.
 *
 * Les compteurs restent ceux du module, en temps universel : ils décident
 * des refus, le registre ne fait que les montrer.
 */

import type { AiLimit, AiModuleReport } from "@/lib/ai-usage/types";
import { deeplUsageLimits } from "@/lib/ai-usage/remote";
import type { TranslationEngineId } from "../types";
import { readMonthlyCalls, readMonthlyLimit } from "./ai/guard";
import { MYMEMORY_DAILY_LIMIT, MYMEMORY_DAILY_LIMIT_WITH_EMAIL } from "./translation/mymemory";
import { readCredentials, readSettings } from "./translation/settings";
import { nextDay, readUsage } from "./translation/usage";

const SETTINGS_HREF = "/m/scan-studio/engines";

/** Premier instant du mois suivant, en temps universel. */
function nextMonth(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** Le service a refusé pour quota épuisé : plus rien ne part avant cet instant. */
const blocked = (until: number | undefined, now: number) => (until !== undefined && until > now ? { blockedUntil: until } : {});

function translationLimits(id: TranslationEngineId, now: number, dailyLimit?: number): AiLimit[] {
  const usage = readUsage(id, now);
  const monthly = readSettings().monthlyLimits[id];
  const limits: AiLimit[] = [];
  if (dailyLimit) {
    limits.push({
      id: `scan-studio-${id}-day`,
      label: "Quota du jour annoncé par le service",
      unit: "characters",
      period: "day",
      used: usage.day,
      limit: dailyLimit,
      resetsAt: nextDay(now),
      source: "local",
      ...blocked(usage.quotaUntil, now),
      note: "Compté par Scan Studio, en temps universel.",
    });
  }
  if (monthly > 0) {
    limits.push({
      id: `scan-studio-${id}-month`,
      label: "Plafond mensuel réglé dans Scan Studio",
      unit: "characters",
      period: "month",
      used: usage.month,
      limit: monthly,
      resetsAt: nextMonth(now),
      source: "local",
      ...(dailyLimit ? {} : blocked(usage.quotaUntil, now)),
      note: "Compté par Scan Studio, en temps universel.",
    });
  }
  return limits;
}

export function scanStudioAiReport(now = Date.now()): AiModuleReport {
  const credentials = readCredentials();
  const fromEnv = (name: string) => Boolean(process.env[name]?.trim());

  // Plafond des appels d’IA : commun à tous les modèles de langage et moteurs d’image du module.
  const aiCalls: AiLimit = {
    id: "scan-studio-ai-month",
    label: "Plafond mensuel des appels d’IA de Scan Studio",
    unit: "calls",
    period: "month",
    used: readMonthlyCalls(now),
    limit: readMonthlyLimit(),
    resetsAt: nextMonth(now),
    source: "local",
    note: "Commun à tous les fournisseurs d’IA du module.",
  };
  const ai = { limits: [aiCalls], settingsHref: SETTINGS_HREF };

  return {
    deepl: {
      access: credentials.deeplKey ? (fromEnv("DEEPL_API_KEY") ? "env" : "key") : "none",
      limits: translationLimits("deepl", now),
      remoteReadable: Boolean(credentials.deeplKey),
      settingsHref: SETTINGS_HREF,
    },
    libretranslate: {
      access: credentials.libreTranslateUrl ? (fromEnv("LIBRETRANSLATE_URL") ? "env" : "key") : "none",
      limits: translationLimits("libretranslate", now),
      settingsHref: SETTINGS_HREF,
    },
    mymemory: {
      access: "open",
      limits: translationLimits("mymemory", now, credentials.myMemoryEmail ? MYMEMORY_DAILY_LIMIT_WITH_EMAIL : MYMEMORY_DAILY_LIMIT),
      settingsHref: SETTINGS_HREF,
    },
    // Les clés et Codex sont ceux d’AI Image Gen : Scan Studio n’en dit que son plafond.
    openai: ai,
    google: ai,
    codex: ai,
  };
}

/** Solde DeepL lu chez le service, par la requête de lecture du module. */
export async function readDeeplBalance(read: () => Promise<{ ok: boolean; message: string; used?: number; limit?: number }>): Promise<AiLimit[]> {
  const usage = await read();
  if (!usage.ok || typeof usage.used !== "number") throw new Error(usage.message);
  return deeplUsageLimits({ used: usage.used, limit: usage.limit ?? 0 });
}
