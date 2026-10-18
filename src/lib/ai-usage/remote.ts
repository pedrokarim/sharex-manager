/**
 * Soldes lus chez les services, sans rien dépenser. Chaque lecteur reçoit la
 * clé du module qui la tient : le cœur n'en garde aucune, et aucune ne figure
 * dans un message d'erreur.
 *
 * Endpoints vérifiés dans la documentation officielle le 18/10/2026 :
 *
 * - ElevenLabs : `GET https://api.elevenlabs.io/v1/user/subscription`, en-tête
 *   `xi-api-key` ; `character_count`, `character_limit`,
 *   `next_character_count_reset_unix` (secondes), `tier`
 *   (elevenlabs.io/docs/api-reference/user/subscription/get) ;
 * - DeepL : `GET /v2/usage`, en-tête `Authorization: DeepL-Auth-Key` ;
 *   `character_count`, `character_limit` (1 000 000 000 000 quand aucun
 *   plafond n'est réglé), `end_time` pour l'offre Pro seulement
 *   (developers.deepl.com/api-reference/usage-and-quota). La requête est celle
 *   de Scan Studio (`deepl.ts`), seule la conversion est ici ;
 * - trace.moe : `GET https://api.trace.moe/me`, en-tête `x-trace-key`
 *   facultatif ; `quota` et `quotaUsed` sont le quota quotidien et ce qui en
 *   a été consommé sur les dernières 24 heures (`swagger.yaml` du dépôt
 *   soruly/trace.moe-api). `id` porte l'adresse IP ou l'adresse électronique
 *   du compte : il n'est jamais repris ;
 * - SerpApi : `GET https://serpapi.com/account.json`, gratuit et hors quota ;
 *   la clé ne s'y passe qu'en paramètre `api_key`, aucun en-tête n'est
 *   documenté (serpapi.com/account-api) ; `searches_per_month`,
 *   `this_month_usage`, `plan_renewal_date`.
 */

import type { AiLimit } from "./types";

type Fetch = typeof fetch;

const TIMEOUT_MS = 15_000;
/** Valeur que DeepL rend quand aucun plafond n'est réglé. */
const DEEPL_UNLIMITED = 1_000_000_000_000;

const count = (value: unknown): number | null => {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};

/** Requête de lecture ; l'erreur ne cite ni l'adresse ni la clé. */
async function readJson(label: string, url: string, headers: Record<string, string>, fetchImpl: Fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Une redirection emmènerait la clé ailleurs que chez le service.
      redirect: "error",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new Error(timedOut ? `${label} n'a pas répondu à temps.` : `${label} est injoignable.`);
  }
  if (response.status === 401 || response.status === 403) throw new Error(`${label} refuse la clé enregistrée.`);
  if (response.status === 429) throw new Error(`${label} demande d'attendre avant une nouvelle lecture.`);
  if (!response.ok) throw new Error(`${label} ne répond pas correctement (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error(`Réponse illisible de ${label}.`);
  }
}

/** Premier instant du mois suivant, en temps universel. */
function nextUtcMonth(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

// ─── ElevenLabs ──────────────────────────────────────────────────

export async function readElevenLabsLimits(apiKey: string, fetchImpl: Fetch = fetch): Promise<AiLimit[]> {
  const body = (await readJson("ElevenLabs", "https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": apiKey.trim() }, fetchImpl)) as Record<string, unknown> | null;
  const used = count(body?.character_count);
  const limit = count(body?.character_limit);
  if (used === null || limit === null) throw new Error("Réponse inattendue d'ElevenLabs.");
  const reset = count(body?.next_character_count_reset_unix);
  const tier = typeof body?.tier === "string" ? body.tier.replace(/[^\w -]/g, "").slice(0, 40) : "";
  return [
    {
      id: "elevenlabs-characters",
      label: tier ? `Caractères de l'offre ${tier}` : "Caractères de l'offre",
      unit: "characters",
      period: "month",
      used,
      limit,
      ...(reset ? { resetsAt: reset * 1000 } : {}),
      source: "remote",
    },
  ];
}

// ─── DeepL ───────────────────────────────────────────────────────

/** Ce que `GET /v2/usage` a rendu (lu par Scan Studio), en limite. Aucun plafond : rien. */
export function deeplUsageLimits(usage: { used: number; limit: number }, now = Date.now()): AiLimit[] {
  const used = count(usage?.used);
  const limit = count(usage?.limit);
  if (used === null || limit === null || limit <= 0 || limit >= DEEPL_UNLIMITED) return [];
  return [
    {
      id: "deepl-characters",
      label: "Caractères de la période de facturation",
      unit: "characters",
      period: "month",
      used,
      limit,
      // L'offre gratuite repart chaque mois ; l'offre Pro suit sa date de facturation, que la réponse ne donne pas toujours.
      resetsAt: nextUtcMonth(now),
      source: "remote",
      note: "Solde lu chez DeepL.",
    },
  ];
}

// ─── trace.moe ───────────────────────────────────────────────────

export async function readTraceMoeLimits(apiKey: string | undefined, fetchImpl: Fetch = fetch): Promise<AiLimit[]> {
  const headers: Record<string, string> = apiKey?.trim() ? { "x-trace-key": apiKey.trim() } : {};
  const body = (await readJson("trace.moe", "https://api.trace.moe/me", headers, fetchImpl)) as Record<string, unknown> | null;
  const quota = count(body?.quota);
  // `quotaUsed` arrive parfois en chaîne.
  const used = count(body?.quotaUsed);
  if (quota === null || used === null) throw new Error("Réponse inattendue de trace.moe.");
  return [
    {
      id: "tracemoe-searches",
      label: apiKey?.trim() ? "Recherches du compte" : "Recherches sans clé (adresse du serveur)",
      unit: "calls",
      period: "day",
      used,
      limit: quota,
      source: "remote",
      note: "Fenêtre glissante de 24 heures, d'après trace.moe.",
    },
  ];
}

// ─── SerpApi ─────────────────────────────────────────────────────

export async function readSerpApiLimits(apiKey: string, fetchImpl: Fetch = fetch): Promise<AiLimit[]> {
  // Seule forme acceptée par l'API ; l'adresse ne sort jamais d'ici, ni dans un journal ni dans une erreur.
  const url = `https://serpapi.com/account.json?${new URLSearchParams({ api_key: apiKey.trim() })}`;
  const body = (await readJson("SerpApi", url, {}, fetchImpl)) as Record<string, unknown> | null;
  if (body && typeof body.error === "string") throw new Error("SerpApi refuse la clé enregistrée.");
  const limit = count(body?.searches_per_month);
  const used = count(body?.this_month_usage);
  if (limit === null || used === null) throw new Error("Réponse inattendue de SerpApi.");
  const renewal = typeof body?.plan_renewal_date === "string" ? Date.parse(body.plan_renewal_date) : NaN;
  const credits = count(body?.extra_credits);
  const plan = typeof body?.plan_name === "string" ? body.plan_name.replace(/[^\w -]/g, "").slice(0, 40) : "";
  const limits: AiLimit[] = [];
  if (limit > 0) {
    limits.push({
      id: "serpapi-searches",
      label: plan ? `Recherches du mois (${plan})` : "Recherches du mois",
      unit: "calls",
      period: "month",
      used,
      limit,
      ...(Number.isFinite(renewal) ? { resetsAt: renewal } : {}),
      source: "remote",
      ...(credits ? { note: `${credits.toLocaleString("fr-FR")} crédits supplémentaires en réserve.` } : {}),
    });
  } else if (credits !== null) {
    limits.push({ id: "serpapi-credits", label: "Crédits restants", unit: "calls", period: "plan", used: 0, limit: credits, source: "remote" });
  }
  return limits;
}
