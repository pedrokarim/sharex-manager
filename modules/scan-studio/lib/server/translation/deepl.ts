/**
 * DeepL, par son API HTTP (`POST /v2/translate`).
 *
 * Vérifié dans la documentation officielle le 06/10/2026
 * (developers.deepl.com) : corps JSON `{ text: string[], target_lang,
 * source_lang? }`, en-tête `Authorization: DeepL-Auth-Key <clé>`, réponse
 * `{ translations: [{ text }] }`, requête de 128 Kio au plus. Une clé qui finit
 * par `:fx` appartient à l'offre gratuite et parle à `api-free.deepl.com`.
 */

import type { SourceLanguage } from "../../types";
import { EngineError, expectTranslations, postJson, type TranslationEngine } from "./engines";

const FREE_HOST = "https://api-free.deepl.com";
const PRO_HOST = "https://api.deepl.com";

export function deeplHost(key: string): string {
  return key.trim().endsWith(":fx") ? FREE_HOST : PRO_HOST;
}

/** Langue source : DeepL ne distingue pas les deux écritures du chinois à la lecture. `undefined` : il détecte. */
export function deeplSourceLanguage(source: SourceLanguage): string | undefined {
  switch (source) {
    case "en":
      return "EN";
    case "ja":
      return "JA";
    case "ko":
      return "KO";
    case "zh-Hans":
    case "zh-Hant":
      return "ZH";
    default:
      return undefined;
  }
}

/** Cibles qui demandent une variante précise, ou dont le code diffère du nôtre. */
const TARGETS: Record<string, string> = {
  en: "EN-US",
  "en-us": "EN-US",
  "en-gb": "EN-GB",
  pt: "PT-PT",
  "pt-pt": "PT-PT",
  "pt-br": "PT-BR",
  zh: "ZH-HANS",
  "zh-hans": "ZH-HANS",
  "zh-cn": "ZH-HANS",
  "zh-hant": "ZH-HANT",
  "zh-tw": "ZH-HANT",
  "es-419": "ES-419",
};

/** Langue cible : « fr » devient « FR », « fr-CA » aussi, faute de variante connue. */
export function deeplTargetLanguage(target: string): string {
  const code = target.trim().toLowerCase();
  return TARGETS[code] ?? code.split("-")[0].toUpperCase();
}

function failure(status: number, retryAfterMs?: number): EngineError {
  // 529 : « trop de requêtes » aussi, d'après la documentation.
  if (status === 429 || status === 529) return new EngineError("rate-limited", "DeepL reçoit trop de requêtes.", retryAfterMs);
  if (status === 456) return new EngineError("quota-exceeded", "Le quota de caractères DeepL est épuisé.");
  if (status === 401 || status === 403) return new EngineError("unauthorized", "DeepL refuse la clé d'API.");
  if (status >= 500) return new EngineError("unavailable", `DeepL est en panne (HTTP ${status}).`);
  return new EngineError("invalid-request", `DeepL refuse la demande (HTTP ${status}).`);
}

export function createDeeplEngine(key: string): TranslationEngine {
  const endpoint = `${deeplHost(key)}/v2/translate`;
  return {
    id: "deepl",
    async translate(texts, source, target, signal) {
      const sourceLanguage = deeplSourceLanguage(source);
      const payload = {
        text: texts,
        target_lang: deeplTargetLanguage(target),
        ...(sourceLanguage ? { source_lang: sourceLanguage } : {}),
      };
      const response = await postJson(endpoint, payload, { Authorization: `DeepL-Auth-Key ${key.trim()}` }, signal);
      if (response.status !== 200) throw failure(response.status, response.retryAfterMs);

      const translations = (response.body as { translations?: unknown } | null)?.translations;
      const list = Array.isArray(translations) ? translations.map((entry) => (entry as { text?: unknown } | null)?.text) : null;
      return expectTranslations(list, texts.length);
    },
  };
}
