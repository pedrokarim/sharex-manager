/**
 * LibreTranslate, auto-hébergé, par son API HTTP (`POST <adresse>/translate`).
 *
 * Vérifié le 06/10/2026 dans la documentation (docs.libretranslate.com) et
 * dans le code du serveur (`libretranslate/app.py`) : corps JSON `{ q, source,
 * target, format, api_key? }`, où `q` est un texte ou un tableau de textes ;
 * la réponse porte alors `translatedText` sous la même forme. `source: "auto"`
 * laisse le service détecter. Erreurs : `{ error }` avec 400, 403, 429 ou 500.
 */

import type { SourceLanguage } from "../../types";
import { EngineError, expectTranslations, postJson, type TranslationEngine } from "./engines";

/** Le service accepte nos codes tels quels : « en », « ja », « ko », « zh-Hans », « zh-Hant », « auto ». */
export function libreSourceLanguage(source: SourceLanguage): string {
  return source;
}

const TARGETS: Record<string, string> = {
  zh: "zh-Hans",
  "zh-hans": "zh-Hans",
  "zh-cn": "zh-Hans",
  "zh-hant": "zh-Hant",
  "zh-tw": "zh-Hant",
  "pt-br": "pt-BR",
};

/** Langue cible : le service ne connaît que la langue, pas ses variantes, sauf pour le chinois et le portugais. */
export function libreTargetLanguage(target: string): string {
  const code = target.trim().toLowerCase();
  return TARGETS[code] ?? code.split("-")[0];
}

/**
 * Adresse du service : `http` ou `https`, sans identifiants ni paramètres.
 * Rend l'adresse sans barre finale, ou `null` si elle est refusée. Une adresse
 * locale est normale ici : le service tourne à côté de l'application.
 */
export function normalizeLibreUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 300) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function failure(status: number, retryAfterMs?: number): EngineError {
  if (status === 429) return new EngineError("rate-limited", "LibreTranslate reçoit trop de requêtes.", retryAfterMs);
  if (status === 401 || status === 403) return new EngineError("unauthorized", "LibreTranslate refuse la clé d'API.");
  if (status >= 500) return new EngineError("unavailable", `LibreTranslate est en panne (HTTP ${status}).`);
  return new EngineError("invalid-request", `LibreTranslate refuse la demande (HTTP ${status}).`);
}

export function createLibreTranslateEngine(baseUrl: string, apiKey?: string): TranslationEngine {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/translate`;
  return {
    id: "libretranslate",
    async translate(texts, source, target, signal) {
      const payload = {
        // Un seul texte part comme une chaîne : toutes les versions du service le comprennent.
        q: texts.length === 1 ? texts[0] : texts,
        source: libreSourceLanguage(source),
        target: libreTargetLanguage(target),
        format: "text",
        ...(apiKey ? { api_key: apiKey } : {}),
      };
      const response = await postJson(endpoint, payload, {}, signal);
      if (response.status !== 200) throw failure(response.status, response.retryAfterMs);

      const translated = (response.body as { translatedText?: unknown } | null)?.translatedText;
      if (texts.length === 1 && typeof translated === "string") return [translated];
      if (texts.length > 1 && typeof translated === "string") {
        // Une version trop ancienne pour les lots : on ne la contourne pas par une requête par phrase.
        throw new EngineError("invalid-request", "Cette version de LibreTranslate ne traduit pas plusieurs textes par requête.");
      }
      return expectTranslations(translated, texts.length);
    },
  };
}
