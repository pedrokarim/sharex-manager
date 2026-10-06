/**
 * MyMemory (Translated), par son API HTTP publique (`GET /get`).
 *
 * Vérifié le 06/10/2026 dans sa documentation (mymemory.translated.net/doc) :
 * `q` porte une phrase de 500 octets au plus, `langpair` la paire de langues
 * (« en|fr »), `de` une adresse de contact facultative. Sans clé, le service
 * accorde 5 000 caractères par jour ; 50 000 avec une adresse de contact.
 *
 * C'est le moteur qui marche sans rien régler. Il ne prend qu'une phrase par
 * requête : le routeur les envoie donc une à une, à la suite, avec son
 * délai entre deux, et s'arrête dès que le quota du jour est atteint.
 */

import type { SourceLanguage } from "../../types";
import { EngineError, getJson, type TranslationEngine } from "./engines";

export const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";
/** Taille d'une phrase acceptée par le service, en octets UTF-8. */
export const MYMEMORY_MAX_BYTES = 500;
/** Quota du jour annoncé par le service, en caractères : sans rien fournir, puis avec une adresse de contact. */
export const MYMEMORY_DAILY_LIMIT = 5_000;
export const MYMEMORY_DAILY_LIMIT_WITH_EMAIL = 50_000;

/** Langue source : le service veut une langue précise, il ne détecte pas. `undefined` pour « auto ». */
export function myMemorySourceLanguage(source: SourceLanguage): string | undefined {
  switch (source) {
    case "en":
      return "en";
    case "ja":
      return "ja";
    case "ko":
      return "ko";
    case "zh-Hans":
      return "zh-CN";
    case "zh-Hant":
      return "zh-TW";
    default:
      return undefined;
  }
}

const TARGETS: Record<string, string> = {
  zh: "zh-CN",
  "zh-hans": "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-tw": "zh-TW",
  "pt-br": "pt-BR",
  "pt-pt": "pt-PT",
  "en-gb": "en-GB",
  "en-us": "en-US",
};

/** Langue cible : « fr » tel quel, une variante connue du service gardée, les autres ramenées à la langue. */
export function myMemoryTargetLanguage(target: string): string {
  const code = target.trim().toLowerCase();
  return TARGETS[code] ?? code.split("-")[0];
}

/** Adresse de contact acceptable : une adresse simple, sans rien d'autre. */
export function normalizeContactEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(trimmed) ? trimmed : null;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Le service écrit ses avertissements à la place de la traduction : ce n'est jamais un texte à poser dans une bulle. */
const WARNING = /^(?:MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID |NO QUERY SPECIFIED|PLEASE SELECT TWO DISTINCT LANGUAGES)/i;
const QUOTA = /USED ALL AVAILABLE FREE TRANSLATIONS|QUOTA|LIMIT EXCEEDED/i;

interface MemoryMatch {
  translation?: unknown;
  match?: unknown;
  "created-by"?: unknown;
}

/** Lettres et chiffres seulement, en minuscules : pour comparer deux phrases sans leur ponctuation. */
const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Le service puise dans une mémoire publique, remplie par n'importe qui : son
 * meilleur résultat peut être la traduction d'une *autre* phrase, ou la phrase
 * d'origine recopiée. On ne garde donc que ce qui traduit vraiment la phrase
 * demandée : d'abord sa traduction automatique, sinon une correspondance
 * exacte de la mémoire. `null` : rien de sûr.
 */
export function pickMyMemoryTranslation(source: string, best: string, bestMatch: number | undefined, matches: unknown): string | null {
  const usable = (text: unknown): text is string => typeof text === "string" && text.trim() !== "" && !WARNING.test(text.trim()) && !isUntranslated(source, text);
  const list = Array.isArray(matches) ? (matches.filter((entry) => entry && typeof entry === "object") as MemoryMatch[]) : [];

  const machine = list.find((entry) => entry["created-by"] === "MT!" && usable(entry.translation));
  if (machine) return machine.translation as string;
  const exact = list.find((entry) => Number(entry.match) >= 0.99 && usable(entry.translation));
  if (exact) return exact.translation as string;
  // Sans liste de correspondances, le résultat de tête ne vaut que s'il est donné pour exact.
  if (list.length === 0 && usable(best) && (bestMatch === undefined || bestMatch >= 0.99)) return best;
  return null;
}

/**
 * La « traduction » est la phrase d'origine recopiée. Un mot ou deux peuvent
 * légitimement rester tels quels (un nom propre) : on ne tranche que pour une
 * vraie phrase.
 */
export function isUntranslated(source: string, translated: string): boolean {
  const original = bare(source);
  return original.split(" ").length >= 3 && original === bare(translated);
}

function failure(status: number, detail: string, retryAfterMs?: number): EngineError {
  if (status === 429 || QUOTA.test(detail)) return new EngineError("quota-exceeded", "Le quota du jour de MyMemory est épuisé.");
  if (status === 401 || status === 403) return new EngineError("unauthorized", "MyMemory refuse la demande.");
  if (status >= 500) return new EngineError("unavailable", `MyMemory est en panne (HTTP ${status}).`, retryAfterMs);
  return new EngineError("invalid-request", `MyMemory refuse la demande (HTTP ${status}).`);
}

export function createMyMemoryEngine(contactEmail?: string): TranslationEngine {
  return {
    id: "mymemory",
    // Le service ne prend qu'une phrase à la fois.
    maxTextsPerRequest: 1,
    async translate(texts, source, target, signal) {
      if (texts.length !== 1) throw new EngineError("invalid-request", "MyMemory ne traduit qu’une phrase par requête.");
      const text = texts[0];
      const from = myMemorySourceLanguage(source);
      if (!from) throw new EngineError("invalid-request", "MyMemory a besoin de la langue d’origine du chapitre : réglez-la dans le chapitre.");
      if (byteLength(text) > MYMEMORY_MAX_BYTES) throw new EngineError("invalid-request", "Cette phrase est trop longue pour MyMemory (500 octets au plus).");

      const url = new URL(MYMEMORY_ENDPOINT);
      url.searchParams.set("q", text);
      url.searchParams.set("langpair", `${from}|${myMemoryTargetLanguage(target)}`);
      if (contactEmail) url.searchParams.set("de", contactEmail);

      const response = await getJson(url.toString(), {}, signal);
      const body = response.body as {
        responseStatus?: unknown;
        responseDetails?: unknown;
        quotaFinished?: unknown;
        responseData?: { translatedText?: unknown; match?: unknown } | null;
        matches?: unknown;
      } | null;
      const details = typeof body?.responseDetails === "string" ? body.responseDetails : "";
      const translated = typeof body?.responseData?.translatedText === "string" ? body.responseData.translatedText : "";
      // Le service répond souvent 200 et range le vrai statut dans le corps.
      const inner = typeof body?.responseStatus === "number" ? body.responseStatus : Number(body?.responseStatus);
      const status = response.status !== 200 ? response.status : Number.isFinite(inner) && inner > 0 ? inner : 200;

      if (body?.quotaFinished === true || QUOTA.test(translated) || QUOTA.test(details)) throw failure(429, "QUOTA");
      if (status !== 200) throw failure(status, `${details} ${translated}`, response.retryAfterMs);
      if (!body || translated.trim() === "" || WARNING.test(translated.trim())) throw new EngineError("unavailable", "Réponse inattendue du service.");
      const bestMatch = typeof body.responseData?.match === "number" ? body.responseData.match : undefined;
      const chosen = pickMyMemoryTranslation(text, translated, bestMatch, body.matches);
      // Rien de sûr : mieux vaut une zone sans traduction qu'une phrase d'un autre texte posée dans la bulle.
      if (chosen === null) throw new EngineError("invalid-request", "MyMemory n’a pas de traduction sûre pour cette phrase.");
      return [chosen];
    },
  };
}
