/**
 * Catalogue des fournisseurs suivis par le registre de consommation. Il ne
 * dit rien des clés ni des modules : ce sont les modules qui rapportent ce
 * qu'ils utilisent (`aiUsage` dans leur `module.json`).
 */

import type { AiProviderId, AiProviderOverview, AiUnit } from "./types";

export interface AiProviderEntry {
  id: AiProviderId;
  label: string;
  brand?: AiProviderOverview["brand"];
  kind: AiProviderOverview["kind"];
  /** Le service publie son solde, lisible sans rien dépenser (`readRemoteLimits`). */
  remote: boolean;
}

export const AI_PROVIDERS: AiProviderEntry[] = [
  { id: "openai", label: "OpenAI", brand: "openai", kind: "api", remote: false },
  { id: "google", label: "Google AI", brand: "gemini", kind: "api", remote: false },
  { id: "stability", label: "Stability AI", brand: "stability", kind: "api", remote: false },
  { id: "codex", label: "Codex CLI", brand: "codex", kind: "cli", remote: false },
  { id: "gemini-cli", label: "Gemini CLI", brand: "gemini", kind: "cli", remote: false },
  { id: "claude-cli", label: "Claude Code", brand: "claude", kind: "cli", remote: false },
  { id: "elevenlabs", label: "ElevenLabs", brand: "elevenlabs", kind: "api", remote: true },
  { id: "azure-speech", label: "Microsoft Azure Speech", brand: "microsoft", kind: "api", remote: false },
  { id: "google-tts", label: "Google Cloud Text-to-Speech", brand: "googlecloud", kind: "api", remote: false },
  { id: "edge-tts", label: "Microsoft Edge (lecture à voix haute)", brand: "microsoft", kind: "free", remote: false },
  { id: "deepl", label: "DeepL", brand: "deepl", kind: "api", remote: true },
  { id: "libretranslate", label: "LibreTranslate", brand: "libretranslate", kind: "self-hosted", remote: false },
  { id: "mymemory", label: "MyMemory", brand: "mymemory", kind: "free", remote: false },
  { id: "serpapi", label: "SerpApi", brand: "serpapi", kind: "api", remote: true },
  // SauceNAO ne publie ses compteurs que dans la réponse d'une recherche : rien à lire sans en dépenser une.
  { id: "saucenao", label: "SauceNAO", brand: "saucenao", kind: "api", remote: false },
  { id: "tracemoe", label: "trace.moe", brand: "tracemoe", kind: "free", remote: true },
  { id: "openverse", label: "Openverse", brand: "openverse", kind: "free", remote: false },
  // Pexels publie son solde dans les en-têtes de chaque réponse : relevé au passage, sans appel de plus.
  { id: "pexels", label: "Pexels", brand: "pexels", kind: "api", remote: false },
  // Pixabay : 100 requêtes par minute et par clé, solde relevé dans les en-têtes ; recherches gardées 24 heures.
  { id: "pixabay", label: "Pixabay", brand: "pixabay", kind: "api", remote: false },
  // Wikimedia Commons : sans clé ; Clip Studio s'impose son propre rythme.
  { id: "wikimedia", label: "Wikimedia Commons", brand: "wikimediacommons", kind: "free", remote: false },
];

const BY_ID = new Map(AI_PROVIDERS.map((entry) => [entry.id, entry]));

export const AI_UNITS: AiUnit[] = ["calls", "characters", "images", "tokens", "seconds"];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && BY_ID.has(value as AiProviderId);
}

export function isAiUnit(value: unknown): value is AiUnit {
  return typeof value === "string" && (AI_UNITS as string[]).includes(value);
}

export function aiProvider(id: AiProviderId): AiProviderEntry | undefined {
  return BY_ID.get(id);
}
